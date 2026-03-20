// Vercel serverless function: POST /api/stripe/resume-checkout
// Allows users with incomplete registration to resume Stripe checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

// Map plan IDs to Stripe price IDs
const PLAN_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS || '',
};

// Map plan IDs to Stripe coupon IDs for first-month trial discount
const PLAN_TRIAL_COUPON_MAP: Record<string, string> = {
  basic: process.env.STRIPE_COUPON_BASIC_TRIAL || '',
  pro: process.env.STRIPE_COUPON_PRO_TRIAL || '',
  pro_plus: process.env.STRIPE_COUPON_PRO_PLUS_TRIAL || '',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurantId } = req.body || {};

  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required.' });
  }

  try {
    // Verify the restaurant exists and user is still inactive
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, username, is_active')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'VENDOR')
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'No registration found for this restaurant.' });
    }

    if (user.is_active) {
      return res.status(409).json({ error: 'This account is already active.' });
    }

    // Get the pending subscription to find plan and customer
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('plan_id, stripe_customer_id, status')
      .eq('restaurant_id', restaurantId)
      .single();

    if (subError || !sub) {
      return res.status(404).json({ error: 'No subscription found. Please register again.' });
    }

    const planId = sub.plan_id;
    const priceId = PLAN_PRICE_MAP[planId];

    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan in subscription.' });
    }

    // Get or create Stripe customer
    let customerId = sub.stripe_customer_id;

    if (!customerId) {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restaurantId)
        .single();

      const customer = await stripe.customers.create({
        name: restaurant?.name || 'QuickServe Customer',
        email: user.email || undefined,
        metadata: { restaurant_id: restaurantId },
      });
      customerId = customer.id;

      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('restaurant_id', restaurantId);
    }

    const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');
    const couponId = PLAN_TRIAL_COUPON_MAP[planId];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}?payment=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}?payment=cancelled`,
      subscription_data: {
        metadata: { restaurant_id: restaurantId, plan_id: planId },
      },
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      payment_method_collection: 'always',
      metadata: { restaurant_id: restaurantId, plan_id: planId, billing_interval: 'monthly' },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Resume checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}
