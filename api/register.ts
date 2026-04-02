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

    let kitchenEnabled = false;
    if (planId === 'pro_plus') {
      kitchenEnabled = true;
    }

    // Create restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('restaurants')
      .insert({
        name: restaurantName,
        logo: '',
        vendor_id: null,
        location_name: 'QuickServe Hub',
        is_online: true,
        settings: {},
        kitchen_enabled: kitchenEnabled,
        slug: null,
      })
      .select()
      .single();

    if (restError || !restaurant) {
      console.error('Restaurant creation error:', restError);
      return res.status(500).json({ error: 'Failed to create restaurant.' });
    }

    // Create vendor user (inactive until Stripe card is saved)
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        username,
        password,
        role: 'VENDOR',
        restaurant_id: restaurant.id,
        is_active: false,
        email,
        phone,
      })
      .select('id')
      .single();

    if (userError || !newUser) {
      // Cleanup restaurant if user creation fails
      await supabase.from('restaurants').delete().eq('id', restaurant.id);
      console.error('User creation error:', userError);
      return res.status(500).json({ error: 'Failed to create user account.' });
    }

    // Link vendor back to restaurant
    await supabase.from('restaurants').update({ vendor_id: newUser.id }).eq('id', restaurant.id);

    // Create subscription as pending_payment (activated by Stripe webhook after card saved)
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        restaurant_id: restaurant.id,
        plan_id: planId,
        status: 'pending_payment',
      });

    if (subError) {
      console.error('Subscription creation error:', subError);
      // Not fatal — restaurant and user are created, subscription can be fixed manually
    }

    return res.status(201).json({
      message: 'Registration successful! Please complete card setup.',
      restaurantId: restaurant.id,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
