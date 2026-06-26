import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { ensureAdminShopQuotationForSession } from '../../lib/adminShopOrders.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

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
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

    if (session.metadata?.source !== 'admin_shop') {
      return res.status(400).json({ error: 'This checkout session is not a QuickServe shop order.' });
    }
    if (session.status !== 'complete' || session.payment_status !== 'paid') {
      return res.status(409).json({
        error: 'Checkout session is not paid yet.',
        status: session.status,
        paymentStatus: session.payment_status,
      });
    }

    const quote = await ensureAdminShopQuotationForSession(supabase, session);
    return res.status(200).json({ success: true, quoteId: quote.id, quoteNo: quote.quoteNo });
  } catch (err: any) {
    console.error('Confirm admin shop checkout error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to confirm shop checkout.' });
  }
}
