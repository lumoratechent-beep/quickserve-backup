
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BATCH_SIZE = 1000;

const mapOrder = (o: any) => ({
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
  orderSource: o.order_source || undefined,
  updatedAt: o.updated_at || undefined,
});

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

  const {
    restaurantId,
    startDate,
    endDate,
    status,
    search,
    page = 1,
    limit = 30,
    locationName,
    timezoneOffsetMinutes,
    updatedSince,
    includeSummary = 'true',
  } = req.query;
  const syncCursor = new Date().toISOString();
  
  const start = (Number(page) - 1) * Number(limit);
  const end = start + Number(limit) - 1;
  
  // Get timezone offset from client (in minutes). If not provided, assume UTC (0)
  const tzOffset = timezoneOffsetMinutes ? Number(timezoneOffsetMinutes) : 0;
  const getDateBoundary = (value: string | string[], endOfDay: boolean) => {
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

  try {
    if (updatedSince) {
      const since = new Date(String(updatedSince));
      if (Number.isNaN(since.getTime())) {
        return res.status(400).json({ error: 'Invalid updatedSince cursor' });
      }

      const changedRows = await fetchAllRows(() => (
        supabase
          .from('orders')
          .select('*')
          .gt('updated_at', since.toISOString())
          .lte('updated_at', syncCursor)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
      ));

      return res.status(200).json({
        orders: changedRows.map(mapOrder),
        syncCursor,
      });
    }

    const buildOrderQuery = (columns: string, withCount = false) => {
      let query = supabase.from('orders').select(columns, withCount ? { count: 'exact' } : undefined);
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

    // For large limits (e.g. CSV export), paginate in batches to avoid Supabase's 1000-row default cap
    let data: any[];
    let count: number | null;
    const requestedLimit = Number(limit);
    if (requestedLimit > BATCH_SIZE) {
      count = null;
      if (includeSummary !== 'false') {
        const { count: exactCount, error: countError } = await buildOrderQuery('id', true).range(0, 0);
        if (countError) throw countError;
        count = exactCount;
      }

      // Fetch all requested rows in batches
      data = [];
      let offset = start;
      while (offset <= end) {
        const batchEnd = Math.min(offset + BATCH_SIZE - 1, end);
        const { data: batch, error: batchError } = await buildOrderQuery('*')
          .order('timestamp', { ascending: false })
          .range(offset, batchEnd);
        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        data = data.concat(batch);
        if (batch.length < (batchEnd - offset + 1)) break;
        offset += BATCH_SIZE;
      }
      if (count === null) count = data.length;
    } else {
      const result = await buildOrderQuery('*', true)
        .order('timestamp', { ascending: false })
        .range(start, end);
      if (result.error) throw result.error;
      data = result.data;
      count = result.count;
    }

    // Summary query – paginate through ALL matching rows to avoid Supabase's default 1000-row limit
    const summaryData = includeSummary === 'false'
      ? []
      : await fetchAllRows(() => buildOrderQuery('total, status, payment_method, cashier_name'));

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
      orders: data.map(mapOrder),
      summary: {
        totalRevenue,
        orderVolume,
        efficiency,
        byTransactionType,
        byCashier
      },
      totalCount: count || 0,
      syncCursor,
    });
  } catch (error) {
    console.error('Report error:', error);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}
