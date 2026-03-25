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

        const result = [...invoiceEntries, ...chargeEntries]
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

      // GET/POST /api/stripe/billing?action=cleanup-stale
      // Deletes incomplete registrations (pending_payment) older than 24 hours
      case 'cleanup-stale': {
        // Verify cron secret to prevent unauthorized calls
        const authHeader = req.headers.authorization;
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: staleSubs, error: fetchError } = await supabase
          .from('subscriptions')
          .select('restaurant_id, created_at')
          .eq('status', 'pending_payment')
          .lt('created_at', cutoff);

        if (fetchError) {
          console.error('Error fetching stale subscriptions:', fetchError);
          return res.status(500).json({ error: 'Failed to fetch stale registrations.' });
        }

        if (!staleSubs || staleSubs.length === 0) {
          return res.status(200).json({ message: 'No stale registrations found.', deleted: 0 });
        }

        const staleRestaurantIds = staleSubs.map(s => s.restaurant_id);
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
          message: `Cleaned up ${deletedCount} stale registration(s).`,
          deleted: deletedCount,
          total_found: staleRestaurantIds.length,
        });
      }

      default:
        return res.status(400).json({ error: 'Invalid action. Use: history, payment-methods, setup-session, delete-payment-method, toggle-auto-renew, renew-direct, cleanup-stale' });
    }
  } catch (err: any) {
    console.error(`Stripe billing error (${action}):`, err);
    return res.status(500).json({ error: err?.message || `Billing operation failed: ${action}` });
  }
}
