import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus, MenuItem, Restaurant, Subscription, IngredientItem, Role } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from '../components/Toast';
import { fetchSettingsFromServer, loadBackofficeData, syncBackofficeToDb } from '../lib/sharedSettings';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Users, Receipt, ChevronRight, ChevronLeft, ChevronDown, ChevronFirst, ChevronLast, Filter,
  BarChart3, Package, UserPlus, UserMinus, Edit3, Trash2, Plus, Minus, Search, AlertCircle, Info,
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, Eye, Archive, RotateCcw,
  Briefcase, Tag, Layers, Activity, Warehouse, FileBarChart, Contact,
  CreditCard, Percent, FileText, Truck, ArrowUpDown, ClipboardList, Factory, History, Building2, Loader2, LogOut, Sun, Moon, Mail, MoreVertical,
  Download, Menu, X,
} from 'lucide-react';
import MenuItemFormModal, { MenuFormItem } from '../components/MenuItemFormModal';
import PromotionDiscountManager from '../components/PromotionDiscountManager';
import SectionInfoButton from '../components/SectionInfoButton';
import TableActionMenu from '../components/TableActionMenu';
import StandardReport, { type ReportDownloadOptions } from '../components/StandardReport';
import { getMenuItemEffectivePrice, isMenuPromotionActive } from '../lib/menuPricing';
import { getCalendarReportDateRange, localDateEnd, localDateStart } from '../lib/reportDateRanges';
import { deleteIngredientItemFromDb, fetchIngredientItemsFromDb, saveIngredientItemsToDb } from '../lib/ingredientItems';
import { fetchStockItemsFromDb, saveStockItemsToDb, saveStockMovementsToDb } from '../lib/stockItems';

// Back Office sections load their code (and run their data effects) only after
// the user opens the corresponding tab.
const InventoryManagement = React.lazy(() => import('../components/InventoryManagement'));
const ReportsView = React.lazy(() => import('../components/ReportsView'));
const ContactsManagement = React.lazy(() => import('../components/ContactsManagement'));
const FinanceView = React.lazy(() => import('../components/FinanceView'));
const ExpensesView = React.lazy(() => import('../components/ExpensesView'));
const CashierShiftRecords = React.lazy(() => import('../components/CashierShiftRecords'));
const StaffManagementView = React.lazy(() => import('../components/StaffManagementView'));

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  currencySymbol: string;
  isActive?: boolean;
  onFetchAllFilteredOrders?: (filters: any) => Promise<Order[]>;
  onFetchBackOfficeOrders?: (filters: any, signal?: AbortSignal) => Promise<Order[]>;
  onFetchBackOfficeSummary?: (filters: any, signal?: AbortSignal) => Promise<{ totalRevenue: number; orderVolume: number }>;
  onFetchOrderChanges?: (filters: any, updatedSince: string, signal?: AbortSignal) => Promise<{ orders: Order[]; syncCursor: string }>;
  onBack?: () => void;
  onAddMenuItem?: (restaurantId: string, item: MenuItem) => Promise<void>;
  onUpdateMenu?: (restaurantId: string, item: MenuItem) => Promise<void>;
  onPermanentDeleteMenuItem?: (restaurantId: string, itemId: string) => Promise<void>;
  onImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  subscription?: Subscription | null;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onLogout?: () => void;
  networkMeta?: {
    label: string;
    title: string;
    color: string;
    bars: number;
    mutedBars: boolean;
  };
  batteryMeta?: {
    percent: number;
    label: string;
    color: string;
  } | null;
  batteryCharging?: boolean;
  unreadMailCount?: number;
  onOpenMail?: () => void;
  onDownloadSalesReport?: (options: ReportDownloadOptions) => Promise<void>;
  userRole?: Role | null;
}

type BackOfficeTab = 'DASHBOARD' | 'ITEMS' | 'STAFF' | 'STOCK' | 'INVENTORY' | 'REPORTS' | 'CONTACTS' | 'FINANCE' | 'EXPENSES' | 'SHIFTS';
type DateRange = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

const COLORS = ['#D97706', '#F59E0B', '#92400E', '#B45309', '#78350F', '#FBBF24', '#FCD34D', '#3B82F6', '#8B5CF6', '#22C55E'];
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#22C55E',
  SERVED: '#3B82F6',
  PENDING: '#F59E0B',
  ONGOING: '#8B5CF6',
  CANCELLED: '#EF4444',
};

interface BackOfficeOrderCacheEntry {
  orders: Order[];
  startTimestamp: number;
  endTimestamp: number;
  syncCursor: string;
}

const backOfficeOrderCache = new Map<string, BackOfficeOrderCacheEntry>();

const mergeBackOfficeOrders = (current: Order[], changes: Order[]) => {
  const merged = new Map(current.map((order) => [order.id, order]));
  changes.forEach((order) => merged.set(order.id, { ...merged.get(order.id), ...order }));
  return Array.from(merged.values()).sort((left, right) => right.timestamp - left.timestamp);
};

const MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX = 'https://picsum.photos/seed/';

const hasRenderableMenuItemImage = (item: Pick<MenuItem, 'image' | 'color'>): boolean => (
  Boolean(item.image) && !(Boolean(item.color) && item.image.startsWith(MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX))
);

// â”€â”€â”€ Staff type â”€â”€â”€
interface StaffMember {
  id: string;
  username: string;
  role: 'CASHIER' | 'KITCHEN';
  email?: string;
  phone?: string;
  isActive?: boolean;
  kitchenCategories?: string[];
}

// â”€â”€â”€ Stock type â”€â”€â”€
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

interface ProductionRecord {
  id: string;
  producedItemId: string;
  producedItemName: string;
  quantityProduced: number;
  appliesTo?: 'all' | 'variants';
  variantKey?: string;
  variantLabel?: string;
  ingredients: { menuItemId: string; name: string; quantityUsed: number; unit: string; stockQuantityUsed?: number; stockUnit?: string }[];
  timestamp: number;
  notes: string;
}

const PURCHASE_UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
  { value: 'bag', label: 'Bag' },
  { value: 'can', label: 'Can' },
  { value: 'roll', label: 'Roll' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre' },
  { value: 'ml', label: 'Millilitre (ml)' },
];

const STOCK_UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre' },
  { value: 'ml', label: 'Millilitre (ml)' },
];

const getIngredientPurchaseUnit = (item: Partial<IngredientItem>) => item.purchase_unit || item.unit || 'pcs';
const getIngredientStockUnit = (item: Partial<IngredientItem>) => item.unit || 'pcs';
const getIngredientPurchaseRatio = (item: Partial<IngredientItem>) => {
  const ratio = Number(item.purchase_to_stock_quantity);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};
const UNIT_LABELS: Record<string, string> = {
  pcs: 'pcs',
  bottle: 'bottle',
  box: 'box',
  pack: 'pack',
  bag: 'bag',
  can: 'can',
  roll: 'roll',
  kg: 'kg',
  g: 'g',
  litre: 'L',
  l: 'L',
  ml: 'ml',
};
const getUnitLabel = (unit?: string) => UNIT_LABELS[(unit || 'pcs').toLowerCase()] || unit || 'pcs';
const formatStockNumber = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 });

const BackOfficePage: React.FC<Props> = ({ restaurant, orders, currencySymbol, isActive = true, onFetchAllFilteredOrders, onFetchBackOfficeOrders, onFetchBackOfficeSummary, onFetchOrderChanges, onBack, onAddMenuItem, onUpdateMenu, onPermanentDeleteMenuItem, onImageUpload, subscription, isDarkMode, onToggleTheme, onLogout, networkMeta, batteryMeta, batteryCharging = false, unreadMailCount = 0, onOpenMail, onDownloadSalesReport, userRole = 'VENDOR' }) => {
  const [isInitialLoading, setIsInitialLoading] = useState(() => !backOfficeOrderCache.has(restaurant.id));
  const [activeTab, setActiveTab] = useState<BackOfficeTab>('DASHBOARD');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [reportSubTab, setReportSubTab] = useState<string | undefined>(undefined);
  const [staffSubTab, setStaffSubTab] = useState<string | undefined>('directory');
  const [inventorySubTab, setInventorySubTab] = useState<string | undefined>(undefined);
  const [contactSubTab, setContactSubTab] = useState<string | undefined>(undefined);
  const [financeSubTab, setFinanceSubTab] = useState<string | undefined>(undefined);
  const [expensesSubTab, setExpensesSubTab] = useState<string | undefined>(undefined);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [backofficeDataVersion, setBackofficeDataVersion] = useState(0);

  // â”€â”€â”€ Items tab state â”€â”€â”€
  const [itemSearch, setItemSearch] = useState('');
  const [itemCategoryFilter, setItemCategoryFilter] = useState('ALL');
  const [itemShowArchived, setItemShowArchived] = useState(false);
  const [itemActionMenu, setItemActionMenu] = useState<{ itemId: string; top: number; right: number } | null>(null);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formItem, setFormItem] = useState<MenuFormItem>({});
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [itemSubTab, setItemSubTab] = useState<'menu' | 'ingredients' | 'stock' | 'promotions'>('menu');
  const [itemEntriesPerPage, setItemEntriesPerPage] = useState(30);
  const [itemCurrentPage, setItemCurrentPage] = useState(1);
  const [stockEntriesPerPage, setStockEntriesPerPage] = useState(30);
  const [stockCurrentPage, setStockCurrentPage] = useState(1);

  // â”€â”€â”€ Ingredient items state â”€â”€â”€
  const [ingredientItems, setIngredientItems] = useState<IngredientItem[]>(() =>
    loadBackofficeData<IngredientItem[]>(`ingredients_${restaurant.id}`, restaurant.settings, 'ingredients', [])
  );
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientCategoryFilter, setIngredientCategoryFilter] = useState('ALL');
  const [ingredientShowArchived, setIngredientShowArchived] = useState(false);
  const [isIngredientFormOpen, setIsIngredientFormOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientItem | null>(null);
  const [ingredientForm, setIngredientForm] = useState<Partial<IngredientItem>>({});
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);
  const [ingredientEntriesPerPage, setIngredientEntriesPerPage] = useState(30);
  const [ingredientCurrentPage, setIngredientCurrentPage] = useState(1);
  const [ingredientSyncWarning, setIngredientSyncWarning] = useState('');

  useEffect(() => {
    if (!itemActionMenu) return;

    const closeMenu = () => setItemActionMenu(null);
    document.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [itemActionMenu]);

  const ingredientPendingSyncKey = () => `ingredients_${restaurant.id}_pending_sync`;
  const ingredientPendingDeleteKey = () => `ingredients_${restaurant.id}_pending_delete`;

  const readStringSet = (key: string): Set<string> => {
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  };

  const writeStringSet = (key: string, ids: Set<string>) => {
    if (ids.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  };

  const normalizeIngredientItem = (item: Partial<IngredientItem>): IngredientItem => ({
    id: item.id || crypto.randomUUID(),
    restaurant_id: item.restaurant_id || restaurant.id,
    name: item.name || '',
    category: item.category || 'Uncategorized',
    cost: Number(item.cost || 0),
    unit: item.unit || 'pcs',
    purchase_unit: item.purchase_unit || item.unit || 'pcs',
    purchase_to_stock_quantity: Number(item.purchase_to_stock_quantity || 1),
    sku: item.sku || '',
    barcode: item.barcode || '',
    is_archived: Boolean(item.is_archived),
    notes: item.notes || '',
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
  });

  const mergeIngredientsByUpdatedAt = (localItems: IngredientItem[], remoteItems: IngredientItem[]) => {
    const merged = new Map<string, IngredientItem>();
    const chooseLatest = (next: IngredientItem) => {
      const current = merged.get(next.id);
      if (!current) {
        merged.set(next.id, normalizeIngredientItem(next));
        return;
      }
      const currentUpdated = new Date(current.updated_at || current.created_at || 0).getTime();
      const nextUpdated = new Date(next.updated_at || next.created_at || 0).getTime();
      if (nextUpdated >= currentUpdated) merged.set(next.id, normalizeIngredientItem(next));
    };

    remoteItems.forEach(chooseLatest);
    localItems.forEach(chooseLatest);
    return Array.from(merged.values()).sort((a, b) =>
      new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime()
    );
  };

  const saveIngredients = (items: IngredientItem[]) => {
    const normalized = items.map(normalizeIngredientItem);
    const removedIds = ingredientItems
      .filter(existing => !normalized.some(item => item.id === existing.id))
      .map(item => item.id);

    setIngredientItems(normalized);
    localStorage.setItem(`ingredients_${restaurant.id}`, JSON.stringify(normalized));
    syncBackofficeToDb(restaurant.id);

    const pendingSync = readStringSet(ingredientPendingSyncKey());
    normalized.forEach(item => pendingSync.add(item.id));
    writeStringSet(ingredientPendingSyncKey(), pendingSync);
    setIngredientSyncWarning('');

    saveIngredientItemsToDb(restaurant.id, normalized)
      .then(saved => {
        if (!saved) {
          setIngredientSyncWarning('Some ingredients are saved locally and will sync when cloud access is available.');
          return;
        }
        const latestPending = readStringSet(ingredientPendingSyncKey());
        normalized.forEach(item => latestPending.delete(item.id));
        writeStringSet(ingredientPendingSyncKey(), latestPending);
      })
      .catch(() => setIngredientSyncWarning('Some ingredients are saved locally and will sync when cloud access is available.'));

    if (removedIds.length > 0) {
      const pendingDelete = readStringSet(ingredientPendingDeleteKey());
      removedIds.forEach(id => pendingDelete.add(id));
      writeStringSet(ingredientPendingDeleteKey(), pendingDelete);
      removedIds.forEach(id => {
        deleteIngredientItemFromDb(restaurant.id, id).then(deleted => {
          if (!deleted) {
            setIngredientSyncWarning('Some ingredient deletes are saved locally and will sync when cloud access is available.');
            return;
          }
          const latestPendingDelete = readStringSet(ingredientPendingDeleteKey());
          latestPendingDelete.delete(id);
          writeStringSet(ingredientPendingDeleteKey(), latestPendingDelete);
        });
      });
    }
  };

  // Detect dark mode for Recharts inline color props
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const gridStroke = isDark ? '#374151' : '#E5E7EB';
  const tickFill = isDark ? '#9CA3AF' : '#6B7280';
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [customStart, setCustomStart] = useState(() => getCalendarReportDateRange('month').start);
  const [customEnd, setCustomEnd] = useState(() => getCalendarReportDateRange('month').end);

  const getQuickDateRange = (range: Exclude<DateRange, 'custom'>) => {
    return getCalendarReportDateRange(range);
  };

  useEffect(() => {
    if (dateRange === 'custom') return;

    const { start, end } = getQuickDateRange(dateRange);
    setCustomStart(start);
    setCustomEnd(end);
  }, [dateRange]);

  // â”€â”€â”€ Date filtering â”€â”€â”€
  const { startDate, endDate } = useMemo(() => {
    if (dateRange === 'custom') {
      return { startDate: localDateStart(customStart), endDate: localDateEnd(customEnd) };
    }
    return getQuickDateRange(dateRange);
  }, [dateRange, customStart, customEnd]);

  // â”€â”€â”€ Fetch ALL orders from API for dashboard (avoids 200-order in-memory cap) â”€â”€â”€
  const [dashboardOrders, setDashboardOrders] = useState<Order[]>(() => backOfficeOrderCache.get(restaurant.id)?.orders || []);
  const [hasDashboardSnapshot, setHasDashboardSnapshot] = useState(() => backOfficeOrderCache.has(restaurant.id));
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [previousPeriodSummary, setPreviousPeriodSummary] = useState({ totalSales: 0, totalOrders: 0, cancelled: 0 });
  const [isDownloadingSalesReport, setIsDownloadingSalesReport] = useState(false);

  const handleSharedSalesReportDownload = async (options: ReportDownloadOptions) => {
    if (!onDownloadSalesReport) {
      toast('Sales report download is still initializing. Please try again.', 'warning');
      return;
    }
    setIsDownloadingSalesReport(true);
    try {
      await onDownloadSalesReport(options);
    } finally {
      setIsDownloadingSalesReport(false);
    }
  };

  useEffect(() => {
    if (!isActive || activeTab !== 'DASHBOARD') return;
    const fetchBackOfficeOrders = onFetchBackOfficeOrders || onFetchAllFilteredOrders;
    if (!fetchBackOfficeOrders) {
      setIsInitialLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();

    const fetchDashboardData = async () => {
      const duration = endDate.getTime() - startDate.getTime();
      const prevStart = new Date(startDate.getTime() - duration);
      const requestedStart = new Date(prevStart.getFullYear(), prevStart.getMonth(), prevStart.getDate(), 0, 0, 0, 0);
      const requestedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const cached = backOfficeOrderCache.get(restaurant.id);
      const cacheCoversRange = cached
        && cached.startTimestamp <= startDate.getTime()
        && cached.endTimestamp >= requestedEnd.getTime();

      const loadPreviousPeriodSummary = async () => {
        if (!onFetchBackOfficeSummary) return;
        const previousFilters = {
          restaurantId: restaurant.id,
          startDate: toLocal(requestedStart),
          endDate: toLocal(new Date(startDate.getTime() - 1)),
        };
        try {
          const [all, cancelledOrders] = await Promise.all([
            onFetchBackOfficeSummary(previousFilters, controller.signal),
            onFetchBackOfficeSummary({ ...previousFilters, status: OrderStatus.CANCELLED }, controller.signal),
          ]);
          if (!cancelled) {
            const cancelledCount = Number(cancelledOrders.orderVolume || 0);
            setPreviousPeriodSummary({
              totalSales: Number(all.totalRevenue || 0),
              totalOrders: Math.max(0, Number(all.orderVolume || 0) - cancelledCount),
              cancelled: cancelledCount,
            });
          }
        } catch (err) {
          // Comparison data is supplementary; never block the selected period
          // if its small summary request fails.
          if (!cancelled) console.warn('Previous-period summary could not be loaded.', err);
        }
      };

      if (cacheCoversRange) {
        setDashboardOrders(cached.orders);
        setHasDashboardSnapshot(true);
        setIsInitialLoading(false);
        if (!onFetchOrderChanges) {
          await loadPreviousPeriodSummary();
          return;
        }
        setIsDashboardLoading(true);
        try {
          const [changes] = await Promise.all([
            onFetchOrderChanges({
              restaurantId: restaurant.id,
              startDate: toLocal(new Date(cached.startTimestamp)),
              endDate: toLocal(new Date(cached.endTimestamp)),
            }, cached.syncCursor, controller.signal),
            loadPreviousPeriodSummary(),
          ]);
          if (cancelled) return;
          const latestCached = backOfficeOrderCache.get(restaurant.id) || cached;
          if (changes.orders.length === 0) {
            backOfficeOrderCache.set(restaurant.id, { ...latestCached, syncCursor: changes.syncCursor });
            return;
          }
          const merged = mergeBackOfficeOrders(latestCached.orders, changes.orders);
          const nextCache = { ...latestCached, orders: merged, syncCursor: changes.syncCursor };
          backOfficeOrderCache.set(restaurant.id, nextCache);
          React.startTransition(() => setDashboardOrders(merged));
        } catch (err) {
          if (!cancelled) console.warn('Incremental Back Office refresh failed; using cached data.', err);
        } finally {
          if (!cancelled) setIsDashboardLoading(false);
        }
        return;
      }

      setIsDashboardLoading(true);
      if (!hasDashboardSnapshot) setIsInitialLoading(true);
      try {
        const requestCursor = new Date().toISOString();
        const [allOrders] = await Promise.all([
          fetchBackOfficeOrders({
            restaurantId: restaurant.id,
            startDate: toLocal(startDate),
            endDate: toLocal(requestedEnd),
          }, controller.signal),
          loadPreviousPeriodSummary(),
        ]);
        if (!cancelled) {
          backOfficeOrderCache.set(restaurant.id, {
            orders: allOrders,
            startTimestamp: startDate.getTime(),
            endTimestamp: requestedEnd.getTime(),
            syncCursor: requestCursor,
          });
          setDashboardOrders(allOrders);
          setHasDashboardSnapshot(true);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard orders:', err);
        if (!cancelled) toast('Could not load the complete Back Office order history. Please try again.', 'error');
      } finally {
        if (!cancelled) {
          setIsDashboardLoading(false);
          setIsInitialLoading(false);
        }
      }
    };

    fetchDashboardData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isActive, activeTab, startDate, endDate, restaurant.id, onFetchAllFilteredOrders, onFetchBackOfficeOrders, onFetchBackOfficeSummary, onFetchOrderChanges]);

  // While Back Office stays open, merge the POS realtime cache into the full
  // snapshot so new orders and status changes appear immediately. A cursor
  // refresh on the next entry catches anything missed while this page was closed.
  useEffect(() => {
    if (!isActive || !hasDashboardSnapshot || orders.length === 0) return;
    const cached = backOfficeOrderCache.get(restaurant.id);
    if (!cached) return;
    const liveChanges = orders.filter((order) => (
      order.restaurantId === restaurant.id
      && order.timestamp >= cached.startTimestamp
      && order.timestamp <= cached.endTimestamp
    ));
    if (liveChanges.length === 0) return;
    const cachedById = new Map(cached.orders.map((order) => [order.id, order]));
    const actualChanges = liveChanges.filter((order) => {
      const current = cachedById.get(order.id);
      if (!current) return true;
      if (current === order) return false;
      if (current.updatedAt && order.updatedAt) return current.updatedAt !== order.updatedAt;
      return current.status !== order.status
        || current.total !== order.total
        || current.timestamp !== order.timestamp
        || current.paymentMethod !== order.paymentMethod
        || current.items.length !== order.items.length;
    });
    if (actualChanges.length === 0) return;
    const merged = mergeBackOfficeOrders(cached.orders, actualChanges);
    backOfficeOrderCache.set(restaurant.id, { ...cached, orders: merged });
    React.startTransition(() => setDashboardOrders(merged));
  }, [isActive, orders, restaurant.id, hasDashboardSnapshot]);

  // Never fall back to the 200-order POS cache after a complete snapshot loads.
  const sourceOrders = hasDashboardSnapshot ? dashboardOrders : orders;

  const filteredOrders = useMemo(
    () => sourceOrders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= startDate && t <= endDate;
    }),
    [sourceOrders, startDate, endDate],
  );

  const prevPeriodOrders = useMemo(() => {
    const duration = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - duration);
    const prevEnd = new Date(startDate.getTime() - 1);
    return sourceOrders.filter(o => {
      const t = new Date(o.timestamp);
      return t >= prevStart && t <= prevEnd;
    });
  }, [sourceOrders, startDate, endDate]);

  const formatExportDateTime = (timestamp: number) => new Date(timestamp).toLocaleString('en-MY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getItemOptionsText = (item: Order['items'][number]) => {
    const parts = [
      item.selectedSize ? `Size: ${item.selectedSize}` : '',
      item.selectedTemp ? `Temp: ${item.selectedTemp}` : '',
      item.selectedOtherVariant ? `${item.otherVariantName || 'Variant'}: ${item.selectedOtherVariant}` : '',
      item.selectedVariantOption ? `Variant: ${item.selectedVariantOption}` : '',
      item.selectedMixMatch?.length ? item.selectedMixMatch.map(m => `${m.label}: ${m.choice}`).join('; ') : '',
    ].filter(Boolean);
    return parts.join('; ') || '-';
  };

  const getItemModifiersText = (item: Order['items'][number]) => (
    item.selectedModifiers && Object.keys(item.selectedModifiers).length > 0
      ? Object.entries(item.selectedModifiers).map(([name, value]) => `${name}: ${value}`).join('; ')
      : '-'
  );

  const getItemAddOnsText = (item: Order['items'][number]) => (
    item.selectedAddOns?.length
      ? item.selectedAddOns.map(addOn => `${addOn.name} x${addOn.quantity} (${currencySymbol}${addOn.price.toFixed(2)})`).join('; ')
      : '-'
  );

  const getItemLineTotal = (item: Order['items'][number]) => {
    const addOnsTotal = item.selectedAddOns?.reduce((sum, addOn) => sum + (Number(addOn.price) || 0) * (Number(addOn.quantity) || 0), 0) || 0;
    return ((Number(item.price) || 0) + addOnsTotal) * (Number(item.quantity) || 0);
  };

  const csvCell = (value: string | number | undefined | null) => {
    const text = value === undefined || value === null || value === '' ? '-' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const handleDashboardExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast('No orders to export for this date range.', 'warning');
      return;
    }

    const headers = [
      'Order ID', 'Date Time', 'Status', 'Order Source', 'Dining Type', 'Table Number', 'Location',
      'Payment Method', 'Cashier', 'Customer ID', 'Item ID', 'Item Name', 'SKU', 'Category',
      'Quantity', 'Unit Price', 'Line Total', 'Item Options', 'Modifiers', 'Add-ons',
      'Item Remark', 'Order Total', 'Amount Received', 'Change Amount', 'Order Remark',
      'Rejection Reason', 'Rejection Note',
    ];

    const rows = [...filteredOrders]
      .sort((a, b) => b.timestamp - a.timestamp)
      .flatMap(order => {
        const items = order.items.length > 0 ? order.items : [null];
        return items.map(item => [
          order.id,
          formatExportDateTime(order.timestamp),
          order.status,
          order.orderSource || '-',
          order.diningType || '-',
          order.tableNumber || '-',
          order.locationName || '-',
          order.paymentMethod || '-',
          order.cashierName || '-',
          order.customerId || '-',
          item?.id || '-',
          item?.name || '-',
          item?.sku || '-',
          item?.category || '-',
          item?.quantity ?? '-',
          item ? (Number(item.price) || 0).toFixed(2) : '-',
          item ? getItemLineTotal(item).toFixed(2) : '-',
          item ? getItemOptionsText(item) : '-',
          item ? getItemModifiersText(item) : '-',
          item ? getItemAddOnsText(item) : '-',
          item?.remark || '-',
          (Number(order.total) || 0).toFixed(2),
          order.amountReceived !== undefined ? order.amountReceived.toFixed(2) : '-',
          order.changeAmount !== undefined ? order.changeAmount.toFixed(2) : '-',
          order.remark || '-',
          order.rejectionReason || '-',
          order.rejectionNote || '-',
        ]);
      });

    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_orders_${customStart}_${customEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDashboardExportPDF = async () => {
    if (filteredOrders.length === 0) {
      toast('No orders to export for this date range.', 'warning');
      return;
    }

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    const completed = filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED);
    const cancelled = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED);
    const totalSales = completed.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
    const darkGray = [55, 65, 81] as [number, number, number];
    const amber = [217, 119, 6] as [number, number, number];

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkGray);
    doc.text(restaurant.name || 'Dashboard Orders Report', margin, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`Dashboard Orders: ${customStart} to ${customEnd}`, margin, 21);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 21, { align: 'right' });
    doc.setDrawColor(...amber);
    doc.setLineWidth(0.5);
    doc.line(margin, 25, pageWidth - margin, 25);

    autoTable(doc, {
      startY: 30,
      head: [['Total Orders', 'Completed / Active', 'Cancelled', 'Total Sales']],
      body: [[
        filteredOrders.length.toString(),
        completed.length.toString(),
        cancelled.length.toString(),
        `${currencySymbol}${totalSales.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ]],
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
      theme: 'grid',
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      head: [['Date Time', 'Order ID', 'Status', 'Source', 'Table', 'Payment', 'Cashier', 'Items', 'Total']],
      body: [...filteredOrders]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map(order => [
          formatExportDateTime(order.timestamp),
          order.id,
          order.status,
          order.orderSource || '-',
          order.tableNumber || order.locationName || '-',
          order.paymentMethod || '-',
          order.cashierName || '-',
          order.items.map(item => `${item.name} x${item.quantity}`).join('; ') || '-',
          `${currencySymbol}${(Number(order.total) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 243, 199] },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 34 },
        2: { cellWidth: 22 },
        3: { cellWidth: 20 },
        4: { cellWidth: 22 },
        5: { cellWidth: 24 },
        6: { cellWidth: 24 },
        7: { cellWidth: 82 },
        8: { cellWidth: 24, halign: 'right' },
      },
      theme: 'grid',
    });

    const pageCount = (doc as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text('QuickServe Dashboard Orders Report', margin, doc.internal.pageSize.getHeight() - 7);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
    }

    doc.save(`dashboard_orders_${customStart}_${customEnd}.pdf`);
  };

  // â”€â”€â”€ Staff State â”€â”€â”€
  const [staffList, setStaffList] = useState<StaffMember[]>(() =>
    loadBackofficeData<StaffMember[]>(`staff_${restaurant.id}`, restaurant.settings, 'staff', [])
  );
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ username: '', password: '', email: '', phone: '', role: 'CASHIER' as 'CASHIER' | 'KITCHEN' });
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState('');

  // â”€â”€â”€ Stock State â”€â”€â”€
  const [stockItems, setStockItems] = useState<StockItem[]>(() => {
    const saved = loadBackofficeData<StockItem[] | null>(`stock_${restaurant.id}`, restaurant.settings, 'stock', null);
    if (saved) {
      return saved.map((s: any) => ({ ...s, stockEnabled: s.stockEnabled ?? false }));
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
      stockEnabled: false,
    }));
  });
  const [stockMenuOpen, setStockMenuOpen] = useState(false);
  const [stockSelectionMode, setStockSelectionMode] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [stockSubTab, setStockSubTab] = useState<'menu' | 'ingredients'>('menu');
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());

  const saveStock = (items: StockItem[]) => {
    setStockItems(items);
    localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(items));
    syncBackofficeToDb(restaurant.id);
    saveStockItemsToDb(restaurant.id, items, new Set(ingredientItems.map(item => item.id))).catch(() => {});
  };

  const readCachedBackofficeArray = <T,>(key: string): T[] => {
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const mergeStockItems = (localItems: StockItem[], remoteItems: StockItem[]) => {
    const merged = new Map<string, StockItem>();
    remoteItems.forEach(item => {
      if (item.menuItemId) merged.set(item.menuItemId, { ...item, stockEnabled: item.stockEnabled ?? false });
    });
    localItems.forEach(item => {
      if (item.menuItemId && !merged.has(item.menuItemId)) merged.set(item.menuItemId, { ...item, stockEnabled: item.stockEnabled ?? false });
    });
    return Array.from(merged.values());
  };

  const mergeProductions = (localItems: ProductionRecord[], remoteItems: ProductionRecord[]) => {
    const merged = new Map<string, ProductionRecord>();
    remoteItems.forEach(item => {
      if (item.id) merged.set(item.id, item);
    });
    localItems.forEach(item => {
      if (item.id && !merged.has(item.id)) merged.set(item.id, item);
    });
    return Array.from(merged.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  };

  useEffect(() => {
    if (!isActive || activeTab !== 'ITEMS') return;
    let cancelled = false;

    const refreshBackofficeInventoryData = async () => {
      const [latestSettings, dbStock] = await Promise.all([
        fetchSettingsFromServer(restaurant.id),
        fetchStockItemsFromDb(restaurant.id),
      ]);
      if (cancelled) return;

      const settingsStock = Array.isArray(latestSettings?.backoffice?.stock)
        ? latestSettings.backoffice.stock as StockItem[]
        : [];
      const localStock = readCachedBackofficeArray<StockItem>(`stock_${restaurant.id}`);
      const remoteStock = dbStock && dbStock.length > 0 ? dbStock : settingsStock;
      const mergedStock = mergeStockItems(localStock, remoteStock);
      if (mergedStock.length > 0) {
        setStockItems(mergedStock);
        localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(mergedStock));
      }

      const remoteProductions = Array.isArray(latestSettings?.backoffice?.productions)
        ? latestSettings.backoffice.productions as ProductionRecord[]
        : [];
      const localProductions = readCachedBackofficeArray<ProductionRecord>(`inv_${restaurant.id}_productions`);
      const mergedProductions = mergeProductions(localProductions, remoteProductions);
      if (mergedProductions.length > 0) {
        localStorage.setItem(`inv_${restaurant.id}_productions`, JSON.stringify(mergedProductions));
      }

      const hasLocalOnlyStock = localStock.some(item => item.menuItemId && !remoteStock.some(remote => remote.menuItemId === item.menuItemId));
      const hasLocalOnlyProduction = localProductions.some(item => item.id && !remoteProductions.some(remote => remote.id === item.id));
      if (hasLocalOnlyStock) {
        saveStockItemsToDb(restaurant.id, mergedStock, new Set(ingredientItems.map(item => item.id))).catch(() => {});
      }
      if (hasLocalOnlyStock || hasLocalOnlyProduction) syncBackofficeToDb(restaurant.id);
      setBackofficeDataVersion(version => version + 1);
    };

    refreshBackofficeInventoryData().catch(() => {});
    return () => { cancelled = true; };
  }, [isActive, activeTab, restaurant.id]);

  useEffect(() => {
    if (!isActive || activeTab !== 'ITEMS') return;
    let cancelled = false;

    const loadIngredients = async () => {
      setIngredientSyncWarning('');

      let localItems: IngredientItem[] = [];
      try {
        const saved = localStorage.getItem(`ingredients_${restaurant.id}`);
        localItems = saved ? (JSON.parse(saved) as Partial<IngredientItem>[]).map(normalizeIngredientItem) : [];
      } catch {
        localItems = [];
      }

      const settingsItems = Array.isArray(restaurant.settings?.backoffice?.ingredients)
        ? (restaurant.settings.backoffice.ingredients as Partial<IngredientItem>[]).map(normalizeIngredientItem)
        : [];
      const cachedItems = mergeIngredientsByUpdatedAt(localItems, settingsItems);
      if (cachedItems.length > 0) {
        setIngredientItems(cachedItems);
        localStorage.setItem(`ingredients_${restaurant.id}`, JSON.stringify(cachedItems));
      }

      const pendingDeleteIds = readStringSet(ingredientPendingDeleteKey());
      for (const id of Array.from(pendingDeleteIds)) {
        const deleted = await deleteIngredientItemFromDb(restaurant.id, id);
        if (cancelled) return;
        if (deleted) {
          pendingDeleteIds.delete(id);
          writeStringSet(ingredientPendingDeleteKey(), pendingDeleteIds);
        }
      }

      const remoteItems = await fetchIngredientItemsFromDb(restaurant.id);
      if (cancelled) return;

      if (!remoteItems) {
        if (readStringSet(ingredientPendingSyncKey()).size > 0 || readStringSet(ingredientPendingDeleteKey()).size > 0) {
          setIngredientSyncWarning('Some ingredients are saved locally and will sync when cloud access is available.');
        }
        return;
      }

      const remoteIds = new Set(remoteItems.map(item => item.id));
      const pendingSyncIds = readStringSet(ingredientPendingSyncKey());
      const uploadItems = cachedItems.filter(item => pendingSyncIds.has(item.id) || !remoteIds.has(item.id));

      if (uploadItems.length > 0) {
        const uploaded = await saveIngredientItemsToDb(restaurant.id, uploadItems);
        if (cancelled) return;
        if (uploaded) {
          const latestPending = readStringSet(ingredientPendingSyncKey());
          uploadItems.forEach(item => latestPending.delete(item.id));
          writeStringSet(ingredientPendingSyncKey(), latestPending);
        } else {
          uploadItems.forEach(item => pendingSyncIds.add(item.id));
          writeStringSet(ingredientPendingSyncKey(), pendingSyncIds);
          setIngredientSyncWarning('Some ingredients are saved locally and will sync when cloud access is available.');
        }
      }

      const latestPendingDeleteIds = readStringSet(ingredientPendingDeleteKey());
      const merged = mergeIngredientsByUpdatedAt(cachedItems, remoteItems)
        .filter(item => !latestPendingDeleteIds.has(item.id));
      setIngredientItems(merged);
      localStorage.setItem(`ingredients_${restaurant.id}`, JSON.stringify(merged));

      const stockIds = new Set(stockItems.map(item => item.menuItemId));
      const missingIngredientStock = merged
        .filter(item => !item.is_archived && !stockIds.has(item.id))
        .map(item => ({
          menuItemId: item.id,
          name: item.name,
          category: item.category,
          currentStock: 0,
          lowStockThreshold: 10,
          unit: item.unit,
          lastRestocked: Date.now(),
          stockEnabled: true,
        }));
      if (missingIngredientStock.length > 0) {
        saveStock([...stockItems, ...missingIngredientStock]);
      }
    };

    loadIngredients().catch(() => {
      if (!cancelled) setIngredientSyncWarning('Ingredients loaded from this device. Cloud sync will retry next time Items & Stock opens.');
    });

    return () => { cancelled = true; };
  }, [isActive, activeTab, restaurant.id]);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SALES ANALYTICS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const kpis = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED);
    const totalSales = completed.reduce((s, o) => s + o.total, 0);
    const prevTotalSales = onFetchBackOfficeSummary ? previousPeriodSummary.totalSales : prevPeriodOrders.filter(o => o.status !== OrderStatus.CANCELLED).reduce((s, o) => s + o.total, 0);
    const totalOrders = completed.length;
    const prevTotalOrders = onFetchBackOfficeSummary ? previousPeriodSummary.totalOrders : prevPeriodOrders.filter(o => o.status !== OrderStatus.CANCELLED).length;
    const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAvg = prevTotalOrders > 0 ? prevTotalSales / prevTotalOrders : 0;
    const cancelled = filteredOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const prevCancelled = onFetchBackOfficeSummary ? previousPeriodSummary.cancelled : prevPeriodOrders.filter(o => o.status === OrderStatus.CANCELLED).length;
    const pct = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
    return {
      totalSales, totalOrders, avgOrder, cancelled,
      salesChange: pct(totalSales, prevTotalSales),
      ordersChange: pct(totalOrders, prevTotalOrders),
      avgChange: pct(avgOrder, prevAvg),
      cancelledChange: pct(cancelled, prevCancelled),
    };
  }, [filteredOrders, prevPeriodOrders, previousPeriodSummary, onFetchBackOfficeSummary]);

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

  // â”€â”€â”€ Hourly sales heatmap data â”€â”€â”€
  const hourlySales = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, sales: 0, orders: 0 }));
    filteredOrders.filter(o => o.status !== OrderStatus.CANCELLED).forEach(o => {
      const h = new Date(o.timestamp).getHours();
      hours[h].sales += o.total;
      hours[h].orders += 1;
    });
    return hours.map(h => ({ ...h, label: `${h.hour.toString().padStart(2, '0')}:00` }));
  }, [filteredOrders]);

  // â”€â”€â”€ Top items sold â”€â”€â”€
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

  // â”€â”€â”€ Category breakdown â”€â”€â”€
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

  // â”€â”€â”€ PERFORMANCE â”€â”€â”€
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

  // â”€â”€â”€ Peak hours â”€â”€â”€
  const peakHours = useMemo(() => {
    const sorted = [...hourlySales].sort((a, b) => b.orders - a.orders);
    return sorted.slice(0, 5);
  }, [hourlySales]);

  const recentOrders = useMemo(
    () => [...filteredOrders].sort((a, b) => b.timestamp - a.timestamp).slice(0, 15),
    [filteredOrders],
  );

  // â”€â”€â”€ Helpers â”€â”€â”€
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
            {p.name}: <span className="text-amber-600 dark:text-amber-400 font-bold">{typeof p.value === 'number' && p.name !== 'orders' ? `${currencySymbol}${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  // â”€â”€â”€ Staff handlers â”€â”€â”€
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
      syncBackofficeToDb(restaurant.id);
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
    syncBackofficeToDb(restaurant.id);
    toast(`${staff.username} ${newActive ? 'activated' : 'deactivated'}`, 'success');
  };

  const handleDeleteStaff = async (staff: StaffMember) => {
    if (!confirm(`Remove ${staff.username}? This cannot be undone.`)) return;
    const { error } = await supabase.from('users').delete().eq('id', staff.id);
    if (error) { toast('Failed to remove staff', 'error'); return; }
    const updated = staffList.filter(s => s.id !== staff.id);
    setStaffList(updated);
    localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
    syncBackofficeToDb(restaurant.id);
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
      syncBackofficeToDb(restaurant.id);
      toast('Staff list refreshed', 'success');
    }
  };

  // â”€â”€â”€ Stock handlers â”€â”€â”€
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
    setStockSelectionMode(false);
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
    const current = stockItems.find(s => s.menuItemId === itemId);
    const nextStock = Math.max(0, stock);
    const updated = stockItems.map(s =>
      s.menuItemId === itemId ? { ...s, currentStock: nextStock } : s
    );
    saveStock(updated);
    if (current && Number(current.currentStock || 0) !== nextStock) {
      saveStockMovementsToDb(restaurant.id, [{
        itemId,
        itemType: ingredientItems.some(item => item.id === itemId) ? 'ingredient' : 'menu',
        itemName: current.name,
        movementType: 'manual_set',
        direction: 'adjust',
        quantity: Math.abs(nextStock - Number(current.currentStock || 0)),
        unit: current.unit,
        previousStock: Number(current.currentStock || 0),
        newStock: nextStock,
        referenceType: 'items_stock',
      }]).catch(() => {});
    }
  };

  const filteredStock = useMemo(() => {
    const ingredientIds = new Set(ingredientItems.map(item => item.id));
    let items = stockItems.filter(item => stockSubTab === 'ingredients' ? ingredientIds.has(item.menuItemId) : !ingredientIds.has(item.menuItemId));
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      items = items.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
    }
    if (stockFilter === 'low') items = items.filter(s => s.currentStock > 0 && s.currentStock <= s.lowStockThreshold);
    if (stockFilter === 'out') items = items.filter(s => s.currentStock === 0);
    return items;
  }, [stockItems, ingredientItems, stockSubTab, stockSearch, stockFilter]);

  const stockSummary = useMemo(() => {
    const enabled = stockItems.filter(s => s.stockEnabled);
    const total = enabled.length;
    const low = enabled.filter(s => s.currentStock > 0 && s.currentStock <= s.lowStockThreshold).length;
    const out = enabled.filter(s => s.currentStock === 0).length;
    const healthy = total - low - out;
    return { total, low, out, healthy };
  }, [stockItems]);

  const purchaseOrdersForCost = useMemo<any[]>(() => {
    try {
      const saved = localStorage.getItem(`inv_${restaurant.id}_purchase_orders`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, [restaurant.id, activeTab, itemSubTab]);

  const productionsForCost = useMemo<any[]>(() => (
    loadBackofficeData<any[]>(`inv_${restaurant.id}_productions`, restaurant.settings, 'productions', [])
  ), [restaurant.id, restaurant.settings, activeTab, itemSubTab, backofficeDataVersion]);

  const getLatestStockUnitCost = (itemId: string) => {
    const toComparableTime = (value: unknown) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : Number(value) || 0;
      }
      return 0;
    };
    const receivedOrders = [...purchaseOrdersForCost]
      .filter(po => po.status === 'received' || po.status === 'partial')
      .sort((a, b) => toComparableTime(b.receivedAt || b.createdAt || b.timestamp) - toComparableTime(a.receivedAt || a.createdAt || a.timestamp));

    for (const po of receivedOrders) {
      const item = po.items?.find((line: any) => line.menuItemId === itemId);
      if (item && Number(item.costPerUnit) > 0) {
        const ratio = Number(item.stockQuantityPerUnit);
        return Number(item.costPerUnit) / (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
      }
    }
    const ingredient = ingredientItems.find(item => item.id === itemId);
    return ingredient?.cost ? ingredient.cost / getIngredientPurchaseRatio(ingredient) : 0;
  };

  const getProductionUnitCost = (menuItemId: string, variantKey = '') => {
    const candidates = [...productionsForCost]
      .filter(production => (
        production.producedItemId === menuItemId &&
        Number(production.quantityProduced) >= 0 &&
        (variantKey
          ? production.appliesTo === 'variants' && production.variantKey === variantKey
          : production.appliesTo !== 'variants')
      ))
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    const production = candidates[0];
    if (!production) return 0;
    const totalCost = (production.ingredients || []).reduce((sum: number, ingredient: any) => {
      const stockQuantity = Number(ingredient.stockQuantityUsed ?? ingredient.quantityUsed) || 0;
      return sum + stockQuantity * getLatestStockUnitCost(ingredient.menuItemId);
    }, 0);
    const quantityProduced = Number(production.quantityProduced || 0);
    return totalCost / (quantityProduced > 0 ? quantityProduced : 1);
  };

  const getDisplayedMenuItemCost = (item: MenuItem) => (
    item.autoCostFromProduction ? getProductionUnitCost(item.id) : Number(item.cost || 0)
  );

  // â”€â”€â”€ Ingredient tab helpers â”€â”€â”€
  const ingredientCategories = useMemo(() => {
    const cats = Array.from(new Set(ingredientItems.map(i => i.category))).sort();
    return ['ALL', ...cats];
  }, [ingredientItems]);

  const filteredIngredients = useMemo(() => {
    return ingredientItems.filter(item => {
      if (!ingredientShowArchived && item.is_archived) return false;
      if (ingredientShowArchived && !item.is_archived) return false;
      if (ingredientCategoryFilter !== 'ALL' && item.category !== ingredientCategoryFilter) return false;
      if (ingredientSearch) {
        const q = ingredientSearch.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q) && !(item.sku || '').toLowerCase().includes(q) && !(item.barcode || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [ingredientItems, ingredientSearch, ingredientCategoryFilter, ingredientShowArchived]);

  const ingredientTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredIngredients.length / ingredientEntriesPerPage)), [filteredIngredients.length, ingredientEntriesPerPage]);
  const paginatedIngredients = useMemo(() => {
    const start = (ingredientCurrentPage - 1) * ingredientEntriesPerPage;
    return filteredIngredients.slice(start, start + ingredientEntriesPerPage);
  }, [filteredIngredients, ingredientCurrentPage, ingredientEntriesPerPage]);

  useEffect(() => { setIngredientCurrentPage(1); }, [ingredientSearch, ingredientCategoryFilter, ingredientShowArchived, ingredientEntriesPerPage]);

  const openAddIngredient = () => {
    setEditingIngredient(null);
    setIngredientForm({ name: '', category: '', cost: 0, unit: 'pcs', purchase_unit: 'pcs', purchase_to_stock_quantity: 1, sku: '', barcode: '', notes: '', is_archived: false });
    setIsIngredientFormOpen(true);
  };

  const openEditIngredient = (item: IngredientItem) => {
    setEditingIngredient(item);
    setIngredientForm({
      ...item,
      purchase_unit: getIngredientPurchaseUnit(item),
      purchase_to_stock_quantity: getIngredientPurchaseRatio(item),
    });
    setIsIngredientFormOpen(true);
  };

  const handleIngredientFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingredientForm.name?.trim()) return;
    setIsSavingIngredient(true);
    try {
      if (editingIngredient) {
        // Update existing
        const updated = ingredientItems.map(i =>
          i.id === editingIngredient.id ? {
            ...i,
            ...ingredientForm,
            unit: getIngredientStockUnit(ingredientForm),
            purchase_unit: getIngredientPurchaseUnit(ingredientForm),
            purchase_to_stock_quantity: getIngredientPurchaseRatio(ingredientForm),
            updated_at: new Date().toISOString(),
          } as IngredientItem : i
        );
        saveIngredients(updated);
        saveStock(stockItems.map(s =>
          s.menuItemId === editingIngredient.id
            ? {
                ...s,
                name: ingredientForm.name?.trim() || s.name,
                category: ingredientForm.category?.trim() || 'Uncategorized',
                unit: getIngredientStockUnit(ingredientForm),
              }
            : s
        ));
        toast(`${ingredientForm.name} updated`, 'success');
      } else {
        // Create new
        const newItem: IngredientItem = {
          id: crypto.randomUUID(),
          restaurant_id: restaurant.id,
          name: ingredientForm.name?.trim() || '',
          category: ingredientForm.category?.trim() || 'Uncategorized',
          cost: ingredientForm.cost || 0,
          unit: getIngredientStockUnit(ingredientForm),
          purchase_unit: getIngredientPurchaseUnit(ingredientForm),
          purchase_to_stock_quantity: getIngredientPurchaseRatio(ingredientForm),
          sku: ingredientForm.sku,
          barcode: ingredientForm.barcode,
          notes: ingredientForm.notes || '',
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        saveIngredients([...ingredientItems, newItem]);
        // Also add to stock tracking
        const newStockItem: StockItem = {
          menuItemId: newItem.id,
          name: newItem.name,
          category: newItem.category,
          currentStock: 0,
          lowStockThreshold: 10,
          unit: newItem.unit,
          lastRestocked: Date.now(),
          stockEnabled: true,
        };
        saveStock([...stockItems, newStockItem]);
        toast(`${newItem.name} added`, 'success');
      }
      setIsIngredientFormOpen(false);
      setEditingIngredient(null);
    } finally {
      setIsSavingIngredient(false);
    }
  };

  const handleArchiveIngredient = (item: IngredientItem) => {
    const updated = ingredientItems.map(i =>
      i.id === item.id ? { ...i, is_archived: !i.is_archived, updated_at: new Date().toISOString() } : i
    );
    saveIngredients(updated);
    toast(`${item.name} ${item.is_archived ? 'restored' : 'archived'}`, 'success');
  };

  const handleDeleteIngredient = (item: IngredientItem) => {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    saveIngredients(ingredientItems.filter(i => i.id !== item.id));
    // Also remove from stock tracking
    saveStock(stockItems.filter(s => s.menuItemId !== item.id));
    toast(`${item.name} deleted`, 'success');
  };

  const filteredStaff = useMemo(() => {
    if (!staffSearch) return staffList;
    const q = staffSearch.toLowerCase();
    return staffList.filter(s => s.username.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
  }, [staffList, staffSearch]);

  // â”€â”€â”€ Items tab helpers â”€â”€â”€
  const itemCategories = useMemo(() => {
    const cats = Array.from(new Set(restaurant.menu.map(m => m.category))).sort();
    return ['ALL', ...cats];
  }, [restaurant.menu]);

  const filteredItems = useMemo(() => {
    return restaurant.menu.filter(item => {
      if (!itemShowArchived && item.isArchived) return false;
      if (itemShowArchived && !item.isArchived) return false;
      if (itemCategoryFilter !== 'ALL' && item.category !== itemCategoryFilter) return false;
      if (itemSearch) {
        const q = itemSearch.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q) && !(item.sku || '').toLowerCase().includes(q) && !(item.barcode || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [restaurant.menu, itemSearch, itemCategoryFilter, itemShowArchived]);

  const itemTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredItems.length / itemEntriesPerPage)), [filteredItems.length, itemEntriesPerPage]);
  const paginatedItems = useMemo(() => {
    const start = (itemCurrentPage - 1) * itemEntriesPerPage;
    return filteredItems.slice(start, start + itemEntriesPerPage);
  }, [filteredItems, itemCurrentPage, itemEntriesPerPage]);

  // Reset page when filters change
  useEffect(() => { setItemCurrentPage(1); }, [itemSearch, itemCategoryFilter, itemShowArchived, itemEntriesPerPage]);
  useEffect(() => {
    setStockCurrentPage(1);
    setSelectedStockIds(new Set());
    setStockSelectionMode(false);
  }, [stockSearch, stockFilter, stockEntriesPerPage, stockSubTab]);

  const stockTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredStock.length / stockEntriesPerPage)), [filteredStock.length, stockEntriesPerPage]);
  const paginatedStock = useMemo(() => {
    const start = (stockCurrentPage - 1) * stockEntriesPerPage;
    return filteredStock.slice(start, start + stockEntriesPerPage);
  }, [filteredStock, stockCurrentPage, stockEntriesPerPage]);

  const openAddItem = () => {
    setEditingItem(null);
    setFormItem({ name: '', description: '', price: 0, image: '', category: '', soldBy: 'each', cost: 0, autoCostFromProduction: false, sku: '', barcode: '', trackStock: false, isArchived: false, sizes: [], addOns: [], linkedModifiers: [], sizesEnabled: false, promotionDiscount: undefined });
    setIsItemFormOpen(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setFormItem({
      ...item,
      sizesEnabled: (item.sizes?.length ?? 0) > 0,
      variantOptions: item.variantOptions || { enabled: false, options: [] },
      promotionDiscount: item.promotionDiscount,
    });
    setIsItemFormOpen(true);
  };

  const handleItemFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItem.name?.trim() || !formItem.category?.trim()) {
      toast('Name and category are required', 'warning');
      return;
    }
    const itemId = editingItem?.id || crypto.randomUUID();
    const autoProductionCost = formItem.autoCostFromProduction ? getProductionUnitCost(itemId) : 0;
    const linked = formItem.linkedModifiers || [];
    const trimmedImage = (formItem.image || '').trim();
    const fallbackImage = formItem.color ? '' : `${MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX}${encodeURIComponent(formItem.name.trim())}/300/300`;
    const payload: MenuItem = {
      id: itemId,
      name: formItem.name.trim(),
      description: (formItem.description || '').trim(),
      price: Number(formItem.price || 0),
      image: trimmedImage || fallbackImage,
      category: formItem.category.trim(),
      isArchived: formItem.isArchived || false,
      sizes: formItem.sizesEnabled ? formItem.sizes : [],
      tempOptions: formItem.tempOptions?.enabled ? formItem.tempOptions : undefined,
      variantOptions: formItem.variantOptions?.enabled ? formItem.variantOptions : undefined,
      otherVariantName: linked[0] || '',
      otherVariants: [],
      otherVariantsEnabled: linked.length > 0,
      linkedModifiers: linked,
      addOns: formItem.addOns || [],
      cost: formItem.autoCostFromProduction ? autoProductionCost : Number(formItem.cost || 0),
      autoCostFromProduction: formItem.autoCostFromProduction || false,
      sku: (formItem.sku || '').trim(),
      barcode: (formItem.barcode || '').trim(),
      soldBy: formItem.soldBy || 'each',
      trackStock: formItem.trackStock || false,
      color: formItem.color || undefined,
      mixAndMatch: formItem.mixAndMatch?.enabled ? formItem.mixAndMatch : undefined,
      promotionDiscount: formItem.promotionDiscount,
    };

    setIsSavingItem(true);
    try {
      if (editingItem) {
        await onUpdateMenu?.(restaurant.id, payload);
      } else {
        await onAddMenuItem?.(restaurant.id, payload);
      }
      setIsItemFormOpen(false);
      setEditingItem(null);
      toast(editingItem ? 'Item updated' : 'Item added', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save item', 'error');
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleArchiveItem = async (item: MenuItem) => {
    await onUpdateMenu?.(restaurant.id, { ...item, isArchived: true });
    toast(`${item.name} archived`, 'success');
  };

  const handleRestoreItem = async (item: MenuItem) => {
    await onUpdateMenu?.(restaurant.id, { ...item, isArchived: false });
    toast(`${item.name} restored`, 'success');
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    await onPermanentDeleteMenuItem?.(restaurant.id, item.id);
    toast(`${item.name} deleted`, 'success');
  };

  // â”€â”€â”€ Tab buttons â”€â”€â”€
  const simpleTabs: { key: BackOfficeTab; label: string; icon: React.ReactNode }[] = [
    { key: 'DASHBOARD', label: 'Dashboard', icon: <BarChart3 size={18} /> },
    { key: 'ITEMS', label: 'Items & Stock', icon: <ShoppingBag size={18} /> },
    { key: 'STAFF', label: 'Staff Management', icon: <Users size={18} /> },
    { key: 'SHIFTS', label: 'Cashier Shifts', icon: <Clock size={18} /> },
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
      key: 'REPORTS', label: 'Sales Report', icon: <FileBarChart size={18} />,
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
    {
      key: 'EXPENSES' as BackOfficeTab, label: 'Expenses', icon: <Receipt size={18} />,
      subItems: [],
    },
    {
      key: 'FINANCE', label: 'Finance', icon: <DollarSign size={18} />,
      subItems: [],
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
    if (tabKey === 'FINANCE') return financeSubTab;
    if (tabKey === 'EXPENSES') return expensesSubTab;
    return undefined;
  };

  const setActiveSubTab = (tabKey: BackOfficeTab, subKey: string) => {
    if (tabKey === 'REPORTS') setReportSubTab(subKey);
    else if (tabKey === 'INVENTORY') setInventorySubTab(subKey);
    else if (tabKey === 'CONTACTS') setContactSubTab(subKey);
    else if (tabKey === 'FINANCE') setFinanceSubTab(subKey);
    else if (tabKey === 'EXPENSES') setExpensesSubTab(subKey);
  };

  const handleSeeDetails = (reportTab: string) => {
    setReportSubTab(reportTab);
    setActiveTab('REPORTS');
    setExpandedMenus(prev => new Set(prev).add('REPORTS'));
  };

  // â”€â”€â”€ Date Range Picker â”€â”€â”€
  const renderDateRangePicker = () => (
    <StandardReport
        toolbarOnly
        showHeader={false}
        reportStart={customStart}
        reportEnd={customEnd}
        reportStatus="ALL"
        reportSearchQuery=""
        entriesPerPage={30}
        currentPage={1}
        totalPages={1}
        paginatedReports={[]}
        reportData={null}
        onChangeReportStart={value => {
          setCustomStart(value);
          setDateRange('custom');
        }}
        onChangeReportEnd={value => {
          setCustomEnd(value);
          setDateRange('custom');
        }}
        onChangeReportStatus={() => undefined}
        onChangeReportSearchQuery={() => undefined}
        onChangeEntriesPerPage={() => undefined}
        onChangeCurrentPage={() => undefined}
        onDownloadReport={handleSharedSalesReportDownload}
        isDownloadingReport={isDownloadingSalesReport}
        planId={subscription?.plan_id || 'basic'}
      />
  );

  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white relative" style={{ height: 'var(--app-height, 100dvh)' }}>
      {/* Initial Loading Overlay */}
      {isInitialLoading && (
        <div
          className="fixed inset-0 z-[200] bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label="Loading Back Office"
        >
          <Loader2 size={40} className="animate-spin text-amber-500 mb-4" />
          <p className="text-sm font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Loading Back Office...</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Fetching latest data</p>
        </div>
      )}
      {isDashboardLoading && !isInitialLoading && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-[70] -translate-x-1/2 rounded-full border border-amber-200 bg-white/95 px-3 py-1.5 shadow-md dark:border-amber-500/30 dark:bg-gray-800/95">
          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600 dark:text-gray-300">
            <Loader2 size={13} className="animate-spin text-amber-500" />
            Checking for updates...
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b dark:border-gray-700 h-11 sm:h-12 flex items-center justify-between px-3 sm:px-6 lg:px-8 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              setIsSidebarCollapsed(false);
              setIsMobileMenuOpen(true);
            }}
            className="lg:hidden p-1.5 -ml-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            <Menu size={22} />
          </button>
          <img
            src={isDarkMode ? "/LOGO/9-dark.png" : "/LOGO/9.png"}
            alt="QuickServe"
            className="h-7 sm:h-8 w-auto"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="40"><text x="0" y="28" font-family="Arial,sans-serif" font-size="24" font-weight="900" fill="%23f97316">QuickServe</text></svg>')}`;
            }}
          />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {networkMeta && (
            <div className="flex h-8 items-center gap-1 rounded-full bg-gray-100/80 px-1.5 dark:bg-gray-700/70">
              <div
                className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${networkMeta.color}`}
                title={networkMeta.title}
                aria-label={`Network ${networkMeta.label}`}
              >
                <div className="flex h-[18px] w-[18px] items-end justify-center gap-0.5 pb-0.5" aria-hidden="true">
                  {[1, 2, 3].map((bar) => (
                    <span
                      key={bar}
                      className={`w-1 rounded-full transition-colors ${
                        bar <= networkMeta.bars || !networkMeta.mutedBars
                          ? 'bg-current'
                          : 'bg-gray-300/80 dark:bg-gray-500/80'
                      }`}
                      style={{ height: `${bar * 4}px` }}
                    />
                  ))}
                </div>
              </div>
              {batteryMeta && (
                <div
                  className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${batteryMeta.color}`}
                  title={batteryMeta.label}
                  aria-label={batteryMeta.label}
                >
                  <div className="flex h-[18px] w-[18px] items-center justify-center" aria-hidden="true">
                    <div className="relative h-3 w-5 rounded-[3px] border-2 border-current p-0.5">
                      <span
                        className="block h-full rounded-[1px] bg-current transition-all"
                        style={{ width: batteryMeta.percent > 0 ? `${Math.max(batteryMeta.percent, 8)}%` : '0%' }}
                      />
                      {batteryCharging && (
                        <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black leading-none text-white">
                          +
                        </span>
                      )}
                    </div>
                    <span className="h-1.5 w-0.5 shrink-0 rounded-r bg-current" />
                  </div>
                </div>
              )}
              {onOpenMail && (
                <button
                  onClick={onOpenMail}
                  className="relative flex h-6 w-7 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-white dark:text-white dark:hover:bg-gray-600"
                  title="Mail"
                >
                  <Mail size={16} />
                  {unreadMailCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{unreadMailCount}</span>
                  )}
                </button>
              )}
            </div>
          )}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              style={isDarkMode ? {
                backgroundColor: '#2D3F55',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
              } : {
                backgroundColor: '#F5D9B8',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
              }}
              className="relative flex h-8 w-14 shrink-0 items-center rounded-full transition-all duration-300 focus:outline-none"
            >
              <span
                style={isDarkMode
                  ? { background: 'linear-gradient(135deg, #6366f1 0%, #3730a3 100%)', boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)' }
                  : { background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)', boxShadow: '0 0 10px rgba(249, 115, 22, 0.3)' }
                }
                className={`absolute left-1 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${isDarkMode ? 'translate-x-6' : 'translate-x-0'}`}
              >
                {isDarkMode ? <Moon size={13} className="text-yellow-100" /> : <Sun size={13} className="text-white" />}
              </span>
              <Sun size={12} className={`absolute left-2 transition-opacity duration-300 text-orange-400 ${isDarkMode ? 'opacity-40' : 'opacity-0'}`} />
              <Moon size={12} className={`absolute right-2 transition-opacity duration-300 text-indigo-400 ${isDarkMode ? 'opacity-0' : 'opacity-40'}`} />
            </button>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-[9px] text-gray-400 font-bold uppercase leading-tight">{userRole === 'HR' ? 'HUMAN RESOURCES' : 'VENDOR'}</p>
            <p className="text-[11px] font-black dark:text-white leading-tight">{restaurant.name}</p>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white shrink-0" title="Logout">
              <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-[120] w-64 ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shrink-0 transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo / Header */}
        <div className={`relative flex items-center ${isSidebarCollapsed ? 'p-3 justify-center' : 'px-4 py-4 gap-3'}`}>
          <button
            onClick={onBack}
            title={onBack ? 'Open company in POS' : restaurant.name}
            className={`${isSidebarCollapsed ? '' : 'pointer-events-none'} rounded-lg hover:ring-2 hover:ring-amber-300 transition-all`}
          >
            {restaurant.logo ? (
              <img
                src={restaurant.logo}
                alt={`${restaurant.name} logo`}
                className={`rounded-lg shadow-sm ${isSidebarCollapsed ? 'w-8 h-8' : 'w-10 h-10'} object-cover`}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`; }}
              />
            ) : (
              <Briefcase size={isSidebarCollapsed ? 16 : 20} className="text-amber-500" />
            )}
          </button>
          {!isSidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-sm uppercase tracking-tight leading-tight truncate">{restaurant.name}</h2>
                <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Back Office</p>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute right-3 top-3 lg:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2 space-y-1' : 'px-3 py-4 space-y-1'}`}>
          {/* Simple tabs */}
          {simpleTabs.map(tab => (
            <div key={tab.key}>
              <button
                onClick={() => {
                  setActiveTab(tab.key);
                  setIsMobileMenuOpen(false);
                  if (tab.key === 'STAFF' && !isSidebarCollapsed) {
                    setStaffSubTab('directory');
                    setExpandedMenus(previous => previous.has('STAFF') ? new Set() : new Set(['STAFF']));
                  } else {
                    setExpandedMenus(new Set());
                  }
                }}
                title={tab.label}
                className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {tab.icon}
                {!isSidebarCollapsed && (
                  <>
                    <span className="flex-1 whitespace-nowrap text-left">{tab.label}</span>
                    {tab.key === 'STAFF' && <ChevronDown size={14} className={`transition-transform duration-200 ${expandedMenus.has('STAFF') ? 'rotate-180' : ''}`} />}
                  </>
                )}
              </button>
              {!isSidebarCollapsed && tab.key === 'STAFF' && (
                <div className={`ml-6 space-y-0.5 overflow-hidden border-l-2 border-gray-200 pl-3 transition-all duration-300 ease-in-out dark:border-gray-700 ${expandedMenus.has('STAFF') ? 'mt-1 max-h-24 opacity-100' : 'mt-0 max-h-0 opacity-0'}`}>
                  <button
                    onClick={() => { setActiveTab('STAFF'); setStaffSubTab('access'); }}
                    className={`w-full whitespace-nowrap rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-all ${activeTab === 'STAFF' && staffSubTab === 'access' ? 'bg-amber-50/50 font-bold text-amber-600 dark:bg-amber-900/10 dark:text-amber-400' : 'text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300'}`}
                  >
                    User Access
                  </button>
                </div>
              )}
            </div>
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
                      if (tab.subItems.length === 0) {
                        setActiveTab(tab.key);
                        setExpandedMenus(new Set());
                        setIsMobileMenuOpen(false);
                      } else {
                        toggleExpanded(tab.key);
                        if (!isActive) {
                          setActiveTab(tab.key);
                          if (!currentSub) setActiveSubTab(tab.key, tab.subItems[0].key);
                        }
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
                      {tab.subItems.length > 0 && (
                        <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </>
                  )}
                </button>
                {!isSidebarCollapsed && tab.subItems.length > 0 && (
                  <div className={`ml-6 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-700 pl-3 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0'}`}>
                    {tab.subItems.map(sub => (
                      <button
                        key={sub.key}
                        onClick={() => {
                          setActiveTab(tab.key);
                          setActiveSubTab(tab.key, sub.key);
                          setIsMobileMenuOpen(false);
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

        <div className={`border-t dark:border-gray-700 space-y-1.5 ${isSidebarCollapsed ? 'p-2' : 'px-3 py-2'}`}>
          {onBack && (
            <button
              onClick={onBack}
              title="Back to POS"
              className="w-full py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg bg-[#374151] text-white hover:bg-[#2f3847]"
            >
              <ShoppingBag size={18} />
              {!isSidebarCollapsed && 'Back to POS'}
            </button>
          )}
        </div>

      </aside>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

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

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* DASHBOARD TAB                       */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'DASHBOARD' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-black">Sales Overview</h2>
            </div>
            {renderDateRangePicker()}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Sales', value: `${currencySymbol}${kpis.totalSales.toFixed(2)}`, change: kpis.salesChange, icon: <DollarSign size={20} className="text-amber-600 dark:text-amber-500" />, bg: 'bg-amber-100 dark:bg-amber-600/20' },
                { label: 'Total Orders', value: kpis.totalOrders.toLocaleString(), change: kpis.ordersChange, icon: <ShoppingBag size={20} className="text-blue-600 dark:text-blue-400" />, bg: 'bg-blue-100 dark:bg-blue-600/20' },
                { label: 'Avg. Order', value: `${currencySymbol}${kpis.avgOrder.toFixed(2)}`, change: kpis.avgChange, icon: <Receipt size={20} className="text-green-600 dark:text-green-400" />, bg: 'bg-green-100 dark:bg-green-600/20' },
                { label: 'Cancelled', value: kpis.cancelled.toString(), change: kpis.cancelledChange, icon: <XCircle size={20} className="text-red-600 dark:text-red-400" />, bg: 'bg-red-100 dark:bg-red-600/20' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-gray-600 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>{kpi.icon}</div>
                    <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{kpi.label}</span>
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
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Daily Sales</h3>
                  <button onClick={() => handleSeeDetails('sales_summary')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
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
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} tickFormatter={v => `${currencySymbol}${v}`} />
                      <Tooltip content={<CustomTooltip />} cursor={false} />
                      <Area type="monotone" dataKey="sales" stroke="#D97706" fill="url(#salesGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">No data</div>}
              </div>

              {/* Payment Methods */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Payment Methods</h3>
                  <button onClick={() => handleSeeDetails('sales_by_payment')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {paymentData.length > 0 ? (
                  <>
                    <div className="flex justify-center">
                      <ResponsiveContainer width={220} height={220}>
                        <PieChart>
                          <Pie data={paymentData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" stroke="none">
                            {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip cursor={false} content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 shadow-xl"><p className="text-xs font-bold text-gray-900 dark:text-white">{d.name}</p><p className="text-xs text-gray-600 dark:text-gray-300">{d.value} orders ({d.pct}%)</p></div>;
                          }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {paymentData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{d.name}</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white ml-auto">{d.pct}%</span>
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
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Sales by Hour</h3>
                  <button onClick={() => handleSeeDetails('sales_by_employee')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={hourlySales.filter(h => h.orders > 0)}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: tickFill }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: tickFill }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={24} name="orders" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Selling Items */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Top Selling Items</h3>
                  <button onClick={() => handleSeeDetails('sales_by_item')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
                </div>
                {topItems.length > 0 ? (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {topItems.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                          i === 0 ? 'bg-amber-600 text-white' : i === 1 ? 'bg-gray-500 text-white' : i === 2 ? 'bg-orange-800 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{item.qty} sold</p>
                        </div>
                        <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{currencySymbol}{item.revenue.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                ) : <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>}
              </div>
            </div>

            {/* Category Breakdown + Order Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Category Sales */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Sales by Category</h3>
                  <button onClick={() => handleSeeDetails('sales_by_category')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
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
                            <span className="text-xs text-gray-500 dark:text-gray-400">{currencySymbol}{cat.revenue.toFixed(2)} ({cat.orders} items)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="h-32 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>}
              </div>

              {/* Order Status */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Order Status Breakdown</h3>
                  <button onClick={() => handleSeeDetails('sales_summary')} className="text-[10px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 flex items-center gap-1 transition-all">See Details <ChevronRight size={12} /></button>
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
                            <span className="text-xs text-gray-500 dark:text-gray-400">{s.value} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s.name] || '#6B7280' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="h-32 flex items-center justify-center text-gray-500 dark:text-gray-600 text-sm">No data</div>}
              </div>
            </div>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* ITEMS TAB (Loyverse-style)          */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'ITEMS' && isItemFormOpen ? (
          <MenuItemFormModal
            isOpen={isItemFormOpen}
            formItem={formItem}
            setFormItem={setFormItem}
            categories={itemCategories.filter(c => c !== 'ALL')}
            availableModifiers={restaurant.modifiers || []}
            productionCost={editingItem ? getProductionUnitCost(editingItem.id) : 0}
            currencySymbol={currencySymbol}
            showProductionCostLink
            onClose={() => { setIsItemFormOpen(false); setEditingItem(null); }}
            onSubmit={handleItemFormSubmit}
            onImageUpload={onImageUpload}
          />
        ) : activeTab === 'ITEMS' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black text-gray-950 dark:text-white">Items &amp; Stock</h2>
              <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">Manage menu items, ingredients, and stock tracking in a clean operational view.</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Items', value: restaurant.menu.filter(m => !m.isArchived).length, icon: <Package size={20} className="text-blue-500" />, tone: 'bg-blue-500/10' },
                { label: 'Categories', value: itemCategories.length - 1, icon: <Layers size={20} className="text-amber-500" />, tone: 'bg-amber-500/10' },
                { label: 'Tracked', value: restaurant.menu.filter(m => !m.isArchived && m.trackStock).length, icon: <CheckCircle size={20} className="text-emerald-500" />, tone: 'bg-emerald-500/10' },
                { label: 'Archived', value: restaurant.menu.filter(m => m.isArchived).length, icon: <Archive size={20} className="text-rose-500" />, tone: 'bg-rose-500/10' },
              ].map(card => (
                <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>{card.icon}</div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{card.label}</span>
                  </div>
                  <p className="text-2xl font-black text-gray-950 dark:text-white">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="min-w-0">
              {/* Sub-tab toggle */}
              <div className="relative flex gap-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {([['menu', 'Menu Items'], ['promotions', 'Promotion'], ['ingredients', 'Ingredients / Supplies'], ['stock', 'Stock Management']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setItemSubTab(key)}
                    style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                    className={`relative -mb-px inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg border px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-150 ${
                      itemSubTab === key
                        ? 'z-10 border-x border-t border-gray-200 bg-white text-orange-500 dark:border-gray-600 dark:border-t-orange-500 dark:bg-gray-800'
                        : 'border-gray-200 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                    }`}
                  >{label}</button>
                ))}
              </div>

            {/* â”€â”€ Menu Items sub-tab â”€â”€ */}
            {itemSubTab === 'menu' && (
            <>
            <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex shrink-0 items-center gap-3">
                <div className="relative shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search name, SKU, barcode..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    className="w-56 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <SectionInfoButton
                  title="Item List"
                  description="Search, filter, and manage active items or archived records."
                />
              </div>
              <div className="flex w-full flex-nowrap items-center gap-3 overflow-x-auto lg:w-auto lg:justify-end">
                <select
                  value={itemCategoryFilter}
                  onChange={e => setItemCategoryFilter(e.target.value)}
                  className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold uppercase text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  {itemCategories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'ALL CATEGORIES' : c.toUpperCase()}</option>)}
                </select>
                <div className="flex h-9 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <button
                    type="button"
                    onClick={() => setItemShowArchived(false)}
                    className={`inline-flex items-center rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${!itemShowArchived ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemShowArchived(true)}
                    className={`inline-flex items-center rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${itemShowArchived ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    Archived
                  </button>
                </div>
                <button
                  onClick={openAddItem}
                  className="inline-flex h-10 w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Item Table */}
            <div className="overflow-hidden">
              {/* Filter bar with Show entries */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Showing {filteredItems.length === 0 ? 0 : (itemCurrentPage - 1) * itemEntriesPerPage + 1}-{Math.min(itemCurrentPage * itemEntriesPerPage, filteredItems.length)} of {filteredItems.length}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show</span>
                  <select value={itemEntriesPerPage} onChange={e => setItemEntriesPerPage(Number(e.target.value))} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-1 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entries</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Item</th>
                      <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 md:table-cell">Category</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Price</th>
                      <th className="hidden px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-400 lg:table-cell">Cost</th>
                      <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 lg:table-cell">SKU</th>
                      <th className="hidden px-4 py-2 text-center text-[10px] font-black uppercase tracking-wider text-gray-400 md:table-cell">Stock</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No items found</td></tr>
                    ) : paginatedItems.map(item => {
                      const displayedCost = getDisplayedMenuItemCost(item);
                      return (
                      <tr key={item.id} className="transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {hasRenderableMenuItemImage(item) ? (
                              <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-700 shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60 shrink-0" style={item.color ? { backgroundColor: item.color } : { backgroundColor: '#D1D5DB' }}>
                                <Package size={16} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-sm dark:text-white truncate">{item.name}</p>
                              {item.description && <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{item.description}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{item.category}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isMenuPromotionActive(item.promotionDiscount) && getMenuItemEffectivePrice(item) < Number(item.price || 0) ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[10px] font-bold text-gray-400 line-through">{currencySymbol}{item.price.toFixed(2)}</span>
                              <span className="font-bold text-orange-500">{currencySymbol}{getMenuItemEffectivePrice(item).toFixed(2)}</span>
                            </div>
                          ) : (
                            <span className="font-bold text-gray-900 dark:text-white">{currencySymbol}{item.price.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-gray-500 lg:table-cell">
                          {displayedCost ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{currencySymbol}{displayedCost.toFixed(2)}</span>
                              {item.autoCostFromProduction && <span className="text-[8px] font-black uppercase tracking-wider text-amber-500">Auto</span>}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-xs text-gray-500 lg:table-cell">{item.sku || '-'}</td>
                        <td className="hidden px-4 py-3 text-center md:table-cell">
                          {item.trackStock ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-bold text-green-600 dark:bg-green-900/30 dark:text-green-400">Tracked</span>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                if (itemActionMenu?.itemId === item.id) {
                                  setItemActionMenu(null);
                                  return;
                                }
                                const rect = event.currentTarget.getBoundingClientRect();
                                const menuHeight = item.isArchived ? 132 : 96;
                                setItemActionMenu({
                                  itemId: item.id,
                                  top: Math.min(rect.bottom + 4, window.innerHeight - menuHeight),
                                  right: window.innerWidth - rect.right,
                                });
                              }}
                              aria-label={`Actions for ${item.name}`}
                              aria-expanded={itemActionMenu?.itemId === item.id}
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                              title="Actions"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {itemActionMenu?.itemId === item.id && (
                              <div
                                role="menu"
                                onClick={event => event.stopPropagation()}
                                className="fixed z-[60] w-48 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800"
                                style={{ top: itemActionMenu.top, right: itemActionMenu.right }}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => { setItemActionMenu(null); openEditItem(item); }}
                                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  <Edit3 size={14} className="text-amber-500" /> Edit
                                </button>
                                {item.isArchived ? (
                                  <>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => { setItemActionMenu(null); handleRestoreItem(item); }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-green-50 hover:text-green-600 dark:text-gray-300 dark:hover:bg-green-900/20 dark:hover:text-green-400"
                                    >
                                      <RotateCcw size={14} /> Restore
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => { setItemActionMenu(null); handleDeleteItem(item); }}
                                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                      <Trash2 size={14} /> Delete permanently
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { setItemActionMenu(null); handleArchiveItem(item); }}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    <Archive size={14} /> Archive
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </div>

            {/* Item Pagination */}
            {itemTotalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
                <button onClick={() => setItemCurrentPage(1)} disabled={itemCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronFirst size={16} />
                </button>
                <button onClick={() => setItemCurrentPage(p => Math.max(1, p - 1))} disabled={itemCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: itemTotalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setItemCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${itemCurrentPage === page ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button onClick={() => setItemCurrentPage(p => Math.min(itemTotalPages, p + 1))} disabled={itemCurrentPage === itemTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setItemCurrentPage(itemTotalPages)} disabled={itemCurrentPage === itemTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronLast size={16} />
                </button>
              </div>
            )}
            </>
            )}

            {/* Promotion / Discount sub-tab */}
            {itemSubTab === 'promotions' && (
              <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <PromotionDiscountManager
                  restaurant={restaurant}
                  currencySymbol={currencySymbol}
                  onUpdateMenu={onUpdateMenu}
                />
              </div>
            )}

            {/* â”€â”€ Ingredients / Supplies sub-tab â”€â”€ */}
            {itemSubTab === 'ingredients' && (
            <>
            {/* Ingredient Form Modal */}
            {isIngredientFormOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 backdrop-blur-sm" onClick={() => { setIsIngredientFormOpen(false); setEditingIngredient(null); }}>
                <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
                  <h3 className="mb-2 text-sm font-black">{editingIngredient ? 'Edit Ingredient' : 'Add Ingredient / Supply'}</h3>
                  <form onSubmit={handleIngredientFormSubmit} className="space-y-2">
                    <div>
                      <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Name *</label>
                      <input type="text" value={ingredientForm.name || ''} onChange={e => setIngredientForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sugar, Ice Block, Ketchup" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" required />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Category</label>
                        <input type="text" value={ingredientForm.category || ''} onChange={e => setIngredientForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Ingredients, Packaging" list="ingredient-categories" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                        <datalist id="ingredient-categories">
                          {ingredientCategories.filter(c => c !== 'ALL').map(c => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Purchase Unit</label>
                        <select value={getIngredientPurchaseUnit(ingredientForm)} onChange={e => setIngredientForm(f => ({ ...f, purchase_unit: e.target.value }))} className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                          {PURCHASE_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Stock Unit</label>
                        <select value={getIngredientStockUnit(ingredientForm)} onChange={e => setIngredientForm(f => ({ ...f, unit: e.target.value }))} className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                          {STOCK_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">1 {getIngredientPurchaseUnit(ingredientForm)} Equals</label>
                        <div className="flex h-8 overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-amber-500 dark:border-gray-700 dark:bg-gray-900">
                          <input type="number" step="0.001" min="0" value={ingredientForm.purchase_to_stock_quantity || ''} onChange={e => setIngredientForm(f => ({ ...f, purchase_to_stock_quantity: parseFloat(e.target.value) || 0 }))} placeholder="1" className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-900 outline-none dark:text-white" />
                          <span className="flex items-center border-l border-gray-200 px-3 text-xs font-bold text-gray-400 dark:border-gray-700">{getIngredientStockUnit(ingredientForm)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Cost per {getIngredientPurchaseUnit(ingredientForm)} ({currencySymbol})</label>
                        <input type="number" step="0.01" value={ingredientForm.cost || ''} onChange={e => setIngredientForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">SKU</label>
                        <input type="text" value={ingredientForm.sku || ''} onChange={e => setIngredientForm(f => ({ ...f, sku: e.target.value }))} placeholder="Optional" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Barcode</label>
                        <input type="text" value={ingredientForm.barcode || ''} onChange={e => setIngredientForm(f => ({ ...f, barcode: e.target.value }))} placeholder="Optional" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">Notes</label>
                        <input type="text" value={ingredientForm.notes || ''} onChange={e => setIngredientForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setIsIngredientFormOpen(false); setEditingIngredient(null); }} className="h-8 flex-1 rounded-lg bg-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500 transition-all hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600">Cancel</button>
                      <button type="submit" disabled={isSavingIngredient} className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-xs font-bold uppercase tracking-wider text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30">
                        {isSavingIngredient && <Loader2 size={14} className="animate-spin" />}
                        {editingIngredient ? 'Update' : 'Add'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <div className="flex shrink-0 items-center gap-3">
                <div className="relative shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="text" placeholder="Search name, SKU, barcode..." value={ingredientSearch} onChange={e => setIngredientSearch(e.target.value)} className="w-56 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <SectionInfoButton
                  title="Ingredients & Supplies"
                  description="Manage non-menu items used for purchasing, stock, and cost tracking."
                />
              </div>
              <div className="flex w-full flex-nowrap items-center gap-3 overflow-x-auto md:w-auto md:justify-end">
                <select value={ingredientCategoryFilter} onChange={e => setIngredientCategoryFilter(e.target.value)} className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold uppercase text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  {ingredientCategories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'ALL CATEGORIES' : c.toUpperCase()}</option>)}
                </select>
                <div className="flex h-9 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <button type="button" onClick={() => setIngredientShowArchived(false)} className={`inline-flex items-center rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${!ingredientShowArchived ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                    Active
                  </button>
                  <button type="button" onClick={() => setIngredientShowArchived(true)} className={`inline-flex items-center rounded-md px-3 text-[10px] font-black uppercase tracking-widest transition ${ingredientShowArchived ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                    Archived
                  </button>
                </div>
                <button onClick={openAddIngredient} className="inline-flex h-10 w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600">
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Ingredients & supplies are non-menu items like sugar, ice blocks, ketchup, packaging, etc. Set a purchase unit and stock unit so Purchase Orders can receive packs while production deducts the matching stock balance.</p>
            </div>
            {ingredientSyncWarning && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                {ingredientSyncWarning}
              </div>
            )}

            {/* Ingredients Table */}
            <div className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Showing {filteredIngredients.length === 0 ? 0 : (ingredientCurrentPage - 1) * ingredientEntriesPerPage + 1}-{Math.min(ingredientCurrentPage * ingredientEntriesPerPage, filteredIngredients.length)} of {filteredIngredients.length}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Show</span>
                  <select value={ingredientEntriesPerPage} onChange={e => setIngredientEntriesPerPage(Number(e.target.value))} className="bg-gray-100 dark:bg-gray-700 border-none rounded-lg text-[10px] font-bold dark:text-white p-1 outline-none cursor-pointer">
                    <option value={30}>30</option><option value={50}>50</option><option value={100}>100</option>
                  </select>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Entries</span>
                </div>
              </div>
              {paginatedIngredients.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cost/Purchase Unit</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock Unit</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Conversion</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">SKU</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Notes</th>
                        <th className="px-5 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedIngredients.map(item => (
                        <tr key={item.id} className={`border-b border-gray-100 transition-colors dark:border-gray-700/50 ${item.is_archived ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-4">
                            <span className="text-sm font-bold dark:text-white">{item.name}</span>
                          </td>
                          <td className="px-5 py-4"><span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-md">{item.category}</span></td>
                          <td className="px-5 py-4 text-sm font-bold dark:text-white">{currencySymbol}{(item.cost || 0).toFixed(2)} / {getIngredientPurchaseUnit(item)}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{getIngredientStockUnit(item)}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">1 {getIngredientPurchaseUnit(item)} = {getIngredientPurchaseRatio(item)} {getIngredientStockUnit(item)}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{item.sku || '-'}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-[150px]">{item.notes || '-'}</td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end">
                              <TableActionMenu label={`Actions for ${item.name}`} menuHeight={item.is_archived ? 132 : 96}>
                                {close => (
                                  <>
                                    <button type="button" role="menuitem" onClick={() => { close(); openEditIngredient(item); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
                                      <Edit3 size={14} className="text-amber-500" /> Edit
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => { close(); handleArchiveIngredient(item); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold transition ${item.is_archived ? 'text-gray-600 hover:bg-green-50 hover:text-green-600 dark:text-gray-300 dark:hover:bg-green-900/20 dark:hover:text-green-400' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'}`}>
                                      {item.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />} {item.is_archived ? 'Restore' : 'Archive'}
                                    </button>
                                    {item.is_archived && (
                                      <button type="button" role="menuitem" onClick={() => { close(); handleDeleteIngredient(item); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20">
                                        <Trash2 size={14} /> Delete permanently
                                      </button>
                                    )}
                                  </>
                                )}
                              </TableActionMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                  <p className="text-sm font-bold">{ingredientShowArchived ? 'No archived ingredients' : 'No ingredients yet'}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{ingredientShowArchived ? 'Archived ingredients will appear here' : 'Add ingredients like sugar, ice blocks, packaging, etc.'}</p>
                  {!ingredientShowArchived && (
                    <button onClick={openAddIngredient} className="mt-4 inline-flex h-10 w-24 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600">
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>
              )}
            </div>
            </div>

            {/* Ingredient Pagination */}
            {ingredientTotalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
                <button onClick={() => setIngredientCurrentPage(1)} disabled={ingredientCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all"><ChevronFirst size={16} /></button>
                <button onClick={() => setIngredientCurrentPage(p => Math.max(1, p - 1))} disabled={ingredientCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all"><ChevronLeft size={16} /></button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: ingredientTotalPages }, (_, i) => i + 1).map(page => (
                    <button key={page} onClick={() => setIngredientCurrentPage(page)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${ingredientCurrentPage === page ? 'bg-amber-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{page}</button>
                  ))}
                </div>
                <button onClick={() => setIngredientCurrentPage(p => Math.min(ingredientTotalPages, p + 1))} disabled={ingredientCurrentPage === ingredientTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all"><ChevronRight size={16} /></button>
                <button onClick={() => setIngredientCurrentPage(ingredientTotalPages)} disabled={ingredientCurrentPage === ingredientTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all"><ChevronLast size={16} /></button>
              </div>
            )}
            </>
            )}

            {/* â”€â”€ Stock Management sub-tab â”€â”€ */}
            {itemSubTab === 'stock' && (
            <>
            <div className="rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <div className="flex shrink-0 items-center gap-3">
                <div className="relative shrink-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    className="w-48 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <SectionInfoButton
                  title="Stock Management"
                  description="Track stock levels, thresholds, and stock tracking status in one place."
                />
              </div>
              <div className="flex w-full flex-nowrap items-center gap-3 overflow-x-auto md:w-auto md:justify-end">
                <div className="flex shrink-0 rounded-xl border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-900">
                  {([['all', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setStockFilter(key)}
                      className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        stockFilter === key ? 'bg-white text-amber-600 shadow-sm dark:bg-gray-800 dark:text-amber-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                      }`}
                    >{label}</button>
                  ))}
                </div>
                <button
                  onClick={handleGoToRestock}
                  className="inline-flex h-10 w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Selection Action Bar */}
            {stockSelectionMode && (
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{selectedStockIds.size} selected</span>
                  <button onClick={() => handleToggleSelectedStock(true)} className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-wider hover:bg-green-500/30 transition-all">Enable Track</button>
                  <button onClick={() => handleToggleSelectedStock(false)} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/30 transition-all">Disable Track</button>
                </div>
                <button onClick={() => { setStockSelectionMode(false); setSelectedStockIds(new Set()); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-bold">Cancel</button>
              </div>
            )}

            {/* Stock Table */}
            <div className="overflow-hidden">
              {/* Filter bar with Show entries */}
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="flex items-center gap-1">
                  {([
                    ['menu', 'Menu Stock'],
                    ['ingredients', 'Ingredient Stock'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setStockSubTab(key)}
                      className={`h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-wider transition-colors ${
                        stockSubTab === key
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Showing {filteredStock.length === 0 ? 0 : (stockCurrentPage - 1) * stockEntriesPerPage + 1}-{Math.min(stockCurrentPage * stockEntriesPerPage, filteredStock.length)} of {filteredStock.length}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show</span>
                  <select value={stockEntriesPerPage} onChange={e => setStockEntriesPerPage(Number(e.target.value))} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-1 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entries</span>
                </div>
              </div>
              {paginatedStock.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <div className="relative">
                            <button onClick={() => setStockMenuOpen(!stockMenuOpen)} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                              <MoreVertical size={16} className="text-gray-500" />
                            </button>
                            {stockMenuOpen && (
                              <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 min-w-[140px] py-1">
                                <button
                                  onClick={() => { setStockSelectionMode(true); setStockMenuOpen(false); }}
                                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >Select</button>
                                <button
                                  onClick={() => { setStockSelectionMode(true); setSelectedStockIds(new Set(filteredStock.map(s => s.menuItemId))); setStockMenuOpen(false); }}
                                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >Select All</button>
                              </div>
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500">Item</th>
                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500">Category</th>
                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500">Stock</th>
                        <th className="hidden px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 md:table-cell">
                          <span className="inline-flex items-center gap-1">Threshold
                            <span className="relative group">
                              <Info size={12} className="text-gray-400 cursor-help" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 px-2 py-1.5 text-[10px] font-normal normal-case tracking-normal bg-gray-900 text-white rounded-lg shadow-lg z-50 text-center whitespace-normal">When stock falls to or below this number, the item is flagged as low stock.</span>
                            </span>
                          </span>
                        </th>
                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500">Status</th>
                        <th className="hidden px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 sm:table-cell">Last Restocked</th>
                        <th className="px-3 py-2 text-center text-[10px] font-black uppercase tracking-wider text-gray-500">Track Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {paginatedStock.map(item => {
                        const status = !item.stockEnabled ? 'disabled' : item.currentStock === 0 ? 'out' : item.currentStock <= item.lowStockThreshold ? 'low' : 'ok';
                        const ingredient = ingredientItems.find(i => i.id === item.menuItemId);
                        const stockUnit = ingredient ? getIngredientStockUnit(ingredient) : item.unit;
                        const purchaseUnit = ingredient ? getIngredientPurchaseUnit(ingredient) : item.unit;
                        const purchaseRatio = ingredient ? getIngredientPurchaseRatio(ingredient) : 1;
                        const purchaseBalance = purchaseRatio > 0 ? item.currentStock / purchaseRatio : 0;
                        const showPurchaseBalance = Boolean(ingredient && purchaseUnit !== stockUnit && purchaseRatio !== 1);
                        return (
                          <tr key={item.menuItemId} className={`transition-colors ${!item.stockEnabled ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-4">
                              {stockSelectionMode ? (
                                <input type="checkbox" checked={selectedStockIds.has(item.menuItemId)} onChange={() => handleSelectStockItem(item.menuItemId)} className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                              ) : (
                                <span className="w-4 h-4" />
                              )}
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
                                <div className="min-w-[92px] text-center">
                                  <span className={`block text-sm font-black ${
                                    status === 'out' ? 'text-red-600 dark:text-red-400' : status === 'low' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'
                                  }`}>{formatStockNumber(item.currentStock)} {getUnitLabel(stockUnit)}</span>
                                  {showPurchaseBalance && (
                                    <span className="block text-[10px] font-semibold text-gray-400">{formatStockNumber(purchaseBalance)} {getUnitLabel(purchaseUnit)}</span>
                                  )}
                                </div>
                                <button onClick={() => handleSetStock(item.menuItemId, item.currentStock + 1)} className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center"><Plus size={12} /></button>
                              </div>
                              ) : <span className="text-xs text-gray-400">-</span>}
                            </td>
                            <td className="hidden px-3 py-4 md:table-cell">
                              {item.stockEnabled ? (
                              <input
                                type="number"
                                value={item.lowStockThreshold}
                                onChange={e => handleUpdateStockThreshold(item.menuItemId, parseInt(e.target.value) || 0)}
                                className="w-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                              ) : <span className="text-xs text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-4">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                status === 'disabled' ? 'bg-gray-500/20 text-gray-400' :
                                status === 'out' ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                                status === 'low' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                                'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                              }`}>
                                {status === 'disabled' ? 'Disabled' : status === 'out' ? 'Out of Stock' : status === 'low' ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                            <td className="hidden px-3 py-4 text-xs text-gray-500 dark:text-gray-400 sm:table-cell">
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
                  {stockSubTab === 'menu' && <Package size={40} className="mb-3 opacity-30" />}
                  <p className="text-sm font-bold">No {stockSubTab === 'ingredients' ? 'ingredient' : 'menu'} stock items</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {stockFilter !== 'all'
                      ? 'Try changing the filter'
                      : stockSubTab === 'ingredients'
                        ? 'Add ingredients or supplies to manage their stock here'
                        : 'Add menu items to track stock'}
                  </p>
                </div>
              )}
            </div>
            </div>

            {/* Stock Pagination */}
            {stockTotalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
                <button onClick={() => setStockCurrentPage(1)} disabled={stockCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronFirst size={16} />
                </button>
                <button onClick={() => setStockCurrentPage(p => Math.max(1, p - 1))} disabled={stockCurrentPage === 1} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: stockTotalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setStockCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${stockCurrentPage === page ? 'bg-amber-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                      {page}
                    </button>
                  ))}
                </div>
                <button onClick={() => setStockCurrentPage(p => Math.min(stockTotalPages, p + 1))} disabled={stockCurrentPage === stockTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setStockCurrentPage(stockTotalPages)} disabled={stockCurrentPage === stockTotalPages} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">
                  <ChevronLast size={16} />
                </button>
              </div>
            )}
            </>
            )}
            </div>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* STAFF MANAGEMENT TAB                */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <React.Suspense fallback={(
          <div className="flex min-h-[240px] items-center justify-center gap-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
            <Loader2 className="animate-spin text-amber-500" size={20} />
            Loading section...
          </div>
        )}>
        {activeTab === 'STAFF' && (
          <StaffManagementView restaurant={restaurant} currencySymbol={currencySymbol} initialSubTab={staffSubTab as any} onSubTabChange={setStaffSubTab} />
        )}
        {activeTab === 'INVENTORY' && (
          <InventoryManagement
            restaurant={restaurant}
            currencySymbol={currencySymbol}
            initialSubTab={inventorySubTab as any}
            onNavigateToItemsStock={() => {
              setItemSubTab('ingredients');
              setActiveTab('ITEMS');
            }}
          />
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* REPORTS TAB                         */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'REPORTS' && (
          <ReportsView
            orders={orders}
            restaurantId={restaurant.id}
            onFetchOrders={onFetchAllFilteredOrders}
            currencySymbol={currencySymbol}
            taxes={restaurant.settings?.taxes}
            initialSubTab={reportSubTab as any}
          />
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* CONTACTS TAB                        */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'CONTACTS' && (
          <ContactsManagement restaurant={restaurant} currencySymbol={currencySymbol} initialSubTab={contactSubTab as any} />
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* EXPENSES TAB                        */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'EXPENSES' && (
          <ExpensesView
            restaurant={restaurant}
            orders={orders}
            currencySymbol={currencySymbol}
            initialSubTab={expensesSubTab}
            subscription={subscription}
            onNavigateToInventory={(sub) => {
              setInventorySubTab(sub);
              setActiveTab('INVENTORY');
              setExpandedMenus(new Set(['INVENTORY']));
            }}
          />
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* FINANCE TAB                         */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'FINANCE' && (
          <FinanceView restaurant={restaurant} orders={orders} currencySymbol={currencySymbol} initialSubTab={financeSubTab} subscription={subscription} />
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* CASHIER SHIFTS TAB                  */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activeTab === 'SHIFTS' && (
          <CashierShiftRecords
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            currencySymbol={currencySymbol}
            orders={orders}
          />
        )}
        </React.Suspense>
      </div>

      </div>
      </div>
    </div>
  );
};

export default BackOfficePage;

