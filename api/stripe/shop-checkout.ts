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

const cleanQuantity = (value: any) => Math.max(1, Math.min(99, Math.floor(Number(value) || 1)));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not configured.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      quantities.set(id, (quantities.get(id) || 0) + cleanQuantity(item.quantity));
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

    const products = (data || [])
      .map((row: any) => normalizeAdminShopItem({ ...row.item_data, imageUrl: row.image_url || row.item_data?.imageUrl }))
      .filter((item: any) => item.id && item.name && item.price > 0);

    if (products.length === 0) {
      return res.status(400).json({ error: 'No available shop products found.' });
    }

    const orderItems = products.map((item: any) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      imageUrl: item.imageUrl,
      category: item.category,
      price: item.price,
      quantity: quantities.get(item.id) || 1,
    }));

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
      metadata: {
        source: 'admin_shop',
        admin_shop_order_id: orderId,
      },
      payment_intent_data: {
        description: `QuickServe shop order ${orderId}`,
        metadata: {
          source: 'admin_shop',
          admin_shop_order_id: orderId,
        },
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
