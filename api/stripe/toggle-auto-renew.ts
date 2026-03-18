// Vercel serverless function: POST /api/stripe/toggle-auto-renew
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscriptionId, cancelAtPeriodEnd } = req.body || {};
  if (!subscriptionId) {
    return res.status(400).json({ error: 'subscriptionId is required.' });
  }

  try {
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !!cancelAtPeriodEnd,
    });
    return res.status(200).json({ success: true, cancelAtPeriodEnd: !!cancelAtPeriodEnd });
  } catch (err: any) {
    console.error('Stripe toggle auto-renew error:', err);
    return res.status(500).json({ error: 'Failed to update subscription.' });
  }
}
