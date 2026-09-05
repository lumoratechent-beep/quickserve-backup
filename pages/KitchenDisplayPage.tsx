import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCheck, CheckCircle, ChevronLeft, ChevronRight, Clock, Coffee, Loader2, LogOut, Mail, Maximize2, MessageSquare, Minimize2, Moon, MoreHorizontal, Printer, RefreshCw, Settings, ShoppingBag, Sun, Trash2, X } from 'lucide-react';
import { CartItem, KitchenDepartment, Order, OrderStatus, Restaurant, Subscription } from '../src/types';
import { supabase } from '../lib/supabase';
import { toast } from '../components/Toast';
import printerService, { DEFAULT_KITCHEN_TICKET_CONFIG, KitchenTicketConfig, SavedPrinter } from '../services/printerService';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  userKitchenCategories?: string[];
  isOnline?: boolean;
  lastSyncTime?: Date;
  subscription?: Subscription | null;
  onUpdateOrder: (orderId: string, status: OrderStatus) => void | Promise<void>;
  onUpdateOrderItems?: (orderId: string, items: CartItem[], total: number) => void;
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

const getItemKitchenStatus = (item: CartItem, fallbackStatus: OrderStatus): OrderStatus => item.status || fallbackStatus;

const getAggregateStatusFromItems = (items: CartItem[], fallbackStatus: OrderStatus): OrderStatus => {
  const activeItems = items.filter(item => getItemKitchenStatus(item, fallbackStatus) !== OrderStatus.CANCELLED);
  if (items.length > 0 && activeItems.length === 0) return OrderStatus.CANCELLED;
  if (activeItems.some(item => {
    const status = getItemKitchenStatus(item, fallbackStatus);
    return status === OrderStatus.PREPARING || status === OrderStatus.SERVED || status === OrderStatus.COMPLETED;
  })) return OrderStatus.PREPARING;
  if (fallbackStatus === OrderStatus.PREPARING) return OrderStatus.PREPARING;
  if (activeItems.some(item => getItemKitchenStatus(item, fallbackStatus) === OrderStatus.ONGOING)) return OrderStatus.ONGOING;
  if (activeItems.some(item => getItemKitchenStatus(item, fallbackStatus) === OrderStatus.PENDING)) return OrderStatus.PENDING;
  return fallbackStatus;
};

const areAllKitchenItemsCooked = (items: CartItem[], fallbackStatus: OrderStatus): boolean => {
  const activeItems = items.filter(item => getItemKitchenStatus(item, fallbackStatus) !== OrderStatus.CANCELLED);
  return activeItems.length > 0 && activeItems.every(item => {
    const status = getItemKitchenStatus(item, fallbackStatus);
    return status === OrderStatus.SERVED || status === OrderStatus.COMPLETED;
  });
};

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

const KitchenDisplayPage: React.FC<Props> = ({
  restaurant,
  orders,
  userKitchenCategories,
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
  const [printerConnected, setPrinterConnected] = useState(false);
  const [isConnectingPrinter, setIsConnectingPrinter] = useState(false);
  const [printingKitchenOrderId, setPrintingKitchenOrderId] = useState<string | null>(null);
  const [showMailPanel, setShowMailPanel] = useState(false);
  const [openItemMenuKey, setOpenItemMenuKey] = useState<string | null>(null);
  const [updatingItemKeys, setUpdatingItemKeys] = useState<Set<string>>(new Set());
  const [currentKitchenPage, setCurrentKitchenPage] = useState(1);
  const [ticketColumns, setTicketColumns] = useState<3 | 4 | 5>(() => {
    const saved = Number(localStorage.getItem(`kds_tickets_per_page_${restaurant.id}`));
    return saved === 3 || saved === 5 ? saved : 4;
  });
  const [ticketFontSize, setTicketFontSize] = useState<'SMALL' | 'MEDIUM' | 'LARGE'>(() => {
    const saved = localStorage.getItem(`kds_font_size_${restaurant.id}`);
    return saved === 'SMALL' || saved === 'LARGE' ? saved : 'MEDIUM';
  });
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [serveOrderId, setServeOrderId] = useState<string | null>(null);
  const [isServingOrder, setIsServingOrder] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [displaySettingsSection, setDisplaySettingsSection] = useState<'APPEARANCE' | 'VERSION'>('APPEARANCE');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const kitchenPreviousPendingIds = useRef<Set<string> | null>(null);
  const autoPrintSeenOrderIds = useRef<Set<string> | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const kitchenEnabled = subscription?.plan_id === 'pro_plus' && restaurant.settings?.features?.kitchenEnabled === true;
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

  const savedPrinters = useMemo<SavedPrinter[]>(() => {
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
  }, [restaurant.id, restaurant.settings?.printers]);

  const kitchenTicketConfig = useMemo<KitchenTicketConfig>(() => {
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
  }, [restaurant.id, restaurant.settings?.kitchenTicket]);

  const activeKitchenPrinter = useMemo(() => {
    const kitchenPrinters = savedPrinters.filter(printer => printer.printJobs?.includes('kitchen'));
    if (kitchenPrinters.length === 0) return null;
    if (!kitchenHasAssignedScope) return kitchenPrinters[0];

    return kitchenPrinters.find(printer => {
      const departmentMatch = printer.departmentId
        && kitchenAssignedScopes.some(scope => getKitchenCategoryKey(scope) === getKitchenCategoryKey(printer.departmentId));
      const categoryMatch = printer.kitchenCategories?.some(category =>
        kitchenScopeCategoryKeys.includes(getKitchenCategoryKey(category))
      );
      return Boolean(departmentMatch || categoryMatch);
    }) || kitchenPrinters[0];
  }, [savedPrinters, kitchenHasAssignedScope, kitchenAssignedScopes, kitchenScopeCategoryKeys]);

  const isKitchenItemInActionScope = (item: CartItem): boolean => {
    if (!kitchenHasAssignedScope) return true;
    if (kitchenScopeCategoryKeys.length === 0) return false;
    return kitchenScopeCategoryKeys.includes(getKitchenCategoryKey(item.category));
  };

  const getSortedOrderItems = (order: Order, scopedCategories: string[] = []) => {
    const scopedCategoryKeys = scopedCategories.map(getKitchenCategoryKey).filter(Boolean);
    return order.items
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

  const kitchenVisibleOrders = useMemo(() => (
    kitchenFilteredOrders.filter(order => {
      const scopedItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
      const isActiveOrder = order.status === OrderStatus.PENDING
        || order.status === OrderStatus.ONGOING
        || order.status === OrderStatus.PREPARING;
      if (scopedItems.length === 0) return false;
      if (kitchenOrderFilter === 'ALL') return true;
      if (kitchenOrderFilter === 'ONGOING_ALL') {
        return isActiveOrder && !areAllKitchenItemsCooked(scopedItems, order.status);
      }
      if (kitchenOrderFilter === 'COOKED') return isActiveOrder && areAllKitchenItemsCooked(scopedItems, order.status);
      if (kitchenOrderFilter === OrderStatus.SERVED) return order.status === OrderStatus.SERVED;
      return scopedItems.some(item => getItemKitchenStatus(item, order.status) === kitchenOrderFilter);
    }).sort((a, b) => a.timestamp - b.timestamp)
  ), [kitchenFilteredOrders, kitchenOrderFilter, kitchenHasAssignedScope, kitchenScopeCategories]);

  const kitchenPageCount = Math.max(1, Math.ceil(kitchenVisibleOrders.length / ticketColumns));
  const pagedKitchenOrders = kitchenVisibleOrders.slice(
    (currentKitchenPage - 1) * ticketColumns,
    currentKitchenPage * ticketColumns,
  );
  const serveOrderCandidate = serveOrderId ? orders.find(order => order.id === serveOrderId) || null : null;
  const serveOrderItems = serveOrderCandidate
    ? getSortedOrderItems(serveOrderCandidate, kitchenHasAssignedScope ? kitchenScopeCategories : [])
    : [];
  const serveOrder = serveOrderCandidate
    && serveOrderCandidate.status !== OrderStatus.SERVED
    && areAllKitchenItemsCooked(serveOrderItems, serveOrderCandidate.status)
      ? serveOrderCandidate
      : null;
  const ticketGridClass = ticketColumns === 3
    ? 'md:grid-cols-3'
    : ticketColumns === 5
      ? 'md:grid-cols-5'
      : 'md:grid-cols-4';
  const ticketItemNameClass = ticketFontSize === 'SMALL'
    ? 'text-[10px] leading-4'
    : ticketFontSize === 'LARGE'
      ? 'text-sm leading-5'
      : 'text-xs leading-[18px]';
  const ticketItemDetailClass = ticketFontSize === 'SMALL' ? 'text-[8px]' : ticketFontSize === 'LARGE' ? 'text-xs' : 'text-[10px]';
  const ticketTitleClass = ticketFontSize === 'SMALL' ? 'text-base' : ticketFontSize === 'LARGE' ? 'text-xl' : 'text-lg';
  const ticketMetaClass = ticketFontSize === 'SMALL' ? 'text-[9px]' : ticketFontSize === 'LARGE' ? 'text-xs' : 'text-[10px]';

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

  const triggerNewOrderAlert = () => {
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtor();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      console.warn('Audio Context failed');
    }
    setShowNewOrderAlert(true);
    window.setTimeout(() => setShowNewOrderAlert(false), 5000);
  };

  const configureNetworkPrinter = (printer: SavedPrinter): boolean => {
    if (printer.connectionType !== 'wifi' || !printer.printServerUrl?.trim() || !printer.ipAddress?.trim()) {
      return false;
    }
    printerService.setActiveNetworkPrinter({
      printServerUrl: printer.printServerUrl,
      printerIp: printer.ipAddress,
      printerPort: printer.printerPort || 9100,
    });
    return true;
  };

  const refreshPrinterStatus = () => {
    setPrinterConnected(printerService.getConnectionStatus().connected);
  };

  const connectKitchenPrinter = async () => {
    if (!activeKitchenPrinter) {
      toast('No kitchen printer is assigned. Add one in POS Settings.', 'warning');
      return;
    }

    setIsConnectingPrinter(true);
    try {
      if (configureNetworkPrinter(activeKitchenPrinter)) {
        refreshPrinterStatus();
        toast('Kitchen printer is ready.', 'success');
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
      toast(connected ? 'Kitchen printer connected.' : 'Unable to connect kitchen printer.', connected ? 'success' : 'error');
    } catch (error) {
      console.error('Kitchen printer connection error:', error);
      refreshPrinterStatus();
      toast('Unable to connect kitchen printer.', 'error');
    } finally {
      setIsConnectingPrinter(false);
    }
  };

  const printKitchenOrder = async (order: Order, notify = true) => {
    if (!activeKitchenPrinter) {
      if (notify) toast('No kitchen printer is assigned. Add one in POS Settings.', 'warning');
      return false;
    }

    configureNetworkPrinter(activeKitchenPrinter);
    setPrintingKitchenOrderId(order.id);
    try {
      const { data: freshOrder, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order.id)
        .single();

      if (error || !freshOrder) throw error || new Error('Order not found');

      const freshItems: CartItem[] = Array.isArray(freshOrder.items)
        ? freshOrder.items
        : typeof freshOrder.items === 'string'
          ? JSON.parse(freshOrder.items)
          : [];
      const scopedItems = freshItems.filter(isKitchenItemInActionScope);
      if (scopedItems.length === 0) return false;

      const printableOrder = {
        id: freshOrder.id,
        tableNumber: freshOrder.table_number,
        timestamp: freshOrder.timestamp,
        items: scopedItems,
        remark: freshOrder.remark || '',
      };
      const copyCount = Math.max(1, activeKitchenPrinter.numberOfCopies || kitchenTicketConfig.numberOfCopies || 1);
      let printed = true;
      for (let copy = 0; copy < copyCount; copy += 1) {
        printed = await printerService.printKitchenTicket(
          printableOrder,
          restaurant,
          kitchenTicketConfig,
          activeKitchenPrinter.paperSize || '58mm',
        ) && printed;
      }

      refreshPrinterStatus();
      if (notify) toast(printed ? 'Kitchen ticket printed.' : 'Kitchen ticket failed to print.', printed ? 'success' : 'error');
      return printed;
    } catch (error) {
      console.error('Kitchen ticket print error:', error);
      refreshPrinterStatus();
      if (notify) toast('Kitchen ticket failed to print.', 'error');
      return false;
    } finally {
      setPrintingKitchenOrderId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initializePrinter = async () => {
      if (!activeKitchenPrinter) {
        if (!cancelled) setPrinterConnected(false);
        return;
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

  const updateKitchenSingleItemStatus = async (
    order: Order,
    targetItem: CartItem,
    itemKey: string,
    nextStatus: OrderStatus,
  ) => {
    const targetIndex = order.items.indexOf(targetItem);
    if (targetIndex < 0 || updatingItemKeys.has(itemKey)) return;

    setUpdatingItemKeys(previous => new Set(previous).add(itemKey));
    setOpenItemMenuKey(null);
    try {
      const transitionAt = Date.now();
      const updatedItems = order.items.map((item, index) => {
        if (index !== targetIndex) return item;
        return {
          ...item,
          status: nextStatus,
          ...(nextStatus === OrderStatus.PREPARING
            ? { kitchenStartedAt: item.kitchenStartedAt || transitionAt, kitchenCookedAt: undefined }
            : {}),
          ...(nextStatus === OrderStatus.COMPLETED ? { kitchenCookedAt: transitionAt } : {}),
        };
      });
      const aggregateStatus = getAggregateStatusFromItems(updatedItems, order.status);
      const previousCancelledValue = order.items.reduce((sum, item) => (
        getItemKitchenStatus(item, order.status) === OrderStatus.CANCELLED
          ? sum + (Number(item.price || 0) * Number(item.quantity || 0))
          : sum
      ), 0);
      const updatedCancelledValue = updatedItems.reduce((sum, item) => (
        getItemKitchenStatus(item, aggregateStatus) === OrderStatus.CANCELLED
          ? sum + (Number(item.price || 0) * Number(item.quantity || 0))
          : sum
      ), 0);
      const updatedTotal = Math.max(0, order.total + previousCancelledValue - updatedCancelledValue);
      const { error } = await supabase
        .from('orders')
        .update({ items: updatedItems, status: aggregateStatus, total: updatedTotal })
        .eq('id', order.id);

      if (error) throw error;
      onUpdateOrderItems?.(order.id, updatedItems, updatedTotal);
      await onUpdateOrder(order.id, aggregateStatus);
    } catch (error) {
      console.error('Kitchen item status update error:', error);
      toast('Unable to update this food item.', 'error');
    } finally {
      setUpdatingItemKeys(previous => {
        const next = new Set(previous);
        next.delete(itemKey);
        return next;
      });
    }
  };

  const advanceKitchenItemStatus = (order: Order, item: CartItem, itemKey: string) => {
    const nextStatus = getNextKitchenItemStatus(getItemKitchenStatus(item, order.status));
    if (nextStatus) void updateKitchenSingleItemStatus(order, item, itemKey, nextStatus);
  };

  const serveKitchenOrder = async (order: Order) => {
    const scopedItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
    if (isServingOrder || order.status === OrderStatus.SERVED || !areAllKitchenItemsCooked(scopedItems, order.status)) return;
    setIsServingOrder(true);
    try {
      const servedItems = order.items.map(item => (
        getItemKitchenStatus(item, order.status) === OrderStatus.CANCELLED
          ? item
          : { ...item, status: OrderStatus.SERVED }
      ));
      const { error } = await supabase
        .from('orders')
        .update({ items: servedItems, status: OrderStatus.SERVED })
        .eq('id', order.id);
      if (error) throw error;

      onUpdateOrderItems?.(order.id, servedItems, order.total);
      await onUpdateOrder(order.id, OrderStatus.SERVED);
      setServeOrderId(null);
      toast(`Order #${order.id} served.`, 'success');
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

  useEffect(() => {
    const pendingOrderIds = new Set(kitchenPendingOrders.map(order => order.id));
    if (autoPrintSeenOrderIds.current === null) {
      autoPrintSeenOrderIds.current = pendingOrderIds;
      return;
    }

    const newPendingOrders = kitchenPendingOrders.filter(order => !autoPrintSeenOrderIds.current?.has(order.id));
    autoPrintSeenOrderIds.current = pendingOrderIds;
    if (!kitchenEnabled || !kitchenTicketConfig.autoPrintOnNewOrder || !printerConnected) return;

    newPendingOrders.forEach(order => {
      void printKitchenOrder(order, false).then(printed => {
        if (!printed) toast(`Auto-print failed for order #${order.id}.`, 'error');
      });
    });
  }, [kitchenPendingOrders, kitchenEnabled, kitchenTicketConfig.autoPrintOnNewOrder, printerConnected]);

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
    setCurrentKitchenPage(current => Math.min(current, kitchenPageCount));
  }, [kitchenPageCount]);

  useEffect(() => {
    localStorage.setItem(`kds_tickets_per_page_${restaurant.id}`, String(ticketColumns));
  }, [restaurant.id, ticketColumns]);

  useEffect(() => {
    localStorage.setItem(`kds_font_size_${restaurant.id}`, ticketFontSize);
  }, [restaurant.id, ticketFontSize]);

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
    setCurrentKitchenPage(page => deltaX < 0
      ? Math.min(kitchenPageCount, page + 1)
      : Math.max(1, page - 1));
  };

  if (!kitchenEnabled) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-gray-50 p-6 text-center dark:bg-gray-900">
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

  return (
    <div className="flex h-[100dvh] w-full min-h-0 flex-col bg-[#000000] text-gray-900 dark:bg-[#000000] dark:text-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img src={isDarkMode ? '/LOGO/9-dark.png' : '/LOGO/9.png'} alt="QuickServe" className="h-7 w-auto shrink-0" />
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="flex h-8 items-center gap-0.5 rounded-full bg-gray-100/80 px-1 dark:bg-gray-700/70">
            <button
              onClick={() => void connectKitchenPrinter()}
              disabled={isConnectingPrinter}
              className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-70 ${printerConnected ? 'text-green-600 hover:bg-white dark:text-green-400 dark:hover:bg-gray-600' : 'text-red-600 hover:bg-white dark:text-red-400 dark:hover:bg-gray-600'}`}
              title={activeKitchenPrinter ? `${activeKitchenPrinter.name}: ${printerConnected ? 'ready' : 'connect'}` : 'Set up a kitchen printer in POS Settings'}
              aria-label={printerConnected ? 'Printer ready' : 'Printer disconnected'}
            >
              {isConnectingPrinter ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
            </button>
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
              <div className={`flex h-7 w-8 items-center justify-center rounded-full ${batteryMeta.color}`} title={batteryMeta.label} aria-label={batteryMeta.label}>
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
        className="min-h-0 flex-1 touch-pan-y overflow-hidden bg-[#000000] p-1.5 dark:bg-[#000000]"
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
          <div className={`grid h-full grid-cols-1 gap-1.5 sm:grid-cols-2 ${ticketGridClass}`}>
            {pagedKitchenOrders.map(order => {
              const visibleKitchenItems = getSortedOrderItems(order, kitchenHasAssignedScope ? kitchenScopeCategories : []);
              const isExpanded = expandedOrderId === order.id;
              const allItemsCooked = areAllKitchenItemsCooked(visibleKitchenItems, order.status);
              const canServeOrder = allItemsCooked && (
                order.status === OrderStatus.PENDING
                || order.status === OrderStatus.ONGOING
                || order.status === OrderStatus.PREPARING
              );

              return (
                <article
                  key={order.id}
                  onClick={() => canServeOrder && setServeOrderId(order.id)}
                  className={`flex min-h-0 flex-col overflow-hidden rounded-lg bg-white text-gray-900 shadow-sm dark:bg-white ${canServeOrder ? 'cursor-pointer ring-2 ring-inset ring-green-500 hover:ring-green-400' : ''} ${isExpanded ? 'fixed inset-3 z-[90]' : 'h-full'}`}
                >
                  <div className="shrink-0 border-b border-gray-300 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className={`truncate font-black tracking-tight ${ticketTitleClass}`}>{order.tableNumber || 'Takeaway'}</h2>
                      <span className="shrink-0 rounded-lg bg-red-500 px-3 py-1 text-[10px] font-black tabular-nums text-white">
                        {formatCookingStopwatch(order, visibleKitchenItems)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <div className={`min-w-0 font-semibold leading-tight ${ticketMetaClass}`}>
                        <p>{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                        <p className="truncate text-gray-500">#{order.id}</p>
                      </div>
                      <div className={`shrink-0 text-right font-semibold leading-tight ${ticketMetaClass}`}>
                        <p>{order.diningType || (order.orderSource === 'online' ? 'Delivery' : 'Dine in')}</p>
                        <p>{visibleKitchenItems.length} item{visibleKitchenItems.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {visibleKitchenItems.map((item, idx) => {
                      const itemKey = `${order.id}-${item.category || 'item'}-${item.id}-${idx}`;
                      const itemStatus = getItemKitchenStatus(item, order.status);
                      const nextItemStatus = getNextKitchenItemStatus(itemStatus);
                      const isUpdatingItem = updatingItemKeys.has(itemKey);
                      const isItemMenuOpen = openItemMenuKey === itemKey;
                      const isServedItem = itemStatus === OrderStatus.SERVED && order.status === OrderStatus.SERVED;
                      const isCookedItem = itemStatus === OrderStatus.COMPLETED || (itemStatus === OrderStatus.SERVED && order.status !== OrderStatus.SERVED);
                      const rowStateClass = itemStatus === OrderStatus.PREPARING
                        ? 'bg-blue-50'
                        : isServedItem
                          ? 'bg-green-50 text-green-700'
                          : isCookedItem
                          ? 'bg-gray-200 text-gray-400'
                          : itemStatus === OrderStatus.CANCELLED
                            ? 'bg-red-50 opacity-55'
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
                          className={`relative flex min-h-9 items-start gap-2 rounded-md px-2 py-1.5 transition-colors ${nextItemStatus && !isUpdatingItem ? 'cursor-pointer' : 'cursor-default'} ${rowStateClass}`}
                          aria-label={nextItemStatus ? `${item.name}: mark ${getKitchenStatusText(nextItemStatus)}` : `${item.name}: ${getKitchenStatusText(itemStatus)}`}
                        >
                          <span className="w-4 shrink-0 pt-0.5 text-[10px] font-semibold text-gray-500">{item.quantity}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate font-bold ${ticketItemNameClass} ${itemStatus === OrderStatus.CANCELLED ? 'line-through text-red-500' : ''}`}>{item.name}</p>
                            {(item.selectedSize || item.selectedTemp || item.selectedOtherVariant || item.selectedMixMatch?.some(mix => mix.choice)) && (
                              <p className={`truncate font-semibold leading-4 text-red-400 ${ticketItemDetailClass}`}>
                                {[item.selectedSize, item.selectedTemp, item.selectedOtherVariant, ...(item.selectedMixMatch || []).map(mix => mix.choice)].filter(Boolean).join(' / ')}
                              </p>
                            )}
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
                            {order.status !== OrderStatus.SERVED && (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  setOpenItemMenuKey(current => current === itemKey ? null : itemKey);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-white hover:text-gray-700"
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
                                onClick={() => void updateKitchenSingleItemStatus(order, item, itemKey, OrderStatus.CANCELLED)}
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

                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      setExpandedOrderId(isExpanded ? null : order.id);
                    }}
                    className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-gray-200 text-xs font-bold text-blue-500 hover:bg-blue-50"
                  >
                    {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    {isExpanded ? 'collapse' : 'expand'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="relative grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-[#2c2c2e] px-2 text-white sm:px-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="shrink-0 text-sm font-bold">{kitchenVisibleOrders.length} orders</span>
          <button onClick={() => { setKitchenOrderFilter('ONGOING_ALL'); setCurrentKitchenPage(1); }} className={`hidden items-center gap-1 text-[9px] sm:flex ${kitchenOrderFilter === 'ONGOING_ALL' ? 'text-white' : 'text-gray-400'}`}>
            <Clock size={11} />
            Cooking
          </button>
          <button onClick={() => { setKitchenOrderFilter('COOKED'); setCurrentKitchenPage(1); }} className={`hidden items-center gap-1 text-[9px] sm:flex ${kitchenOrderFilter === 'COOKED' ? 'text-white' : 'text-gray-400'}`}>
            <CheckCircle size={11} />
            Cooked
          </button>
          <button onClick={() => { setKitchenOrderFilter(OrderStatus.SERVED); setCurrentKitchenPage(1); }} className={`hidden items-center gap-1 text-[9px] sm:flex ${kitchenOrderFilter === OrderStatus.SERVED ? 'text-white' : 'text-gray-400'}`}>
            <CheckCircle className="text-green-500" fill="currentColor" size={11} />
            Served
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentKitchenPage(page => Math.max(1, page - 1))}
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
                onClick={() => setCurrentKitchenPage(page)}
                className={`h-8 min-w-8 rounded-md px-2 text-[10px] font-bold ${currentKitchenPage === page ? 'bg-blue-500 text-white' : 'bg-white/20 text-gray-200'}`}
              >
                {page}
              </button>
            ))}
          <button
            onClick={() => setCurrentKitchenPage(page => Math.min(kitchenPageCount, page + 1))}
            disabled={currentKitchenPage === kitchenPageCount}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-300 disabled:opacity-30"
            title="Next page"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="relative flex items-center justify-end gap-2">
          <time className="hidden whitespace-nowrap text-right text-[9px] font-semibold leading-tight text-gray-300 sm:block">
            {new Date(clockNow).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            <span className="ml-2 tabular-nums text-white">{new Date(clockNow).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </time>
          <button onClick={() => { setDisplaySettingsSection('APPEARANCE'); setShowDisplaySettings(true); }} className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-200 hover:bg-white/20" title="Display settings">
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
                  Appearance
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
                <h2 className="text-2xl font-semibold">Appearance</h2>

                <div className="mt-8 border-b border-white/20 pb-8">
                  <p className="text-base font-medium">Tickets per page</p>
                  <div className="mt-4 inline-grid grid-cols-3 overflow-hidden rounded-md border border-white/40">
                    {([3, 4, 5] as const).map(columns => (
                      <button
                        key={columns}
                        type="button"
                        onClick={() => { setTicketColumns(columns); setCurrentKitchenPage(1); }}
                        className={`h-12 min-w-20 border-r border-white/30 px-5 text-sm font-bold last:border-r-0 ${ticketColumns === columns ? 'bg-blue-600 text-white' : 'bg-black text-gray-300 hover:bg-white/10'}`}
                      >
                        {columns}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-b border-white/20 py-8">
                  <p className="text-base font-medium">Font size</p>
                  <div className="mt-4 inline-grid grid-cols-3 overflow-hidden rounded-md border border-white/40">
                    {(['SMALL', 'MEDIUM', 'LARGE'] as const).map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setTicketFontSize(size)}
                        className={`h-12 min-w-24 border-r border-white/30 px-5 text-sm font-bold capitalize last:border-r-0 ${ticketFontSize === size ? 'bg-blue-600 text-white' : 'bg-black text-gray-300 hover:bg-white/10'}`}
                      >
                        {size.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
              ) : (
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold">Version Info</h2>
                  <div className="mt-8 border-b border-white/20 pb-8">
                    <p className="text-base text-gray-300">Version v1.0.5</p>
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


      {showNewOrderAlert && (
        <div className="fixed right-4 top-4 z-50">
          <div className="flex items-center gap-4 rounded-2xl bg-orange-500 px-6 py-4 text-white shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <Coffee size={20} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-tight">New Order!</p>
              <p className="text-[10px] font-bold opacity-80">A new order has arrived in the kitchen</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KitchenDisplayPage;
