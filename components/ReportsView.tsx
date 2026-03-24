import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus } from '../src/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  DollarSign, ShoppingBag, Tag, Users, CreditCard, Layers, Percent, Receipt,
  TrendingUp, TrendingDown, Search, Download, Calendar,
} from 'lucide-react';

interface Props {
  orders: Order[];
  currencySymbol: string;
  taxes?: Array<{ id: string; name: string; percentage: number; applyToItems: boolean }>;
  initialSubTab?: ReportSubTab;
}

type ReportSubTab = 'sales_summary' | 'sales_by_item' | 'sales_by_category' | 'sales_by_employee' | 'sales_by_payment' | 'sales_by_modifier' | 'discounts' | 'taxes';
type DateRange = 'today' | 'week' | 'month';

const COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#FCD34D', '#3B82F6', '#8B5CF6', '#22C55E', '#EF4444', '#EC4899'];

const ReportsView: React.FC<Props> = ({ orders, currencySymbol, taxes, initialSubTab }) => {
  const [subTab, setSubTab] = useState<ReportSubTab>(initialSubTab || 'sales_summary');

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStart, setCustomStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => today.toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = toLocal(now);
    if (dateRange === 'today') {
      setCustomStart(todayStr);
      setCustomEnd(todayStr);
    } else if (dateRange === 'week') {
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      setCustomStart(toLocal(startOfWeek));
      setCustomEnd(todayStr);
    } else {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setCustomStart(toLocal(startOfMonth));
      setCustomEnd(todayStr);
    }
  }, [dateRange]);

  const { startDate, endDate } = useMemo(() => {
    return { startDate: new Date(customStart), endDate: new Date(customEnd + 'T23:59:59') };
  }, [customStart, customEnd]);

  const filteredOrders = useMemo(
    () => orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= startDate && t <= endDate;
    }),
    [orders, startDate, endDate],
  );

  const completedOrders = useMemo(
    () => filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED),
    [filteredOrders],
  );

  const prevPeriodOrders = useMemo(() => {
    const duration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - duration);
    const prevEnd = new Date(startDate.getTime() - 1);
    return orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= prevStart && t <= prevEnd;
    }).filter(o => o.status !== OrderStatus.CANCELLED);
  }, [orders, startDate, endDate]);

  // ─── Sub tabs ───
  const subTabs: { key: ReportSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'sales_summary', label: 'Sales Summary', icon: <DollarSign size={16} /> },
    { key: 'sales_by_item', label: 'By Item', icon: <ShoppingBag size={16} /> },
    { key: 'sales_by_category', label: 'By Category', icon: <Tag size={16} /> },
    { key: 'sales_by_employee', label: 'By Employee', icon: <Users size={16} /> },
    { key: 'sales_by_payment', label: 'By Payment', icon: <CreditCard size={16} /> },
    { key: 'sales_by_modifier', label: 'By Modifier', icon: <Layers size={16} /> },
    { key: 'discounts', label: 'Discounts', icon: <Percent size={16} /> },
    { key: 'taxes', label: 'Taxes', icon: <Receipt size={16} /> },
  ];

  // ─── Helpers ───
  const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

  const ChangeIndicator = ({ value }: { value: number }) => {
    const isPositive = value >= 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2 py-0.5 ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-bold text-white mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-gray-300">
            {p.name}: <span className="text-amber-400 font-bold">{typeof p.value === 'number' ? `${currencySymbol}${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Order ID', 'Items', 'Status', 'Payment Method', 'Cashier', 'Total'];
    const rows = completedOrders.map(o => [
      new Date(o.timestamp).toLocaleDateString(),
      o.id,
      o.items.map(i => `${i.name} x${i.quantity}`).join('; '),
      o.status,
      o.paymentMethod || '-',
      o.cashierName || '-',
      o.total.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${customStart}_${customEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ════════════════════════════════════════
  // COMPUTED REPORT DATA
  // ════════════════════════════════════════

  // Sales Summary
  const salesSummary = useMemo(() => {
    const totalRevenue = completedOrders.reduce((s, o) => s + o.total, 0);
    const prevRevenue = prevPeriodOrders.reduce((s, o) => s + o.total, 0);
    const totalOrders = completedOrders.length;
    const prevOrders = prevPeriodOrders.length;
    const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;
    const refunds = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED).reduce((s, o) => s + o.total, 0);
    const netSales = totalRevenue - refunds;

    // Daily breakdown
    const dailyMap: Record<string, { date: string; grossSales: number; netSales: number; orders: number }> = {};
    completedOrders.forEach(o => {
      const d = new Date(o.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dailyMap[d]) dailyMap[d] = { date: d, grossSales: 0, netSales: 0, orders: 0 };
      dailyMap[d].grossSales += o.total;
      dailyMap[d].netSales += o.total;
      dailyMap[d].orders += 1;
    });
    const dailyData = Object.values(dailyMap).sort((a, b) => {
      const da = new Date(a.date + ', ' + today.getFullYear());
      const db = new Date(b.date + ', ' + today.getFullYear());
      return da.getTime() - db.getTime();
    });

    return { totalRevenue, totalOrders, avgOrder, refunds, netSales, dailyData, revenueChange: pct(totalRevenue, prevRevenue), ordersChange: pct(totalOrders, prevOrders), avgChange: pct(avgOrder, prevAvg) };
  }, [completedOrders, prevPeriodOrders, filteredOrders]);

  // Sales by Item
  const salesByItem = useMemo(() => {
    const map: Record<string, { name: string; quantity: number; revenue: number; avgPrice: number }> = {};
    completedOrders.forEach(o => {
      o.items.forEach(item => {
        if (!map[item.name]) map[item.name] = { name: item.name, quantity: 0, revenue: 0, avgPrice: 0 };
        map[item.name].quantity += item.quantity;
        map[item.name].revenue += item.price * item.quantity;
      });
    });
    return Object.values(map)
      .map(item => ({ ...item, avgPrice: item.quantity > 0 ? item.revenue / item.quantity : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [completedOrders]);

  // Sales by Category
  const salesByCategory = useMemo(() => {
    const map: Record<string, { name: string; itemsSold: number; revenue: number; orderCount: number }> = {};
    completedOrders.forEach(o => {
      const seenCategories = new Set<string>();
      o.items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!map[cat]) map[cat] = { name: cat, itemsSold: 0, revenue: 0, orderCount: 0 };
        map[cat].itemsSold += item.quantity;
        map[cat].revenue += item.price * item.quantity;
        seenCategories.add(cat);
      });
      seenCategories.forEach(cat => { map[cat].orderCount += 1; });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [completedOrders]);

  // Sales by Employee
  const salesByEmployee = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number; avgOrder: number; cancelled: number; itemsSold: number }> = {};
    filteredOrders.forEach(o => {
      const name = o.cashierName || 'Unknown';
      if (!map[name]) map[name] = { name, orders: 0, revenue: 0, avgOrder: 0, cancelled: 0, itemsSold: 0 };
      if (o.status === OrderStatus.CANCELLED) {
        map[name].cancelled += 1;
      } else {
        map[name].orders += 1;
        map[name].revenue += o.total;
        map[name].itemsSold += o.items.reduce((s, i) => s + i.quantity, 0);
      }
    });
    return Object.values(map)
      .map(e => ({ ...e, avgOrder: e.orders > 0 ? e.revenue / e.orders : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // Sales by Payment Type
  const salesByPayment = useMemo(() => {
    const map: Record<string, { name: string; transactions: number; revenue: number; percentage: number }> = {};
    completedOrders.forEach(o => {
      const method = o.paymentMethod || 'Cash';
      if (!map[method]) map[method] = { name: method, transactions: 0, revenue: 0, percentage: 0 };
      map[method].transactions += 1;
      map[method].revenue += o.total;
    });
    const total = completedOrders.reduce((s, o) => s + o.total, 0);
    return Object.values(map)
      .map(p => ({ ...p, percentage: total > 0 ? (p.revenue / total) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [completedOrders]);

  // Sales by Modifier
  const salesByModifier = useMemo(() => {
    const map: Record<string, { name: string; timesUsed: number; revenue: number; items: string[] }> = {};
    completedOrders.forEach(o => {
      o.items.forEach(item => {
        // Size modifier
        if (item.selectedSize) {
          const key = `Size: ${item.selectedSize}`;
          if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
          map[key].timesUsed += item.quantity;
          if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
        }
        // Temp modifier
        if (item.selectedTemp) {
          const key = `Temp: ${item.selectedTemp}`;
          if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
          map[key].timesUsed += item.quantity;
          if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
        }
        // Other variant modifier
        if (item.selectedOtherVariant) {
          const key = `Variant: ${item.selectedOtherVariant}`;
          if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
          map[key].timesUsed += item.quantity;
          if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
        }
        // Selected modifiers
        if (item.selectedModifiers) {
          Object.entries(item.selectedModifiers).forEach(([modGroup, modValue]) => {
            const key = `${modGroup}: ${modValue}`;
            if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
            map[key].timesUsed += item.quantity;
            if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
          });
        }
        // Add-ons
        if (item.selectedAddOns) {
          item.selectedAddOns.forEach(addon => {
            const key = `Add-on: ${addon.name}`;
            if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
            map[key].timesUsed += addon.quantity * item.quantity;
            map[key].revenue += addon.price * addon.quantity * item.quantity;
            if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
          });
        }
        // Variant option
        if (item.selectedVariantOption) {
          const key = `Option: ${item.selectedVariantOption}`;
          if (!map[key]) map[key] = { name: key, timesUsed: 0, revenue: 0, items: [] };
          map[key].timesUsed += item.quantity;
          if (!map[key].items.includes(item.name)) map[key].items.push(item.name);
        }
      });
    });
    return Object.values(map).sort((a, b) => b.timesUsed - a.timesUsed);
  }, [completedOrders]);

  // Discounts (estimated from order data — if the system has discount fields)
  const discountsReport = useMemo(() => {
    // Placeholder structure — since orders don't have a discount field currently, 
    // we show total cancelled/refunded value as an approximation
    const cancelled = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED);
    const totalCancelledValue = cancelled.reduce((s, o) => s + o.total, 0);
    return {
      totalDiscountValue: 0,
      totalCancelledValue,
      cancelledCount: cancelled.length,
      totalOrders: filteredOrders.length,
    };
  }, [filteredOrders]);

  // Taxes report
  const taxesReport = useMemo(() => {
    if (!taxes || taxes.length === 0) return [];
    const totalRevenue = completedOrders.reduce((s, o) => s + o.total, 0);
    return taxes.map(tax => {
      const taxableAmount = tax.applyToItems ? totalRevenue : 0;
      const taxAmount = taxableAmount * (tax.percentage / 100);
      return {
        name: tax.name,
        percentage: tax.percentage,
        taxableAmount,
        taxCollected: taxAmount,
        orderCount: completedOrders.length,
      };
    });
  }, [completedOrders, taxes]);

  const totalTaxCollected = useMemo(() => taxesReport.reduce((s, t) => s + t.taxCollected, 0), [taxesReport]);

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex bg-red-800 rounded-t-lg overflow-x-auto hide-scrollbar mb-0">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSubTab(tab.key); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border-b-2 ${
              subTab === tab.key
                ? 'bg-white dark:bg-gray-900 text-red-800 dark:text-red-400 border-red-800 dark:border-red-400'
                : 'text-white hover:bg-red-700 border-transparent'
            }`}
          >
            {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="border-b-2 border-red-800 mb-4" />

      {/* Date Range - same as PosOnlyView > Report */}
      <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-lg border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
        <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                    dateRange === range
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : 'This Month'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Custom Range</label>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-amber-500 shrink-0" />
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
              <span className="text-gray-400 font-black">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" />
            </div>
          </div>
        </div>
        <button onClick={handleExportCSV} className="w-full md:w-auto px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-600 transition-all"><Download size={16} /> Export CSV</button>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* SALES SUMMARY                          */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_summary' && (
        <div>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Gross Sales', value: `${currencySymbol}${salesSummary.totalRevenue.toFixed(2)}`, change: salesSummary.revenueChange, icon: <DollarSign size={20} className="text-amber-500" />, bg: 'bg-amber-600/20' },
              { label: 'Net Sales', value: `${currencySymbol}${salesSummary.netSales.toFixed(2)}`, change: salesSummary.revenueChange, icon: <TrendingUp size={20} className="text-green-400" />, bg: 'bg-green-600/20' },
              { label: 'Orders', value: salesSummary.totalOrders.toLocaleString(), change: salesSummary.ordersChange, icon: <ShoppingBag size={20} className="text-blue-400" />, bg: 'bg-blue-600/20' },
              { label: 'Avg. Order Value', value: `${currencySymbol}${salesSummary.avgOrder.toFixed(2)}`, change: salesSummary.avgChange, icon: <Receipt size={20} className="text-purple-400" />, bg: 'bg-purple-600/20' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{kpi.label}</span>
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-white">{kpi.value}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">vs prev</span>
                  <ChangeIndicator value={kpi.change} />
                </div>
              </div>
            ))}
          </div>

          {/* Refunds card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Refunds / Cancelled</h3>
              <p className="text-xl font-black text-red-400">{currencySymbol}{salesSummary.refunds.toFixed(2)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{filteredOrders.filter(o => o.status === OrderStatus.CANCELLED).length} cancelled orders</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">Total Tax Collected</h3>
              <p className="text-xl font-black text-amber-400">{currencySymbol}{totalTaxCollected.toFixed(2)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{taxesReport.length} tax{taxesReport.length !== 1 ? 'es' : ''} configured</p>
            </div>
          </div>

          {/* Daily Sales Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-amber-400 mb-4">Daily Sales Trend</h3>
            {salesSummary.dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesSummary.dailyData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="grossSales" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={32} name="Gross Sales" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data for this period</div>}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SALES BY ITEM                          */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_by_item' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black">Sales by Item</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48" />
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Unique Items Sold</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{salesByItem.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Total Units Sold</p>
              <p className="text-2xl font-black text-blue-400">{salesByItem.reduce((s, i) => s + i.quantity, 0).toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Total Item Revenue</p>
              <p className="text-2xl font-black text-amber-400">{currencySymbol}{salesByItem.reduce((s, i) => s + i.revenue, 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Top Items chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-sm font-bold text-amber-400 mb-4">Top 10 Items by Revenue</h3>
            {salesByItem.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByItem.slice(0, 10)} layout="vertical">
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#D97706" radius={[0, 4, 4, 0]} maxBarSize={24} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data</div>}
          </div>

          {/* Items table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Qty Sold</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Avg Price</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByItem
                    .filter(i => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((item, idx) => {
                      const totalRev = salesByItem.reduce((s, i) => s + i.revenue, 0);
                      return (
                        <tr key={item.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-4 text-xs text-gray-500">{idx + 1}</td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{item.name}</td>
                          <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{item.quantity}</td>
                          <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{currencySymbol}{item.avgPrice.toFixed(2)}</td>
                          <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{item.revenue.toFixed(2)}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 hidden md:table-cell">{totalRev > 0 ? ((item.revenue / totalRev) * 100).toFixed(1) : '0'}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SALES BY CATEGORY                      */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_by_category' && (
        <div>
          <h2 className="text-lg font-black mb-6">Sales by Category</h2>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Categories</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{salesByCategory.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Top Category</p>
              <p className="text-lg font-black text-amber-400 truncate">{salesByCategory[0]?.name || 'N/A'}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Top Category Revenue</p>
              <p className="text-2xl font-black text-green-400">{currencySymbol}{(salesByCategory[0]?.revenue || 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Pie Chart + Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-amber-400 mb-4">Revenue Distribution</h3>
              {salesByCategory.length > 0 ? (
                <div className="flex justify-center">
                  <ResponsiveContainer width={280} height={280}>
                    <PieChart>
                      <Pie data={salesByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} dataKey="revenue" stroke="none">
                        {salesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl"><p className="text-xs font-bold text-white">{d.name}</p><p className="text-xs text-gray-300">{currencySymbol}{d.revenue.toFixed(2)}</p></div>;
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="h-64 flex items-center justify-center text-gray-500 text-sm">No data</div>}
            </div>

            {/* Category bars */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-amber-400 mb-4">Category Breakdown</h3>
              <div className="space-y-3">
                {salesByCategory.map((cat, i) => {
                  const maxRev = salesByCategory[0]?.revenue || 1;
                  const width = (cat.revenue / maxRev) * 100;
                  return (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{cat.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{currencySymbol}{cat.revenue.toFixed(2)} ({cat.itemsSold} items)</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Items Sold</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Orders</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByCategory.map(cat => {
                    const totalRev = salesByCategory.reduce((s, c) => s + c.revenue, 0);
                    return (
                      <tr key={cat.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{cat.name}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{cat.itemsSold}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{cat.orderCount}</td>
                        <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{cat.revenue.toFixed(2)}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 hidden md:table-cell">{totalRev > 0 ? ((cat.revenue / totalRev) * 100).toFixed(1) : '0'}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SALES BY EMPLOYEE                      */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_by_employee' && (
        <div>
          <h2 className="text-lg font-black mb-6">Sales by Employee</h2>

          {/* Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-sm font-bold text-amber-400 mb-4">Revenue by Employee</h3>
            {salesByEmployee.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesByEmployee}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={48} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data</div>}
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Orders</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Items Sold</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Avg Order</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByEmployee.map(emp => (
                    <tr key={emp.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{emp.name}</td>
                      <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{emp.orders}</td>
                      <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{emp.itemsSold}</td>
                      <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{emp.revenue.toFixed(2)}</td>
                      <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{currencySymbol}{emp.avgOrder.toFixed(2)}</td>
                      <td className="px-5 py-4 text-xs text-red-400 hidden md:table-cell">{emp.cancelled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SALES BY PAYMENT TYPE                  */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_by_payment' && (
        <div>
          <h2 className="text-lg font-black mb-6">Sales by Payment Type</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Pie Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-bold text-amber-400 mb-4">Payment Distribution</h3>
              {salesByPayment.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <ResponsiveContainer width={240} height={240}>
                      <PieChart>
                        <Pie data={salesByPayment} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="revenue" stroke="none">
                          {salesByPayment.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl"><p className="text-xs font-bold text-white">{d.name}</p><p className="text-xs text-gray-300">{currencySymbol}{d.revenue.toFixed(2)} ({d.percentage.toFixed(1)}%)</p></div>;
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {salesByPayment.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.name}</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white ml-auto">{d.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div className="h-64 flex items-center justify-center text-gray-500 text-sm">No data</div>}
            </div>

            {/* Cards */}
            <div className="space-y-4">
              {salesByPayment.map((pm, i) => (
                <div key={pm.name} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${COLORS[i % COLORS.length]}30` }}>
                    <CreditCard size={20} style={{ color: COLORS[i % COLORS.length] }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{pm.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{pm.transactions} transactions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-amber-400">{currencySymbol}{pm.revenue.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{pm.percentage.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
              {salesByPayment.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 h-48 flex items-center justify-center text-gray-500 text-sm">No data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* SALES BY MODIFIER                      */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'sales_by_modifier' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black">Sales by Modifier</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="Search modifiers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Total Modifiers Used</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{salesByModifier.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">Add-on Revenue</p>
              <p className="text-2xl font-black text-amber-400">{currencySymbol}{salesByModifier.reduce((s, m) => s + m.revenue, 0).toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {salesByModifier.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Modifier</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Times Used</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Applied To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesByModifier
                      .filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(mod => (
                        <tr key={mod.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{mod.name}</td>
                          <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{mod.timesUsed}</td>
                          <td className="px-5 py-4 text-xs font-bold text-amber-400">{mod.revenue > 0 ? `${currencySymbol}${mod.revenue.toFixed(2)}` : '-'}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-[200px]">{mod.items.join(', ')}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Layers size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No modifier data</p>
                <p className="text-xs text-gray-500 mt-1">Modifiers like sizes, add-ons, and variants will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* DISCOUNTS                              */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'discounts' && (
        <div>
          <h2 className="text-lg font-black mb-6">Discounts</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center"><Percent size={20} className="text-amber-500" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Discounts</span>
              </div>
              <p className="text-2xl font-black text-amber-400">{currencySymbol}{discountsReport.totalDiscountValue.toFixed(2)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No discount codes configured</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center"><Receipt size={20} className="text-red-400" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Cancelled Value</span>
              </div>
              <p className="text-2xl font-black text-red-400">{currencySymbol}{discountsReport.totalCancelledValue.toFixed(2)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{discountsReport.cancelledCount} cancelled orders</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><ShoppingBag size={20} className="text-blue-400" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Orders</span>
              </div>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{discountsReport.totalOrders}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">In selected period</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Percent size={20} className="text-amber-400" />
              <h3 className="text-sm font-bold text-amber-400">Discount Tracking</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Discount tracking will display here when discount codes are applied to orders.
              Currently showing cancelled order values as a reference for lost revenue.
            </p>
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <strong className="text-gray-900 dark:text-white">Cancellation Rate:</strong> {discountsReport.totalOrders > 0 ? ((discountsReport.cancelledCount / discountsReport.totalOrders) * 100).toFixed(1) : '0'}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TAXES                                  */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'taxes' && (
        <div>
          <h2 className="text-lg font-black mb-6">Taxes</h2>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center"><Receipt size={20} className="text-amber-500" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Tax Collected</span>
              </div>
              <p className="text-2xl font-black text-amber-400">{currencySymbol}{totalTaxCollected.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><DollarSign size={20} className="text-blue-400" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Taxable Revenue</span>
              </div>
              <p className="text-2xl font-black text-gray-900 dark:text-white">{currencySymbol}{completedOrders.reduce((s, o) => s + o.total, 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Tax Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {taxesReport.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tax Name</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Rate</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Taxable Amount</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tax Collected</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxesReport.map(tax => (
                      <tr key={tax.name} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{tax.name}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{tax.percentage}%</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{currencySymbol}{tax.taxableAmount.toFixed(2)}</td>
                        <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{tax.taxCollected.toFixed(2)}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 hidden md:table-cell">{tax.orderCount}</td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-gray-50 dark:bg-gray-800/50 font-bold">
                      <td className="px-5 py-4 text-xs text-gray-900 dark:text-white">Total</td>
                      <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">-</td>
                      <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">-</td>
                      <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{totalTaxCollected.toFixed(2)}</td>
                      <td className="px-5 py-4 hidden md:table-cell"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Receipt size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No taxes configured</p>
                <p className="text-xs text-gray-500 mt-1">Configure taxes in your restaurant settings to see tax reports here</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
