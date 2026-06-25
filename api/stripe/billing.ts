// Vercel serverless function: /api/stripe/billing
// Consolidated billing endpoint — dispatches by ?action= query param
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isSubscriptionLockDue } from '../../lib/subscriptionAccess.js';
import { calculateNextSubscriptionPeriod } from '../../lib/subscriptionPeriod.js';
import { upsertSubscriptionPayment } from '../../lib/subscriptionPayments.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const CREDIT_TRANSACTION_TYPES = new Set(['sale', 'deposit']);
const DEBIT_TRANSACTION_TYPES = new Set(['cashout', 'billing']);
const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  basic: { monthly: 30, annual: 25 },
  pro: { monthly: 50, annual: 42 },
  pro_plus: { monthly: 70, annual: 60 },
};
const PLAN_NAMES: Record<string, string> = { basic: 'Basic', pro: 'Pro', pro_plus: 'Pro Plus' };
const PLAN_ORDER = ['basic', 'pro', 'pro_plus'];
const ACCESS_UNLOCK_PATCH = {
  access_locked: false,
  access_lock_at: null,
  access_locked_at: null,
};
const DUITNOW_SNAPSHOT_COLUMNS = [
  'provisional_access_until',
  'original_status',
  'original_plan_id',
  'original_billing_interval',
  'original_current_period_start',
  'original_current_period_end',
  'original_trial_end',
];

type StripeRepairResult = {
  checked: boolean;
  updated: boolean;
  reason?: string;
  billingRecordsCreated: number;
  subscriptionPaymentsSynced: number;
  newPeriodEnd?: string | null;
};

function isMissingColumnError(error: any, columns: string[] = []): boolean {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const isMissingColumn = code === '42703'
    || code === 'PGRST204'
    || message.includes('column') && (message.includes('does not exist') || message.includes('schema cache'));

  return isMissingColumn && (
    columns.length === 0
    || columns.some(column => message.includes(column.toLowerCase()))
  );
}

function isDuplicateKeyError(error: any): boolean {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

async function getOrCreateStripeCustomerId(restaurantId: string, inputCustomerId?: string): Promise<string> {
  if (inputCustomerId) return inputCustomerId;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('restaurant_id', restaurantId)
    .single();

  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .single();

  const { data: user } = await supabase
    .from('users')
    .select('email, username')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'VENDOR')
    .single();

  const customer = await stripe.customers.create({
    name: restaurant?.name || 'QuickServe Customer',
    email: user?.email || undefined,
    metadata: { restaurant_id: restaurantId },
  });

  await supabase
    .from('subscriptions')
    .update({ stripe_customer_id: customer.id })
    .eq('restaurant_id', restaurantId);

  return customer.id;
}

async function getWalletBalance(restaurantId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount, type')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  if (error || !data) return 0;

  return data.reduce((total, transaction) => {
    const amount = Number(transaction.amount) || 0;
    if (CREDIT_TRANSACTION_TYPES.has(transaction.type)) return total + amount;
    if (DEBIT_TRANSACTION_TYPES.has(transaction.type)) return total - amount;
    return total;
  }, 0);
}

async function recordStripeBillingIncome(input: {
  restaurantId: string;
  planId?: string | null;
  amount: number;
  description: string;
  stripeObjectId: string;
}): Promise<{ id: string | null; created: boolean }> {
  if (!input.amount || input.amount <= 0 || !input.stripeObjectId) return { id: null, created: false };

  const referenceCode = `STRIPE-${input.stripeObjectId}`;
  const { data: existingRecord, error: lookupError } = await supabase
    .from('billing_records')
    .select('id')
    .eq('reference_code', referenceCode)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || 'Failed to check existing Stripe billing record.');
  }
  if (existingRecord) return { id: existingRecord.id, created: false };

  const grossAmount = Math.round(input.amount * 100) / 100;
  const stripeFee = Math.round((grossAmount * 0.03 + 1) * 100) / 100;
  const netAmount = Math.round((grossAmount - stripeFee) * 100) / 100;

  const { data: restRow } = await supabase
    .from('restaurants')
    .select('name')
    .eq('id', input.restaurantId)
    .single();

  const { data: billingRecord, error: insertError } = await supabase.from('billing_records').insert({
    restaurant_id: input.restaurantId,
    description: input.description,
    amount: grossAmount,
    type: 'stripe',
    gross: grossAmount,
    fee: stripeFee,
    net: netAmount,
    plan_id: input.planId || 'basic',
    restaurant_name: restRow?.name || 'Unknown',
    created_by: 'stripe',
    reference_code: referenceCode,
  }).select('id').maybeSingle();

  if (insertError) {
    throw new Error(insertError.message || 'Failed to record Stripe billing income.');
  }

  return { id: billingRecord?.id || null, created: true };
}

function getStripeSubscriptionPeriod(subscription: Stripe.Subscription): { periodStart: string | null; periodEnd: string | null } {
  const subItem = subscription.items.data[0];
  const periodStart = subItem?.current_period_start
    ? new Date(subItem.current_period_start * 1000).toISOString()
    : subscription.start_date
      ? new Date(subscription.start_date * 1000).toISOString()
      : null;
  const periodEnd = subItem?.current_period_end
    ? new Date(subItem.current_period_end * 1000).toISOString()
    : null;

  return { periodStart, periodEnd };
}

function normalizeStripeBillingInterval(value: string | null | undefined): 'monthly' | 'annual' {
  return value === 'annual' || value === 'year' ? 'annual' : 'monthly';
}

async function reconcileStripePaymentsForRestaurant(
  restaurantId: string,
  sub: any
): Promise<StripeRepairResult> {
  const customerId = sub?.stripe_customer_id;
  if (!customerId) {
    return { checked: false, updated: false, reason: 'no_stripe_customer', billingRecordsCreated: 0, subscriptionPaymentsSynced: 0 };
  }

  let billingRecordsCreated = 0;
  let subscriptionPaymentsSynced = 0;
  let updated = false;
  let repairedPeriodEnd: string | null = null;
  const now = new Date();
  const localPlanId = sub?.plan_id || 'basic';
  const localInterval = normalizeStripeBillingInterval(sub?.billing_interval);

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });
  const activeSubscription = subscriptions.data
    .filter(item => item.status === 'active' || item.status === 'trialing')
    .sort((a, b) => {
      const aEnd = getStripeSubscriptionPeriod(a).periodEnd;
      const bEnd = getStripeSubscriptionPeriod(b).periodEnd;
      return (bEnd ? new Date(bEnd).getTime() : 0) - (aEnd ? new Date(aEnd).getTime() : 0);
    })[0];

  if (activeSubscription) {
    const { periodStart, periodEnd } = getStripeSubscriptionPeriod(activeSubscription);
    const stripePlanId = activeSubscription.metadata?.plan_id || localPlanId;
    const stripeInterval = normalizeStripeBillingInterval(
      activeSubscription.metadata?.billing_interval
      || activeSubscription.items.data[0]?.price?.recurring?.interval
      || localInterval
    );

    if (periodEnd) {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: activeSubscription.status === 'trialing' ? 'trialing' : 'active',
          stripe_subscription_id: activeSubscription.id,
          plan_id: stripePlanId,
          billing_interval: stripeInterval,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: activeSubscription.cancel_at_period_end,
          pending_plan_id: null,
          pending_billing_interval: null,
          pending_change_effective_at: null,
          ...ACCESS_UNLOCK_PATCH,
          updated_at: now.toISOString(),
        })
        .eq('restaurant_id', restaurantId);

      if (error) throw new Error(error.message || 'Failed to repair subscription from Stripe.');

      await supabase
        .from('users')
        .update({ is_active: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'VENDOR');

      await supabase
        .from('restaurants')
        .update({ kitchen_enabled: stripePlanId === 'pro_plus' })
        .eq('id', restaurantId);

      repairedPeriodEnd = periodEnd;
      updated = true;
    }
  }

  const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
  for (const invoice of invoices.data.filter(inv => inv.status === 'paid' && (inv.amount_paid || 0) > 0)) {
    const lineDesc = invoice.lines.data[0]?.description;
    const record = await recordStripeBillingIncome({
      restaurantId,
      planId: activeSubscription?.metadata?.plan_id || localPlanId,
      amount: (invoice.amount_paid || 0) / 100,
      description: lineDesc || 'Stripe subscription renewal',
      stripeObjectId: invoice.id || `invoice-${invoice.created}`,
    });
    if (record.created) billingRecordsCreated++;
    await upsertSubscriptionPayment(supabase, {
      restaurantId,
      provider: 'stripe',
      status: 'succeeded',
      providerReference: invoice.id || `invoice-${invoice.created}`,
      billingRecordId: record.id,
    });
    subscriptionPaymentsSynced++;
  }

  const charges = await stripe.charges.list({ customer: customerId, limit: 50 });
  for (const charge of charges.data.filter(ch =>
    ch.paid
    && ch.status === 'succeeded'
    && (ch.amount || 0) > 0
    && !(ch as any).invoice
    && ch.metadata?.type !== 'wallet_topup'
    && (ch.metadata?.plan_id || ch.metadata?.change_type)
  )) {
    if ((charge as any).invoice) continue;
    const metadataPlanId = charge.metadata?.plan_id || localPlanId;
    const metadataInterval = normalizeStripeBillingInterval(charge.metadata?.billing_interval || localInterval);
    const changeType = charge.metadata?.change_type || 'renew';
    const planName = PLAN_NAMES[metadataPlanId] || metadataPlanId;
    const intervalLabel = metadataInterval === 'annual' ? 'Annual' : 'Monthly';
    const actionLabel = changeType === 'upgrade'
      ? 'Upgrade'
      : changeType === 'downgrade'
        ? 'Downgrade'
        : 'Renewal';

    const record = await recordStripeBillingIncome({
      restaurantId,
      planId: metadataPlanId,
      amount: (charge.amount || 0) / 100,
      description: charge.description || `Stripe ${planName} ${actionLabel} (${intervalLabel})`,
      stripeObjectId: charge.id,
    });
    if (record.created) {
      billingRecordsCreated++;

      if (!activeSubscription) {
        const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
          charge.metadata?.renew_from || sub?.current_period_end || sub?.trial_end,
          metadataInterval === 'annual',
          new Date(charge.created * 1000)
        );
        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            plan_id: metadataPlanId,
            billing_interval: metadataInterval,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            pending_plan_id: null,
            pending_billing_interval: null,
            pending_change_effective_at: null,
            ...ACCESS_UNLOCK_PATCH,
            updated_at: now.toISOString(),
          })
          .eq('restaurant_id', restaurantId);

        if (error) throw new Error(error.message || 'Failed to repair payment-mode subscription from Stripe.');

        await supabase
          .from('users')
          .update({ is_active: true })
          .eq('restaurant_id', restaurantId)
          .eq('role', 'VENDOR');

        await supabase
          .from('restaurants')
          .update({ kitchen_enabled: metadataPlanId === 'pro_plus' })
          .eq('id', restaurantId);

        repairedPeriodEnd = periodEnd.toISOString();
        updated = true;
      }
    }

    await upsertSubscriptionPayment(supabase, {
      restaurantId,
      provider: 'stripe',
      status: 'succeeded',
      providerReference: charge.id,
      billingRecordId: record.id,
    });
    subscriptionPaymentsSynced++;
  }

  return {
    checked: true,
    updated,
    billingRecordsCreated,
    subscriptionPaymentsSynced,
    newPeriodEnd: repairedPeriodEnd,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    switch (action) {
      // GET /api/stripe/billing?action=history&customerId=...&restaurantId=...
      case 'history': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const customerId = req.query.customerId as string;
        const historyRestaurantId = req.query.restaurantId as string;
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        // Fetch invoices (subscription payments + renewal invoices)
        const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
        const invoiceEntries = invoices.data
          .filter(inv => inv.status === 'paid')
          .map(inv => {
            const lineDesc = inv.lines.data[0]?.description;
            return {
              id: inv.id,
              date: inv.created ? new Date(inv.created * 1000).toISOString() : '',
              description: lineDesc || inv.description || 'Subscription payment',
              amount: (inv.amount_paid || 0) / 100,
              invoiceUrl: inv.invoice_pdf || inv.hosted_invoice_url || null,
            };
          });

        // Fetch paid charges that are not tied to invoices (e.g. Checkout payment mode plan changes)
        const charges = await stripe.charges.list({ customer: customerId, limit: 50 });
        const chargeEntries = charges.data
          .filter(ch => ch.paid && ch.status === 'succeeded' && (ch.metadata?.change_type || ch.metadata?.plan_id))
          .map(ch => {
            const changeType = ch.metadata?.change_type;
            const planId = ch.metadata?.plan_id;
            const planLabel = planId ? planId.replace('_', ' ').toUpperCase() : 'PLAN';
            const changeLabel = changeType
              ? `${changeType.charAt(0).toUpperCase()}${changeType.slice(1)}`
              : 'Plan change';

            return {
              id: ch.id,
              date: ch.created ? new Date(ch.created * 1000).toISOString() : '',
              description: ch.description || `${changeLabel}: ${planLabel}`,
              amount: (ch.amount || 0) / 100,
              invoiceUrl: ch.receipt_url || null,
            };
          });

        // Fetch local billing records (admin-granted extensions, etc.)
        let localEntries: Array<{ id: string; date: string; description: string; amount: number; invoiceUrl: string | null; referenceCode?: string | null }> = [];
        if (historyRestaurantId) {
          const { data: localRecords } = await supabase
            .from('billing_records')
            .select('id, description, amount, created_at, reference_code')
            .eq('restaurant_id', historyRestaurantId)
            .order('created_at', { ascending: false })
            .limit(50);
          if (localRecords) {
            localEntries = localRecords.map((r: any) => ({
              id: r.id,
              date: r.created_at,
              description: r.description,
              amount: Number(r.amount) || 0,
              invoiceUrl: null,
              referenceCode: r.reference_code || null,
            }));
          }
        }

        const result = [...invoiceEntries, ...chargeEntries, ...localEntries]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return res.status(200).json({ invoices: result });
      }

      // GET /api/stripe/billing?action=download-invoice&invoiceId=...
      case 'download-invoice': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const invoiceId = req.query.invoiceId as string;
        if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required.' });

        // For charges, receipt_url is an HTML page — return the URL for the client to open
        if (invoiceId.startsWith('ch_')) {
          const charge = await stripe.charges.retrieve(invoiceId);
          const receiptUrl = charge.receipt_url || null;
          if (!receiptUrl) return res.status(404).json({ error: 'No receipt found.' });
          return res.status(200).json({ redirect: receiptUrl });
        }

        // For invoices, fetch the actual PDF from Stripe
        if (invoiceId.startsWith('in_')) {
          const invoice = await stripe.invoices.retrieve(invoiceId);
          const pdfUrl = invoice.invoice_pdf || null;
          if (!pdfUrl) return res.status(404).json({ error: 'No invoice PDF found.' });

          const pdfResp = await fetch(pdfUrl, {
            headers: { 'User-Agent': 'QuickServe/1.0' },
            redirect: 'follow',
          });
          if (!pdfResp.ok) return res.status(502).json({ error: 'Failed to fetch PDF from Stripe.' });

          const arrayBuf = await pdfResp.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);

          // Verify it's actually a PDF (starts with %PDF)
          if (buffer.length < 5 || buffer.toString('ascii', 0, 4) !== '%PDF') {
            // Not a real PDF — fall back to redirect
            return res.status(200).json({ redirect: invoice.hosted_invoice_url || pdfUrl });
          }

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
          res.setHeader('Content-Length', buffer.length.toString());
          return res.send(buffer);
        }

        return res.status(400).json({ error: 'Invalid document ID.' });
      }

      // GET /api/stripe/billing?action=balance&customerId=...
      case 'balance': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const customerId = req.query.customerId as string;
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        // Fetch total successful charges for this customer (online payments received)
        const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
        const totalReceived = charges.data
          .filter(ch => ch.paid && ch.status === 'succeeded')
          .reduce((sum, ch) => sum + ch.amount, 0);

        // Also get customer balance (credits/debits on account)
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const customerBalance = customer.balance || 0; // negative = credit

        return res.status(200).json({
          balance: totalReceived,
          customerBalance,
          currency: charges.data[0]?.currency || 'myr',
        });
      }

      // GET /api/stripe/billing?action=payment-methods&customerId=...
      case 'payment-methods': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const customerId = req.query.customerId as string;
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string'
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id;

        const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
        const methods = paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card?.brand || 'unknown',
          last4: pm.card?.last4 || '0000',
          expMonth: pm.card?.exp_month || 0,
          expYear: pm.card?.exp_year || 0,
          isDefault: pm.id === defaultPmId,
          type: pm.card?.funding === 'debit' ? 'debit' : 'credit',
        }));
        return res.status(200).json({ methods });
      }

      // POST /api/stripe/billing?action=setup-session  body: { customerId?, restaurantId }
      case 'setup-session': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { customerId: inputCustomerId, restaurantId } = req.body || {};
        if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required.' });

        let customerId = inputCustomerId as string | undefined;

        // If no customerId provided, look up or create a Stripe customer
        if (!customerId) {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('restaurant_id', restaurantId)
            .single();

          customerId = sub?.stripe_customer_id || undefined;
        }

        if (!customerId) {
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('name')
            .eq('id', restaurantId)
            .single();

          const { data: user } = await supabase
            .from('users')
            .select('email, username')
            .eq('restaurant_id', restaurantId)
            .eq('role', 'VENDOR')
            .single();

          const customer = await stripe.customers.create({
            name: restaurant?.name || 'QuickServe Customer',
            email: user?.email || undefined,
            metadata: { restaurant_id: restaurantId },
          });
          customerId = customer.id;

          await supabase
            .from('subscriptions')
            .update({ stripe_customer_id: customerId })
            .eq('restaurant_id', restaurantId);
        }

        const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'setup',
          payment_method_types: ['card'],
          success_url: `${baseUrl}?setup=success`,
          cancel_url: `${baseUrl}?setup=cancelled`,
          metadata: { restaurant_id: restaurantId || '' },
        });
        return res.status(200).json({ url: session.url, customerId });
      }

      // POST /api/stripe/billing?action=wallet-topup-session  body: { restaurantId, amount, customerId? }
      case 'wallet-topup-session': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: topupRestaurantId, amount, customerId: inputCustomerId } = req.body || {};
        const parsedAmount = Number(amount);

        if (!topupRestaurantId || !parsedAmount || parsedAmount <= 0) {
          return res.status(400).json({ error: 'restaurantId and a valid amount are required.' });
        }

        const customerId = await getOrCreateStripeCustomerId(topupRestaurantId, inputCustomerId);
        const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'myr',
              unit_amount: Math.round(parsedAmount * 100),
              product_data: {
                name: 'QuickServe Wallet Top Up',
              },
            },
            quantity: 1,
          }],
          success_url: `${baseUrl}?payment=success&source=wallet_topup&checkout_session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}?payment=cancelled&source=wallet_topup`,
          payment_intent_data: {
            description: `QuickServe Wallet Top Up - RM ${parsedAmount.toFixed(2)}`,
            metadata: {
              restaurant_id: topupRestaurantId,
              type: 'wallet_topup',
              amount: parsedAmount.toFixed(2),
            },
          },
          metadata: {
            restaurant_id: topupRestaurantId,
            type: 'wallet_topup',
            amount: parsedAmount.toFixed(2),
          },
        });

        return res.status(200).json({ url: session.url, customerId });
      }

      // POST /api/stripe/billing?action=delete-payment-method  body: { paymentMethodId }
      case 'delete-payment-method': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { paymentMethodId } = req.body || {};
        if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required.' });

        await stripe.paymentMethods.detach(paymentMethodId);
        return res.status(200).json({ success: true });
      }

      // POST /api/stripe/billing?action=wallet-topup-direct  body: { restaurantId, amount, paymentMethodId, customerId? }
      case 'wallet-topup-direct': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: topupRestaurantId, amount, paymentMethodId, customerId: inputCustomerId } = req.body || {};
        const parsedAmount = Number(amount);

        if (!topupRestaurantId || !paymentMethodId || !parsedAmount || parsedAmount <= 0) {
          return res.status(400).json({ error: 'restaurantId, paymentMethodId, and a valid amount are required.' });
        }

        const customerId = await getOrCreateStripeCustomerId(topupRestaurantId, inputCustomerId);

        let paymentIntent: Stripe.PaymentIntent;
        try {
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(parsedAmount * 100),
            currency: 'myr',
            customer: customerId,
            payment_method: paymentMethodId,
            confirm: true,
            off_session: true,
            description: 'QuickServe Wallet Top-up',
            metadata: {
              restaurant_id: topupRestaurantId,
              type: 'wallet_topup',
            },
          });
        } catch (paymentError: any) {
          return res.status(402).json({ error: paymentError?.message || 'Card payment failed. Please try another card.' });
        }

        if (paymentIntent.status !== 'succeeded') {
          return res.status(402).json({ error: 'Card payment was not completed.' });
        }

        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        const cardBrand = paymentMethod.type === 'card' ? paymentMethod.card?.brand?.toUpperCase() || 'CARD' : 'CARD';
        const cardLast4 = paymentMethod.type === 'card' ? paymentMethod.card?.last4 || '0000' : '0000';

        const { data: transaction, error: transactionError } = await supabase
          .from('wallet_transactions')
          .insert({
            restaurant_id: topupRestaurantId,
            amount: parsedAmount,
            type: 'deposit',
            status: 'completed',
            description: `Wallet deposit via Card - ${cardBrand} •••• ${cardLast4}`,
          })
          .select()
          .single();

        if (transactionError) {
          return res.status(500).json({ error: transactionError.message || 'Wallet top-up succeeded but could not be recorded.' });
        }

        const balance = await getWalletBalance(topupRestaurantId);
        return res.status(200).json({ success: true, transaction, balance, paymentIntentId: paymentIntent.id });
      }

      // POST /api/stripe/billing?action=plan-change-wallet
      // Pays a renew/upgrade/downgrade/switch from wallet balance.
      case 'plan-change-wallet': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const {
          restaurantId: walletRestId,
          planId: walletPlanId,
          billingInterval: walletInterval = 'monthly',
          changeType: walletChangeType = 'renew',
        } = req.body || {};

        if (!walletRestId || !walletPlanId) {
          return res.status(400).json({ error: 'restaurantId and planId are required.' });
        }
        if (!PLAN_PRICES[walletPlanId]) {
          return res.status(400).json({ error: 'Invalid plan.' });
        }
        if (!['monthly', 'annual'].includes(walletInterval)) {
          return res.status(400).json({ error: 'Invalid billing interval.' });
        }
        if (!['renew', 'upgrade', 'downgrade'].includes(walletChangeType)) {
          return res.status(400).json({ error: 'Invalid change type.' });
        }

        const { data: walletSub } = await supabase
          .from('subscriptions')
          .select('plan_id, billing_interval, current_period_end, trial_end')
          .eq('restaurant_id', walletRestId)
          .single();

        if (!walletSub) {
          return res.status(404).json({ error: 'Subscription not found.' });
        }

        const isWalletAnnual = walletInterval === 'annual';
        const walletPlanPrices = PLAN_PRICES[walletPlanId];
        const walletPricePerMonth = isWalletAnnual ? walletPlanPrices.annual : walletPlanPrices.monthly;
        const walletMonths = isWalletAnnual ? 12 : 1;
        const walletChargeAmount = walletPricePerMonth * walletMonths;
        const currentWalletBalance = await getWalletBalance(walletRestId);

        if (currentWalletBalance < walletChargeAmount) {
          return res.status(400).json({
            error: `Insufficient wallet balance. Available: RM ${currentWalletBalance.toFixed(2)}. Required: RM ${walletChargeAmount.toFixed(2)}.`,
          });
        }

        const walletRenewFrom = walletChangeType === 'upgrade'
          ? undefined
          : (walletSub.current_period_end || walletSub.trial_end || undefined);
        const walletRenewDate = walletRenewFrom ? new Date(walletRenewFrom) : null;
        const walletIsFutureRenew = walletRenewDate ? walletRenewDate > new Date() : false;
        const walletIsScheduledDowngrade = walletChangeType === 'downgrade' && walletIsFutureRenew;
        let walletNewPeriodEnd: string | null = null;

        if (walletIsScheduledDowngrade) {
          await supabase
            .from('subscriptions')
            .update({
              pending_plan_id: walletPlanId,
              pending_billing_interval: walletInterval,
              pending_change_effective_at: (walletRenewDate || new Date()).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('restaurant_id', walletRestId);
          walletNewPeriodEnd = walletSub.current_period_end || walletSub.trial_end || null;
        } else {
          const { periodStart: walletPeriodStart, periodEnd: walletPeriodEnd } =
            calculateNextSubscriptionPeriod(walletRenewFrom, isWalletAnnual);
          walletNewPeriodEnd = walletPeriodEnd.toISOString();

          await supabase
            .from('subscriptions')
            .upsert({
              restaurant_id: walletRestId,
              status: 'active',
              plan_id: walletPlanId,
              billing_interval: walletInterval,
              current_period_start: walletPeriodStart.toISOString(),
              current_period_end: walletNewPeriodEnd,
              pending_plan_id: null,
              pending_billing_interval: null,
              pending_change_effective_at: null,
              ...ACCESS_UNLOCK_PATCH,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'restaurant_id' });

          const walletKitchenEnabled = walletPlanId === 'pro_plus';
          await supabase.from('restaurants').update({ kitchen_enabled: walletKitchenEnabled }).eq('id', walletRestId);
        }

        const walletIntervalLabel = isWalletAnnual ? 'Annual' : 'Monthly';
        const walletPlanName = PLAN_NAMES[walletPlanId] || walletPlanId;
        const walletActionLabel = walletChangeType === 'upgrade'
          ? 'Upgrade'
          : walletChangeType === 'downgrade'
            ? 'Downgrade'
            : 'Renewal';

        const { data: walletBillingTransaction, error: walletBillingInsertError } = await supabase
          .from('wallet_transactions')
          .insert({
            restaurant_id: walletRestId,
            amount: walletChargeAmount,
            type: 'billing',
            status: 'completed',
            description: `Subscription ${walletActionLabel.toLowerCase()} - ${walletPlanName} (${walletIntervalLabel})`,
          })
          .select('id, reference_code')
          .single();

        if (walletBillingInsertError) {
          return res.status(500).json({ error: walletBillingInsertError.message || 'Failed to record wallet billing transaction.' });
        }

        const { data: walletRest } = await supabase
          .from('restaurants')
          .select('name')
          .eq('id', walletRestId)
          .single();

        const { data: walletBillingRecord } = await supabase.from('billing_records').insert({
          restaurant_id: walletRestId,
          description: `QuickServe Wallet ${walletActionLabel} (${walletIntervalLabel})`,
          amount: walletChargeAmount,
          type: 'wallet',
          gross: walletChargeAmount,
          fee: 0,
          net: walletChargeAmount,
          plan_id: walletPlanId,
          restaurant_name: walletRest?.name || 'Unknown',
          created_by: 'wallet',
          reference_code: walletBillingTransaction?.reference_code || null,
        }).select('id').maybeSingle();

        await upsertSubscriptionPayment(supabase, {
          restaurantId: walletRestId,
          provider: 'wallet',
          status: 'succeeded',
          providerReference: walletBillingTransaction?.reference_code || walletBillingTransaction?.id || `wallet-${Date.now()}`,
          billingRecordId: walletBillingRecord?.id || null,
          walletTransactionId: walletBillingTransaction?.id || null,
        });

        const updatedWalletBalance = await getWalletBalance(walletRestId);
        return res.status(200).json({
          success: true,
          amountCharged: walletChargeAmount,
          interval: walletIntervalLabel,
          changeType: walletChangeType,
          scheduled: walletIsScheduledDowngrade,
          newPeriodEnd: walletNewPeriodEnd,
          balance: updatedWalletBalance,
        });
      }

      // POST /api/stripe/billing?action=renew-wallet  body: { restaurantId }
      case 'renew-wallet': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: renewRestaurantId } = req.body || {};
        if (!renewRestaurantId) return res.status(400).json({ error: 'restaurantId is required.' });

        const { data: renewSub } = await supabase
          .from('subscriptions')
          .select('plan_id, billing_interval, current_period_end, trial_end')
          .eq('restaurant_id', renewRestaurantId)
          .single();

        if (!renewSub) {
          return res.status(404).json({ error: 'Subscription not found.' });
        }

        const planId = renewSub.plan_id || 'basic';
        const isAnnual = renewSub.billing_interval === 'annual';
        const planPrices = PLAN_PRICES[planId] || PLAN_PRICES.basic;
        const pricePerMonth = isAnnual ? planPrices.annual : planPrices.monthly;
        const months = isAnnual ? 12 : 1;
        const grossCharged = pricePerMonth * months;
        const walletBalance = await getWalletBalance(renewRestaurantId);

        if (walletBalance < grossCharged) {
          return res.status(400).json({
            error: `Insufficient wallet balance. Available: RM ${walletBalance.toFixed(2)}. Required: RM ${grossCharged.toFixed(2)}.`,
          });
        }

        const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
          renewSub.current_period_end || renewSub.trial_end,
          isAnnual
        );

        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            ...ACCESS_UNLOCK_PATCH,
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', renewRestaurantId);

        const intervalLabel = isAnnual ? 'Annual' : 'Monthly';
        const planName = PLAN_NAMES[planId] || planId;

        const { data: walletBillingTransaction, error: walletBillingInsertError } = await supabase.from('wallet_transactions').insert({
          restaurant_id: renewRestaurantId,
          amount: grossCharged,
          type: 'billing',
          status: 'completed',
          description: `Subscription renewal - ${planName} (${intervalLabel})`,
        }).select('id, reference_code').single();

        if (walletBillingInsertError) {
          return res.status(500).json({ error: walletBillingInsertError.message || 'Failed to record wallet billing transaction.' });
        }

        const { data: renewRestaurant } = await supabase
          .from('restaurants')
          .select('name')
          .eq('id', renewRestaurantId)
          .single();

        const { data: renewBillingRecord } = await supabase.from('billing_records').insert({
          restaurant_id: renewRestaurantId,
          description: `QuickServe Wallet Payment (${intervalLabel})`,
          amount: grossCharged,
          type: 'wallet',
          gross: grossCharged,
          fee: 0,
          net: grossCharged,
          plan_id: planId,
          restaurant_name: renewRestaurant?.name || 'Unknown',
          created_by: 'wallet',
          reference_code: walletBillingTransaction?.reference_code || null,
        }).select('id').maybeSingle();

        await upsertSubscriptionPayment(supabase, {
          restaurantId: renewRestaurantId,
          provider: 'wallet',
          status: 'succeeded',
          providerReference: walletBillingTransaction?.reference_code || walletBillingTransaction?.id || `wallet-${Date.now()}`,
          billingRecordId: renewBillingRecord?.id || null,
          walletTransactionId: walletBillingTransaction?.id || null,
        });

        const balance = await getWalletBalance(renewRestaurantId);
        return res.status(200).json({
          success: true,
          newPeriodEnd: periodEnd.toISOString(),
          amountCharged: grossCharged,
          interval: intervalLabel,
          balance,
        });
      }

      // POST /api/stripe/billing?action=toggle-auto-renew  body: { subscriptionId, cancelAtPeriodEnd }
      case 'toggle-auto-renew': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { subscriptionId, cancelAtPeriodEnd } = req.body || {};
        if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required.' });

        await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: !!cancelAtPeriodEnd });
        return res.status(200).json({ success: true, cancelAtPeriodEnd: !!cancelAtPeriodEnd });
      }

      // POST /api/stripe/billing?action=renew-direct  body: { restaurantId, paymentMethodId }
      // Charges the saved card directly for a renewal period (month or year)
      case 'renew-direct': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: renewRestId, paymentMethodId: renewPmId } = req.body || {};
        if (!renewRestId) return res.status(400).json({ error: 'restaurantId is required.' });

        // Get subscription details
        const { data: renewSub } = await supabase
          .from('subscriptions')
          .select('stripe_customer_id, plan_id, billing_interval, current_period_end, trial_end')
          .eq('restaurant_id', renewRestId)
          .single();

        if (!renewSub?.stripe_customer_id) {
          return res.status(400).json({ error: 'No Stripe customer found. Please add a payment method first.' });
        }

        const planId = renewSub.plan_id || 'basic';
        const isAnnual = renewSub.billing_interval === 'annual';

        // Determine the price
        const planPrices = PLAN_PRICES[planId] || PLAN_PRICES.basic;
        const monthlyPrice = isAnnual ? planPrices.annual : planPrices.monthly;
        const months = isAnnual ? 12 : 1;
        const totalAmount = monthlyPrice * months * 100; // in cents (MYR)

        // Determine the payment method to use
        let paymentMethodId = renewPmId;
        if (!paymentMethodId) {
          // Use the default payment method
          const customer = await stripe.customers.retrieve(renewSub.stripe_customer_id) as Stripe.Customer;
          paymentMethodId = typeof customer.invoice_settings?.default_payment_method === 'string'
            ? customer.invoice_settings.default_payment_method
            : customer.invoice_settings?.default_payment_method?.id;

          if (!paymentMethodId) {
            // Fallback: get the first available card
            const pms = await stripe.paymentMethods.list({ customer: renewSub.stripe_customer_id, type: 'card', limit: 1 });
            paymentMethodId = pms.data[0]?.id;
          }
        }

        if (!paymentMethodId) {
          return res.status(400).json({ error: 'No payment method found. Please add a card first.' });
        }

        const intervalLabel = isAnnual ? 'Annual' : 'Monthly';
        const chargeDescription = `QuickServe ${PLAN_NAMES[planId] || planId} Plan Renewal (${intervalLabel})`;

        // Create invoice item → invoice → pay in one flow
        try {
          await stripe.invoiceItems.create({
            customer: renewSub.stripe_customer_id,
            amount: totalAmount,
            currency: 'myr',
            description: chargeDescription,
          });
        } catch (iiErr: any) {
          console.error('InvoiceItem creation failed:', iiErr?.message);
          return res.status(500).json({ error: `Failed to create invoice item: ${iiErr?.message}` });
        }

        let invoice: Stripe.Invoice;
        try {
          invoice = await stripe.invoices.create({
            customer: renewSub.stripe_customer_id,
            default_payment_method: paymentMethodId,
            auto_advance: true,
            pending_invoice_items_behavior: 'include',
            metadata: { restaurant_id: renewRestId, plan_id: planId, type: 'renewal' },
          });
        } catch (invErr: any) {
          console.error('Invoice creation failed:', invErr?.message);
          return res.status(500).json({ error: `Failed to create invoice: ${invErr?.message}` });
        }

        let paidInvoice: Stripe.Invoice;
        try {
          paidInvoice = await stripe.invoices.pay(invoice.id, {
            payment_method: paymentMethodId,
          });
        } catch (payErr: any) {
          console.error('Invoice pay failed:', payErr?.message);
          return res.status(402).json({
            error: payErr?.message || 'Payment failed. Please try a different card or contact your bank.',
          });
        }

        if (paidInvoice.status !== 'paid') {
          return res.status(402).json({
            error: 'Payment failed. Your card was declined. Please try a different card or contact your bank.',
            code: paidInvoice.status,
          });
        }

        // Payment succeeded — extend the subscription period
        const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
          renewSub.current_period_end || renewSub.trial_end,
          isAnnual
        );

        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            ...ACCESS_UNLOCK_PATCH,
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', renewRestId);

        // Record Stripe payment into billing_records for income tracking
        const grossCharged = totalAmount / 100;
        // Estimate Stripe fee: 3% + RM1 for Malaysian cards (approximate)
        const stripeFeeAmt = Math.round((grossCharged * 0.03 + 1) * 100) / 100;
        const netCharged = Math.round((grossCharged - stripeFeeAmt) * 100) / 100;

        const { data: renewRest } = await supabase
          .from('restaurants').select('name').eq('id', renewRestId).single();

        const { data: stripeRenewBillingRecord } = await supabase.from('billing_records').insert({
          restaurant_id: renewRestId,
          description: chargeDescription,
          amount: grossCharged,
          type: 'stripe',
          gross: grossCharged,
          fee: stripeFeeAmt,
          net: netCharged,
          plan_id: planId,
          restaurant_name: renewRest?.name || 'Unknown',
          created_by: 'stripe',
          reference_code: `STRIPE-${paidInvoice.id}`,
        }).select('id').maybeSingle();

        await upsertSubscriptionPayment(supabase, {
          restaurantId: renewRestId,
          provider: 'stripe',
          status: 'succeeded',
          providerReference: paidInvoice.id,
          billingRecordId: stripeRenewBillingRecord?.id || null,
        });

        return res.status(200).json({
          success: true,
          newPeriodEnd: periodEnd.toISOString(),
          amountCharged: grossCharged,
          interval: intervalLabel,
        });
      }

      // GET/POST /api/stripe/billing?action=cleanup-stale
      // Persists automatic expiry locks and deletes stale pending registrations.
      case 'cleanup-stale': {
        // Verify cron secret to prevent unauthorized calls
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const { data: lockCandidates, error: lockFetchError } = await supabase
          .from('subscriptions')
          .select('id, current_period_end, trial_end, access_lock_at')
          .eq('access_locked', false)
          .neq('status', 'pending_payment');

        if (lockFetchError) {
          console.error('Error fetching automatic lock candidates:', lockFetchError);
          return res.status(500).json({ error: 'Failed to enforce expired subscription locks.' });
        }

        const dueLockIds = (lockCandidates || [])
          .filter(candidate => isSubscriptionLockDue(candidate, now))
          .map(candidate => candidate.id);

        let lockedCount = 0;
        if (dueLockIds.length > 0) {
          const { data: lockedSubscriptions, error: lockUpdateError } = await supabase
            .from('subscriptions')
            .update({
              access_locked: true,
              access_lock_at: null,
              access_locked_at: nowIso,
              updated_at: nowIso,
            })
            .in('id', dueLockIds)
            .eq('access_locked', false)
            .select('id');

          if (lockUpdateError) {
            console.error('Error persisting automatic subscription locks:', lockUpdateError);
            return res.status(500).json({ error: 'Failed to persist expired subscription locks.' });
          }
          lockedCount = lockedSubscriptions?.length || 0;
        }

        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const { data: staleSubs, error: fetchError } = await supabase
          .from('subscriptions')
          .select('restaurant_id, created_at')
          .eq('status', 'pending_payment')
          .lt('created_at', cutoff);

        if (fetchError) {
          console.error('Error fetching stale subscriptions:', fetchError);
          return res.status(500).json({ error: 'Failed to fetch stale registrations.' });
        }

        const staleRestaurantIds = (staleSubs || []).map(s => s.restaurant_id);
        let deletedCount = 0;

        for (const staleRestId of staleRestaurantIds) {
          try {
            const { data: staleUser } = await supabase
              .from('users')
              .select('id, is_active')
              .eq('restaurant_id', staleRestId)
              .eq('role', 'VENDOR')
              .single();

            if (staleUser && staleUser.is_active) continue;

            await supabase.from('subscriptions').delete().eq('restaurant_id', staleRestId);
            if (staleUser) {
              await supabase.from('users').delete().eq('id', staleUser.id);
            }
            await supabase.from('restaurants').update({ vendor_id: null }).eq('id', staleRestId);
            await supabase.from('restaurants').delete().eq('id', staleRestId);
            deletedCount++;
            console.log(`Cleaned up stale registration: restaurant ${staleRestId}`);
          } catch (cleanupErr) {
            console.error(`Failed to cleanup restaurant ${staleRestId}:`, cleanupErr);
          }
        }

        return res.status(200).json({
          message: `Locked ${lockedCount} expired subscription(s) and cleaned up ${deletedCount} stale registration(s).`,
          locked: lockedCount,
          deleted: deletedCount,
          total_found: staleRestaurantIds.length,
        });
      }

      // POST /api/stripe/billing?action=reconcile-access  body: { restaurantId }
      case 'reconcile-access': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: reconcileRestId } = req.body || {};
        if (!reconcileRestId) return res.status(400).json({ error: 'restaurantId is required.' });

        const PLAN_KITCHEN_MAP: Record<string, { kitchenEnabled: boolean }> = {
          basic: { kitchenEnabled: false },
          pro: { kitchenEnabled: false },
          pro_plus: { kitchenEnabled: true },
        };

        const { data: reconcileSub, error: reconcileSubErr } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('restaurant_id', reconcileRestId)
          .single();

        if (reconcileSubErr || !reconcileSub) {
          return res.status(404).json({ error: 'Subscription not found.' });
        }

        let reconcilePlan = reconcileSub.plan_id;
        const now = new Date();
        let stripeRepair: StripeRepairResult | null = null;
        const shouldCheckStripe = Boolean(
          reconcileSub.stripe_customer_id
          && (
            reconcileSub.access_locked
            || reconcileSub.status === 'past_due'
            || reconcileSub.status === 'pending_payment'
            || isSubscriptionLockDue(reconcileSub, now)
          )
        );

        if (shouldCheckStripe) {
          stripeRepair = await reconcileStripePaymentsForRestaurant(reconcileRestId, reconcileSub);
          if (stripeRepair.updated) {
            const { data: refreshedSub } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('restaurant_id', reconcileRestId)
              .single();
            if (refreshedSub) {
              reconcilePlan = refreshedSub.plan_id;
            }
          }
        }

        if (reconcileSub.pending_plan_id) {
          const effectiveAtRaw = reconcileSub.pending_change_effective_at || reconcileSub.current_period_start;
          const effectiveAt = effectiveAtRaw ? new Date(effectiveAtRaw) : null;

          if (effectiveAt && effectiveAt > now) {
            return res.status(200).json({ updated: Boolean(stripeRepair?.updated), reason: 'before_effective_start', stripeRepair });
          }

          const pendingInterval = reconcileSub.pending_billing_interval || reconcileSub.billing_interval;
          const pendingDurationDays = pendingInterval === 'annual' ? 365 : 30;
          const newPeriodStart = effectiveAt || now;
          const newPeriodEnd = new Date(newPeriodStart);
          newPeriodEnd.setDate(newPeriodEnd.getDate() + pendingDurationDays);

          const { error: promoteErr } = await supabase
            .from('subscriptions')
            .update({
              plan_id: reconcileSub.pending_plan_id,
              billing_interval: pendingInterval,
              current_period_start: newPeriodStart.toISOString(),
              current_period_end: newPeriodEnd.toISOString(),
              pending_plan_id: null,
              pending_billing_interval: null,
              pending_change_effective_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('restaurant_id', reconcileRestId);

          if (promoteErr) {
            return res.status(500).json({ error: 'Failed to activate pending plan change.' });
          }

          reconcilePlan = reconcileSub.pending_plan_id;
        }

        if (!reconcilePlan || !PLAN_KITCHEN_MAP[reconcilePlan]) {
          return res.status(400).json({ error: 'Invalid plan in subscription.' });
        }

        const target = PLAN_KITCHEN_MAP[reconcilePlan];

        const { data: reconcileRest, error: reconcileRestErr } = await supabase
          .from('restaurants')
          .select('kitchen_enabled')
          .eq('id', reconcileRestId)
          .single();

        if (reconcileRestErr || !reconcileRest) {
          return res.status(404).json({ error: 'Restaurant not found.' });
        }

        const alreadyApplied = reconcileRest.kitchen_enabled === target.kitchenEnabled;

        if (alreadyApplied) {
          return res.status(200).json({
            updated: Boolean(stripeRepair?.updated),
            reason: stripeRepair?.updated ? 'stripe_repaired' : 'already_synced',
            stripeRepair,
          });
        }

        const { error: reconcileUpdateErr } = await supabase
          .from('restaurants')
          .update({ kitchen_enabled: target.kitchenEnabled })
          .eq('id', reconcileRestId);

        if (reconcileUpdateErr) {
          return res.status(500).json({ error: 'Failed to update restaurant access.' });
        }

        return res.status(200).json({ updated: true, plan: reconcilePlan, stripeRepair });
      }

      // POST /api/stripe/billing?action=admin-extend
      // Admin grants 1 month extension — type: 'free' (trial) or 'paid' (cash)
      case 'admin-extend': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { restaurantId: extendRestId, extensionType } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!extendRestId) return res.status(400).json({ error: 'restaurantId is required.' });
        const extType = extensionType === 'paid' ? 'paid' : 'free';

        const { data: extSub, error: extSubErr } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('restaurant_id', extendRestId)
          .single();

        if (extSubErr || !extSub) return res.status(404).json({ error: 'Subscription not found.' });

        // Look up plan price for paid extensions
        const planPrices: Record<string, number> = { basic: 30, pro: 50, pro_plus: 70 };
        const planId = extSub.plan_id || 'basic';
        const grossAmount = extType === 'paid' ? (planPrices[planId] || 30) : 0;

        // Look up restaurant name
        const { data: extRest } = await supabase.from('restaurants').select('name').eq('id', extendRestId).single();
        const restaurantName = extRest?.name || 'Unknown';

        // Preserve remaining time for active plans; expired plans restart from now.
        const currentEnd = extSub.current_period_end || extSub.trial_end;
        const { periodStart: baseDate, periodEnd: newEnd } =
          calculateNextSubscriptionPeriod(currentEnd, false);

        const { error: extUpdateErr } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: baseDate.toISOString(),
            current_period_end: newEnd.toISOString(),
            ...ACCESS_UNLOCK_PATCH,
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', extendRestId);

        if (extUpdateErr) return res.status(500).json({ error: 'Failed to extend subscription.' });

        // Record in billing_records so it appears in vendor's billing history and income report
        const description = extType === 'paid'
          ? 'Admin extension (Cash Payment)'
          : 'Admin extension (Free Trial)';
        await supabase.from('billing_records').insert({
          restaurant_id: extendRestId,
          description,
          amount: grossAmount,
          type: extType,
          gross: grossAmount,
          fee: 0,
          net: grossAmount,
          plan_id: planId,
          restaurant_name: restaurantName,
          created_by: 'admin',
        });

        return res.status(200).json({
          success: true,
          newPeriodEnd: newEnd.toISOString(),
          extensionType: extType,
        });
      }

      // POST /api/stripe/billing?action=duitnow-submit
      // Vendor submits a DuitNow QR payment request
      case 'duitnow-submit': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const {
          restaurantId: dnRestId,
          planId: dnPlanId,
          billingInterval: dnInterval,
          amount: dnAmount,
          attachmentUrl: dnAttach,
          referenceNumber: dnRef,
          changeType: dnRequestedChangeType,
        } = req.body || {};

        if (!dnRestId || !dnPlanId || !dnAmount) {
          return res.status(400).json({ error: 'restaurantId, planId, and amount are required.' });
        }
        if (!PLAN_PRICES[dnPlanId]) {
          return res.status(400).json({ error: 'Invalid plan.' });
        }

        const { data: dnSub } = await supabase
          .from('subscriptions')
          .select('duitnow_enabled, status, plan_id, billing_interval, current_period_start, current_period_end, trial_end')
          .eq('restaurant_id', dnRestId)
          .single();

        if (!dnSub?.duitnow_enabled) {
          return res.status(403).json({ error: 'DuitNow payment is not enabled for this restaurant.' });
        }

        const dnCurrentPlanIndex = PLAN_ORDER.indexOf(dnSub.plan_id);
        const dnRequestedPlanIndex = PLAN_ORDER.indexOf(dnPlanId);
        const dnChangeType = dnRequestedPlanIndex > dnCurrentPlanIndex ? 'upgrade' : 'renew';
        if (dnRequestedPlanIndex < dnCurrentPlanIndex) {
          return res.status(400).json({ error: 'DuitNow QR cannot be used for plan downgrades.' });
        }
        if (dnRequestedChangeType && dnRequestedChangeType !== dnChangeType) {
          return res.status(400).json({ error: 'The requested plan change type is invalid.' });
        }
        if (!['monthly', 'annual'].includes(dnInterval || 'monthly')) {
          return res.status(400).json({ error: 'Invalid billing interval.' });
        }
        const dnExpectedAmount = dnInterval === 'annual'
          ? (PLAN_PRICES[dnPlanId]?.annual || 0) * 12
          : PLAN_PRICES[dnPlanId]?.monthly || 0;
        if (!dnExpectedAmount || Math.abs(Number(dnAmount) - dnExpectedAmount) > 0.009) {
          return res.status(400).json({ error: 'The submitted amount does not match the selected renewal plan.' });
        }

        const { data: dnExisting } = await supabase
          .from('duitnow_payments')
          .select('id')
          .eq('restaurant_id', dnRestId)
          .eq('status', 'pending')
          .limit(1);

        if (dnExisting && dnExisting.length > 0) {
          return res.status(409).json({ error: 'You already have a pending DuitNow payment. Please wait for admin review.' });
        }

        const safeRef = dnRef ? String(dnRef).slice(0, 100) : null;
        const safeAttachment = dnAttach ? String(dnAttach).slice(0, 500) : null;
        const dnSubmittedAt = new Date();
        const dnProvisionalUntil = new Date(dnSubmittedAt.getTime() + 24 * 60 * 60 * 1000);
        const dnOriginalExpiry = dnSub.current_period_end || dnSub.trial_end;
        const dnOriginalExpiryDate = dnOriginalExpiry ? new Date(dnOriginalExpiry) : null;
        const dnAccessUntil = dnOriginalExpiryDate && dnOriginalExpiryDate > dnProvisionalUntil
          ? dnOriginalExpiryDate
          : dnProvisionalUntil;

        const dnPaymentPayload = {
          restaurant_id: dnRestId,
          plan_id: dnPlanId,
          change_type: dnChangeType,
          billing_interval: dnInterval || 'monthly',
          amount: Number(dnAmount),
          status: 'pending',
          attachment_url: safeAttachment,
          reference_number: safeRef,
        };
        const dnSnapshotPayload = {
          provisional_access_until: dnProvisionalUntil.toISOString(),
          original_status: dnSub.status,
          original_plan_id: dnSub.plan_id,
          original_billing_interval: dnSub.billing_interval,
          original_current_period_start: dnSub.current_period_start,
          original_current_period_end: dnSub.current_period_end,
          original_trial_end: dnSub.trial_end,
        };

        let dnSupportsProvisionalSnapshot = true;
        let { data: dnPayment, error: dnInsertErr } = await supabase
          .from('duitnow_payments')
          .insert({
            ...dnPaymentPayload,
            ...dnSnapshotPayload,
          })
          .select()
          .single();

        if (dnInsertErr && isMissingColumnError(dnInsertErr, DUITNOW_SNAPSHOT_COLUMNS)) {
          console.warn('DuitNow snapshot columns are unavailable; submitting without provisional access.');
          dnSupportsProvisionalSnapshot = false;
          const fallbackInsert = await supabase
            .from('duitnow_payments')
            .insert(dnPaymentPayload)
            .select()
            .single();
          dnPayment = fallbackInsert.data;
          dnInsertErr = fallbackInsert.error;
        }

        if (dnInsertErr || !dnPayment) {
          console.error('DuitNow submit error:', dnInsertErr);
          return res.status(500).json({ error: 'Failed to submit payment request.' });
        }

        if (dnSupportsProvisionalSnapshot) {
          const { error: dnAccessErr } = await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              plan_id: dnSub.plan_id,
              billing_interval: dnSub.billing_interval || 'monthly',
              current_period_start: dnOriginalExpiryDate && dnOriginalExpiryDate > dnSubmittedAt
                ? dnSub.current_period_start
                : dnSubmittedAt.toISOString(),
              current_period_end: dnAccessUntil.toISOString(),
              access_locked: false,
              access_lock_at: dnAccessUntil.toISOString(),
              access_locked_at: null,
              updated_at: dnSubmittedAt.toISOString(),
            })
            .eq('restaurant_id', dnRestId);

          if (dnAccessErr) {
            console.error('DuitNow access activation error:', dnAccessErr);
            await supabase.from('duitnow_payments').delete().eq('id', dnPayment.id);
            return res.status(500).json({ error: 'Payment submitted, but access could not be restored. Please contact support.' });
          }
        }

        await upsertSubscriptionPayment(supabase, {
          restaurantId: dnRestId,
          provider: 'duitnow',
          status: 'pending',
          providerReference: dnPayment.reference_code || `duitnow-${dnPayment.id}`,
          duitnowPaymentId: dnPayment.id,
        });

        return res.status(200).json({
          success: true,
          payment: dnPayment,
          changeType: dnChangeType,
          provisionalAccessUntil: dnSupportsProvisionalSnapshot
            ? dnProvisionalUntil.toISOString()
            : null,
        });
      }

      // GET /api/stripe/billing?action=duitnow-list&restaurantId=...&status=...
      case 'duitnow-list': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const dnListRestId = req.query.restaurantId as string;
        const dnStatusFilter = req.query.status as string;

        let dnQuery = supabase
          .from('duitnow_payments')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (dnListRestId) {
          dnQuery = dnQuery.eq('restaurant_id', dnListRestId);
        }
        if (dnStatusFilter && ['pending', 'approved', 'rejected'].includes(dnStatusFilter)) {
          dnQuery = dnQuery.eq('status', dnStatusFilter);
        }

        const { data: dnListData, error: dnListErr } = await dnQuery;
        if (dnListErr) {
          return res.status(500).json({ error: 'Failed to fetch DuitNow payments.' });
        }

        if (!dnListRestId && dnListData) {
          const dnRestIds = [...new Set(dnListData.map((d: any) => d.restaurant_id))];
          if (dnRestIds.length > 0) {
            const { data: dnRests } = await supabase
              .from('restaurants')
              .select('id, name')
              .in('id', dnRestIds);

            const dnNameMap: Record<string, string> = {};
            dnRests?.forEach((r: any) => { dnNameMap[r.id] = r.name; });
            dnListData.forEach((d: any) => { d.restaurant_name = dnNameMap[d.restaurant_id] || 'Unknown'; });
          }
        }

        return res.status(200).json({ payments: dnListData || [] });
      }

      // POST /api/stripe/billing?action=duitnow-review  body: { paymentId, decision, adminNote }
      case 'duitnow-review': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { paymentId: dnPayId, decision: dnDecision, adminNote: dnAdminNote } = req.body || {};

        if (!dnPayId || !dnDecision) {
          return res.status(400).json({ error: 'paymentId and decision (approved/rejected) are required.' });
        }
        if (!['approved', 'rejected'].includes(dnDecision)) {
          return res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
        }

        const { data: dnPay, error: dnFetchErr } = await supabase
          .from('duitnow_payments')
          .select('*')
          .eq('id', dnPayId)
          .single();

        if (dnFetchErr || !dnPay) return res.status(404).json({ error: 'Payment not found.' });
        if (dnPay.status !== 'pending') return res.status(409).json({ error: 'Payment has already been reviewed.' });

        const dnReviewedAt = new Date().toISOString();
        const finalizeDuitNowReview = async () => {
          const { error } = await supabase
            .from('duitnow_payments')
            .update({
              status: dnDecision,
              admin_note: dnAdminNote ? String(dnAdminNote).slice(0, 500) : null,
              reviewed_by: 'admin',
              reviewed_at: dnReviewedAt,
              updated_at: dnReviewedAt,
            })
            .eq('id', dnPayId)
            .eq('status', 'pending');
          return error;
        };

        if (dnDecision === 'rejected') {
          const dnHasOriginalSnapshot = Boolean(dnPay.original_status || dnPay.original_plan_id);
          if (dnHasOriginalSnapshot) {
            const dnOriginalExpiry = dnPay.original_current_period_end || dnPay.original_trial_end;
            const dnOriginalExpiryDate = dnOriginalExpiry ? new Date(dnOriginalExpiry) : null;
            const dnOriginalAccessValid = Boolean(
              dnOriginalExpiryDate
              && !Number.isNaN(dnOriginalExpiryDate.getTime())
              && dnOriginalExpiryDate > new Date()
            );

            const { error: dnRestoreErr } = await supabase
              .from('subscriptions')
              .update({
                status: dnOriginalAccessValid ? (dnPay.original_status || 'active') : 'pending_payment',
                plan_id: dnPay.original_plan_id || dnPay.plan_id || 'basic',
                billing_interval: dnPay.original_billing_interval || dnPay.billing_interval || 'monthly',
                current_period_start: dnPay.original_current_period_start || null,
                current_period_end: dnPay.original_current_period_end || null,
                trial_end: dnPay.original_trial_end || null,
                access_locked: !dnOriginalAccessValid,
                access_lock_at: null,
                access_locked_at: dnOriginalAccessValid ? null : new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('restaurant_id', dnPay.restaurant_id);

            if (dnRestoreErr) {
              console.error('DuitNow rejection restore error:', dnRestoreErr);
              return res.status(500).json({ error: 'Payment was rejected, but subscription access could not be updated.' });
            }

            await supabase
              .from('restaurants')
              .update({ kitchen_enabled: (dnPay.original_plan_id || 'basic') === 'pro_plus' })
              .eq('id', dnPay.restaurant_id);
          }

          const dnPlanName = PLAN_NAMES[dnPay.plan_id] || String(dnPay.plan_id || 'Plan').replace('_', ' ');
          const dnIntervalLabel = dnPay.billing_interval === 'annual' ? 'Annual' : 'Monthly';
          const dnNote = dnAdminNote ? String(dnAdminNote).trim().slice(0, 500) : '';
          const dnBody = [
            `Your DuitNow payment for ${dnPlanName} (${dnIntervalLabel}) was rejected by admin.`,
            `Amount submitted: RM ${Number(dnPay.amount || 0).toFixed(2)}.`,
            dnNote ? `Admin note: ${dnNote}` : null,
            'Please update your payment or submit a new QR payment for review.',
          ].filter(Boolean).join('\n\n');

          const { error: dnAnnouncementErr } = await supabase.from('announcements').insert({
            title: 'DuitNow payment rejected',
            body: dnBody,
            category: 'billing',
            is_active: true,
            hub: 'all',
            restaurant_id: dnPay.restaurant_id,
          });

          if (dnAnnouncementErr) {
            console.error('DuitNow rejection announcement error:', dnAnnouncementErr);
          }

          const dnFinalizeErr = await finalizeDuitNowReview();
          if (dnFinalizeErr) return res.status(500).json({ error: 'Subscription was updated, but the payment review could not be finalized.' });

          await upsertSubscriptionPayment(supabase, {
            restaurantId: dnPay.restaurant_id,
            provider: 'duitnow',
            status: 'rejected',
            providerReference: dnPay.reference_code || `duitnow-${dnPay.id}`,
            duitnowPaymentId: dnPay.id,
          });
        }

        if (dnDecision === 'approved') {
          const dnApproveRestId = dnPay.restaurant_id;
          const dnApprovePlan = dnPay.plan_id || 'basic';
          const dnApproveInterval = dnPay.billing_interval || 'monthly';
          const dnIsAnnual = dnApproveInterval === 'annual';
          const dnIsUpgrade = dnPay.change_type === 'upgrade'
            || PLAN_ORDER.indexOf(dnApprovePlan) > PLAN_ORDER.indexOf(dnPay.original_plan_id || dnApprovePlan);

          const { data: dnApproveSub } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('restaurant_id', dnApproveRestId)
            .single();

          if (dnApproveSub) {
            const { periodStart: dnBaseDate, periodEnd: dnNewEnd } = calculateNextSubscriptionPeriod(
              dnIsUpgrade ? undefined : (dnPay.original_current_period_end || dnPay.original_trial_end),
              dnIsAnnual
            );

            const { error: dnSubscriptionUpdateErr } = await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                plan_id: dnApprovePlan,
                billing_interval: dnApproveInterval,
                current_period_start: dnBaseDate.toISOString(),
                current_period_end: dnNewEnd.toISOString(),
                pending_plan_id: null,
                pending_billing_interval: null,
                pending_change_effective_at: null,
                ...ACCESS_UNLOCK_PATCH,
                updated_at: new Date().toISOString(),
              })
              .eq('restaurant_id', dnApproveRestId);
            if (dnSubscriptionUpdateErr) {
              return res.status(500).json({ error: 'Failed to activate the approved subscription.' });
            }

            const dnKitchenEnabled = dnApprovePlan === 'pro_plus';
            const { error: dnKitchenErr } = await supabase
              .from('restaurants')
              .update({ kitchen_enabled: dnKitchenEnabled })
              .eq('id', dnApproveRestId);
            if (dnKitchenErr) {
              return res.status(500).json({ error: 'Subscription activated, but kitchen access could not be updated.' });
            }

            const { data: dnApproveRest } = await supabase.from('restaurants').select('name').eq('id', dnApproveRestId).single();
            const dnIncomeRecord = {
              restaurant_id: dnApproveRestId,
              description: `SUBSCRIPTION INCOME - DuitNow ${dnIsUpgrade ? 'Upgrade' : 'Renewal'} (${dnIsAnnual ? 'Annual' : 'Monthly'})`,
              amount: Number(dnPay.amount),
              type: 'subscription_income',
              gross: Number(dnPay.amount),
              fee: 0,
              net: Number(dnPay.amount),
              plan_id: dnApprovePlan,
              restaurant_name: dnApproveRest?.name || 'Unknown',
              created_by: 'duitnow',
              reference_code: dnPay.reference_code || null,
            };
            let dnIncomeErr: any = null;
            const { data: existingDuitNowIncome, error: dnIncomeLookupErr } = await supabase
              .from('billing_records')
              .select('id')
              .eq('duitnow_payment_id', dnPay.id)
              .maybeSingle();
            let dnBillingRecordId: string | null = existingDuitNowIncome?.id || null;

            if (dnIncomeLookupErr && isMissingColumnError(dnIncomeLookupErr, ['duitnow_payment_id'])) {
              const { data: existingIncome } = dnPay.reference_code
                ? await supabase
                  .from('billing_records')
                  .select('id')
                  .eq('reference_code', dnPay.reference_code)
                  .limit(1)
                : { data: null };

              if (existingIncome?.length) {
                dnBillingRecordId = existingIncome[0]?.id || null;
                dnIncomeErr = null;
              } else {
                const fallbackIncomeInsert = await supabase
                  .from('billing_records')
                  .insert(dnIncomeRecord)
                  .select('id')
                  .maybeSingle();
                dnBillingRecordId = fallbackIncomeInsert.data?.id || null;
                dnIncomeErr = fallbackIncomeInsert.error;
              }
            } else if (dnIncomeLookupErr) {
              dnIncomeErr = dnIncomeLookupErr;
            } else if (!existingDuitNowIncome) {
              const fallbackIncomeInsert = await supabase
                .from('billing_records')
                .insert({
                  ...dnIncomeRecord,
                  duitnow_payment_id: dnPay.id,
                })
                .select('id')
                .maybeSingle();
              dnBillingRecordId = fallbackIncomeInsert.data?.id || null;
              dnIncomeErr = isDuplicateKeyError(fallbackIncomeInsert.error) ? null : fallbackIncomeInsert.error;
            }

            if (dnIncomeErr) {
              console.error('DuitNow subscription income save error:', dnIncomeErr);
              return res.status(500).json({ error: 'Subscription activated, but subscription income could not be saved.' });
            }

            const dnPlanName = PLAN_NAMES[dnApprovePlan] || String(dnApprovePlan).replace('_', ' ');
            const dnIntervalLabel = dnIsAnnual ? 'Annual' : 'Monthly';
            const dnApprovalBody = [
              `Your DuitNow ${dnIsUpgrade ? 'plan upgrade' : 'subscription renewal'} has been approved.`,
              `Plan: ${dnPlanName} (${dnIntervalLabel}).`,
              `Amount approved: RM ${Number(dnPay.amount || 0).toFixed(2)}.`,
              `Your subscription is active until ${dnNewEnd.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
            ].join('\n\n');

            const { error: dnApprovalAnnouncementErr } = await supabase.from('announcements').insert({
              title: dnIsUpgrade ? 'Plan upgrade approved' : 'DuitNow renewal approved',
              body: dnApprovalBody,
              category: 'billing',
              is_active: true,
              hub: 'all',
              restaurant_id: dnApproveRestId,
            });
            if (dnApprovalAnnouncementErr) {
              console.error('DuitNow approval announcement error:', dnApprovalAnnouncementErr);
            }

            const dnFinalizeErr = await finalizeDuitNowReview();
            if (dnFinalizeErr) return res.status(500).json({ error: 'Subscription was activated, but the payment review could not be finalized.' });

            await upsertSubscriptionPayment(supabase, {
              restaurantId: dnApproveRestId,
              provider: 'duitnow',
              status: 'approved',
              providerReference: dnPay.reference_code || `duitnow-${dnPay.id}`,
              billingRecordId: dnBillingRecordId,
              duitnowPaymentId: dnPay.id,
            });

            return res.status(200).json({
              success: true,
              decision: 'approved',
              changeType: dnIsUpgrade ? 'upgrade' : 'renew',
              newPeriodEnd: dnNewEnd.toISOString(),
            });
          }

          return res.status(404).json({ error: 'Subscription not found for this payment.' });
        }

        return res.status(200).json({ success: true, decision: dnDecision });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: history, payment-methods, setup-session, delete-payment-method, wallet-topup-direct, plan-change-wallet, renew-wallet, toggle-auto-renew, renew-direct, cleanup-stale, reconcile-access, admin-extend, duitnow-submit, duitnow-list, duitnow-review' });
    }
  } catch (err: any) {
    console.error(`Stripe billing error (${action}):`, err);
    return res.status(500).json({ error: err?.message || `Billing operation failed: ${action}` });
  }
}
