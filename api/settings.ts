import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { restaurantId } = req.query;

  if (!restaurantId || typeof restaurantId !== 'string') {
    return res.status(400).json({ error: 'restaurantId is required' });
  }

  try {
    if (req.method === 'GET') {
      // Fetch current restaurant settings
      const { data, error } = await supabase
        .from('restaurants')
        .select('settings, name, id')
        .eq('id', restaurantId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      return res.status(200).json({
        id: data.id,
        name: data.name,
        settings: data.settings || {},
      });
    } else if (req.method === 'POST') {
      // Update restaurant settings
      const { settings } = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
      }

      const { error } = await supabase
        .from('restaurants')
        .update({ settings })
        .eq('id', restaurantId);

      if (error) {
        console.error('Settings update error:', error);
        return res.status(500).json({ error: 'Failed to update settings' });
      }

      return res.status(200).json({ success: true, settings });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Settings endpoint error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
