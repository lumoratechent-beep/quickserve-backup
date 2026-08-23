import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  buildAdminDashboardAnalyticsFallback,
  isDashboardRpcUnavailable,
} from '../../lib/adminDashboardAnalytics.js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BATCH_SIZE = 1000;
const MAX_PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 10000;
const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const PAGE_COLUMNS = 'id,total,status,timestamp,restaurant_id,table_number,location_name,payment_method,cashier_name,order_source,updated_at';
const DETAIL_COLUMNS = `${PAGE_COLUMNS},items,customer_id,dining_type,remark,rejection_reason,rejection_note,amount_received,change_amount`;
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
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    restaurantId, startDate, endDate, status, search, paymentMethod, page = '1', limit = '30',
    locationName, timezoneOffsetMinutes, includeSummary = 'true',
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
    const startTimestamp = startDate ? getDateBoundary(startDate, false) : null;
    const endTimestamp = endDate ? getDateBoundary(endDate, true) : null;
    if ((startTimestamp !== null && !Number.isFinite(startTimestamp)) || (endTimestamp !== null && !Number.isFinite(endTimestamp))) {
      return res.status(400).json({ error: 'Invalid report date range' });
    }
    if ((mode === 'summary' || mode === 'dashboard' || includeSummary !== 'false' || exportMode === 'true')
      && (startTimestamp === null || endTimestamp === null)) {
      return res.status(400).json({ error: 'A start date and end date are required' });
    }
    if (startTimestamp !== null && endTimestamp !== null
      && (endTimestamp < startTimestamp || endTimestamp - startTimestamp > MAX_REPORT_RANGE_MS)) {
      return res.status(400).json({ error: 'Report date ranges are limited to 366 days' });
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

    const requestedPage = Number(page);
    const requestedLimit = Number(limit);
    const isExport = exportMode === 'true';
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({ error: 'Invalid report pagination' });
    }
    const maximumLimit = isExport ? MAX_EXPORT_ROWS : MAX_PAGE_SIZE;
    if (requestedLimit > maximumLimit) {
      return res.status(400).json({
        error: isExport
          ? `Exports are limited to ${MAX_EXPORT_ROWS} rows; narrow the selected date range.`
          : `Report pages are limited to ${MAX_PAGE_SIZE} rows.`,
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
    const selectedColumns = isExport ? '*' : (includeItems === 'false' ? PAGE_COLUMNS : DETAIL_COLUMNS);
    let data: any[] = [];
    let count: number | null = includeSummary === 'false' ? null : Number(summary.orderVolume || 0);

    if (requestedLimit > BATCH_SIZE) {
      for (let offset = start; offset <= end; offset += BATCH_SIZE) {
        const batchEnd = Math.min(offset + BATCH_SIZE - 1, end);
        const { data: batch, error } = await buildOrderQuery(selectedColumns)
          .order('timestamp', { ascending: false }).range(offset, batchEnd);
        if (error) throw error;
        if (!batch?.length) break;
        data.push(...batch);
        if (batch.length < batchEnd - offset + 1) break;
      }
      if (count === null) count = data.length;
    } else {
      const result = await buildOrderQuery(selectedColumns)
        .order('timestamp', { ascending: false }).range(start, end);
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
