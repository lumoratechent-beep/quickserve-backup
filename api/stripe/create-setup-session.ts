// Vercel serverless function: POST /api/stripe/create-setup-session
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId, restaurantId } = req.body || {};

  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required.' });
  }

  try {
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
  } catch (err: any) {
    console.error('Stripe setup session error:', err);
    return res.status(500).json({ error: 'Failed to create setup session.' });
  }
}
