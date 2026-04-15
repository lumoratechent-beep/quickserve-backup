
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BATCH_SIZE = 1000;

/**
 * Fetch all rows matching a query by paginating in batches of BATCH_SIZE.
 * This avoids Supabase's default 1000-row PostgREST limit.
 */
async function fetchAllRows(buildQuery: () => any): Promise<any[]> {
  let allRows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
  return allRows;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurantId, startDate, endDate, status, search, page = 1, limit = 30, locationName, timezoneOffsetMinutes } = req.query;
  
  const start = (Number(page) - 1) * Number(limit);
  const end = start + Number(limit) - 1;
  
  // Get timezone offset from client (in minutes). If not provided, assume UTC (0)
  const tzOffset = timezoneOffsetMinutes ? Number(timezoneOffsetMinutes) : 0;

  try {
    let query = supabase.from('orders').select('*', { count: 'exact' });

    if (restaurantId && restaurantId !== 'ALL') query = query.eq('restaurant_id', restaurantId);
    if (locationName && locationName !== 'ALL') query = query.eq('location_name', locationName);
    if (status && status !== 'ALL') query = query.eq('status', status);
    
    if (startDate) {
      // startDate comes as YYYY-MM-DD from local time representation
      // JavaScript interprets the date string as UTC, but we need to convert to what the user meant in their timezone
      // For a client at UTC+8 selecting "2026-03-01":
      // - They want: 2026-03-01 00:00:00+08 which is 2026-02-28 16:00:00 UTC
      // - We have: 2026-03-01 00:00:00 (from string, interpreted as UTC)
      // - getTimezoneOffset() for UTC+8 returns -480
      // - We need to ADD the offset (which is negative) to subtract hours
      const startD = new Date(startDate as string);
      startD.setHours(0, 0, 0, 0);
      const startTimestamp = startD.getTime() + (tzOffset * 60000);
      query = query.gte('timestamp', startTimestamp);
    }
    if (endDate) {
      // endDate is in format "YYYY-MM-DD" representing local end of day
      // For a client at UTC+8 selecting "2026-03-01":
      // - They want end of: 2026-03-01 23:59:59+08 which is 2026-03-01 15:59:59 UTC
      const endD = new Date(endDate as string);
      endD.setHours(23, 59, 59, 999);
      const endTimestamp = endD.getTime() + (tzOffset * 60000);
      query = query.lte('timestamp', endTimestamp);
    }
    
    if (search) query = query.ilike('id', `%${search}%`);

    // For large limits (e.g. CSV export), paginate in batches to avoid Supabase's 1000-row default cap
    let data: any[];
    let count: number | null;
    const requestedLimit = Number(limit);
    if (requestedLimit > BATCH_SIZE) {
      // First get exact count
      const { count: exactCount, error: countError } = await query.order('timestamp', { ascending: false }).range(0, 0);
      if (countError) throw countError;
      count = exactCount;

      // Fetch all requested rows in batches
      data = [];
      let offset = start;
      while (offset <= end) {
        const batchEnd = Math.min(offset + BATCH_SIZE - 1, end);
        const { data: batch, error: batchError } = await query.order('timestamp', { ascending: false }).range(offset, batchEnd);
        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        data = data.concat(batch);
        if (batch.length < (batchEnd - offset + 1)) break;
        offset += BATCH_SIZE;
      }
    } else {
      const result = await query
        .order('timestamp', { ascending: false })
        .range(start, end);
      if (result.error) throw result.error;
      data = result.data;
      count = result.count;
    }

    // Summary query – paginate through ALL matching rows to avoid Supabase's default 1000-row limit
    const buildSummaryQuery = () => {
      let q = supabase.from('orders').select('total, status, payment_method, cashier_name');
      if (restaurantId && restaurantId !== 'ALL') q = q.eq('restaurant_id', restaurantId);
      if (locationName && locationName !== 'ALL') q = q.eq('location_name', locationName);
      if (status && status !== 'ALL') q = q.eq('status', status);
      if (startDate) {
        const startD = new Date(startDate as string);
        startD.setHours(0, 0, 0, 0);
        q = q.gte('timestamp', startD.getTime() + (tzOffset * 60000));
      }
      if (endDate) {
        const endD = new Date(endDate as string);
        endD.setHours(23, 59, 59, 999);
        q = q.lte('timestamp', endD.getTime() + (tzOffset * 60000));
      }
      if (search) q = q.ilike('id', `%${search}%`);
      return q;
    };

    const summaryData = await fetchAllRows(buildSummaryQuery);

    const totalRevenue = summaryData
      .filter(o => o.status === 'COMPLETED')
      .reduce((acc, o) => acc + Number(o.total || 0), 0);
    
    const orderVolume = summaryData.length;
    const completedCount = summaryData.filter(o => o.status === 'COMPLETED').length;
    const efficiency = orderVolume > 0 ? Math.round((completedCount / orderVolume) * 100) : 0;

    // Compute breakdowns from non-cancelled orders
    const nonCancelled = summaryData.filter(o => o.status !== 'CANCELLED');

    const txMap: Record<string, { count: number; total: number }> = {};
    nonCancelled.forEach(o => {
      const method = o.payment_method || '-';
      if (!txMap[method]) txMap[method] = { count: 0, total: 0 };
      txMap[method].count += 1;
      txMap[method].total += Number(o.total || 0);
    });
    const byTransactionType = Object.entries(txMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);

    const cashierMap: Record<string, { count: number; total: number }> = {};
    nonCancelled.forEach(o => {
      const name = o.cashier_name || '-';
      if (!cashierMap[name]) cashierMap[name] = { count: 0, total: 0 };
      cashierMap[name].count += 1;
      cashierMap[name].total += Number(o.total || 0);
    });
    const byCashier = Object.entries(cashierMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);

    return res.status(200).json({
      orders: data.map(o => ({
        id: o.id,
        items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
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
        orderSource: o.order_source || undefined
      })),
      summary: {
        totalRevenue,
        orderVolume,
        efficiency,
        byTransactionType,
        byCashier
      },
      totalCount: count || 0
    });
  } catch (error) {
    console.error('Report error:', error);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}
