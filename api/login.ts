
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://thqocawdihcsvtkluddy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRocW9jYXdkaWhjc3Z0a2x1ZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDMwODMsImV4cCI6MjA4NjMxOTA4M30.qecVHx2IaW8dOdzHNS3K7d-2hBwvh7EMI9pOP4crMjQ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS if needed, but same-origin should be fine
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, restaurant_id, is_active, email, phone, password')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (data.is_active === false) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    // Map to camelCase to match frontend User interface
    const userResponse = {
      id: data.id,
      username: data.username,
      role: data.role,
      restaurantId: data.restaurant_id,
      isActive: data.is_active,
      email: data.email,
      phone: data.phone
    };

    return res.status(200).json(userResponse);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
