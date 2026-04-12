import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, ReportResponse } from '../src/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { Calendar, Download, Search, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, CreditCard, Users, FileText, DollarSign, ShoppingBag, Receipt, TrendingUp, TrendingDown } from 'lucide-react';

const COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#FCD34D'];
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#22C55E',
  SERVED: '#3B82F6',
  PENDING: '#F59E0B',
  ONGOING: '#8B5CF6',
  CANCELLED: '#EF4444',
};

interface Props {
  reportStart: string;
  reportEnd: string;
  reportStatus: string;
  reportSearchQuery: string;
  entriesPerPage: number;
  currentPage: number;
  totalPages: number;
  paginatedReports: Order[];
  reportData: ReportResponse | null;
  onChangeReportStart: (value: string) => void;
  onChangeReportEnd: (value: string) => void;
  onChangeReportStatus: (value: string) => void;
  onChangeReportSearchQuery: (value: string) => void;
  onChangeEntriesPerPage: (value: number) => void;
  onChangeCurrentPage: (value: number | ((prev: number) => number)) => void;
  onDownloadReport: () => void;
  onDownloadPDF?: () => void;
  onSelectOrder?: (order: Order) => void;
  allOrders?: Order[];
  currencySymbol?: string;
}

const StandardReport: React.FC<Props> = ({
  reportStart,
  reportEnd,
  reportStatus,
  reportSearchQuery,
  entriesPerPage,
  currentPage,
  totalPages,
  paginatedReports,
  reportData,
  onChangeReportStart,
  onChangeReportEnd,
  onChangeReportStatus,
  onChangeReportSearchQuery,
  onChangeEntriesPerPage,
  onChangeCurrentPage,
  onDownloadReport,
  onDownloadPDF,
  onSelectOrder,
  allOrders,
  currencySymbol = 'RM',
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPayment, setFilterPayment] = useState<string>('ALL');
  const [filterCashier, setFilterCashier] = useState<string>('ALL');
  const [detailRange, setDetailRange] = useState<'today' | 'week' | 'month'>('month');

  // Auto-set date pickers when range preset changes
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = toLocal(now);
    if (detailRange === 'today') {
      onChangeReportStart(todayStr);
      onChangeReportEnd(todayStr);
    } else if (detailRange === 'week') {
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      onChangeReportStart(toLocal(startOfWeek));
      onChangeReportEnd(todayStr);
    } else {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      onChangeReportStart(toLocal(startOfMonth));
      onChangeReportEnd(todayStr);
    }
  }, [detailRange]);

  const uniquePayments = useMemo(() => {
    const set = new Set(paginatedReports.map(o => o.paymentMethod || '-'));
    return Array.from(set).sort();
  }, [paginatedReports]);

  const uniqueCashiers = useMemo(() => {
    const set = new Set(paginatedReports.map(o => o.cashierName || '-'));
    return Array.from(set).sort();
  }, [paginatedReports]);

  const filteredReports = useMemo(() => {
    return paginatedReports.filter(o => {
      if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
      if (filterPayment !== 'ALL' && (o.paymentMethod || '-') !== filterPayment) return false;
      if (filterCashier !== 'ALL' && (o.cashierName || '-') !== filterCashier) return false;
      return true;
    });
  }, [paginatedReports, filterStatus, filterPayment, filterCashier]);

  // Transaction type and cashier breakdowns from the current filtered data
  const nonCancelledOrders = useMemo(
    () => paginatedReports.filter(o => o.status !== OrderStatus.CANCELLED),
    [paginatedReports],
  );

  const detailTransactions = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    nonCancelledOrders.forEach(o => {
      const method = o.paymentMethod || '-';
      if (!map[method]) map[method] = { count: 0, total: 0 };
      map[method].count += 1;
      map[method].total += o.total;
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [nonCancelledOrders]);

  const detailCashiers = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    nonCancelledOrders.forEach(o => {
      const name = o.cashierName || '-';
      if (!map[name]) map[name] = { count: 0, total: 0 };
      map[name].count += 1;
      map[name].total += o.total;
    });
    return Object.entries(map).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.total - a.total);
  }, [nonCancelledOrders]);

  // ─── Dark mode detection for Recharts ───
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const gridStroke = isDark ? '#374151' : '#E5E7EB';
  const tickFill = isDark ? '#9CA3AF' : '#6B7280';

  // ─── Analytics computed from allOrders within selected date range ───
  const rangeOrders = useMemo(() => {
    if (!allOrders) return [];
    const s = new Date(reportStart);
    const e = new Date(reportEnd + 'T23:59:59');
    return allOrders.filter(o => { const t = new Date(o.timestamp); return t >= s && t <= e; });
  }, [allOrders, reportStart, reportEnd]);

  const prevRangeOrders = useMemo(() => {
    if (!allOrders) return [];
    const s = new Date(reportStart);
    const e = new Date(reportEnd + 'T23:59:59');
    const duration = e.getTime() - s.getTime();
    const prevStart = new Date(s.getTime() - duration);
    const prevEnd = new Date(s.getTime() - 1);
    return allOrders.filter(o => { const t = new Date(o.timestamp); return t >= prevStart && t <= prevEnd; });
  }, [allOrders, reportStart, reportEnd]);

  const kpis = useMemo(() => {
    const completed = rangeOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const prevCompleted = prevRangeOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const totalSales = completed.reduce((s, o) => s + o.total, 0);
    const prevTotalSales = prevCompleted.reduce((s, o) => s + o.total, 0);
    const totalOrders = completed.length;
    const prevTotalOrders = prevCompleted.length;
    const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAvg = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;
    const cancelled = rangeOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const prevCancelled = prevRangeOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
    return { totalSales, totalOrders, avgOrder, cancelled, salesChange: pct(totalSales, prevTotalSales), ordersChange: pct(totalOrders, prevTotalOrders), avgChange: pct(avgOrder, prevAvg), cancelledChange: pct(cancelled, prevCancelled) };
  }, [rangeOrders, prevRangeOrders]);

  const paymentChartData = useMemo(() => {
    const map: Record<string, number> = {};
    rangeOrders.filter(o => o.status === OrderStatus.COMPLETED).forEach(o => {
      const m = o.paymentMethod || 'Cash';
      map[m] = (map[m] || 0) + 1;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0' }));
  }, [rangeOrders]);

  const dailySales = useMemo(() => {
    const map: Record<string, { date: string; sales: number; orders: number }> = {};
    const now = new Date();
    rangeOrders.filter(o => o.status === OrderStatus.COMPLETED).forEach(o => {
      const d = new Date(o.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map[key]) map[key] = { date: key, sales: 0, orders: 0 };
      map[key].sales += o.total; map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => {
      const da = new Date(a.date + ', ' + now.getFullYear());
      const db = new Date(b.date + ', ' + now.getFullYear());
      return da.getTime() - db.getTime();
    });
  }, [rangeOrders]);

  const cashierStats = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number; avgOrder: number }> = {};
    rangeOrders.filter(o => o.status === OrderStatus.COMPLETED).forEach(o => {
      const name = o.cashierName || 'Unknown';
      if (!map[name]) map[name] = { name, orders: 0, revenue: 0, avgOrder: 0 };
      map[name].orders += 1; map[name].revenue += o.total;
    });
    return Object.values(map).map(c => ({ ...c, avgOrder: c.orders > 0 ? c.revenue / c.orders : 0 })).sort((a, b) => b.revenue - a.revenue);
  }, [rangeOrders]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    rangeOrders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [rangeOrders]);

  const ChangeIndicator = ({ value }: { value: number }) => {
    const isPositive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${isPositive ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'}`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-gray-600 dark:text-gray-300">
            {p.name}: <span className="text-orange-600 dark:text-orange-400 font-bold">{p.name === 'sales' ? `${currencySymbol}${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  const hasAnalytics = !!allOrders;

  return (
    <div className="animate-in fade-in duration-500">
      <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Sales Report</h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Financial performance and order history.</p>

      <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDetailRange(range)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                    detailRange === range
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {range === 'today' ? "Today" : range === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Custom Range</label>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-orange-500 shrink-0" />
              <input type="date" value={reportStart} onChange={(e) => { onChangeReportStart(e.target.value); }} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
              <span className="text-gray-400 font-black">to</span>
              <input type="date" value={reportEnd} onChange={(e) => { onChangeReportEnd(e.target.value); }} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={onDownloadReport} className="flex-1 md:flex-none px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all"><Download size={16} /> Export CSV</button>
          {onDownloadPDF && <button onClick={onDownloadPDF} className="flex-1 md:flex-none px-6 py-2 bg-red-600 text-white rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-700 transition-all"><FileText size={16} /> Download PDF</button>}
        </div>
      </div>

      {/* ═══════ Sales Overview (analytics) ═══════ */}
      {hasAnalytics ? (
        <>
          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-600/20 flex items-center justify-center"><DollarSign size={20} className="text-orange-600 dark:text-orange-500" /></div>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-400">Total Net Sales</span>
              </div>
              <p className="text-2xl font-black dark:text-white">{currencySymbol}{kpis.totalSales.toFixed(2)}</p>
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-gray-500">vs previous period</span><ChangeIndicator value={kpis.salesChange} /></div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-600/20 flex items-center justify-center"><ShoppingBag size={20} className="text-blue-600 dark:text-blue-400" /></div>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-400">Total Orders</span>
              </div>
              <p className="text-2xl font-black dark:text-white">{kpis.totalOrders.toLocaleString()}</p>
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-gray-500">vs previous period</span><ChangeIndicator value={kpis.ordersChange} /></div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-600/20 flex items-center justify-center"><Receipt size={20} className="text-green-600 dark:text-green-400" /></div>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-400">Avg. Order</span>
              </div>
              <p className="text-2xl font-black dark:text-white">{currencySymbol}{kpis.avgOrder.toFixed(2)}</p>
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-gray-500">vs previous period</span><ChangeIndicator value={kpis.avgChange} /></div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-600/20 flex items-center justify-center"><TrendingDown size={20} className="text-red-600 dark:text-red-400" /></div>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-400">Cancelled</span>
              </div>
              <p className="text-2xl font-black dark:text-white">{kpis.cancelled}</p>
              <div className="flex items-center gap-2 mt-2"><span className="text-xs text-gray-500">vs previous period</span><ChangeIndicator value={kpis.cancelledChange} /></div>
            </div>
          </div>

          {/* Charts Row: Payment Pie + Daily Sales Bar + Cashier Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Payment Method Donut */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-4">Transaction Types</h3>
              {paymentChartData.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie data={paymentChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                          {paymentChartData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (<div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl"><p className="text-xs font-bold text-gray-900 dark:text-white">{d.name}</p><p className="text-xs text-gray-600 dark:text-gray-300">{d.value} orders ({d.pct}%)</p></div>);
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {paymentChartData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.name}</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white ml-auto">{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>
              )}
            </div>

            {/* Daily Sales Bar Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-4">Sales Overview</h3>
              {dailySales.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailySales} barCategoryGap="20%">
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="sales" fill="#EA580C" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>
              )}
            </div>

            {/* Cashier Performance */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-4">Cashier Performance</h3>
              {cashierStats.length > 0 ? (
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                  {cashierStats.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600/50 transition-all">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${i === 0 ? 'bg-orange-600 text-white' : i === 1 ? 'bg-gray-500 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate dark:text-white">{c.name}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-500">{c.orders} orders</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">{currencySymbol}{c.revenue.toFixed(2)}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-500">avg {currencySymbol}{c.avgOrder.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>
              )}
            </div>
          </div>

          {/* Order Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-4">Order Status</h3>
              {statusData.length > 0 ? (
                <div className="space-y-3">
                  {statusData.map(s => {
                    const total = rangeOrders.length;
                    const pctVal = total > 0 ? (s.value / total) * 100 : 0;
                    return (
                      <div key={s.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold capitalize dark:text-white">{s.name.toLowerCase()}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{s.value} ({pctVal.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctVal}%`, backgroundColor: STATUS_COLORS[s.name] || '#6B7280' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Fallback: original simple summary cards when allOrders not provided */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
            <p className="text-xl md:text-2xl font-black dark:text-white">RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-black mt-1">{reportData?.summary.orderVolume || 0} orders</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <CreditCard size={12} className="text-orange-500" />
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By Transaction Type</p>
            </div>
            {detailTransactions.length > 0 ? (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {detailTransactions.map(t => (
                  <div key={t.name} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div><p className="text-xs font-black dark:text-white">{t.name}</p><p className="text-[10px] text-gray-400 font-bold">{t.count} order{t.count !== 1 ? 's' : ''}</p></div>
                    <p className="text-sm font-black text-orange-500">RM{t.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (<p className="text-[10px] text-gray-400 text-center py-4">No transactions</p>)}
          </div>
          <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <Users size={12} className="text-orange-500" />
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">By Cashier</p>
            </div>
            {detailCashiers.length > 0 ? (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {detailCashiers.map(c => (
                  <div key={c.name} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <span className="text-[10px] font-black text-orange-600 dark:text-orange-400">{c.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div><p className="text-xs font-black dark:text-white">{c.name}</p><p className="text-[10px] text-gray-400 font-bold">{c.count} order{c.count !== 1 ? 's' : ''}</p></div>
                    </div>
                    <p className="text-sm font-black text-orange-500">RM{c.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (<p className="text-[10px] text-gray-400 text-center py-4">No orders</p>)}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="p-4 border-b dark:border-gray-700 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search Order ID..." value={reportSearchQuery} onChange={(e) => onChangeReportSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Status</option>
              <option value={OrderStatus.COMPLETED}>Paid</option>
              <option value={OrderStatus.SERVED}>Served</option>
              <option value={OrderStatus.PENDING}>Pending</option>
              <option value={OrderStatus.ONGOING}>Ongoing</option>
              <option value={OrderStatus.CANCELLED}>Cancelled</option>
            </select>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Payment</option>
              {uniquePayments.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterCashier} onChange={(e) => setFilterCashier(e.target.value)} className="py-2 px-3 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-orange-500">
              <option value="ALL">All Cashier</option>
              {uniqueCashiers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
              <select value={entriesPerPage} onChange={(e) => onChangeEntriesPerPage(Number(e.target.value))} className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer">
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Table</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Dining Option</th>
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Cashier</th>
                <th className="px-4 py-3 text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {filteredReports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-2">
                    {onSelectOrder ? (
                      <button
                        onClick={() => onSelectOrder(report)}
                        className="text-[10px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest underline decoration-dotted underline-offset-4"
                      >
                        {report.id}
                      </button>
                    ) : (
                      <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{report.id}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[10px] font-black text-gray-900 dark:text-white">#{report.tableNumber}</td>
                  <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">{new Date(report.timestamp).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                      report.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' :
                      report.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      {report.status === OrderStatus.COMPLETED ? 'Paid' : report.status === OrderStatus.SERVED ? 'Served' : report.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                      {report.orderSource === 'counter' ? 'Counter' :
                       report.orderSource === 'qr_order' ? 'QR Order' :
                       report.orderSource === 'tableside' ? 'Tableside' :
                       report.orderSource === 'online' ? 'Online' : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                    {report.diningType || '-'}
                  </td>
                  <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">{report.paymentMethod || '-'}</td>
                  <td className="px-4 py-2 text-[10px] font-black text-gray-700 dark:text-gray-300">{report.cashierName || '-'}</td>
                  <td className="px-4 py-2 text-right font-black dark:text-white text-xs">
                    {report.status === OrderStatus.CANCELLED ? 'RM0.00' : `RM${report.total.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2 no-print">
          <button onClick={() => onChangeCurrentPage(1)} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronFirst size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => onChangeCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                {page}
              </button>
            ))}
          </div>

          <button onClick={() => onChangeCurrentPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => onChangeCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all">
            <ChevronLast size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default StandardReport;
