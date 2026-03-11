// pages/PosView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters } from '../src/types';
import { supabase } from '../lib/supabase';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions } from '../services/printerService';
import StandardReport from '../components/StandardReport';
import ItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';
import {
  ShoppingBag, Search, Filter, Download, Calendar, ChevronLeft, ChevronRight,
  Printer, QrCode, CreditCard, Banknote, User, Trash2, Plus, Minus, LayoutGrid,
  List, Clock, CheckCircle2, AlertCircle, RefreshCw, BarChart3, Receipt, Hash,
  Settings2, Menu, Wifi, WifiOff, ExternalLink, X, ChevronFirst, ChevronLast,
  Coffee, BookOpen, BarChart, QrCode as QrCodeIcon, Settings, ChevronUp,
  Users, UserPlus, Bluetooth, BluetoothConnected, Tag, Layers, ChevronDown, RotateCw, Network, Type,
  RotateCcw
} from 'lucide-react';

interface ReceiptSettings {
  businessName: string;
  headerLine1: string;
  headerLine2: string;
  showDateTime: boolean;
  showOrderId: boolean;
  showTableNumber: boolean;
  showItems: boolean;
  showRemark: boolean;
  showTotal: boolean;
  showTaxes: boolean;
  footerLine1: string;
  footerLine2: string;
}

const getDefaultReceiptSettings = (restaurantName: string): ReceiptSettings => ({
  businessName: restaurantName,
  headerLine1: '',
  headerLine2: '',
  showDateTime: true,
  showOrderId: true,
  showTableNumber: true,
  showItems: true,
  showRemark: true,
  showTotal: true,
  showTaxes: false,
  footerLine1: 'Thank you!',
  footerLine2: 'Please come again',
});

const PRINTER_MODELS = [
  'Epson TM-T20III',
  'Epson TM-T88VI',
  'Epson TM-M30II',
  'Star TSP143IV',
  'Star mC-Print3',
  'Star SM-L200',
  'BIXOLON SRP-350III',
  'BIXOLON SPP-R310',
  'Citizen CT-E651',
  'CX58D Thermal',
  'POS-5890K',
  'XP-58IIH',
  'Other',
];

interface SavedPrinter {
  id: string;
  name: string;
  model: string;
  connectionType: 'bluetooth' | 'ethernet';
  ipAddress?: string;
  paperWidth: number;
  advancedSettings: {
    printMode: string;
    printWidth: number;
    printResolution: string;
    initCommands: string;
    cutterCommands: string;
    drawerCommands: string;
  };
  deviceId?: string;
  deviceName?: string;
}

interface FeatureSettings {
  autoPrintReceipt: boolean;
  autoOpenDrawer: boolean;
  dineInEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  customerDisplayEnabled: boolean;
}

const getDefaultFeatureSettings = (): FeatureSettings => ({
  autoPrintReceipt: false,
  autoOpenDrawer: false,
  dineInEnabled: false,
  takeawayEnabled: false,
  deliveryEnabled: false,
  customerDisplayEnabled: false,
});

interface PaymentType {
  id: string;
  name: string;
}

const getDefaultPaymentTypes = (): PaymentType[] => [
  { id: 'cash', name: 'CASH' },
  { id: 'qr', name: 'QR' },
];

interface TaxEntry {
  id: string;
  name: string;
  percentage: number;
  applyToItems: boolean;
}

type SettingsPanel = null | 'features' | 'printer' | 'receipt' | 'payment' | 'taxes' | 'staff' | 'ux' | 'kitchen';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string, paymentMethod?: string, cashierName?: string, amountReceived?: number) => Promise<string>; // Returns order ID
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  onUpdateRestaurantSettings?: (restaurantId: string, settings: any) => Promise<void>;
  onSwitchToVendor?: () => void;
  isOnline?: boolean;
  pendingOfflineOrdersCount?: number;
  cashierName?: string;
}

const PosView: React.FC<Props> = ({
  restaurant,
  orders,
  onUpdateOrder,
  onPlaceOrder,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  onUpdateRestaurantSettings,
  onSwitchToVendor,
  isOnline = true,
  pendingOfflineOrdersCount = 0,
  cashierName
}) => {
  const [activeTab, setActiveTab] = useState<'COUNTER' | 'QR_ORDERS' | 'REPORTS' | 'QR_GEN' | 'SETTINGS'>('COUNTER');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'list'>('grid-5');
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posRemark, setPosRemark] = useState('');
  const [posTableNo, setPosTableNo] = useState('Counter');
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedItemForOptions, setSelectedItemForOptions] = useState<MenuItem | null>(null);

  // QR Orders State
  const [qrOrderSearch, setQrOrderSearch] = useState('');
  const [selectedQrOrder, setSelectedQrOrder] = useState<Order | null>(null);
  const [isOrderSummaryOpen, setIsOrderSummaryOpen] = useState(false);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);

  // Counter Orders Cache State
  const [cachedCounterOrders, setCachedCounterOrders] = useState<Order[]>(() => {
    return counterOrdersCache.getCachedCounterOrders(restaurant.id);
  });
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCashAmount, setSelectedCashAmount] = useState<number | null>(null);
  const [cashAmountInput, setCashAmountInput] = useState<string>('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('');
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [selectedReportOrder, setSelectedReportOrder] = useState<Order | null>(null);
  const [reportsSubMenu, setReportsSubMenu] = useState<'salesReport' | 'statistics'>('salesReport');
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [realPrinterConnected, setRealPrinterConnected] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);

  const CASH_DENOMINATIONS = [10, 20, 50, 100];

  const CURRENCY_OPTIONS = [
    { code: 'MYR', symbol: 'RM', label: 'Ringgit Malaysia (RM)' },
    { code: 'USD', symbol: '$', label: 'US Dollar ($)' },
    { code: 'EUR', symbol: '€', label: 'Euro (€)' },
    { code: 'GBP', symbol: '£', label: 'British Pound (£)' },
    { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar (S$)' },
    { code: 'IDR', symbol: 'Rp', label: 'Indonesian Rupiah (Rp)' },
    { code: 'THB', symbol: '฿', label: 'Thai Baht (฿)' },
    { code: 'PHP', symbol: '₱', label: 'Philippine Peso (₱)' },
    { code: 'VND', symbol: '₫', label: 'Vietnamese Dong (₫)' },
    { code: 'JPY', symbol: '¥', label: 'Japanese Yen (¥)' },
    { code: 'KRW', symbol: '₩', label: 'Korean Won (₩)' },
    { code: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
    { code: 'AUD', symbol: 'A$', label: 'Australian Dollar (A$)' },
    { code: 'CNY', symbol: '¥', label: 'Chinese Yuan (¥)' },
    { code: 'TWD', symbol: 'NT$', label: 'Taiwan Dollar (NT$)' },
    { code: 'BND', symbol: 'B$', label: 'Brunei Dollar (B$)' },
  ];
  const [userCurrency, setUserCurrency] = useState<string>(() => localStorage.getItem(`ux_currency_${restaurant.id}`) || 'MYR');
  const currencySymbol = CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.symbol || 'RM';

  // Reports State
  const [reportStart, setReportStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [reportStatus, setReportStatus] = useState<string>('ALL');
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);

  // Printer Settings State
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState('');
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => getDefaultReceiptSettings(restaurant.name));
  const [isSavingReceiptSettings, setIsSavingReceiptSettings] = useState(false);
  const [receiptSettingsSaved, setReceiptSettingsSaved] = useState(false);
  const [receiptAccordion, setReceiptAccordion] = useState({ content: true, fields: false });

  // Staff Management State
  const [staffList, setStaffList] = useState<any[]>(() => {
    const saved = localStorage.getItem(`staff_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);

  // User Experience settings
  const FONT_OPTIONS = ['Inter', 'Roboto', 'Poppins', 'Open Sans', 'Lato', 'Nunito', 'Montserrat', 'Raleway'];
  const [userFont, setUserFont] = useState<string>(() => localStorage.getItem(`ux_font_${restaurant.id}`) || 'Inter');

  // Settings panel navigation
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('features');

  // Feature settings
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>(() => {
    const saved = localStorage.getItem(`features_${restaurant.id}`);
    return saved ? JSON.parse(saved) : getDefaultFeatureSettings();
  });

  // Payment types
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>(() => {
    const saved = localStorage.getItem(`payment_types_${restaurant.id}`);
    return saved ? JSON.parse(saved) : getDefaultPaymentTypes();
  });
  const [newPaymentTypeName, setNewPaymentTypeName] = useState('');

  // Tax entries
  const [taxEntries, setTaxEntries] = useState<TaxEntry[]>(() => {
    const saved = localStorage.getItem(`taxes_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxPercentage, setNewTaxPercentage] = useState('');
  const [newTaxApplyToItems, setNewTaxApplyToItems] = useState(false);

  // Saved printers list
  const [savedPrinters, setSavedPrinters] = useState<SavedPrinter[]>(() => {
    const saved = localStorage.getItem(`printers_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Add printer form state
  const [isAddPrinterOpen, setIsAddPrinterOpen] = useState(false);
  const [newPrinterName, setNewPrinterName] = useState('');
  const [newPrinterModel, setNewPrinterModel] = useState('');
  const [newPrinterConnectionType, setNewPrinterConnectionType] = useState<'bluetooth' | 'ethernet'>('bluetooth');
  const [newPrinterIpAddress, setNewPrinterIpAddress] = useState('');
  const [newPrinterPaperWidth, setNewPrinterPaperWidth] = useState(58);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [newPrinterAdvanced, setNewPrinterAdvanced] = useState({
    printMode: 'Standard',
    printWidth: 384,
    printResolution: '203 DPI',
    initCommands: '',
    cutterCommands: '',
    drawerCommands: '',
  });

  const categories = useMemo(() => {
    const cats = new Set(restaurant.menu.map(item => item.category));
    return ['ALL', ...Array.from(cats)];
  }, [restaurant.menu]);

  const filteredMenu = useMemo(() => {
    return restaurant.menu.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(menuSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      return matchesSearch && matchesCategory && !item.isArchived;
    });
  }, [restaurant.menu, menuSearch, selectedCategory]);

  const groupedMenu = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    const cats = selectedCategory === 'ALL' ? categories.filter(c => c !== 'ALL') : [selectedCategory];
    
    cats.forEach(cat => {
      const items = filteredMenu.filter(i => i.category === cat);
      if (items.length > 0) groups[cat] = items;
    });
    return groups;
  }, [filteredMenu, selectedCategory, categories]);

  const areSameCartOptions = (first: CartItem, second: CartItem) => {
    const normalizeAddOns = (item: CartItem) => {
      const source = Array.isArray(item.selectedAddOns) ? item.selectedAddOns : [];
      return source
        .filter(addon => addon && typeof addon.name === 'string' && typeof addon.quantity === 'number')
        .map(addon => ({ name: addon.name, quantity: addon.quantity, price: Number(addon.price || 0) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };

    const firstAddOns = JSON.stringify(normalizeAddOns(first));
    const secondAddOns = JSON.stringify(normalizeAddOns(second));

    return (
      first.id === second.id &&
      first.selectedSize === second.selectedSize &&
      first.selectedTemp === second.selectedTemp &&
      first.selectedOtherVariant === second.selectedOtherVariant &&
      first.selectedVariantOption === second.selectedVariantOption &&
      firstAddOns === secondAddOns
    );
  };

  const addToPosCart = (item: CartItem) => {
    setPosCart(prev => {
      const existing = prev.find(i => areSameCartOptions(i, item));
      if (existing) {
        return prev.map(i => areSameCartOptions(i, item) ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, item];
    });
    setFlashItemId(item.id);
    setTimeout(() => setFlashItemId(null), 500);
  };

  const handleMenuItemClick = (item: MenuItem) => {
    const sanitizedItem: MenuItem = {
      ...item,
      sizes: Array.isArray(item.sizes) ? item.sizes.filter(size => size && typeof size.name === 'string' && typeof size.price === 'number') : [],
      otherVariants: Array.isArray(item.otherVariants) ? item.otherVariants.filter(variant => variant && typeof variant.name === 'string' && typeof variant.price === 'number') : [],
      addOns: Array.isArray(item.addOns) ? item.addOns.filter(addon => addon && typeof addon.name === 'string' && typeof addon.price === 'number') : [],
      tempOptions: item.tempOptions && typeof item.tempOptions === 'object'
        ? {
            enabled: item.tempOptions.enabled === true,
            hot: Number(item.tempOptions.hot || 0),
            cold: Number(item.tempOptions.cold || 0),
            options: Array.isArray(item.tempOptions.options) ? item.tempOptions.options : [],
          }
        : { enabled: false, hot: 0, cold: 0, options: [] },
    };

    const hasOptions =
      (sanitizedItem.sizes && sanitizedItem.sizes.length > 0) ||
      (sanitizedItem.tempOptions && sanitizedItem.tempOptions.enabled) ||
      (sanitizedItem.otherVariantsEnabled && sanitizedItem.otherVariants && sanitizedItem.otherVariants.length > 0) ||
      (sanitizedItem.addOns && sanitizedItem.addOns.length > 0);

    if (hasOptions) {
      setSelectedItemForOptions(sanitizedItem);
      return;
    }

    addToPosCart({ ...sanitizedItem, quantity: 1, restaurantId: restaurant.id });
  };

  const removeFromPosCart = (cartIndex: number) => {
    setPosCart(prev => prev.filter((_, idx) => idx !== cartIndex));
  };

  const updateQuantity = (cartIndex: number, delta: number) => {
    setPosCart(prev => prev.map((i, idx) => {
      if (idx === cartIndex) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const cartTotal = useMemo(() => {
    return posCart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  }, [posCart]);

  const handleCheckout = async () => {
    if (posCart.length === 0 || isCompletingPayment) return;
    setPendingOrderData({
      items: posCart,
      remark: posRemark,
      tableNumber: posTableNo,
      total: cartTotal,
    });
    setSelectedCashAmount(cartTotal);
    setCashAmountInput(cartTotal.toFixed(2));
    setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
    setShowPaymentModal(true);
  };

  const handleQrCheckout = async () => {
    if (!selectedQrOrder) return;
    
    // Convert the order items to cart items format
    const cartItems: CartItem[] = selectedQrOrder.items.map(item => ({
      ...item,
      restaurantId: selectedQrOrder.restaurantId
    }));
    
    try {
      setIsCompletingPayment(true);
      const orderId = await onPlaceOrder(cartItems, selectedQrOrder.remark || '', selectedQrOrder.tableNumber || '');
      // Mark the original order as COMPLETED
      await onUpdateOrder(selectedQrOrder.id, OrderStatus.COMPLETED);

      // If autoPrintReceipt is enabled, print the receipt
      if (featureSettings.autoPrintReceipt && connectedDevice && orderId) {
        const order = {
          id: orderId,
          items: cartItems,
          tableNumber: selectedQrOrder.tableNumber,
          remark: selectedQrOrder.remark || '',
          total: selectedQrOrder.total,
          timestamp: Date.now()
        };

        // Get the first saved printer's drawer commands
        const printer = savedPrinters.length > 0 ? savedPrinters[0] : null;
        const drawerCommands = printer?.advancedSettings?.drawerCommands || '';

        try {
          await printerService.printReceipt(order, restaurant, {
            businessName: receiptSettings.businessName,
            showDateTime: true,
            showOrderId: true,
            showTableNumber: true,
            showItems: true,
            showRemark: !!selectedQrOrder.remark,
            showTotal: true,
            headerLine1: receiptSettings.headerLine1,
            headerLine2: receiptSettings.headerLine2,
            footerLine1: receiptSettings.footerLine1,
            footerLine2: receiptSettings.footerLine2,
            drawerCommands: drawerCommands,
            autoOpenDrawer: featureSettings.autoOpenDrawer
          });
        } catch (printError) {
          console.error('Failed to print receipt:', printError);
        }
      }

      setShowPaymentSuccess(true);

      setTimeout(() => {
        setIsOrderSummaryOpen(false);
        setTimeout(() => {
          setSelectedQrOrder(null);
          setShowPaymentSuccess(false);
          setIsCompletingPayment(false);
        }, 320);
      }, 520);
    } catch (error) {
      console.error('QR Checkout error:', error);
      setIsCompletingPayment(false);
      toast('Failed to complete payment', 'error');
    }
  };

  const unpaidOrders = useMemo(() => {
    return orders.filter(o => o.status === OrderStatus.SERVED && o.restaurantId === restaurant.id);
  }, [orders, restaurant.id]);

  const handlePayUnpaid = (order: Order) => {
    setShowPaymentSuccess(false);
    setSelectedQrOrder(order);
    setIsOrderSummaryOpen(false);
    requestAnimationFrame(() => setIsOrderSummaryOpen(true));
  };

  const closeQrOrderSummary = () => {
    setShowPaymentSuccess(false);
    setIsOrderSummaryOpen(false);
    setTimeout(() => {
      setSelectedQrOrder(null);
    }, 320);
  };

  const buildOfflineReportData = (isExport = false): ReportResponse | Order[] => {
    const startTs = new Date(reportStart + 'T00:00:00').getTime();
    const endTs = new Date(reportEnd + 'T23:59:59').getTime();
    const allCachedOrders = counterOrdersCache.getReportOrdersCache(restaurant.id);
    const filtered = allCachedOrders
      .filter(order => {
        const inRange = order.timestamp >= startTs && order.timestamp <= endTs;
        const statusMatch = reportStatus === 'ALL' || order.status === reportStatus;
        const searchMatch = !reportSearchQuery || order.id.toLowerCase().includes(reportSearchQuery.toLowerCase());
        return inRange && statusMatch && searchMatch;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
    const completedOrders = filtered.filter(o => o.status === OrderStatus.COMPLETED);
    const summary = {
      totalRevenue: completedOrders.reduce((sum, o) => sum + o.total, 0),
      orderVolume: filtered.length,
      efficiency: filtered.length > 0 ? Math.round((completedOrders.length / filtered.length) * 100) : 0,
    };
    if (isExport) return filtered;
    const pageStart = (currentPage - 1) * entriesPerPage;
    return { orders: filtered.slice(pageStart, pageStart + entriesPerPage), summary, totalCount: filtered.length };
  };

  const fetchReport = async (isExport = false) => {
    if (!isOnline) {
      if (isExport) return buildOfflineReportData(true) as Order[];
      setReportData(buildOfflineReportData(false) as ReportResponse);
      return;
    }
    if (!isExport) setIsReportLoading(true);
    try {
      const filters: ReportFilters = {
        restaurantId: restaurant.id,
        startDate: reportStart,
        endDate: reportEnd,
        status: reportStatus,
        search: reportSearchQuery
      };
      if (isExport && onFetchAllFilteredOrders) {
        const orders = await onFetchAllFilteredOrders(filters);
        return orders;
      }
      if (!isExport && onFetchPaginatedOrders) {
        const data = await onFetchPaginatedOrders(filters, currentPage, entriesPerPage);
        counterOrdersCache.mergeReportOrdersCache(restaurant.id, data.orders);
        setReportData(data);
        return;
      }
    } catch (error) {
      console.error('Report error:', error);
    } finally {
      if (!isExport) setIsReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'REPORTS') {
      fetchReport();
    }
  }, [activeTab, reportStart, reportEnd, reportStatus, reportSearchQuery, currentPage, entriesPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [entriesPerPage, reportStatus, reportStart, reportEnd, reportSearchQuery]);

  useEffect(() => {
    if (activeTab === 'REPORTS' && orders.length > 0) {
      const timer = setTimeout(() => { fetchReport(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [orders.length, activeTab]);

  useEffect(() => {
    if (!('bluetooth' in navigator) || !(navigator as any).bluetooth) {
      setIsBluetoothSupported(false);
      setErrorMessage('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }
  }, []);

  useEffect(() => {
    const savedPrinter = localStorage.getItem(`printer_${restaurant.id}`);
    if (savedPrinter) {
      try {
        const printer = JSON.parse(savedPrinter);
        setConnectedDevice(printer);
        setPrinterStatus('connected');
      } catch (error) {
        console.error('Failed to load saved printer', error);
      }
    }
  }, [restaurant.id]);

  useEffect(() => {
    const defaults = getDefaultReceiptSettings(restaurant.name);
    const localSaved = localStorage.getItem(`receipt_settings_${restaurant.id}`);
    const dbSaved = (restaurant as any)?.settings?.receipt;

    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        setReceiptSettings({ ...defaults, ...parsed });
        return;
      } catch (error) {
        console.error('Failed to parse local receipt settings', error);
      }
    }

    if (dbSaved && typeof dbSaved === 'object') {
      setReceiptSettings({ ...defaults, ...dbSaved });
      return;
    }

    setReceiptSettings(defaults);
  }, [restaurant.id, restaurant.name, (restaurant as any)?.settings]);

  useEffect(() => {
    localStorage.setItem(`receipt_settings_${restaurant.id}`, JSON.stringify(receiptSettings));
  }, [receiptSettings, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`features_${restaurant.id}`, JSON.stringify(featureSettings));
  }, [featureSettings, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`payment_types_${restaurant.id}`, JSON.stringify(paymentTypes));
  }, [paymentTypes, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`taxes_${restaurant.id}`, JSON.stringify(taxEntries));
  }, [taxEntries, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`ux_font_${restaurant.id}`, userFont);
    document.documentElement.style.fontFamily = `'${userFont}', ui-sans-serif, system-ui, sans-serif`;
    const fontId = `google-font-${userFont.replace(/\s+/g, '-').toLowerCase()}`;
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(userFont)}:wght@300;400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
    return () => {
      document.documentElement.style.fontFamily = '';
    };
  }, [userFont, restaurant.id]);

  useEffect(() => {
    if (!receiptSettingsSaved) return;
    const timer = setTimeout(() => setReceiptSettingsSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [receiptSettingsSaved]);

  const handleDownloadReport = async () => {
    const allOrders = await fetchReport(true) as Order[];
    if (!allOrders || allOrders.length === 0) return;
    const headers = ['Order ID', 'Table', 'Date', 'Time', 'Status', 'Payment Method', 'Cashier', 'Items', 'Total'];
    const rows = allOrders.map(o => [
      o.id,
      o.tableNumber,
      new Date(o.timestamp).toLocaleDateString(),
      new Date(o.timestamp).toLocaleTimeString(),
      o.status,
      o.paymentMethod || '',
      o.cashierName || '',
      o.items.map(i => `${i.name} (x${i.quantity})`).join('; '),
      o.total.toFixed(2)
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `POS_Report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = reportData ? Math.ceil(reportData.totalCount / entriesPerPage) : 0;
  const paginatedReports = reportData?.orders || [];

  const toggleSetting = async (key: 'showSalesReport' | 'showQrGenerator') => {
    if (!onUpdateRestaurantSettings) return;
    const currentSettings = restaurant.settings || {};
    const newSettings = {
      ...currentSettings,
      [key]: currentSettings[key] === false ? true : false
    };
    await onUpdateRestaurantSettings(restaurant.id, newSettings);
  };

  const handleRemoveStaff = async (staff: any, index: number) => {
    const updated = staffList.filter((_: any, idx: number) => idx !== index);

    try {
      if (staff?.id) {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', staff.id);

        if (error) {
          toast('Error removing staff: ' + error.message, 'error');
          return;
        }
      }

      setStaffList(updated);
      localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
    } catch (error: any) {
      toast('Error removing staff: ' + error.message, 'error');
    }
  };

  const scanForPrinters = async () => {
    if (!isBluetoothSupported) return;

    setIsScanning(true);
    setDevices([]);
    setErrorMessage('');

    const found = await printerService.scanForPrinters();
    setDevices(found);
    setIsScanning(false);
  };

  const connectToPrinter = async (device: PrinterDevice) => {
    setPrinterStatus('connecting');
    setErrorMessage('');

    const success = await printerService.connect(device.name);

    if (success) {
      setConnectedDevice(device);
      setPrinterStatus('connected');
      localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));

      await supabase
        .from('restaurants')
        .update({
          printer_settings: {
            connected: true,
            deviceId: device.id,
            deviceName: device.name
          }
        })
        .eq('id', restaurant.id);
    } else {
      setPrinterStatus('error');
      setErrorMessage('Failed to connect to printer');
    }
  };

  const disconnectPrinter = async () => {
    await printerService.disconnect();
    setConnectedDevice(null);
    setPrinterStatus('disconnected');
    localStorage.removeItem(`printer_${restaurant.id}`);

    supabase
      .from('restaurants')
      .update({ printer_settings: { connected: false } })
      .eq('id', restaurant.id);
  };

  const printTestPage = async () => {
    if (!connectedDevice) return;

    setTestPrintStatus('printing');
    setErrorMessage('');

    const success = await printerService.printTestPage({
      businessName: receiptSettings.businessName,
    });

    if (success) {
      setTestPrintStatus('success');
      setTimeout(() => setTestPrintStatus('idle'), 3000);
    } else {
      setTestPrintStatus('error');
      setErrorMessage('Print failed');
    }
  };

  const updateReceiptSetting = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setReceiptSettings(prev => ({ ...prev, [key]: value }));
    setReceiptSettingsSaved(false);
  };

  const saveReceiptSettings = async () => {
    setIsSavingReceiptSettings(true);
    try {
      const mergedSettings = {
        ...((restaurant as any)?.settings || {}),
        receipt: receiptSettings,
      };

      const { error } = await supabase
        .from('restaurants')
        .update({ settings: mergedSettings })
        .eq('id', restaurant.id);

      if (error) {
        console.error('Cloud save failed, using local receipt settings only:', error);
        toast('Receipt settings saved locally. Cloud sync is unavailable right now.', 'warning');
        setReceiptSettingsSaved(true);
        return;
      }

      setReceiptSettingsSaved(true);
    } catch (error: any) {
      toast('Failed to save receipt settings: ' + error.message, 'error');
    } finally {
      setIsSavingReceiptSettings(false);
    }
  };

  const handleSavePrinter = async () => {
    if (!newPrinterName.trim() || !newPrinterModel) return;

    const printer: SavedPrinter = {
      id: Date.now().toString(),
      name: newPrinterName.trim(),
      model: newPrinterModel,
      connectionType: newPrinterModel === 'Other' ? newPrinterConnectionType : 'bluetooth',
      ipAddress: newPrinterConnectionType === 'ethernet' ? newPrinterIpAddress : undefined,
      paperWidth: newPrinterPaperWidth,
      advancedSettings: { ...newPrinterAdvanced },
    };

    const updated = [...savedPrinters, printer];
    setSavedPrinters(updated);
    localStorage.setItem(`printers_${restaurant.id}`, JSON.stringify(updated));

    setNewPrinterName('');
    setNewPrinterModel('');
    setNewPrinterConnectionType('bluetooth');
    setNewPrinterIpAddress('');
    setNewPrinterPaperWidth(58);
    setShowAdvancedSettings(false);
    setNewPrinterAdvanced({ printMode: 'Standard', printWidth: 384, printResolution: '203 DPI', initCommands: '', cutterCommands: '', drawerCommands: '' });
    setIsAddPrinterOpen(false);
  };

  const handleRemovePrinter = (printerId: string) => {
    const updated = savedPrinters.filter(p => p.id !== printerId);
    setSavedPrinters(updated);
    localStorage.setItem(`printers_${restaurant.id}`, JSON.stringify(updated));
  };

  const updateFeatureSetting = <K extends keyof FeatureSettings>(key: K, value: FeatureSettings[K]) => {
    setFeatureSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleAddPaymentType = () => {
    if (!newPaymentTypeName.trim()) return;
    const newType: PaymentType = {
      id: Date.now().toString(),
      name: newPaymentTypeName.trim().toUpperCase(),
    };
    setPaymentTypes(prev => [...prev, newType]);
    setNewPaymentTypeName('');
  };

  const handleRemovePaymentType = (id: string) => {
    setPaymentTypes(prev => prev.filter(pt => pt.id !== id));
  };

  const handleAddTaxEntry = () => {
    if (!newTaxName.trim() || !newTaxPercentage) return;
    const entry: TaxEntry = {
      id: Date.now().toString(),
      name: newTaxName.trim(),
      percentage: parseFloat(newTaxPercentage),
      applyToItems: newTaxApplyToItems,
    };
    setTaxEntries(prev => [...prev, entry]);
    setNewTaxName('');
    setNewTaxPercentage('');
    setNewTaxApplyToItems(false);
  };

  const handleRemoveTaxEntry = (id: string) => {
    setTaxEntries(prev => prev.filter(t => t.id !== id));
  };

  const handleToggleTaxApply = (id: string) => {
    setTaxEntries(prev =>
      prev.map(t => t.id === id ? { ...t, applyToItems: !t.applyToItems } : t)
    );
  };

  const handleTabSelection = (tab: 'COUNTER' | 'QR_ORDERS' | 'REPORTS' | 'QR_GEN' | 'SETTINGS') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const getReceiptPrintOptions = (): ReceiptPrintOptions => {
    const printer = savedPrinters.length > 0 ? savedPrinters[0] : null;
    const drawerCommands = printer?.advancedSettings?.drawerCommands || '';
    return {
      showDateTime: receiptSettings.showDateTime,
      showOrderId: receiptSettings.showOrderId,
      showTableNumber: receiptSettings.showTableNumber,
      showItems: receiptSettings.showItems,
      showRemark: receiptSettings.showRemark,
      showTotal: receiptSettings.showTotal,
      headerLine1: receiptSettings.headerLine1,
      headerLine2: receiptSettings.headerLine2,
      footerLine1: receiptSettings.footerLine1,
      footerLine2: receiptSettings.footerLine2,
      drawerCommands: drawerCommands,
      autoOpenDrawer: featureSettings.autoOpenDrawer
    };
  };

  const handleOrderStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      onUpdateOrder(orderId, newStatus);
      if (newStatus === OrderStatus.COMPLETED || newStatus === OrderStatus.CANCELLED) {
        counterOrdersCache.removeCounterOrderFromCache(restaurant.id, orderId);
        setCachedCounterOrders(prev => prev.filter(o => o.id !== orderId));
      } else {
        setCachedCounterOrders(prev =>
          prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
        );
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrderData || !selectedPaymentType) return;
    if (!selectedCashAmount || selectedCashAmount < pendingOrderData.total) {
      toast('Amount received cannot be less than the total bill.', 'error');
      return;
    }
    setIsCompletingPayment(true);
    setCheckoutNotice('');
    let actualOrderId: string = '';
    const paymentName = paymentTypes.find(p => p.id === selectedPaymentType)?.name || selectedPaymentType;
    try {
      actualOrderId = await onPlaceOrder(pendingOrderData.items, pendingOrderData.remark, pendingOrderData.tableNumber, paymentName, cashierName, selectedCashAmount ?? undefined);
    } catch (error: any) {
      console.error('Order placement error:', error);
      toast(`Failed to place order: ${error?.message || 'Unknown error'}`, 'error');
      setIsCompletingPayment(false);
      setShowPaymentModal(false);
      return;
    }
    const nowTs = Date.now();
    const orderForPrint = {
      id: actualOrderId,
      tableNumber: pendingOrderData.tableNumber,
      timestamp: nowTs,
      total: pendingOrderData.total,
      items: pendingOrderData.items,
      remark: pendingOrderData.remark,
    };
    counterOrdersCache.mergeReportOrdersCache(restaurant.id, [{
      id: actualOrderId,
      items: pendingOrderData.items,
      total: pendingOrderData.total,
      status: OrderStatus.COMPLETED,
      timestamp: nowTs,
      restaurantId: restaurant.id,
      tableNumber: pendingOrderData.tableNumber,
      remark: pendingOrderData.remark || '',
      customerId: '',
      paymentMethod: paymentName,
      cashierName: cashierName || '',
      amountReceived: selectedCashAmount ?? undefined,
      changeAmount: selectedCashAmount != null ? Math.max(0, selectedCashAmount - pendingOrderData.total) : undefined,
    }]);
    setShowPaymentResult(true);
    setIsCompletingPayment(false);
    if (featureSettings.autoPrintReceipt) {
      if (connectedDevice) {
        const printRestaurant = { ...restaurant, name: receiptSettings.businessName.trim() || restaurant.name };
        printerService.printReceipt(orderForPrint, printRestaurant, getReceiptPrintOptions())
          .then((printSuccess) => {
            if (!printSuccess) setCheckoutNotice('Order saved. Receipt printing did not complete.');
          })
          .catch((printError: any) => {
            setCheckoutNotice(`Order saved. ${printError?.message || 'Receipt printing failed'}`);
          });
      } else {
        setCheckoutNotice('Order saved. Auto-print is enabled but no printer is connected.');
      }
    }
  };

  const finalizePaymentFlow = () => {
    setShowPaymentResult(false);
    setShowPaymentModal(false);
    setPosCart([]);
    setPosRemark('');
    setPosTableNo('Counter');
    setPendingOrderData(null);
    setShowPaymentSuccess(true);
    setTimeout(() => setShowPaymentSuccess(false), 1800);
  };

  const handlePrinterButtonClick = async () => {
    if (isAutoReconnecting) return;
    if (realPrinterConnected) {
      await disconnectPrinter();
      setRealPrinterConnected(false);
      return;
    }
    if (connectedDevice) {
      setIsAutoReconnecting(true);
      try {
        const success = await printerService.connect(connectedDevice.name);
        if (success) setRealPrinterConnected(true);
        else setRealPrinterConnected(false);
      } catch (e) {
        setRealPrinterConnected(false);
      } finally {
        setIsAutoReconnecting(false);
      }
      return;
    }
    setActiveTab('SETTINGS');
  };

  const renderFeaturesContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Auto-Print Receipt</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Print automatically after checkout</p>
        </div>
        <button
          onClick={() => updateFeatureSetting('autoPrintReceipt', !featureSettings.autoPrintReceipt)}
          className={`w-11 h-6 rounded-full transition-all relative ${
            featureSettings.autoPrintReceipt ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            featureSettings.autoPrintReceipt ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Auto Open Drawer</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Open cash drawer after checkout</p>
        </div>
        <button
          onClick={() => updateFeatureSetting('autoOpenDrawer', !featureSettings.autoOpenDrawer)}
          className={`w-11 h-6 rounded-full transition-all relative ${
            featureSettings.autoOpenDrawer ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            featureSettings.autoOpenDrawer ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      <div className="border-t dark:border-gray-700 pt-4">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Dining Options</p>
        <div className="space-y-2">
          {([
            { key: 'dineInEnabled' as const, label: 'Dine-in', desc: 'Allow dine-in orders' },
            { key: 'takeawayEnabled' as const, label: 'Takeaway', desc: 'Allow takeaway orders' },
            { key: 'deliveryEnabled' as const, label: 'Delivery', desc: 'Allow delivery orders' },
          ]).map(item => (
            <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              <div>
                <p className="text-xs font-black dark:text-white">{item.label}</p>
                <p className="text-[9px] text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <button
                onClick={() => updateFeatureSetting(item.key, !featureSettings[item.key])}
                className={`w-11 h-6 rounded-full transition-all relative ${
                  featureSettings[item.key] ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  featureSettings[item.key] ? 'left-6' : 'left-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Customer Display</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Enable external customer-facing display</p>
        </div>
        <button
          onClick={() => updateFeatureSetting('customerDisplayEnabled', !featureSettings.customerDisplayEnabled)}
          className={`w-11 h-6 rounded-full transition-all relative ${
            featureSettings.customerDisplayEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            featureSettings.customerDisplayEnabled ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>
    </div>
  );

  const renderKitchenAccessContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Sales Reports</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Allow kitchen staff to view financial reports</p>
        </div>
        <button
          onClick={() => toggleSetting('showSalesReport')}
          className={`w-11 h-6 rounded-full transition-all relative ${
            restaurant.settings?.showSalesReport !== false ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            restaurant.settings?.showSalesReport !== false ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">QR Generator</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Allow kitchen staff to generate table QR codes</p>
        </div>
        <button
          onClick={() => toggleSetting('showQrGenerator')}
          className={`w-11 h-6 rounded-full transition-all relative ${
            restaurant.settings?.showQrGenerator !== false ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            restaurant.settings?.showQrGenerator !== false ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>
    </div>
  );

  const renderPrinterContent = () => (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`p-4 rounded-xl border transition-all ${
        printerStatus === 'connected'
          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            printerStatus === 'connected' ? 'bg-green-500' : printerStatus === 'connecting' ? 'bg-orange-500 animate-pulse' : 'bg-gray-300'
          }`} />
          <div className="flex-1">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              {printerStatus === 'connected' ? 'Connected' : printerStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </p>
            {connectedDevice && (
              <p className="text-xs font-bold dark:text-white mt-0.5">{connectedDevice.name}</p>
            )}
          </div>
          {printerStatus === 'connected' && (
            <button onClick={disconnectPrinter} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-600">Disconnect</button>
          )}
        </div>
      </div>

      {/* Bluetooth Actions */}
      {printerStatus !== 'connected' && isBluetoothSupported && (
        <button
          onClick={scanForPrinters}
          disabled={isScanning}
          className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isScanning ? (
            <><div className="w-3 h-3 border-2 border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" /> Scanning...</>
          ) : (
            <><Bluetooth size={14} /> Scan Bluetooth</>
          )}
        </button>
      )}

      {devices.length > 0 && printerStatus !== 'connected' && (
        <div className="space-y-2">
          {devices.map(device => (
            <button
              key={device.id}
              onClick={() => connectToPrinter(device)}
              className="w-full p-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl flex items-center justify-between hover:border-orange-500 transition-all"
            >
              <span className="font-bold dark:text-white text-xs">{device.name}</span>
              <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Connect</span>
            </button>
          ))}
        </div>
      )}

      {printerStatus === 'connected' && (
        <div className="flex gap-2">
          <button
            onClick={printTestPage}
            disabled={testPrintStatus === 'printing'}
            className="flex-1 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-black text-[9px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testPrintStatus === 'printing' ? 'Printing...' : testPrintStatus === 'success' ? (<><CheckCircle2 size={12} className="text-green-500" /> Sent!</>) : (<><Printer size={12} /> Test Print</>)}
          </button>
          <button
            onClick={async () => { try { await printerService.reprintLast(); } catch (err: any) { setErrorMessage(err?.message || 'Reprint failed'); } }}
            disabled={!printerService.hasLastReceipt()}
            className="flex-1 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl font-black text-[9px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:border-orange-500 hover:text-orange-500 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
          >
            <RotateCw size={12} /> Reprint
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200">
          <p className="text-[9px] text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {!isBluetoothSupported && (
        <div className="text-center py-6">
          <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
          <p className="text-xs font-bold text-gray-500">{errorMessage || 'Bluetooth not supported'}</p>
          <p className="text-[9px] text-gray-400 mt-1">Use Chrome, Edge, or Opera</p>
        </div>
      )}

      {/* Divider */}
      <div className="border-t dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Saved Printers</p>
          <span className="text-[9px] font-black text-gray-300 uppercase">{savedPrinters.length}</span>
        </div>

        {savedPrinters.length === 0 && !isAddPrinterOpen && (
          <div className="text-center py-6 border border-dashed dark:border-gray-700 rounded-xl">
            <Printer size={20} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[10px] text-gray-400">No printers saved</p>
          </div>
        )}

        {savedPrinters.map(printer => (
          <div key={printer.id} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black dark:text-white">{printer.name}</p>
                <p className="text-[10px] text-gray-400">{printer.model} &middot; {printer.paperWidth}mm &middot; {printer.connectionType}</p>
              </div>
              <button onClick={() => handleRemovePrinter(printer.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Printer */}
      {!isAddPrinterOpen ? (
        <button
          onClick={() => setIsAddPrinterOpen(true)}
          className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={14} /> Add Printer
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">New Printer</p>
            <button onClick={() => { setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }} className="text-gray-400 hover:text-red-500">
              <X size={14} />
            </button>
          </div>

          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</label>
            <input
              type="text"
              value={newPrinterName}
              onChange={e => setNewPrinterName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              placeholder="e.g. Kitchen Printer"
            />
          </div>

          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Printer Model</label>
            <select
              value={newPrinterModel}
              onChange={e => setNewPrinterModel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            >
              <option value="">Select model...</option>
              {PRINTER_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Connection type for "Other" model */}
          {newPrinterModel === 'Other' && (
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Connection</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setNewPrinterConnectionType('bluetooth')}
                  className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border transition-all ${
                    newPrinterConnectionType === 'bluetooth'
                      ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 text-orange-600'
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                  }`}
                >
                  <Bluetooth size={12} /> Bluetooth
                </button>
                <button
                  onClick={() => setNewPrinterConnectionType('ethernet')}
                  className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border transition-all ${
                    newPrinterConnectionType === 'ethernet'
                      ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 text-orange-600'
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                  }`}
                >
                  <Network size={12} /> Ethernet
                </button>
              </div>

              {newPrinterConnectionType === 'ethernet' && (
                <div className="mt-2">
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">IP Address</label>
                  <input
                    type="text"
                    value={newPrinterIpAddress}
                    onChange={e => setNewPrinterIpAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="192.168.1.100"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Paper Width</label>
            <select
              value={newPrinterPaperWidth}
              onChange={e => setNewPrinterPaperWidth(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            >
              <option value={58}>58mm</option>
              <option value={80}>80mm</option>
            </select>
          </div>

          {/* Advanced Settings Toggle */}
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="w-full flex items-center justify-between py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-orange-500 transition-colors"
          >
            Advanced Settings
            <ChevronDown size={14} className={`transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
          </button>

          {showAdvancedSettings && (
            <div className="space-y-3 border-t dark:border-gray-700 pt-3">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Print Mode</label>
                <select
                  value={newPrinterAdvanced.printMode}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, printMode: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                >
                  <option value="Standard">Standard</option>
                  <option value="Page Mode">Page Mode</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Print Width (dots)</label>
                <input
                  type="number"
                  value={newPrinterAdvanced.printWidth}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, printWidth: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                  placeholder="384"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Print Resolution</label>
                <select
                  value={newPrinterAdvanced.printResolution}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, printResolution: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                >
                  <option value="180 DPI">180 DPI</option>
                  <option value="203 DPI">203 DPI</option>
                  <option value="300 DPI">300 DPI</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Initial ESC/POS Commands</label>
                <input
                  type="text"
                  value={newPrinterAdvanced.initCommands}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, initCommands: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white font-mono"
                  placeholder="e.g. 0x1B 0x40"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Cutter ESC/POS Command</label>
                <input
                  type="text"
                  value={newPrinterAdvanced.cutterCommands}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, cutterCommands: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white font-mono"
                  placeholder="e.g. 0x1D 0x56 0x00"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Drawer ESC/POS Command</label>
                <input
                  type="text"
                  value={newPrinterAdvanced.drawerCommands}
                  onChange={e => setNewPrinterAdvanced(prev => ({ ...prev, drawerCommands: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white font-mono"
                  placeholder="e.g. 0x1B 0x70 0x00"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }}
              className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePrinter}
              disabled={!newPrinterName.trim() || !newPrinterModel}
              className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 disabled:opacity-40 transition-all"
            >
              Save Printer
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderReceiptContent = () => (
    <div className="space-y-4">
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setReceiptAccordion(prev => ({ ...prev, content: !prev.content }))}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-600/30 transition-all"
        >
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Content</span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${receiptAccordion.content ? 'rotate-180' : ''}`} />
        </button>
        {receiptAccordion.content && (
          <div className="px-4 pb-4 space-y-3 border-t dark:border-gray-600 pt-3">
            {[
              { key: 'businessName', label: 'Business Name', placeholder: 'Store name' },
              { key: 'headerLine1', label: 'Header Line 1', placeholder: 'Optional' },
              { key: 'headerLine2', label: 'Header Line 2', placeholder: 'Optional' },
              { key: 'footerLine1', label: 'Footer Line 1', placeholder: 'Thank you!' },
              { key: 'footerLine2', label: 'Footer Line 2', placeholder: 'Please come again' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{field.label}</label>
                <input
                  type="text"
                  value={receiptSettings[field.key as keyof ReceiptSettings] as string}
                  onChange={e => updateReceiptSetting(field.key as keyof ReceiptSettings, e.target.value as any)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setReceiptAccordion(prev => ({ ...prev, fields: !prev.fields }))}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-600/30 transition-all"
        >
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Visible Fields</span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${receiptAccordion.fields ? 'rotate-180' : ''}`} />
        </button>
        {receiptAccordion.fields && (
          <div className="px-4 pb-4 border-t dark:border-gray-600 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'showDateTime', label: 'Date & Time' },
                { key: 'showOrderId', label: 'Order ID' },
                { key: 'showTableNumber', label: 'Table Number' },
                { key: 'showItems', label: 'Items' },
                { key: 'showRemark', label: 'Remark' },
                { key: 'showTotal', label: 'Total' },
                { key: 'showTaxes', label: 'Taxes' },
              ].map(field => (
                <label key={field.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-700 text-[10px] font-bold text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptSettings[field.key as keyof ReceiptSettings] as boolean}
                    onChange={e => updateReceiptSetting(field.key as keyof ReceiptSettings, e.target.checked as any)}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setReceiptSettings(getDefaultReceiptSettings(restaurant.name))}
          className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl font-black uppercase text-[9px] tracking-widest text-gray-500 hover:text-orange-500 transition-colors"
        >
          Reset
        </button>
        <button
          onClick={saveReceiptSettings}
          disabled={isSavingReceiptSettings}
          className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50"
        >
          {isSavingReceiptSettings ? 'Saving...' : 'Save'}
        </button>
      </div>
      {receiptSettingsSaved && (
        <p className="text-center text-[9px] font-black text-green-500 uppercase tracking-widest">Saved successfully</p>
      )}
    </div>
  );

  const renderStaffContent = () => (
    <div className="space-y-4">
      {staffList.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed dark:border-gray-600">
          <Users size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">No staff added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staffList.map((staff: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              <div>
                <p className="text-xs font-black dark:text-white">{staff.username}</p>
                <p className="text-[9px] text-gray-400">Added {new Date(staff.createdAt || staff.created_at || Date.now()).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleRemoveStaff(staff, idx)}
                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setIsAddStaffModalOpen(true)}
        className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
      >
        <UserPlus size={14} /> Add Staff Member
      </button>
    </div>
  );

  const renderUXContent = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Font Family</label>
        <select
          value={userFont}
          onChange={e => setUserFont(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
          style={{ fontFamily: `'${userFont}', sans-serif` }}
        >
          {FONT_OPTIONS.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>{f}</option>)}
        </select>
        <p className="text-[9px] text-gray-400 mt-1.5">This only applies to your screen</p>
      </div>
      <div>
        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Currency</label>
        <select
          value={userCurrency}
          onChange={e => {
            setUserCurrency(e.target.value);
            localStorage.setItem(`pos_currency_${restaurant.id}`, e.target.value);
          }}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
        >
          {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <p className="text-[9px] text-gray-400 mt-1.5">Changes the currency symbol shown on screen</p>
      </div>
    </div>
  );

  const renderPaymentTypesContent = () => (
    <div className="space-y-4">
      {paymentTypes.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed dark:border-gray-600">
          <CreditCard size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">No payment types</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paymentTypes.map(pt => (
            <div key={pt.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              <p className="text-xs font-black dark:text-white">{pt.name}</p>
              <button onClick={() => handleRemovePaymentType(pt.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newPaymentTypeName}
          onChange={e => setNewPaymentTypeName(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
          placeholder="e.g. CREDIT CARD"
          onKeyDown={e => e.key === 'Enter' && handleAddPaymentType()}
        />
        <button
          onClick={handleAddPaymentType}
          disabled={!newPaymentTypeName.trim()}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );

  const renderTaxesContent = () => (
    <div className="space-y-4">
      {taxEntries.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed dark:border-gray-600">
          <Tag size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">No taxes configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {taxEntries.map(tax => (
            <div key={tax.id} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black dark:text-white">{tax.name} ({tax.percentage}%)</p>
                  <p className="text-[9px] text-gray-400">{tax.applyToItems ? 'Applied to items' : 'Not applied to items'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleTaxApply(tax.id)}
                    className={`w-11 h-6 rounded-full transition-all relative ${
                      tax.applyToItems ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                      tax.applyToItems ? 'left-6' : 'left-1'
                    }`} />
                  </button>
                  <button onClick={() => handleRemoveTaxEntry(tax.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Add Tax</p>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Name</label>
          <input
            type="text"
            value={newTaxName}
            onChange={e => setNewTaxName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            placeholder="e.g. GST, SST"
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Percentage</label>
          <input
            type="number"
            value={newTaxPercentage}
            onChange={e => setNewTaxPercentage(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            placeholder="e.g. 6"
            min="0"
            step="0.01"
          />
        </div>
        <label className="flex items-center gap-2 text-[10px] font-bold text-gray-700 dark:text-gray-200 cursor-pointer">
          <input
            type="checkbox"
            checked={newTaxApplyToItems}
            onChange={e => setNewTaxApplyToItems(e.target.checked)}
            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          Apply to items by default
        </label>
        <button
          onClick={handleAddTaxEntry}
          disabled={!newTaxName.trim() || !newTaxPercentage}
          className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add Tax
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-900 overflow-hidden flex-col">
      {/* Offline Status Banner */}
      {!isOnline && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <p className="text-xs font-semibold text-red-900 dark:text-red-200">You're Offline — <span className="font-normal text-red-700 dark:text-red-300">Orders will be saved locally and synced when you're back online</span></p>
          </div>
          {pendingOfflineOrdersCount > 0 && (
            <div className="bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">{pendingOfflineOrdersCount} pending</p>
            </div>
          )}
        </div>
      )}

      {isOnline && pendingOfflineOrdersCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">Syncing Orders — <span className="font-normal text-yellow-700 dark:text-yellow-300">{pendingOfflineOrdersCount} orders are being synced to the server</span></p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation - EXACT same as Vendor View */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 
        flex flex-col transition-transform duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
          <img src={restaurant.logo} className="w-10 h-10 rounded-lg shadow-sm" />
          <div>
            <h2 className="font-black dark:text-white text-sm uppercase tracking-tight">{restaurant.name}</h2>
            <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mt-0.5">POS Terminal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => handleTabSelection('COUNTER')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'COUNTER' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <ShoppingBag size={20} /> Counter
          </button>
          
          <button 
            onClick={() => handleTabSelection('QR_ORDERS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'QR_ORDERS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Clock size={20} /> QR Orders
            {unpaidOrders.length > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
                {unpaidOrders.length}
              </span>
            )}
          </button>
          
          <button 
            onClick={() => handleTabSelection('REPORTS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'REPORTS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BarChart3 size={20} /> Reports
          </button>
          
          <button 
            onClick={() => handleTabSelection('QR_GEN')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'QR_GEN' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <QrCode size={20} /> QR Generator
          </button>
          
          <button 
            onClick={() => handleTabSelection('SETTINGS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'SETTINGS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Settings2 size={20} /> Settings
          </button>
        </nav>

        {/* Switch to Vendor Button */}
        {onSwitchToVendor && (
          <div className="p-4 mt-auto border-t dark:border-gray-700">
            <button 
              onClick={onSwitchToVendor}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all border border-orange-100 dark:border-orange-900/20"
            >
              <ShoppingBag size={18} /> Switch to Vendor
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-30 no-print">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="ml-4 flex items-center gap-2">
              <img src={restaurant.logo} className="w-8 h-8 rounded-lg shadow-sm" />
              <h1 className="font-black dark:text-white uppercase tracking-tighter text-sm truncate">
                {activeTab === 'COUNTER' ? 'POS Counter' : 
                 activeTab === 'QR_ORDERS' ? 'QR Orders' : 
                 activeTab === 'REPORTS' ? 'Sales Report' : 
                 activeTab === 'QR_GEN' ? 'QR Generator' : 
                 'Settings'}
              </h1>
            </div>
          </div>

          {/* Counter Tab */}
          {activeTab === 'COUNTER' && (
            <>
              {/* Category Tabs & Search */}
              <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 overflow-x-auto no-scrollbar flex-1">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                          selectedCategory === cat 
                            ? 'bg-black text-white dark:bg-white dark:text-black' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl shrink-0">
                    <button 
                      onClick={() => setMenuLayout('grid-3')} 
                      className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-3' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button 
                      onClick={() => setMenuLayout('grid-4')} 
                      className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-4' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button 
                      onClick={() => setMenuLayout('grid-5')} 
                      className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-5' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button 
                      onClick={() => setMenuLayout('list')} 
                      className={`p-2 rounded-lg transition-all ${menuLayout === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search menu items..." 
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    value={menuSearch}
                    onChange={e => setMenuSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Menu Content */}
              <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
                <div className="space-y-4">
                  {Object.entries(groupedMenu).map(([category, items]) => (
                    <section key={category}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">{category}</h3>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                      </div>
                      
                      <div className={`grid gap-1.5 ${
                        menuLayout === 'grid-3' ? 'grid-cols-3' : 
                        menuLayout === 'grid-4' ? 'grid-cols-4' : 
                        menuLayout === 'grid-5' ? 'grid-cols-5' : 
                        'grid-cols-1'
                      }`}>
                        {items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => handleMenuItemClick(item)}
                            className={`relative bg-white dark:bg-gray-800 border dark:border-gray-700 text-left hover:border-orange-500 transition-all group shadow-sm flex ${
                              menuLayout === 'list' ? 'flex-row items-center gap-4 p-2 rounded-xl' : 'flex-col p-2 rounded-xl'
                            } ${flashItemId === item.id ? 'ring-2 ring-green-500 border-green-500 scale-95' : ''}`}
                            style={flashItemId === item.id ? { transition: 'all 0.15s ease-in-out' } : {}}
                          >
                            {flashItemId === item.id && (
                              <div className="absolute inset-0 bg-green-500/20 rounded-xl flex items-center justify-center z-10 pointer-events-none">
                                <CheckCircle2 size={28} className="text-green-500 drop-shadow-md" />
                              </div>
                            )}
                            <div className={`${
                              menuLayout === 'list' ? 'w-16 h-16' : 'aspect-square w-full'
                            } rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0`}>
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <ShoppingBag size={20} />
                                </div>
                              )}
                            </div>
                            <div className={menuLayout === 'list' ? 'flex-1' : 'mt-3'}>
                              <h4 className="font-black text-xs dark:text-white uppercase tracking-tighter mb-1 line-clamp-1">{item.name}</h4>
                              <p className="text-orange-500 font-black text-sm">{currencySymbol}{item.price.toFixed(2)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* QR Orders Tab - UPDATED with detailed items */}
          {activeTab === 'QR_ORDERS' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tighter">Unpaid QR Orders</h3>
                  <div className="relative w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search Table/ID..." 
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-orange-500 dark:text-white"
                      value={qrOrderSearch}
                      onChange={e => setQrOrderSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {unpaidOrders.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 p-12 rounded-3xl border dark:border-gray-700 text-center">
                      <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4 opacity-20" />
                      <p className="text-gray-400 font-black uppercase tracking-widest text-xs">All bills cleared</p>
                    </div>
                  ) : (
                    unpaidOrders
                      .filter(order => 
                        order.id.toLowerCase().includes(qrOrderSearch.toLowerCase()) ||
                        order.tableNumber?.toLowerCase().includes(qrOrderSearch.toLowerCase())
                      )
                      .map(order => (
                        <div key={order.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm">
                          {/* Order Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-orange-500 font-black text-lg">
                                {order.tableNumber}
                              </div>
                              <div>
                                <h4 className="font-black dark:text-white uppercase tracking-tighter">Order #{order.id}</h4>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                  {new Date(order.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handlePayUnpaid(order)}
                              className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all shadow-lg"
                            >
                              Collect Payment
                            </button>
                          </div>

                          {/* Order Items - Detailed View */}
                          <div className="mt-4 space-y-3">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                                {/* Main Item */}
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-black text-sm dark:text-white">
                                      x{item.quantity} {item.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                                    </p>
                                  </div>
                                </div>

                                {/* Variants and Options */}
                                <div className="mt-1 space-y-1">
                                  {item.selectedSize && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                      • Size: {item.selectedSize}
                                    </p>
                                  )}
                                  {item.selectedTemp && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                      • Temperature: {item.selectedTemp}
                                    </p>
                                  )}
                                  {item.selectedVariantOption && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                      • Variant: {item.selectedVariantOption}
                                    </p>
                                  )}
                                  {item.selectedOtherVariant && (
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                      • {item.selectedOtherVariant}
                                    </p>
                                  )}
                                  
                                  {/* Add-ons */}
                                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                                    <div className="mt-1">
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Add-ons:</p>
                                      {item.selectedAddOns.map((addon, addonIdx) => (
                                        <p key={addonIdx} className="text-[10px] text-gray-500 dark:text-gray-400 ml-2">
                                          • {addon.name} x{addon.quantity} (+{currencySymbol}{(addon.price * addon.quantity).toFixed(2)})
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Order Total */}
                          <div className="mt-4 pt-3 border-t dark:border-gray-700 flex justify-between items-center">
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total</span>
                            <span className="text-xl font-black text-orange-500">{currencySymbol}{order.total.toFixed(2)}</span>
                          </div>

                          {/* Remark if any */}
                          {order.remark && (
                            <div className="mt-3 p-2 bg-orange-50 dark:bg-orange-900/10 rounded-lg">
                              <p className="text-[10px] text-gray-600 dark:text-gray-300 italic">
                                Remark: {order.remark}
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'REPORTS' && (
            <div className="flex-1 overflow-y-auto p-6">
              {!isOnline && (
                <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                  <WifiOff size={14} className="text-amber-500 shrink-0" />
                  <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                    Offline — showing locally cached orders only
                  </p>
                </div>
              )}
              <StandardReport
                reportStart={reportStart}
                reportEnd={reportEnd}
                reportStatus={reportStatus}
                reportSearchQuery={reportSearchQuery}
                entriesPerPage={entriesPerPage}
                currentPage={currentPage}
                totalPages={totalPages}
                paginatedReports={paginatedReports}
                reportData={reportData}
                onChangeReportStart={setReportStart}
                onChangeReportEnd={setReportEnd}
                onChangeReportStatus={(value) => setReportStatus(value as any)}
                onChangeReportSearchQuery={setReportSearchQuery}
                onChangeEntriesPerPage={setEntriesPerPage}
                onChangeCurrentPage={setCurrentPage}
                onDownloadReport={handleDownloadReport}
                onSelectOrder={(order) => setSelectedReportOrder(order)}
              />
            </div>
          )}

          {/* QR Generator Tab */}
          {activeTab === 'QR_GEN' && (
            <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
              <div className="bg-white dark:bg-gray-800 p-12 rounded-[40px] border dark:border-gray-700 shadow-2xl text-center max-w-md w-full">
                <div className="w-24 h-24 bg-orange-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-orange-500/20">
                  <QrCode size={48} />
                </div>
                <h3 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-2">Hub QR Generator</h3>
                <p className="text-xs text-gray-400 font-medium mb-8">Generate ordering QR codes for your tables.</p>
                
                <div className="space-y-4 mb-8">
                  <div className="text-left">
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Table Number</label>
                    <div className="relative">
                      <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-700 border-none rounded-2xl text-sm font-black dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all" 
                        placeholder="e.g. 12" 
                        value={posTableNo}
                        onChange={e => setPosTableNo(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-orange-50 dark:bg-orange-900/10 rounded-3xl border border-orange-100 dark:border-orange-900/20 mb-8">
                  <p className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-1">Preview Link</p>
                  <p className="text-[10px] font-bold text-orange-600 dark:text-orange-500 break-all">
                    {window.location.origin}/?loc={encodeURIComponent(restaurant.location)}&table={posTableNo}
                  </p>
                </div>

                <button 
                  onClick={() => window.print()}
                  className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all shadow-xl flex items-center justify-center gap-2"
                >
                  <Printer size={16} /> Generate & Print
                </button>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'SETTINGS' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
                <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Settings</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Features, printer, receipt, payment, tax, staff, and kitchen configuration.</p>

                {/* ===== MOBILE: Accordion Layout ===== */}
                <div className="lg:hidden space-y-3">
                  {/* Features Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'features' ? null : 'features')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                        <Layers size={18} className="text-emerald-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Features</p>
                        <p className="text-[10px] text-gray-400">Auto-print, drawer, dining</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'features' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'features' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderFeaturesContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Printer Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => { setSettingsPanel(settingsPanel === 'printer' ? null : 'printer'); setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                        <Printer size={18} className="text-orange-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Printer Setup</p>
                        <p className="text-[10px] text-gray-400">{savedPrinters.length > 0 ? savedPrinters[0].model : 'No printer configured'}</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'printer' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'printer' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderPrinterContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Receipt Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'receipt' ? null : 'receipt')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Receipt size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Receipt</p>
                        <p className="text-[10px] text-gray-400">Configure receipt layout</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'receipt' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'receipt' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderReceiptContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Types Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'payment' ? null : 'payment')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                        <CreditCard size={18} className="text-green-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Payment Types</p>
                        <p className="text-[10px] text-gray-400">{paymentTypes.length} types</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'payment' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'payment' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderPaymentTypesContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Taxes Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'taxes' ? null : 'taxes')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                        <Tag size={18} className="text-amber-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Taxes</p>
                        <p className="text-[10px] text-gray-400">{taxEntries.length} configured</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'taxes' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'taxes' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderTaxesContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Staff Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'staff' ? null : 'staff')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                        <Users size={18} className="text-violet-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Staff Management</p>
                        <p className="text-[10px] text-gray-400">{staffList.length} member{staffList.length !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'staff' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'staff' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderStaffContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Experience Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'ux' ? null : 'ux')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Type size={18} className="text-indigo-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">User Experience</p>
                        <p className="text-[10px] text-gray-400">{userFont}</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'ux' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'ux' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderUXContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Kitchen Access Accordion */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'kitchen' ? null : 'kitchen')}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
                        <Coffee size={18} className="text-rose-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black dark:text-white uppercase tracking-wide">Kitchen Access</p>
                        <p className="text-[10px] text-gray-400">Control kitchen staff permissions</p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-300 group-hover:text-orange-500 transition-all ${settingsPanel === 'kitchen' ? 'rotate-180' : ''}`} />
                    </button>
                    {settingsPanel === 'kitchen' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderKitchenAccessContent()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ===== DESKTOP: Sidebar Layout ===== */}
                <div className="hidden lg:flex gap-6 min-h-[500px]">
                  {/* Left Sidebar */}
                  <div className="flex-1">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                      {/* Features Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('features')}
                        className={`w-full flex items-center gap-3 p-4 transition-all ${
                          settingsPanel === 'features'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'features'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Layers size={16} className={settingsPanel === 'features' ? 'text-emerald-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'features' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Features</p>
                          <p className="text-[10px] text-gray-400">Auto-print, drawer, dining</p>
                        </div>
                      </button>

                      {/* Printer Nav Item */}
                      <button
                        onClick={() => { setSettingsPanel('printer'); setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'printer'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'printer'
                            ? 'bg-orange-100 dark:bg-orange-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Printer size={16} className={settingsPanel === 'printer' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'printer' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Printer Setup</p>
                          <p className="text-[10px] text-gray-400">{savedPrinters.length > 0 ? savedPrinters[0].model : 'No printer configured'}</p>
                        </div>
                      </button>

                      {/* Receipt Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('receipt')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'receipt'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'receipt'
                            ? 'bg-orange-100 dark:bg-orange-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Receipt size={16} className={settingsPanel === 'receipt' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'receipt' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Receipt</p>
                          <p className="text-[10px] text-gray-400">Configure receipt layout</p>
                        </div>
                      </button>

                      {/* Payment Types Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('payment')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'payment'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'payment'
                            ? 'bg-green-100 dark:bg-green-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <CreditCard size={16} className={settingsPanel === 'payment' ? 'text-green-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'payment' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Payment Types</p>
                          <p className="text-[10px] text-gray-400">{paymentTypes.length} types</p>
                        </div>
                      </button>

                      {/* Taxes Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('taxes')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'taxes'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'taxes'
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Tag size={16} className={settingsPanel === 'taxes' ? 'text-amber-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'taxes' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Taxes</p>
                          <p className="text-[10px] text-gray-400">{taxEntries.length} configured</p>
                        </div>
                      </button>

                      {/* Staff Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('staff')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'staff'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'staff'
                            ? 'bg-orange-100 dark:bg-orange-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Users size={16} className={settingsPanel === 'staff' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'staff' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Staff Management</p>
                          <p className="text-[10px] text-gray-400">{staffList.length} member{staffList.length !== 1 ? 's' : ''}</p>
                        </div>
                      </button>

                      {/* User Experience Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('ux')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'ux'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'ux'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Type size={16} className={settingsPanel === 'ux' ? 'text-indigo-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'ux' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>User Experience</p>
                          <p className="text-[10px] text-gray-400">{userFont}</p>
                        </div>
                      </button>

                      {/* Kitchen Access Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('kitchen')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-gray-700 ${
                          settingsPanel === 'kitchen'
                            ? 'border-l-4 border-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'kitchen'
                            ? 'bg-rose-100 dark:bg-rose-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Coffee size={16} className={settingsPanel === 'kitchen' ? 'text-rose-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'kitchen' ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'
                          }`}>Kitchen Access</p>
                          <p className="text-[10px] text-gray-400">Control kitchen staff permissions</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Right Content Panel */}
                  <div className="w-[560px] shrink-0 min-h-0 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
                      <div className="max-w-lg">
                        {settingsPanel === 'features' && renderFeaturesContent()}
                        {settingsPanel === 'printer' && renderPrinterContent()}
                        {settingsPanel === 'receipt' && renderReceiptContent()}
                        {settingsPanel === 'payment' && renderPaymentTypesContent()}
                        {settingsPanel === 'taxes' && renderTaxesContent()}
                        {settingsPanel === 'staff' && renderStaffContent()}
                        {settingsPanel === 'ux' && renderUXContent()}
                        {settingsPanel === 'kitchen' && renderKitchenAccessContent()}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* Add Staff Modal */}
        {isAddStaffModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300">
              <button onClick={() => setIsAddStaffModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
              <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">Add Staff Member</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Username</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="e.g. cashier1"
                    value={newStaffUsername}
                    onChange={e => setNewStaffUsername(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Password</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="Set password"
                    value={newStaffPassword}
                    onChange={e => setNewStaffPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Email</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="staff@example.com"
                    value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="+60 XXX XXX XXXX"
                    value={newStaffPhone}
                    onChange={e => setNewStaffPhone(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setIsAddStaffModalOpen(false);
                      setNewStaffUsername('');
                      setNewStaffPassword('');
                      setNewStaffEmail('');
                      setNewStaffPhone('');
                    }}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (newStaffUsername.trim() && newStaffPassword.trim() && newStaffEmail.trim() && newStaffPhone.trim()) {
                        setIsAddingStaff(true);
                        try {
                          const newStaff = {
                            username: newStaffUsername,
                            password: newStaffPassword,
                            email: newStaffEmail,
                            phone: newStaffPhone,
                            restaurant_id: restaurant.id,
                            role: 'CASHIER',
                            is_active: true
                          };

                          const { data, error } = await supabase
                            .from('users')
                            .insert([newStaff])
                            .select();

                          if (error) {
                            toast('Error saving to database: ' + error.message, 'error');
                            setIsAddingStaff(false);
                            return;
                          }

                          const staffFromDb = data && data.length > 0 ? data[0] : newStaff;
                          const updated = [...staffList, staffFromDb];
                          setStaffList(updated);
                          localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));

                          setIsAddStaffModalOpen(false);
                          setNewStaffUsername('');
                          setNewStaffPassword('');
                          setNewStaffEmail('');
                          setNewStaffPhone('');
                          setIsAddingStaff(false);
                          toast('Staff member added successfully!', 'success');
                        } catch (error: any) {
                          toast('Error: ' + error.message, 'error');
                          setIsAddingStaff(false);
                        }
                      } else {
                        toast('Please fill in all fields', 'warning');
                      }
                    }}
                    disabled={isAddingStaff}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest shadow disabled:opacity-50"
                  >
                    {isAddingStaff ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Sidebar - Order Summary (Shared between Counter and QR Orders) */}
        {(activeTab === 'COUNTER' || (activeTab === 'QR_ORDERS' && selectedQrOrder)) && (
          <div className={`
            w-96 bg-white dark:bg-gray-800 border-l dark:border-gray-700 flex flex-col
            transform-gpu transition-all duration-300 ease-in-out
            ${activeTab === 'QR_ORDERS' ? (isOrderSummaryOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none') : ''}
          `}>
            <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-black dark:text-white uppercase tracking-tighter">
                {selectedQrOrder ? `Order #${selectedQrOrder.id}` : 'Current Order'}
              </h3>
              <div className="flex items-center gap-2">
                {selectedQrOrder && (
                  <button 
                    onClick={closeQrOrderSummary}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
                {!selectedQrOrder && (
                  <button 
                    onClick={() => setPosCart([])} 
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedQrOrder ? (
                // QR Order Items
                selectedQrOrder.items.map((item, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                        <p className="text-xs text-orange-500 font-black">{currencySymbol}{item.price.toFixed(2)} x{item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-xs dark:text-white">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                    
                    {/* Variants and Options */}
                    <div className="ml-4 space-y-1">
                      {item.selectedSize && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Size: {item.selectedSize}</p>
                      )}
                      {item.selectedTemp && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedTemp}</p>
                      )}
                      {item.selectedVariantOption && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Variant: {item.selectedVariantOption}</p>
                      )}
                      {item.selectedOtherVariant && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedOtherVariant}</p>
                      )}
                      
                      {/* Add-ons */}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <div className="mt-1">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Add-ons:</p>
                          {item.selectedAddOns.map((addon, addonIdx) => (
                            <p key={addonIdx} className="text-[9px] text-gray-500 dark:text-gray-400 ml-2">
                              • {addon.name} x{addon.quantity} (+{currencySymbol}{(addon.price * addon.quantity).toFixed(2)})
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                // Counter Cart Items
                posCart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                    <ShoppingBag size={48} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Cart is empty</p>
                  </div>
                ) : (
                  posCart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="flex items-center gap-4">
                      <div className="flex-1">
                        <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                        <p className="text-xs text-orange-500 font-black">{currencySymbol}{item.price.toFixed(2)}</p>
                        <div className="mt-1 space-y-0.5">
                          {item.selectedSize && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Size: {item.selectedSize}</p>}
                          {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedTemp}</p>}
                          {item.selectedVariantOption && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Variant: {item.selectedVariantOption}</p>}
                          {item.selectedOtherVariant && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedOtherVariant}</p>}
                          {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">
                              • Add-ons: {item.selectedAddOns.map(addon => `${addon.name} x${addon.quantity}`).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button 
                          onClick={() => updateQuantity(idx, -1)} 
                          className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-[10px] font-black w-4 text-center dark:text-white">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(idx, 1)} 
                          className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeFromPosCart(idx)} 
                        className="text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )
              )}
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-4">
              {showPaymentSuccess && (
                <div className="px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-300 text-[10px] font-black uppercase tracking-widest text-center">
                  Payment Completed Successfully
                </div>
              )}

              {!!checkoutNotice && (
                <div className="px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 text-[10px] font-black tracking-wide text-center">
                  {checkoutNotice}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <span>Subtotal</span>
                  <span>{currencySymbol}{selectedQrOrder ? selectedQrOrder.total.toFixed(2) : cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                  <span className="uppercase">Total</span>
                  <span className="text-orange-500">{currencySymbol}{selectedQrOrder ? selectedQrOrder.total.toFixed(2) : cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {selectedQrOrder ? (
                // QR Order Checkout
                <button 
                  onClick={handleQrCheckout}
                  disabled={isCompletingPayment || showPaymentSuccess}
                  className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Payment'}
                </button>
              ) : (
                // Counter Checkout
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Table</label>
                      <input 
                        type="text" 
                        value={posTableNo}
                        onChange={e => setPosTableNo(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white"
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Remark</label>
                      <input 
                        type="text" 
                        value={posRemark}
                        onChange={e => setPosRemark(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white"
                        placeholder="No spicy..."
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleCheckout}
                    disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                    className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Order'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Mobile Floating Cart Button */}
      {activeTab === 'COUNTER' && posCart.length > 0 && !showMobileCart && (
        <button
          onClick={() => setShowMobileCart(true)}
          className="lg:hidden fixed bottom-6 right-6 z-40 bg-orange-500 text-white w-16 h-16 rounded-full shadow-2xl shadow-orange-500/40 flex items-center justify-center active:scale-95 transition-transform"
        >
          <ShoppingBag size={24} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
            {posCart.reduce((sum, item) => sum + item.quantity, 0)}
          </span>
        </button>
      )}

      {/* Mobile Cart Drawer */}
      {showMobileCart && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileCart(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>
            <div className="px-5 py-3 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-black dark:text-white uppercase tracking-tighter text-base">
                Cart ({posCart.reduce((sum, item) => sum + item.quantity, 0)})
              </h3>
              <div className="flex items-center gap-3">
                <button onClick={() => setPosCart([])} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setShowMobileCart(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {posCart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter truncate">{item.name}</h4>
                    <p className="text-xs text-orange-500 font-black">{currencySymbol}{item.price.toFixed(2)}</p>
                    <div className="mt-0.5 space-y-0.5">
                      {item.selectedSize && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">• Size: {item.selectedSize}</p>}
                      {item.selectedTemp && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">• Temp: {item.selectedTemp}</p>}
                      {item.selectedVariantOption && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">• {item.selectedVariantOption}</p>}
                      {item.selectedOtherVariant && !item.selectedModifiers && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">• {item.otherVariantName || 'Option'}: {item.selectedOtherVariant}</p>}
                      {item.selectedModifiers && Object.entries(item.selectedModifiers).map(([modName, optName]) => (
                        optName && <p key={modName} className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">• {modName}: {optName}</p>
                      ))}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">
                          • Add-ons: {item.selectedAddOns.map(addon => `${addon.name} x${addon.quantity}`).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm shrink-0">
                    <button onClick={() => updateQuantity(idx, -1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"><Minus size={12} /></button>
                    <span className="text-xs font-black w-5 text-center dark:text-white">{item.quantity}</span>
                    <button onClick={() => updateQuantity(idx, 1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-all"><Plus size={12} /></button>
                  </div>
                  <button onClick={() => removeFromPosCart(idx)} className="text-gray-300 hover:text-red-500 shrink-0 p-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-3">
              {showPaymentSuccess && (
                <div className="px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-300 text-[10px] font-black uppercase tracking-widest text-center">
                  Payment Completed Successfully
                </div>
              )}
              {!!checkoutNotice && (
                <div className="px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 text-[10px] font-black tracking-wide text-center">
                  {checkoutNotice}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-black dark:text-white uppercase tracking-widest">Total</span>
                <span className="text-xl font-black text-orange-500">{currencySymbol}{cartTotal.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input type="text" value={posTableNo} onChange={e => setPosTableNo(e.target.value)} className="w-full p-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white" placeholder="Table" />
                </div>
                <div className="flex-[2]">
                  <input type="text" value={posRemark} onChange={e => setPosRemark(e.target.value)} className="w-full p-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white" placeholder="Remark..." />
                </div>
              </div>
              <button onClick={() => { setShowMobileCart(false); handleCheckout(); }} disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2">
                <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : `Pay ${currencySymbol}${cartTotal.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && pendingOrderData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center lg:p-4" onClick={() => !isCompletingPayment && !showPaymentResult && setShowPaymentModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-3xl shadow-2xl w-full lg:max-w-4xl h-[90vh] lg:h-[650px] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Payment Input View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-in-out ${showPaymentResult ? '-translate-x-full' : 'translate-x-0'}`}>
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={isCompletingPayment}
                className="absolute top-4 right-5 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50"
              >
                <X size={28} className="text-gray-400" />
              </button>

              <div className="flex-1 px-5 lg:px-8 pb-6 lg:pb-8 pt-[3.75rem] space-y-4 lg:space-y-6 overflow-y-auto">
                <div className="text-center space-y-2 lg:space-y-3">
                  <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Total Amount Due</label>
                  <div className="text-4xl lg:text-6xl font-black text-orange-500 tracking-tighter">
                    {currencySymbol}{pendingOrderData.total.toFixed(2)}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                  <div className="flex items-center justify-center border-b-2 dark:border-gray-600 border-gray-300 focus-within:border-orange-500 dark:focus-within:border-orange-500">
                    <span className="text-2xl font-black text-gray-600 dark:text-gray-400 pb-3">{currencySymbol}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cashAmountInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setCashAmountInput(val);
                        if (val === '' || val === '.') { setSelectedCashAmount(null); return; }
                        const parsed = parseFloat(val);
                        if (!isNaN(parsed)) setSelectedCashAmount(parsed);
                      }}
                      onBlur={() => {
                        if (selectedCashAmount !== null) {
                          const rounded = parseFloat(selectedCashAmount.toFixed(2));
                          setSelectedCashAmount(rounded);
                          setCashAmountInput(rounded.toFixed(2));
                        }
                      }}
                      placeholder="0.00"
                      className="flex-1 p-3 bg-transparent text-2xl font-black dark:text-white text-center focus:outline-none border-none"
                    />
                  </div>
                </div>

                <div className="space-y-2 lg:space-y-3">
                  <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Quick Select</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3">
                    {CASH_DENOMINATIONS.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => { setSelectedCashAmount(amount); setCashAmountInput(amount.toFixed(2)); }}
                        className={`p-3 rounded-xl font-black text-lg uppercase tracking-widest transition-all border-2 ${
                          selectedCashAmount === amount
                            ? 'bg-orange-500 text-white border-orange-600 shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500'
                        }`}
                      >
                        {currencySymbol} {amount.toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 lg:space-y-3">
                  <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Payment Method</label>
                  <select
                    value={selectedPaymentType}
                    onChange={(e) => setSelectedPaymentType(e.target.value)}
                    className="w-full p-3 lg:p-4 bg-white dark:bg-gray-700 border-2 dark:border-gray-600 rounded-xl text-base lg:text-lg font-black dark:text-white focus:outline-none focus:border-orange-500 dark:focus:border-orange-500"
                  >
                    {paymentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="px-5 lg:px-8 py-4 lg:py-5 border-t dark:border-gray-700 flex gap-3 lg:gap-4 flex-shrink-0">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isCompletingPayment}
                  className="flex-1 py-2 lg:py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={isCompletingPayment || !selectedPaymentType}
                  className="flex-1 py-2 lg:py-3 bg-orange-500 text-white rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-1 lg:gap-3"
                >
                  {isCompletingPayment ? (
                    <>
                      <div className="w-4 h-4 lg:w-5 lg:h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} className="lg:hidden" /><CreditCard size={24} className="hidden lg:block" /> Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Payment Result View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-in-out ${showPaymentResult ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="px-8 py-5 border-b dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-2xl">Payment Complete</h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-3xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    <div className="sm:pr-8 text-center sm:text-right sm:border-r-2 border-dotted dark:border-gray-700 pb-4 sm:pb-0">
                      <div className="text-3xl lg:text-5xl font-black text-green-500 tracking-tighter">
                        {currencySymbol}{(selectedCashAmount || 0).toFixed(2)}
                      </div>
                      <label className="block mt-2 lg:mt-3 text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Total Paid</label>
                    </div>
                    <div className="sm:pl-8 text-center sm:text-left border-t sm:border-t-0 border-dotted dark:border-gray-700 pt-4 sm:pt-0">
                      <div className="text-3xl lg:text-5xl font-black text-blue-500 tracking-tighter">
                        {currencySymbol}{Math.max(0, (selectedCashAmount || 0) - pendingOrderData.total).toFixed(2)}
                      </div>
                      <label className="block mt-2 lg:mt-3 text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Total Change</label>
                    </div>
                  </div>
                </div>
                <div className="w-full max-w-3xl mt-8 text-center">
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">Please make sure all the balances are correct before completing the payment.</p>
                </div>
              </div>
              <div className="px-8 py-5 border-t dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={finalizePaymentFlow}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-lg uppercase tracking-wider hover:bg-orange-600 transition-all"
                >
                  Complete Payment
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Order Detail Popup from Report */}
      {selectedReportOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedReportOrder(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter">Order #{selectedReportOrder.id}</h3>
                <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5">
                  {new Date(selectedReportOrder.timestamp).toLocaleDateString()} {new Date(selectedReportOrder.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setSelectedReportOrder(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Table</span>
                <span className="text-xs font-black dark:text-white">#{selectedReportOrder.tableNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</span>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                  selectedReportOrder.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' :
                  selectedReportOrder.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                  selectedReportOrder.status === OrderStatus.CANCELLED ? 'bg-red-100 text-red-600' :
                  'bg-orange-100 text-orange-600'
                }`}>
                  {selectedReportOrder.status === OrderStatus.COMPLETED ? 'Paid' : selectedReportOrder.status === OrderStatus.SERVED ? 'Served' : selectedReportOrder.status === OrderStatus.CANCELLED ? 'Refunded' : selectedReportOrder.status}
                </span>
              </div>

              <div className="border-t dark:border-gray-700 pt-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Items</p>
                <div className="space-y-2">
                  {selectedReportOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold dark:text-white">{item.quantity}x {item.name}</p>
                        {item.selectedSize && <p className="text-[9px] text-gray-400 ml-3">-Size: {item.selectedSize}</p>}
                        {item.selectedTemp && <p className="text-[9px] text-gray-400 ml-3">-Temperature: {item.selectedTemp}</p>}
                        {item.selectedVariantOption && <p className="text-[9px] text-gray-400 ml-3">-Variant: {item.selectedVariantOption}</p>}
                        {item.selectedOtherVariant && !item.selectedModifiers && <p className="text-[9px] text-gray-400 ml-3">-{item.otherVariantName ? item.otherVariantName.charAt(0).toUpperCase() + item.otherVariantName.slice(1) : 'Option'}: {item.selectedOtherVariant}</p>}
                        {item.selectedModifiers && Object.entries(item.selectedModifiers).map(([modName, optName]) => (
                          optName && <p key={modName} className="text-[9px] text-gray-400 ml-3">-{modName.charAt(0).toUpperCase() + modName.slice(1)}: {optName}</p>
                        ))}
                        {item.selectedAddOns?.map((addon, aIdx) => (
                          <p key={aIdx} className="text-[9px] text-gray-400 ml-3">-{addon.name}{addon.quantity > 1 ? ` x${addon.quantity}` : ''}</p>
                        ))}
                      </div>
                      <span className="text-xs font-bold dark:text-white shrink-0 ml-2">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedReportOrder.remark && (
                <div className="border-t dark:border-gray-700 pt-3">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Remark</p>
                  <p className="text-xs dark:text-gray-300">{selectedReportOrder.remark}</p>
                </div>
              )}

              <div className="border-t dark:border-gray-700 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black dark:text-white uppercase tracking-widest">Total</span>
                  <span className="text-lg font-black text-orange-500">{currencySymbol}{selectedReportOrder.total.toFixed(2)}</span>
                </div>
                {selectedReportOrder.amountReceived != null && (
                  <>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Amount Received</span>
                      <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{currencySymbol}{selectedReportOrder.amountReceived.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Change</span>
                      <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{currencySymbol}{(selectedReportOrder.changeAmount ?? Math.max(0, selectedReportOrder.amountReceived - selectedReportOrder.total)).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {selectedReportOrder.status === OrderStatus.CANCELLED ? (
                <div className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest text-center">
                  This order has been refunded
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!connectedDevice) {
                        toast('Printer is not connected. Please connect a printer to reprint.', 'warning');
                        return;
                      }
                      const printRestaurant = {
                        ...restaurant,
                        name: receiptSettings.businessName.trim() || restaurant.name,
                      };
                      const orderForPrint = {
                        id: selectedReportOrder.id,
                        tableNumber: selectedReportOrder.tableNumber,
                        timestamp: selectedReportOrder.timestamp,
                        total: selectedReportOrder.total,
                        items: selectedReportOrder.items,
                        remark: selectedReportOrder.remark || '',
                      };
                      try {
                        await printerService.printReceipt(orderForPrint, printRestaurant, getReceiptPrintOptions());
                      } catch (err) {
                        console.error('Reprint error:', err);
                      }
                      setSelectedReportOrder(null);
                    }}
                    className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                  >
                    <Printer size={14} /> Reprint Receipt
                  </button>
                  <button
                    onClick={() => setShowRefundConfirm(true)}
                    className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={14} /> Refund
                  </button>
                </div>
              )}

              {/* Refund Confirmation Modal */}
              {showRefundConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowRefundConfirm(false)}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-6 text-center">
                      <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <RotateCcw size={28} className="text-red-500" />
                      </div>
                      <h3 className="text-lg font-black dark:text-white uppercase tracking-tight mb-2">Confirm Refund</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Are you sure you want to refund Order <span className="font-bold text-gray-700 dark:text-gray-200">#{selectedReportOrder.id}</span>? This action cannot be undone.</p>
                    </div>
                    <div className="flex border-t dark:border-gray-700">
                      <button
                        onClick={() => setShowRefundConfirm(false)}
                        className="flex-1 py-4 text-sm font-black uppercase tracking-widest text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          handleOrderStatusUpdate(selectedReportOrder.id, OrderStatus.CANCELLED);
                          toast('Order has been refunded.', 'success');
                          setShowRefundConfirm(false);
                          setSelectedReportOrder(null);
                        }}
                        className="flex-1 py-4 text-sm font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border-l dark:border-gray-700"
                      >
                        Refund
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ItemOptionsModal
        item={selectedItemForOptions}
        restaurantId={restaurant.id}
        onClose={() => setSelectedItemForOptions(null)}
        onConfirm={(item) => {
          addToPosCart(item);
          setSelectedItemForOptions(null);
        }}
      />

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes slideLeft {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-left {
          animation: slideLeft 0.3s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default PosView;
