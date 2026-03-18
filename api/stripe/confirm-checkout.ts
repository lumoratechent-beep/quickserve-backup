import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

const PLAN_PLATFORM_MAP: Record<string, { platformAccess: string; kitchenEnabled: boolean }> = {
  basic: { platformAccess: 'pos_only', kitchenEnabled: false },
  pro: { platformAccess: 'pos_and_qr', kitchenEnabled: false },
  pro_plus: { platformAccess: 'pos_and_qr', kitchenEnabled: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { checkoutSessionId } = req.body || {};

  if (!checkoutSessionId) {
    return res.status(400).json({ error: 'checkoutSessionId is required.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['subscription'],
    });

    if (session.status !== 'complete') {
      return res.status(409).json({
        error: 'Checkout session is not completed yet.',
        status: session.status,
      });
    }

    const restaurantId = session.metadata?.restaurant_id;
    const planId = session.metadata?.plan_id;
    const billingInterval = session.metadata?.billing_interval || 'monthly';

    if (!restaurantId) {
      return res.status(400).json({ error: 'Missing restaurant_id metadata in checkout session.' });
    }

    if (session.mode === 'subscription' && session.subscription) {
      const subscription = typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

      const statusMap: Record<string, string> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'canceled',
        unpaid: 'unpaid',
        incomplete: 'pending_payment',
        incomplete_expired: 'canceled',
      };

      const subItem = subscription.items.data[0];
      const periodStart = subItem?.current_period_start
        ? new Date(subItem.current_period_start * 1000).toISOString()
        : new Date(subscription.start_date * 1000).toISOString();
      const periodEnd = subItem?.current_period_end
        ? new Date(subItem.current_period_end * 1000).toISOString()
        : null;

      const subUpdate: Record<string, any> = {
        status: statusMap[subscription.status] || subscription.status,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        billing_interval: billingInterval,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      };

      if (planId) {
        subUpdate.plan_id = planId;
      }

      if (subscription.status === 'trialing') {
        subUpdate.trial_start = new Date().toISOString();
        subUpdate.trial_end = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;
      }

      await supabase
        .from('subscriptions')
        .update(subUpdate)
        .eq('restaurant_id', restaurantId);

      await supabase
        .from('users')
        .update({ is_active: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'VENDOR');
    } else if (session.mode === 'payment') {
      const renewFrom = session.metadata?.renew_from;
      let periodStart: Date;
      if (renewFrom) {
        const renewDate = new Date(renewFrom);
        periodStart = renewDate > new Date() ? renewDate : new Date();
      } else {
        periodStart = new Date();
      }
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 30);

      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          ...(planId ? { plan_id: planId } : {}),
          billing_interval: billingInterval,
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', restaurantId);
    }

    if (planId && PLAN_PLATFORM_MAP[planId]) {
      const { platformAccess, kitchenEnabled } = PLAN_PLATFORM_MAP[planId];
      await supabase
        .from('restaurants')
        .update({ platform_access: platformAccess, kitchen_enabled: kitchenEnabled })
        .eq('id', restaurantId);
    }

    return res.status(200).json({
      success: true,
      restaurantId,
      planId: planId || null,
      mode: session.mode,
    });
  } catch (err: any) {
    console.error('Confirm checkout error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to confirm checkout.' });
  }
}
