// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption, QS_DEFAULT_HUB, Subscription, PlanId, KitchenDepartment } from '../src/types';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { saveAllSettingsToDb } from '../lib/sharedSettings';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions } from '../services/printerService';
import MenuItemFormModal, { MenuFormItem } from '../components/MenuItemFormModal';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';
import StandardReport from '../components/StandardReport';
import UpgradePlanModal from '../components/UpgradePlanModal';
import BillingPage from './BillingPage';
import {
  ShoppingBag, Search, Download, Calendar,
  Printer, QrCode, CreditCard, Trash2, Plus, Minus, LayoutGrid,
  List, Clock, CheckCircle, CheckCircle2, BarChart3, Hash, Menu, Settings, BookOpen,
  X, Edit3, Archive, RotateCcw, Upload, Eye,
  AlertCircle, Users, UserPlus, Bluetooth, BluetoothConnected, PrinterIcon,
  Filter, Tag, Layers, Coffee, ChevronDown, ChevronLeft, ChevronRight, RotateCw, Wifi, WifiOff,
  Receipt, Network, Type, MessageSquare, Zap
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus, paymentDetails?: { paymentMethod?: string; cashierName?: string; amountReceived?: number; changeAmount?: number }) => void;
  onKitchenUpdateOrder?: (orderId: string, status: OrderStatus, rejectionReason?: string, rejectionNote?: string) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string, paymentMethod?: string, cashierName?: string, amountReceived?: number) => Promise<string>;
  onUpdateMenu?: (restaurantId: string, updatedItem: MenuItem) => void | Promise<void>;
  onAddMenuItem?: (restaurantId: string, newItem: MenuItem) => void | Promise<void>;
  onPermanentDeleteMenuItem?: (restaurantId: string, itemId: string) => void | Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  isOnline?: boolean;
  pendingOfflineOrdersCount?: number;
  cashierName?: string;
  showQrOrders?: boolean;
  onToggleOnline?: () => void;
  lastSyncTime?: Date;
  userRole?: string;
  userKitchenCategories?: string[];
  onSaveKitchenDivisions?: (divisions: KitchenDepartment[]) => void;
  subscription?: Subscription | null;
  onSubscriptionUpdated?: () => void;
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
      const categories: string[] = Array.isArray(entry.categories)
        ? entry.categories.map((c: any) => String(c || '').trim()).filter(Boolean)
        : [];
      return {
        name,
        categories: Array.from(new Set<string>(categories)).sort((a, b) => a.localeCompare(b)),
      };
    })
    .filter(Boolean) as KitchenDepartment[];
};

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
  savedBillEnabled: boolean;
  tableManagementEnabled: boolean;
  tableCount: number;
  tableRows: number;
  tableColumns: number;
  customerDisplayEnabled: boolean;
  kitchenEnabled: boolean;
  qrEnabled: boolean;
}

const getDefaultFeatureSettings = (): FeatureSettings => ({
  autoPrintReceipt: false,
  autoOpenDrawer: false,
  dineInEnabled: false,
  takeawayEnabled: false,
  deliveryEnabled: false,
  savedBillEnabled: false,
  tableManagementEnabled: false,
  tableCount: 12,
  tableRows: 3,
  tableColumns: 4,
  customerDisplayEnabled: false,
  kitchenEnabled: false,
  qrEnabled: false,
});

const REJECTION_REASONS = [
  'Item out of stock',
  'Kitchen too busy',
  'Restaurant closed early',
  'Other'
];

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

interface SavedBillEntry {
  id: string;
  items: CartItem[];
  remark: string;
  tableNumber: string;
  createdAt: number;
}

type SettingsPanel = 'builtin' | 'table' | 'kitchen' | 'qr' | 'printer' | 'receipt' | 'payment' | 'staff' | 'ux';

const PosOnlyView: React.FC<Props> = ({
  restaurant,
  orders,
  onUpdateOrder,
  onKitchenUpdateOrder,
  onPlaceOrder,
  onUpdateMenu,
  onAddMenuItem,
  onPermanentDeleteMenuItem,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  isOnline = true,
  pendingOfflineOrdersCount = 0,
  cashierName,
  showQrOrders = false,
  onToggleOnline,
  lastSyncTime,
  userRole = 'VENDOR',
  userKitchenCategories,
  onSaveKitchenDivisions,
  subscription = null,
  onSubscriptionUpdated,
}) => {
  const toLocalDateInputValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };

  const [activeTab, setActiveTab] = useState<'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING'>(userRole === 'KITCHEN' ? 'KITCHEN' : 'COUNTER');
  const [counterMode, setCounterMode] = useState<'SAVED_BILL' | 'COUNTER_ORDER' | 'QR_ORDER'>('COUNTER_ORDER');
  const [selectedQrOrderForPayment, setSelectedQrOrderForPayment] = useState<Order | null>(null);
  const [qrOrderFilter, setQrOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'ALL'>('ONGOING_ALL');
  const [rejectingQrOrderId, setRejectingQrOrderId] = useState<string | null>(null);
  const [qrRejectionReason, setQrRejectionReason] = useState('Item out of stock');
  const [qrRejectionNote, setQrRejectionNote] = useState('');

  // Kitchen state
  const [kitchenOrderFilter, setKitchenOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'ALL'>('ONGOING_ALL');
  const [rejectingKitchenOrderId, setRejectingKitchenOrderId] = useState<string | null>(null);
  const [kitchenRejectionReason, setKitchenRejectionReason] = useState('Item out of stock');
  const [kitchenRejectionNote, setKitchenRejectionNote] = useState('');
  const [kitchenOrderSettings, setKitchenOrderSettings] = useState<{ autoAccept: boolean; autoPrint: boolean }>(() => {
    const dbSaved = restaurant.settings?.kitchenSettings;
    if (dbSaved && typeof dbSaved === 'object') return { ...{ autoAccept: false, autoPrint: false }, ...dbSaved };
    const saved = localStorage.getItem(`kitchen_settings_${restaurant.id}`);
    return saved ? JSON.parse(saved) : { autoAccept: false, autoPrint: false };
  });
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [kitchenPrintingOrderId, setKitchenPrintingOrderId] = useState<string | null>(null);
  const [kitchenDivisions, setKitchenDivisions] = useState<KitchenDepartment[]>(() => normalizeKitchenDepartments(restaurant.kitchenDivisions));
  const [newDivisionName, setNewDivisionName] = useState('');
  const [renamingDepartment, setRenamingDepartment] = useState<string | null>(null);
  const [renameDepartmentValue, setRenameDepartmentValue] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'CASHIER' | 'KITCHEN'>('CASHIER');
  const [newStaffKitchenCategories, setNewStaffKitchenCategories] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'grid-6' | 'list'>('grid-5');
  const [mobileMenuLayout, setMobileMenuLayout] = useState<'2' | '3' | 'list'>('3');
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posRemark, setPosRemark] = useState('');
  const [posTableNo, setPosTableNo] = useState('Counter');
  const [savedBills, setSavedBills] = useState<SavedBillEntry[]>(() => {
    const saved = localStorage.getItem(`saved_bills_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeSavedBillTable, setActiveSavedBillTable] = useState<string | null>(null);
  const [showSaveBillTableModal, setShowSaveBillTableModal] = useState(false);
  const [pendingSaveBillSource, setPendingSaveBillSource] = useState<'COUNTER' | 'QR' | null>(null);
  const [selectedSaveTableNumber, setSelectedSaveTableNumber] = useState<string>('');
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedItemForOptions, setSelectedItemForOptions] = useState<MenuItem | null>(null);

  // Menu Editor State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [menuStatusFilter, setMenuStatusFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [menuViewMode, setMenuViewMode] = useState<'grid' | 'list'>('grid');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('All');
  const [menuSubTab, setMenuSubTab] = useState<'KITCHEN' | 'CATEGORY' | 'MODIFIER'>('KITCHEN');
  const [isSavingMenuItem, setIsSavingMenuItem] = useState(false);
  const [formItem, setFormItem] = useState<MenuFormItem>({
    name: '',
    description: '',
    price: 0,
    image: '',
    category: '',
    isArchived: false,
    sizes: [],
    sizesEnabled: false,
    otherVariantName: '',
    otherVariants: [],
    otherVariantsEnabled: false,
    linkedModifiers: [],
    tempOptions: { enabled: false, hot: 0, cold: 0 },
    addOns: [],
  });

  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddModifierModal, setShowAddModifierModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [extraCategories, setExtraCategories] = useState<CategoryData[]>([]);
  const [modifiers, setModifiers] = useState<ModifierData[]>([]);

  const [classViewMode, setClassViewMode] = useState<'grid' | 'list'>('list');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [modifierViewMode, setModifierViewMode] = useState<'grid' | 'list'>('list');
  const [renamingModifier, setRenamingModifier] = useState<string | null>(null);
  const [editingModifierName, setEditingModifierName] = useState<string | null>(null);
  const [tempModifierName, setTempModifierName] = useState('');
  const [tempModifierOptions, setTempModifierOptions] = useState<ModifierOption[]>([]);
  const [tempModifierRequired, setTempModifierRequired] = useState(false);

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
  const [reportsSubMenu, setReportsSubMenu] = useState<'salesReport' | 'statistics'>('salesReport');

  // Printer Settings State
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [printerStatus, setPrinterStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [realPrinterConnected, setRealPrinterConnected] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => getDefaultReceiptSettings(restaurant.name));
  const [isSavingReceiptSettings, setIsSavingReceiptSettings] = useState(false);
  const [receiptSettingsSaved, setReceiptSettingsSaved] = useState(false);
  const [selectedReportOrder, setSelectedReportOrder] = useState<Order | null>(null);
  const [receiptAccordion, setReceiptAccordion] = useState({ content: true, fields: false, orderCode: false });

  // Ordering Number Code — custom prefix for order IDs
  const [orderCode, setOrderCode] = useState<string>('');
  const [isSavingOrderCode, setIsSavingOrderCode] = useState(false);

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
  const [editingStaffIndex, setEditingStaffIndex] = useState<number | null>(null);
  const isEditingStaff = editingStaffIndex !== null;

  // User Experience settings
  const FONT_OPTIONS = ['Inter', 'Roboto', 'Poppins', 'Open Sans', 'Lato', 'Nunito', 'Montserrat', 'Raleway'];
  const [userFont, setUserFont] = useState<string>(() =>
    restaurant.settings?.font || localStorage.getItem(`ux_font_${restaurant.id}`) || 'Inter'
  );

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
  const [userCurrency, setUserCurrency] = useState<string>(() =>
    restaurant.settings?.currency || localStorage.getItem(`ux_currency_${restaurant.id}`) || 'MYR'
  );
  const currencySymbol = CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.symbol || 'RM';

  // Settings panel navigation
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('builtin');
  const [paymentTaxAccordion, setPaymentTaxAccordion] = useState({ paymentTypes: false, taxes: false });
  const [builtInFeatureSections, setBuiltInFeatureSections] = useState({ cashier: true, dining: false });

  // Feature settings
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>(() => {
    const defaults = getDefaultFeatureSettings();
    // Priority 1: DB settings (cross-device)
    const dbSaved = restaurant.settings?.features;
    if (dbSaved && typeof dbSaved === 'object') {
      const merged = { ...defaults, ...dbSaved };
      if (restaurant.kitchenEnabled && !merged.kitchenEnabled) merged.kitchenEnabled = true;
      return merged;
    }
    // Priority 2: localStorage (same-device offline cache)
    const saved = localStorage.getItem(`features_${restaurant.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged = { ...defaults, ...parsed };
        if (restaurant.kitchenEnabled && !merged.kitchenEnabled) merged.kitchenEnabled = true;
        return merged;
      } catch {}
    }
    if (restaurant.kitchenEnabled) defaults.kitchenEnabled = true;
    return defaults;
  });
  const [tableCountDraft, setTableCountDraft] = useState<string>('12');
  const [tableRowsDraft, setTableRowsDraft] = useState<string>('3');
  const [tableColumnsDraft, setTableColumnsDraft] = useState<string>('4');
  const [tableColPage, setTableColPage] = useState(0);
  const tableSwipeStartX = useRef<number | null>(null);

  // Payment types
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>(() => {
    const dbSaved = restaurant.settings?.paymentTypes;
    if (Array.isArray(dbSaved) && dbSaved.length > 0) return dbSaved;
    const saved = localStorage.getItem(`payment_types_${restaurant.id}`);
    return saved ? JSON.parse(saved) : getDefaultPaymentTypes();
  });
  const [newPaymentTypeName, setNewPaymentTypeName] = useState('');

  // Tax entries
  const [taxEntries, setTaxEntries] = useState<TaxEntry[]>(() => {
    const dbSaved = restaurant.settings?.taxes;
    if (Array.isArray(dbSaved)) return dbSaved;
    const saved = localStorage.getItem(`taxes_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxPercentage, setNewTaxPercentage] = useState('');
  const [newTaxApplyToItems, setNewTaxApplyToItems] = useState(false);

  // QR Generator state
  const [qrGenLocation, setQrGenLocation] = useState<string>(() => '');
  const [qrGenTableCount, setQrGenTableCount] = useState<string>('5');
  const [qrGenTablePrefix, setQrGenTablePrefix] = useState<string>('Table ');
  const [qrGenStartNum, setQrGenStartNum] = useState<string>('1');
  const [qrGenPreviewTable, setQrGenPreviewTable] = useState<string>('');

  // Saved printers list
  const [savedPrinters, setSavedPrinters] = useState<SavedPrinter[]>(() => {
    const dbSaved = restaurant.settings?.printers;
    if (Array.isArray(dbSaved) && dbSaved.length > 0) return dbSaved as SavedPrinter[];
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

  // Counter Orders Cache State - For local caching strategy
  const [cachedCounterOrders, setCachedCounterOrders] = useState<Order[]>(() => {
    return counterOrdersCache.getCachedCounterOrders(restaurant.id);
  });
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCashAmount, setSelectedCashAmount] = useState<number | null>(null);
  const [cashAmountInput, setCashAmountInput] = useState<string>('');
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('');
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [isQrPaymentMode, setIsQrPaymentMode] = useState(false);

  const CASH_DENOMINATIONS = [10, 20, 50, 100];

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

  const resetStaffForm = () => {
    setNewStaffUsername('');
    setNewStaffPassword('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffRole('CASHIER');
    setNewStaffKitchenCategories([]);
  };

  const openAddStaffModal = (initialRole: 'CASHIER' | 'KITCHEN' = 'CASHIER') => {
    setEditingStaffIndex(null);
    resetStaffForm();
    setNewStaffRole(initialRole);
    setIsAddStaffModalOpen(true);
  };

  const handleEditStaff = (staff: any, index: number) => {
    setEditingStaffIndex(index);
    setNewStaffUsername(staff.username || '');
    setNewStaffPassword('');
    setNewStaffEmail(staff.email || '');
    setNewStaffPhone(staff.phone || '');
    const mappedRole: 'CASHIER' | 'KITCHEN' = staff.role === 'KITCHEN' ? 'KITCHEN' : 'CASHIER';
    setNewStaffRole(mappedRole);
    setNewStaffKitchenCategories(
      mappedRole === 'KITCHEN' && Array.isArray(staff.kitchen_categories)
        ? staff.kitchen_categories
        : []
    );
    setIsAddStaffModalOpen(true);
  };

  const handleSaveStaff = async () => {
    const username = newStaffUsername.trim();
    const password = newStaffPassword.trim();
    const email = newStaffEmail.trim();
    const phone = newStaffPhone.trim();

    if (!username || !email || !phone || (!isEditingStaff && !password)) {
      toast(isEditingStaff ? 'Please fill in username, email and phone' : 'Please fill in all fields', 'warning');
      return;
    }

    setIsAddingStaff(true);
    try {
      const basePayload: Record<string, any> = {
        username,
        email,
        phone,
        restaurant_id: restaurant.id,
        role: newStaffRole,
        is_active: true,
        kitchen_categories: newStaffRole === 'KITCHEN' && newStaffKitchenCategories.length > 0 ? newStaffKitchenCategories : null,
      };

      if (isEditingStaff) {
        const currentStaff = staffList[editingStaffIndex!];
        const payload: Record<string, any> = { ...basePayload };
        if (password) payload.password = password;

        if (currentStaff?.id) {
          const { data, error } = await supabase
            .from('users')
            .update(payload)
            .eq('id', currentStaff.id)
            .select()
            .single();

          if (error) {
            toast('Error updating user: ' + error.message, 'error');
            setIsAddingStaff(false);
            return;
          }

          const updated = [...staffList];
          updated[editingStaffIndex!] = data;
          setStaffList(updated);
          localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
        } else {
          const updated = [...staffList];
          updated[editingStaffIndex!] = {
            ...updated[editingStaffIndex!],
            ...payload,
            kitchen_categories: payload.kitchen_categories,
          };
          setStaffList(updated);
          localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
        }

        toast('User updated successfully!', 'success');
      } else {
        const newStaff: Record<string, any> = {
          ...basePayload,
          password,
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
        toast('Staff member added successfully!', 'success');
      }

      setIsAddStaffModalOpen(false);
      setEditingStaffIndex(null);
      resetStaffForm();
      setIsAddingStaff(false);
    } catch (error: any) {
      toast('Error: ' + error.message, 'error');
      setIsAddingStaff(false);
    }
  };

  const handleOpenAddModal = (initialCategory?: string) => {
    setEditingItem(null);
    const defaultCategory = initialCategory || menuEditorCategories.find(c => c !== 'All') || '';
    setFormItem({
      name: '',
      description: '',
      price: 0,
      image: '',
      category: defaultCategory,
      isArchived: false,
      sizes: [],
      sizesEnabled: false,
      otherVariantName: '',
      otherVariants: [],
      otherVariantsEnabled: false,
      linkedModifiers: [],
      tempOptions: { enabled: false, hot: 0, cold: 0, options: [] },
      variantOptions: { enabled: false, options: [] },
      addOns: [],
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    // Backward compat: if linkedModifiers is empty but otherVariantName exists, seed from old field
    const linked = item.linkedModifiers && item.linkedModifiers.length > 0
      ? [...item.linkedModifiers]
      : (item.otherVariantsEnabled && item.otherVariantName ? [item.otherVariantName] : []);
    setFormItem({
      ...item,
      sizes: item.sizes ? [...item.sizes] : [],
      sizesEnabled: !!(item.sizes && item.sizes.length > 0),
      otherVariantName: item.otherVariantName || '',
      otherVariants: item.otherVariants ? [...item.otherVariants] : [],
      otherVariantsEnabled: !!item.otherVariantsEnabled,
      linkedModifiers: linked,
      tempOptions: item.tempOptions ? { ...item.tempOptions, options: item.tempOptions.options ? [...item.tempOptions.options] : [] } : { enabled: false, hot: 0, cold: 0, options: [] },
      variantOptions: item.variantOptions ? { ...item.variantOptions, options: item.variantOptions.options ? [...item.variantOptions.options] : [] } : { enabled: false, options: [] },
      addOns: item.addOns ? [...item.addOns] : [],
    });
    setIsFormModalOpen(true);
  };

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false);
    setEditingItem(null);
    setFormItem({
      name: '',
      description: '',
      price: 0,
      image: '',
      category: '',
      isArchived: false,
      sizes: [],
      sizesEnabled: false,
      otherVariantName: '',
      otherVariants: [],
      otherVariantsEnabled: false,
      linkedModifiers: [],
      tempOptions: { enabled: false, hot: 0, cold: 0, options: [] },
      variantOptions: { enabled: false, options: [] },
      addOns: [],
    });
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const publicUrl = await uploadImage(file, 'quickserve', 'menu-items');
      setFormItem(prev => ({ ...prev, image: publicUrl }));
    } catch (error) {
      console.error('Upload failed:', error);
      toast('Failed to upload image. Please try again.', 'error');
    }
  };

  const handleSaveMenuItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formItem.name?.trim()) {
      toast('Please enter item name', 'warning');
      return;
    }
    if (!formItem.category?.trim()) {
      toast('Please enter category', 'warning');
      return;
    }
    if (!onAddMenuItem && !onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }

    const linked = formItem.linkedModifiers || [];
    const payload: MenuItem = {
      id: editingItem?.id || crypto.randomUUID(),
      name: formItem.name.trim(),
      description: (formItem.description || '').trim(),
      price: Number(formItem.price || 0),
      image: (formItem.image || '').trim() || `https://picsum.photos/seed/${encodeURIComponent(formItem.name.trim())}/300/300`,
      category: formItem.category.trim(),
      isArchived: editingItem?.isArchived || false,
      sizes: formItem.sizesEnabled ? formItem.sizes : [],
      tempOptions: formItem.tempOptions?.enabled ? formItem.tempOptions : undefined,
      variantOptions: formItem.variantOptions?.enabled ? formItem.variantOptions : undefined,
      // Backward compat: set first linked modifier as otherVariantName
      otherVariantName: linked[0] || '',
      otherVariants: [],
      otherVariantsEnabled: linked.length > 0,
      linkedModifiers: linked,
      addOns: formItem.addOns || [],
    };

    setIsSavingMenuItem(true);
    try {
      if (editingItem) {
        await onUpdateMenu?.(restaurant.id, payload);
      } else {
        await onAddMenuItem?.(restaurant.id, payload);
      }
      handleCloseFormModal();
    } catch (error: any) {
      toast('Failed to save menu item: ' + error.message, 'error');
    } finally {
      setIsSavingMenuItem(false);
    }
  };

  const handleArchiveItem = async (item: MenuItem) => {
    if (!onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }
    await onUpdateMenu(restaurant.id, { ...item, isArchived: true });
  };

  const handleRestoreItem = async (item: MenuItem) => {
    if (!onUpdateMenu) {
      toast('Menu editing is not enabled for this account.', 'warning');
      return;
    }
    await onUpdateMenu(restaurant.id, { ...item, isArchived: false });
  };

  const handlePermanentDelete = async (itemId: string) => {
    if (!onPermanentDeleteMenuItem) {
      toast('Permanent delete is not enabled for this account.', 'warning');
      return;
    }
    if (!confirm('Are you sure you want to permanently delete this item?')) return;
    await onPermanentDeleteMenuItem(restaurant.id, itemId);
  };

  const categories = useMemo(() => {
    const cats = Array.from(new Set(restaurant.menu.map(item => item.category))).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...cats];
  }, [restaurant.menu]);

  const allFoodCategories = useMemo(() => {
    const base = new Set<string>();
    restaurant.menu.forEach(item => {
      if (item.category?.trim()) base.add(item.category.trim());
    });
    extraCategories.forEach(category => {
      if (category.name?.trim()) base.add(category.name.trim());
    });
    return Array.from(base).sort((a, b) => a.localeCompare(b));
  }, [restaurant.menu, extraCategories]);

  const menuEditorCategories = useMemo(() => {
    const base = new Set(restaurant.menu.map(item => item.category));
    extraCategories.forEach(category => base.add(category.name));
    return ['All', ...Array.from(base)];
  }, [restaurant.menu, extraCategories]);

  const currentMenu = useMemo(() => {
    return restaurant.menu.filter(item => {
      const statusMatch = menuStatusFilter === 'ACTIVE' ? !item.isArchived : !!item.isArchived;
      const categoryMatch = menuCategoryFilter === 'All' || item.category === menuCategoryFilter;
      return statusMatch && categoryMatch;
    });
  }, [restaurant.menu, menuStatusFilter, menuCategoryFilter]);

  const filteredMenu = useMemo(() => {
    return restaurant.menu.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(menuSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      return matchesSearch && matchesCategory && !item.isArchived;
    });
  }, [restaurant.menu, menuSearch, selectedCategory]);

  const groupedMenu = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    const cats = selectedCategory === 'ALL' ? categories.filter(c => c !== 'ALL').sort((a, b) => a.localeCompare(b)) : [selectedCategory];
    
    cats.forEach(cat => {
      const items = filteredMenu.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
      if (items.length > 0) groups[cat] = items;
    });
    return groups;
  }, [filteredMenu, selectedCategory, categories]);

  useEffect(() => {
    setKitchenDivisions(normalizeKitchenDepartments(restaurant.kitchenDivisions));
  }, [restaurant.kitchenDivisions]);

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
      JSON.stringify(first.selectedModifiers || {}) === JSON.stringify(second.selectedModifiers || {}) &&
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
    console.log('PosOnlyView: Menu item clicked', { itemName: item.name, itemId: item.id });
    
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
      variantOptions: item.variantOptions && typeof item.variantOptions === 'object'
        ? {
            enabled: item.variantOptions.enabled === true,
            options: Array.isArray(item.variantOptions.options) ? item.variantOptions.options : [],
          }
        : { enabled: false, options: [] },
    };

    const hasOptions =
      (sanitizedItem.sizes && sanitizedItem.sizes.length > 0) ||
      (sanitizedItem.tempOptions && sanitizedItem.tempOptions.enabled) ||
      (sanitizedItem.variantOptions && sanitizedItem.variantOptions.enabled) ||
      (sanitizedItem.linkedModifiers && sanitizedItem.linkedModifiers.length > 0) ||
      (sanitizedItem.otherVariantsEnabled && sanitizedItem.otherVariants && sanitizedItem.otherVariants.length > 0) ||
      (sanitizedItem.addOns && sanitizedItem.addOns.length > 0);

    console.log('PosOnlyView: Checking if item has options', { hasOptions, sanitizedItem });

    if (hasOptions) {
      console.log('PosOnlyView: Setting selected item for options modal');
      setSelectedItemForOptions(sanitizedItem);
      return;
    }

    console.log('PosOnlyView: No options, adding directly to cart');
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

  const activeTaxEntries = useMemo(() => {
    return taxEntries.filter(tax => tax.applyToItems);
  }, [taxEntries]);

  const cartTaxLines = useMemo(() => {
    return activeTaxEntries.map(tax => ({
      id: tax.id,
      name: tax.name,
      percentage: tax.percentage,
      amount: (cartTotal * tax.percentage) / 100,
    }));
  }, [activeTaxEntries, cartTotal]);
  const cartTaxTotal = useMemo(() => cartTaxLines.reduce((sum, tax) => sum + tax.amount, 0), [cartTaxLines]);
  const cartGrandTotal = useMemo(() => cartTotal + cartTaxTotal, [cartTotal, cartTaxTotal]);

  const selectedQrOrderSubtotal = selectedQrOrderForPayment?.total ?? 0;
  const selectedQrTaxLines = useMemo(() => {
    return activeTaxEntries.map(tax => ({
      id: tax.id,
      name: tax.name,
      percentage: tax.percentage,
      amount: (selectedQrOrderSubtotal * tax.percentage) / 100,
    }));
  }, [activeTaxEntries, selectedQrOrderSubtotal]);
  const selectedQrTaxTotal = useMemo(() => selectedQrTaxLines.reduce((sum, tax) => sum + tax.amount, 0), [selectedQrTaxLines]);
  const selectedQrGrandTotal = useMemo(() => selectedQrOrderSubtotal + selectedQrTaxTotal, [selectedQrOrderSubtotal, selectedQrTaxTotal]);

  const effectiveTableCount = Math.max(1, Number(featureSettings.tableCount) || 1);
  const effectiveTableCols = Math.min(20, Math.max(1, Number(featureSettings.tableColumns) || 1));
  const effectiveTableRows = Math.ceil(effectiveTableCount / effectiveTableCols);

  const tableLabels = useMemo(() => {
    return Array.from({ length: effectiveTableCount }, (_, idx) => `Table ${idx + 1}`);
  }, [effectiveTableCount]);

  const tableRowsForSelection = useMemo(() => {
    const rows: string[][] = [];
    for (let r = 0; r < effectiveTableRows; r++) {
      const start = r * effectiveTableCols;
      const row = tableLabels.slice(start, start + effectiveTableCols);
      if (row.length > 0) rows.push(row);
    }
    return rows;
  }, [effectiveTableRows, effectiveTableCols, tableLabels]);

  const savedBillsByTable = useMemo(() => {
    const map = new Map<string, SavedBillEntry>();
    savedBills.forEach(bill => {
      const existing = map.get(bill.tableNumber);
      if (!existing || bill.createdAt > existing.createdAt) {
        map.set(bill.tableNumber, bill);
      }
    });
    return map;
  }, [savedBills]);

  const startSaveBillFlow = (source: 'COUNTER' | 'QR') => {
    if (source === 'COUNTER' && posCart.length === 0) {
      toast('Cart is empty. Add items before saving bill.', 'warning');
      return;
    }
    if (source === 'QR' && !selectedQrOrderForPayment) {
      toast('Select a QR order first.', 'warning');
      return;
    }

    const defaultTable = source === 'COUNTER'
      ? (posTableNo?.trim() || tableLabels[0] || 'Table 1')
      : (`Table ${selectedQrOrderForPayment?.tableNumber ?? 1}`);

    setPendingSaveBillSource(source);
    setSelectedSaveTableNumber(defaultTable);
    setShowSaveBillTableModal(true);
  };

  const closeSaveBillTableModal = () => {
    setShowSaveBillTableModal(false);
    setPendingSaveBillSource(null);
  };

  const clearSavedBillByTable = (tableNumber: string) => {
    setSavedBills(prev => prev.filter(bill => bill.tableNumber !== tableNumber));
  };

  const confirmSaveBillToTable = () => {
    if (!pendingSaveBillSource) return;

    const targetTable = selectedSaveTableNumber || tableLabels[0] || 'Table 1';
    const now = Date.now();

    const entry: SavedBillEntry | null = pendingSaveBillSource === 'COUNTER'
      ? {
          id: `${now}`,
          items: posCart,
          remark: posRemark,
          tableNumber: targetTable,
          createdAt: now,
        }
      : (selectedQrOrderForPayment
          ? {
              id: `${now}`,
              items: selectedQrOrderForPayment.items,
              remark: selectedQrOrderForPayment.remark ?? '',
              tableNumber: targetTable,
              createdAt: now,
            }
          : null);

    if (!entry) return;

    setSavedBills(prev => {
      const withoutSameTable = prev.filter(bill => bill.tableNumber !== targetTable);
      return [entry, ...withoutSameTable];
    });
    setActiveSavedBillTable(targetTable);

    if (pendingSaveBillSource === 'COUNTER') {
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
    } else {
      setSelectedQrOrderForPayment(null);
    }

    setCounterMode('SAVED_BILL');
    closeSaveBillTableModal();
    toast(`Bill saved to ${targetTable}.`, 'success');
  };

  const saveCurrentBill = () => {
    startSaveBillFlow('COUNTER');
  };

  const loadSavedBill = (tableNumber: string) => {
    const selectedBill = savedBillsByTable.get(tableNumber);
    if (!selectedBill) return;

    setPosCart(selectedBill.items);
    setPosRemark(selectedBill.remark);
    setPosTableNo(selectedBill.tableNumber);
    setActiveSavedBillTable(tableNumber);
    setCounterMode('COUNTER_ORDER');
    toast(`${tableNumber} bill loaded into counter.`, 'success');
  };

  const deleteSavedBill = (tableNumber: string) => {
    clearSavedBillByTable(tableNumber);
    if (activeSavedBillTable === tableNumber) {
      setActiveSavedBillTable(null);
    }
  };

  const saveSelectedQrOrderAsBill = () => {
    startSaveBillFlow('QR');
  };

  const handleCheckout = async () => {
    if (posCart.length === 0 || isCompletingPayment) return;

    // Store the pending order data and show payment modal
    setPendingOrderData({
      items: posCart,
      remark: posRemark,
      tableNumber: posTableNo,
      total: cartGrandTotal,
    });
    
    setSelectedCashAmount(cartGrandTotal);
    setCashAmountInput(cartGrandTotal.toFixed(2));
    setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
    setIsQrPaymentMode(false);
    setShowPaymentModal(true);
  };

  const handleQrOrderCheckout = () => {
    if (!selectedQrOrderForPayment || isCompletingPayment) return;
    setPendingOrderData({
      items: selectedQrOrderForPayment.items,
      remark: selectedQrOrderForPayment.remark,
      tableNumber: selectedQrOrderForPayment.tableNumber,
      total: selectedQrGrandTotal,
    });
    setSelectedCashAmount(selectedQrGrandTotal);
    setCashAmountInput(selectedQrGrandTotal.toFixed(2));
    setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
    setIsQrPaymentMode(true);
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrderData || !selectedPaymentType) return;

    // Validate amount received is not less than total
    if (!selectedCashAmount || selectedCashAmount < pendingOrderData.total) {
      toast('Amount received cannot be less than the total bill.', 'error');
      return;
    }

    setIsCompletingPayment(true);
    setCheckoutNotice('');

    const paymentName = paymentTypes.find(p => p.id === selectedPaymentType)?.name || selectedPaymentType;
    const nowTs = Date.now();
    let actualOrderId: string = '';

    if (isQrPaymentMode && selectedQrOrderForPayment) {
      // QR order already exists in DB — update its status and record payment
      actualOrderId = selectedQrOrderForPayment.id;
      try {
        onUpdateOrder(actualOrderId, OrderStatus.COMPLETED, {
          paymentMethod: paymentName,
          cashierName: cashierName || '',
          amountReceived: selectedCashAmount ?? undefined,
          changeAmount: selectedCashAmount != null ? Math.max(0, selectedCashAmount - selectedQrOrderForPayment.total) : undefined,
        });
      } catch (error: any) {
        console.error('QR order completion error:', error);
        toast(`Failed to complete order: ${error?.message || 'Unknown error'}`, 'error');
        setIsCompletingPayment(false);
        setShowPaymentModal(false);
        return;
      }
      // Persist payment data into the local report cache
      counterOrdersCache.mergeReportOrdersCache(restaurant.id, [{
        id: actualOrderId,
        items: selectedQrOrderForPayment.items,
        total: selectedQrOrderForPayment.total,
        status: OrderStatus.COMPLETED,
        timestamp: selectedQrOrderForPayment.timestamp,
        restaurantId: restaurant.id,
        tableNumber: selectedQrOrderForPayment.tableNumber,
        remark: selectedQrOrderForPayment.remark || '',
        customerId: '',
        paymentMethod: paymentName,
        cashierName: cashierName || '',
        amountReceived: selectedCashAmount ?? undefined,
        changeAmount: selectedCashAmount != null ? Math.max(0, selectedCashAmount - selectedQrOrderForPayment.total) : undefined,
      }]);
    } else {
      // Counter order — place a new order in DB
      try {
        actualOrderId = await onPlaceOrder(pendingOrderData.items, pendingOrderData.remark, pendingOrderData.tableNumber, paymentName, cashierName, selectedCashAmount ?? undefined);
      } catch (error: any) {
        console.error('Order placement error:', error);
        toast(`Failed to place order: ${error?.message || 'Unknown error'}`, 'error');
        setIsCompletingPayment(false);
        setShowPaymentModal(false);
        return;
      }
      // Persist into the local report orders cache so it's visible offline
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
    }

    // Use the real order ID for printing
    const orderForPrint = {
      id: actualOrderId,
      tableNumber: pendingOrderData.tableNumber,
      timestamp: isQrPaymentMode && selectedQrOrderForPayment ? selectedQrOrderForPayment.timestamp : nowTs,
      total: pendingOrderData.total,
      items: pendingOrderData.items,
      remark: pendingOrderData.remark,
    };

    // Show payment result with slide animation
    setShowPaymentResult(true);
    setIsCompletingPayment(false);

    if (featureSettings.autoPrintReceipt) {
      if (connectedDevice) {
        const printRestaurant = {
          ...restaurant,
          name: receiptSettings.businessName.trim() || restaurant.name,
        };

        printerService
          .printReceipt(orderForPrint, printRestaurant, getReceiptPrintOptions())
          .then((printSuccess) => {
            if (!printSuccess) {
              setCheckoutNotice('Order saved. Receipt printing did not complete.');
            }
          })
          .catch((printError: any) => {
            console.error('Receipt print error:', printError);
            const errorMsg = printError?.message || 'Receipt printing failed';
            setCheckoutNotice(`Order saved. ${errorMsg}`);
          });
      } else {
        setCheckoutNotice('Order saved. Auto-print is enabled but no printer is connected.');
      }
    }
  };

  const finalizePaymentFlow = () => {
    const completedTable = pendingOrderData?.tableNumber ? String(pendingOrderData.tableNumber) : '';
    setShowPaymentResult(false);
    setShowPaymentModal(false);
    setPendingOrderData(null);
    if (isQrPaymentMode) {
      setSelectedQrOrderForPayment(null);
      setIsQrPaymentMode(false);
    } else {
      if (completedTable) {
        clearSavedBillByTable(completedTable);
        if (activeSavedBillTable === completedTable) {
          setActiveSavedBillTable(null);
        }
      }
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
      setShowPaymentSuccess(true);
      setTimeout(() => {
        setShowPaymentSuccess(false);
      }, 1800);
    }
  };

  // Handle order status updates (e.g., marking as paid/completed)
  const handleOrderStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      // Call the parent handler
      onUpdateOrder(orderId, newStatus);
      
      // If order is marked as completed/paid, remove from cache
      if (newStatus === OrderStatus.COMPLETED || newStatus === OrderStatus.CANCELLED) {
        counterOrdersCache.removeCounterOrderFromCache(restaurant.id, orderId);
        setCachedCounterOrders(prev => prev.filter(o => o.id !== orderId));
      } else {
        // Update the order in cache with new status
        setCachedCounterOrders(prev => 
          prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
        );
        counterOrdersCache.addCounterOrderToCache(restaurant.id, 
          cachedCounterOrders.find(o => o.id === orderId)!
        );
      }
    } catch (error) {
      console.error('Error updating order status:', error);
    }
  };

  const unpaidOrders = useMemo(() => {
    // Use cached counter orders instead of fetching from DB
    return cachedCounterOrders;
  }, [cachedCounterOrders]);

  const buildOfflineReportData = (isExport = false): ReportResponse | Order[] => {
    const startTs = new Date(reportStart + 'T00:00:00').getTime();
    const endTs = new Date(reportEnd + 'T23:59:59').getTime();

    // Use the dedicated report cache (contains both locally-placed orders &
    // previously-fetched server data) instead of the unpaid-queue cache.
    const allCachedOrders = counterOrdersCache.getReportOrdersCache(restaurant.id);

    const filtered = allCachedOrders
      .filter(order => {
        const inRange = order.timestamp >= startTs && order.timestamp <= endTs;
        const statusMatch = reportStatus === 'ALL' || order.status === reportStatus;
        const searchMatch = !reportSearchQuery ||
          order.id.toLowerCase().includes(reportSearchQuery.toLowerCase());
        return inRange && statusMatch && searchMatch;
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    const completedOrders = filtered.filter(o => o.status === OrderStatus.COMPLETED);
    const summary = {
      totalRevenue: completedOrders.reduce((sum, o) => sum + o.total, 0),
      orderVolume: filtered.length,
      efficiency: filtered.length > 0
        ? Math.round((completedOrders.length / filtered.length) * 100)
        : 0,
    };

    if (isExport) return filtered;

    const pageStart = (currentPage - 1) * entriesPerPage;
    return {
      orders: filtered.slice(pageStart, pageStart + entriesPerPage),
      summary,
      totalCount: filtered.length,
    };
  };

  const fetchReport = async (isExport = false) => {
    // ─── OFFLINE: serve directly from local cache ───────────────────────────
    if (!isOnline) {
      if (isExport) return buildOfflineReportData(true) as Order[];
      setReportData(buildOfflineReportData(false) as ReportResponse);
      return;
    }

    // ─── ONLINE: fetch from server ──────────────────────────────────────────
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
        // Persist fetched orders into local cache for offline access
        counterOrdersCache.mergeReportOrdersCache(restaurant.id, data.orders);
        setReportData(data);
        return;
      }

      const params = new URLSearchParams({
        ...filters as any,
        page: isExport ? '1' : currentPage.toString(),
        limit: isExport ? '10000' : entriesPerPage.toString()
      });

      const response = await fetch(`/api/orders/report?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch report');
      const data: ReportResponse = await response.json();
      
      if (isExport) {
        counterOrdersCache.mergeReportOrdersCache(restaurant.id, data.orders);
        return data.orders;
      } else {
        counterOrdersCache.mergeReportOrdersCache(restaurant.id, data.orders);
        setReportData(data);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
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
  // Refresh report when orders change (realtime updates) and we're on REPORTS tab
  useEffect(() => {
    if (activeTab === 'REPORTS' && orders.length > 0) {
      // Add a small delay to debounce rapid updates
      const timer = setTimeout(() => {
        fetchReport();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [orders.length, activeTab]);


  // Load cached counter orders on component mount or when restaurantId changes
  useEffect(() => {
    const cached = counterOrdersCache.getCachedCounterOrders(restaurant.id);
    setCachedCounterOrders(cached);
  }, [restaurant.id]);

  // Setup periodic sync to database every 10 minutes
  useEffect(() => {
    const syncToDB = async () => {
      if (cachedCounterOrders.length === 0) return;
      
      try {
        // Sync all cached orders to the database
        for (const order of cachedCounterOrders) {
          const { error } = await supabase
            .from('orders')
            .upsert(
              {
                id: order.id,
                items: JSON.stringify(order.items),
                total: order.total,
                status: order.status,
                timestamp: order.timestamp,
                restaurant_id: order.restaurantId,
                table_number: order.tableNumber,
                location_name: order.locationName || '',
                customer_id: order.customerId || '',
                remark: order.remark || '',
              },
              { onConflict: 'id' }
            );

          if (error) {
            console.error('Error syncing order to DB:', error);
          }
        }

        // Update sync timestamp
        counterOrdersCache.setLastSyncTime(restaurant.id);
        console.log(`[PosOnlyView] Synced ${cachedCounterOrders.length} counter orders to DB`);
      } catch (error) {
        console.error('Error during counter orders sync:', error);
      }
    };

    // Setup interval for periodic sync (every 10 minutes = 600,000ms)
    syncIntervalRef.current = setInterval(syncToDB, 10 * 60 * 1000);

    // Also sync immediately on first setup (optional, comment out if not needed)
    // syncToDB();

    // Cleanup interval on unmount
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [cachedCounterOrders, restaurant.id]);

  useEffect(() => {
    let cats: CategoryData[] = [];
    if (restaurant.categories && restaurant.categories.length > 0) {
      cats = [...restaurant.categories];
    } else {
      const savedCategories = localStorage.getItem(`categories_${restaurant.id}`);
      if (savedCategories) {
        cats = JSON.parse(savedCategories);
      }
    }
    // Sync: ensure every category used by menu items exists in extraCategories
    const existingNames = new Set(cats.map(c => c.name));
    restaurant.menu.forEach(item => {
      if (item.category && !existingNames.has(item.category)) {
        cats.push({ name: item.category });
        existingNames.add(item.category);
      }
    });
    setExtraCategories(cats);

    if (restaurant.modifiers && restaurant.modifiers.length > 0) {
      setModifiers(restaurant.modifiers);
    } else {
      const savedModifiers = localStorage.getItem(`modifiers_${restaurant.id}`);
      if (savedModifiers) {
        setModifiers(JSON.parse(savedModifiers));
      }
    }
  }, [restaurant.id, restaurant.categories, restaurant.modifiers]);

  const saveCategoriesToDatabase = async (categoriesToSave: CategoryData[]) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ categories: categoriesToSave })
        .eq('id', restaurant.id);

      if (error) {
        console.error('Error saving categories to database:', error);
      }
    } catch (error) {
      console.error('Error saving categories:', error);
    }
  };

  const saveModifiersToDatabase = async (modifiersToSave: ModifierData[]) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ modifiers: modifiersToSave })
        .eq('id', restaurant.id);

      if (error) {
        console.error('Error saving modifiers to database:', error);
      }
    } catch (error) {
      console.error('Error saving modifiers:', error);
    }
  };

  useEffect(() => {
    localStorage.setItem(`categories_${restaurant.id}`, JSON.stringify(extraCategories));
    saveCategoriesToDatabase(extraCategories);
  }, [extraCategories, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`modifiers_${restaurant.id}`, JSON.stringify(modifiers));
    saveModifiersToDatabase(modifiers);
  }, [modifiers, restaurant.id]);

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
        // Auto-reconnect silently without browser picker
        setIsAutoReconnecting(true);
        setPrinterStatus('connecting');
        printerService.autoReconnect(printer.name).then((success) => {
          if (success) {
            setPrinterStatus('connected');
            setRealPrinterConnected(true);
          } else {
            setPrinterStatus('disconnected');
            setRealPrinterConnected(false);
          }
          setIsAutoReconnecting(false);
        }).catch(() => {
          setPrinterStatus('disconnected');
          setRealPrinterConnected(false);
          setIsAutoReconnecting(false);
        });
      } catch (error) {
        console.error('Failed to load saved printer', error);
      }
    }
  }, [restaurant.id]);

  useEffect(() => {
    const defaults = getDefaultReceiptSettings(restaurant.name);
    const dbSaved = restaurant.settings?.receipt;
    const localSaved = localStorage.getItem(`receipt_settings_${restaurant.id}`);

    // Priority 1: DB (cross-device authoritative)
    if (dbSaved && typeof dbSaved === 'object') {
      setReceiptSettings({ ...defaults, ...dbSaved });
      return;
    }

    // Priority 2: localStorage (same-device offline cache)
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        setReceiptSettings({ ...defaults, ...parsed });
        return;
      } catch (error) {
        console.error('Failed to parse local receipt settings', error);
      }
    }

    setReceiptSettings(defaults);
  }, [restaurant.id, restaurant.name, restaurant.settings]);

  // Load order code from restaurant settings
  useEffect(() => {
    const saved = restaurant.settings?.orderCode || '';
    setOrderCode(saved);
  }, [restaurant.id, restaurant.settings?.orderCode]);

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
    localStorage.setItem(`saved_bills_${restaurant.id}`, JSON.stringify(savedBills));
  }, [savedBills, restaurant.id]);

  useEffect(() => {
    if (!featureSettings.savedBillEnabled && counterMode === 'SAVED_BILL') {
      setCounterMode('COUNTER_ORDER');
    }
  }, [featureSettings.savedBillEnabled, counterMode]);

  // User Experience: persist font choice and apply to page
  useEffect(() => {
    localStorage.setItem(`ux_font_${restaurant.id}`, userFont);
    document.documentElement.style.fontFamily = `'${userFont}', ui-sans-serif, system-ui, sans-serif`;
    // Dynamically load Google Font if not already loaded
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

  // User Experience: persist currency choice
  useEffect(() => {
    localStorage.setItem(`ux_currency_${restaurant.id}`, userCurrency);
  }, [userCurrency, restaurant.id]);

  useEffect(() => {
    if (!receiptSettingsSaved) return;
    const timer = setTimeout(() => setReceiptSettingsSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [receiptSettingsSaved]);

  // Periodically check real Bluetooth printer connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = printerService.isConnected();
      setRealPrinterConnected(connected);
      if (connectedDevice) {
        setPrinterStatus(connected ? 'connected' : 'disconnected');
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [connectedDevice]);

  const handlePrinterButtonClick = async () => {
    if (!connectedDevice) {
      // No saved printer - scan and connect in one go
      if (!isBluetoothSupported) return;
      setIsAutoReconnecting(true);
      setPrinterStatus('connecting');
      const found = await printerService.scanForPrinters();
      if (found.length > 0) {
        const device = found[0];
        const success = await printerService.connect(device.name);
        if (success) {
          setConnectedDevice(device);
          setPrinterStatus('connected');
          setRealPrinterConnected(true);
          localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
          await supabase
            .from('restaurants')
            .update({ printer_settings: { connected: true, deviceId: device.id, deviceName: device.name } })
            .eq('id', restaurant.id);
        } else {
          setPrinterStatus('error');
          setRealPrinterConnected(false);
        }
      } else {
        setPrinterStatus('disconnected');
      }
      setIsAutoReconnecting(false);
      return;
    }
    if (realPrinterConnected) {
      // Already connected - do nothing
      return;
    }
    // Has saved printer but disconnected - try reconnect
    setIsAutoReconnecting(true);
    setPrinterStatus('connecting');
    const success = await printerService.autoReconnect(connectedDevice.name);
    if (success) {
      setPrinterStatus('connected');
      setRealPrinterConnected(true);
    } else {
      // Auto-reconnect failed, try with browser picker (requires user gesture - which this click is)
      const pickSuccess = await printerService.connect(connectedDevice.name);
      if (pickSuccess) {
        setPrinterStatus('connected');
        setRealPrinterConnected(true);
      } else {
        setPrinterStatus('error');
        setRealPrinterConnected(false);
      }
    }
    setIsAutoReconnecting(false);
  };

  const handleAddCategory = () => {
    if (!newClassName.trim()) return;
    const categoryName = newClassName.trim();

    const existsInMenu = restaurant.menu.some(item => item.category === categoryName);
    const existsInExtra = extraCategories.some(category => category.name === categoryName);
    if (existsInMenu || existsInExtra) {
      toast('Category already exists.', 'warning');
      return;
    }

    setExtraCategories(prev => [...prev, { name: categoryName }]);
    setNewClassName('');
    setShowAddClassModal(false);
  };



  const handleRenameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setRenamingClass(null);
      return;
    }

    const normalizedName = newName.trim();
    const existsInExtra = extraCategories.some(category => category.name === normalizedName && category.name !== oldName);
    if (existsInExtra) {
      toast('Category already exists.', 'warning');
      return;
    }

    setExtraCategories(prev => prev.map(category =>
      category.name === oldName ? { ...category, name: normalizedName } : category
    ));

    // Update all menu items that use the old category name
    const affectedItems = restaurant.menu.filter(item => item.category === oldName);
    affectedItems.forEach(item => {
      onUpdateMenu?.(restaurant.id, {
        ...item,
        category: normalizedName,
      });
    });

    setRenamingClass(null);
  };

  const handleRemoveCategory = (name: string) => {
    if (!confirm(`Are you sure you want to remove the "${name}" category?`)) return;
    setExtraCategories(prev => prev.filter(category => category.name !== name));
  };

  const handleAddModifier = () => {
    setShowAddModifierModal(true);
    setEditingModifierName(null);
    setTempModifierName('');
    setTempModifierOptions([]);
  };

  const handleEditModifier = (modifier: ModifierData) => {
    setEditingModifierName(modifier.name);
    setTempModifierName(modifier.name);
    setTempModifierOptions([...modifier.options]);
    setTempModifierRequired(modifier.required || false);
    setShowAddModifierModal(true);
  };

  const handleSaveModifier = () => {
    if (!tempModifierName.trim()) {
      toast('Please enter a modifier name', 'warning');
      return;
    }

    const nextName = tempModifierName.trim();
    const duplicate = modifiers.some(modifier => modifier.name === nextName && modifier.name !== editingModifierName);
    if (duplicate) {
      toast('Modifier already exists.', 'warning');
      return;
    }

    const validOptions = tempModifierOptions.filter(option => option.name.trim() !== '');

    if (editingModifierName) {
      setModifiers(prev => prev.map(modifier =>
        modifier.name === editingModifierName
          ? { name: nextName, options: validOptions, required: tempModifierRequired }
          : modifier
      ));
    } else {
      setModifiers(prev => [...prev, { name: nextName, options: validOptions, required: tempModifierRequired }]);
    }

    setShowAddModifierModal(false);
    setEditingModifierName(null);
    setTempModifierName('');
    setTempModifierOptions([]);
    setTempModifierRequired(false);
  };

  const handleAddModifierOption = () => {
    setTempModifierOptions(prev => [...prev, { name: '', price: 0 }]);
  };

  const handleRemoveModifierOption = (index: number) => {
    setTempModifierOptions(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleModifierOptionChange = (index: number, field: keyof ModifierOption, value: string | number) => {
    setTempModifierOptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveModifier = (name: string) => {
    if (!confirm(`Are you sure you want to remove the "${name}" modifier?`)) return;
    setModifiers(prev => prev.filter(modifier => modifier.name !== name));

    // Clean up linkedModifiers references from all menu items
    const affectedItems = restaurant.menu.filter(item =>
      item.linkedModifiers && item.linkedModifiers.includes(name)
    );
    affectedItems.forEach(item => {
      onUpdateMenu?.(restaurant.id, {
        ...item,
        linkedModifiers: (item.linkedModifiers || []).filter(n => n !== name),
      });
    });
  };

  const handleRenameModifier = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setRenamingModifier(null);
      return;
    }

    const normalizedName = newName.trim();
    const duplicate = modifiers.some(modifier => modifier.name === normalizedName && modifier.name !== oldName);
    if (duplicate) {
      toast('Modifier already exists.', 'warning');
      return;
    }

    setModifiers(prev => prev.map(modifier =>
      modifier.name === oldName ? { ...modifier, name: normalizedName } : modifier
    ));

    // Update linkedModifiers references in all menu items
    const affectedItems = restaurant.menu.filter(item =>
      item.linkedModifiers && item.linkedModifiers.includes(oldName)
    );
    affectedItems.forEach(item => {
      onUpdateMenu?.(restaurant.id, {
        ...item,
        linkedModifiers: (item.linkedModifiers || []).map(n => n === oldName ? normalizedName : n),
      });
    });

    setRenamingModifier(null);
  };

  const handleToggleModifierRequired = (modifierName: string) => {
    setModifiers(prev => prev.map(modifier =>
      modifier.name === modifierName
        ? { ...modifier, required: !modifier.required }
        : modifier
    ));
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
      setRealPrinterConnected(true);
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
      setRealPrinterConnected(false);
      setErrorMessage('Failed to connect to printer');
    }
  };

  const disconnectPrinter = async () => {
    await printerService.disconnect();
    setConnectedDevice(null);
    setPrinterStatus('disconnected');
    setRealPrinterConnected(false);
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

    // Reset form
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
    // Persist kitchenEnabled to Supabase so other devices (and login API) can read it
    if (key === 'kitchenEnabled') {
      supabase.from('restaurants').update({ kitchen_enabled: value }).eq('id', restaurant.id)
        .then(({ error }) => {
          if (error) console.warn('Failed to sync kitchen_enabled to DB:', error.message);
        });
    }
  };

  useEffect(() => {
    setTableCountDraft(String(featureSettings.tableCount));
    setTableRowsDraft(String(featureSettings.tableRows));
    setTableColumnsDraft(String(featureSettings.tableColumns));
  }, [featureSettings.tableCount, featureSettings.tableRows, featureSettings.tableColumns]);

  const resetTableManagementDraft = () => {
    setTableCountDraft(String(featureSettings.tableCount));
    setTableRowsDraft(String(featureSettings.tableRows));
    setTableColumnsDraft(String(featureSettings.tableColumns));
  };

  const parsePositiveIntegerDraft = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return parsed;
  };

  const handleSaveTableManagementChanges = () => {
    const nextTableCount = parsePositiveIntegerDraft(tableCountDraft);
    const nextTable