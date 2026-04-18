import React, { useState, useMemo, useEffect } from 'react';
import { Restaurant, Order, OrderStatus, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { loadBackofficeData, syncBackofficeToDb } from '../lib/sharedSettings';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown,
  FileText, BarChart3, PieChart as PieChartIcon, Activity,
  AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const FINANCE_CATEGORIES: { name: string; subcategories: string[]; type: 'COGS' | 'OPEX' }[] = [
  { name: 'Staff', subcategories: ['Salary', 'Claims', 'Benefits', 'Staff Meals'], type: 'OPEX' },
  { name: 'Food Cost', subcategories: ['Ingredients', 'Beverages', 'Packaging', 'Wastage/Spoilage'], type: 'COGS' },
  { name: 'Bills', subcategories: ['Utilities', 'Internet', 'Maintenance', 'Cleaning'], type: 'OPEX' },
  { name: 'Rent & Occupancy', subcategories: ['Rent', 'Property Tax', 'Security'], type: 'OPEX' },
  { name: 'Marketing', subcategories: ['Advertising', 'Promotions', 'Loyalty Programs'], type: 'OPEX' },
  { name: 'Platform Subscription', subcategories: ['Subscription Fee', 'Trial Fee'], type: 'OPEX' },
  { name: 'Others', subcategories: ['Insurance', 'Licenses & Permits', 'Miscellaneous'], type: 'OPEX' },
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card'];

const CHART_COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#3B82F6', '#8B5CF6', '#22C55E', '#EF4444'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  subcategory: string;
  supplierId?: string;
  supplierName?: string;
  paymentMethod: string;
  notes: string;
  attachmentName?: string;
  type: 'COGS' | 'OPEX';
  createdAt: number;
}

interface Supplier {
  id: string;
  name: string;
}

type FinanceSubTab = 'overview' | 'reports';
type ReportType = 'pl' | 'breakdown' | 'monthly';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  currencySymbol: string;
  initialSubTab?: string;
  subscription?: Subscription | null;
}

// ─── Helper: derive expense type from category ────────────────────────────────
function getCategoryType(categoryName: string): 'COGS' | 'OPEX' {
  const found = FINANCE_CATEGORIES.find(c => c.name === categoryName);
  return found ? found.type : 'OPEX';
}

// ─── Component ────────────────────────────────────────────────────────────────

const FinanceView: React.FC<Props> = ({ restaurant, orders, currencySymbol, initialSubTab, subscription }) => {
  const storeKey = (k: string) => `finance_${restaurant.id}_${k}`;

  const load = <T,>(key: string, fallback: T): T =>
    loadBackofficeData<T>(storeKey(key), restaurant.settings, key, fallback);
  const save = <T,>(key: string, data: T) => {
    localStorage.setItem(storeKey(key), JSON.stringify(data));
    syncBackofficeToDb(restaurant.id);
  };

  // ─── Dark mode ───
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  const gridStroke = isDark ? '#374151' : '#E5E7EB';
  const tickFill = isDark ? '#9CA3AF' : '#6B7280';

  // ─── Sub-tab ───
  const [subTab, setSubTab] = useState<FinanceSubTab>(() => {
    const v = initialSubTab as FinanceSubTab;
    return v === 'reports' ? v : 'overview';
  });
  useEffect(() => {
    if (initialSubTab) {
      const v = initialSubTab as FinanceSubTab;
      setSubTab(v === 'reports' ? v : 'overview');
    }
  }, [initialSubTab]);

  // ─── Expenses state ───
  const [expenses, setExpenses] = useState<Expense[]>(() => load('expenses', []));

  const saveExpenses = (data: Expense[]) => { setExpenses(data); save('expenses', data); };

  // ─── Suppliers from Contacts ───
  const suppliers: Supplier[] = useMemo(() => {
    try {
      const s = localStorage.getItem(`inv_${restaurant.id}_suppliers`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  }, [restaurant.id]);

  // ─── Purchase Orders → auto COGS expenses ───
  const poExpenses: Expense[] = useMemo(() => {
    try {
      const raw = localStorage.getItem(`inv_${restaurant.id}_purchase_orders`);
      if (!raw) return [];
      const pos: { id: string; supplierName: string; supplierId: string; items: { name: string; quantity: number; costPerUnit: number; receivedQuantity: number }[]; status: string; receivedDate?: string; createdAt: number }[] = JSON.parse(raw);
      return pos
        .filter(po => po.status === 'received' || po.status === 'partial')
        .map(po => {
          const totalCost = po.items.reduce((s, i) => s + i.receivedQuantity * i.costPerUnit, 0);
          return {
            id: `po_${po.id}`,
            date: po.receivedDate || new Date(po.createdAt).toISOString().split('T')[0],
            amount: totalCost,
            category: 'Food Cost',
            subcategory: 'Purchase Order',
            supplierId: po.supplierId,
            supplierName: po.supplierName,
            paymentMethod: '–',
            notes: `PO-${po.id.slice(-6)} (${po.items.length} items)`,
            type: 'COGS' as const,
            createdAt: po.createdAt,
          };
        })
        .filter(e => e.amount > 0);
    } catch { return []; }
  }, [restaurant.id]);

  // ─── Subscription billing → auto OPEX expenses ───
  const billingExpenses: Expense[] = useMemo(() => {
    if (!subscription) return [];
    const plan = PRICING_PLANS.find(p => p.id === subscription.plan_id);
    if (!plan) return [];
    const isAnnual = subscription.billing_interval === 'annual';
    const trialEnd = new Date(subscription.trial_end);
    const subStart = new Date(subscription.trial_start);
    const now = new Date();
    const entries: Expense[] = [];
    const cursor = new Date(subStart.getFullYear(), subStart.getMonth(), 1);
    while (cursor <= now) {
      const inTrial = cursor < trialEnd;
      const amount = inTrial ? plan.trialPrice : (isAnnual ? plan.annualPrice : plan.price);
      if (amount > 0) {
        const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        entries.push({
          id: `billing_${cursor.getFullYear()}_${cursor.getMonth()}`,
          date: cursor.toISOString().split('T')[0],
          amount,
          category: 'Platform Subscription',
          subcategory: inTrial ? 'Trial Fee' : 'Subscription Fee',
          paymentMethod: 'Card',
          notes: `QuickServe ${plan.name} – ${monthLabel}`,
          type: 'OPEX' as const,
          createdAt: cursor.getTime(),
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return entries;
  }, [subscription]);

  // ─── Date range filter ───
  const today = new Date();
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => today.toISOString().split('T')[0]);

  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'custom') {
      return { startDate: new Date(customStart), endDate: new Date(customEnd + 'T23:59:59') };
    }
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const start = new Date(); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: new Date() };
  }, [dateRange, customStart, customEnd]);

  // ─── Expense filters ───
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');

  // ─── Report type ───
  const [reportType, setReportType] = useState<ReportType>('pl');

  // ─── Derived data ─────────────────────────────────────────────────────────

  const allExpenses = useMemo(() => [...expenses, ...poExpenses, ...billingExpenses], [expenses, poExpenses, billingExpenses]);

  const filteredExpenses = useMemo(() => {
    return allExpenses.filter(e => {
      const d = new Date(e.date);
      if (d < startDate || d > endDate) return false;
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterSubcategory && e.subcategory !== filterSubcategory) return false;
      if (filterSupplier && e.supplierId !== filterSupplier) return false;
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        if (!e.category.toLowerCase().includes(q) && !e.subcategory.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q) && !(e.supplierName ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExpenses, startDate, endDate, filterCategory, filterSubcategory, filterSupplier, expenseSearch]);

  const totalRevenue = useMemo(() => {
    return orders
      .filter(o => {
        const t = new Date(o.timestamp);
        return o.status !== OrderStatus.CANCELLED && t >= startDate && t <= endDate;
      })
      .reduce((s, o) => s + o.total, 0);
  }, [orders, startDate, endDate]);

  const totals = useMemo(() => {
    const cogs = filteredExpenses.filter(e => e.type === 'COGS').reduce((s, e) => s + e.amount, 0);
    const opex = filteredExpenses.filter(e => e.type === 'OPEX').reduce((s, e) => s + e.amount, 0);
    const totalExp = cogs + opex;
    const grossProfit = totalRevenue - cogs;
    const netProfit = totalRevenue - totalExp;
    return { cogs, opex, totalExp, grossProfit, netProfit };
  }, [filteredExpenses, totalRevenue]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const cogsVsOpex = useMemo(() => [
    { name: 'COGS', value: totals.cogs },
    { name: 'OPEX', value: totals.opex },
  ], [totals]);

  // Monthly comparison (last 6 months)
  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; revenue: number; expenses: number; netProfit: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      months[key] = { month: key, revenue: 0, expenses: 0, netProfit: 0 };
    }
    orders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const d = new Date(o.timestamp);
      const key = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (months[key]) months[key].revenue += o.total;
    });
    allExpenses.forEach(e => {
      const d = new Date(e.date);
      const key = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (months[key]) months[key].expenses += e.amount;
    });
    return Object.values(months).map(m => ({ ...m, netProfit: m.revenue - m.expenses }));
  }, [orders, allExpenses]);

  // ─── Date Range Picker ────────────────────────────────────────────────────
  const DateRangePicker = () => (
    <div className="flex items-center gap-2 flex-wrap">
      {(['7d', '30d', '90d'] as const).map(r => (
        <button key={r} onClick={() => setDateRange(r)}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${dateRange === r ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
          {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
        </button>
      ))}
      <button onClick={() => setDateRange('custom')}
        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${dateRange === 'custom' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
        Custom
      </button>
      {dateRange === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
          <span className="text-xs text-gray-500">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
        </div>
      )}
    </div>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-gray-600 dark:text-gray-300" style={{ color: p.color }}>
            {p.name}: <span className="font-bold">{currencySymbol}{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ─── Sub-nav tabs ─────────────────────────────────────────────────────────
  const subTabs: { key: FinanceSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
    { key: 'reports', label: 'Reports', icon: <Activity size={14} /> },
  ];

  // ─── Filter sub-categories based on selected category ────────────────────
  const filterSubcatOptions = useMemo(
    () => FINANCE_CATEGORIES.find(c => c.name === filterCategory)?.subcategories ?? [],
    [filterCategory],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black dark:text-white">Finance</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Track expenses, revenue, and profitability</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6 w-fit">
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subTab === t.key ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* OVERVIEW                              */}
      {/* ══════════════════════════════════════ */}
      {subTab === 'overview' && (
        <div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Sales', value: fmt(totalRevenue), positive: totalRevenue >= 0, icon: <DollarSign size={18} className="text-amber-600 dark:text-amber-400" />, bg: 'bg-amber-100 dark:bg-amber-600/20' },
              { label: 'Total Expenses', value: fmt(totals.totalExp), positive: false, icon: <TrendingDown size={18} className="text-red-600 dark:text-red-400" />, bg: 'bg-red-100 dark:bg-red-600/20' },
              { label: 'Gross Profit', value: fmt(totals.grossProfit), positive: totals.grossProfit >= 0, icon: <TrendingUp size={18} className="text-blue-600 dark:text-blue-400" />, bg: 'bg-blue-100 dark:bg-blue-600/20' },
              { label: 'Net Profit', value: fmt(totals.netProfit), positive: totals.netProfit >= 0, icon: totals.netProfit >= 0 ? <ArrowUpRight size={18} className="text-green-600 dark:text-green-400" /> : <ArrowDownRight size={18} className="text-red-600 dark:text-red-400" />, bg: totals.netProfit >= 0 ? 'bg-green-100 dark:bg-green-600/20' : 'bg-red-100 dark:bg-red-600/20' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</div>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{kpi.label}</span>
                </div>
                <p className={`text-xl font-black ${kpi.label === 'Net Profit' ? (totals.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-gray-900 dark:text-white'}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* COGS vs OPEX & Top Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* COGS vs OPEX Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-4">COGS vs OPEX</h3>
              {totals.totalExp > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={cogsVsOpex} barSize={56}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]}>
                        {cogsVsOpex.map((_, i) => <Cell key={i} fill={i === 0 ? '#D97706' : '#3B82F6'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 justify-center mt-2">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-600" /><span className="text-xs text-gray-500 dark:text-gray-400">COGS</span><span className="text-xs font-bold dark:text-white">{fmt(totals.cogs)}</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-xs text-gray-500 dark:text-gray-400">OPEX</span><span className="text-xs font-bold dark:text-white">{fmt(totals.opex)}</span></div>
                  </div>
                </>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <PieChartIcon size={36} className="mb-2 opacity-30" />
                  <p className="text-sm font-bold">No expense data</p>
                  <p className="text-xs mt-1">Add expenses to see breakdown</p>
                </div>
              )}
            </div>

            {/* Top Expenses by Category */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-4">Top Expenses by Category</h3>
              {categoryBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {categoryBreakdown.map((cat, i) => {
                    const max = categoryBreakdown[0].value;
                    const pct = max > 0 ? (cat.value / max) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-xs font-bold dark:text-white">{cat.name}</span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{fmt(cat.value)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <AlertCircle size={36} className="mb-2 opacity-30" />
                  <p className="text-sm font-bold">No expenses yet</p>
                  <p className="text-xs mt-1">Record expenses to see analytics</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick P&L summary */}
          <div className="mt-4 bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-4">P&amp;L Quick Summary</h3>
            <div className="space-y-2">
              {[
                { label: 'Revenue', value: totalRevenue, color: 'text-gray-900 dark:text-white' },
                { label: 'Cost of Goods Sold (COGS)', value: -totals.cogs, color: 'text-red-600 dark:text-red-400', indent: true },
                { label: 'Gross Profit', value: totals.grossProfit, color: totals.grossProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400', bold: true },
                { label: 'Operating Expenses (OPEX)', value: -totals.opex, color: 'text-red-600 dark:text-red-400', indent: true },
                { label: 'Net Profit', value: totals.netProfit, color: totals.netProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400', bold: true, border: true },
              ].map(row => (
                <div key={row.label} className={`flex items-center justify-between py-2 ${row.border ? 'border-t-2 border-gray-200 dark:border-gray-700 mt-2 pt-3' : ''}`}>
                  <span className={`text-sm ${row.bold ? 'font-black' : 'font-medium'} ${row.indent ? 'pl-4 text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>{row.label}</span>
                  <span className={`text-sm font-black ${row.color}`}>{row.value < 0 ? `-${fmt(Math.abs(row.value))}` : fmt(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* REPORTS                               */}
      {/* ══════════════════════════════════════ */}
      {subTab === 'reports' && (
        <div>
          {/* Document-style tab bar */}
          {(() => {
            const reportTabs: { key: ReportType; label: string; icon: React.ReactNode }[] = [
              { key: 'pl', label: 'Profit & Loss', icon: <FileText size={13} /> },
              { key: 'breakdown', label: 'Expense Breakdown', icon: <PieChartIcon size={13} /> },
              { key: 'monthly', label: 'Monthly Comparison', icon: <Activity size={13} /> },
            ];
            return (
              <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-0">
                {reportTabs.map(r => (
                  <button key={r.key} onClick={() => setReportType(r.key)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider border border-b-0 rounded-t-xl transition-all -mb-px ${
                      reportType === r.key
                        ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 border-gray-200 dark:border-gray-700 relative z-10'
                        : 'bg-gray-100 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}>
                    {r.icon} {r.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* ── Profit & Loss ── */}
          {reportType === 'pl' && (
            <div className="bg-white dark:bg-gray-800 rounded-b-2xl rounded-tr-2xl border border-gray-200 dark:border-gray-700 border-t-0 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-black text-gray-900 dark:text-white">Profit &amp; Loss Statement</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {dateRange === 'custom' ? `${customStart} – ${customEnd}` : `Last ${dateRange === '7d' ? '7' : dateRange === '30d' ? '30' : '90'} days`}
                </p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {[
                  { label: 'Revenue', value: totalRevenue, level: 0, highlight: false },
                  { label: 'Cost of Goods Sold (COGS)', value: totals.cogs, level: 1, negative: true, highlight: false },
                  { label: 'Gross Profit', value: totals.grossProfit, level: 0, highlight: true, green: totals.grossProfit >= 0 },
                  { label: 'Operating Expenses (OPEX)', value: totals.opex, level: 1, negative: true, highlight: false },
                  ...categoryBreakdown.filter(c => getCategoryType(c.name) === 'OPEX').map(c => ({
                    label: c.name, value: c.value, level: 2, negative: true, highlight: false, sub: true,
                  })),
                  { label: 'Net Profit', value: totals.netProfit, level: 0, highlight: true, green: totals.netProfit >= 0 },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center justify-between px-6 py-3 ${row.highlight ? ((row as any).green ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10') : ''}`}>
                    <span className={`text-sm ${row.highlight ? 'font-black' : (row as any).sub ? 'pl-8 text-[11px] text-gray-500 dark:text-gray-400' : row.level === 1 ? 'pl-4 text-gray-600 dark:text-gray-300 font-medium' : 'font-bold text-gray-700 dark:text-gray-200'}`}>
                      {row.label}
                    </span>
                    <span className={`text-sm font-black ${row.highlight ? ((row as any).green ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : (row as any).negative ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                      {(row as any).negative ? `(${fmt(row.value)})` : fmt(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Expense Breakdown (pie) ── */}
          {reportType === 'breakdown' && (
            <div className="bg-white dark:bg-gray-800 rounded-b-2xl rounded-tr-2xl p-6 border border-gray-200 dark:border-gray-700 border-t-0 shadow-sm">
              <h3 className="font-black text-gray-900 dark:text-white mb-4">Expense Breakdown by Category</h3>
              {categoryBreakdown.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value" stroke="none">
                        {categoryBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const pct = totals.totalExp > 0 ? ((d.value / totals.totalExp) * 100).toFixed(1) : '0';
                        return (
                          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl">
                            <p className="text-xs font-bold text-gray-900 dark:text-white">{d.name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">{fmt(d.value)} ({pct}%)</p>
                          </div>
                        );
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {categoryBreakdown.map((cat, i) => {
                      const pct = totals.totalExp > 0 ? ((cat.value / totals.totalExp) * 100).toFixed(1) : '0';
                      return (
                        <div key={cat.name} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-sm flex-1 dark:text-gray-300">{cat.name}</span>
                          <span className="text-xs text-gray-500">{pct}%</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white w-28 text-right">{fmt(cat.value)}</span>
                        </div>
                      );
                    })}
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                      <span className="text-sm font-black dark:text-white">Total</span>
                      <span className="text-sm font-black text-red-600 dark:text-red-400">{fmt(totals.totalExp)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <PieChartIcon size={40} className="mb-3 opacity-30" />
                  <p className="text-sm font-bold">No expense data available</p>
                </div>
              )}
            </div>
          )}

          {/* ── Monthly Comparison (line) ── */}
          {reportType === 'monthly' && (
            <div className="bg-white dark:bg-gray-800 rounded-b-2xl rounded-tr-2xl p-6 border border-gray-200 dark:border-gray-700 border-t-0 shadow-sm">
              <h3 className="font-black text-gray-900 dark:text-white mb-4">Monthly Comparison (Last 6 Months)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={monthlyData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22C55E" strokeWidth={2} dot={{ r: 4, fill: '#22C55E' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2} dot={{ r: 4, fill: '#EF4444' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#3B82F6" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, fill: '#3B82F6' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              {/* Monthly table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                      <th className="py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Expenses</th>
                      <th className="py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(row => (
                      <tr key={row.month} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 font-medium dark:text-gray-300">{row.month}</td>
                        <td className="py-2 text-right text-green-600 dark:text-green-400 font-bold">{fmt(row.revenue)}</td>
                        <td className="py-2 text-right text-red-600 dark:text-red-400 font-bold">{fmt(row.expenses)}</td>
                        <td className={`py-2 text-right font-black ${row.netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(row.netProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FinanceView;
