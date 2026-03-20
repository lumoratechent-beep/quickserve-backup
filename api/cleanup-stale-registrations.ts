// Vercel serverless function: GET /api/cleanup-stale-registrations
// Deletes incomplete registrations (pending_payment) older than 24 hours.
// Intended to be called by a Vercel cron job.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find stale pending subscriptions (created more than 24 hours ago)
    const { data: staleSubs, error: fetchError } = await supabase
      .from('subscriptions')
      .select('restaurant_id, created_at')
      .eq('status', 'pending_payment')
      .lt('created_at', cutoff);

    if (fetchError) {
      console.error('Error fetching stale subscriptions:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch stale registrations.' });
    }

    if (!staleSubs || staleSubs.length === 0) {
      return res.status(200).json({ message: 'No stale registrations found.', deleted: 0 });
    }

    const restaurantIds = staleSubs.map(s => s.restaurant_id);
    let deletedCount = 0;

    for (const restaurantId of restaurantIds) {
      try {
        // Verify the user is still inactive (don't delete if they completed checkout)
        const { data: user } = await supabase
          .from('users')
          .select('id, is_active')
          .eq('restaurant_id', restaurantId)
          .eq('role', 'VENDOR')
          .single();

        if (user && user.is_active) {
          // User became active (possibly via webhook), skip deletion
          continue;
        }

        // Delete in order: subscription -> user -> restaurant (respecting FK constraints)
        await supabase.from('subscriptions').delete().eq('restaurant_id', restaurantId);

        if (user) {
          await supabase.from('users').delete().eq('id', user.id);
        }

        // Clear vendor_id before deleting restaurant to avoid FK issues
        await supabase.from('restaurants').update({ vendor_id: null }).eq('id', restaurantId);
        await supabase.from('restaurants').delete().eq('id', restaurantId);

        deletedCount++;
        console.log(`Cleaned up stale registration: restaurant ${restaurantId}`);
      } catch (err) {
        console.error(`Failed to cleanup restaurant ${restaurantId}:`, err);
      }
    }

    return res.status(200).json({
      message: `Cleaned up ${deletedCount} stale registration(s).`,
      deleted: deletedCount,
      total_found: restaurantIds.length,
    });
  } catch (err: any) {
    console.error('Cleanup error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
