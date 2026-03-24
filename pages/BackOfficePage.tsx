import React, { useState, useMemo } from 'react';
import { Order, OrderStatus, MenuItem, Restaurant } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from '../components/Toast';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Receipt, ChevronRight, ChevronLeft, ChevronDown, Filter,
  BarChart3, Package, UserPlus, UserMinus, Edit3, Trash2, Plus, Minus, Search, AlertCircle,
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, Eye, Archive, RotateCcw,
  Briefcase, Box, Tag, Layers, Activity, ArrowLeft, Warehouse, FileBarChart, Contact,
  CreditCard, Percent, FileText, Truck, ArrowUpDown, ClipboardList, Factory, History, Building2,
} from 'lucide-react';
import InventoryManagement from '../components/InventoryManagement';
import ReportsView from '../components/ReportsView';
import ContactsManagement from '../components/ContactsManagement';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  currencySymbol: string;
  onFetchAllFilteredOrders?: (filters: any) => Promise<Order[]>;
  onBack?: () => void;
}

type BackOfficeTab = 'DASHBOARD' | 'STAFF' | 'STOCK' | 'INVENTORY' | 'REPORTS' | 'CONTACTS';
type DateRange = '7d' | '30d' | '90d' | 'custom';

const COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#FCD34D', '#3B82F6', '#8B5CF6', '#22C55E'];
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#22C55E',
  SERVED: '#3B82F6',
  PENDING: '#F59E0B',
  ONGOING: '#8B5CF6',
  CANCELLED: '#EF4444',
};

// ─── Staff type ───
interface StaffMember {
  id: string;
  username: string;
  role: 'CASHIER' | 'KITCHEN';
  email?: string;
  phone?: string;
  isActive?: boolean;
  kitchenCategories?: string[];
}

// ─── Stock type ───
interface StockItem {
  menuItemId: string;
  name: string;
  category: string;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  lastRestocked?: number;
  stockEnabled: boolean;
}

const BackOfficePage: React.FC<Props> = ({ restaurant, orders, currencySymbol, onFetchAllFilteredOrders, onBack }) => {
  const [activeTab, setActiveTab] = useState<BackOfficeTab>('DASHBOARD');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [reportSubTab, setReportSubTab] = useState<string | undefined>(undefined);
  const [inventorySubTab, setInventorySubTab] = useState<string | undefined>(undefined);
  const [contactSubTab, setContactSubTab] = useState<string | undefined>(undefined);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => today.toISOString().split('T')[0]);

  // ─── Date filtering ───
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'custom') {
      return { startDate: new Date(customStart), endDate: new Date(customEnd + 'T23:59:59') };
    }
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const start = new Date(); start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: new Date() };
  }, [dateRange, customStart, customEnd]);

  const filteredOrders = useMemo(
    () => orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= startDate && t <= endDate;
    }),
    [orders, startDate, endDate],
  );

  const prevPeriodOrders = useMemo(() => {
    const duration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - duration);
    const prevEnd = new Date(startDate.getTime() - 1);
    return orders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= prevStart && t <= prevEnd;
    });
  }, [orders, startDate, endDate]);

  // ─── Staff State ───
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    const saved = localStorage.getItem(`staff_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ username: '', password: '', email: '', phone: '', role: 'CASHIER' as 'CASHIER' | 'KITCHEN' });
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');

  // ─── Stock State ───
  const [stockItems, setStockItems] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem(`stock_${restaurant.id}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((s: any) => ({ ...s, stockEnabled: s.stockEnabled ?? true }));
    }
    // Initialize from menu
    return restaurant.menu.filter(m => !m.isArchived).map(m => ({
      menuItemId: m.id,
      name: m.name,
      category: m.category,
      currentStock: 100,
      lowStockThreshold: 10,
      unit: 'pcs',
      lastRestocked: Date.now(),
      stockEnabled: true,
    }));
  });
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());

  const saveStock = (items: StockItem[]) => {
    setStockItems(items);
    localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(items));
  };

  // ─────────────────────────────────────
  // SALES ANALYTICS
  // ─────────────────────────────────────
  const kpis = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED);
    const prevCompleted = prevPeriodOrders.filter(o => o.status !== OrderStatus.CANCELLED);
    const totalSales = completed.reduce((s, o) => s + o.total, 0);
    const prevTotalSales = prevCompleted.reduce((s, o) => s + o.total, 0);
    const totalOrders = completed.length;
    const prevTotalOrders = prevCompleted.length;
    const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAvg = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;
    const cancelled = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const prevCancelled = prevPeriodOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
    return {
      totalSales, totalOrders, avgOrder, cancelled,
      salesChange: pct(totalSales, prevTotalSales),
      ordersChange: pct(totalOrders, prevTotalOrders),
      avgChange: pct(avgOrder, prevAvg),
      cancelledChange: pct(cancelled, prevCancelled),
    };
  }, [filteredOrders, prevPeriodOrders]);

  const dailySales = useMemo(() => {
    const map: Record<string, { date: string; sales: number; orders: number }> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const d = new Date(o.timestamp);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!map[key]) map[key] = { date: key, sales: 0, orders: 0 };
      map[key].sales += o.total;
      map[key].orders += 1;
    });
    return Object.values(map).sort((a, b) => {
      const da = new Date(a.date + ', ' + today.getFullYear());
      const db = new Date(b.date + ', ' + today.getFullYear());
      return da.getTime() - db.getTime();
    });
  }, [filteredOrders]);

  const paymentData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const method = o.paymentMethod || 'Cash';
      map[method] = (map[method] || 0) + 1;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).map(([name, value]) => ({
      name, value,
      pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
    }));
  }, [filteredOrders]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  // ─── Hourly sales heatmap data ───
  const hourlySales = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0, orders: 0 }));
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const h = new Date(o.timestamp).getHours();
      hours[h].sales += o.total;
      hours[h].orders += 1;
    });
    return hours.map(h => ({ ...h, label: `${h.hour.toString().padStart(2, '0')}:00` }));
  }, [filteredOrders]);

  // ─── Top items sold ───
  const topItems = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      o.items.forEach(item => {
        if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
        map[item.name].qty += item.quantity;
        map[item.name].revenue += item.price * item.quantity;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [filteredOrders]);

  // ─── Category breakdown ───
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number }> = {};
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      o.items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!map[cat]) map[cat] = { name: cat, orders: 0, revenue: 0 };
        map[cat].orders += item.quantity;
        map[cat].revenue += item.price * item.quantity;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // ─── PERFORMANCE ───
  const cashierStats = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number; avgOrder: number; cancelled: number; avgTime: number }> = {};
    filteredOrders.forEach(o => {
      const name = o.cashierName || 'Unknown';
      if (!map[name]) map[name] = { name, orders: 0, revenue: 0, avgOrder: 0, cancelled: 0, avgTime: 0 };
      if (o.status === OrderStatus.CANCELLED) {
        map[name].cancelled += 1;
      } else {
        map[name].orders += 1;
        map[name].revenue += o.total;
      }
    });
    return Object.values(map)
      .map(c => ({ ...c, avgOrder: c.orders > 0 ? c.revenue / c.orders : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  // ─── Peak hours ───
  const peakHours = useMemo(() => {
    const sorted = [...hourlySales].sort((a, b) => b.orders - a.orders);
    return sorted.slice(0, 5);
  }, [hourlySales]);

  const recentOrders = useMemo(
    () => [...filteredOrders].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15),
    [filteredOrders],
  );

  // ─── Helpers ───
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
      <div className="bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs font-bold text-white mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-gray-300">
            {p.name}: <span className="text-amber-400 font-bold">{typeof p.value === 'number' && p.name !== 'orders' ? `${currencySymbol}${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  // ─── Staff handlers ───
  const handleAddStaff = async () => {
    if (!staffForm.username.trim() || !staffForm.password.trim()) {
      toast('Username and password are required', 'error');
      return;
    }
    setIsSubmittingStaff(true);
    try {
      const { data: existing } = await supabase.from('users').select('id').eq('username', staffForm.username.trim()).maybeSingle();
      if (existing) { toast('Username already taken', 'error'); setIsSubmittingStaff(false); return; }

      const { data, error } = await supabase.from('users').insert({
        username: staffForm.username.trim(),
        password: staffForm.password,
        role: staffForm.role,
        restaurant_id: restaurant.id,
        email: staffForm.email.trim() || null,
        phone: staffForm.phone.trim() || null,
        is_active: true,
      }).select().single();

      if (error) throw error;

      const newStaff: StaffMember = {
        id: data.id,
        username: data.username,
        role: data.role,
        email: data.email,
        phone: data.phone,
        isActive: data.is_active ?? true,
      };
      const updated = [...staffList, newStaff];
      setStaffList(updated);
      localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
      setStaffForm({ username: '', password: '', email: '', phone: '', role: 'CASHIER' });
      setIsAddStaffOpen(false);
      toast(`${staffForm.role === 'CASHIER' ? 'Cashier' : 'Kitchen staff'} added`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to add staff', 'error');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleToggleStaffActive = async (staff: StaffMember) => {
    const newActive = !staff.isActive;
    const { error } = await supabase.from('users').update({ is_active: newActive }).eq('id', staff.id);
    if (error) { toast('Failed to update staff', 'error'); return; }
    const updated = staffList.map(s => s.id === staff.id ? { ...s, isActive: newActive } : s);
    setStaffList(updated);
    localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
    toast(`${staff.username} ${newActive ? 'activated' : 'deactivated'}`, 'success');
  };

  const handleDeleteStaff = async (staff: StaffMember) => {
    if (!confirm(`Remove ${staff.username}? This cannot be undone.`)) return;
    const { error } = await supabase.from('users').delete().eq('id', staff.id);
    if (error) { toast('Failed to remove staff', 'error'); return; }
    const updated = staffList.filter(s => s.id !== staff.id);
    setStaffList(updated);
    localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
    toast(`${staff.username} removed`, 'success');
  };

  const refreshStaffList = async () => {
    const { data } = await supabase.from('users').select('*').eq('restaurant_id', restaurant.id).in('role', ['CASHIER', 'KITCHEN']);
    if (data) {
      const mapped: StaffMember[] = data.map(d => ({
        id: d.id,
        username: d.username,
        role: d.role,
        email: d.email,
        phone: d.phone,
        isActive: d.is_active ?? true,
        kitchenCategories: d.kitchen_categories,
      }));
      setStaffList(mapped);
      localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(mapped));
      toast('Staff list refreshed', 'success');
    }
  };

  // ─── Stock handlers ───
  const handleToggleStockEnabled = (itemId: string) => {
    const updated = stockItems.map(s =>
      s.menuItemId === itemId ? { ...s, stockEnabled: !s.stockEnabled } : s
    );
    saveStock(updated);
  };

  const handleMasterStockToggle = (enable: boolean) => {
    const updated = stockItems.map(s => ({ ...s, stockEnabled: enable }));
    saveStock(updated);
  };

  const handleToggleSelectedStock = (enable: boolean) => {
    if (selectedStockIds.size === 0) return;
    const updated = stockItems.map(s =>
      selectedStockIds.has(s.menuItemId) ? { ...s, stockEnabled: enable } : s
    );
    saveStock(updated);
    setSelectedStockIds(new Set());
  };

  const handleSelectStockItem = (itemId: string) => {
    setSelectedStockIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSelectAllStock = () => {
    if (selectedStockIds.size === filteredStock.length) {
      setSelectedStockIds(new Set());
    } else {
      setSelectedStockIds(new Set(filteredStock.map(s => s.menuItemId)));
    }
  };

  const handleGoToRestock = () => {
    setActiveTab('INVENTORY');
  };

  const handleUpdateStockThreshold = (itemId: string, threshold: number) => {
    const updated = stockItems.map(s =>
      s.menuItemId === itemId ? { ...s, lowStockThreshold: threshold } : s
    );
    saveStock(updated);
  };

  const handleSetStock = (itemId: string, stock: number) => {
    const updated = stockItems.map(s =>
      s.menuItemId === itemId ? { ...s, currentStock: Math.max(0, stock) } : s
    );
    saveStock(updated);
  };

  const filteredStock = useMemo(() => {
    let items = stockItems;
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      items = items.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }
    if (stockFilter === 'low') items = items.filter(s => s.currentStock > 0 && s.currentStock <= s.lowStockThreshold);
    if (stockFilter === 'out') items = items.filter(s => s.currentStock === 0);
    return items;
  }, [stockItems, stockSearch, stockFilter]);

  const stockSummary = useMemo(() => {
    const enabled = stockItems.filter(s => s.stockEnabled);
    const total = enabled.length;
    const low = enabled.filter(s => s.currentStock > 0 && s.currentStock <= s.lowStockThreshold).length;
    const out = enabled.filter(s => s.currentStock === 0).length;
    const healthy = total - low - out;
    return { total, low, out, healthy };
  }, [stockItems]);

  const filteredStaff = useMemo(() => {
    if (!staffSearch) return staffList;
    const q = staffSearch.toLowerCase();
    return staffList.filter(s => s.username.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
  }, [staffList, staffSearch]);

  // ─── Tab buttons ───
  const simpleTabs: { key: BackOfficeTab; label: string; icon: React.ReactNode }[] = [
    { key: 'DASHBOARD', label: 'Dashboard', icon: <BarChart3 size={18} /> },
    { key: 'STAFF', label: 'Staff Management', icon: <Users size={18} /> },
    { key: 'STOCK', label: 'Stock Management', icon: <Package size={18} /> },
  ];

  const expandableTabs: {
    key: BackOfficeTab;
    label: string;
    icon: React.ReactNode;
    subItems: { key: string; label: string; icon: React.ReactNode }[];
  }[] = [
    {
      key: 'INVENTORY', label: 'Inventory', icon: <Warehouse size={18} />,
      subItems: [
        { key: 'purchase_orders', label: 'Purchase Orders', icon: <FileText size={14} /> },
        { key: 'transfer_orders', label: 'Transfer Orders', icon: <Truck size={14} /> },
        { key: 'stock_adjustments', label: 'Stock Adjustments', icon: <ArrowUpDown size={14} /> },
        { key: 'inventory_counts', label: 'Inventory Counts', icon: <ClipboardList size={14} /> },
        { key: 'productions', label: 'Productions', icon: <Factory size={14} /> },
        { key: 'inventory_history', label: 'History', icon: <History size={14} /> },
        { key: 'inventory_valuation', label: 'Valuation', icon: <DollarSign size={14} /> },
      ],
    },
    {
      key: 'CONTACTS', label: 'Contacts', icon: <Contact size={18} />,
      subItems: [
        { key: 'suppliers', label: 'Suppliers', icon: <Building2 size={14} /> },
        { key: 'customers', label: 'Customers', icon: <UserPlus size={14} /> },
      ],
    },
    {
      key: 'REPORTS', label: 'Reports', icon: <FileBarChart size={18} />,
      subItems: [
        { key: 'sales_summary', label: 'Sales Summary', icon: <DollarSign size={14} /> },
        { key: 'sales_by_item', label: 'By Item', icon: <ShoppingBag size={14} /> },
        { key: 'sales_by_category', label: 'By Category', icon: <Tag size={14} /> },
        { key: 'sales_by_employee', label: 'By Employee', icon: <Users size={14} /> },
        { key: 'sales_by_payment', label: 'By Payment', icon: <CreditCard size={14} /> },
        { key: 'sales_by_modifier', label: 'By Modifier', icon: <Layers size={14} /> },
        { key: 'discounts', label: 'Discounts', icon: <Percent size={14} /> },
        { key: 'taxes', label: 'Taxes', icon: <Receipt size={14} /> },
      ],
    },
  ];

  const toggleExpanded = (key: string) => {
    setExpandedMenus(prev => {
      const next = new Set<string>();
      if (!prev.has(key)) next.add(key);
      return next;
    });
  };

  const getActiveSubTab = (tabKey: BackOfficeTab) => {
    if (tabKey === 'REPORTS') return reportSubTab;
    if (tabKey === 'INVENTORY') return inventorySubTab;
    if (tabKey === 'CONTACTS') return contactSubTab;
    return undefined;
  };

  const setActiveSubTab = (tabKey: BackOfficeTab, subKey: string) => {
    if (tabKey === 'REPORTS') setReportSubTab(subKey);
    else if (tabKey === 'INVENTORY') setInventorySubTab(subKey);
    else if (tabKey === 'CONTACTS') setContactSubTab(subKey);
  };

  const handleSeeDetails = (reportTab: string) => {
    setReportSubTab(reportTab);
    setActiveTab('REPORTS');
    setExpandedMenus(prev => new Set(prev).add('REPORTS'));
  };

  // ─── Date Range Picker ───
  const DateRangePicker = () => (
    <div className="flex items-center gap-2 flex-wrap">
      {(['7d', '30d', '90d'] as DateRange[]).map(range => (
        <button
          key={range}
          onClick={() => setDateRange(range)}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            dateRange === range ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-white'
          }`}
        >
          {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
        </button>
      ))}
      <button
        onClick={() => setDateRange('custom')}
        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${dateRange === 'custom' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-white'}`}
      >Custom</button>
      {dateRange === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
          <span className="text-gray-500 text-xs">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
        </div>
      )}
    </div>
  );

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'lg:w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 hidden md:flex transition-all duration-300 ease-in-out`}>
        {/* Logo / Header */}
        <div className={`border-b border-gray-200 dark:border-gray-700 flex items-center ${isSidebarCollapsed ? 'p-3 justify-center' : 'px-4 py-4 gap-3'}`}>
          <div className={`${isSidebarCollapsed ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-amber-600/20 flex items-center justify-center`}>
            <Briefcase size={isSidebarCollapsed ? 16 : 20} className="text-amber-500" />
          </div>
          {!isSidebarCollapsed && (
          <div>
            <h2 className="font-black text-sm uppercase tracking-tight leading-tight">Back Office</h2>
            <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 truncate">{restaurant.name}</p>
          </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2 space-y-1' : 'px-3 py-4 space-y-1'}`}>
          {/* Simple tabs */}
          {simpleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedMenus(new Set()); }}
              title={tab.label}
              className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {tab.icon} {!isSidebarCollapsed && tab.label}
            </button>
          ))}

          {/* Expandable tabs */}
          {expandableTabs.map(tab => {
            const isExpanded = expandedMenus.has(tab.key);
            const isActive = activeTab === tab.key;
            const currentSub = getActiveSubTab(tab.key);
            return (
              <div key={tab.key}>
                <button
                  onClick={() => {
                    if (isSidebarCollapsed) {
                      setActiveTab(tab.key);
                    } else {
                      toggleExpanded(tab.key);
                      if (!isActive) {
                        setActiveTab(tab.key);
                        if (!currentSub) setActiveSubTab(tab.key, tab.subItems[0].key);
                      }
                    }
                  }}
                  title={tab.label}
                  className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {tab.icon}
                  {!isSidebarCollapsed && (
                    <>
                      <span className="flex-1 text-left">{tab.label}</span>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>
                {!isSidebarCollapsed && (
                  <div className={`ml-6 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-700 pl-3 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0'}`}>
                    {tab.subItems.map(sub => (
                      <button
                        key={sub.key}
                        onClick={() => {
                          setActiveTab(tab.key);
                          setActiveSubTab(tab.key, sub.key);
                        }}
                        className={`w-full flex items-center px-2 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          isActive && currentSub === sub.key
                            ? 'text-amber-600 dark:text-amber-400 font-bold bg-amber-50/50 dark:bg-amber-900/10'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Collapse Toggle */}
        <div className={`hidden lg:flex ${isSidebarCollapsed ? 'justify-center p-2' : 'justify-end px-4'} pt-1`}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Back to POS button */}
        {onBack && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            {isSidebarCollapsed ? (
              <button
                onClick={onBack}
                title="Back to POS"
                className="w-full flex items-center justify-center py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              <ArrowLeft size={16} /> Back to POS
            </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Mobile tab selector */}
        <div className="md:hidden sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="flex gap-1 overflow-x-auto hide-scrollbar">
            {[...simpleTabs, ...expandableTabs.map(t => ({ key: t.key, label: t.label, icon: t.icon }))].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap rounded-lg transition-all ${
                  activeTab === tab.key
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

      <div className="p-4 md:p-6">

        {/* ════════════════════════════════════ */}
        {/* DASHBOARD TAB                       */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'DASHBOARD' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-black">Sales Overview</h2>
              <DateRangePicker />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Sales', value: `${currencySymbol}${kpis.totalSales.toFixed(2)}`, change: kpis.salesChange, icon: <DollarSign size={20} className="text-amber-500" />, bg: 'bg-amber-600/20' },
                { label: 'Total Orders', value: kpis.totalOrders.toLocaleString(), change: kpis.ordersChange, icon: <ShoppingBag size={20} className="text-blue-400" />, bg: 'bg-blue-600/20' },
                { label: 'Avg. Order', value: `${currencySymbol}${kpis.avgOrder.toFixed(2)}`, change: kpis.avgChange, icon: <Receipt size={20} className="text-green-400" />, bg: 'bg-green-600/20' },
                { label: 'Cancelled', value: kpis.cancelled.toString(), change: kpis.cancelledChange, icon: <XCircle size={20} className="text-red-400" />, bg: 'bg-red-600/20' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</div>
                    <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{kpi.label}</span>
                  </div>
                  <p className="text-2xl font-black dark:text-white">{kpi.value}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">vs prev</span>
                    <ChangeIndicator value={kpi.change} />
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Daily Sales */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Daily Sales</h3>
                  <button onClick={() => handleSeeDetails('sales_summary')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {dailySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailySales}>
                      <defs>
                        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D97706" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#D97706" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="sales" stroke="#D97706" fill="url(#salesGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>

              {/* Payment Methods */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Payment Methods</h3>
                  <button onClick={() => handleSeeDetails('sales_by_payment')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {paymentData.length > 0 ? (
                  <>
                    <div className="flex justify-center">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie data={paymentData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" stroke="none">
                            {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return <div className="bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl"><p className="text-xs font-bold dark:text-white">{d.name}</p><p className="text-xs text-gray-300">{d.value} orders ({d.pct}%)</p></div>;
                          }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {paymentData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.name}</span>
                          <span className="text-xs font-bold text-white ml-auto">{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>
            </div>

            {/* Hourly Sales + Top Items */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Hourly Sales */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Sales by Hour</h3>
                  <button onClick={() => handleSeeDetails('sales_by_employee')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hourlySales.filter(h => h.orders > 0)}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={24} name="orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Selling Items */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Top Selling Items</h3>
                  <button onClick={() => handleSeeDetails('sales_by_item')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {topItems.length > 0 ? (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {topItems.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:bg-gray-600 transition-all">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                          i === 0 ? 'bg-amber-600 text-white' : i === 1 ? 'bg-gray-500 text-white' : i === 2 ? 'bg-orange-800 text-white' : 'bg-gray-700 text-gray-300'
                        }`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.qty} sold</p>
                        </div>
                        <p className="text-sm font-bold text-amber-400">{currencySymbol}{item.revenue.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                ) : <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>
            </div>

            {/* Category Breakdown + Order Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Category Sales */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Sales by Category</h3>
                  <button onClick={() => handleSeeDetails('sales_by_category')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {categoryBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {categoryBreakdown.map(cat => {
                      const maxRev = categoryBreakdown[0]?.revenue || 1;
                      const pct = (cat.revenue / maxRev) * 100;
                      return (
                        <div key={cat.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold">{cat.name}</span>
                            <span className="text-xs text-gray-400">{currencySymbol}{cat.revenue.toFixed(2)} ({cat.orders} items)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="h-32 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>

              {/* Order Status */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-400">Order Status Breakdown</h3>
                  <button onClick={() => handleSeeDetails('sales_summary')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {statusData.length > 0 ? (
                  <div className="space-y-3">
                    {statusData.map(s => {
                      const total = filteredOrders.length;
                      const pct = total > 0 ? (s.value / total) * 100 : 0;
                      return (
                        <div key={s.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold capitalize">{s.name.toLowerCase()}</span>
                            <span className="text-xs text-gray-400">{s.value} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s.name] || '#6B7280' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="h-32 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/* STAFF MANAGEMENT TAB                */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'STAFF' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-black">Staff Management</h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search staff..."
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48"
                  />
                </div>
                <button onClick={refreshStaffList} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-xs font-bold uppercase tracking-wider border border-gray-200 dark:border-gray-700 hover:border-gray-600 transition-all">
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => { setIsAddStaffOpen(true); setStaffForm({ username: '', password: '', email: '', phone: '', role: 'CASHIER' }); }}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20"
                >
                  <UserPlus size={14} /> Add Staff
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Users size={20} className="text-blue-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Staff</span>
                </div>
                <p className="text-3xl font-black dark:text-white">{staffList.length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center"><CheckCircle size={20} className="text-green-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Active</span>
                </div>
                <p className="text-3xl font-black text-green-400">{staffList.filter(s => s.isActive !== false).length}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center"><XCircle size={20} className="text-red-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Inactive</span>
                </div>
                <p className="text-3xl font-black text-red-400">{staffList.filter(s => s.isActive === false).length}</p>
              </div>
            </div>

            {/* Staff List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {filteredStaff.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Phone</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.map(staff => (
                        <tr key={staff.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-100 dark:bg-gray-700 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-600/20 flex items-center justify-center text-amber-400 font-black text-sm">
                                {staff.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-bold dark:text-white">{staff.username}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                              staff.role === 'CASHIER' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                            }`}>{staff.role}</span>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{staff.email || '-'}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">{staff.phone || '-'}</td>
                          <td className="px-5 py-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                              staff.isActive !== false ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>{staff.isActive !== false ? 'Active' : 'Inactive'}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleToggleStaffActive(staff)}
                                className={`p-2 rounded-lg transition-all ${
                                  staff.isActive !== false ? 'text-red-400 hover:bg-red-500/20' : 'text-green-400 hover:bg-green-500/20'
                                }`}
                                title={staff.isActive !== false ? 'Deactivate' : 'Activate'}
                              >
                                {staff.isActive !== false ? <UserMinus size={14} /> : <CheckCircle size={14} />}
                              </button>
                              <button
                                onClick={() => handleDeleteStaff(staff)}
                                className="p-2 rounded-lg text-red-400 hover:bg-red-500/20 transition-all"
                                title="Remove"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <Users size={40} className="mb-3 opacity-30" />
                  <p className="text-sm font-bold">No staff members found</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add cashiers or kitchen staff to get started</p>
                </div>
              )}
            </div>

            {/* Add Staff Modal */}
            {isAddStaffOpen && (
              <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setIsAddStaffOpen(false)}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-black dark:text-white mb-6 flex items-center gap-2"><UserPlus size={20} className="text-amber-500" /> Add New Staff</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Role</label>
                      <div className="flex gap-2">
                        <button onClick={() => setStaffForm(f => ({ ...f, role: 'CASHIER' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${staffForm.role === 'CASHIER' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>Cashier</button>
                        <button onClick={() => setStaffForm(f => ({ ...f, role: 'KITCHEN' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${staffForm.role === 'KITCHEN' ? 'bg-purple-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>Kitchen</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Username *</label>
                      <input type="text" value={staffForm.username} onChange={e => setStaffForm(f => ({ ...f, username: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Enter username" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Password *</label>
                      <input type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Enter password" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email</label>
                      <input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Phone</label>
                      <input type="tel" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Optional" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setIsAddStaffOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                    <button onClick={handleAddStaff} disabled={isSubmittingStaff} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20">
                      {isSubmittingStaff ? 'Adding...' : 'Add Staff'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════ */}
        {/* STOCK MANAGEMENT TAB                */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'STOCK' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-black">Stock Management</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48"
                  />
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 p-0.5">
                  {([['all', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setStockFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        stockFilter === key ? 'bg-amber-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >{label}</button>
                  ))}
                </div>
                <button
                  onClick={handleGoToRestock}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20"
                >
                  <Plus size={14} /> Purchase Order
                </button>
              </div>
            </div>

            {/* Master Controls */}
            <div className="flex items-center justify-between mb-4 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Master Stock Control:</span>
                <button onClick={() => handleMasterStockToggle(true)} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-wider hover:bg-green-500/30 transition-all">Enable All</button>
                <button onClick={() => handleMasterStockToggle(false)} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/30 transition-all">Disable All</button>
              </div>
              {selectedStockIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">{selectedStockIds.size} selected</span>
                  <button onClick={() => handleToggleSelectedStock(true)} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold hover:bg-green-500/30 transition-all">Enable Selected</button>
                  <button onClick={() => handleToggleSelectedStock(false)} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500/30 transition-all">Disable Selected</button>
                </div>
              )}
            </div>

            {/* Stock Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Package size={20} className="text-blue-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Items</span>
                </div>
                <p className="text-3xl font-black dark:text-white">{stockSummary.total}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center"><CheckCircle size={20} className="text-green-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">In Stock</span>
                </div>
                <p className="text-3xl font-black text-green-400">{stockSummary.healthy}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center"><AlertCircle size={20} className="text-amber-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Low Stock</span>
                </div>
                <p className="text-3xl font-black text-amber-400">{stockSummary.low}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center"><XCircle size={20} className="text-red-400" /></div>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Out of Stock</span>
                </div>
                <p className="text-3xl font-black text-red-400">{stockSummary.out}</p>
              </div>
            </div>

            {/* Stock Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {filteredStock.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-3 py-4 w-8">
                          <input type="checkbox" checked={selectedStockIds.size === filteredStock.length && filteredStock.length > 0} onChange={handleSelectAllStock} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                        </th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Threshold</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Last Restocked</th>
                        <th className="px-3 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Track Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(item => {
                        const status = !item.stockEnabled ? 'disabled' : item.currentStock === 0 ? 'out' : item.currentStock <= item.lowStockThreshold ? 'low' : 'ok';
                        return (
                          <tr key={item.menuItemId} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${!item.stockEnabled ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-4">
                              <input type="checkbox" checked={selectedStockIds.has(item.menuItemId)} onChange={() => handleSelectStockItem(item.menuItemId)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                            </td>
                            <td className="px-3 py-4">
                              <span className="text-sm font-bold dark:text-white">{item.name}</span>
                            </td>
                            <td className="px-3 py-4">
                              <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">{item.category}</span>
                            </td>
                            <td className="px-3 py-4">
                              {item.stockEnabled ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleSetStock(item.menuItemId, item.currentStock - 1)} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center"><Minus size={12} /></button>
                                <span className={`text-sm font-black min-w-[40px] text-center ${
                                  status === 'out' ? 'text-red-400' : status === 'low' ? 'text-amber-400' : 'text-white'
                                }`}>{item.currentStock}</span>
                                <button onClick={() => handleSetStock(item.menuItemId, item.currentStock + 1)} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center"><Plus size={12} /></button>
                              </div>
                              ) : <span className="text-xs text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-4 hidden md:table-cell">
                              {item.stockEnabled ? (
                              <input
                                type="number"
                                value={item.lowStockThreshold}
                                onChange={e => handleUpdateStockThreshold(item.menuItemId, parseInt(e.target.value) || 0)}
                                className="w-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                              ) : <span className="text-xs text-gray-400">—</span>}
                            </td>
                            <td className="px-3 py-4">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                status === 'disabled' ? 'bg-gray-500/20 text-gray-400' :
                                status === 'out' ? 'bg-red-500/20 text-red-400' :
                                status === 'low' ? 'bg-amber-500/20 text-amber-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {status === 'disabled' ? 'Disabled' : status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                              {item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '-'}
                            </td>
                            <td className="px-3 py-4 text-center">
                              <button
                                onClick={() => handleToggleStockEnabled(item.menuItemId)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.stockEnabled ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`}
                              >
                                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${item.stockEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <Package size={40} className="mb-3 opacity-30" />
                  <p className="text-sm font-bold">No items found</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stockFilter !== 'all' ? 'Try changing the filter' : 'Add menu items to track stock'}</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ════════════════════════════════════ */}
        {/* INVENTORY MANAGEMENT TAB            */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'INVENTORY' && (
          <InventoryManagement restaurant={restaurant} currencySymbol={currencySymbol} initialSubTab={inventorySubTab as any} />
        )}

        {/* ════════════════════════════════════ */}
        {/* REPORTS TAB                         */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'REPORTS' && (
          <ReportsView orders={orders} currencySymbol={currencySymbol} taxes={restaurant.settings?.taxes} initialSubTab={reportSubTab as any} />
        )}

        {/* ════════════════════════════════════ */}
        {/* CONTACTS TAB                        */}
        {/* ════════════════════════════════════ */}
        {activeTab === 'CONTACTS' && (
          <ContactsManagement restaurant={restaurant} currencySymbol={currencySymbol} initialSubTab={contactSubTab as any} />
        )}
      </div>
      </div>
    </div>
  );
};

export default BackOfficePage;
