// Vercel serverless function: /api/stripe/income
// Admin-only endpoint to fetch subscription income from billing_records
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

    // Fetch billing_records (admin extensions) for the date range
    let billingQuery = supabase.from('billing_records').select('*').order('created_at', { ascending: false });
    if (startDate) billingQuery = billingQuery.gte('created_at', new Date(startDate).toISOString());
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      billingQuery = billingQuery.lte('created_at', endOfDay.toISOString());
    }
    const { data: billingRecords, error: billingErr } = await billingQuery;

    if (billingErr) throw new Error(billingErr.message);

    const transactions = (billingRecords || []).map(br => ({
      id: `br_${br.id}`,
      date: br.created_at,
      amount: Number(br.gross) || 0,
      fee: Number(br.fee) || 0,
      net: Number(br.net) || 0,
      currency: 'MYR',
      description: br.description || 'Admin Extension',
      status: 'succeeded',
      restaurantName: br.restaurant_name || '—',
      planId: br.plan_id || null,
      planName: br.plan_id ? (PLAN_LABELS[br.plan_id] || br.plan_id) : '—',
      extensionType: br.type || 'free',
    }));

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
      hasMore: false,
      lastId: null,
    });
  } catch (err: any) {
    console.error('Subscription income error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch income data' });
  }
}
