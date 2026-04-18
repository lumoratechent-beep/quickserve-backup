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
      const endOfDay = new Date(endDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      listParams.created = { ...(listParams.created as Record<string, number> || {}), lte: Math.floor(endOfDay.getTime() / 1000) };
    }
    if (startingAfter) {
      listParams.starting_after = startingAfter;
    }

    const balanceTransactions = await stripe.balanceTransactions.list(listParams);

    // Collect unique restaurant IDs from charge metadata to batch-lookup names
    const restaurantIds = new Set<string>();
    const chargeDataMap = new Map<string, { restaurantId?: string; planId?: string; customerName?: string; chargeStatus?: string }>();

    // Helper to extract charge metadata, falling back to Stripe customer metadata
    const extractChargeData = async (charge: Stripe.Charge) => {
      let restaurantId: string | undefined = charge.metadata?.restaurant_id;
      let planId: string | undefined = charge.metadata?.plan_id;

      // Fallback: look up restaurant_id from Stripe customer metadata (for subscription-mode charges)
      if (!restaurantId && charge.customer) {
        const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer.id;
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && !customer.deleted) {
            restaurantId = customer.metadata?.restaurant_id || undefined;
            planId = planId || customer.metadata?.plan_id || undefined;
          }
        } catch { /* skip */ }

        // If still no restaurant_id, look up from subscriptions table via stripe_customer_id
        if (!restaurantId) {
          const { data: subRow } = await supabase
            .from('subscriptions')
            .select('restaurant_id, plan_id')
            .eq('stripe_customer_id', customerId)
            .single();
          if (subRow) {
            restaurantId = subRow.restaurant_id;
            planId = planId || subRow.plan_id;
          }
        }
      }

      if (restaurantId) restaurantIds.add(restaurantId);
      return {
        restaurantId: restaurantId || undefined,
        planId: planId || undefined,
        customerName: charge.billing_details?.name || undefined,
        chargeStatus: charge.status || undefined,
      };
    };

    for (const txn of balanceTransactions.data) {
      const source = txn.source;
      if (source && typeof source === 'object' && 'metadata' in source) {
        const charge = source as Stripe.Charge;
        chargeDataMap.set(txn.id, await extractChargeData(charge));
      } else if (source && typeof source === 'string' && source.startsWith('ch_')) {
        // Source not expanded — fetch the charge individually
        try {
          const charge = await stripe.charges.retrieve(source);
          chargeDataMap.set(txn.id, await extractChargeData(charge));
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
        extensionType: null as string | null,
      };
    });

    // Fetch billing_records (admin extensions) for the same date range
    let billingQuery = supabase.from('billing_records').select('*').order('created_at', { ascending: false });
    if (startDate) billingQuery = billingQuery.gte('created_at', new Date(startDate).toISOString());
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      billingQuery = billingQuery.lte('created_at', endOfDay.toISOString());
    }
    const { data: billingRecords } = await billingQuery;

    // Merge billing_records into the transactions list
    if (billingRecords && billingRecords.length > 0) {
      for (const br of billingRecords) {
        transactions.push({
          id: `br_${br.id}`,
          date: br.created_at,
          amount: Number(br.gross) || 0,
          fee: Number(br.fee) || 0,
          net: Number(br.net) || 0,
          currency: 'MYR',
          description: br.description || 'Admin Extension',
          status: 'succeeded',
          source: null,
          restaurantName: br.restaurant_name || '—',
          planId: br.plan_id || null,
          planName: br.plan_id ? (PLAN_LABELS[br.plan_id] || br.plan_id) : '—',
          extensionType: br.type || 'free',
        });
      }
    }

    // Sort all transactions by date descending
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
