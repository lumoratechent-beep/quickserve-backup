// Vercel serverless function: POST /api/stripe/create-checkout
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { normalizeAdminShopItem } from '../../lib/adminShopOrders.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://anknjpuiklglykguneax.supabase.co',
  supabaseServiceKey
);

// Map plan IDs to Stripe price IDs (set these in env vars)
const PLAN_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC || '',
  pro: process.env.STRIPE_PRICE_PRO || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS || '',
};

// Map plan IDs to Stripe annual price IDs
const PLAN_ANNUAL_PRICE_MAP: Record<string, string> = {
  basic: process.env.STRIPE_PRICE_BASIC_ANNUAL || '',
  pro: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
  pro_plus: process.env.STRIPE_PRICE_PRO_PLUS_ANNUAL || '',
};

// Map plan IDs to Stripe coupon IDs for first-month trial discount
const PLAN_TRIAL_COUPON_MAP: Record<string, string> = {
  basic: process.env.STRIPE_COUPON_BASIC_TRIAL || '',
  pro: process.env.STRIPE_COUPON_PRO_TRIAL || '',
  pro_plus: process.env.STRIPE_COUPON_PRO_PLUS_TRIAL || '',
};

const cleanShopQuantity = (value: any) => Math.max(1, Math.min(99, Math.floor(Number(value) || 1)));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { restaurantId, planId, mode, source, billingInterval, renewFrom, changeType } = req.body || {};
  // mode: 'subscription' (recurring) or 'payment' (one-time month)
  // source: 'upgrade' | 'resume' | 'renew' | undefined (registration)
  // billingInterval: 'monthly' | 'annual' (default: 'monthly')

  // Resume flow: user with incomplete registration — look up plan from DB
  if (source === 'admin_shop') {
    const { items, customer } = req.body || {};
    const requestedItems = Array.isArray(items) ? items : [];
    const customerName = String(customer?.name || '').trim();
    const customerEmail = String(customer?.email || '').trim();
    const customerPhone = String(customer?.phone || '').trim();

    if (requestedItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }
    if (!customerName || !customerEmail || !customerPhone) {
      return res.status(400).json({ error: 'Name, email, and phone are required.' });
    }

    try {
      const quantities = new Map<string, number>();
      requestedItems.forEach((item: any) => {
        const id = String(item?.id || '').trim();
        if (!id) return;
        quantities.set(id, (quantities.get(id) || 0) + cleanShopQuantity(item.quantity));
      });

      const itemIds = Array.from(quantities.keys());
      if (itemIds.length === 0) {
        return res.status(400).json({ error: 'Cart is empty.' });
      }

      const { data, error } = await supabase
        .from('admin_sold_items')
        .select('id, name, sku, description, price, category, is_active, image_url, item_data')
        .in('id', itemIds)
        .eq('is_active', true);
      if (error) throw error;

      const orderItems = (data || [])
        .map((row: any) => normalizeAdminShopItem({ ...row.item_data, imageUrl: row.image_url || row.item_data?.imageUrl }))
        .filter((item: any) => item.id && item.name && item.price > 0)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          description: item.description,
          imageUrl: item.imageUrl,
          category: item.category,
          price: item.price,
          quantity: quantities.get(item.id) || 1,
        }));

      if (orderItems.length === 0) {
        return res.status(400).json({ error: 'No available shop products found.' });
      }

      const total = orderItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
      const now = new Date();
      const orderId = `shop_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');
      const orderData = {
        id: orderId,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          company: String(customer?.company || '').trim(),
          address: String(customer?.address || '').trim(),
          addressDetails: customer?.addressDetails || null,
          notes: String(customer?.notes || '').trim(),
        },
        items: orderItems,
        total,
        currency: 'MYR',
      };

      await supabase.from('admin_shop_orders').insert({
        id: orderId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        company_name: orderData.customer.company,
        total,
        status: 'pending',
        order_data: orderData,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customerEmail,
        line_items: orderItems.map((item: any) => ({
          quantity: item.quantity,
          price_data: {
            currency: 'myr',
            unit_amount: Math.round(item.price * 100),
            product_data: {
              name: item.name,
              description: item.description || undefined,
              images: item.imageUrl ? [item.imageUrl] : undefined,
            },
          },
        })),
        success_url: `${baseUrl}?shop=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}?shop=cancelled`,
        metadata: { source: 'admin_shop', admin_shop_order_id: orderId },
        payment_intent_data: {
          description: `QuickServe shop order ${orderId}`,
          metadata: { source: 'admin_shop', admin_shop_order_id: orderId },
        },
      });

      await supabase
        .from('admin_shop_orders')
        .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      return res.status(200).json({ url: session.url, orderId });
    } catch (err: any) {
      console.error('Admin shop checkout error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to create shop checkout.' });
    }
  }

  if (source === 'resume') {
    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId is required.' });
    }
    // Verify the user is still inactive
    const { data: vendorUser, error: vendorErr } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'VENDOR')
      .single();
    if (vendorErr || !vendorUser) {
      return res.status(404).json({ error: 'No registration found for this restaurant.' });
    }
    if (vendorUser.is_active) {
      return res.status(409).json({ error: 'This account is already active.' });
    }
    // Look up the pending subscription plan
    const { data: pendingSub } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('restaurant_id', restaurantId)
      .single();
    if (!pendingSub?.plan_id) {
      return res.status(404).json({ error: 'No subscription found. Please register again.' });
    }
    planId = pendingSub.plan_id;
    mode = 'subscription';
    billingInterval = billingInterval || 'monthly';
  }

  if (!restaurantId || !planId) {
    return res.status(400).json({ error: 'restaurantId and planId are required.' });
  }

  const isAnnual = billingInterval === 'annual';
  const priceId = isAnnual ? PLAN_ANNUAL_PRICE_MAP[planId] : PLAN_PRICE_MAP[planId];
  if (!priceId) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  try {
    // Get or create Stripe customer
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('restaurant_id', restaurantId)
      .single();

    let customerId = sub?.stripe_customer_id;

    if (!customerId) {
      // Get restaurant & user info for customer creation
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restaurantId)
        .single();

      const { data: user } = await supabase
        .from('users')
        .select('email, username')
        .eq('restaurant_id', restaurantId)
        .eq('role', 'VENDOR')
        .single();

      const customer = await stripe.customers.create({
        name: restaurant?.name || 'QuickServe Customer',
        email: user?.email || undefined,
        metadata: { restaurant_id: restaurantId },
      });
      customerId = customer.id;

      // Save stripe customer ID
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('restaurant_id', restaurantId);
    }

    const baseUrl = (req.headers.origin || req.headers.referer || 'https://quickserve.my').replace(/\/$/, '');

    const successParams = source === 'upgrade'
      ? '?payment=success&source=upgrade&checkout_session_id={CHECKOUT_SESSION_ID}'
      : source === 'renew'
        ? '?payment=success&source=upgrade&checkout_session_id={CHECKOUT_SESSION_ID}'
        : '?payment=success&checkout_session_id={CHECKOUT_SESSION_ID}';
    const cancelParams = (source === 'upgrade' || source === 'renew') ? '?payment=cancelled&source=upgrade' : '?payment=cancelled';

    const planLabel = planId.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const intervalLabel = isAnnual ? 'Annual' : 'Monthly';

    if (mode === 'payment') {
      // One-time payment for renewal/upgrade/downgrade.
      // Stripe Checkout `mode: payment` cannot use recurring prices directly,
      // so we mirror the selected price into a one-time line item.
      const stripePrice = await stripe.prices.retrieve(priceId, { expand: ['product'] });
      const unitAmount = stripePrice.unit_amount;

      if (!unitAmount || unitAmount <= 0) {
        return res.status(400).json({ error: 'Selected plan price is invalid.' });
      }

      const productName = typeof stripePrice.product === 'string'
        ? `QuickServe ${planId.replace('_', ' ').toUpperCase()} Plan`
        : ('name' in stripePrice.product
          ? stripePrice.product.name
          : `QuickServe ${planId.replace('_', ' ').toUpperCase()} Plan`);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: stripePrice.currency,
            unit_amount: unitAmount,
            product_data: {
              name: productName,
            },
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}${successParams}`,
        cancel_url: `${baseUrl}${cancelParams}`,
        payment_intent_data: {
          description: `QuickServe ${planLabel} Plan – ${intervalLabel} (${changeType || source || 'payment'})`,
          metadata: {
            restaurant_id: restaurantId,
            plan_id: planId,
            billing_interval: isAnnual ? 'annual' : 'monthly',
            ...(renewFrom ? { renew_from: renewFrom } : {}),
            ...(changeType ? { change_type: changeType } : {}),
          },
        },
        metadata: {
          restaurant_id: restaurantId,
          plan_id: planId,
          billing_interval: isAnnual ? 'annual' : 'monthly',
          ...(renewFrom ? { renew_from: renewFrom } : {}),
          ...(changeType ? { change_type: changeType } : {}),
        },
      });
      return res.status(200).json({ url: session.url });
    }

    // Only apply trial coupon for new registrations, not for plan changes (upgrade/downgrade)
    const skipTrialCoupon = source === 'upgrade';
    const couponId = skipTrialCoupon ? '' : PLAN_TRIAL_COUPON_MAP[planId];
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}${successParams}`,
      cancel_url: `${baseUrl}${cancelParams}`,
      subscription_data: {
        description: `QuickServe ${planLabel} Plan – ${intervalLabel}`,
        metadata: { restaurant_id: restaurantId, plan_id: planId },
      },
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      payment_method_collection: 'always',
      metadata: { restaurant_id: restaurantId, plan_id: planId, billing_interval: isAnnual ? 'annual' : 'monthly' },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}
