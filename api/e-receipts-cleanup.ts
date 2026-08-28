import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: 'Receipt cleanup is not configured.' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { error, count } = await supabase
    .from('e_receipts')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString());

  if (error) return res.status(500).json({ error: 'Cleanup failed.' });
  return res.status(200).json({ success: true, deleted: count || 0 });
}

