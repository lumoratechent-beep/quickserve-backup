import express from 'express';
import { createServer as createViteServer } from 'vite';
import { put } from '@vercel/blob';
import multer from 'multer';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { ensureAdminShopQuotationForSession, normalizeAdminShopItem } from './lib/adminShopOrders.js';
import {
  buildAdminDashboardAnalyticsFallback,
  isDashboardRpcUnavailable,
} from './lib/adminDashboardAnalytics.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY || supabaseAnonKey
  );
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

  // Configure Multer for memory storage
  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/login', async (req, res) => {
    console.log('Login attempt for:', req.body?.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, restaurant_id, is_active, email, phone, password, kitchen_categories')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        console.log('Login failed for:', username);
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (data.is_active === false) {
        console.log('Account deactivated for:', username);
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
        phone: data.phone,
        kitchenCategories: data.kitchen_categories || undefined,
      };
      
      console.log('Login successful for:', username);
      res.json(userResponse);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/orders/report', async (req, res) => {
    const {
      restaurantId, startDate, endDate, status, search, page = 1, limit = 30,
      locationName, timezoneOffsetMinutes, includeSummary = 'true', includeBreakdowns = 'true', includeItems = 'true', mode,
      export: exportMode = 'false',
    } = req.query;
    const batchSize = 1000;
    const start = (Number(page) - 1) * Number(limit);
    const end = start + Number(limit) - 1;
    const tzOffset = timezoneOffsetMinutes ? Number(timezoneOffsetMinutes) : 0;
    const syncCursor = new Date().toISOString();
    const getDateBoundary = (value: unknown, endOfDay: boolean) => {
      const [year, month, day] = String(value).split('-').map(Number);
      return Date.UTC(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      ) + (tzOffset * 60000);
    };
    const mapOrder = (o: any) => ({
      id: o.id,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []),
      total: Number(o.total || 0),
      status: o.status,
      timestamp: Number(o.timestamp),
      customerId: o.customer_id,
      restaurantId: o.restaurant_id,
      tableNumber: o.table_number,
      diningType: o.dining_type || undefined,
      locationName: o.location_name,
      remark: o.remark,
      rejectionReason: o.rejection_reason,
      rejectionNote: o.rejection_note,
      paymentMethod: o.payment_method,
      cashierName: o.cashier_name,
      amountReceived: o.amount_received != null ? Number(o.amount_received) : undefined,
      changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined,
      orderSource: o.order_source || undefined,
      updatedAt: o.updated_at || undefined,
    });
    try {
      const reportStartTimestamp = startDate ? getDateBoundary(startDate, false) : null;
      const reportEndTimestamp = endDate ? getDateBoundary(endDate, true) : null;
      if ((reportStartTimestamp !== null && !Number.isFinite(reportStartTimestamp))
        || (reportEndTimestamp !== null && !Number.isFinite(reportEndTimestamp))) {
        return res.status(400).json({ error: 'Invalid report date range' });
      }
      if ((mode === 'summary' || mode === 'dashboard' || includeSummary !== 'false' || exportMode === 'true')
        && (reportStartTimestamp === null || reportEndTimestamp === null)) {
        return res.status(400).json({ error: 'A start date and end date are required' });
      }
      if (reportStartTimestamp !== null && reportEndTimestamp !== null
        && (reportEndTimestamp < reportStartTimestamp || reportEndTimestamp - reportStartTimestamp > 366 * 24 * 60 * 60 * 1000)) {
        return res.status(400).json({ error: 'Report date ranges are limited to 366 days' });
      }

      if (mode === 'dashboard') {
        if (!startDate || !endDate) return res.status(400).json({ error: 'Dashboard analytics require a date range' });
        const { data, error } = await supabase.rpc('get_admin_dashboard_analytics', {
          p_start_timestamp: reportStartTimestamp,
          p_end_timestamp: reportEndTimestamp,
          p_timezone_offset_minutes: tzOffset,
        });
        if (error && !isDashboardRpcUnavailable(error)) throw error;
        const dashboardData = error
          ? await buildAdminDashboardAnalyticsFallback(supabase, reportStartTimestamp!, reportEndTimestamp!, tzOffset)
          : data;
        res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
        return res.json(dashboardData);
      }

      if (mode === 'summary') {
        const { data, error } = await supabase.rpc('get_order_report_summary', {
          p_start_timestamp: startDate ? getDateBoundary(startDate, false) : null,
          p_end_timestamp: endDate ? getDateBoundary(endDate, true) : null,
          p_restaurant_id: restaurantId && restaurantId !== 'ALL' ? restaurantId : null,
          p_location_name: locationName && locationName !== 'ALL' ? locationName : null,
          p_status: status && status !== 'ALL' ? status : null,
          p_search: search ? String(search).trim() || null : null,
          p_include_breakdowns: includeBreakdowns !== 'false',
        });
        if (error) throw error;
        res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
        return res.json(data);
      }

      const applyFilters = (query: any) => {
        if (restaurantId && restaurantId !== 'ALL') query = query.eq('restaurant_id', restaurantId);
        if (locationName && locationName !== 'ALL') query = query.eq('location_name', locationName);
        if (status && status !== 'ALL') query = query.eq('status', status);
        if (startDate) {
          query = query.gte('timestamp', getDateBoundary(startDate, false));
        }
        if (endDate) {
          query = query.lte('timestamp', getDateBoundary(endDate, true));
        }
        if (search) query = query.ilike('id', `%${search}%`);
        return query;
      };

      const requestedLimit = Number(limit);
      const maximumLimit = exportMode === 'true' ? 10000 : 200;
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > maximumLimit) {
        return res.status(400).json({ error: `Report limit must be between 1 and ${maximumLimit}` });
      }
      let data: any[];
      let totalCount = 0;
      if (requestedLimit > batchSize) {
        data = [];
        for (let offset = start; offset <= end; offset += batchSize) {
          const batchEnd = Math.min(offset + batchSize - 1, end);
          const result = await applyFilters(supabase.from('orders').select(exportMode === 'true'
            ? '*'
            : includeItems === 'false'
              ? 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,updated_at'
              : 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,updated_at,items,customer_id,dining_type,remark,rejection_reason,rejection_note,amount_received,change_amount'))
            .order('timestamp', { ascending: false })
            .range(offset, batchEnd);
          if (result.error) throw result.error;
          if (!result.data?.length) break;
          data.push(...result.data);
          if (result.data.length < batchEnd - offset + 1) break;
        }
        totalCount = data.length;
      } else {
        const result = await applyFilters(supabase.from('orders').select(exportMode === 'true'
          ? '*'
          : includeItems === 'false'
            ? 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,updated_at'
            : 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,updated_at,items,customer_id,dining_type,remark,rejection_reason,rejection_note,amount_received,change_amount'))
          .order('timestamp', { ascending: false })
          .range(start, end);
        if (result.error) throw result.error;
        data = result.data || [];
        totalCount = result.count || 0;
      }

      const summaryResult = includeSummary === 'false' ? null : await supabase.rpc('get_order_report_summary', {
        p_start_timestamp: startDate ? getDateBoundary(startDate, false) : null,
        p_end_timestamp: endDate ? getDateBoundary(endDate, true) : null,
        p_restaurant_id: restaurantId && restaurantId !== 'ALL' ? restaurantId : null,
        p_location_name: locationName && locationName !== 'ALL' ? locationName : null,
        p_status: status && status !== 'ALL' ? status : null,
        p_search: search ? String(search).trim() || null : null,
        p_include_breakdowns: includeBreakdowns !== 'false',
      });
      if (summaryResult?.error) throw summaryResult.error;
      const summary = summaryResult?.data || { totalRevenue: 0, orderVolume: 0, efficiency: 0, byTransactionType: [], byCashier: [] };
      if (exportMode === 'true' && includeSummary !== 'false' && Number(summary.orderVolume || 0) > maximumLimit) {
        return res.status(413).json({
          error: `This export contains more than ${maximumLimit} orders. Select a shorter date range or a specific kitchen.`,
        });
      }

      return res.json({
        orders: data.map(mapOrder),
        summary,
        totalCount: includeSummary === 'false' ? 0 : Number(summary.orderVolume || 0),
        syncCursor,
      });
    } catch (error) {
      console.error('Report error:', error);
      if (mode === 'dashboard') {
        const message = error instanceof Error ? error.message : 'Failed to fetch dashboard analytics';
        return res.status(500).json({ error: `Failed to fetch dashboard analytics: ${message}` });
      }
      res.status(500).json({ error: 'Failed to fetch report' });
    }
  });

  // Registration endpoint
  app.post('/api/register', async (req, res) => {
    const { restaurantName, ownerName, email, phone, username, password, planId } = req.body || {};
    const VALID_PLANS = ['basic', 'pro', 'pro_plus'];
    const TRIAL_DAYS = 30;

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
      const { data: existingUser } = await supabase
        .from('users').select('id').eq('username', username).single();
      if (existingUser) return res.status(409).json({ error: 'Username is already taken.' });

      const { data: existingEmail } = await supabase
        .from('users').select('id').eq('email', email).single();
      if (existingEmail) return res.status(409).json({ error: 'An account with this email already exists.' });

      let kitchenEnabled = false;
      if (planId === 'pro_plus') { kitchenEnabled = true; }

      const { data: restaurant, error: restError } = await supabase
        .from('restaurants')
        .insert({
          name: restaurantName,
          logo: '',
          vendor_id: null,
          location_name: 'QuickServe Hub',
          is_online: true,
          settings: { onboardingRequired: true, features: { groupMenuByCategory: false } },
          kitchen_enabled: kitchenEnabled,
          slug: null,
        })
        .select().single();

      if (restError || !restaurant) {
        console.error('Restaurant creation error:', restError);
        return res.status(500).json({ error: 'Failed to create restaurant.' });
      }

      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          username, password, role: 'VENDOR',
          restaurant_id: restaurant.id, is_active: true, email, phone,
        })
        .select('id')
        .single();

      if (userError || !newUser) {
        await supabase.from('restaurants').delete().eq('id', restaurant.id);
        console.error('User creation error:', userError);
        return res.status(500).json({ error: 'Failed to create user account.' });
      }

      // Link vendor back to restaurant
      await supabase.from('restaurants').update({ vendor_id: newUser.id }).eq('id', restaurant.id);

      const trialStart = new Date();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          restaurant_id: restaurant.id, plan_id: planId, status: 'trialing',
          trial_start: trialStart.toISOString(), trial_end: trialEnd.toISOString(),
        });

      if (subError) console.error('Subscription creation error:', subError);

      res.status(201).json({
        message: 'Registration successful! You can now log in.',
        restaurantId: restaurant.id,
        trialEnd: trialEnd.toISOString(),
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  app.post(['/api/stripe/shop-checkout', '/api/stripe/create-checkout'], async (req, res) => {
    const { items, customer } = req.body || {};
    const requestedItems = Array.isArray(items) ? items : [];
    const customerName = String(customer?.name || '').trim();
    const customerEmail = String(customer?.email || '').trim();
    const customerPhone = String(customer?.phone || '').trim();

    if (!stripe) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured.' });
    }
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
        const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
        quantities.set(id, (quantities.get(id) || 0) + quantity);
      });

      const { data, error } = await supabaseAdmin
        .from('admin_sold_items')
        .select('id, name, sku, description, price, category, is_active, image_url, item_data')
        .in('id', Array.from(quantities.keys()))
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

      const orderId = `shop_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const total = orderItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const now = new Date().toISOString();
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

      await supabaseAdmin.from('admin_shop_orders').insert({
        id: orderId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        company_name: orderData.customer.company,
        total,
        status: 'pending',
        order_data: orderData,
        created_at: now,
        updated_at: now,
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

      await supabaseAdmin
        .from('admin_shop_orders')
        .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      res.json({ url: session.url, orderId });
    } catch (error: any) {
      console.error('Admin shop checkout error:', error);
      res.status(500).json({ error: error?.message || 'Failed to create shop checkout.' });
    }
  });

  app.post(['/api/stripe/confirm-shop-checkout', '/api/stripe/confirm-checkout'], async (req, res) => {
    const { checkoutSessionId } = req.body || {};
    if (!stripe) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured.' });
    }
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

      const quote = await ensureAdminShopQuotationForSession(supabaseAdmin, session);
      res.json({ success: true, quoteId: quote.id, quoteNo: quote.quoteNo, invoice: quote });
    } catch (error: any) {
      console.error('Confirm admin shop checkout error:', error);
      res.status(500).json({ error: error?.message || 'Failed to confirm shop checkout.' });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filename = req.body.filename || `${Date.now()}-${req.file.originalname}`;
      
      // Upload to Vercel Blob
      // Note: BLOB_READ_WRITE_TOKEN must be set in environment variables
      const blob = await put(filename, req.file.buffer, {
        access: 'public',
      });

      res.json(blob);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
