
import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://anknjpuiklglykguneax.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFua25qcHVpa2xnbHlrZ3VuZWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODkwNTAsImV4cCI6MjA4NzU2NTA1MH0.DUMHeKg0v-1oI9nLT-nZP9cg1eYPI0R4fRNBzE9K2MI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    const { data, error, count } = await query
      .order('timestamp', { ascending: false })
      .range(start, end);

    if (error) throw error;

    // Summary query
    let summaryQuery = supabase.from('orders').select('total, status');
    if (restaurantId && restaurantId !== 'ALL') summaryQuery = summaryQuery.eq('restaurant_id', restaurantId);
    if (locationName && locationName !== 'ALL') summaryQuery = summaryQuery.eq('location_name', locationName);
    if (status && status !== 'ALL') summaryQuery = summaryQuery.eq('status', status);
    
    if (startDate) {
      const startD = new Date(startDate as string);
      startD.setHours(0, 0, 0, 0);
      const startTimestamp = startD.getTime() + (tzOffset * 60000);
      summaryQuery = summaryQuery.gte('timestamp', startTimestamp);
    }
    if (endDate) {
      const endD = new Date(endDate as string);
      endD.setHours(23, 59, 59, 999);
      const endTimestamp = endD.getTime() + (tzOffset * 60000);
      summaryQuery = summaryQuery.lte('timestamp', endTimestamp);
    }
    
    if (search) summaryQuery = summaryQuery.ilike('id', `%${search}%`);

    const { data: summaryData, error: summaryError } = await summaryQuery;
    if (summaryError) throw summaryError;

    const totalRevenue = summaryData
      .filter(o => o.status === 'COMPLETED')
      .reduce((acc, o) => acc + Number(o.total || 0), 0);
    
    const orderVolume = summaryData.length;
    const completedCount = summaryData.filter(o => o.status === 'COMPLETED').length;
    const efficiency = orderVolume > 0 ? Math.round((completedCount / orderVolume) * 100) : 0;

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
        locationName: o.location_name,
        remark: o.remark,
        rejectionReason: o.rejection_reason,
        rejectionNote: o.rejection_note,
        paymentMethod: o.payment_method,
        cashierName: o.cashier_name
      })),
      summary: {
        totalRevenue,
        orderVolume,
        efficiency
      },
      totalCount: count || 0
    });
  } catch (error) {
    console.error('Report error:', error);
    return res.status(500).json({ error: 'Failed to fetch report' });
  }
}
