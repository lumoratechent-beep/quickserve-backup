// Vercel serverless function: /api/stripe/income
// Admin-only endpoint to fetch all Stripe income and transactions
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  pro_plus: 'Pro Plus',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
    const startingAfter = req.query.startingAfter as string | undefined;

    const listParams: Stripe.BalanceTransactionListParams = {
      limit,
      type: 'charge',
      expand: ['data.source'],
    };

    if (startDate) {
      listParams.created = { ...(listParams.created as Record<string, number> || {}), gte: Math.floor(new Date(startDate).getTime() / 1000) };
    }
    if (endDate) {
      listParams.created = { ...(listParams.created as Record<string, number> || {}), lte: Math.floor(new Date(endDate).getTime() / 1000) };
    }
    if (startingAfter) {
      listParams.starting_after = startingAfter;
    }

    const balanceTransactions = await stripe.balanceTransactions.list(listParams);

    // Collect unique restaurant IDs from charge metadata to batch-lookup names
    const restaurantIds = new Set<string>();
    const chargeDataMap = new Map<string, { restaurantId?: string; planId?: string; customerName?: string; chargeStatus?: string }>();

    for (const txn of balanceTransactions.data) {
      const source = txn.source;
      if (source && typeof source === 'object' && 'metadata' in source) {
        const charge = source as Stripe.Charge;
        const restaurantId = charge.metadata?.restaurant_id;
        const planId = charge.metadata?.plan_id;
        if (restaurantId) restaurantIds.add(restaurantId);
        chargeDataMap.set(txn.id, {
          restaurantId: restaurantId || undefined,
          planId: planId || undefined,
          customerName: charge.billing_details?.name || undefined,
          chargeStatus: charge.status || undefined,
        });
      } else if (source && typeof source === 'string' && source.startsWith('ch_')) {
        // Source not expanded — fetch the charge individually
        try {
          const charge = await stripe.charges.retrieve(source);
          const restaurantId = charge.metadata?.restaurant_id;
          const planId = charge.metadata?.plan_id;
          if (restaurantId) restaurantIds.add(restaurantId);
          chargeDataMap.set(txn.id, {
            restaurantId: restaurantId || undefined,
            planId: planId || undefined,
            customerName: charge.billing_details?.name || undefined,
            chargeStatus: charge.status || undefined,
          });
        } catch { /* skip */ }
      }
    }

    // Batch-fetch restaurant names from Supabase
    const restaurantNames: Record<string, string> = {};
    if (restaurantIds.size > 0) {
      const { data: restaurants } = await supabase
        .from('restaurants')
        .select('id, name')
        .in('id', Array.from(restaurantIds));
      if (restaurants) {
        for (const r of restaurants) {
          restaurantNames[r.id] = r.name;
        }
      }
    }

    const transactions = balanceTransactions.data.map(txn => {
      const meta = chargeDataMap.get(txn.id);
      return {
        id: txn.id,
        date: new Date(txn.created * 1000).toISOString(),
        amount: txn.amount / 100,
        fee: txn.fee / 100,
        net: txn.net / 100,
        currency: txn.currency.toUpperCase(),
        description: txn.description || 'Payment',
        status: meta?.chargeStatus || (txn.status === 'available' ? 'succeeded' : txn.status),
        source: typeof txn.source === 'string' ? txn.source : (txn.source as any)?.id || null,
        restaurantName: meta?.restaurantId ? (restaurantNames[meta.restaurantId] || meta.customerName || 'Unknown') : (meta?.customerName || '—'),
        planId: meta?.planId || null,
        planName: meta?.planId ? (PLAN_LABELS[meta.planId] || meta.planId) : '—',
      };
    });

    const totalGross = transactions.reduce((s, t) => s + t.amount, 0);
    const totalFees = transactions.reduce((s, t) => s + t.fee, 0);
    const totalNet = transactions.reduce((s, t) => s + t.net, 0);

    return res.status(200).json({
      transactions,
      summary: {
        totalGross: Math.round(totalGross * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        count: transactions.length,
      },
      hasMore: balanceTransactions.has_more,
      lastId: transactions.length > 0 ? transactions[transactions.length - 1].id : null,
    });
  } catch (err: any) {
    console.error('Stripe income error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch income data' });
  }
}
