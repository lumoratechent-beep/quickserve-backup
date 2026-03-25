import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

  const { restaurantId } = req.body || {};
  if (!restaurantId) {
    return res.status(400).json({ error: 'restaurantId is required.' });
  }

  try {
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('plan_id, billing_interval, pending_plan_id, pending_billing_interval, pending_change_effective_at, current_period_start')
      .eq('restaurant_id', restaurantId)
      .single();

    if (subErr || !sub) {
      return res.status(404).json({ error: 'Subscription not found.' });
    }

    let plan = sub.plan_id;
    const now = new Date();

    if (sub.pending_plan_id) {
      const effectiveAtRaw = sub.pending_change_effective_at || sub.current_period_start;
      const effectiveAt = effectiveAtRaw ? new Date(effectiveAtRaw) : null;

      if (effectiveAt && effectiveAt > now) {
        return res.status(200).json({ updated: false, reason: 'before_effective_start' });
      }

      // Calculate the new period for the downgraded plan
      const pendingInterval = sub.pending_billing_interval || sub.billing_interval;
      const pendingDurationDays = pendingInterval === 'annual' ? 365 : 30;
      const newPeriodStart = effectiveAt || now;
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setDate(newPeriodEnd.getDate() + pendingDurationDays);

      const { error: promoteErr } = await supabase
        .from('subscriptions')
        .update({
          plan_id: sub.pending_plan_id,
          billing_interval: pendingInterval,
          current_period_start: newPeriodStart.toISOString(),
          current_period_end: newPeriodEnd.toISOString(),
          pending_plan_id: null,
          pending_billing_interval: null,
          pending_change_effective_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', restaurantId);

      if (promoteErr) {
        return res.status(500).json({ error: 'Failed to activate pending plan change.' });
      }

      plan = sub.pending_plan_id;
    }

    if (!plan || !PLAN_PLATFORM_MAP[plan]) {
      return res.status(400).json({ error: 'Invalid plan in subscription.' });
    }

    const target = PLAN_PLATFORM_MAP[plan];

    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('platform_access, kitchen_enabled')
      .eq('id', restaurantId)
      .single();

    if (restErr || !restaurant) {
      return res.status(404).json({ error: 'Restaurant not found.' });
    }

    const alreadyApplied =
      restaurant.platform_access === target.platformAccess &&
      restaurant.kitchen_enabled === target.kitchenEnabled;

    if (alreadyApplied) {
      return res.status(200).json({ updated: false, reason: 'already_synced' });
    }

    const { error: updateErr } = await supabase
      .from('restaurants')
      .update({ platform_access: target.platformAccess, kitchen_enabled: target.kitchenEnabled })
      .eq('id', restaurantId);

    if (updateErr) {
      return res.status(500).json({ error: 'Failed to update restaurant access.' });
    }

    return res.status(200).json({ updated: true, plan });
  } catch (err: any) {
    console.error('Reconcile access error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to reconcile access.' });
  }
}
