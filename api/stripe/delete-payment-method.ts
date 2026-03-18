// Vercel serverless function: POST /api/stripe/delete-payment-method
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentMethodId } = req.body || {};
  if (!paymentMethodId) {
    return res.status(400).json({ error: 'paymentMethodId is required.' });
  }

  try {
    await stripe.paymentMethods.detach(paymentMethodId);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Stripe delete payment method error:', err);
    return res.status(500).json({ error: 'Failed to remove payment method.' });
  }
}
