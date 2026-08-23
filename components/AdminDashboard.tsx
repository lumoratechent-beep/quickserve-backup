import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminDashboardAnalytics, ReportFilters, Restaurant, User } from '../src/types';

interface Props {
  vendors: User[];
  restaurants: Restaurant[];
  onFetchAnalytics: (filters: ReportFilters) => Promise<AdminDashboardAnalytics>;
}

type DatePreset = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';

const CURRENCY = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  minimumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat('en-MY');
const PIE_COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#64748b', '#ec4899'];

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetRange = (preset: Exclude<DatePreset, 'CUSTOM'>) => {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  if (preset === 'THIS_MONTH') {
    start.setDate(1);
  } else if (preset === 'LAST_MONTH') {
    start.setMonth(today.getMonth() - 1, 1);
    end.setDate(0);
  } else if (preset === 'LAST_7_DAYS') {
    start.setDate(today.getDate() - 6);
  } else {
    start.setDate(today.getDate() - 29);
  }

  return { startDate: toInputDate(start), endDate: toInputDate(end) };
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const AdminDashboard: React.FC<Props> = ({
  vendors,
  restaurants,
  onFetchAnalytics,
}) => {
  const initialRange = getPresetRange('THIS_MONTH');
  const [preset, setPreset] = useState<DatePreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [isRangeLoading, setIsRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const analyticsRequestIdRef = React.useRef(0);
  const [rawAnalytics, setRawAnalytics] = useState<AdminDashboardAnalytics>({
    revenue: 0,
    completedOrders: 0,
    totalOrders: 0,
    averageOrder: 0,
    completionRate: 0,
    dailySales: [],
    vendors: [],
    payments: [],
    statusBreakdown: [],
    topItems: [],
  });

  const loadAnalytics = React.useCallback(async () => {
    const requestId = ++analyticsRequestIdRef.current;
    setIsRangeLoading(true);
    setRangeError('');
    try {
      const result = await onFetchAnalytics({
        restaurantId: 'ALL',
        locationName: 'ALL',
        status: 'ALL',
        startDate,
        endDate,
      });
      if (requestId !== analyticsRequestIdRef.current) return;
      setRawAnalytics(result);
      setLastUpdated(new Date());
    } catch (error) {
      if (requestId === analyticsRequestIdRef.current) {
        setRangeError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      }
    } finally {
      if (requestId === analyticsRequestIdRef.current) setIsRangeLoading(false);
    }
  }, [endDate, onFetchAnalytics, startDate]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) loadAnalytics();
    };
    const interval = window.setInterval(refreshIfVisible, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
    };
  }, [loadAnalytics]);

  const isLoading = isRangeLoading;
  const loadError = rangeError;

  const handleRefresh = async () => {
    setIsRangeLoading(true);
    setRangeError('');
    try {
      await loadAnalytics();
    } catch (error) {
      setRangeError(error instanceof Error ? error.message : 'Unable to refresh dashboard data.');
    } finally {
      setIsRangeLoading(false);
    }
  };

  const analytics = useMemo(() => {
    const aggregateByVendor = new Map(rawAnalytics.vendors.map(row => [row.restaurantId, row]));
    const vendorPerformance = restaurants.map(restaurant => {
      const aggregate = aggregateByVendor.get(restaurant.id);
      return {
        restaurantId: restaurant.id,
        name: restaurant.name,
        hub: restaurant.location || aggregate?.hub || 'Unassigned',
        sales: Number(aggregate?.sales || 0),
        completed: Number(aggregate?.completed || 0),
        total: Number(aggregate?.total || 0),
        cancelled: Number(aggregate?.cancelled || 0),
        isOnline: Boolean(restaurant.isOnline),
      };
    })
      .map(row => ({
        ...row,
        averageOrder: row.completed > 0 ? row.sales / row.completed : 0,
        completionRate: row.total > 0 ? (row.completed / row.total) * 100 : 0,
        salesShare: rawAnalytics.revenue > 0 ? (row.sales / rawAnalytics.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.sales - a.sales || b.completed - a.completed);

    const trendMap = new Map<string, { date: string; sales: number; orders: number }>();
    const rangeStart = new Date(`${startDate}T00:00:00`);
    const rangeEnd = new Date(`${endDate}T00:00:00`);
    for (const cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
      const key = toInputDate(cursor);
      trendMap.set(key, { date: key, sales: 0, orders: 0 });
    }
    rawAnalytics.dailySales.forEach(row => {
      const point = trendMap.get(row.date);
      if (point) Object.assign(point, { sales: Number(row.sales), orders: Number(row.orders) });
    });
    const salesTrend = Array.from(trendMap.values()).map(point => ({
      ...point,
      label: new Date(`${point.date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' }),
    }));

    return {
      revenue: Number(rawAnalytics.revenue || 0),
      completedOrders: Number(rawAnalytics.completedOrders || 0),
      totalOrders: Number(rawAnalytics.totalOrders || 0),
      completionRate: Number(rawAnalytics.completionRate || 0),
      averageOrder: Number(rawAnalytics.averageOrder || 0),
      activeVendors: vendorPerformance.filter(row => row.total > 0).length,
      vendorPerformance,
      salesTrend,
      payments: rawAnalytics.payments.map(row => ({ ...row, value: Number(row.value), orders: Number(row.orders) })),
      statusBreakdown: rawAnalytics.statusBreakdown.map(row => ({ ...row, value: Number(row.value) })),
      topItems: rawAnalytics.topItems.map(row => ({ ...row, quantity: Number(row.quantity), sales: Number(row.sales) })),
    };
  }, [endDate, rawAnalytics, restaurants, startDate]);

  const handlePreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    if (nextPreset !== 'CUSTOM') {
      const range = getPresetRange(nextPreset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  const handleDownload = () => {
    const summaryRows = [
      ['QuickServe Admin Sales Report'],
      ['Date range', startDate, endDate],
      ['Total sales', analytics.revenue.toFixed(2)],
      ['Completed orders', analytics.completedOrders],
      ['All orders', analytics.totalOrders],
      ['Average order value', analytics.averageOrder.toFixed(2)],
      ['Completion rate', `${analytics.completionRate.toFixed(1)}%`],
      [],
      ['Vendor performance'],
      ['Rank', 'Vendor', 'Hub', 'Sales (MYR)', 'Completed orders', 'All orders', 'Average order (MYR)', 'Completion rate', 'Sales share'],
      ...analytics.vendorPerformance.map((row, index) => [
        index + 1,
        row.name,
        row.hub,
        row.sales.toFixed(2),
        row.completed,
        row.total,
        row.averageOrder.toFixed(2),
        `${row.completionRate.toFixed(1)}%`,
        `${row.salesShare.toFixed(1)}%`,
      ]),
    ];
    const csv = `\uFEFF${summaryRows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `quickserve_admin_dashboard_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: 'Total sales', value: CURRENCY.format(analytics.revenue), note: 'Completed orders', icon: Wallet, color: 'orange' },
    { label: 'Completed orders', value: NUMBER.format(analytics.completedOrders), note: `${NUMBER.format(analytics.totalOrders)} total orders`, icon: Receipt, color: 'blue' },
    { label: 'Average order', value: CURRENCY.format(analytics.averageOrder), note: 'Per completed order', icon: TrendingUp, color: 'violet' },
    { label: 'Completion rate', value: `${analytics.completionRate.toFixed(1)}%`, note: `${analytics.activeVendors} vendors with sales`, icon: CheckCircle2, color: 'emerald' },
  ];
  const cardColors: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  };

  return (
    <div className="relative min-h-full">
      {isLoading && (
        <div className="absolute inset-0 z-50 bg-white/55 backdrop-blur-[3px] dark:bg-gray-950/55">
          <div className="sticky top-0 flex h-[calc(100vh-4rem)] items-center justify-center">
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white/95 px-5 py-3 shadow-xl dark:border-gray-700 dark:bg-gray-900/95">
              <Loader2 className="animate-spin text-orange-500" size={24} />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                Loading dashboard
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5 p-4 md:p-8">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Dashboard</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Sales and performance across every vendor
          </p>
          {lastUpdated && (
            <p className="mt-2 text-[10px] font-semibold text-gray-400">
              Last updated {lastUpdated.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        <div className="flex max-w-full flex-nowrap items-end gap-2 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <label className="w-[138px] shrink-0">
            <span className="mb-0.5 block text-[8px] font-black uppercase tracking-widest text-gray-400">Date range</span>
            <select
              value={preset}
              onChange={event => handlePreset(event.target.value as DatePreset)}
              className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-3 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="LAST_7_DAYS">Last 7 days</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
              <option value="CUSTOM">Custom range</option>
            </select>
          </label>
          <label className="w-[116px] shrink-0">
            <span className="mb-0.5 block text-[8px] font-black uppercase tracking-widest text-gray-400">From</span>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={event => { setPreset('CUSTOM'); setStartDate(event.target.value); }}
              className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 text-[11px] font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </label>
          <label className="w-[116px] shrink-0">
            <span className="mb-0.5 block text-[8px] font-black uppercase tracking-widest text-gray-400">To</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={event => { setPreset('CUSTOM'); setEndDate(event.target.value); }}
              className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 text-[11px] font-bold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh dashboard"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:border-orange-300 hover:text-orange-500 disabled:opacity-50 dark:border-gray-600"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isLoading || analytics.totalOrders === 0}
            className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-red-600 px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {loadError}
        </div>
      )}

      <div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{card.label}</p>
                  <p className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-white">{card.value}</p>
                  <p className="mt-1 text-[10px] font-semibold text-gray-400">{card.note}</p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cardColors[card.color]}`}>
                  <card.icon size={19} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"><Activity size={17} className="text-orange-500" /> Sales trend</h2>
              <p className="mt-1 text-[10px] font-semibold text-gray-400">Daily completed sales</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.7} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={56} tickFormatter={value => `RM${NUMBER.format(value)}`} />
                <Tooltip formatter={value => [CURRENCY.format(Number(value || 0)), 'Sales']} labelStyle={{ fontWeight: 800 }} />
                <Area type="monotone" dataKey="sales" stroke="#f97316" strokeWidth={3} fill="url(#adminSalesGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"><Wallet size={17} className="text-blue-500" /> Payment mix</h2>
          <p className="mt-1 text-[10px] font-semibold text-gray-400">Completed sales by payment method</p>
          {analytics.payments.length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-gray-400"><BarChart3 size={34} /><p className="mt-2 text-xs font-bold">No completed sales</p></div>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.payments} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={3}>
                      {analytics.payments.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={value => CURRENCY.format(Number(value || 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {analytics.payments.slice(0, 5).map((payment, index) => (
                  <div key={payment.name} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex min-w-0 items-center gap-2 font-bold text-gray-600 dark:text-gray-300"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} /> <span className="truncate">{payment.name}</span></span>
                    <span className="font-black text-gray-900 dark:text-white">{CURRENCY.format(payment.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"><Store size={17} className="text-orange-500" /> Vendor performance</h2>
            <p className="mt-1 text-[10px] font-semibold text-gray-400">All vendors ranked by completed sales</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-gray-50 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:bg-gray-700/50">
                <tr>
                  <th className="px-5 py-3 text-left">Rank / Vendor</th>
                  <th className="px-4 py-3 text-right">Sales</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Avg. order</th>
                  <th className="px-4 py-3 text-right">Completion</th>
                  <th className="px-5 py-3 text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {analytics.vendorPerformance.map((row, index) => {
                  const vendor = vendors.find(item => item.restaurantId === row.restaurantId);
                  return (
                    <tr key={row.restaurantId} className="text-xs hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${index < 3 ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'}`}>{index + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate font-black text-gray-900 dark:text-white">{row.name}</p>
                            <p className="truncate text-[10px] font-semibold text-gray-400">{row.hub}{vendor?.username ? ` · ${vendor.username}` : ''}</p>
                          </div>
                          <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${row.isOnline ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} title={row.isOnline ? 'Online' : 'Offline'} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-gray-900 dark:text-white">{CURRENCY.format(row.sales)}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-600 dark:text-gray-300">{NUMBER.format(row.completed)} <span className="font-medium text-gray-400">/ {NUMBER.format(row.total)}</span></td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-600 dark:text-gray-300">{CURRENCY.format(row.averageOrder)}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-600 dark:text-gray-300">{row.completionRate.toFixed(1)}%</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="ml-auto w-24">
                          <p className="mb-1 text-[10px] font-black text-gray-600 dark:text-gray-300">{row.salesShare.toFixed(1)}%</p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(100, row.salesShare)}%` }} /></div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {analytics.vendorPerformance.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-xs font-bold text-gray-400">No vendors found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"><Package size={17} className="text-violet-500" /> Top items</h2>
            <p className="mt-1 text-[10px] font-semibold text-gray-400">Best sellers by quantity</p>
            <div className="mt-4 space-y-3">
              {analytics.topItems.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-[10px] font-black text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-[10px] font-semibold text-gray-400">{NUMBER.format(item.quantity)} sold</p>
                  </div>
                  <span className="text-xs font-black text-gray-700 dark:text-gray-200">{CURRENCY.format(item.sales)}</span>
                </div>
              ))}
              {analytics.topItems.length === 0 && <p className="py-8 text-center text-xs font-bold text-gray-400">No item sales in this period</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white"><CalendarDays size={17} className="text-emerald-500" /> Order status</h2>
            <p className="mt-1 text-[10px] font-semibold text-gray-400">All orders in the selected period</p>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.statusBreakdown} layout="vertical" margin={{ left: 8, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 9, fontWeight: 700, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={value => [NUMBER.format(Number(value || 0)), 'Orders']} />
                  <Bar dataKey="value" fill="#10b981" radius={[0, 5, 5, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
