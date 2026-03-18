// Vercel serverless function: POST /api/stripe/create-checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Map plan IDs to Stripe price IDs (set these in env vars)
const PLAN_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS || '',
};

// Map plan IDs to Stripe annual price IDs
const PLAN_ANNUAL_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC_ANNUAL || '',
  pro: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL || '',
};

// Map plan IDs to Stripe coupon IDs for first-month trial discount
const PLAN_TRIAL_COUPON_MAP: Record<string, string> = {
  basic: process.env.STRIPE_COUPON_BASIC_TRIAL || '',
  pro: process.env.STRIPE_COUPON_PRO_TRIAL || '',
  pro_plus: process.env.STRIPE_COUPON_PRO_PLUS_TRIAL || '',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurantId, planId, mode, source, billingInterval, renewFrom } = req.body || {};
  // mode: 'subscription' (recurring) or 'payment' (one-time month)
  // source: 'upgrade' (from in-app upgrade/downgrade modal) or undefined (registration)
  // billingInterval: 'monthly' | 'annual' (default: 'monthly')

  if (!restaurantId || !planId) {
    return res.status(400).json({ error: 'restaurantId and planId are required.' });
  }

  const isAnnual = billingInterval === 'annual';
  const priceId = isAnnual ? PLAN_ANNUAL_PRICE_MAP[planId] : PLAN_PRICE_MAP[planId];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  try {
    // Get or create Stripe customer
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('restaurant_id', restaurantId)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      // Get restaurant & user info for customer creation
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

      // Save stripe customer ID
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('restaurant_id', restaurantId);
    }

    const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');

    const successParams = source === 'upgrade' ? '?payment=success&source=upgrade' : source === 'renew' ? '?payment=success&source=upgrade' : '?payment=success';
    const cancelParams = (source === 'upgrade' || source === 'renew') ? '?payment=cancelled&source=upgrade' : '?payment=cancelled';

    if (mode === 'payment') {
      // One-time payment for a single month
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}${successParams}`,
        cancel_url: `${baseUrl}${cancelParams}`,
        metadata: { restaurant_id: restaurantId, plan_id: planId, ...(renewFrom ? { renew_from: renewFrom } : {}) },
      });
      return res.status(200).json({ url: session.url });
    }

    // Only apply trial coupon for new registrations, not for plan changes (upgrade/downgrade)
    const skipTrialCoupon = source === 'upgrade';
    const couponId = skipTrialCoupon ? '' : PLAN_TRIAL_COUPON_MAP[planId];
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}${successParams}`,
      cancel_url: `${baseUrl}${cancelParams}`,
      subscription_data: {
        metadata: { restaurant_id: restaurantId, plan_id: planId },
      },
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      payment_method_collection: 'always',
      metadata: { restaurant_id: restaurantId, plan_id: planId },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}
