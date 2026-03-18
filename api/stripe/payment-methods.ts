// Vercel serverless function: GET /api/stripe/payment-methods
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const customerId = req.query.customerId as string;
  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required.' });
  }

  try {
    // Get customer's default payment method
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;

    // List all cards
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

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
  } catch (err: any) {
    console.error('Stripe payment methods error:', err);
    return res.status(500).json({ error: 'Failed to fetch payment methods.' });
  }
}
