import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Restaurant, Order, OrderStatus, Subscription } from '../src/types';
import { PRICING_PLANS } from '../lib/pricingPlans';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, Plus, Search, Edit3, Trash2,
  X, Paperclip, FileText, Users, Zap, Home,
  Megaphone, CreditCard, MoreHorizontal, Download, Printer,
  Receipt, ShoppingCart, Eye, ChevronRight, ChevronLeft, MoreVertical,
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
const EXPENSE_TYPE_KEYS: ExpenseSubTab[] = ['staff', 'food_cost', 'bills', 'rent', 'marketing', 'platform', 'others'];

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

// ─── Shared styles ────────────────────────────────────────────────────────────

const fieldClass = 'w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20';
const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500';

// ─── Component ────────────────────────────────────────────────────────────────

const ExpensesView: React.FC<Props> = ({ restaurant, orders, currencySymbol, initialSubTab, subscription, onNavigateToInventory }) => {

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
      if (valid.includes(v)) {
        setSubTab(v);
        setShowForm(false);
        setShowTypePicker(false);
        setEditingId(null);
      }
    }
  }, [initialSubTab]);

  // ─── Expenses state (Supabase) ───
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('date', { ascending: false });
    if (!error && data) {
      setExpenses(data.map((row: any) => ({
        id: row.id,
        date: row.date,
        amount: Number(row.amount),
        category: row.category,
        subcategory: row.subcategory,
        supplierId: row.supplier_id ?? '',
        supplierName: row.supplier_name ?? '',
        paymentMethod: row.payment_method,
        notes: row.notes ?? '',
        attachmentName: row.attachment_name ?? '',
        type: row.type as 'COGS' | 'OPEX',
        createdAt: new Date(row.created_at).getTime(),
        staffName: row.staff_name ?? '',
        staffRole: row.staff_role ?? '',
        basicSalary: row.basic_salary ? Number(row.basic_salary) : 0,
        allowances: row.allowances ? Number(row.allowances) : 0,
        deductions: row.deductions ? Number(row.deductions) : 0,
        payPeriod: row.pay_period ?? '',
      })));
    }
    setExpensesLoading(false);
  }, [restaurant.id]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // Realtime subscription for cross-device sync
  useEffect(() => {
    const channel = supabase
      .channel(`expenses_${restaurant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `restaurant_id=eq.${restaurant.id}` }, () => {
        fetchExpenses();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant.id, fetchExpenses]);

  const upsertExpense = async (expense: Expense) => {
    const row = {
      id: expense.id,
      restaurant_id: restaurant.id,
      date: expense.date,
      amount: expense.amount,
      category: expense.category,
      subcategory: expense.subcategory,
      supplier_id: expense.supplierId || null,
      supplier_name: expense.supplierName || null,
      payment_method: expense.paymentMethod,
      notes: expense.notes,
      attachment_name: expense.attachmentName || null,
      type: expense.type,
      staff_name: expense.staffName || null,
      staff_role: expense.staffRole || null,
      basic_salary: expense.basicSalary || null,
      allowances: expense.allowances || null,
      deductions: expense.deductions || null,
      pay_period: expense.payPeriod || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('expenses').upsert(row, { onConflict: 'id' });
    if (!error) fetchExpenses();
  };

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) fetchExpenses();
  };

  // ─── Staff list ───
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

  const today = new Date();

  // ─── Search ───
  const [expenseSearch, setExpenseSearch] = useState('');

  // ─── Derived data ─────────────────────────────────────────────────────────
  const allExpenses = useMemo(() => [...expenses, ...poExpenses, ...billingExpenses], [expenses, poExpenses, billingExpenses]);

  const filterByCategory = (categoryName: string) => {
    return allExpenses.filter(e => {
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
        if (expenseSearch) {
          const q = expenseSearch.toLowerCase();
          if (!e.category.toLowerCase().includes(q) && !e.subcategory.toLowerCase().includes(q) && !e.notes.toLowerCase().includes(q) && !(e.supplierName ?? '').toLowerCase().includes(q)) return false;
        }
        return true;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return filterByCategory(cat.name);
  }, [allExpenses, subTab, expenseSearch]);

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
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Payslip preview ───
  const [showPayslip, setShowPayslip] = useState(false);
  const [payslipExpense, setPayslipExpense] = useState<Expense | null>(null);

  // ─── Action menu ───
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) setActionMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Pagination ───
  const [pageSize, setPageSize] = useState(30);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => { setCurrentPage(1); }, [subTab, expenseSearch]);

  const subcategoryOptions = useMemo(() => {
    const cat = EXPENSE_CATEGORIES.find(c => c.name === form.category);
    return cat?.subcategories ?? [];
  }, [form.category]);
  const formCategory = useMemo(
    () => EXPENSE_CATEGORIES.find(c => c.name === form.category),
    [form.category],
  );

  const openAdd = () => {
    if (subTab === 'all') {
      setShowTypePicker(true);
      setShowForm(false);
      return;
    }
    setEditingId(null);
    setForm(blankForm());
    setShowTypePicker(false);
    setShowForm(true);
  };

  const handleSelectExpenseType = (nextSubTab: ExpenseSubTab) => {
    setSubTab(nextSubTab);
    setShowTypePicker(false);
    setEditingId(null);
    const category = getCategoryByKey(nextSubTab);
    setForm({
      ...blankForm(),
      category: category?.name ?? '',
    });
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    const targetSubTab = EXPENSE_CATEGORIES.find(c => c.name === e.category)?.key as ExpenseSubTab | undefined;
    if (targetSubTab) setSubTab(targetSubTab);
    setShowTypePicker(false);
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

  const handleSave = async () => {
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
    await upsertExpense(entry);
    setShowForm(false);
    setShowTypePicker(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this expense?')) return;
    deleteExpense(id);
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

  // ─── Derived form state ───
  const isPayslipMode = form.category === 'Staff' && form.subcategory === 'Salary';
  const supplierEnabled = shouldUseSupplier(form.category);
  const netPayPreview = (form.basicSalary || 0) + (form.allowances || 0) - (form.deductions || 0);
  const pageTitle = subTab === 'all' ? 'All Expenses' : (currentCat?.name ?? 'Expenses');
  const pageSubtitle = subTab === 'all'
    ? 'All expense records'
    : (currentCat?.description ?? 'Manage expenses');

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white"><FileText size={15} className="text-amber-500" /> Payslip</h3>
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"><Printer size={12} /> Print</button>
              <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700"><X size={16} /></button>
            </div>
          </div>
          <div ref={printRef} className="p-6">
            <div className="mb-6 border-b-2 border-amber-500 pb-4 text-center">
              <h1 className="text-lg font-bold text-amber-600 dark:text-amber-400">{restaurant.name}</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Payslip</p>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Employee</label><span className="text-sm font-bold dark:text-white">{expense.staffName || '–'}</span></div>
              <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Role</label><span className="text-sm font-bold dark:text-white">{expense.staffRole || '–'}</span></div>
              <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pay Period</label><span className="text-sm font-bold dark:text-white">{expense.payPeriod || '–'}</span></div>
              <div><label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payment Date</label><span className="text-sm font-bold dark:text-white">{new Date(expense.date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            </div>
            <table className="mb-6 w-full text-sm">
              <thead><tr className="border-b border-gray-200 dark:border-gray-700"><th className="py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Description</th><th className="py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Amount</th></tr></thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Basic Salary</td><td className="py-2.5 text-right font-semibold dark:text-white">{fmt(expense.basicSalary || 0)}</td></tr>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Allowances</td><td className="py-2.5 text-right font-semibold text-green-600 dark:text-green-400">+{fmt(expense.allowances || 0)}</td></tr>
                <tr className="border-b border-gray-100 dark:border-gray-700/50"><td className="py-2.5 dark:text-gray-300">Deductions</td><td className="py-2.5 text-right font-semibold text-red-600 dark:text-red-400">-{fmt(expense.deductions || 0)}</td></tr>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600"><td className="py-3 font-bold dark:text-white">Net Pay</td><td className="py-3 text-right text-lg font-bold dark:text-white">{fmt(expense.amount)}</td></tr>
              </tbody>
            </table>
            <p className="border-t border-gray-100 pt-4 text-center text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
              Generated by {restaurant.name} · {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────── RENDER ───────────────────────

  /* ─── Type Picker ──────────────────────────────────────────────────────── */
  if (showTypePicker) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Choose Expense Type</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select a category to begin adding an expense.</p>
          </div>
          <button onClick={() => setShowTypePicker(false)} className="rounded-lg px-4 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EXPENSE_TYPE_KEYS.map(key => {
            const category = getCategoryByKey(key);
            if (!category) return null;
            return (
              <button
                key={category.key}
                onClick={() => handleSelectExpenseType(category.key as ExpenseSubTab)}
                className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-amber-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-700"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                  {category.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">{category.name}</h4>
                    <ChevronRight size={14} className="text-gray-300 transition group-hover:text-amber-500 dark:text-gray-600" />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{category.description}</p>
                  <span className="mt-2 inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:bg-gray-700 dark:text-gray-500">{category.type}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─── Add / Edit Form ──────────────────────────────────────────────────── */
  if (showForm) {
    const primaryTitle = editingId
      ? (isPayslipMode ? 'Edit Staff Expense' : 'Edit Expense')
      : (subTab === 'staff' || isPayslipMode ? 'Add Staff Expense' : 'Add Expense');
    const subtitle = isPayslipMode
      ? 'Capture salary, allowances, deductions, and generate a clean staff expense record.'
      : 'Add a clean expense entry with only the fields that matter for this category.';

    return (
      <div>
        {/* Header bar */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => { setShowForm(false); setEditingId(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{form.category || currentCat?.name || ''}</span>
        </div>

        {/* Title block */}
        <div className="mb-4 border-b border-gray-200 pb-3 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              <Receipt size={16} />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">{primaryTitle}</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-gray-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              {formCategory?.name || currentCat?.name || '–'}
            </span>
            {form.category && (
              <span className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getCategoryType(form.category) === 'COGS' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                {getCategoryType(form.category)}
              </span>
            )}
            {isPayslipMode && (
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">Staff Payroll</span>
            )}
          </div>
        </div>

        {/* ── Form Sections ── */}
        <div className="space-y-6">

        {/* ── Expense Details ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Expense Details</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              {subTab !== 'all' && currentCat ? (
                <div className={`${fieldClass} flex items-center justify-between bg-gray-50 dark:bg-gray-700/50`}>
                  <span>{currentCat.name}</span>
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:bg-gray-600 dark:text-gray-400">Locked</span>
                </div>
              ) : (
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: '', supplierId: '', supplierName: '' }))} className={fieldClass}>
                  <option value="">Select category</option>
                  {EXPENSE_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Subcategory</label>
              <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} disabled={!form.category} className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-40`}>
                <option value="">Select subcategory</option>
                {subcategoryOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* ── Payslip form OR normal amount ── */}
        {isPayslipMode ? (
          <>
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Staff Details</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Employee Name</label>
                  {staffList.length > 0 ? (
                    <select value={form.staffName} onChange={e => {
                      const staff = staffList.find((s: any) => s.username === e.target.value);
                      setForm(f => ({ ...f, staffName: e.target.value, staffRole: staff?.role ?? '' }));
                    }} className={fieldClass}>
                      <option value="">Select employee</option>
                      {staffList.map((s: any) => <option key={s.id} value={s.username}>{s.username} ({s.role})</option>)}
                    </select>
                  ) : (
                    <input type="text" placeholder="Type employee name" value={form.staffName} onChange={e => setForm(f => ({ ...f, staffName: e.target.value }))} className={fieldClass} />
                  )}
                  {staffList.length === 0 && (
                    <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">No staff found yet — you can enter manually.</p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Role</label>
                  <input type="text" value={form.staffRole} onChange={e => setForm(f => ({ ...f, staffRole: e.target.value }))} placeholder="e.g. Cashier, Kitchen" className={fieldClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Pay Period</label>
                  <input type="text" value={form.payPeriod} onChange={e => setForm(f => ({ ...f, payPeriod: e.target.value }))} placeholder="e.g. January 2026" className={fieldClass} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Financials</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelClass}>Basic Salary ({currencySymbol})</label>
                  <input type="number" min="0" step="0.01" value={form.basicSalary || ''} onChange={e => setForm(f => ({ ...f, basicSalary: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className={fieldClass} />
                </div>
                <div>
                  <label className={`${labelClass} !text-emerald-500`}>Allowances</label>
                  <input type="number" min="0" step="0.01" value={form.allowances || ''} onChange={e => setForm(f => ({ ...f, allowances: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className={fieldClass} />
                </div>
                <div>
                  <label className={`${labelClass} !text-rose-500`}>Deductions</label>
                  <input type="number" min="0" step="0.01" value={form.deductions || ''} onChange={e => setForm(f => ({ ...f, deductions: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className={fieldClass} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/20 dark:bg-amber-900/10">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">Net Staff Expense</p>
                  <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-300/60">Final amount to be recorded.</p>
                </div>
                <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{fmt(netPayPreview)}</span>
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Financials</h4>
            <div className="max-w-xl">
              <label className={labelClass}>Amount ({currencySymbol})</label>
              <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className={fieldClass} />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Please enter the exact amount as on the receipt.</p>
            </div>
          </section>
        )}

        {/* ── Entity & Method ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Entity & Method</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {supplierEnabled && suppliers.length > 0 && (
              <div>
                <label className={labelClass}>Supplier</label>
                <select value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))} className={fieldClass}>
                  <option value="">No supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Payment method</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, paymentMethod: m }))}
                    className={`rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${form.paymentMethod === m ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:ring-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:ring-gray-500'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Additional Information ── */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Additional Information</h4>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes, references, or context..." className={`${fieldClass} resize-none`} />
          </div>
          <div>
            <label className={labelClass}>Attachment</label>
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-4 dark:border-gray-600 dark:bg-gray-800">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                  <Paperclip size={15} />
                  <span>{form.attachmentName || 'Drag & Drop receipt or browse files'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                    <Paperclip size={12} /> {form.attachmentName ? 'Change file' : 'Attach file'}
                  </button>
                  {form.attachmentName && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, attachmentName: '' }))} className="rounded-lg p-1.5 text-gray-400 transition hover:text-rose-500">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) setForm(prev => ({ ...prev, attachmentName: f.name })); e.target.value = ''; }} />
            </div>
          </div>
        </section>

        </div>{/* end form sections wrapper */}

        {/* ── Actions ── */}
        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:justify-end">
          <button onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-xl px-5 py-2.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.date || !form.category || !form.subcategory || (isPayslipMode ? !form.staffName || netPayPreview <= 0 : !form.amount)}
            className="rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {editingId ? 'Save Changes' : 'Save Expense'}
          </button>
        </div>
      </div>
    );
  }

  /* ─── List View (default) ─────────────────────────────────────────────── */
  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">All Expenses</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Manage all expense records across categories</p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-0">
        {[
          { key: 'all' as ExpenseSubTab, label: 'All Expenses', icon: <FileText size={13} /> },
          ...EXPENSE_TYPE_KEYS.map(k => {
            const cat = getCategoryByKey(k);
            return { key: k, label: cat?.name ?? k, icon: cat?.icon ?? null };
          }),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-b-0 rounded-t-xl transition-all -mb-px ${
              subTab === tab.key
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 border-gray-200 dark:border-gray-700 relative z-10'
                : 'bg-gray-100 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content panel */}
      <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 border-t-0 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">

      {/* Summary strip */}
      {subTab === 'all' && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Total Expenses', value: fmt(totalFiltered) },
            { label: 'Records', value: String(filteredExpenses.length) },
            { label: 'Categories', value: String(new Set(filteredExpenses.map(e => e.category)).size) },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{card.label}</p>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Food Cost PO banner */}
      {subTab === 'food_cost' && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/20 dark:bg-amber-900/10">
          <div className="flex items-center gap-3">
            <ShoppingCart size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Purchase Orders auto-sync here</p>
              <p className="text-[10px] text-amber-600/80 dark:text-amber-500/70">Received POs from Inventory are listed automatically.</p>
            </div>
          </div>
          {onNavigateToInventory && (
            <button onClick={() => onNavigateToInventory('purchase_orders')} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-amber-600">
              Go to PO
            </button>
          )}
        </div>
      )}

      {/* Platform Subscription banner */}
      {subTab === 'platform' && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200/60 bg-blue-50/50 px-4 py-3 dark:border-blue-800/20 dark:bg-blue-900/10">
          <CreditCard size={14} className="shrink-0 text-blue-500 dark:text-blue-400" />
          <div>
            <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300">Subscription charges are auto-tracked</p>
            <p className="text-[10px] text-blue-600/80 dark:text-blue-500/70">
              {subscription ? `Current plan: ${PRICING_PLANS.find(p => p.id === subscription.plan_id)?.name ?? subscription.plan_id} (${subscription.billing_interval ?? 'monthly'})` : 'No active subscription'}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={expenseSearch}
              onChange={e => setExpenseSearch(e.target.value)}
              className="w-48 rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:bg-gray-800"
            />
          </div>
          {expenseSearch && (
            <button onClick={() => setExpenseSearch('')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700">
              <X size={12} /> Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCSV} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
            <Download size={13} /> CSV
          </button>
          {subTab !== 'platform' && (
            <button onClick={openAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-amber-600">
              <Plus size={13} /> {subTab === 'staff' ? 'Add Staff Expense' : 'Add Expense'}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
        const safeCurrentPage = Math.min(currentPage, totalPages);
        const paginatedExpenses = filteredExpenses.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
        return (
          <>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Date</th>
                  {subTab === 'all' && <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Category</th>}
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Subcategory</th>
                  {subTab === 'staff' && <th className="hidden px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 md:table-cell">Employee</th>}
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Amount</th>
                  {showSupplierColumn && <th className="hidden px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 lg:table-cell">Supplier</th>}
                  <th className="hidden px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 md:table-cell">Payment</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400">Type</th>
                  <th className="hidden px-4 py-3 text-[9px] font-black uppercase tracking-widest text-gray-400 lg:table-cell">Notes</th>
                  <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedExpenses.map(e => (
                  <tr key={e.id} className="transition hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    {subTab === 'all' && (
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{e.category}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{e.subcategory}</td>
                    {subTab === 'staff' && <td className="hidden px-4 py-3 text-xs text-gray-500 dark:text-gray-400 md:table-cell">{e.staffName || '–'}</td>}
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">{fmt(e.amount)}</td>
                    {showSupplierColumn && <td className="hidden px-4 py-3 text-xs text-gray-500 dark:text-gray-400 lg:table-cell">{e.supplierName || '–'}</td>}
                    <td className="hidden px-4 py-3 text-xs text-gray-500 dark:text-gray-400 md:table-cell">{e.paymentMethod}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${e.type === 'COGS' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>{e.type}</span>
                    </td>
                    <td className="hidden max-w-[140px] truncate px-4 py-3 text-xs text-gray-400 dark:text-gray-500 lg:table-cell">{e.notes || '–'}</td>
                    <td className="px-4 py-3 text-right">
                      {e.id.startsWith('po_') || e.id.startsWith('billing_') ? (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[9px] font-semibold text-gray-400 dark:bg-gray-700 dark:text-gray-500" title={e.id.startsWith('po_') ? 'Managed from Inventory' : 'Auto from subscription'}>Auto</span>
                      ) : (
                        <div className="relative inline-block" ref={actionMenuId === e.id ? actionMenuRef : undefined}>
                          <button
                            onClick={() => setActionMenuId(actionMenuId === e.id ? null : e.id)}
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                          >
                            <MoreVertical size={15} />
                          </button>
                          {actionMenuId === e.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                              {e.category === 'Staff' && e.subcategory === 'Salary' && e.staffName && (
                                <button
                                  onClick={() => { setPayslipExpense(e); setShowPayslip(true); setActionMenuId(null); }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  <Eye size={13} /> View Payslip
                                </button>
                              )}
                              <button
                                onClick={() => { openEdit(e); setActionMenuId(null); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                              >
                                <Edit3 size={13} /> Edit
                              </button>
                              <button
                                onClick={() => { handleDelete(e.id); setActionMenuId(null); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-52 flex-col items-center justify-center text-gray-400 dark:text-gray-600">
            <FileText size={36} className="mb-2 opacity-20" />
            <p className="text-sm font-semibold">No expenses found</p>
            <p className="mt-0.5 text-xs">{expenseSearch ? 'Try adjusting your search' : `No ${currentCat?.name ?? ''} expenses recorded yet`}</p>
          </div>
        )}
      </div>

      {/* Total + Pagination bar */}
      {filteredExpenses.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Total ({filteredExpenses.length} records)</span>
            <span className="text-base font-bold text-gray-900 dark:text-white">{fmt(totalFiltered)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Show</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {[30, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`e${idx}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`min-w-[28px] rounded-lg px-2 py-1 text-xs font-semibold transition ${
                        p === safeCurrentPage
                          ? 'bg-amber-500 text-white'
                          : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
          </>
        );
      })()}

      </div>{/* end tab content panel */}

      {/* Payslip Preview Modal */}
      {showPayslip && payslipExpense && (
        <PayslipPreview expense={payslipExpense} onClose={() => { setShowPayslip(false); setPayslipExpense(null); }} />
      )}
    </div>
  );
};

export default ExpensesView;
