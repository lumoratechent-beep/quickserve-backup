import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus } from '../src/types';
import { loadBackofficeData, syncBackofficeToDb } from '../lib/sharedSettings';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, Plus, Search, Edit3, Trash2, Filter,
  ChevronDown, X, Paperclip, FileText, BarChart3, PieChart as PieChartIcon, Activity,
  AlertCircle, Receipt, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const FINANCE_CATEGORIES: { name: string; subcategories: string[]; type: 'COGS' | 'OPEX' }[] = [
  { name: 'Staff', subcategories: ['Salary', 'Claims', 'Benefits', 'Staff Meals'], type: 'OPEX' },
  { name: 'Food Cost', subcategories: ['Ingredients', 'Beverages', 'Packaging', 'Wastage/Spoilage'], type: 'COGS' },
  { name: 'Bills', subcategories: ['Utilities', 'Internet', 'Maintenance', 'Cleaning'], type: 'OPEX' },
  { name: 'Rent & Occupancy', subcategories: ['Rent', 'Property Tax', 'Security'], type: 'OPEX' },
  { name: 'Marketing', subcategories: ['Advertising', 'Promotions', 'Loyalty Programs'], type: 'OPEX' },
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

type FinanceSubTab = 'overview' | 'expenses' | 'reports';
type ReportType = 'pl' | 'breakdown' | 'monthly';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  currencySymbol: string;
  initialSubTab?: string;
}

// ─── Helper: derive expense type from category ────────────────────────────────
function getCategoryType(categoryName: string): 'COGS' | 'OPEX' {
  const found = FINANCE_CATEGORIES.find(c => c.name === categoryName);
  return found ? found.type : 'OPEX';
}

// ─── Component ────────────────────────────────────────────────────────────────

const FinanceView: React.FC<Props> = ({ restaurant, orders, currencySymbol, initialSubTab }) => {
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
    return v === 'expenses' || v === 'reports' ? v : 'overview';
  });
  useEffect(() => {
    if (initialSubTab) {
      const v = initialSubTab as FinanceSubTab;
      setSubTab(v === 'expenses' || v === 'reports' ? v : 'overview');
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

  // ─── Add/Edit modal ───
  const blankForm = (): Omit<Expense, 'id' | 'createdAt' | 'type'> => ({
    date: today.toISOString().split('T')[0],
    amount: 0,
    category: '',
    subcategory: '',
    supplierId: '',
    supplierName: '',
    paymentMethod: 'Cash',
    notes: '',
    attachmentName: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subcategoryOptions = useMemo(
    () => FINANCE_CATEGORIES.find(c => c.name === form.category)?.subcategories ?? [],
    [form.category],
  );

  const openAdd = () => { setEditingId(null); setForm(blankForm()); setShowForm(true); };
  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({ date: e.date, amount: e.amount, category: e.category, subcategory: e.subcategory, supplierId: e.supplierId ?? '', supplierName: e.supplierName ?? '', paymentMethod: e.paymentMethod, notes: e.notes, attachmentName: e.attachmentName ?? '' });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.date || !form.amount || !form.category || !form.subcategory) return;
    const type = getCategoryType(form.category);
    const supplier = suppliers.find(s => s.id === form.supplierId);
    const entry: Expense = {
      id: editingId ?? `exp_${Date.now()}`,
      ...form,
      amount: Number(form.amount),
      supplierName: supplier?.name ?? '',
      type,
      createdAt: editingId ? (expenses.find(e => e.id === editingId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const updated = editingId
      ? expenses.map(e => e.id === editingId ? entry : e)
      : [...expenses, entry];
    saveExpenses(updated);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this expense?')) return;
    saveExpenses(expenses.filter(e => e.id !== id));
  };

  // ─── Derived data ─────────────────────────────────────────────────────────

  const allExpenses = useMemo(() => [...expenses, ...poExpenses], [expenses, poExpenses]);

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
    { key: 'expenses', label: 'Expenses', icon: <Receipt size={14} /> },
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
      {/* EXPENSES                              */}
      {/* ══════════════════════════════════════ */}
      {subTab === 'expenses' && (
        <div>
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search expenses..." value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)}
                  className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-44" />
              </div>
              <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory(''); }}
                className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                <option value="">All Categories</option>
                {FINANCE_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              {filterSubcatOptions.length > 0 && (
                <select value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)}
                  className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">All Subcategories</option>
                  {filterSubcatOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {suppliers.length > 0 && (
                <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                  className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">All Suppliers</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              {(filterCategory || filterSubcategory || filterSupplier || expenseSearch) && (
                <button onClick={() => { setFilterCategory(''); setFilterSubcategory(''); setFilterSupplier(''); setExpenseSearch(''); }}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">
                  <X size={12} /> Clear
                </button>
              )}
            </div>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20 shrink-0">
              <Plus size={14} /> Add Expense
            </button>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Expenses', value: fmt(totals.totalExp) },
              { label: 'COGS', value: fmt(totals.cogs) },
              { label: 'OPEX', value: fmt(totals.opex) },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{s.label}</p>
                <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Expense table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filteredExpenses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Subcategory</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Supplier</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Payment</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Notes</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(e => (
                      <tr key={e.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-md">{e.category}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.subcategory}</td>
                        <td className="px-4 py-3 text-sm font-black text-gray-900 dark:text-white">{fmt(e.amount)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{e.supplierName || '–'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.paymentMethod}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${e.type === 'COGS' ? 'bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400'}`}>{e.type}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-[140px] truncate">{e.notes || '–'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {e.attachmentName && (
                              <span title={e.attachmentName} className="p-1.5 rounded-lg text-gray-400 cursor-default"><Paperclip size={13} /></span>
                            )}
                            {e.id.startsWith('po_') ? (
                              <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700" title="Managed from Inventory > Purchase Orders">Auto</span>
                            ) : (
                              <>
                                <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"><Edit3 size={13} /></button>
                                <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"><Trash2 size={13} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <FileText size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No expenses found</p>
                <p className="text-xs mt-1">{filterCategory || filterSubcategory || filterSupplier || expenseSearch ? 'Try adjusting filters' : 'Click "Add Expense" to record your first expense'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* REPORTS                               */}
      {/* ══════════════════════════════════════ */}
      {subTab === 'reports' && (
        <div>
          {/* Report type selector */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {([
              { key: 'pl', label: 'Profit & Loss', icon: <FileText size={13} /> },
              { key: 'breakdown', label: 'Expense Breakdown', icon: <PieChartIcon size={13} /> },
              { key: 'monthly', label: 'Monthly Comparison', icon: <Activity size={13} /> },
            ] as { key: ReportType; label: string; icon: React.ReactNode }[]).map(r => (
              <button key={r.key} onClick={() => setReportType(r.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${reportType === r.key ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                {r.icon} {r.label}
              </button>
            ))}
          </div>

          {/* ── Profit & Loss ── */}
          {reportType === 'pl' && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
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

      {/* ══════════════════════════════════════ */}
      {/* ADD / EDIT EXPENSE MODAL              */}
      {/* ══════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-black dark:text-white flex items-center gap-2">
                <Receipt size={18} className="text-amber-500" />
                {editingId ? 'Edit Expense' : 'Add Expense'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              {/* Amount */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Amount ({currencySymbol}) *</label>
                <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" placeholder="0.00" />
              </div>
              {/* Category */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Category *</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '' }))}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">Select category</option>
                  {FINANCE_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              {/* Subcategory */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Subcategory *</label>
                <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
                  disabled={!form.category}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50">
                  <option value="">Select subcategory</option>
                  {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Type (auto) */}
              {form.category && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Auto Type:</span>
                  <span className={`text-xs font-black px-2 py-1 rounded-md ${getCategoryType(form.category) === 'COGS' ? 'bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400'}`}>
                    {getCategoryType(form.category)}
                  </span>
                </div>
              )}
              {/* Supplier */}
              {suppliers.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Supplier</label>
                  <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">No supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {/* Payment Method */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Payment Method</label>
                <div className="flex gap-2 flex-wrap">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setForm(f => ({ ...f, paymentMethod: m }))}
                      className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${form.paymentMethod === m ? 'bg-amber-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none resize-none" placeholder="Optional notes..." />
              </div>
              {/* Attachment */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Attachment</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">
                    <Paperclip size={13} /> {form.attachmentName ? 'Change file' : 'Attach file'}
                  </button>
                  {form.attachmentName && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{form.attachmentName}</span>
                  )}
                  {form.attachmentName && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, attachmentName: '' }))} className="text-gray-400 hover:text-red-500 transition-colors"><X size={13} /></button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, attachmentName: f.name })); e.target.value = ''; }} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.date || !form.amount || !form.category || !form.subcategory}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all disabled:opacity-40 shadow-lg shadow-amber-600/20">
                {editingId ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceView;
