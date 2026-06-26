import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculateNextSubscriptionPeriod } from '../../lib/subscriptionPeriod.js';
import { upsertSubscriptionPayment } from '../../lib/subscriptionPayments.js';
import { ensureAdminShopQuotationForSession } from '../../lib/adminShopOrders.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

const PLAN_KITCHEN_MAP: Record<string, { kitchenEnabled: boolean }> = {
  basic: { kitchenEnabled: false },
  pro: { kitchenEnabled: false },
  pro_plus: { kitchenEnabled: true },
};
const ACCESS_UNLOCK_PATCH = {
  access_locked: false,
  access_lock_at: null,
  access_locked_at: null,
};
const PLAN_NAMES: Record<string, string> = { basic: 'Basic', pro: 'Pro', pro_plus: 'Pro Plus' };

async function getWalletBalance(restaurantId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount, type')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed');

  if (error || !data) return 0;

  return data.reduce((total, transaction) => {
    const amount = Number(transaction.amount) || 0;
    if (transaction.type === 'sale' || transaction.type === 'deposit') return total + amount;
    if (transaction.type === 'cashout' || transaction.type === 'billing') return total - amount;
    return total;
  }, 0);
}

async function recordStripeBillingIncome(input: {
  restaurantId: string;
  planId?: string | null;
  amount: number;
  description: string;
  stripeObjectId: string;
}): Promise<string | null> {
  if (!input.amount || input.amount <= 0 || !input.stripeObjectId) return null;

  const referenceCode = `STRIPE-${input.stripeObjectId}`;
  const { data: existingRecord, error: lookupError } = await supabase
    .from('billing_records')
    .select('id')
    .eq('reference_code', referenceCode)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || 'Failed to check existing billing record.');
  }
  if (existingRecord) return existingRecord.id;

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

  return billingRecord?.id || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { checkoutSessionId } = req.body || {};

  if (!checkoutSessionId) {
    return res.status(400).json({ error: 'checkoutSessionId is required.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription'],
    });

    if (session.status !== 'complete') {
      return res.status(409).json({
        error: 'Checkout session is not completed yet.',
        status: session.status,
      });
    }

    if (session.metadata?.source === 'admin_shop') {
      if (session.payment_status !== 'paid') {
        return res.status(409).json({
          error: 'Checkout session is not paid yet.',
          paymentStatus: session.payment_status,
        });
      }

      const quote = await ensureAdminShopQuotationForSession(supabase, session);
      return res.status(200).json({ success: true, quoteId: quote.id, quoteNo: quote.quoteNo });
    }

    const restaurantId = session.metadata?.restaurant_id;
    const planId = session.metadata?.plan_id;
    const billingInterval = session.metadata?.billing_interval || 'monthly';
    let shouldUpdateFeaturesNow = true;

    if (!restaurantId) {
      return res.status(400).json({ error: 'Missing restaurant_id metadata in checkout session.' });
    }

    if (session.metadata?.type === 'wallet_topup') {
      const amount = Number(session.metadata?.amount || 0);
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid wallet top-up amount.' });
      }

      const transactionDescription = `Wallet top up via Stripe Checkout - ${session.id}`;
      const { data: existingTransaction } = await supabase
        .from('wallet_transactions')
        .select('id, amount, description')
        .eq('restaurant_id', restaurantId)
        .eq('description', transactionDescription)
        .maybeSingle();

      if (!existingTransaction) {
        const { error: transactionError } = await supabase
          .from('wallet_transactions')
          .insert({
            restaurant_id: restaurantId,
            amount,
            type: 'deposit',
            status: 'completed',
            description: transactionDescription,
          });

        if (transactionError) {
          return res.status(500).json({ error: transactionError.message || 'Wallet top up succeeded but could not be recorded.' });
        }
      }

      const balance = await getWalletBalance(restaurantId);
      return res.status(200).json({
        success: true,
        restaurantId,
        mode: session.mode,
        walletTopup: true,
        amount,
        balance,
      });
    }

    if (session.mode === 'subscription' && session.subscription) {
      const subscription = typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'unpaid',
        incomplete: 'pending_payment',
        incomplete_expired: 'canceled',
      };

      const subItem = subscription.items.data[0];
      const periodStart = subItem?.current_period_start
        ? new Date(subItem.current_period_start * 1000).toISOString()
        : new Date(subscription.start_date * 1000).toISOString();
      const periodEnd = subItem?.current_period_end
        ? new Date(subItem.current_period_end * 1000).toISOString()
        : null;

      const subUpdate: Record<string, any> = {
        status: statusMap[subscription.status] || subscription.status,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        billing_interval: billingInterval,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...ACCESS_UNLOCK_PATCH,
        updated_at: new Date().toISOString(),
      };

      if (planId) {
        subUpdate.plan_id = planId;
      }

      if (subscription.status === 'trialing') {
        subUpdate.trial_start = new Date().toISOString();
        subUpdate.trial_end = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;
      }

      subUpdate.restaurant_id = restaurantId;
      const { error: subscriptionUpdateError } = await supabase
        .from('subscriptions')
        .upsert(subUpdate, { onConflict: 'restaurant_id' });
      if (subscriptionUpdateError) {
        throw new Error(subscriptionUpdateError.message || 'Failed to activate subscription.');
      }

      await supabase
        .from('users')
        .update({ is_active: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'VENDOR');

      // Update Stripe customer metadata for income tracking
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      if (customerId) {
        await stripe.customers.update(customerId, {
          metadata: {
            restaurant_id: restaurantId,
            plan_id: planId || '',
            billing_interval: billingInterval,
          },
        });
      }

      if ((session.amount_total || 0) > 0) {
        await upsertSubscriptionPayment(supabase, {
          restaurantId,
          provider: 'stripe',
          status: 'succeeded',
          providerReference: session.id,
        });
      }
    } else if (session.mode === 'payment') {
      if (session.payment_status !== 'paid') {
        return res.status(409).json({
          error: 'Checkout session completed but payment is not marked paid yet.',
          paymentStatus: session.payment_status,
        });
      }

      const renewFrom = session.metadata?.renew_from;
      const changeType = session.metadata?.change_type || 'renew';
      const renewDate = renewFrom ? new Date(renewFrom) : null;
      const isFutureRenew = renewDate ? renewDate > new Date() : false;
      if (changeType === 'downgrade' && isFutureRenew) {
        shouldUpdateFeaturesNow = false;
      }

      const isScheduledDowngrade = changeType === 'downgrade' && isFutureRenew;

      if (isScheduledDowngrade) {
        // Scheduled downgrade: only set pending fields, don't touch current plan or period
        const { error: scheduledUpdateError } = await supabase
          .from('subscriptions')
          .update({
            pending_plan_id: planId || null,
            pending_billing_interval: billingInterval,
            pending_change_effective_at: (renewDate || new Date()).toISOString(),
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', restaurantId);
        if (scheduledUpdateError) {
          throw new Error(scheduledUpdateError.message || 'Failed to schedule plan change.');
        }
      } else {
        // Immediate change (upgrade, renew, or expired downgrade)
        const { periodStart, periodEnd } = calculateNextSubscriptionPeriod(
          renewFrom,
          billingInterval === 'annual'
        );

        const subscriptionUpdate: Record<string, any> = {
          status: 'active',
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          ...ACCESS_UNLOCK_PATCH,
          updated_at: new Date().toISOString(),
          billing_interval: billingInterval,
          pending_plan_id: null,
          pending_billing_interval: null,
          pending_change_effective_at: null,
        };
        if (planId) subscriptionUpdate.plan_id = planId;

        subscriptionUpdate.restaurant_id = restaurantId;
        const { error: subscriptionUpdateError } = await supabase
          .from('subscriptions')
          .upsert(subscriptionUpdate, { onConflict: 'restaurant_id' });
        if (subscriptionUpdateError) {
          throw new Error(subscriptionUpdateError.message || 'Failed to activate subscription renewal.');
        }
      }

      const grossAmount = (session.amount_total || 0) / 100;
      const changeLabel = changeType === 'upgrade'
        ? 'Upgrade'
        : changeType === 'downgrade'
          ? 'Downgrade'
          : 'Renewal';
      const intervalLabel = billingInterval === 'annual' ? 'Annual' : 'Monthly';
      const billingRecordId = await recordStripeBillingIncome({
        restaurantId,
        planId: planId || 'basic',
        amount: grossAmount,
        description: `Stripe ${PLAN_NAMES[planId || 'basic'] || planId || 'Plan'} ${changeLabel} (${intervalLabel})`,
        stripeObjectId: session.id,
      });
      await upsertSubscriptionPayment(supabase, {
        restaurantId,
        provider: 'stripe',
        status: 'succeeded',
        providerReference: session.id,
        billingRecordId,
      });
    }

    if (shouldUpdateFeaturesNow && planId && PLAN_KITCHEN_MAP[planId]) {
      const { kitchenEnabled } = PLAN_KITCHEN_MAP[planId];
      await supabase
        .from('restaurants')
        .update({ kitchen_enabled: kitchenEnabled })
        .eq('id', restaurantId);
    }

    return res.status(200).json({
      success: true,
      restaurantId,
      planId: planId || null,
      mode: session.mode,
    });
  } catch (err: any) {
    console.error('Confirm checkout error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to confirm checkout.' });
  }
}
