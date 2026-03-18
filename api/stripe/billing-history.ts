// Vercel serverless function: GET /api/stripe/billing-history
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const customerId = req.query.customerId as string;
  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required.' });
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });

    const result = invoices.data.map(inv => ({
      id: inv.id,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : '',
      description: inv.lines.data[0]?.description || `${inv.lines.data[0]?.plan?.nickname || 'Subscription'} payment`,
      amount: (inv.amount_paid || 0) / 100,
      invoiceUrl: inv.invoice_pdf || inv.hosted_invoice_url || null,
    }));

    return res.status(200).json({ invoices: result });
  } catch (err: any) {
    console.error('Stripe billing history error:', err);
    return res.status(500).json({ error: 'Failed to fetch billing history.' });
  }
}
