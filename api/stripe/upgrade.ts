// Vercel serverless function: POST /api/stripe/upgrade
// Handles upgrading a subscription to a higher plan
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const PLAN_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS || '',
};

const PLAN_ANNUAL_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC_ANNUAL || '',
  pro: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL || '',
};

const PLAN_PLATFORM_MAP: Record<string, { platformAccess: string; kitchenEnabled: boolean }> = {
  basic: { platformAccess: 'pos_only', kitchenEnabled: false },
  pro: { platformAccess: 'pos_and_qr', kitchenEnabled: false },
  pro_plus: { platformAccess: 'pos_and_qr', kitchenEnabled: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurantId, newPlanId, billingInterval } = req.body || {};

  if (!restaurantId || !newPlanId) {
    return res.status(400).json({ error: 'restaurantId and newPlanId are required.' });
  }

  const isAnnual = billingInterval === 'annual';
  const newPriceId = isAnnual ? PLAN_ANNUAL_PRICE_MAP[newPlanId] : PLAN_PRICE_MAP[newPlanId];
  if (!newPriceId) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, stripe_customer_id, plan_id')
      .eq('restaurant_id', restaurantId)
      .single();

    if (!sub?.stripe_subscription_id) {
      // No active Stripe subscription — redirect to checkout instead
      return res.status(400).json({
        error: 'No active subscription found. Please subscribe first.',
        action: 'checkout',
      });
    }

    // Get current subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const currentItemId = subscription.items.data[0]?.id;

    if (!currentItemId) {
      return res.status(500).json({ error: 'Could not find subscription item.' });
    }

    // Update subscription with new price (prorated)
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{
        id: currentItemId,
        price: newPriceId,
      }],
      proration_behavior: 'create_prorations',
      metadata: { restaurant_id: restaurantId, plan_id: newPlanId },
    });

    // Update local subscription record
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlanId,
        billing_interval: isAnnual ? 'annual' : 'monthly',
        updated_at: new Date().toISOString(),
      })
      .eq('restaurant_id', restaurantId);

    if (subError) {
      console.error('Failed to update subscription in DB:', subError);
      return res.status(500).json({ error: 'Stripe updated but failed to save plan change. Please refresh or contact support.' });
    }

    // Update restaurant features based on new plan
    if (PLAN_PLATFORM_MAP[newPlanId]) {
      const { platformAccess, kitchenEnabled } = PLAN_PLATFORM_MAP[newPlanId];
      const { error: resError } = await supabase
        .from('restaurants')
        .update({ platform_access: platformAccess, kitchen_enabled: kitchenEnabled })
        .eq('id', restaurantId);

      if (resError) {
        console.error('Failed to update restaurant features in DB:', resError);
      }
    }

    const updatedItem = updated.items.data[0];
    const periodEnd = updatedItem?.current_period_end
      ? new Date(updatedItem.current_period_end * 1000).toISOString()
      : new Date().toISOString();

    return res.status(200).json({
      message: `Plan upgraded to ${newPlanId}`,
      currentPeriodEnd: periodEnd,
    });
  } catch (err: any) {
    console.error('Upgrade error:', err);
    return res.status(500).json({ error: 'Failed to upgrade plan.' });
  }
}
