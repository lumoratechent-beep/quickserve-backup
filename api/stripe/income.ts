// Vercel serverless function: /api/stripe/income
// Admin-only endpoint to fetch all Stripe income and transactions
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

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

    const transactions = balanceTransactions.data.map(txn => ({
      id: txn.id,
      date: new Date(txn.created * 1000).toISOString(),
      amount: txn.amount / 100,
      fee: txn.fee / 100,
      net: txn.net / 100,
      currency: txn.currency.toUpperCase(),
      description: txn.description || 'Payment',
      status: txn.status,
      source: txn.source,
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
      hasMore: balanceTransactions.has_more,
      lastId: transactions.length > 0 ? transactions[transactions.length - 1].id : null,
    });
  } catch (err: any) {
    console.error('Stripe income error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch income data' });
  }
}
