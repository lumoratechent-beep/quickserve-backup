import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, CheckCircle, ChefHat, ChevronLeft, ChevronRight, Clock, Coffee, Loader2, LogOut, Mail, Maximize2, MessageSquare, Minimize2, Moon, MoreHorizontal, Printer, RefreshCw, Settings, ShoppingBag, Sun, Trash2, X } from 'lucide-react';
import { CartItem, KitchenDepartment, Order, OrderStatus, Restaurant, Subscription } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from '../components/Toast';
import CancellationReasonQuickSelect from '../components/CancellationReasonQuickSelect';
import PrinterSettings from '../components/PrinterSettings';
import printerService, { DEFAULT_KITCHEN_TICKET_CONFIG, DEFAULT_ORDER_LIST_CONFIG, KitchenTicketConfig, OrderListConfig, ReceiptPrintOptions, SavedPrinter } from '../services/printerService';
import { saveSettingsToDb } from '../lib/sharedSettings';
import { fetchKdsUserPreferences, saveKdsUserPreference, KDS_USER_PREFERENCE_DEFAULTS, type KdsAlertSound, type KdsTicketFontSize, type KdsUserPreferences } from '../lib/kdsUserPreferences';
import { getKdsPreparationDetails } from '../lib/kdsItemDetails';
import {
  areAllKdsItemsCooked,
  areAllKdsItemsServed,
  cancelKdsItem,
  findCurrentKdsItemIndex,
  getAggregateKdsOrderStatus,
  getCurrentKdsTicketItems,
  getKdsItemStatus,
  markKdsScopeServed,
} from '../lib/kdsOrderState';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  userKitchenCategories?: string[];
  kitchenUserName?: string;
  kitchenUserId?: string;
  isOnline?: boolean;
  lastSyncTime?: Date;
  subscription?: Subscription | null;
  onUpdateOrder: (orderId: string, status: OrderStatus) => void | Promise<void>;
  onUpdateOrderItems?: (orderId: string, items: CartItem[], total: number, remark?: string, updateNote?: string, status?: OrderStatus) => void;
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
  announcements?: AnnouncementRecord[];
  announcementsLoading?: boolean;
  unreadMailCount?: number;
  onRefreshMail?: () => void | Promise<void>;
  onMarkAnnouncementRead?: (id: string) => void;
  onMarkAllAnnouncementsRead?: () => void;
  onClearAnnouncements?: () => void;
  onDeleteAnnouncement?: (id: string) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  category: string;
  created_at: string;
  is_read: boolean;
}

const normalizeKitchenDepartments = (raw: any): KitchenDepartment[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { name, categories: [] } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const name = String(entry.name || '').trim();
      if (!name) return null;
      const categories = Array.isArray(entry.categories)
        ? entry.categories.map((category: any) => String(category || '').trim()).filter(Boolean)
        : [];
      return { name, categories };
    })
    .filter(Boolean) as KitchenDepartment[];
};

const getKitchenCategoryKey = (value: any): string => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const getItemKitchenStatus = getKdsItemStatus;
const getAggregateStatusFromItems = getAggregateKdsOrderStatus;
const areAllKitchenItemsCooked = areAllKdsItemsCooked;

const getKitchenStatusText = (status: OrderStatus) => {
  if (status === OrderStatus.PENDING) return 'Pending';
  if (status === OrderStatus.ONGOING) return 'Ongoing';
  if (status === OrderStatus.PREPARING) return 'Cooking';
  if (status === OrderStatus.SERVED) return 'Served';
  if (status === OrderStatus.COMPLETED) return 'Cooked';
  return 'Cancelled';
};

const getNextKitchenItemStatus = (status: OrderStatus): OrderStatus | null => {
  if (status === OrderStatus.PENDING || status === OrderStatus.ONGOING) return OrderStatus.PREPARING;
  if (status === OrderStatus.PREPARING) return OrderStatus.COMPLETED;
  return null;
};

const getKitchenStatusClass = (status: OrderStatus) => {
  if (status === OrderStatus.PENDING) return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800/60';
  if (status === OrderStatus.ONGOING) return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800/60';
  if (status === OrderStatus.PREPARING) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/60';
  if (status === OrderStatus.SERVED) return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/60';
  if (status === OrderStatus.COMPLETED) return 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700';
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/60';
};

const DEFAULT_KDS_CANCELLATION_REASONS = [
  'Sold Out',
  'Ingredient Unavailable',
  'Unable to Prepare',
  'Kitchen Issue',
  'Customer Request',
  'Other',
] as const;

const KDS_ALERT_SOUNDS: Array<{ id: KdsAlertSound; label: string }> = [
  { id: 'CLASSIC', label: 'Classic' },
  { id: 'DOUBLE_BEEP', label: 'Double beep' },
  { id: 'URGENT_BEEP', label: 'Urgent beep' },
  { id: 'KDS_CHIME', label: 'KDS chime' },
  { id: 'SIREN', label: 'Siren' },
  { id: 'LONG_BEEP', label: 'Long loud beep' },
];

const isKdsAlertSound = (value: string | null): value is KdsAlertSound => (
  value === 'CLASSIC'
  || value === 'DOUBLE_BEEP'
  || value === 'URGENT_BEEP'
  || value === 'KDS_CHIME'
  || value === 'SIREN'
  || value === 'LONG_BEEP'
);

const KitchenDisplayPage: React.FC<Props> = ({
  restaurant,
  orders,
  userKitchenCategories,
  kitchenUserName,
  kitchenUserId,
  isOnline = true,
  lastSyncTime,
  subscription,
  onUpdateOrder,
  onUpdateOrderItems,
  onLogout,
  networkMeta,
  batteryMeta,
  batteryCharging = false,
  announcements = [],
  announcementsLoading = false,
  unreadMailCount = 0,
  onRefreshMail,
  onMarkAnnouncementRead,
  onMarkAllAnnouncementsRead,
  onClearAnnouncements,
  onDeleteAnnouncement,
  isDarkMode = false,
  onToggleTheme,
}) => {
  const [kitchenOrderFilter, setKitchenOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'COOKED' | 'ALL'>('ONGOING_ALL');
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [kitchenAlertLabel, setKitchenAlertLabel] = useState('New order!');
  const [printerConnected, setPrinterConnected] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printingKitchenOrderId, setPrintingKitchenOrderId] = useState<string | null>(null);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const [showMailPanel, setShowMailPanel] = useState(false);
  const [openItemMenuKey, setOpenItemMenuKey] = useState<string | null>(null);
  const [cancelItemTarget, setCancelItemTarget] = useState<{ order: Order; item: CartItem; itemKey: string } | null>(null);
  const [cancelReason, setCancelReason] = useState<string | undefined>();
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [isCancellingItem, setIsCancellingItem] = useState(false);
  const [updatingItemKeys, setUpdatingItemKeys] = useState<Set<string>>(new Set());
  const [currentKitchenPage, setCurrentKitchenPage] = useState(1);
  const [pageSlideDirection, setPageSlideDirection] = useState<'NEXT' | 'PREVIOUS'>('NEXT');
  const [ticketColumns, setTicketColumns] = useState<3 | 4 | 5>(() => {
    const saved = Number(localStorage.getItem(`kds_tickets_per_page_${restaurant.id}`));
    return saved === 3 || saved === 5 ? saved : 4;
  });
  const [ticketFontSize, setTicketFontSize] = useState<KdsTicketFontSize>(() => {
    const saved = localStorage.getItem(`kds_font_size_${restaurant.id}`);
    return saved === 'SMALL' || saved === 'MEDIUM' || saved === 'LARGE' || saved === 'EXTRA_LARGE' ? saved : KDS_USER_PREFERENCE_DEFAULTS.fontSize;
  });
  const [alertSound, setAlertSound] = useState<KdsAlertSound>(() => {
    const saved = localStorage.getItem(`kds_alert_sound_${restaurant.id}`);
    return isKdsAlertSound(saved) ? saved : KDS_USER_PREFERENCE_DEFAULTS.alertSound;
  });
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [serveOrderId, setServeOrderId] = useState<string | null>(null);
  const [isServingOrder, setIsServingOrder] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [displaySettingsSection, setDisplaySettingsSection] = useState<'APPEARANCE' | 'WORKFLOW' | 'PRINTER' | 'VERSION'>('APPEARANCE');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth);
  const kitchenPreviousPendingIds = useRef<Set<string> | null>(null);
  const kitchenPreviousUpdateMarkers = useRef<Map<string, number> | null>(null);
  const autoPrintSeenOrderIds = useRef<Set<string> | null>(null);
  const autoPrintEligibleOrderIds = useRef<Set<string>>(new Set());
  const autoPrintInFlightOrderIds = useRef<Set<string>>(new Set());
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const kdsPreferencesRequestRef = useRef(0);

  const kitchenEnabled = subscription?.plan_id === 'pro_plus' && restaurant.kitchenEnabled === true;
  const kitchenDivisions = useMemo(() => normalizeKitchenDepartments(restaurant.kitchenDivisions), [restaurant.kitchenDivisions]);
  const kitchenAssignedScopes = useMemo(() => (
    Array.isArray(userKitchenCategories)
      ? userKitchenCategories.map(value => String(value || '').trim()).filter(Boolean)
      : []
  ), [userKitchenCategories]);
  const kitchenHasAssignedScope = kitchenAssignedScopes.length > 0;

  const kitchenScopeCategories = useMemo(() => {
    if (kitchenAssignedScopes.length === 0) return [];
    const departmentMap = new Map(kitchenDivisions.map(dep => [getKitchenCategoryKey(dep.name), dep.categories]));
    const scoped = new Set<string>();

    kitchenAssignedScopes.forEach(value => {
      const mappedCategories = departmentMap.get(getKitchenCategoryKey(value));
      if (mappedCategories) {
        mappedCategories.forEach(category => scoped.add(category));
      } else {
        scoped.add(value);
      }
    });

    return Array.from(scoped).sort((a, b) => a.localeCompare(b));
  }, [kitchenAssignedScopes, kitchenDivisions]);

  const kitchenScopeCategoryKeys = useMemo(() => (
    kitchenScopeCategories.map(getKitchenCategoryKey).filter(Boolean)
  ), [kitchenScopeCategories]);

  const visibleTicketColumns = viewportWidth < 640
    ? 1
    : viewportWidth < 900
      ? Math.min(2, ticketColumns)
      : viewportWidth < 1180
        ? Math.min(3, ticketColumns)
        : ticketColumns;

  const [savedPrinters, setSavedPrinters] = useState<SavedPrinter[]>(() => {
    const databasePrinters = restaurant.settings?.printers;
    if (Array.isArray(databasePrinters) && databasePrinters.length > 0) {
      return databasePrinters as SavedPrinter[];
    }
    try {
      const localPrinters = localStorage.getItem(`printers_${restaurant.id}`);
      return localPrinters ? JSON.parse(localPrinters) as SavedPrinter[] : [];
    } catch {
      return [];
    }
  });

  const [kitchenTicketConfig, setKitchenTicketConfig] = useState<KitchenTicketConfig>(() => {
    const databaseConfig = restaurant.settings?.kitchenTicket;
    if (databaseConfig && typeof databaseConfig === 'object') {
      return { ...DEFAULT_KITCHEN_TICKET_CONFIG, ...databaseConfig } as KitchenTicketConfig;
    }
    try {
      const localConfig = localStorage.getItem(`kitchen_config_${restaurant.id}`);
      return localConfig
        ? { ...DEFAULT_KITCHEN_TICKET_CONFIG, ...JSON.parse(localConfig) }
        : { ...DEFAULT_KITCHEN_TICKET_CONFIG };
    } catch {
      return { ...DEFAULT_KITCHEN_TICKET_CONFIG };
    }
  });
  const [autoServeCookedOrders, setAutoServeCookedOrders] = useState<boolean>(() => {
    const databaseValue = restaurant.settings?.kitchenSettings?.autoServe;
    if (typeof databaseValue === 'boolean') return databaseValue;
    try {
      return localStorage.getItem(`kds_auto_serve_${restaurant.id}`) === 'true';
    } catch {
      return false;
    }
  });

  const orderListConfig = useMemo<OrderListConfig>(() => {
    const databaseConfig = restaurant.settings?.orderList;
    const legacyAddress = typeof databaseConfig?.businessAddress === 'string' ? databaseConfig.businessAddress : '';
    return {
      ...DEFAULT_ORDER_LIST_CONFIG,
      businessName: restaurant.name,
      ...(databaseConfig || {}),
      businessAddressLine1: databaseConfig?.businessAddressLine1 || legacyAddress || '',
      businessAddressLine2: databaseConfig?.businessAddressLine2 || '',
    } as OrderListConfig;
  }, [restaurant.name, restaurant.settings?.orderList]);

  const [selectedPrinterId, setSelectedPrinterId] = useState(() => (
    localStorage.getItem(`kds_selected_printer_${restaurant.id}`) || ''
  ));
  const [printedOrderIds, setPrintedOrderIds] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`kds_printed_orders_${restaurant.id}`) || '[]');
      return new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch {
      return new Set();
    }
  });

  const activeKitchenPrinter = useMemo(() => {
    const selected = savedPrinters.find(printer => printer.id === selectedPrinterId);
    if (selected) return selected;
    const kitchenPrinters = savedPrinters.filter(printer => printer.printJobs?.includes('kitchen'));
    if (kitchenPrinters.length === 0) return savedPrinters[0] || null;
    if (!kitchenHasAssignedScope) return kitchenPrinters[0];

    return kitchenPrinters.find(printer => {
      const departmentMatch = printer.departmentId
        && kitchenAssignedScopes.some(scope => getKitchenCategoryKey(scope) === getKitchenCategoryKey(printer.departmentId));
      const categoryMatch = printer.kitchenCategories?.some(category =>
        kitchenScopeCategoryKeys.includes(getKitchenCategoryKey(category))
      );
      return Boolean(departmentMatch || categoryMatch);
    }) || kitchenPrinters[0];
  }, [savedPrinters, selectedPrinterId, kitchenHasAssignedScope, kitchenAssignedScopes, kitchenScopeCategoryKeys]);

  const isKitchenItemInActionScope = (item: CartItem): boolean => {
    if (!kitchenHasAssignedScope) return true;
    if (kitchenScopeCategoryKeys.length === 0) return false;
    return kitchenScopeCategoryKeys.includes(getKitchenCategoryKey(item.category));
  };

  const getSortedOrderItems = (order: Order, scopedCategories: string[] = []) => {
    const scopedCategoryKeys = scopedCategories.map(getKitchenCategoryKey).filter(Boolean);
    return getCurrentKdsTicketItems(order.items)
      .filter(item => scopedCategoryKeys.length === 0 || scopedCategoryKeys.includes(getKitchenCategoryKey(item.category)))
      .sort((a, b) => {
        const byCategory = (a.category || '').localeCompare(b.category || '');
        if (byCategory !== 0) return byCategory;
        return (a.name || '').localeCompare(b.name || '');
      });
  };

  const kitchenFilteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (!kitchenHasAssignedScope) return true;
      if (kitchenScopeCategoryKeys.length === 0) return false;
      return order.items.some(item => kitchenScopeCategoryKeys.includes(getKitchenCategoryKey(item.category)));
    });
  }, [orders, kitchenHasAssignedScope, kitchenScopeCategoryKeys]);

  const kitchenVisibleOrders = useMemo(() => {
    const latestFirst = kitchenOrderFilter === OrderStatus.SERVED || kitchenOrderFilter === OrderStatus.CANCELLED;
    return kitchenFilteredOrders.filter(order => {
      const scopedItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
      const isActiveOrder = order.status === OrderStatus.PENDING
        || order.status === OrderStatus.ONGOING
        || order.status === OrderStatus.PREPARING;
      if (scopedItems.length === 0) return false;
      if (kitchenOrderFilter === 'ALL') return true;
      if (kitchenOrderFilter === 'ONGOING_ALL') {
        return isActiveOrder && !areAllKitchenItemsCooked(scopedItems, order.status);
      }
      if (autoServeCookedOrders && kitchenOrderFilter === 'COOKED') return false;
      if (kitchenOrderFilter === 'COOKED') return isActiveOrder && areAllKitchenItemsCooked(scopedItems, order.status);
      if (kitchenOrderFilter === OrderStatus.SERVED) return areAllKdsItemsServed(scopedItems, order.status);
      return scopedItems.some(item => getItemKitchenStatus(item, order.status) === kitchenOrderFilter);
    }).sort((a, b) => latestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
  }, [kitchenFilteredOrders, kitchenOrderFilter, kitchenHasAssignedScope, kitchenScopeCategories, autoServeCookedOrders]);

  const kitchenPageCount = Math.max(1, Math.ceil(kitchenVisibleOrders.length / visibleTicketColumns));
  const pagedKitchenOrders = kitchenVisibleOrders.slice(
    (currentKitchenPage - 1) * visibleTicketColumns,
    currentKitchenPage * visibleTicketColumns,
  );
  const serveOrderCandidate = serveOrderId ? orders.find(order => order.id === serveOrderId) || null : null;
  const serveOrderItems = serveOrderCandidate
    ? getSortedOrderItems(serveOrderCandidate, kitchenHasAssignedScope ? kitchenScopeCategories : [])
    : [];
  const serveOrder = serveOrderCandidate
    && !areAllKdsItemsServed(serveOrderItems, serveOrderCandidate.status)
    && areAllKitchenItemsCooked(serveOrderItems, serveOrderCandidate.status)
      ? serveOrderCandidate
      : null;
  const ticketGridClass = visibleTicketColumns === 1
    ? 'grid-cols-1'
    : visibleTicketColumns === 2
      ? 'grid-cols-2'
      : visibleTicketColumns === 3
        ? 'grid-cols-3'
        : visibleTicketColumns === 5
          ? 'grid-cols-5'
          : 'grid-cols-4';
  const ticketItemNameClass = ticketFontSize === 'SMALL'
    ? 'text-[10px] leading-4'
    : ticketFontSize === 'EXTRA_LARGE'
      ? 'text-base leading-6'
    : ticketFontSize === 'LARGE'
      ? 'text-sm leading-5'
      : 'text-xs leading-[18px]';
  const ticketItemDetailClass = ticketFontSize === 'SMALL' ? 'text-[8px]' : ticketFontSize === 'EXTRA_LARGE' ? 'text-sm' : ticketFontSize === 'LARGE' ? 'text-xs' : 'text-[10px]';
  const ticketTitleClass = ticketFontSize === 'SMALL' ? 'text-base' : ticketFontSize === 'EXTRA_LARGE' ? 'text-2xl' : ticketFontSize === 'LARGE' ? 'text-xl' : 'text-lg';
  const ticketMetaClass = ticketFontSize === 'SMALL' ? 'text-[9px]' : ticketFontSize === 'EXTRA_LARGE' ? 'text-sm' : ticketFontSize === 'LARGE' ? 'text-xs' : 'text-[10px]';

  const formatDuration = (durationMs: number) => {
    const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
  };

  const formatCookingStopwatch = (order: Order, items: CartItem[]) => {
    const startedAtValues = items
      .map(item => Number(item.kitchenStartedAt || 0))
      .filter(value => value > 0);
    if (startedAtValues.length === 0) return '00:00:00';

    const startedAt = Math.min(...startedAtValues);
    const activeItems = items.filter(item => getItemKitchenStatus(item, order.status) !== OrderStatus.CANCELLED);
    const allCooked = areAllKitchenItemsCooked(activeItems, order.status);
    const cookedAtValues = activeItems
      .map(item => Number(item.kitchenCookedAt || 0))
      .filter(value => value > 0);
    const stoppedAt = allCooked && cookedAtValues.length > 0 ? Math.max(...cookedAtValues) : clockNow;
    return formatDuration(stoppedAt - startedAt);
  };

  const kitchenPendingOrders = useMemo(() => (
    kitchenFilteredOrders.filter(order => order.status === OrderStatus.PENDING)
  ), [kitchenFilteredOrders]);

  const groupItemsByCategory = (items: CartItem[]) => {
    return items.reduce<Record<string, CartItem[]>>((acc, item) => {
      const category = item.category || 'Uncategorized';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});
  };

  const playKdsAlertSound = (sound: KdsAlertSound) => {
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtor();
      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.95, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);

      const playTone = (start: number, duration: number, frequency: number, type: OscillatorType = 'square') => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGain);
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.9, start + 0.02);
        gain.gain.setValueAtTime(0.9, start + Math.max(0.02, duration - 0.04));
        gain.gain.linearRampToValueAtTime(0, start + duration);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      };

      const now = audioCtx.currentTime;
      if (sound === 'DOUBLE_BEEP') {
        playTone(now, 0.25, 950);
        playTone(now + 0.38, 0.25, 950);
      } else if (sound === 'URGENT_BEEP') {
        [0, 0.22, 0.44, 0.66].forEach(offset => playTone(now + offset, 0.14, 1100));
      } else if (sound === 'KDS_CHIME') {
        [0, 0.48, 0.96].forEach(offset => {
          playTone(now + offset, 0.16, 1320, 'triangle');
          playTone(now + offset + 0.17, 0.18, 980, 'triangle');
        });
      } else if (sound === 'SIREN') {
        [0, 0.28, 0.56].forEach(offset => {
          playTone(now + offset, 0.24, 760, 'sawtooth');
          playTone(now + offset + 0.12, 0.24, 1280, 'sawtooth');
        });
      } else if (sound === 'LONG_BEEP') {
        playTone(now, 1.1, 1000);
      } else {
        playTone(now, 0.8, 880, 'sine');
      }

      window.setTimeout(() => {
        void audioCtx.close().catch(() => undefined);
      }, 1600);
    } catch {
      console.warn('Audio Context failed');
    }
  };

  const selectAlertSound = (sound: KdsAlertSound) => {
    setAlertSound(sound);
    localStorage.setItem(`kds_alert_sound_${restaurant.id}`, sound);
    void saveKdsUserPreference(kitchenUserId || '', 'alertSound', sound);
    playKdsAlertSound(sound);
  };

  const triggerNewOrderAlert = (label = 'New order!') => {
    playKdsAlertSound(alertSound);
    setKitchenAlertLabel(label);
    setShowNewOrderAlert(true);
    window.setTimeout(() => setShowNewOrderAlert(false), 5000);
  };

  const configureNetworkPrinter = (printer: SavedPrinter): boolean => {
    if (printer.connectionType !== 'wifi' || !printer.printServerUrl?.trim() || !printer.ipAddress?.trim()) {
      // A saved WiFi profile elsewhere in the restaurant must not override the
      // USB/Bluetooth/SUNMI printer explicitly selected on this KDS device.
      printerService.clearActiveNetworkPrinter(true);
      return false;
    }
    printerService.setActiveNetworkPrinter({
      printServerUrl: printer.printServerUrl,
      printerIp: printer.ipAddress,
      printerPort: printer.printerPort || 9100,
    });
    return true;
  };

  const getOrderListPrintOptions = (printer: SavedPrinter, cashierName = ''): ReceiptPrintOptions => ({
    documentType: 'order-list',
    showDateTime: orderListConfig.showDateTime,
    showOrderId: orderListConfig.showOrderNumber,
    showTableNumber: orderListConfig.showTableNumber,
    showDiningOption: orderListConfig.showDiningOption,
    showItems: orderListConfig.showItems,
    includeCancelledItems: true,
    showItemPrice: orderListConfig.showItemPrice,
    showRemark: orderListConfig.showRemark,
    showTotal: orderListConfig.showTotal,
    showPaymentMethod: orderListConfig.showPaymentMethod,
    headerText: orderListConfig.headerText,
    footerText: orderListConfig.footerText,
    businessAddressLine1: orderListConfig.businessAddressLine1,
    businessAddressLine2: orderListConfig.businessAddressLine2,
    businessCity: orderListConfig.businessCity,
    businessState: orderListConfig.businessState,
    businessCountry: orderListConfig.businessCountry,
    businessPhone: orderListConfig.businessPhone,
    autoOpenDrawer: false,
    paperSize: printer.paperSize || '58mm',
    printDensity: printer.printDensity || 'medium',
    autoCut: printer.autoCut ?? true,
    showOrderSource: orderListConfig.showOrderSource,
    showCashierName: orderListConfig.showCashierName,
    cashierName,
    showAmountReceived: false,
    showChange: false,
    showTaxes: false,
    documentSize: orderListConfig.documentSize,
    documentFont: orderListConfig.documentFont,
    documentAlignment: orderListConfig.documentAlignment,
    titleSize: orderListConfig.titleSize,
    titleFont: orderListConfig.titleFont,
    titleAlignment: orderListConfig.titleAlignment,
    headerSize: orderListConfig.headerSize,
    headerFont: orderListConfig.headerFont,
    headerAlignment: orderListConfig.headerAlignment,
    footerSize: orderListConfig.footerSize,
    footerFont: orderListConfig.footerFont,
    footerAlignment: orderListConfig.footerAlignment,
    paymentStatusSize: orderListConfig.paymentStatusSize,
    paymentStatusFont: orderListConfig.paymentStatusFont,
    paymentStatusAlignment: orderListConfig.paymentStatusAlignment,
    itemSize: orderListConfig.itemSize,
  });

  const getLatestCachedSettings = (): Record<string, any> => {
    try {
      const cached = localStorage.getItem(`qs_settings_${restaurant.id}`);
      return cached ? JSON.parse(cached) : (restaurant.settings || {});
    } catch {
      return restaurant.settings || {};
    }
  };

  const saveKdsPreference = <K extends keyof KdsUserPreferences>(
    key: K,
    value: KdsUserPreferences[K],
    localStorageKey: string,
  ) => {
    localStorage.setItem(localStorageKey, String(value));
    void saveKdsUserPreference(kitchenUserId || '', key, value);
  };

  const refreshKdsUserPreferences = () => {
    if (!kitchenUserId) return;
    const requestId = ++kdsPreferencesRequestRef.current;
    void fetchKdsUserPreferences(kitchenUserId).then(preferences => {
      if (!preferences || requestId !== kdsPreferencesRequestRef.current) return;
      const nextTicketsPerPage = preferences.ticketsPerPage === 3 || preferences.ticketsPerPage === 4 || preferences.ticketsPerPage === 5
        ? preferences.ticketsPerPage
        : KDS_USER_PREFERENCE_DEFAULTS.ticketsPerPage;
      const nextFontSize = preferences.fontSize === 'SMALL' || preferences.fontSize === 'MEDIUM' || preferences.fontSize === 'LARGE' || preferences.fontSize === 'EXTRA_LARGE'
        ? preferences.fontSize
        : KDS_USER_PREFERENCE_DEFAULTS.fontSize;
      const nextAlertSound = preferences.alertSound && isKdsAlertSound(preferences.alertSound)
        ? preferences.alertSound
        : KDS_USER_PREFERENCE_DEFAULTS.alertSound;
      const nextAutoServe = typeof preferences.autoServe === 'boolean'
        ? preferences.autoServe
        : KDS_USER_PREFERENCE_DEFAULTS.autoServe;
      const nextSelectedPrinterId = typeof preferences.selectedPrinterId === 'string'
        ? preferences.selectedPrinterId
        : KDS_USER_PREFERENCE_DEFAULTS.selectedPrinterId;

      setTicketColumns(nextTicketsPerPage);
      setTicketFontSize(nextFontSize);
      setAlertSound(nextAlertSound);
      setAutoServeCookedOrders(nextAutoServe);
      setSelectedPrinterId(nextSelectedPrinterId);
      localStorage.setItem(`kds_tickets_per_page_${restaurant.id}`, String(nextTicketsPerPage));
      localStorage.setItem(`kds_font_size_${restaurant.id}`, nextFontSize);
      localStorage.setItem(`kds_alert_sound_${restaurant.id}`, nextAlertSound);
      localStorage.setItem(`kds_auto_serve_${restaurant.id}`, String(nextAutoServe));
      if (nextSelectedPrinterId) localStorage.setItem(`kds_selected_printer_${restaurant.id}`, nextSelectedPrinterId);
      else localStorage.removeItem(`kds_selected_printer_${restaurant.id}`);
    });
  };

  const markOrderListPrinted = (orderId: string) => {
    autoPrintEligibleOrderIds.current.delete(orderId);
    setPrintedOrderIds(previous => {
      const next = new Set(previous);
      next.add(orderId);
      const recentIds = Array.from(next).slice(-500);
      localStorage.setItem(`kds_printed_orders_${restaurant.id}`, JSON.stringify(recentIds));
      return new Set(recentIds);
    });
  };

  const handleKdsPrintersChange = (printers: SavedPrinter[]) => {
    setSavedPrinters(printers);
    localStorage.setItem(`printers_${restaurant.id}`, JSON.stringify(printers));
    if (selectedPrinterId && !printers.some(printer => printer.id === selectedPrinterId)) {
      setSelectedPrinterId('');
      localStorage.removeItem(`kds_selected_printer_${restaurant.id}`);
    }
    void saveSettingsToDb(restaurant.id, getLatestCachedSettings(), 'printers', printers).then(saved => {
      if (!saved) toast('Printer setup was saved on this device only.', 'warning');
    });
  };

  const selectKdsPrinter = async (printerId: string) => {
    // A printer service owns one active transport. Tear down the previous
    // destination first so selecting another profile cannot print to it.
    printerService.clearActiveNetworkPrinter(true);
    await printerService.disconnect();
    setPrinterConnected(false);
    setSelectedPrinterId(printerId);
    if (printerId) localStorage.setItem(`kds_selected_printer_${restaurant.id}`, printerId);
    else localStorage.removeItem(`kds_selected_printer_${restaurant.id}`);
    saveKdsPreference('selectedPrinterId', printerId, `kds_selected_printer_${restaurant.id}`);
  };

  const setAutoPrintNewOrders = (enabled: boolean) => {
    const next = { ...kitchenTicketConfig, autoPrintOnNewOrder: enabled };
    setKitchenTicketConfig(next);
    localStorage.setItem(`kitchen_config_${restaurant.id}`, JSON.stringify(next));
    void saveSettingsToDb(restaurant.id, getLatestCachedSettings(), 'kitchenTicket', next).then(saved => {
      toast(
        saved ? `Auto Print New Order ${enabled ? 'enabled' : 'disabled'}.` : 'Auto-print setting was saved on this device only.',
        saved ? 'success' : 'warning',
      );
    });
  };

  const setAutoServeCookedItems = (enabled: boolean) => {
    setAutoServeCookedOrders(enabled);
    saveKdsPreference('autoServe', enabled, `kds_auto_serve_${restaurant.id}`);
    toast(`Auto Serve ${enabled ? 'enabled' : 'disabled'}.`, 'success');
  };

  const refreshPrinterStatus = () => {
    const status = printerService.getConnectionStatus();
    if (!activeKitchenPrinter) {
      setPrinterConnected(false);
      return;
    }
    const matchesSelectedTransport = status.transport === activeKitchenPrinter.connectionType;
    const matchesSelectedDevice = activeKitchenPrinter.connectionType !== 'bluetooth'
      || !activeKitchenPrinter.deviceName
      || status.deviceName === activeKitchenPrinter.deviceName;
    setPrinterConnected(status.connected && matchesSelectedTransport && matchesSelectedDevice);
  };

  const connectKitchenPrinter = async () => {
    if (!activeKitchenPrinter) {
      toast('No printer is configured. Add one in Printer settings.', 'warning');
      return;
    }

    setIsConnectingPrinter(true);
    try {
      const currentTransport = printerService.getConnectionStatus().transport;
      if (activeKitchenPrinter.connectionType === 'wifi' && currentTransport !== 'wifi' && currentTransport !== 'none') {
        await printerService.disconnect();
      }
      if (configureNetworkPrinter(activeKitchenPrinter)) {
        refreshPrinterStatus();
        toast('Printer is ready.', 'success');
        return;
      }
      if (activeKitchenPrinter.connectionType === 'wifi') {
        toast('Complete the print server URL and printer IP in the selected printer setup.', 'warning');
        return;
      }

      let connected = false;
      let connectedDeviceName = activeKitchenPrinter.deviceName || '';
      if (activeKitchenPrinter.connectionType === 'sunmi') {
        connectedDeviceName = 'SUNMI Built-in Printer';
        connected = await printerService.connect(connectedDeviceName);
      } else if (activeKitchenPrinter.connectionType === 'usb') {
        const device = await printerService.connectUsbPrinter();
        connected = Boolean(device);
        connectedDeviceName = device?.name || '';
      } else if (connectedDeviceName) {
        const status = printerService.getConnectionStatus();
        if (status.transport === 'bluetooth' && status.deviceName !== connectedDeviceName) {
          await printerService.disconnect();
          printerService.clearActiveNetworkPrinter(true);
        }
        connected = await printerService.autoReconnect(connectedDeviceName)
          || await printerService.connect(connectedDeviceName);
      } else {
        const devices = await printerService.scanForPrinters();
        const device = devices[0];
        if (device) {
          connectedDeviceName = device.name;
          connected = await printerService.connect(device.name);
        }
      }

      if (connected && connectedDeviceName) {
        localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify({
          id: activeKitchenPrinter.deviceId || connectedDeviceName,
          name: connectedDeviceName,
        }));
      }
      refreshPrinterStatus();
      toast(connected ? 'Printer connected.' : 'Unable to connect printer.', connected ? 'success' : 'error');
    } catch (error) {
      console.error('Kitchen printer connection error:', error);
      refreshPrinterStatus();
      toast('Unable to connect printer.', 'error');
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const printKitchenOrder = async (order: Order, notify = true) => {
    if (!activeKitchenPrinter) {
      if (notify) toast('No printer is configured. Add one in Printer settings.', 'warning');
      return false;
    }

    configureNetworkPrinter(activeKitchenPrinter);
    setPrintingKitchenOrderId(order.id);
    try {
      const { data: freshOrder, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order.id)
        .maybeSingle();

      if (error) console.warn('Using the latest KDS copy for printing because the order refresh failed:', error);
      const sourceOrder: any = freshOrder || order;

      const freshItems: CartItem[] = Array.isArray(sourceOrder.items)
        ? sourceOrder.items
        : typeof sourceOrder.items === 'string'
          ? JSON.parse(sourceOrder.items)
          : [];
      // Print the complete latest order revision for this station, including
      // served and cancelled audit rows, rather than only the active KDS batch.
      const scopedItems = freshItems.filter(item => item.kdsRouted !== false && isKitchenItemInActionScope(item));
      if (scopedItems.length === 0) return false;

      const printableOrder = {
        ...order,
        id: sourceOrder.id || order.id,
        tableNumber: sourceOrder.table_number ?? sourceOrder.tableNumber ?? order.tableNumber,
        diningType: sourceOrder.dining_type ?? sourceOrder.diningType ?? order.diningType,
        orderSource: sourceOrder.order_source ?? sourceOrder.orderSource ?? order.orderSource,
        paymentMethod: sourceOrder.payment_method ?? sourceOrder.paymentMethod ?? order.paymentMethod,
        cashierName: sourceOrder.cashier_name ?? sourceOrder.cashierName ?? order.cashierName,
        total: Number(sourceOrder.total ?? order.total ?? 0),
        timestamp: sourceOrder.timestamp || order.timestamp,
        items: scopedItems,
        remark: sourceOrder.remark || '',
      };
      const printRestaurant = {
        ...restaurant,
        name: orderListConfig.businessName.trim() || restaurant.name,
      };
      const printed = await printerService.printReceipt(
        printableOrder,
        printRestaurant,
        getOrderListPrintOptions(activeKitchenPrinter, printableOrder.cashierName || ''),
      );

      refreshPrinterStatus();
      if (printed) markOrderListPrinted(order.id);
      if (notify) toast(printed ? 'Order list printed.' : 'Order list failed to print.', printed ? 'success' : 'error');
      return printed;
    } catch (error) {
      console.error('KDS order list print error:', error);
      refreshPrinterStatus();
      if (notify) toast('Order list failed to print.', 'error');
      return false;
    } finally {
      setPrintingKitchenOrderId(null);
    }
  };

  const testKitchenPrinter = async () => {
    if (!activeKitchenPrinter) {
      toast('Select or add a printer first.', 'warning');
      return;
    }
    configureNetworkPrinter(activeKitchenPrinter);
    setIsTestingPrinter(true);
    try {
      const printed = await printerService.printTestPage(
        orderListConfig.businessName.trim() || restaurant.name,
        activeKitchenPrinter.paperSize || '58mm',
      );
      refreshPrinterStatus();
      toast(printed ? 'Test print sent.' : 'Test print failed.', printed ? 'success' : 'error');
    } catch (error) {
      console.error('KDS test print error:', error);
      refreshPrinterStatus();
      toast('Test print failed. Connect the selected printer first.', 'error');
    } finally {
      setIsTestingPrinter(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initializePrinter = async () => {
      if (!activeKitchenPrinter) {
        if (!cancelled) setPrinterConnected(false);
        return;
      }

      const currentTransport = printerService.getConnectionStatus().transport;
      if (activeKitchenPrinter.connectionType === 'wifi' && currentTransport !== 'wifi' && currentTransport !== 'none') {
        await printerService.disconnect();
      }
      if (configureNetworkPrinter(activeKitchenPrinter)) {
        if (!cancelled) refreshPrinterStatus();
        return;
      }

      let reconnectName = activeKitchenPrinter.deviceName || '';
      if (activeKitchenPrinter.connectionType === 'sunmi') reconnectName = 'SUNMI Built-in Printer';
      if (!reconnectName) {
        try {
          const savedDevice = localStorage.getItem(`printer_${restaurant.id}`);
          reconnectName = savedDevice ? String(JSON.parse(savedDevice)?.name || '') : '';
        } catch {
          reconnectName = '';
        }
      }

      if (reconnectName) await printerService.autoReconnect(reconnectName);
      if (!cancelled) refreshPrinterStatus();
    };

    void initializePrinter();
    const statusTimer = window.setInterval(refreshPrinterStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(statusTimer);
    };
  }, [activeKitchenPrinter, restaurant.id]);

  const syncKitchenItemsToSavedBill = async (orderItems: CartItem[]) => {
    const dispatchId = orderItems.find(item => item.savedBillId)?.savedBillId;
    if (!dispatchId) return;

    const { data: savedBillRows, error: fetchError } = await supabase
      .from('saved_bills')
      .select('id,items,updated_at')
      .eq('restaurant_id', restaurant.id);
    if (fetchError) {
      console.error('Failed to find linked saved bill for kitchen status sync:', fetchError);
      return;
    }

    const linkedBill = savedBillRows?.find((row: any) => {
      try {
        const items = Array.isArray(row.items) ? row.items : JSON.parse(row.items || '[]');
        return items.some((item: CartItem) => item.savedBillId === dispatchId);
      } catch {
        return false;
      }
    });
    if (!linkedBill) return;

    const kitchenItems = orderItems.filter(item => item.savedBillId === dispatchId);
    const kitchenById = new Map(kitchenItems.filter(item => item.kdsItemId).map(item => [item.kdsItemId!, item]));
    const kitchenByLineId = new Map(kitchenItems.filter(item => item.savedBillLineId).map(item => [item.savedBillLineId!, item]));
    let currentBill = linkedBill;

    // Saved bills are an editable POS mirror of the canonical order. Merge
    // only KDS state fields and retry if the POS edits the bill concurrently.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        const { data: refreshed, error } = await supabase
          .from('saved_bills')
          .select('id,items,updated_at')
          .eq('id', linkedBill.id)
          .eq('restaurant_id', restaurant.id)
          .maybeSingle();
        if (error || !refreshed) {
          console.error('Failed to refresh linked saved bill for kitchen status sync:', error);
          return;
        }
        currentBill = refreshed;
      }

      const savedItems: CartItem[] = Array.isArray(currentBill.items)
        ? currentBill.items
        : JSON.parse(currentBill.items || '[]');
      const syncedItems = savedItems.map((savedItem, index) => {
        const kitchenItem = (savedItem.kdsItemId ? kitchenById.get(savedItem.kdsItemId) : undefined)
          || (savedItem.savedBillLineId ? kitchenByLineId.get(savedItem.savedBillLineId) : undefined)
          || kitchenItems[index];
        if (!kitchenItem || kitchenItem.savedBillId !== dispatchId) return savedItem;
        return {
          ...savedItem,
          kdsItemId: kitchenItem.kdsItemId || savedItem.kdsItemId,
          kdsRouted: kitchenItem.kdsRouted,
          status: kitchenItem.status,
          kitchenStartedAt: kitchenItem.kitchenStartedAt,
          kitchenCookedAt: kitchenItem.kitchenCookedAt,
          kitchenCancelReason: kitchenItem.kitchenCancelReason,
          cancelledBy: kitchenItem.cancelledBy,
          cancelledAt: kitchenItem.cancelledAt,
          cancelSource: kitchenItem.cancelSource,
        };
      });
      const { data: confirmed, error: updateError } = await supabase
        .from('saved_bills')
        .update({ items: syncedItems, updated_at: new Date().toISOString() })
        .eq('id', currentBill.id)
        .eq('restaurant_id', restaurant.id)
        .eq('updated_at', currentBill.updated_at)
        .select('id')
        .maybeSingle();
      if (updateError) {
        console.error('Failed to sync kitchen item status to saved bill:', updateError);
        return;
      }
      if (confirmed) return;
    }
    console.error('Failed to sync kitchen item status to saved bill after concurrent POS edits.');
  };

  type KdsOrderMutationResult = { items: CartItem[]; total: number; status: OrderStatus };

  const persistKdsOrderMutation = async (
    orderId: string,
    mutate: (items: CartItem[], total: number, status: OrderStatus) => { items: CartItem[]; total?: number; status?: OrderStatus } | null,
  ): Promise<KdsOrderMutationResult> => {
    // Compare-and-swap on updated_at prevents two department screens from
    // replacing one another's JSON item changes. Conflicts refetch and retry.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data: current, error: fetchError } = await supabase
        .from('orders')
        .select('items,total,status,updated_at')
        .eq('id', orderId)
        .eq('restaurant_id', restaurant.id)
        .single();
      if (fetchError || !current) throw fetchError || new Error('Order not found');

      const currentItems: CartItem[] = Array.isArray(current.items)
        ? current.items
        : JSON.parse(current.items || '[]');
      const currentStatus = current.status as OrderStatus;
      const mutation = mutate(currentItems, Number(current.total || 0), currentStatus);
      if (!mutation) throw new Error('This order changed. Review its latest status and try again.');

      const aggregateStatus = mutation.status ?? getAggregateStatusFromItems(mutation.items, currentStatus);
      const nextTotal = mutation.total ?? Number(current.total || 0);
      const { data: confirmed, error: updateError } = await supabase
        .from('orders')
        .update({ items: mutation.items, status: aggregateStatus, total: nextTotal })
        .eq('id', orderId)
        .eq('restaurant_id', restaurant.id)
        .eq('updated_at', current.updated_at)
        .select('items,total,status')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!confirmed) continue;

      return {
        items: Array.isArray(confirmed.items) ? confirmed.items : JSON.parse(confirmed.items || '[]'),
        total: Number(confirmed.total || 0),
        status: confirmed.status as OrderStatus,
      };
    }
    throw new Error('Another kitchen screen kept updating this order. Please retry.');
  };

  const updateKitchenSingleItemStatus = async (
    order: Order,
    targetItem: CartItem,
    itemKey: string,
    nextStatus: OrderStatus,
    cancellationReason?: string,
  ): Promise<boolean> => {
    const targetIndex = order.items.indexOf(targetItem);
    if (targetIndex < 0 || updatingItemKeys.has(itemKey)) return false;

    setUpdatingItemKeys(previous => new Set(previous).add(itemKey));
    setOpenItemMenuKey(null);
    try {
      const transitionAt = Date.now();
      const confirmed = await persistKdsOrderMutation(order.id, (currentItems, currentTotal, currentStatus) => {
        const currentTargetIndex = findCurrentKdsItemIndex(currentItems, targetItem, targetIndex);
        if (currentTargetIndex < 0) return null;
        if (!isKitchenItemInActionScope(currentItems[currentTargetIndex])) return null;
        const cancellation = nextStatus === OrderStatus.CANCELLED
          ? cancelKdsItem(currentItems, currentStatus, targetItem, targetIndex, {
              reason: cancellationReason,
              cancelledBy: kitchenUserName,
              now: transitionAt,
              isInScope: isKitchenItemInActionScope,
            })
          : null;
        if (nextStatus === OrderStatus.CANCELLED && !cancellation) return null;
        const updatedItems = cancellation?.items || currentItems.map((item, index) => {
          if (index !== currentTargetIndex) return item;
          return {
            ...item,
            status: nextStatus,
            ...(nextStatus === OrderStatus.PREPARING
              ? { kitchenStartedAt: item.kitchenStartedAt || transitionAt, kitchenCookedAt: undefined }
              : {}),
            ...(nextStatus === OrderStatus.COMPLETED || nextStatus === OrderStatus.SERVED ? { kitchenCookedAt: item.kitchenCookedAt || transitionAt } : {}),
          };
        });
        const aggregateStatus = getAggregateStatusFromItems(updatedItems, currentStatus);
        return {
          items: updatedItems,
          total: Math.max(0, currentTotal - (cancellation?.cancelledValue || 0)),
          // Cancelling one line must not move the whole ticket backwards (for
          // example ONGOING -> PENDING). Only an all-cancelled ticket changes
          // the aggregate order status to CANCELLED.
          ...(nextStatus === OrderStatus.CANCELLED ? {
            status: aggregateStatus === OrderStatus.CANCELLED ? OrderStatus.CANCELLED : currentStatus,
          } : {}),
        };
      });
      onUpdateOrderItems?.(order.id, confirmed.items, confirmed.total, undefined, undefined, confirmed.status);
      await syncKitchenItemsToSavedBill(confirmed.items);
      return true;
    } catch (error) {
      console.error('Kitchen item status update error:', error);
      toast('Unable to update this food item.', 'error');
      return false;
    } finally {
      setUpdatingItemKeys(previous => {
        const next = new Set(previous);
        next.delete(itemKey);
        return next;
      });
    }
  };

  const advanceKitchenItemStatus = (order: Order, item: CartItem, itemKey: string) => {
    const currentStatus = getItemKitchenStatus(item, order.status);
    const nextStatus = currentStatus === OrderStatus.PREPARING && autoServeCookedOrders
      ? OrderStatus.SERVED
      : getNextKitchenItemStatus(currentStatus);
    if (nextStatus) void updateKitchenSingleItemStatus(order, item, itemKey, nextStatus);
  };

  const openCancelItemReasons = (order: Order, item: CartItem, itemKey: string) => {
    setOpenItemMenuKey(null);
    setCancelReason(undefined);
    setCustomCancelReason('');
    setCancelItemTarget({ order, item, itemKey });
  };

  const confirmCancelItem = async () => {
    if (!cancelItemTarget || isCancellingItem) return;
    const reason = customCancelReason.trim() || cancelReason;
    const { order, item, itemKey } = cancelItemTarget;
    setIsCancellingItem(true);
    const updated = await updateKitchenSingleItemStatus(order, item, itemKey, OrderStatus.CANCELLED, reason);
    setIsCancellingItem(false);
    if (!updated) return;
    setCancelItemTarget(null);
    toast(`${item.name} cancelled.`, 'success');
  };

  const serveKitchenOrder = async (order: Order) => {
    const scopedItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
    if (isServingOrder || areAllKdsItemsServed(scopedItems, order.status) || !areAllKitchenItemsCooked(scopedItems, order.status)) return;
    setIsServingOrder(true);
    try {
      const scopeCategories = kitchenHasAssignedScope ? kitchenScopeCategories : [];
      const confirmed = await persistKdsOrderMutation(order.id, (currentItems, currentTotal, currentStatus) => {
        const scopeKeys = new Set(scopeCategories.map(getKitchenCategoryKey));
        const currentScopedItems = currentItems.filter(item => (
          scopeCategories.length === 0
          || scopeKeys.has(getKitchenCategoryKey(item.category))
        ));
        if (!areAllKitchenItemsCooked(currentScopedItems, currentStatus)) return null;
        return { items: markKdsScopeServed(currentItems, currentStatus, scopeCategories), total: currentTotal };
      });

      await syncKitchenItemsToSavedBill(confirmed.items);
      onUpdateOrderItems?.(order.id, confirmed.items, confirmed.total, undefined, undefined, confirmed.status);
      setServeOrderId(null);
      toast(`Order #${order.id} served for this kitchen department.`, 'success');
    } catch (error) {
      console.error('Serve kitchen order error:', error);
      toast('Unable to serve this order. Please try again.', 'error');
    } finally {
      setIsServingOrder(false);
    }
  };

  useEffect(() => {
    if (!kitchenEnabled) return;
    const nextPendingIds = new Set(kitchenPendingOrders.map(order => order.id));
    const previousPendingIds = kitchenPreviousPendingIds.current;
    if (previousPendingIds && kitchenPendingOrders.some(order => !previousPendingIds.has(order.id))) {
      triggerNewOrderAlert();
    }
    kitchenPreviousPendingIds.current = nextPendingIds;
  }, [kitchenPendingOrders, kitchenEnabled]);

  // POS revisions carry an item-level timestamp. Comparing only scoped items
  // means a Drinks edit alerts Drinks screens without disturbing Food screens.
  useEffect(() => {
    const markers = new Map<string, number>();
    kitchenFilteredOrders.forEach(order => {
      const scopedItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
      markers.set(order.id, scopedItems.reduce(
        (latest, item) => Math.max(latest, Number(item.kdsChangedAt || 0)),
        0,
      ));
    });
    const previous = kitchenPreviousUpdateMarkers.current;
    if (previous && Array.from(markers).some(([orderId, marker]) => marker > (previous.get(orderId) || 0))) {
      triggerNewOrderAlert('Order updated!');
    }
    kitchenPreviousUpdateMarkers.current = markers;
  }, [kitchenFilteredOrders, kitchenHasAssignedScope, kitchenScopeCategories]);

  useEffect(() => {
    const receivedOrders = kitchenFilteredOrders.filter(order => (
      order.status === OrderStatus.PENDING
      || order.status === OrderStatus.ONGOING
      || order.status === OrderStatus.PREPARING
    ));
    const receivedOrderIds = new Set(receivedOrders.map(order => order.id));
    if (autoPrintSeenOrderIds.current === null) {
      // Existing tickets are the mount-time baseline, not newly received work.
      autoPrintSeenOrderIds.current = receivedOrderIds;
      return;
    }

    receivedOrders.forEach(order => {
      if (
        kitchenTicketConfig.autoPrintOnNewOrder
        && !autoPrintSeenOrderIds.current?.has(order.id)
      ) autoPrintEligibleOrderIds.current.add(order.id);
    });
    receivedOrderIds.forEach(orderId => autoPrintSeenOrderIds.current?.add(orderId));
    if (!kitchenEnabled || !kitchenTicketConfig.autoPrintOnNewOrder || !printerConnected) return;

    const ordersToPrint = receivedOrders.filter(order => (
      autoPrintEligibleOrderIds.current.has(order.id)
      && !printedOrderIds.has(order.id)
      && !autoPrintInFlightOrderIds.current.has(order.id)
    ));
    ordersToPrint.forEach(order => {
      // Remove before starting so state changes during a print cannot enqueue a duplicate.
      autoPrintEligibleOrderIds.current.delete(order.id);
      autoPrintInFlightOrderIds.current.add(order.id);
      void printKitchenOrder(order, false).then(printed => {
        if (!printed) toast(`Auto-print failed for order #${order.id}. Use Print Order List to retry.`, 'error');
      }).finally(() => {
        autoPrintInFlightOrderIds.current.delete(order.id);
      });
    });
  }, [kitchenFilteredOrders, kitchenEnabled, kitchenTicketConfig.autoPrintOnNewOrder, printerConnected, printedOrderIds]);

  useEffect(() => {
    if (!openItemMenuKey) return;
    const closeItemMenu = () => setOpenItemMenuKey(null);
    document.addEventListener('pointerdown', closeItemMenu);
    return () => document.removeEventListener('pointerdown', closeItemMenu);
  }, [openItemMenuKey]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    setCurrentKitchenPage(current => Math.min(current, kitchenPageCount));
  }, [kitchenPageCount]);

  useEffect(() => {
    localStorage.setItem(`kds_tickets_per_page_${restaurant.id}`, String(ticketColumns));
  }, [restaurant.id, ticketColumns]);

  useEffect(() => {
    localStorage.setItem(`kds_font_size_${restaurant.id}`, ticketFontSize);
  }, [restaurant.id, ticketFontSize]);

  useEffect(() => {
    localStorage.setItem(`kds_alert_sound_${restaurant.id}`, alertSound);
  }, [restaurant.id, alertSound]);

  useEffect(() => {
    const databaseValue = restaurant.settings?.kitchenSettings?.autoServe;
    if (typeof databaseValue !== 'boolean') return;
    setAutoServeCookedOrders(databaseValue);
    localStorage.setItem(`kds_auto_serve_${restaurant.id}`, String(databaseValue));
  }, [restaurant.id, restaurant.settings?.kitchenSettings?.autoServe]);

  useEffect(() => {
    if (autoServeCookedOrders && kitchenOrderFilter === 'COOKED') {
      setKitchenOrderFilter('ONGOING_ALL');
      setCurrentKitchenPage(1);
    }
  }, [autoServeCookedOrders, kitchenOrderFilter]);

  const goToKitchenPage = (requestedPage: number) => {
    const nextPage = Math.min(kitchenPageCount, Math.max(1, requestedPage));
    if (nextPage === currentKitchenPage) return;
    setPageSlideDirection(nextPage > currentKitchenPage ? 'NEXT' : 'PREVIOUS');
    setCurrentKitchenPage(nextPage);
  };

  const handleKitchenTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleKitchenTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || expandedOrderId || showDisplaySettings) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
    goToKitchenPage(deltaX < 0 ? currentKitchenPage + 1 : currentKitchenPage - 1);
  };

  if (!kitchenEnabled) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-gray-50 p-6 text-center dark:bg-gray-900">
        <div className="max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <Coffee className="mx-auto mb-4 text-orange-500" size={32} />
          <h1 className="text-xl font-black uppercase tracking-tight text-gray-900 dark:text-white">Kitchen Display Disabled</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This restaurant needs Pro Plus and Kitchen Display enabled before kitchen staff can use this screen.</p>
          {onLogout && (
            <button onClick={onLogout} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-gray-900 px-4 text-xs font-black uppercase tracking-widest text-white dark:bg-white dark:text-gray-900">
              <LogOut size={14} />
              Logout
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!kitchenHasAssignedScope) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-slate-950 p-5 text-center">
        <div className="w-full max-w-lg rounded-3xl border border-orange-400/20 bg-white p-7 shadow-2xl sm:p-10 dark:bg-gray-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
            <ChefHat size={32} />
          </div>
          <p className="mt-6 text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-400">Setup needed</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white">No KDS department assigned</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">Ask a manager to open Back Office → Staff → User Access and assign this account to at least one KDS department.</p>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left dark:border-gray-700 dark:bg-gray-800">
            <p className="text-xs font-bold text-gray-800 dark:text-gray-100">Why the screen is paused</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">A department determines which food categories this screen is allowed to receive. No orders are shown until routing is configured.</p>
          </div>
          {onLogout && (
            <button onClick={onLogout} className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600">
              <LogOut size={15} />
              Logout
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-gray-900 dark:bg-[#000000] dark:text-white">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img src={isDarkMode ? '/LOGO/9-dark.png' : '/LOGO/9.png'} alt="QuickServe" className="hidden h-7 w-auto shrink-0 sm:block" />
          <div className="flex min-w-0 items-center gap-2 sm:border-l sm:border-gray-200 sm:pl-3 dark:sm:border-gray-700">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"><ChefHat size={17} /></span>
            <div className="min-w-0">
              <p className="hidden text-[9px] font-black uppercase tracking-wider text-gray-400 sm:block">Your station</p>
              <p className="max-w-20 truncate text-[10px] font-black text-gray-900 dark:text-white sm:max-w-52 sm:text-xs">{kitchenAssignedScopes.join(', ')}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="flex h-8 items-center gap-0.5 rounded-full bg-gray-100/80 px-1 dark:bg-gray-700/70">
            <button
              onClick={() => void connectKitchenPrinter()}
              disabled={isConnectingPrinter}
              className={`flex h-7 items-center justify-center gap-1.5 rounded-full px-2 text-[9px] font-black uppercase tracking-wider transition-colors disabled:cursor-wait disabled:opacity-70 sm:px-2.5 ${printerConnected ? 'text-green-600 hover:bg-white dark:text-green-400 dark:hover:bg-gray-600' : 'text-red-600 hover:bg-white dark:text-red-400 dark:hover:bg-gray-600'}`}
              title={activeKitchenPrinter ? `${activeKitchenPrinter.name}: ${printerConnected ? 'ready' : 'connect'}` : 'Set up a kitchen printer in POS Settings'}
              aria-label={printerConnected ? 'Printer ready' : 'Printer disconnected'}
            >
              {isConnectingPrinter ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
              <span className="hidden sm:inline">{printerConnected ? 'Printer Ready' : 'Printer Offline'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setDisplaySettingsSection('PRINTER'); setShowDisplaySettings(true); refreshKdsUserPreferences(); }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white"
              title="Printer settings"
              aria-label="Printer settings"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          <div className="flex h-8 items-center gap-0.5 rounded-full bg-gray-100/80 px-1 dark:bg-gray-700/70">
            <div
              className={`flex h-7 w-8 items-center justify-center rounded-full ${networkMeta?.color || (isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}`}
              title={networkMeta?.title || (isOnline ? 'Online' : 'Offline')}
              aria-label={`Network ${networkMeta?.label || (isOnline ? 'Online' : 'Offline')}`}
            >
              <div className="flex h-[18px] w-[18px] items-end justify-center gap-0.5 pb-0.5" aria-hidden="true">
                {[1, 2, 3].map(bar => (
                  <span
                    key={bar}
                    className={`w-1 rounded-full ${!networkMeta || bar <= networkMeta.bars || !networkMeta.mutedBars ? 'bg-current' : 'bg-gray-300 dark:bg-gray-500'}`}
                    style={{ height: `${bar * 4}px` }}
                  />
                ))}
              </div>
            </div>
            {batteryMeta && (
              <div className={`hidden h-7 w-8 items-center justify-center rounded-full sm:flex ${batteryMeta.color}`} title={batteryMeta.label} aria-label={batteryMeta.label}>
                <div className="flex h-[18px] w-[18px] items-center justify-center" aria-hidden="true">
                  <div className="relative h-3 w-5 rounded-[3px] border-2 border-current p-0.5">
                    <span className="block h-full rounded-[1px] bg-current" style={{ width: batteryMeta.percent > 0 ? `${Math.max(batteryMeta.percent, 8)}%` : '0%' }} />
                    {batteryCharging && <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-white">+</span>}
                  </div>
                  <span className="h-1.5 w-0.5 rounded-r bg-current" />
                </div>
              </div>
            )}
            <button
              onClick={() => { setShowMailPanel(true); void onRefreshMail?.(); }}
              className="relative flex h-7 w-8 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-white dark:text-white dark:hover:bg-gray-600"
              title="Mail"
              aria-label="Open mail"
            >
              <Mail size={16} />
              {unreadMailCount > 0 && <span className="absolute -right-0.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">{unreadMailCount > 9 ? '9+' : unreadMailCount}</span>}
            </button>
          </div>

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
              <Sun size={12} className={`absolute left-2 text-orange-400 transition-opacity duration-300 ${isDarkMode ? 'opacity-40' : 'opacity-0'}`} />
              <Moon size={12} className={`absolute right-2 text-indigo-400 transition-opacity duration-300 ${isDarkMode ? 'opacity-0' : 'opacity-40'}`} />
            </button>
          )}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[9px] font-bold uppercase leading-tight text-gray-400">Kitchen</p>
              <p className="max-w-28 truncate text-[11px] font-black leading-tight text-gray-900 dark:text-white">{restaurant.name}</p>
            </div>
            {onLogout && (
              <button onClick={onLogout} className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700 sm:p-2" title="Logout" aria-label="Logout">
                <LogOut size={16} className="sm:h-[18px] sm:w-[18px]" />
              </button>
            )}
          </div>
        </div>
      </header>


      <main
        className="min-h-0 flex-1 touch-pan-y overflow-hidden bg-[#000000] p-2 sm:p-3 dark:bg-[#000000]"
        onTouchStart={handleKitchenTouchStart}
        onTouchEnd={handleKitchenTouchEnd}
      >
        {pagedKitchenOrders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center bg-[#000000] text-center text-white dark:bg-[#000000]">
            <ShoppingBag size={24} className="text-gray-300 dark:text-gray-500" />
            <h3 className="mt-3 text-sm font-black uppercase">Kitchen Quiet</h3>
            <p className="mt-1 text-[10px] text-gray-400">Waiting for incoming orders</p>
          </div>
        ) : (
          <>
          {expandedOrderId && (
            <button
              type="button"
              className="fixed inset-0 z-[80] cursor-default bg-black/35 backdrop-blur-md"
              onClick={() => setExpandedOrderId(null)}
              aria-label="Close expanded order"
            />
          )}
          <div
            key={`${kitchenOrderFilter}-${currentKitchenPage}`}
            className={`grid h-full min-h-0 gap-2.5 ${ticketGridClass} ${!expandedOrderId ? (pageSlideDirection === 'NEXT' ? 'animate-kds-page-next' : 'animate-kds-page-previous') : ''}`}
          >
            {pagedKitchenOrders.map(order => {
              const visibleKitchenItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
              const isPostServedUpdate = visibleKitchenItems.some(item => item.kdsTicketKind === 'POST_SERVED');
              const postServedUpdateLabel = visibleKitchenItems.every(item => getItemKitchenStatus(item, order.status) === OrderStatus.CANCELLED)
                ? 'Cancelled items'
                : 'New items';
              const isExpanded = expandedOrderId === order.id;
              const allItemsCooked = areAllKitchenItemsCooked(visibleKitchenItems, order.status);
              const allItemsServed = areAllKdsItemsServed(visibleKitchenItems, order.status);
              const canServeOrder = !autoServeCookedOrders && allItemsCooked && !allItemsServed && (
                order.status === OrderStatus.PENDING
                || order.status === OrderStatus.ONGOING
                || order.status === OrderStatus.PREPARING
              );

              return (
                <article
                  key={order.id}
                  onClick={() => canServeOrder && setServeOrderId(order.id)}
                  className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white text-gray-900 shadow-xl dark:bg-white ${canServeOrder ? 'cursor-pointer ring-2 ring-inset ring-green-500 hover:ring-green-400' : ''} ${isExpanded ? 'fixed bottom-4 left-1/2 top-4 z-[90] w-[min(520px,calc(100vw-1rem))] -translate-x-1/2' : 'h-full'}`}
                >
                  <div className="shrink-0 border-b border-gray-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className={`truncate font-black tracking-tight ${ticketTitleClass}`}>{order.tableNumber || 'Takeaway'}</h2>
                      <span className="shrink-0 rounded-lg bg-red-500 px-3 py-1 text-[10px] font-black tabular-nums text-white">
                        {formatCookingStopwatch(order, visibleKitchenItems)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div className={`min-w-0 font-semibold leading-tight ${ticketMetaClass}`}>
                        <p>{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                        <p className="truncate text-gray-500">#{order.id}</p>
                      </div>
                      <div className={`shrink-0 text-right font-semibold leading-tight ${ticketMetaClass}`}>
                        <p>{order.diningType || (order.orderSource === 'online' ? 'Delivery' : 'Dine in')}</p>
                        <p>{visibleKitchenItems.length} item{visibleKitchenItems.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    {isPostServedUpdate && (
                      <div className="mt-2 rounded-md bg-blue-600 px-2 py-1 text-center text-[10px] font-black uppercase tracking-widest text-white">
                        {postServedUpdateLabel}
                      </div>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                    {visibleKitchenItems.map((item, idx) => {
                      const itemKey = `${order.id}-${item.category || 'item'}-${item.id}-${idx}`;
                      const itemStatus = getItemKitchenStatus(item, order.status);
                      const nextItemStatus = itemStatus === OrderStatus.PREPARING && autoServeCookedOrders
                        ? OrderStatus.SERVED
                        : getNextKitchenItemStatus(itemStatus);
                      const isUpdatingItem = updatingItemKeys.has(itemKey);
                      const isItemMenuOpen = openItemMenuKey === itemKey;
                      const isServedItem = itemStatus === OrderStatus.SERVED;
                      const isCookedItem = itemStatus === OrderStatus.COMPLETED;
                      const preparationDetails = getKdsPreparationDetails(item);
                      const rowStateClass = itemStatus === OrderStatus.PREPARING
                        ? 'bg-blue-50'
                        : isServedItem
                          ? 'bg-green-50 text-green-700'
                          : isCookedItem
                          ? 'bg-gray-200 text-gray-400'
                          : itemStatus === OrderStatus.CANCELLED
                            ? 'bg-red-50'
                            : 'bg-gray-100 hover:bg-gray-200';

                      return (
                        <div
                          key={itemKey}
                          role={nextItemStatus ? 'button' : undefined}
                          tabIndex={nextItemStatus ? 0 : -1}
                          onClick={() => nextItemStatus && advanceKitchenItemStatus(order, item, itemKey)}
                          onKeyDown={event => {
                            if (nextItemStatus && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              advanceKitchenItemStatus(order, item, itemKey);
                            }
                          }}
                          className={`relative flex min-h-10 items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${nextItemStatus && !isUpdatingItem ? 'cursor-pointer' : 'cursor-default'} ${rowStateClass}`}
                          aria-label={nextItemStatus ? `${item.name}: mark ${getKitchenStatusText(nextItemStatus)}` : `${item.name}: ${getKitchenStatusText(itemStatus)}`}
                        >
                          <span className={`w-7 shrink-0 pt-0.5 text-[10px] font-bold ${itemStatus === OrderStatus.CANCELLED ? 'text-red-600 line-through decoration-2' : 'text-gray-500'}`}>x{item.quantity}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className={`whitespace-normal break-words font-bold ${ticketItemNameClass} ${itemStatus === OrderStatus.CANCELLED ? 'line-through text-red-600 decoration-2' : ''}`}>{item.name}</p>
                              {item.kdsChangeType === 'ADDED' && itemStatus !== OrderStatus.CANCELLED && (
                                <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">New</span>
                              )}
                              {item.kdsChangeType === 'CORRECTED' && itemStatus !== OrderStatus.CANCELLED && (
                                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">Updated</span>
                              )}
                              {itemStatus === OrderStatus.CANCELLED && (
                                <span className="rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">Cancelled</span>
                              )}
                            </div>
                            {itemStatus === OrderStatus.CANCELLED && item.kitchenCancelReason && (
                              <p className={`mt-0.5 whitespace-normal break-words font-semibold text-red-500 ${ticketItemDetailClass}`}>{item.kitchenCancelReason}</p>
                            )}
                            {preparationDetails.map(detail => (
                              <p
                                key={detail.key}
                                className={`mt-0.5 whitespace-normal break-words font-semibold leading-4 ${ticketItemDetailClass} ${itemStatus === OrderStatus.CANCELLED ? 'text-red-500 line-through decoration-2' : 'text-gray-600'}`}
                              >
                                <span className="font-black text-current">{detail.label}:</span> {detail.value}
                              </p>
                            ))}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                            {isUpdatingItem ? (
                              <Loader2 className="animate-spin text-blue-500" size={12} />
                            ) : isServedItem ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white" title="Served">
                                <Check strokeWidth={3} size={11} />
                              </span>
                            ) : isCookedItem ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-gray-500" title="Cooked">
                                <Check strokeWidth={3} size={11} />
                              </span>
                            ) : itemStatus === OrderStatus.PREPARING ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-blue-400 text-blue-500" title="Cooking">
                                <Clock size={11} />
                              </span>
                            ) : itemStatus === OrderStatus.CANCELLED ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-red-400 text-red-500" title="Cancelled">
                                <X size={11} />
                              </span>
                            ) : (
                              <span className="h-4 w-4 rounded-full border border-gray-400" title="Waiting" />
                            )}
                            {!isServedItem && (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  setOpenItemMenuKey(current => current === itemKey ? null : itemKey);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-700"
                                title="Item options"
                                aria-label={`Options for ${item.name}`}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            )}
                          </div>

                          {isItemMenuOpen && (
                            <div className="absolute right-1 top-8 z-30 w-32 rounded-md border border-gray-200 bg-white p-1 shadow-xl" onClick={event => event.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => openCancelItemReasons(order, item, itemKey)}
                                disabled={itemStatus === OrderStatus.CANCELLED || isUpdatingItem}
                                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                              >
                                <X size={12} />
                                Cancel item
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {order.remark && (
                      <div className="flex items-start gap-2 rounded-md bg-orange-50 px-2 py-1.5 text-[9px] text-orange-800">
                        <MessageSquare size={11} className="mt-0.5 shrink-0" />
                        <p>{order.remark}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid h-11 shrink-0 grid-cols-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        void printKitchenOrder(order);
                      }}
                      disabled={printingKitchenOrderId === order.id}
                      className="flex items-center justify-center gap-2 border-r border-gray-200 px-1.5 text-[11px] font-bold text-orange-600 hover:bg-orange-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      {printingKitchenOrderId === order.id ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                      {printedOrderIds.has(order.id) ? 'Reprint Order List' : 'Print Order List'}
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        setExpandedOrderId(isExpanded ? null : order.id);
                      }}
                      className="flex items-center justify-center gap-2 text-xs font-bold text-blue-600 hover:bg-blue-50"
                    >
                      {isExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                      {isExpanded ? 'collapse' : 'expand'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </main>

      <footer className="relative grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-1 overflow-visible bg-[#202124] px-1.5 text-white sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-2">
        <div className="flex h-full min-w-0 items-center gap-0.5 overflow-visible pl-1 sm:pl-2">
          <span className="hidden shrink-0 self-center pr-1 text-xs font-bold sm:inline">{kitchenVisibleOrders.length} orders</span>
          <button onClick={() => { setKitchenOrderFilter('ONGOING_ALL'); setCurrentKitchenPage(1); }} className={`ml-2 flex shrink-0 self-center items-center gap-1 rounded-t-md border-t-2 px-1.5 text-[9px] font-semibold transition-colors sm:px-2 sm:text-[10px] ${kitchenOrderFilter === 'ONGOING_ALL' ? 'h-[calc(100%+4px)] -translate-y-0.5 border-blue-400 bg-[#3a3a3c] text-white' : 'h-8 rounded-md border-transparent text-gray-400 hover:bg-white/5'}`}>
            <Clock className="text-blue-400" size={14} />
            Cooking
          </button>
          {!autoServeCookedOrders && (
            <button onClick={() => { setKitchenOrderFilter('COOKED'); setCurrentKitchenPage(1); }} className={`flex shrink-0 self-center items-center gap-1 rounded-t-md border-t-2 px-1.5 text-[9px] font-semibold transition-colors sm:px-2 sm:text-[10px] ${kitchenOrderFilter === 'COOKED' ? 'h-[calc(100%+4px)] -translate-y-0.5 border-gray-300 bg-[#3a3a3c] text-white' : 'h-8 rounded-md border-transparent text-gray-400 hover:bg-white/5'}`}>
              <CheckCircle className="text-gray-300" size={14} />
              Cooked
            </button>
          )}
          <button onClick={() => { setKitchenOrderFilter(OrderStatus.SERVED); setCurrentKitchenPage(1); }} className={`flex shrink-0 self-center items-center gap-1 rounded-t-md border-t-2 px-1.5 text-[9px] font-semibold transition-colors sm:px-2 sm:text-[10px] ${kitchenOrderFilter === OrderStatus.SERVED ? 'h-[calc(100%+4px)] -translate-y-0.5 border-green-500 bg-[#3a3a3c] text-white' : 'h-8 rounded-md border-transparent text-gray-400 hover:bg-white/5'}`}>
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-500 text-white">
              <Check strokeWidth={3} size={10} />
            </span>
            Served
          </button>
          <button onClick={() => { setKitchenOrderFilter(OrderStatus.CANCELLED); setCurrentKitchenPage(1); }} className={`flex shrink-0 self-center items-center gap-1 rounded-t-md border-t-2 px-1.5 text-[9px] font-semibold transition-colors sm:px-2 sm:text-[10px] ${kitchenOrderFilter === OrderStatus.CANCELLED ? 'h-[calc(100%+4px)] -translate-y-0.5 border-red-500 bg-[#3a3a3c] text-white' : 'h-8 rounded-md border-transparent text-gray-400 hover:bg-white/5'}`}>
            <X className="text-red-400" size={14} />
            Cancelled
          </button>
        </div>

        <div className="flex h-8 items-center justify-center gap-1 self-center">
          <button
            onClick={() => goToKitchenPage(currentKitchenPage - 1)}
            disabled={currentKitchenPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-300 disabled:opacity-30"
            title="Previous page"
          >
            <ChevronLeft size={15} />
          </button>
          {Array.from({ length: kitchenPageCount }, (_, index) => index + 1)
            .slice(Math.max(0, Math.min(currentKitchenPage - 3, kitchenPageCount - 5)), Math.max(0, Math.min(currentKitchenPage - 3, kitchenPageCount - 5)) + 5)
            .map(page => (
              <button
                key={page}
                onClick={() => goToKitchenPage(page)}
                className={`h-8 min-w-8 rounded-md px-2 text-[10px] font-bold ${currentKitchenPage === page ? 'bg-blue-500 text-white' : 'bg-white/20 text-gray-200'}`}
              >
                {page}
              </button>
            ))}
          <button
            onClick={() => goToKitchenPage(currentKitchenPage + 1)}
            disabled={currentKitchenPage === kitchenPageCount}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-300 disabled:opacity-30"
            title="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="relative flex h-8 items-center justify-end gap-2 self-center">
          <time className="hidden whitespace-nowrap text-right text-[10px] font-medium leading-tight text-gray-400 sm:block">
            <span>{new Date(clockNow).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="ml-2 tabular-nums text-[11px] font-bold text-white">{new Date(clockNow).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </time>
          <button onClick={() => { setDisplaySettingsSection('APPEARANCE'); setShowDisplaySettings(true); refreshKdsUserPreferences(); }} className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-200 hover:bg-white/20" title="Display and alert settings">
            <Settings size={15} />
          </button>
        </div>
      </footer>

      {showDisplaySettings && (
        <section className="fixed inset-0 z-[140] flex flex-col bg-black text-white animate-in slide-in-from-right duration-300" aria-label="KDS settings">
          <header className="flex h-16 shrink-0 items-center border-b border-white/20 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setShowDisplaySettings(false)}
              className="flex h-11 items-center gap-3 px-2 text-lg font-semibold hover:text-blue-400"
              aria-label="Back to kitchen display"
            >
              <ChevronLeft size={28} />
              Settings
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav className="shrink-0 border-b border-white/20 p-4 sm:w-64 sm:border-b-0 sm:border-r sm:p-5" aria-label="Settings sections">
              <div className="flex gap-2 sm:flex-col">
                <button
                  type="button"
                  onClick={() => setDisplaySettingsSection('APPEARANCE')}
                  className={`flex h-12 flex-1 items-center rounded-md px-4 text-left text-base font-semibold sm:flex-none ${displaySettingsSection === 'APPEARANCE' ? 'bg-white/25 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                >
                  Display & Alerts
                </button>
                <button
                  type="button"
                  onClick={() => setDisplaySettingsSection('WORKFLOW')}
                  className={`flex h-12 flex-1 items-center rounded-md px-4 text-left text-base font-semibold sm:flex-none ${displaySettingsSection === 'WORKFLOW' ? 'bg-white/25 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                >
                  Workflow
                </button>
                <button
                  type="button"
                  onClick={() => setDisplaySettingsSection('PRINTER')}
                  className={`flex h-12 flex-1 items-center rounded-md px-4 text-left text-base font-semibold sm:flex-none ${displaySettingsSection === 'PRINTER' ? 'bg-white/25 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                >
                  Printer
                </button>
                <button
                  type="button"
                  onClick={() => setDisplaySettingsSection('VERSION')}
                  className={`flex h-12 flex-1 items-center rounded-md px-4 text-left text-base font-semibold sm:flex-none ${displaySettingsSection === 'VERSION' ? 'bg-white/25 text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                >
                  Version Info
                </button>
              </div>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10 lg:px-14">
              {displaySettingsSection === 'APPEARANCE' ? (
              <div className="max-w-3xl">
                <h2 className="text-2xl font-semibold">Display & Alerts</h2>

                <div className="mt-8">
                  <p className="text-base font-medium">Maximum tickets per page</p>
                  <p className="mt-1 text-sm text-gray-400">The display automatically uses fewer columns on smaller screens so tickets are never cut off.</p>
                  <div className="mt-4 inline-grid grid-cols-3 gap-2">
                    {([3, 4, 5] as const).map(columns => (
                      <button
                        key={columns}
                        type="button"
                        onClick={() => { setTicketColumns(columns); setCurrentKitchenPage(1); saveKdsPreference('ticketsPerPage', columns, `kds_tickets_per_page_${restaurant.id}`); }}
                        className={`h-12 min-w-20 rounded-md px-5 text-sm font-bold ${ticketColumns === columns ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                      >
                        {columns}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-base font-medium">Font size</p>
                  <div className="mt-4 inline-grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const).map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => { setTicketFontSize(size); saveKdsPreference('fontSize', size, `kds_font_size_${restaurant.id}`); }}
                        className={`h-12 min-w-24 rounded-md px-4 text-sm font-bold capitalize ${ticketFontSize === size ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                      >
                        {size === 'EXTRA_LARGE' ? 'extra large' : size.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="py-8">
                  <p className="text-base font-medium">Notification sound</p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {KDS_ALERT_SOUNDS.map(sound => (
                      <button
                        key={sound.id}
                        type="button"
                        onClick={() => selectAlertSound(sound.id)}
                        className={`flex h-14 min-w-0 items-center justify-between gap-2 rounded-md px-2.5 text-left text-xs font-bold sm:px-4 sm:text-sm ${alertSound === sound.id ? 'bg-blue-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/15'}`}
                      >
                        <span className="min-w-0 leading-tight">{sound.label}</span>
                        {alertSound === sound.id && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
              ) : displaySettingsSection === 'WORKFLOW' ? (
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold">Workflow</h2>

                  <div className="mt-8 flex items-center justify-between gap-5 rounded-lg bg-white/10 p-5">
                    <div>
                      <p className="text-base font-medium">Auto Serve</p>
                      <p className="mt-1 text-sm text-gray-400">Second tap marks cooked items as served immediately and hides the Cooked view.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoServeCookedOrders}
                      onClick={() => setAutoServeCookedItems(!autoServeCookedOrders)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoServeCookedOrders ? 'bg-green-600' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${autoServeCookedOrders ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              ) : displaySettingsSection === 'PRINTER' ? (
                <div className="max-w-4xl">
                  <h2 className="text-2xl font-semibold">Printer</h2>
                  <p className="mt-2 text-sm text-gray-400">Connect a thermal printer and use the same Order List layout configured in POS.</p>

                  <div className="mt-8 rounded-lg bg-white/10 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                      <label className="min-w-0 flex-1 text-sm font-medium">
                        Selected printer
                        <select
                          value={activeKitchenPrinter?.id || ''}
                          onChange={event => void selectKdsPrinter(event.target.value)}
                          className="mt-2 h-11 w-full rounded-md border border-white/30 bg-[#171717] px-3 text-sm text-white outline-none focus:border-blue-500"
                        >
                          {savedPrinters.length === 0 && <option value="">No printers configured</option>}
                          {savedPrinters.map(printer => (
                            <option key={printer.id} value={printer.id}>{printer.name} · {printer.connectionType.toUpperCase()} · {printer.paperSize}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void connectKitchenPrinter()}
                          disabled={!activeKitchenPrinter || isConnectingPrinter}
                          className="flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
                        >
                          {isConnectingPrinter ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
                          {printerConnected ? 'Reconnect' : 'Connect'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void testKitchenPrinter()}
                          disabled={!activeKitchenPrinter || isTestingPrinter}
                          className="flex h-11 items-center justify-center gap-2 rounded-md border border-white/30 px-4 text-sm font-bold hover:bg-white/10 disabled:opacity-40"
                        >
                          {isTestingPrinter ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                          Test Print
                        </button>
                      </div>
                    </div>
                    <div className={`mt-4 flex items-center gap-2 text-sm font-semibold ${printerConnected ? 'text-green-400' : 'text-gray-400'}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${printerConnected ? 'bg-green-400' : 'bg-gray-500'}`} />
                      {printerConnected ? 'Printer ready' : 'Printer disconnected'}
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-5 rounded-lg bg-white/10 p-5">
                    <div>
                      <p className="text-base font-medium">Auto Print New Order</p>
                      <p className="mt-1 text-sm text-gray-400">Print each newly received KDS order once. Later updates can be reprinted from the order card.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={kitchenTicketConfig.autoPrintOnNewOrder}
                      onClick={() => setAutoPrintNewOrders(!kitchenTicketConfig.autoPrintOnNewOrder)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${kitchenTicketConfig.autoPrintOnNewOrder ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${kitchenTicketConfig.autoPrintOnNewOrder ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  {kitchenTicketConfig.autoPrintOnNewOrder && !printerConnected && (
                    <p className="mt-3 text-sm font-medium text-amber-400">Connect the selected printer to auto-print incoming orders.</p>
                  )}

                  <div className="mt-8">
                    <h3 className="text-lg font-semibold">Printer connection and setup</h3>
                    <p className="mt-1 text-sm text-gray-400">Add or edit Bluetooth, USB, SUNMI, and WiFi/LAN thermal printer profiles.</p>
                    <div className="mt-5">
                      <PrinterSettings
                        restaurantId={restaurant.id}
                        restaurantName={restaurant.name}
                        categories={kitchenScopeCategories}
                        departments={kitchenDivisions}
                        savedPrinters={savedPrinters}
                        initialTab="printers"
                        visibleTabs={['printers']}
                        onPrinterConnected={() => refreshPrinterStatus()}
                        onPrintersChange={handleKdsPrintersChange}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold">Version Info</h2>
                  <div className="mt-8">
                    <p className="text-base text-gray-300">Version v1.0.5.1</p>
                    <p className="mt-2 text-sm text-gray-400">Last update: 9 Sept 2026, 1:30 AM</p>
                    <p className="mt-2 text-sm text-gray-500">Developed by Chaels Stanlly, QuickServe Team</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {serveOrder && (
        <div className="fixed inset-0 z-[110] bg-black/65" onMouseDown={() => !isServingOrder && setServeOrderId(null)}>
          <aside
            className="ml-auto flex h-full w-full flex-col bg-white text-gray-900 shadow-2xl sm:w-1/2"
            onMouseDown={event => event.stopPropagation()}
            aria-label={`Serve order ${serveOrder.id}`}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-green-600">All items cooked</p>
                <h2 className="truncate text-xl font-black">{serveOrder.tableNumber || 'Takeaway'} · #{serveOrder.id}</h2>
              </div>
              <button
                type="button"
                onClick={() => setServeOrderId(null)}
                disabled={isServingOrder}
                className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="space-y-2">
                {getSortedOrderItems(serveOrder, kitchenHasAssignedScope ? kitchenScopeCategories : []).map((item, index) => (
                  <div key={`${serveOrder.id}-serve-${item.id}-${index}`} className="flex items-center gap-3 rounded-md bg-gray-100 px-3 py-3 text-gray-500">
                    <CheckCircle className="shrink-0 text-gray-400" fill="currentColor" size={16} />
                    <span className="w-5 shrink-0 text-xs font-bold">{item.quantity}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm font-bold ${getItemKitchenStatus(item, serveOrder.status) === OrderStatus.CANCELLED ? 'line-through' : ''}`}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-t border-gray-200 p-5">
              <button
                type="button"
                onClick={() => void serveKitchenOrder(serveOrder)}
                disabled={isServingOrder}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-green-600 text-sm font-black uppercase text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isServingOrder ? <Loader2 className="animate-spin" size={19} /> : <CheckCircle size={19} />}
                Serve order
              </button>
            </div>
          </aside>
        </div>
      )}

      {showMailPanel && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/30" onMouseDown={() => setShowMailPanel(false)}>
          <aside className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-gray-50 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onMouseDown={event => event.stopPropagation()}>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex min-w-0 items-center gap-3">
                <Mail size={18} className="text-orange-500" />
                <div>
                  <h2 className="text-sm font-black uppercase">Mail</h2>
                  <p className="text-[9px] font-bold uppercase text-gray-400">{unreadMailCount} unread</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => void onRefreshMail?.()} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-orange-500 dark:hover:bg-gray-700" title="Refresh mail">
                  <RefreshCw className={announcementsLoading ? 'animate-spin' : ''} size={15} />
                </button>
                <button onClick={onMarkAllAnnouncementsRead} disabled={unreadMailCount === 0} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-green-600 disabled:opacity-30 dark:hover:bg-gray-700" title="Mark all as read">
                  <CheckCheck size={16} />
                </button>
                <button onClick={onClearAnnouncements} disabled={announcements.length === 0} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-500 disabled:opacity-30 dark:hover:bg-gray-700" title="Clear mail">
                  <Trash2 size={15} />
                </button>
                <button onClick={() => setShowMailPanel(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" title="Close mail">
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {announcementsLoading && announcements.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-orange-500"><Loader2 className="animate-spin" size={24} /></div>
              ) : announcements.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-gray-400">
                  <Mail size={24} />
                  <p className="mt-3 text-xs font-black uppercase">No mail</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {announcements.map(announcement => (
                    <article key={announcement.id} className={`rounded-lg border bg-white p-4 dark:bg-gray-800 ${announcement.is_read ? 'border-gray-200 dark:border-gray-700' : 'border-orange-300 dark:border-orange-700'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button onClick={() => onMarkAnnouncementRead?.(announcement.id)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            {!announcement.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{announcement.title}</h3>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-600 dark:text-gray-300">{announcement.body}</p>
                          <div className="mt-3 flex items-center gap-2 text-[9px] font-bold uppercase text-gray-400">
                            <span>{announcement.category || 'Announcement'}</span>
                            <span>{new Date(announcement.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </button>
                        <button onClick={() => onDeleteAnnouncement?.(announcement.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20" title="Delete message">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {cancelItemTarget && (
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={() => {
            if (!isCancellingItem) setCancelItemTarget(null);
          }}
        >
          <form
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-gray-900 sm:rounded-2xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-kds-item-title"
            onMouseDown={event => event.stopPropagation()}
            onSubmit={event => {
              event.preventDefault();
              void confirmCancelItem();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500">Cancel item</p>
                <h2 id="cancel-kds-item-title" className="mt-1 text-xl font-black text-gray-950 dark:text-white">
                  {cancelItemTarget.item.name} <span className="text-gray-400">x{cancelItemTarget.item.quantity}</span>
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The item will remain visible and update the POS immediately.</p>
              </div>
              <button
                type="button"
                disabled={isCancellingItem}
                onClick={() => setCancelItemTarget(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Close cancellation dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Quick reason (optional)</label>
              <CancellationReasonQuickSelect
                reasons={DEFAULT_KDS_CANCELLATION_REASONS}
                selectedReason={cancelReason}
                onChange={reason => {
                  setCancelReason(reason);
                  if (reason) setCustomCancelReason('');
                }}
                disabled={isCancellingItem}
              />
            </div>

            <div className="mt-5">
              <label htmlFor="kds-custom-cancel-reason" className="mb-2 block text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Custom reason (optional)</label>
              <textarea
                id="kds-custom-cancel-reason"
                value={customCancelReason}
                onChange={event => {
                  const nextReason = event.target.value.slice(0, 250);
                  setCustomCancelReason(nextReason);
                  if (nextReason.trim()) setCancelReason(undefined);
                }}
                disabled={isCancellingItem}
                rows={3}
                maxLength={250}
                placeholder="Add a note for POS staff..."
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-red-600 dark:focus:ring-red-900/30"
              />
              <p className="mt-1 text-right text-[9px] font-bold text-gray-400">{customCancelReason.length}/250</p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={isCancellingItem}
                onClick={() => setCancelItemTarget(null)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-xs font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Keep item
              </button>
              <button
                type="submit"
                disabled={isCancellingItem}
                className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isCancellingItem ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                {isCancellingItem ? 'Cancelling...' : 'Cancel item'}
              </button>
            </div>
          </form>
        </div>
      )}


      {showNewOrderAlert && (
        <div className="fixed right-4 top-4 z-50">
          <div className="flex items-center gap-4 rounded-2xl bg-orange-500 px-6 py-4 text-white shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Coffee size={20} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-tight">{kitchenAlertLabel}</p>
              <p className="text-[10px] font-bold opacity-80">Check the latest kitchen instructions</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KitchenDisplayPage;
