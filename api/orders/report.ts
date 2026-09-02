import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  buildAdminDashboardAnalyticsFallback,
  isDashboardRpcUnavailable,
} from '../../lib/adminDashboardAnalytics.js';
import { REPORT_HISTORY_LIMITS } from '../../lib/pricingPlans.js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getServiceClient = () => {
  const serviceUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceUrl || !serviceKey) return null;
  return createClient(serviceUrl, serviceKey, { auth: { persistSession: false } });
};

const BATCH_SIZE = 1000;
const MAX_PAGE_SIZE = 200;
const MAX_DASHBOARD_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 10000;
const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const PAGE_COLUMNS = 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,dining_type,updated_at,e_receipt_id';
const DETAIL_COLUMNS = `${PAGE_COLUMNS},items,customer_id,remark,rejection_reason,rejection_note,amount_received,change_amount`;
const rateLimitBuckets = new Map<string, { startedAt: number; count: number }>();

const enforceRateLimit = (req: VercelRequest, res: VercelResponse, isExport: boolean) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientAddress = String(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const now = Date.now();
  const windowMs = 60_000;
  const requestLimit = isExport ? 5 : 120;
  const key = `${clientAddress}:${isExport ? 'export' : 'report'}`;
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  res.setHeader('X-RateLimit-Limit', requestLimit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, requestLimit - bucket.count).toString());
  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, value] of rateLimitBuckets) {
      if (now - value.startedAt >= windowMs) rateLimitBuckets.delete(bucketKey);
    }
  }
  if (bucket.count <= requestLimit) return true;
  res.setHeader('Retry-After', '60');
  res.status(429).json({ error: 'Too many report requests. Please wait and try again.' });
  return false;
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
  eReceiptId: o.e_receipt_id || undefined,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const action = String(Array.isArray(req.query.action) ? req.query.action[0] : req.query.action || '');
  if (action === 'e-receipt') {
    if (!enforceRateLimit(req, res, false)) return;
    const token = String(Array.isArray(req.query.token) ? req.query.token[0] : req.query.token || '').trim();
    if (!UUID_PATTERN.test(token)) return res.status(404).json({ error: 'Receipt not found.' });
    const serviceClient = getServiceClient();
    if (!serviceClient) return res.status(503).json({ error: 'Receipt service is temporarily unavailable.' });

    const { data, error } = await serviceClient
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
    const receipt = data.snapshot && typeof data.snapshot === 'object' ? { ...data.snapshot } : {};
    delete (receipt as Record<string, unknown>).remark;
    return res.status(200).json({ receipt, createdAt: data.created_at, expiresAt: data.expires_at });
  }

  if (action === 'e-receipts-cleanup') {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const serviceClient = getServiceClient();
    if (!serviceClient) return res.status(503).json({ error: 'Receipt cleanup is not configured.' });
    const { error, count } = await serviceClient
      .from('e_receipts')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());
    if (error) return res.status(500).json({ error: 'Cleanup failed.' });
    return res.status(200).json({ success: true, deleted: count || 0 });
  }

  const {
    restaurantId, startDate, endDate, status, search, paymentMethod, page = '1', limit = '30',
    locationName, timezoneOffsetMinutes, includeSummary = 'true', updatedSince,
    includeBreakdowns = 'true', includeItems = 'true', mode, export: exportMode = 'false',
  } = req.query;
  if (!enforceRateLimit(req, res, exportMode === 'true')) return;
  const syncCursor = new Date().toISOString();
  const tzOffset = timezoneOffsetMinutes ? Number(timezoneOffsetMinutes) : 0;
  const getDateBoundary = (value: string | string[], endOfDay: boolean) => {
    const [year, month, day] = String(value).split('-').map(Number);
    return Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0,
      endOfDay ? 59 : 0, endOfDay ? 999 : 0) + (tzOffset * 60000);
  };

  try {
    const normalizedRestaurantId = restaurantId && restaurantId !== 'ALL' ? String(restaurantId) : null;
    const normalizedLocationName = locationName && locationName !== 'ALL' ? String(locationName) : null;
    const normalizedStatus = status && status !== 'ALL' ? String(status) : null;
    const normalizedPaymentMethod = paymentMethod && paymentMethod !== 'ALL' ? String(paymentMethod) : null;
    const normalizedSearch = search ? String(search).trim() || null : null;
    const normalizedUpdatedSince = updatedSince ? String(updatedSince) : null;
    if (mode === 'changes' && (!normalizedRestaurantId || !normalizedUpdatedSince || Number.isNaN(Date.parse(normalizedUpdatedSince)))) {
      return res.status(400).json({ error: 'Incremental report sync requires a restaurant and valid cursor' });
    }
    const startTimestamp = startDate ? getDateBoundary(startDate, false) : null;
    const endTimestamp = endDate ? getDateBoundary(endDate, true) : null;
    if ((startTimestamp !== null && !Number.isFinite(startTimestamp)) || (endTimestamp !== null && !Number.isFinite(endTimestamp))) {
      return res.status(400).json({ error: 'Invalid report date range' });
    }
    if ((mode === 'summary' || mode === 'dashboard' || mode === 'dashboard-comparison' || includeSummary !== 'false' || exportMode === 'true')
      && (startTimestamp === null || endTimestamp === null)) {
      return res.status(400).json({ error: 'A start date and end date are required' });
    }
    if (startTimestamp !== null && endTimestamp !== null
      && (endTimestamp < startTimestamp || endTimestamp - startTimestamp > MAX_REPORT_RANGE_MS)) {
      return res.status(400).json({ error: 'Report date ranges are limited to 366 days' });
    }

    if (exportMode === 'true' && normalizedRestaurantId && startTimestamp !== null) {
      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('restaurant_id', normalizedRestaurantId)
        .maybeSingle();
      if (subscriptionError) throw subscriptionError;
      const planId: keyof typeof REPORT_HISTORY_LIMITS = subscription?.plan_id === 'pro' || subscription?.plan_id === 'pro_plus'
        ? subscription.plan_id
        : 'basic';
      const maximumHistoryMonths = REPORT_HISTORY_LIMITS[planId].downloadMonths;
      const localNow = new Date(Date.now() - (tzOffset * 60000));
      const earliestLocalDate = new Date(Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth() - maximumHistoryMonths,
        1,
      ));
      const earliestAllowedTimestamp = earliestLocalDate.getTime() + (tzOffset * 60000);
      if (startTimestamp < earliestAllowedTimestamp) {
        const planName = planId === 'pro_plus' ? 'Pro Plus' : planId === 'pro' ? 'Pro' : 'Basic';
        return res.status(403).json({
          error: `${planName} downloads are limited to the past ${maximumHistoryMonths === 12 ? '1 year' : `${maximumHistoryMonths} months`}.`,
        });
      }
    }

    const buildOrderQuery = (columns: string, withCount = false) => {
      let query = supabase.from('orders').select(columns, withCount ? { count: 'exact' } : undefined);
      if (normalizedRestaurantId) query = query.eq('restaurant_id', normalizedRestaurantId);
      if (normalizedLocationName) query = query.eq('location_name', normalizedLocationName);
      if (normalizedStatus) query = query.eq('status', normalizedStatus);
      if (normalizedPaymentMethod) query = query.eq('payment_method', normalizedPaymentMethod);
      if (startTimestamp !== null) query = query.gte('timestamp', startTimestamp);
      if (endTimestamp !== null) query = query.lte('timestamp', endTimestamp);
      if (normalizedSearch) query = query.ilike('id', `%${normalizedSearch}%`);
      if (normalizedUpdatedSince) query = query.gt('updated_at', normalizedUpdatedSince).lte('updated_at', syncCursor);
      return query;
    };

    const buildManualSummary = async () => {
      const { data, count, error } = await buildOrderQuery('id,total,status,payment_method,cashier_name', true)
        .range(0, MAX_EXPORT_ROWS - 1);
      if (error) throw error;
      const rows = (data || []) as any[];
      const completedRows = rows.filter(row => row.status === 'COMPLETED');
      const byTransactionType = new Map<string, { name: string; count: number; total: number }>();
      const byCashier = new Map<string, { name: string; count: number; total: number }>();
      completedRows.forEach(row => {
        const total = Number(row.total || 0);
        const paymentName = row.payment_method || 'Unknown';
        const cashierName = row.cashier_name || 'Unknown';
        const payment = byTransactionType.get(paymentName) || { name: paymentName, count: 0, total: 0 };
        payment.count += 1;
        payment.total += total;
        byTransactionType.set(paymentName, payment);
        const cashier = byCashier.get(cashierName) || { name: cashierName, count: 0, total: 0 };
        cashier.count += 1;
        cashier.total += total;
        byCashier.set(cashierName, cashier);
      });
      const totalRevenue = completedRows.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const orderVolume = count ?? rows.length;
      return {
        totalRevenue,
        orderVolume,
        efficiency: orderVolume > 0 ? Math.round((completedRows.length / orderVolume) * 1000) / 10 : 0,
        byTransactionType: Array.from(byTransactionType.values()),
        byCashier: Array.from(byCashier.values()),
      };
    };

    if (mode === 'dashboard') {
      if (startTimestamp === null || endTimestamp === null) {
        return res.status(400).json({ error: 'Dashboard analytics require a date range' });
      }
      const { data, error } = await supabase.rpc('get_admin_dashboard_analytics', {
        p_start_timestamp: startTimestamp,
        p_end_timestamp: endTimestamp,
        p_timezone_offset_minutes: tzOffset,
      });
      if (error && !isDashboardRpcUnavailable(error)) throw error;
      const dashboardData = error
        ? await buildAdminDashboardAnalyticsFallback(supabase, startTimestamp, endTimestamp, tzOffset)
        : data;
      res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
      return res.status(200).json(dashboardData);
    }

    if (mode === 'summary') {
      if (normalizedPaymentMethod) {
        const summary = await buildManualSummary();
        res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
        return res.status(200).json(summary);
      }
      const { data, error } = await supabase.rpc('get_order_report_summary', {
        p_start_timestamp: startTimestamp,
        p_end_timestamp: endTimestamp,
        p_restaurant_id: normalizedRestaurantId,
        p_location_name: normalizedLocationName,
        p_status: normalizedStatus,
        p_search: normalizedSearch,
        p_include_breakdowns: includeBreakdowns !== 'false',
      });
      if (error) throw error;
      res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
      return res.status(200).json(data);
    }

    if (mode === 'dashboard-comparison') {
      const baseArgs = {
        p_start_timestamp: startTimestamp,
        p_end_timestamp: endTimestamp,
        p_restaurant_id: normalizedRestaurantId,
        p_location_name: normalizedLocationName,
        p_search: normalizedSearch,
        p_include_breakdowns: false,
      };
      const [all, cancelled] = await Promise.all([
        supabase.rpc('get_order_report_summary', { ...baseArgs, p_status: null }),
        supabase.rpc('get_order_report_summary', { ...baseArgs, p_status: 'CANCELLED' }),
      ]);
      if (all.error) throw all.error;
      if (cancelled.error) throw cancelled.error;
      const cancelledCount = Number(cancelled.data?.orderVolume || 0);
      res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=120');
      return res.status(200).json({
        totalSales: Number(all.data?.totalRevenue || 0),
        totalOrders: Math.max(0, Number(all.data?.orderVolume || 0) - cancelledCount),
        cancelled: cancelledCount,
      });
    }

    const requestedPage = Number(page);
    const requestedLimit = Number(limit);
    const isExport = exportMode === 'true';
    const isChanges = mode === 'changes';
    const isDashboardRead = mode === 'dashboard-orders';
    const isBulkRead = isExport || isChanges;
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ error: 'Invalid report pagination' });
    }
    const maximumLimit = isBulkRead
      ? MAX_EXPORT_ROWS
      : isDashboardRead ? MAX_DASHBOARD_PAGE_SIZE : MAX_PAGE_SIZE;
    if (requestedLimit > maximumLimit) {
      return res.status(400).json({
        error: isBulkRead
          ? `Bulk report requests are limited to ${MAX_EXPORT_ROWS} rows; narrow the selected date range.`
          : `Report pages are limited to ${maximumLimit} rows.`,
      });
    }

    const summaryResult = includeSummary === 'false' || normalizedPaymentMethod ? null : await supabase.rpc('get_order_report_summary', {
      p_start_timestamp: startTimestamp,
      p_end_timestamp: endTimestamp,
      p_restaurant_id: normalizedRestaurantId,
      p_location_name: normalizedLocationName,
      p_status: normalizedStatus,
      p_search: normalizedSearch,
      p_include_breakdowns: includeBreakdowns !== 'false',
    });
    if (summaryResult?.error) throw summaryResult.error;
    const summary = normalizedPaymentMethod && includeSummary !== 'false' ? await buildManualSummary() : summaryResult?.data || {
      totalRevenue: 0, orderVolume: 0, efficiency: 0, byTransactionType: [], byCashier: [],
    };
    if (isExport && includeSummary !== 'false' && Number(summary.orderVolume || 0) > MAX_EXPORT_ROWS) {
      return res.status(413).json({
        error: `This export contains more than ${MAX_EXPORT_ROWS} orders. Select a shorter date range or a specific kitchen.`,
      });
    }

    const start = (requestedPage - 1) * requestedLimit;
    const end = start + requestedLimit - 1;
    const selectedColumns = isBulkRead
      ? (includeItems === 'false' ? PAGE_COLUMNS : DETAIL_COLUMNS)
      : (includeItems === 'false' ? PAGE_COLUMNS : DETAIL_COLUMNS);
    let data: any[] = [];
    let count: number | null = includeSummary === 'false' ? null : Number(summary.orderVolume || 0);

    if (requestedLimit > BATCH_SIZE) {
      for (let offset = start; offset <= end; offset += BATCH_SIZE) {
        const batchEnd = Math.min(offset + BATCH_SIZE - 1, end);
        const { data: batch, error } = await buildOrderQuery(selectedColumns)
          .order(isChanges ? 'updated_at' : 'timestamp', { ascending: isChanges })
          .order('id', { ascending: true })
          .range(offset, batchEnd);
        if (error) throw error;
        if (!batch?.length) break;
        data.push(...batch);
        if (batch.length < batchEnd - offset + 1) break;
      }
      if (count === null) count = data.length;
    } else {
      const result = await buildOrderQuery(selectedColumns)
        .order(isChanges ? 'updated_at' : 'timestamp', { ascending: isChanges })
        .order('id', { ascending: true })
        .range(start, end);
      if (result.error) throw result.error;
      data = result.data || [];
      count = includeSummary === 'false' ? null : Number(summary.orderVolume || 0);
    }

    return res.status(200).json({
      orders: data.map(mapOrder),
      summary,
      totalCount: count ?? 0,
      syncCursor,
    });
  } catch (error) {
    console.error('Report error:', error);
    if (mode === 'dashboard') {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard analytics';
      return res.status(500).json({ error: `Failed to fetch dashboard analytics: ${message}` });
    }
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}
