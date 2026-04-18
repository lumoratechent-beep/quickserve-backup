import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { loadBackofficeData, syncBackofficeToDb } from '../lib/sharedSettings';
import {
  Plus, Search, Edit3, Trash2,
  X, Paperclip, FileText, Users, Zap, Home,
  Megaphone, CreditCard, MoreHorizontal, Download, Printer,
  Receipt, ShoppingCart, Eye,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES: { key: string; name: string; subcategories: string[]; type: 'COGS' | 'OPEX'; icon: React.ReactNode; description: string }[] = [
  { key: 'staff', name: 'Staff', subcategories: ['Salary', 'Claims', 'Benefits', 'Staff Meals'], type: 'OPEX', icon: <Users size={14} />, description: 'Staff salary & payslips' },
  { key: 'food_cost', name: 'Food Cost', subcategories: ['Ingredients', 'Beverages', 'Packaging', 'Wastage/Spoilage', 'Purchase Order'], type: 'COGS', icon: <ShoppingCart size={14} />, description: 'Purchase orders & food costs' },
  { key: 'bills', name: 'Bills', subcategories: ['Utilities', 'Internet', 'Maintenance', 'Cleaning'], type: 'OPEX', icon: <Zap size={14} />, description: 'Electrical, utilities, etc.' },
  { key: 'rent', name: 'Rent & Occupancy', subcategories: ['Rent', 'Property Tax', 'Security'], type: 'OPEX', icon: <Home size={14} />, description: 'Rent & property costs' },
  { key: 'marketing', name: 'Marketing', subcategories: ['Advertising', 'Promotions', 'Loyalty Programs'], type: 'OPEX', icon: <Megaphone size={14} />, description: 'Ads & promotions' },
  { key: 'platform', name: 'Platform Subscription', subcategories: ['Subscription Fee', 'Trial Fee'], type: 'OPEX', icon: <CreditCard size={14} />, description: 'QuickServe subscriptions' },
  { key: 'others', name: 'Others', subcategories: ['Insurance', 'Licenses & Permits', 'Miscellaneous'], type: 'OPEX', icon: <MoreHorizontal size={14} />, description: 'User-defined expenses' },
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card'];

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
  // Payslip fields
  staffName?: string;
  staffRole?: string;
  basicSalary?: number;
  allowances?: number;
  deductions?: number;
  payPeriod?: string;
}

interface Supplier {
  id: string;
  name: string;
}

type ExpenseSubTab = 'staff' | 'food_cost' | 'bills' | 'rent' | 'marketing' | 'platform' | 'others' | 'all';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  currencySymbol: string;
  initialSubTab?: string;
  subscription?: Subscription | null;
  onNavigateToInventory?: (subTab: string) => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getCategoryType(categoryName: string): 'COGS' | 'OPEX' {
  const found = EXPENSE_CATEGORIES.find(c => c.name === categoryName);
  return found ? found.type : 'OPEX';
}

function getCategoryByKey(key: string) {
  return EXPENSE_CATEGORIES.find(c => c.key === key);
}

function shouldUseSupplier(categoryName: string) {
  return categoryName === 'Food Cost';
}

// ─── Component ────────────────────────────────────────────────────────────────

const ExpensesView: React.FC<Props> = ({ restaurant, orders, currencySymbol, initialSubTab, subscription, onNavigateToInventory }) => {
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

  // ─── Sub-tab ───
  const [subTab, setSubTab] = useState<ExpenseSubTab>(() => {
    const v = initialSubTab as ExpenseSubTab;
    const valid: ExpenseSubTab[] = ['staff', 'food_cost', 'bills', 'rent', 'marketing', 'platform', 'others', 'all'];
    return valid.includes(v) ? v : 'all';
  });
  useEffect(() => {
    if (initialSubTab) {
      const v = initialSubTab as ExpenseSubTab;
      const valid: ExpenseSubTab[] = ['staff', 'food_cost', 'bills', 'rent', 'marketing', 'platform', 'others', 'all'];
      if (valid.includes(v)) setSubTab(v);
    }
  }, [initialSubTab]);

  // ─── Expenses state (shared storage with FinanceView) ───
  const [expenses, setExpenses] = useState<Expense[]>(() => load('expenses', []));
  const saveExpenses = (data: Expense[]) => { setExpenses(data); save('expenses', data); };

  // ─── Staff list (for payslip) ───
  const staffList = useMemo(() => {
    try {
      const s = localStorage.getItem(`staff_${restaurant.id}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  }, [restaurant.id]);

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

  // ─── Search ───
  const [expenseSearch, setExpenseSearch] = useState('');

  // ─── Derived data ─────────────────────────────────────────────────────────
  const allExpenses = useMemo(() => [...expenses, ...poExpenses, ...billingExpenses], [expenses, poExpenses, billingExpenses]);

  const filterByCategory = (categoryName: string) => {
    return allExpenses.filter(e => {
      const d = new Date(e.date);
      if (d < startDate || d > endDate) return false;
      if (e.category !== categoryName) return false;
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        if (!e.subcategory.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q) && !(e.supplierName ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const filteredExpenses = useMemo(() => {
    const cat = getCategoryByKey(subTab);
    if (subTab === 'all' || !cat) {
      return allExpenses.filter(e => {
        const d = new Date(e.date);
        if (d < startDate || d > endDate) return false;
        if (expenseSearch) {
          const q = expenseSearch.toLowerCase();
          if (!e.category.toLowerCase().includes(q) && !e.subcategory.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q) && !(e.supplierName ?? '').toLowerCase().includes(q)) return false;
        }
        return true;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return filterByCategory(cat.name);
  }, [allExpenses, subTab, startDate, endDate, expenseSearch]);

  const totalFiltered = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);
  const showSupplierColumn = useMemo(() => filteredExpenses.some(e => Boolean(e.supplierName)), [filteredExpenses]);

  // ─── Add/Edit modal ───
  const currentCat = getCategoryByKey(subTab);
  const blankForm = (): Omit<Expense, 'id' | 'createdAt' | 'type'> => ({
    date: today.toISOString().split('T')[0],
    amount: 0,
    category: currentCat?.name ?? '',
    subcategory: '',
    supplierId: '',
    supplierName: '',
    paymentMethod: 'Cash',
    notes: '',
    attachmentName: '',
    staffName: '',
    staffRole: '',
    basicSalary: 0,
    allowances: 0,
    deductions: 0,
    payPeriod: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Payslip preview ───
  const [showPayslip, setShowPayslip] = useState(false);
  const [payslipExpense, setPayslipExpense] = useState<Expense | null>(null);

  const subcategoryOptions = useMemo(() => {
    const cat = EXPENSE_CATEGORIES.find(c => c.name === form.category);
    return cat?.subcategories ?? [];
  }, [form.category]);
  const formCategory = useMemo(
    () => EXPENSE_CATEGORIES.find(c => c.name === form.category),
    [form.category],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(blankForm());
    setShowForm(true);
  };
  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      date: e.date, amount: e.amount, category: e.category, subcategory: e.subcategory,
      supplierId: e.supplierId ?? '', supplierName: e.supplierName ?? '', paymentMethod: e.paymentMethod,
      notes: e.notes, attachmentName: e.attachmentName ?? '',
      staffName: e.staffName ?? '', staffRole: e.staffRole ?? '',
      basicSalary: e.basicSalary ?? 0, allowances: e.allowances ?? 0, deductions: e.deductions ?? 0,
      payPeriod: e.payPeriod ?? '',
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.date || !form.category || !form.subcategory) return;
    const isPayslip = form.category === 'Staff' && form.subcategory === 'Salary';
    const finalAmount = isPayslip ? ((form.basicSalary || 0) + (form.allowances || 0) - (form.deductions || 0)) : Number(form.amount);
    if (finalAmount <= 0) return;
    const type = getCategoryType(form.category);
    const supplierEnabled = shouldUseSupplier(form.category);
    const supplier = supplierEnabled ? suppliers.find(s => s.id === form.supplierId) : undefined;
    const entry: Expense = {
      id: editingId ?? `exp_${Date.now()}`,
      ...form,
      amount: finalAmount,
      supplierId: supplierEnabled ? form.supplierId : '',
      supplierName: supplierEnabled ? (supplier?.name ?? '') : '',
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

  // ─── CSV Download ─────────────────────────────────────────────────────────
  const downloadCSV = () => {
    const headers = ['Date', 'Category', 'Subcategory', 'Amount', 'Supplier', 'Payment Method', 'Type', 'Notes'];
    const rows = filteredExpenses.map(e => [
      new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
      e.category,
      e.subcategory,
      e.amount.toFixed(2),
      e.supplierName || '–',
      e.paymentMethod,
      e.type,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${subTab}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fieldShellClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-amber-300 focus:ring-2 focus:ring-amber-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white';
  const fieldLabelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400';
  const paymentButtonClass = (isActive: boolean) => `rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all ${isActive ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-white text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700/70'}`;

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

  // ─── Payslip Modal ────────────────────────────────────────────────────────
  const PayslipPreview = ({ expense, onClose }: { expense: Expense; onClose: () => void }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const handlePrint = () => {
      const content = printRef.current;
      if (!content) return;
      const w = window.open('', '_blank', 'width=600,height=800');
      if (!w) return;
      w.document.write(`<html><head><title>Payslip - ${expense.staffName}</title><style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #D97706; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { font-size: 20px; color: #D97706; margin: 0; }
        .header p { font-size: 12px; color: #666; margin: 4px 0 0; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
        .info-item label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; display: block; }
        .info-item span { font-size: 14px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
        th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; }
        .total-row { border-top: 2px solid #333; font-weight: bold; font-size: 15px; }
        .footer { text-align: center; font-size: 10px; color: #999; margin-top: 40px; border-top: 1px solid #eee; padding-top: 16px; }
      </style></head><body>${content.innerHTML}</body></html>`);
      w.document.close();
      w.print();
    };
    return (
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-black dark:text-white flex items-center gap-2"><FileText size={16} className="text-amber-500" /> Payslip</h3>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all"><Printer size={12} /> Print</button>
              <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"><X size={16} /></button>
            </div>
          </div>
          <div ref={printRef} className="p-6">
            <div className="text-center border-b-2 border-amber-500 pb-4 mb-6">
              <h1 className="text-lg font-black text-amber-600 dark:text-amber-400">{restaurant.name}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Payslip</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Employee</label><span className="text-sm font-bold dark:text-white">{expense.staffName || '–'}</span></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Role</label><span className="text-sm font-bold dark:text-white">{expense.staffRole || '–'}</span></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pay Period</label><span className="text-sm font-bold dark:text-white">{expense.payPeriod || '–'}</span></div>
              <div><label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Payment Date</label><span className="text-sm font-bold dark:text-white">{new Date(expense.date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            </div>
            <table className="w-full text-sm mb-6">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700"><th className="py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Description</th><th className="py-2 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Amount</th></tr></thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Basic Salary</td><td className="py-2.5 text-right font-bold dark:text-white">{fmt(expense.basicSalary || 0)}</td></tr>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Allowances</td><td className="py-2.5 text-right font-bold text-green-600 dark:text-green-400">+{fmt(expense.allowances || 0)}</td></tr>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Deductions</td><td className="py-2.5 text-right font-bold text-red-600 dark:text-red-400">-{fmt(expense.deductions || 0)}</td></tr>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600"><td className="py-3 font-black dark:text-white">Net Pay</td><td className="py-3 text-right font-black text-lg dark:text-white">{fmt(expense.amount)}</td></tr>
              </tbody>
            </table>
            <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
              Generated by {restaurant.name} • {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Is payslip form? ─────────────────────────────────────────────────────
  const isPayslipMode = form.category === 'Staff' && form.subcategory === 'Salary';
  const supplierEnabled = shouldUseSupplier(form.category);
  const primaryModalTitle = editingId
    ? (isPayslipMode ? 'Edit Staff Expense' : 'Edit Expense')
    : (subTab === 'staff' || isPayslipMode ? 'Add Staff Expense' : 'Add Expense');
  const modalSubtitle = isPayslipMode
    ? 'Capture salary, allowances, deductions, and generate a clean staff expense record.'
    : 'Add a clean expense entry with only the fields that matter for this category.';
  const netPayPreview = (form.basicSalary || 0) + (form.allowances || 0) - (form.deductions || 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black dark:text-white">Expenses</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {subTab === 'all' ? 'All expense records' : (currentCat?.description ?? 'Manage expenses')}
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {subTab === 'all' ? 'Total Expenses' : `${currentCat?.name ?? 'Total'}`}
          </p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{fmt(totalFiltered)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Records</p>
          <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{filteredExpenses.length}</p>
        </div>
        {subTab === 'all' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categories</p>
            <p className="text-lg font-black text-gray-900 dark:text-white mt-1">{new Set(filteredExpenses.map(e => e.category)).size}</p>
          </div>
        )}
      </div>

      {/* Food Cost: link to Purchase Orders */}
      {subTab === 'food_cost' && (
        <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart size={16} className="text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Purchase Orders auto-sync here</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500">Received POs from Inventory are automatically listed as Food Cost expenses.</p>
            </div>
          </div>
          {onNavigateToInventory && (
            <button onClick={() => onNavigateToInventory('purchase_orders')}
              className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shrink-0">
              Go to PO
            </button>
          )}
        </div>
      )}

      {/* Platform Subscription: auto info */}
      {subTab === 'platform' && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl flex items-center gap-3">
          <CreditCard size={16} className="text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300">QuickServe subscription charges are auto-tracked</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-500">
              {subscription ? `Current plan: ${PRICING_PLANS.find(p => p.id === subscription.plan_id)?.name ?? subscription.plan_id} (${subscription.billing_interval ?? 'monthly'})` : 'No active subscription'}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search..." value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)}
              className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-44" />
          </div>
          {expenseSearch && (
            <button onClick={() => setExpenseSearch('')}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">
              <X size={12} /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">
            <Download size={14} /> Download CSV
          </button>
          {/* Don't show Add for auto-only tabs (platform & food_cost PO entries) */}
          {subTab !== 'platform' && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20 shrink-0">
              <Plus size={14} /> {subTab === 'staff' ? 'Add Staff Expense' : 'Add Expense'}
            </button>
          )}
        </div>
      </div>

      {/* Expense table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  {subTab === 'all' && <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>}
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subcategory</th>
                  {subTab === 'staff' && <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Employee</th>}
                  <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  {showSupplierColumn && <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Supplier</th>}
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
                    {subTab === 'all' && (
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-md">{e.category}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{e.subcategory}</td>
                    {subTab === 'staff' && <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{e.staffName || '–'}</td>}
                    <td className="px-4 py-3 text-sm font-black text-gray-900 dark:text-white">{fmt(e.amount)}</td>
                    {showSupplierColumn && <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{e.supplierName || '–'}</td>}
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
                        {/* Payslip view button for staff salary */}
                        {e.category === 'Staff' && e.subcategory === 'Salary' && e.staffName && (
                          <button onClick={() => { setPayslipExpense(e); setShowPayslip(true); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all" title="View Payslip">
                            <Eye size={13} />
                          </button>
                        )}
                        {e.id.startsWith('po_') || e.id.startsWith('billing_') ? (
                          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700" title={e.id.startsWith('po_') ? 'Managed from Inventory > Purchase Orders' : 'Auto from subscription'}>Auto</span>
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
            <p className="text-xs mt-1">{expenseSearch ? 'Try adjusting your search' : `No ${currentCat?.name ?? ''} expenses in this period`}</p>
          </div>
        )}
      </div>

      {/* Total bar */}
      {filteredExpenses.length > 0 && (
        <div className="flex items-center justify-between mt-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total ({filteredExpenses.length} records)</span>
          <span className="text-base font-black text-gray-900 dark:text-white">{fmt(totalFiltered)}</span>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ADD / EDIT EXPENSE MODAL              */}
      {/* ══════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-orange-50 p-5 dark:from-amber-900/20 dark:via-gray-900 dark:to-orange-900/10">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                    <Receipt size={18} />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white">{primaryModalTitle}</h3>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{modalSubtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <span className="rounded-full bg-white px-3 py-1 text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">{formCategory?.name || currentCat?.name || 'Select Category'}</span>
                  {form.category && (
                    <span className={`rounded-full px-3 py-1 ${getCategoryType(form.category) === 'COGS' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                      {getCategoryType(form.category)}
                    </span>
                  )}
                  {isPayslipMode && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Staff Payroll</span>
                  )}
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="rounded-xl p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"><X size={18} /></button>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50">
                <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Expense Details</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className={fieldLabelClass}>Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      className={fieldShellClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={fieldLabelClass}>Category</label>
                    {subTab !== 'all' && currentCat ? (
                      <div className={`${fieldShellClass} flex items-center justify-between bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200`}>
                        <span>{currentCat.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Locked</span>
                      </div>
                    ) : (
                      <select
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '', supplierId: '', supplierName: '' }))}
                        className={fieldShellClass}
                      >
                        <option value="">Select category</option>
                        {EXPENSE_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className={fieldLabelClass}>Subcategory</label>
                    <select
                      value={form.subcategory}
                      onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
                      disabled={!form.category}
                      className={`${fieldShellClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <option value="">Select subcategory</option>
                      {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {isPayslipMode ? (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50">
                    <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Staff Details</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <label className={fieldLabelClass}>Employee Name</label>
                        {staffList.length > 0 ? (
                          <select
                            value={form.staffName}
                            onChange={e => {
                              const staff = staffList.find((s: any) => s.username === e.target.value);
                              setForm(f => ({ ...f, staffName: e.target.value, staffRole: staff?.role ?? '' }));
                            }}
                            className={fieldShellClass}
                          >
                            <option value="">Select employee</option>
                            {staffList.map((s: any) => <option key={s.id} value={s.username}>{s.username} ({s.role})</option>)}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Type employee name"
                            value={form.staffName}
                            onChange={e => setForm(f => ({ ...f, staffName: e.target.value }))}
                            className={fieldShellClass}
                          />
                        )}
                        {staffList.length === 0 && (
                          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">No staff found in Staff Management yet. You can still enter the employee manually.</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className={fieldLabelClass}>Role</label>
                        <input
                          type="text"
                          value={form.staffRole}
                          onChange={e => setForm(f => ({ ...f, staffRole: e.target.value }))}
                          placeholder="e.g. Cashier, Kitchen"
                          className={fieldShellClass}
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className={fieldLabelClass}>Pay Period</label>
                        <input
                          type="text"
                          value={form.payPeriod}
                          onChange={e => setForm(f => ({ ...f, payPeriod: e.target.value }))}
                          placeholder="e.g. January 2026"
                          className={fieldShellClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50">
                    <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Compensation Breakdown</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="space-y-1">
                        <label className={fieldLabelClass}>Basic Salary ({currencySymbol})</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.basicSalary || ''}
                          onChange={e => setForm(f => ({ ...f, basicSalary: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          className={fieldShellClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`${fieldLabelClass} text-emerald-500 dark:text-emerald-400`}>Allowances</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.allowances || ''}
                          onChange={e => setForm(f => ({ ...f, allowances: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          className={fieldShellClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={`${fieldLabelClass} text-rose-500 dark:text-rose-400`}>Deductions</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.deductions || ''}
                          onChange={e => setForm(f => ({ ...f, deductions: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          className={fieldShellClass}
                        />
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-4 dark:border-amber-800/30 dark:from-amber-900/20 dark:to-orange-900/10">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Net Staff Expense</p>
                          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">This amount will be stored as the final staff expense record.</p>
                        </div>
                        <span className="text-xl font-black text-amber-700 dark:text-amber-300">{fmt(netPayPreview)}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50">
                  <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Amount</h4>
                  <div className="space-y-1">
                    <label className={fieldLabelClass}>Amount ({currencySymbol})</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount || ''}
                      onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                      className={fieldShellClass}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/50">
                <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Extra Details</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {supplierEnabled && suppliers.length > 0 && (
                    <div className="space-y-1">
                      <label className={fieldLabelClass}>Supplier</label>
                      <select
                        value={form.supplierId}
                        onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                        className={fieldShellClass}
                      >
                        <option value="">No supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1 md:col-span-1">
                    <label className={fieldLabelClass}>Payment Method</label>
                    <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                      {PAYMENT_METHODS.map(m => (
                        <button key={m} type="button" onClick={() => setForm(f => ({ ...f, paymentMethod: m }))} className={paymentButtonClass(form.paymentMethod === m)}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`space-y-1 ${supplierEnabled && suppliers.length > 0 ? 'md:col-span-2' : 'md:col-span-2'}`}>
                    <label className={fieldLabelClass}>Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      placeholder="Optional notes, references, or context..."
                      className={`${fieldShellClass} resize-none`}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className={fieldLabelClass}>Attachment</label>
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Upload receipt or supporting file</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Accepted: images, PDF, DOC, DOCX</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 transition-all hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          >
                            <Paperclip size={13} /> {form.attachmentName ? 'Change file' : 'Attach file'}
                          </button>
                          {form.attachmentName && (
                            <button type="button" onClick={() => setForm(f => ({ ...f, attachmentName: '' }))} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      {form.attachmentName && (
                        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                          {form.attachmentName}
                        </div>
                      )}
                      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, attachmentName: f.name })); e.target.value = ''; }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-gray-700 sm:flex-row sm:justify-end">
              <button onClick={() => setShowForm(false)} className="rounded-xl bg-gray-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-600 transition-all hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.date || !form.category || !form.subcategory || (isPayslipMode ? !form.staffName || netPayPreview <= 0 : !form.amount)}
                className="rounded-xl bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {editingId ? 'Save Changes' : (isPayslipMode ? 'Add Staff Expense' : 'Add Expense')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Preview Modal */}
      {showPayslip && payslipExpense && (
        <PayslipPreview expense={payslipExpense} onClose={() => { setShowPayslip(false); setPayslipExpense(null); }} />
      )}
    </div>
  );
};

export default ExpensesView;
