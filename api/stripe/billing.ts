// Vercel serverless function: /api/stripe/billing
// Consolidated billing endpoint — dispatches by ?action= query param
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    switch (action) {
      // GET /api/stripe/billing?action=history&customerId=...
      case 'history': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const customerId = req.query.customerId as string;
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        // Fetch invoices (subscription payments + renewal invoices)
        const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
        const invoiceItems = invoices.data.map(inv => {
          const lineDesc = inv.lines.data[0]?.description;
          return {
            id: inv.id,
            date: inv.created ? new Date(inv.created * 1000).toISOString() : '',
            description: lineDesc || inv.description || 'Subscription payment',
            amount: (inv.amount_paid || 0) / 100,
            invoiceUrl: inv.invoice_pdf || inv.hosted_invoice_url || null,
          };
        });

        // Also fetch direct PaymentIntents (old renewal charges before invoice migration)
        const paymentIntents = await stripe.paymentIntents.list({ customer: customerId, limit: 24 });
        const directCharges = paymentIntents.data
          .filter(pi => pi.status === 'succeeded' && pi.metadata?.type === 'renewal')
          .map(pi => ({
            id: pi.id,
            date: pi.created ? new Date(pi.created * 1000).toISOString() : '',
            description: pi.description || 'Plan Renewal',
            amount: (pi.amount || 0) / 100,
            invoiceUrl: null,
          }));

        // Merge and sort by date descending
        const allItems = [...invoiceItems, ...directCharges]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return res.status(200).json({ invoices: allItems });
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

      // POST /api/stripe/billing?action=delete-payment-method  body: { paymentMethodId }
      case 'delete-payment-method': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { paymentMethodId } = req.body || {};
        if (!paymentMethodId) return res.status(400).json({ error: 'paymentMethodId is required.' });

        await stripe.paymentMethods.detach(paymentMethodId);
        return res.status(200).json({ success: true });
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
        const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
          basic: { monthly: 30, annual: 25 },
          pro: { monthly: 50, annual: 42 },
          pro_plus: { monthly: 70, annual: 60 },
        };
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

        const planNames: Record<string, string> = { basic: 'Basic', pro: 'Pro', pro_plus: 'Pro Plus' };
        const intervalLabel = isAnnual ? 'Annual' : 'Monthly';
        const chargeDescription = `QuickServe ${planNames[planId] || planId} Plan Renewal (${intervalLabel})`;

        // Step 1: Charge the card via PaymentIntent (most reliable)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: totalAmount,
          currency: 'myr',
          customer: renewSub.stripe_customer_id,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: chargeDescription,
          metadata: { restaurant_id: renewRestId, plan_id: planId, type: 'renewal' },
        });

        if (paymentIntent.status !== 'succeeded') {
          return res.status(402).json({
            error: 'Payment failed. Your card was declined. Please try a different card or contact your bank.',
            code: paymentIntent.status,
          });
        }

        // Step 2: Create an invoice for record-keeping (non-blocking)
        try {
          const invoiceItem = await stripe.invoiceItems.create({
            customer: renewSub.stripe_customer_id,
            amount: totalAmount,
            currency: 'myr',
            description: chargeDescription,
          });
          const invoice = await stripe.invoices.create({
            customer: renewSub.stripe_customer_id,
            auto_advance: false,
            metadata: { restaurant_id: renewRestId, plan_id: planId, type: 'renewal' },
          });
          // Mark the invoice as paid (since we already charged via PaymentIntent)
          await stripe.invoices.pay(invoice.id, { paid_out_of_band: true });
        } catch (invoiceErr) {
          // Invoice creation is best-effort — payment already succeeded
          console.warn('Invoice creation failed (payment still succeeded):', invoiceErr);
        }

        // Payment succeeded — extend the subscription period
        const renewFrom = renewSub.current_period_end || renewSub.trial_end;
        let periodStart: Date;
        if (renewFrom) {
          const renewDate = new Date(renewFrom);
          periodStart = renewDate > new Date() ? renewDate : new Date();
        } else {
          periodStart = new Date();
        }
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + (isAnnual ? 365 : 30));

        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('restaurant_id', renewRestId);

        return res.status(200).json({
          success: true,
          newPeriodEnd: periodEnd.toISOString(),
          amountCharged: totalAmount / 100,
          interval: intervalLabel,
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: history, payment-methods, setup-session, delete-payment-method, toggle-auto-renew, renew-direct' });
    }
  } catch (err: any) {
    console.error(`Stripe billing error (${action}):`, err);
    return res.status(500).json({ error: `Billing operation failed: ${action}` });
  }
}
