import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const buckets = new Map<string, { startedAt: number; count: number }>();

const rateLimit = (req: VercelRequest, res: VercelResponse): boolean => {
  const address = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  let bucket = buckets.get(address);
  if (!bucket || now - bucket.startedAt > 60_000) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(address, bucket);
  if (bucket.count <= 60) return true;
  res.setHeader('Retry-After', '60');
  res.status(429).json({ error: 'Too many receipt requests. Please wait and try again.' });
  return false;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  if (!rateLimit(req, res)) return;

  const token = String(Array.isArray(req.query.token) ? req.query.token[0] : req.query.token || '').trim();
  if (!UUID_PATTERN.test(token)) return res.status(404).json({ error: 'Receipt not found.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('E-receipt API requires SUPABASE_URL and SUPABASE_SERVICE_KEY.');
    return res.status(503).json({ error: 'Receipt service is temporarily unavailable.' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('e_receipts')
    .select('snapshot,created_at,expires_at,revoked_at')
    .eq('id', token)
    .maybeSingle();

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (error) {
    console.error('E-receipt lookup failed:', error.message);
    return res.status(500).json({ error: 'Unable to load this receipt.' });
  }
  if (!data || data.revoked_at) return res.status(404).json({ error: 'Receipt not found.' });
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ error: 'This e-receipt has expired. E-receipts are available for 60 days after payment.' });
  }

  return res.status(200).json({
    receipt: data.snapshot,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
  });
}

