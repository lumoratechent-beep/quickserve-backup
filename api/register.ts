// Vercel serverless function: POST /api/register
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const VALID_PLANS = ['basic', 'pro', 'pro_plus'];
const TRIAL_DAYS = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurantName, ownerName, email, phone, username, password, planId } = req.body || {};

  // Validation
  if (!restaurantName || !ownerName || !email || !phone || !username || !password || !planId) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!VALID_PLANS.includes(planId)) {
    return res.status(400).json({ error: 'Invalid plan selected.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Determine platform access based on plan
    let platformAccess = 'pos_only';
    let kitchenEnabled = false;
    if (planId === 'pro') {
      platformAccess = 'pos_and_qr';
    } else if (planId === 'pro_plus') {
      platformAccess = 'pos_and_qr';
      kitchenEnabled = true;
    }

    // Create restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .insert({
        name: restaurantName,
        logo: '',
        menu: [],
        location_name: 'QuickServe Hub',
        is_online: true,
        platform_access: platformAccess,
        kitchen_enabled: kitchenEnabled,
      })
      .select()
      .single();

    if (restError || !restaurant) {
      console.error('Restaurant creation error:', restError);
      return res.status(500).json({ error: 'Failed to create restaurant.' });
    }

    // Create vendor user
    const { error: userError } = await supabase
      .from('users')
      .insert({
        username,
        password, // Note: In production, hash this with bcrypt
        role: 'VENDOR',
        restaurant_id: restaurant.id,
        is_active: true,
        email,
        phone,
      });

    if (userError) {
      // Cleanup restaurant if user creation fails
      await supabase.from('restaurants').delete().eq('id', restaurant.id);
      console.error('User creation error:', userError);
      return res.status(500).json({ error: 'Failed to create user account.' });
    }

    // Create subscription with trial
    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        restaurant_id: restaurant.id,
        plan_id: planId,
        status: 'trialing',
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString(),
      });

    if (subError) {
      console.error('Subscription creation error:', subError);
      // Not fatal — restaurant and user are created, subscription can be fixed manually
    }

    return res.status(201).json({
      message: 'Registration successful! You can now log in.',
      restaurantId: restaurant.id,
      trialEnd: trialEnd.toISOString(),
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
