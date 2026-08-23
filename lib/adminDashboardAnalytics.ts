import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDashboardAnalytics } from '../src/types';

const DASHBOARD_BATCH_SIZE = 1000;

function toLocalDateKey(timestamp: number, timezoneOffsetMinutes: number): string {
  return new Date(timestamp - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function parseOrderItems(items: unknown): any[] {
  if (Array.isArray(items)) return items;
  if (typeof items !== 'string') return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isDashboardRpcUnavailable(error: any): boolean {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883'
    || code === 'PGRST202'
    || message.includes('get_admin_dashboard_analytics')
    || message.includes('could not find the function');
}

export async function buildAdminDashboardAnalyticsFallback(
  supabase: SupabaseClient,
  startTimestamp: number,
  endTimestamp: number,
  timezoneOffsetMinutes = 0
): Promise<AdminDashboardAnalytics> {
  const rows: any[] = [];

  for (let from = 0; ; from += DASHBOARD_BATCH_SIZE) {
    const to = from + DASHBOARD_BATCH_SIZE - 1;
    const { data, error } = await supabase
      .from('orders')
      .select('restaurant_id,location_name,total,status,timestamp,payment_method,items')
      .gte('timestamp', startTimestamp)
      .lte('timestamp', endTimestamp)
      .order('timestamp', { ascending: true })
      .range(from, to);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < DASHBOARD_BATCH_SIZE) break;
  }

  const daily = new Map<string, { date: string; sales: number; orders: number }>();
  const vendors = new Map<string, {
    restaurantId: string;
    hub: string;
    sales: number;
    completed: number;
    total: number;
    cancelled: number;
  }>();
  const payments = new Map<string, { name: string; value: number; orders: number }>();
  const statuses = new Map<string, { name: string; value: number }>();
  const items = new Map<string, { name: string; quantity: number; sales: number }>();

  let revenue = 0;
  let completedOrders = 0;

  for (const row of rows) {
    const status = String(row.status || 'UNKNOWN');
    const total = Number(row.total || 0);
    const restaurantId = String(row.restaurant_id || 'unknown');

    const vendor = vendors.get(restaurantId) || {
      restaurantId,
      hub: row.location_name || 'Unassigned',
      sales: 0,
      completed: 0,
      total: 0,
      cancelled: 0,
    };
    vendor.total += 1;
    if (status === 'CANCELLED') vendor.cancelled += 1;
    vendors.set(restaurantId, vendor);

    const statusRow = statuses.get(status) || { name: status, value: 0 };
    statusRow.value += 1;
    statuses.set(status, statusRow);

    if (status !== 'COMPLETED') continue;

    revenue += total;
    completedOrders += 1;
    vendor.sales += total;
    vendor.completed += 1;

    const date = toLocalDateKey(Number(row.timestamp), timezoneOffsetMinutes);
    const dailyRow = daily.get(date) || { date, sales: 0, orders: 0 };
    dailyRow.sales += total;
    dailyRow.orders += 1;
    daily.set(date, dailyRow);

    const method = row.payment_method || 'Unspecified';
    const paymentRow = payments.get(method) || { name: method, value: 0, orders: 0 };
    paymentRow.value += total;
    paymentRow.orders += 1;
    payments.set(method, paymentRow);

    for (const item of parseOrderItems(row.items)) {
      const key = String(item?.id || item?.name || 'Unknown item');
      const quantity = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      const itemRow = items.get(key) || { name: String(item?.name || 'Unknown item'), quantity: 0, sales: 0 };
      itemRow.quantity += Number.isFinite(quantity) ? quantity : 0;
      itemRow.sales += (Number.isFinite(price) ? price : 0) * (Number.isFinite(quantity) ? quantity : 0);
      items.set(key, itemRow);
    }
  }

  return {
    revenue,
    completedOrders,
    totalOrders: rows.length,
    averageOrder: completedOrders > 0 ? revenue / completedOrders : 0,
    completionRate: rows.length > 0 ? (completedOrders / rows.length) * 100 : 0,
    dailySales: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    vendors: Array.from(vendors.values()).sort((a, b) => b.sales - a.sales),
    payments: Array.from(payments.values()).sort((a, b) => b.value - a.value),
    statusBreakdown: Array.from(statuses.values()).sort((a, b) => b.value - a.value),
    topItems: Array.from(items.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5),
  };
}
