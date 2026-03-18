// Vercel serverless function: /api/stripe/billing
// Consolidated billing endpoint — dispatches by ?action= query param
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  try {
    switch (action) {
      // GET /api/stripe/billing?action=history&customerId=...
      case 'history': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const customerId = req.query.customerId as string;
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });
        const result = invoices.data.map(inv => {
          const lineDesc = inv.lines.data[0]?.description;
          return {
            id: inv.id,
            date: inv.created ? new Date(inv.created * 1000).toISOString() : '',
            description: lineDesc || inv.description || 'Subscription payment',
            amount: (inv.amount_paid || 0) / 100,
            invoiceUrl: inv.invoice_pdf || inv.hosted_invoice_url || null,
          };
        });
        return res.status(200).json({ invoices: result });
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

      // POST /api/stripe/billing?action=setup-session  body: { customerId, restaurantId }
      case 'setup-session': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const { customerId, restaurantId } = req.body || {};
        if (!customerId) return res.status(400).json({ error: 'customerId is required.' });

        const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'setup',
          payment_method_types: ['card'],
          success_url: `${baseUrl}?setup=success`,
          cancel_url: `${baseUrl}?setup=cancelled`,
          metadata: { restaurant_id: restaurantId || '' },
        });
        return res.status(200).json({ url: session.url });
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

      default:
        return res.status(400).json({ error: 'Invalid action. Use: history, payment-methods, setup-session, delete-payment-method, toggle-auto-renew' });
    }
  } catch (err: any) {
    console.error(`Stripe billing error (${action}):`, err);
    return res.status(500).json({ error: `Billing operation failed: ${action}` });
  }
}
