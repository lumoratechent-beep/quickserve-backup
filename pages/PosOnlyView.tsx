// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption, AddOnItemData, QS_DEFAULT_HUB, Subscription, PlanId, KitchenDepartment } from '../src/types';
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
  Receipt, Network, Type, MessageSquare, Zap, Briefcase, PlusCircle, Puzzle,
  ArrowLeft, Star, Package, Monitor, Info, ExternalLink,
  Tablet, Globe, ShoppingCart, Wallet, ArrowUpRight, ArrowDownRight, Building2, Banknote, Send, Copy, Truck
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
  onNavigateBackOffice?: () => void;
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
  floorEnabled: boolean;
  floorCount: number;
  customerDisplayEnabled: boolean;
  kitchenEnabled: boolean;
  qrEnabled: boolean;
  tablesideOrderingEnabled: boolean;
  onlineShopEnabled: boolean;
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
  floorEnabled: false,
  floorCount: 1,
  customerDisplayEnabled: false,
  kitchenEnabled: false,
  qrEnabled: false,
  tablesideOrderingEnabled: false,
  onlineShopEnabled: false,
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

interface OnlineDeliveryOption {
  id: string;
  type: 'pickup' | 'lalamove' | 'postage' | 'custom';
  label: string;
  enabled: boolean;
  fee: number;
}

interface OnlinePaymentMethod {
  id: string;
  label: string;
  enabled: boolean;
}

type SettingsPanel = 'builtin' | 'table' | 'kitchen' | 'qr' | 'printer' | 'receipt' | 'payment' | 'staff' | 'ux';

const MALAYSIA_BANKS = [
  { name: 'Maybank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Maybank_logo.svg/200px-Maybank_logo.svg.png' },
  { name: 'CIMB Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/CIMB_logo.svg/200px-CIMB_logo.svg.png' },
  { name: 'Public Bank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/02/Public_Bank_Berhad_logo.svg/200px-Public_Bank_Berhad_logo.svg.png' },
  { name: 'RHB Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/RHB_Bank_Logo.svg/200px-RHB_Bank_Logo.svg.png' },
  { name: 'Hong Leong Bank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/85/Hong_Leong_Bank.svg/200px-Hong_Leong_Bank.svg.png' },
  { name: 'AmBank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/AmBank_logo.svg/200px-AmBank_logo.svg.png' },
  { name: 'Bank Islam', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f0/Bank_Islam_logo.svg/200px-Bank_Islam_logo.svg.png' },
  { name: 'Bank Rakyat', logo: 'https://upload.wikimedia.org/wikipedia/ms/thumb/c/c8/Bank_Rakyat.svg/200px-Bank_Rakyat.svg.png' },
  { name: 'Bank Muamalat', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/14/Bank_Muamalat_Malaysia_Logo.svg/200px-Bank_Muamalat_Malaysia_Logo.svg.png' },
  { name: 'BSN', logo: 'https://upload.wikimedia.org/wikipedia/ms/thumb/0/06/BSN_logo.svg/200px-BSN_logo.svg.png' },
  { name: 'Affin Bank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7c/Affin_Bank_logo.svg/200px-Affin_Bank_logo.svg.png' },
  { name: 'Alliance Bank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/15/Alliance_Bank_Malaysia_logo.svg/200px-Alliance_Bank_Malaysia_logo.svg.png' },
  { name: 'OCBC Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/OCBC_Bank_logo.svg/200px-OCBC_Bank_logo.svg.png' },
  { name: 'UOB Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/UOB_Logo.svg/200px-UOB_Logo.svg.png' },
  { name: 'HSBC Bank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/HSBC_logo_%282018%29.svg/200px-HSBC_logo_%282018%29.svg.png' },
  { name: 'Standard Chartered', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Standard_Chartered_%282021%29.svg/200px-Standard_Chartered_%282021%29.svg.png' },
  { name: 'Agrobank', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Agrobank_logo.svg/200px-Agrobank_logo.svg.png' },
  { name: 'GXBank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/GXBank_Logo.svg/200px-GXBank_Logo.svg.png' },
  { name: 'Touch \'n Go eWallet', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Touch_%27n_Go_eWallet_logo.svg/200px-Touch_%27n_Go_eWallet_logo.svg.png' },
  { name: 'Boost', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e4/Boost_%28company%29_logo.svg/200px-Boost_%28company%29_logo.svg.png' },
];

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
  onNavigateBackOffice,
}) => {
  const toLocalDateInputValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };

  const [activeTab, setActiveTab] = useState<'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING' | 'ADDONS' | 'ONLINE_ORDERS'>(() => {
    const returnTab = localStorage.getItem('qs_return_tab');
    if (returnTab === 'BILLING') {
      localStorage.removeItem('qs_return_tab');
      return 'BILLING';
    }
    return userRole === 'KITCHEN' ? 'KITCHEN' : 'COUNTER';
  });
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
  const [addonDetailView, setAddonDetailView] = useState<string | null>(null);
  const [addonDetailTab, setAddonDetailTab] = useState<'details' | 'setting'>('details');
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
  const [menuSubTab, setMenuSubTab] = useState<'KITCHEN' | 'CATEGORY' | 'MODIFIER' | 'ADDON'>('KITCHEN');
  const [onlineOrderSubTab, setOnlineOrderSubTab] = useState<'INCOMING' | 'PRODUCT' | 'WALLET' | 'SETTING'>('INCOMING');
  const [onlineStripeBalance, setOnlineStripeBalance] = useState<number | null>(null);
  const [isLoadingStripeBalance, setIsLoadingStripeBalance] = useState(false);
  const [onlineProductView, setOnlineProductView] = useState<'list' | 'grid'>('list');
  const [onlineProductStatus, setOnlineProductStatus] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [onlineProductSearch, setOnlineProductSearch] = useState('');
  const [onlineEditItem, setOnlineEditItem] = useState<MenuItem | null>(null);
  const [onlineEditTab, setOnlineEditTab] = useState<'instore' | 'online'>('online');
  const [onlineEditForm, setOnlineEditForm] = useState<MenuFormItem>({});
  const [onlineFormPage, setOnlineFormPage] = useState<'general' | 'options'>('general');

  // Online shop settings
  const [onlineDeliveryOptions, setOnlineDeliveryOptions] = useState<OnlineDeliveryOption[]>(() => {
    const saved = restaurant.settings?.onlineDeliveryOptions;
    if (saved && Array.isArray(saved)) return saved as OnlineDeliveryOption[];
    return [
      { id: 'pickup', type: 'pickup', label: 'Pickup', enabled: true, fee: 0 },
      { id: 'lalamove', type: 'lalamove', label: 'Lalamove', enabled: false, fee: 0 },
      { id: 'postage', type: 'postage', label: 'Postage', enabled: false, fee: 0 },
    ];
  });
  const [onlinePaymentMethods, setOnlinePaymentMethods] = useState<OnlinePaymentMethod[]>(() => {
    const saved = restaurant.settings?.onlinePaymentMethods;
    if (saved && Array.isArray(saved)) return saved;
    return [
      { id: 'cod', label: 'COD (Cash on Delivery)', enabled: true },
      { id: 'online', label: 'Online Payment', enabled: false },
    ];
  });
  // Collapse state for settings panels
  const [deliveryExpanded, setDeliveryExpanded] = useState(false);
  const [paymentExpanded, setPaymentExpanded] = useState(false);
  const [deliveryDraft, setDeliveryDraft] = useState<OnlineDeliveryOption[]>([]);
  const [paymentDraft, setPaymentDraft] = useState<OnlinePaymentMethod[]>([]);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletPendingCashout, setWalletPendingCashout] = useState<number>(0);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [cashoutRequests, setCashoutRequests] = useState<any[]>([]);
  const [bankDetails, setBankDetails] = useState<{ bankName: string; accountHolderName: string; accountNumber: string } | null>(null);
  const [bankFormData, setBankFormData] = useState({ bankName: '', accountHolderName: '', accountNumber: '' });
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showBankSection, setShowBankSection] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutNotes, setCashoutNotes] = useState('');
  const [isRequestingCashout, setIsRequestingCashout] = useState(false);
  const [showCashoutForm, setShowCashoutForm] = useState(false);
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
  const [addOnItems, setAddOnItems] = useState<AddOnItemData[]>([]);

  const [classViewMode, setClassViewMode] = useState<'grid' | 'list'>('list');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [modifierViewMode, setModifierViewMode] = useState<'grid' | 'list'>('list');
  const [addOnViewMode, setAddOnViewMode] = useState<'grid' | 'list'>('list');
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
  const [floorCountDraft, setFloorCountDraft] = useState<string>(String(featureSettings.floorCount || 1));
  const [tableColPage, setTableColPage] = useState(0);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [modalSelectedFloor, setModalSelectedFloor] = useState(1);
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
  const [showCollectPaymentSidebar, setShowCollectPaymentSidebar] = useState(false);
  const [collectPaymentProcessing, setCollectPaymentProcessing] = useState(false);
  const [collectPaymentSuccess, setCollectPaymentSuccess] = useState(false);
  const [collectCashAmountInput, setCollectCashAmountInput] = useState<string>('');
  const [collectCashAmount, setCollectCashAmount] = useState<number | null>(null);
  const [collectPaymentType, setCollectPaymentType] = useState<string>('');

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
      sizes: (formItem.sizes || []).length > 0 ? formItem.sizes : [],
      tempOptions: formItem.tempOptions?.enabled ? formItem.tempOptions : undefined,
      variantOptions: formItem.variantOptions?.enabled ? formItem.variantOptions : undefined,
      // Backward compat: set first linked modifier as otherVariantName
      otherVariantName: linked[0] || '',
      otherVariants: [],
      otherVariantsEnabled: linked.length > 0,
      linkedModifiers: linked,
      addOns: formItem.addOns || [],
      cost: Number(formItem.cost || 0),
      sku: (formItem.sku || '').trim(),
      barcode: (formItem.barcode || '').trim(),
      soldBy: formItem.soldBy || 'each',
      trackStock: formItem.trackStock || false,
      color: formItem.color || undefined,
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

  const effectiveFloorCount = featureSettings.floorEnabled ? Math.min(5, Math.max(1, Number(featureSettings.floorCount) || 1)) : 1;

  const tableLabels = useMemo(() => {
    if (featureSettings.floorEnabled && effectiveFloorCount > 1) {
      // Returns ALL labels across all floors; floor tabs will filter by prefix
      const labels: string[] = [];
      for (let f = 1; f <= effectiveFloorCount; f++) {
        for (let t = 1; t <= effectiveTableCount; t++) {
          labels.push(`F${f}-${t}`);
        }
      }
      return labels;
    }
    return Array.from({ length: effectiveTableCount }, (_, idx) => `Table ${idx + 1}`);
  }, [effectiveTableCount, featureSettings.floorEnabled, effectiveFloorCount]);

  // Labels for a single floor (used by grid rendering)
  const tableLabelsForFloor = useMemo(() => {
    if (featureSettings.floorEnabled && effectiveFloorCount > 1) {
      const prefix = `F${selectedFloor}-`;
      return tableLabels.filter(l => l.startsWith(prefix));
    }
    return tableLabels;
  }, [tableLabels, featureSettings.floorEnabled, effectiveFloorCount, selectedFloor]);

  const tableLabelsForModalFloor = useMemo(() => {
    if (featureSettings.floorEnabled && effectiveFloorCount > 1) {
      const prefix = `F${modalSelectedFloor}-`;
      return tableLabels.filter(l => l.startsWith(prefix));
    }
    return tableLabels;
  }, [tableLabels, featureSettings.floorEnabled, effectiveFloorCount, modalSelectedFloor]);

  const tableRowsForSelection = useMemo(() => {
    const labelsToUse = tableLabelsForFloor;
    const rowCount = Math.ceil(labelsToUse.length / effectiveTableCols);
    const rows: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const start = r * effectiveTableCols;
      const row = labelsToUse.slice(start, start + effectiveTableCols);
      if (row.length > 0) rows.push(row);
    }
    return rows;
  }, [tableLabelsForFloor, effectiveTableCols]);

  const tableRowsForModal = useMemo(() => {
    const labelsToUse = tableLabelsForModalFloor;
    const rowCount = Math.ceil(labelsToUse.length / effectiveTableCols);
    const rows: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const start = r * effectiveTableCols;
      const row = labelsToUse.slice(start, start + effectiveTableCols);
      if (row.length > 0) rows.push(row);
    }
    return rows;
  }, [tableLabelsForModalFloor, effectiveTableCols]);

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
    setModalSelectedFloor(1);
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
        orderSource: selectedQrOrderForPayment.orderSource,
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
        orderSource: 'counter',
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

    if (restaurant.addOnItems && restaurant.addOnItems.length > 0) {
      setAddOnItems(restaurant.addOnItems);
    } else {
      const savedAddOns = localStorage.getItem(`addOnItems_${restaurant.id}`);
      if (savedAddOns) {
        setAddOnItems(JSON.parse(savedAddOns));
      }
    }
  }, [restaurant.id, restaurant.categories, restaurant.modifiers, restaurant.addOnItems]);

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

  const saveAddOnItemsToDatabase = async (items: AddOnItemData[]) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ add_on_items: items })
        .eq('id', restaurant.id);
      if (error) console.error('Error saving add-on items:', error);
    } catch (error) {
      console.error('Error saving add-on items:', error);
    }
  };

  useEffect(() => {
    localStorage.setItem(`addOnItems_${restaurant.id}`, JSON.stringify(addOnItems));
    saveAddOnItemsToDatabase(addOnItems);
  }, [addOnItems, restaurant.id]);

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
    setFloorCountDraft(String(featureSettings.floorCount || 1));
  }, [featureSettings.tableCount, featureSettings.tableRows, featureSettings.tableColumns, featureSettings.floorCount]);

  const resetTableManagementDraft = () => {
    setTableCountDraft(String(featureSettings.tableCount));
    setTableRowsDraft(String(featureSettings.tableRows));
    setTableColumnsDraft(String(featureSettings.tableColumns));
    setFloorCountDraft(String(featureSettings.floorCount || 1));
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
    const nextTableColumns = parsePositiveIntegerDraft(tableColumnsDraft);
    const nextFloorCount = parsePositiveIntegerDraft(floorCountDraft);

    if (!nextTableCount || !nextTableColumns) {
      toast('Table count and columns cannot be empty.', 'error');
      resetTableManagementDraft();
      return;
    }

    if (nextTableColumns > 20) {
      toast('Columns must be between 1 and 20.', 'error');
      resetTableManagementDraft();
      return;
    }

    if (featureSettings.floorEnabled && (!nextFloorCount || nextFloorCount > 5)) {
      toast('Floor count must be between 1 and 5.', 'error');
      resetTableManagementDraft();
      return;
    }

    const autoRows = Math.ceil(nextTableCount / nextTableColumns);
    setFeatureSettings(prev => ({
      ...prev,
      tableCount: nextTableCount,
      tableRows: autoRows,
      tableColumns: nextTableColumns,
      floorCount: featureSettings.floorEnabled ? (nextFloorCount || 1) : prev.floorCount,
    }));
    setTableColPage(0);
    setSelectedFloor(1);
    setModalSelectedFloor(1);
    toast('Table layout saved.', 'success');
  };

  const handleSaveFloorChanges = () => {
    const nextFloorCount = parsePositiveIntegerDraft(floorCountDraft);
    if (!nextFloorCount || nextFloorCount < 1 || nextFloorCount > 5) {
      toast('Floor count must be between 1 and 5.', 'error');
      setFloorCountDraft(String(featureSettings.floorCount || 1));
      return;
    }
    setFeatureSettings(prev => ({
      ...prev,
      floorCount: nextFloorCount,
    }));
    setSelectedFloor(1);
    setModalSelectedFloor(1);
    setTableColPage(0);
    toast('Floor settings saved.', 'success');
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

  // ── Wallet helpers ──
  const fetchWalletData = async () => {
    setWalletLoading(true);
    try {
      const [balRes, txRes, bankRes, cashRes] = await Promise.all([
        fetch(`/api/wallet?action=balance&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=transactions&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=bank&restaurantId=${restaurant.id}`).then(r => r.json()),
        fetch(`/api/wallet?action=cashout&restaurantId=${restaurant.id}`).then(r => r.json()),
      ]);
      setWalletBalance(balRes.balance ?? 0);
      setWalletPendingCashout(balRes.pendingCashout ?? 0);
      setWalletTransactions(txRes.transactions ?? []);
      if (bankRes.bank) {
        setBankDetails({ bankName: bankRes.bank.bank_name, accountHolderName: bankRes.bank.account_holder_name, accountNumber: bankRes.bank.account_number });
        setBankFormData({ bankName: bankRes.bank.bank_name, accountHolderName: bankRes.bank.account_holder_name, accountNumber: bankRes.bank.account_number });
      }
      setCashoutRequests(cashRes.requests ?? []);
    } catch (err) {
      console.error('Failed to fetch wallet data:', err);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleSaveBank = async () => {
    if (!bankFormData.bankName || !bankFormData.accountHolderName || !bankFormData.accountNumber) {
      toast('Please fill in all bank fields.', 'warning');
      return;
    }
    setIsSavingBank(true);
    try {
      const res = await fetch('/api/wallet?action=bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurant.id, bankName: bankFormData.bankName, accountHolderName: bankFormData.accountHolderName, accountNumber: bankFormData.accountNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setBankDetails({ bankName: bankFormData.bankName, accountHolderName: bankFormData.accountHolderName, accountNumber: bankFormData.accountNumber });
        setShowBankForm(false);
        toast('Bank details saved!', 'success');
      } else {
        toast(data.error || 'Failed to save bank details', 'error');
      }
    } catch { toast('Failed to save bank details', 'error'); }
    finally { setIsSavingBank(false); }
  };

  const handleRequestCashout = async () => {
    const amount = parseFloat(cashoutAmount);
    if (isNaN(amount) || amount <= 0) { toast('Enter a valid amount.', 'warning'); return; }
    if (!bankDetails) { toast('Please save your bank details first.', 'warning'); return; }
    const available = walletBalance - walletPendingCashout;
    if (amount > available) { toast(`Insufficient balance. Available: RM${available.toFixed(2)}`, 'warning'); return; }
    setIsRequestingCashout(true);
    try {
      const res = await fetch('/api/wallet?action=cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: restaurant.id, amount, notes: cashoutNotes || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setCashoutAmount(''); setCashoutNotes(''); setShowCashoutForm(false);
        toast(`Cashout request for RM${amount.toFixed(2)} submitted!`, 'success');
        fetchWalletData();
      } else {
        toast(data.error || 'Failed to request cashout', 'error');
      }
    } catch { toast('Failed to request cashout', 'error'); }
    finally { setIsRequestingCashout(false); }
  };

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

  const handleTabSelection = (tab: 'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING' | 'ADDONS' | 'ONLINE_ORDERS') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    if (tab !== 'ADDONS') { setAddonDetailView(null); setAddonDetailTab('details'); }
  };

  const handleReportsClick = () => {
    setReportsSubMenu('salesReport');
    setActiveTab('REPORTS');
    setIsMobileMenuOpen(false);
  };

  // --- Kitchen Feature Logic ---
  // Plan-based feature gating
  const vendorPlan: PlanId = subscription?.plan_id || 'basic';
  const canUseQr = vendorPlan === 'pro' || vendorPlan === 'pro_plus';
  const canUseKitchen = vendorPlan === 'pro_plus';
  const canUseSavedBill = vendorPlan === 'basic' || vendorPlan === 'pro' || vendorPlan === 'pro_plus';
  const showQrFeature = canUseQr && (showQrOrders || featureSettings.qrEnabled);
  const showKitchenFeature = canUseKitchen && featureSettings.kitchenEnabled;
  const showSavedBillFeature = canUseSavedBill && featureSettings.savedBillEnabled;
  const showTablesideFeature = canUseQr && featureSettings.tablesideOrderingEnabled;
  const showOnlineShopFeature = canUseQr && featureSettings.onlineShopEnabled;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isKitchenUser = userRole === 'KITCHEN';
  const isVendorUser = userRole === 'VENDOR';

  const kitchenPendingOrders = useMemo(() => {
    return orders.filter(o => o.status === OrderStatus.PENDING);
  }, [orders]);

  const kitchenPrevPendingCount = useRef(kitchenPendingOrders.length);

  const triggerNewOrderAlert = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    } catch (e) {
      console.warn("Audio Context failed");
    }
    setShowNewOrderAlert(true);
    setTimeout(() => setShowNewOrderAlert(false), 5000);
  };

  const handleKitchenAcceptAndPrint = async (orderId: string) => {
    if (onKitchenUpdateOrder) {
      onKitchenUpdateOrder(orderId, OrderStatus.ONGOING);
    } else {
      onUpdateOrder(orderId, OrderStatus.ONGOING);
    }

    if (kitchenOrderSettings.autoPrint) {
      if (!connectedDevice) {
        toast('Printer is not connected. Please connect a printer in Settings.', 'warning');
        return;
      }
      try {
        setKitchenPrintingOrderId(orderId);
        const { data: freshOrder, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (error || !freshOrder) {
          toast('Failed to fetch order details for printing.', 'error');
          return;
        }

        const orderToPrint = {
          id: freshOrder.id,
          tableNumber: freshOrder.table_number,
          timestamp: freshOrder.timestamp,
          total: Number(freshOrder.total || 0),
          items: Array.isArray(freshOrder.items) ? freshOrder.items :
                 (typeof freshOrder.items === 'string' ? JSON.parse(freshOrder.items) : []),
          remark: freshOrder.remark || ''
        };

        const printSuccess = await printerService.printReceipt(orderToPrint, restaurant);
        if (!printSuccess) {
          toast('Failed to queue print job. Please try again.', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        toast('Error occurred while printing.', 'error');
      } finally {
        setKitchenPrintingOrderId(null);
      }
    }
  };

  const handleKitchenManualPrint = async (order: Order) => {
    if (!connectedDevice) {
      toast('No printer connected. Please connect a printer in Settings.', 'warning');
      return;
    }
    setKitchenPrintingOrderId(order.id);
    try {
      const { data: freshOrder, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order.id)
        .single();

      if (error || !freshOrder) {
        toast('Failed to fetch order details for printing.', 'error');
        return;
      }

      const orderToPrint = {
        id: freshOrder.id,
        tableNumber: freshOrder.table_number,
        timestamp: freshOrder.timestamp,
        total: Number(freshOrder.total || 0),
        items: Array.isArray(freshOrder.items) ? freshOrder.items :
               (typeof freshOrder.items === 'string' ? JSON.parse(freshOrder.items) : []),
        remark: freshOrder.remark || ''
      };

      const success = await printerService.printReceipt(orderToPrint, restaurant);
      if (success) {
        toast('Order printed successfully!', 'success');
      } else {
        toast('Failed to print. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Manual print error:', error);
      toast('Error occurred while printing.', 'error');
    } finally {
      setKitchenPrintingOrderId(null);
    }
  };

  const handleKitchenConfirmRejection = () => {
    if (rejectingKitchenOrderId) {
      if (onKitchenUpdateOrder) {
        onKitchenUpdateOrder(rejectingKitchenOrderId, OrderStatus.CANCELLED, kitchenRejectionReason, kitchenRejectionNote);
      } else {
        onUpdateOrder(rejectingKitchenOrderId, OrderStatus.CANCELLED);
      }
      setRejectingKitchenOrderId(null);
      setKitchenRejectionReason(REJECTION_REASONS[0]);
      setKitchenRejectionNote('');
    }
  };

  const toggleKitchenOrderSetting = (key: 'autoAccept' | 'autoPrint') => {
    setKitchenOrderSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const kitchenScopeCategories = useMemo(() => {
    const assigned = Array.isArray(userKitchenCategories)
      ? userKitchenCategories.map(v => String(v || '').trim()).filter(Boolean)
      : [];

    if (assigned.length === 0) return [];

    const departmentMap = new Map(kitchenDivisions.map(dep => [dep.name, dep.categories]));
    const scoped = new Set<string>();

    assigned.forEach(value => {
      const mappedCategories = departmentMap.get(value);
      if (mappedCategories) {
        if (mappedCategories.length === 0) {
          allFoodCategories.forEach(category => scoped.add(category));
        } else {
          mappedCategories.forEach(category => scoped.add(category));
        }
      } else {
        // Backward compatibility: older users may be assigned categories directly.
        scoped.add(value);
      }
    });

    return Array.from(scoped).sort((a, b) => a.localeCompare(b));
  }, [userKitchenCategories, kitchenDivisions, allFoodCategories]);

  const kitchenFilteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = (() => {
        if (kitchenOrderFilter === 'ALL') return true;
        if (kitchenOrderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
        return o.status === kitchenOrderFilter;
      })();
      if (!matchesStatus) return false;

      if (userRole !== 'KITCHEN' || kitchenScopeCategories.length === 0) return true;
      return o.items.some(item => kitchenScopeCategories.includes(item.category));
    });
  }, [orders, kitchenOrderFilter, userRole, kitchenScopeCategories]);

  const getSortedOrderItems = (order: Order, scopedCategories: string[] = []) => {
    const hasScope = scopedCategories.length > 0;
    return order.items
      .filter(item => !hasScope || scopedCategories.includes(item.category))
      .sort((a, b) => {
        const byCategory = (a.category || '').localeCompare(b.category || '');
        if (byCategory !== 0) return byCategory;
        return (a.name || '').localeCompare(b.name || '');
      });
  };

  const groupItemsByCategory = (items: CartItem[]) => {
    return items.reduce<Record<string, CartItem[]>>((acc, item) => {
      const category = item.category || 'Uncategorized';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});
  };

  const getKitchenStatusText = (status: OrderStatus) => {
    if (status === OrderStatus.PENDING) return 'Pending';
    if (status === OrderStatus.ONGOING) return 'Preparing';
    if (status === OrderStatus.SERVED) return 'Served';
    if (status === OrderStatus.COMPLETED) return 'Paid';
    return 'Cancelled';
  };

  const getKitchenStatusClass = (status: OrderStatus) => {
    if (status === OrderStatus.PENDING) return 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
    if (status === OrderStatus.ONGOING) return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
    if (status === OrderStatus.SERVED) return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
    if (status === OrderStatus.COMPLETED) return 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400';
    return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
  };

  const storeIsOnline = restaurant.isOnline !== false;

  const handleAddDivision = () => {
    const name = newDivisionName.trim();
    if (!name) {
      toast('Please enter a department name.', 'warning');
      return;
    }
    if (kitchenDivisions.some(dep => dep.name.toLowerCase() === name.toLowerCase())) {
      toast('Department already exists.', 'warning');
      return;
    }
    const updated = [...kitchenDivisions, { name, categories: [] }];
    setKitchenDivisions(updated);
    setNewDivisionName('');
    onSaveKitchenDivisions?.(updated);
  };

  const handleRenameDivision = (oldName: string, newName: string) => {
    const normalized = newName.trim();
    if (!normalized) return;
    if (
      kitchenDivisions.some(
        dep => dep.name.toLowerCase() === normalized.toLowerCase() && dep.name.toLowerCase() !== oldName.toLowerCase(),
      )
    ) {
      toast('Department already exists.', 'warning');
      return;
    }

    const updated = kitchenDivisions.map(dep =>
      dep.name === oldName ? { ...dep, name: normalized } : dep,
    );
    setKitchenDivisions(updated);
    setRenamingDepartment(null);
    setRenameDepartmentValue('');
    onSaveKitchenDivisions?.(updated);
  };

  const handleToggleDivisionCategory = (departmentName: string, categoryName: string) => {
    const updated = kitchenDivisions.map(dep => {
      if (dep.name !== departmentName) return dep;
      const hasCategory = dep.categories.includes(categoryName);
      const categories = hasCategory
        ? dep.categories.filter(c => c !== categoryName)
        : [...dep.categories, categoryName];
      return { ...dep, categories: categories.sort((a, b) => a.localeCompare(b)) };
    });
    setKitchenDivisions(updated);
    onSaveKitchenDivisions?.(updated);
  };

  const handleRemoveDivision = (name: string) => {
    const updated = kitchenDivisions.filter(d => d.name !== name);
    setKitchenDivisions(updated);
    onSaveKitchenDivisions?.(updated);
  };

  // Kitchen new order alert + auto-accept
  useEffect(() => {
    if (!showKitchenFeature) return;
    if (kitchenPendingOrders.length > kitchenPrevPendingCount.current) {
      triggerNewOrderAlert();

      if (kitchenOrderSettings.autoAccept) {
        const newOrders = orders.filter(o =>
          o.status === OrderStatus.PENDING
        );
        newOrders.forEach(order => {
          handleKitchenAcceptAndPrint(order.id);
        });
      }
    }
    kitchenPrevPendingCount.current = kitchenPendingOrders.length;
  }, [kitchenPendingOrders.length, showKitchenFeature]);

  // Persist kitchen order settings
  useEffect(() => {
    localStorage.setItem(`kitchen_settings_${restaurant.id}`, JSON.stringify(kitchenOrderSettings));
  }, [kitchenOrderSettings, restaurant.id]);

  // ── Cross-device settings sync ──────────────────────────────────────────────
  // Only writes to DB when a setting *changes* after initial load.
  // Skips the first render so login/refresh doesn't trigger a redundant write.
  const settingsSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsInitializedRef = useRef(false);
  useEffect(() => {
    // Skip on first render — values were just loaded from DB, no write needed.
    if (!settingsInitializedRef.current) {
      settingsInitializedRef.current = true;
      return;
    }
    if (settingsSyncTimerRef.current) clearTimeout(settingsSyncTimerRef.current);
    settingsSyncTimerRef.current = setTimeout(() => {
      const bundle: Record<string, any> = {
        // Preserve existing DB keys not managed here (orderCode, flags, etc.)
        ...(restaurant.settings || {}),
        receipt: receiptSettings,
        features: featureSettings,
        paymentTypes,
        taxes: taxEntries,
        font: userFont,
        currency: userCurrency,
        printers: savedPrinters,
        kitchenSettings: kitchenOrderSettings,
        onlineDeliveryOptions,
        onlinePaymentMethods,
      };
      saveAllSettingsToDb(restaurant.id, bundle);
    }, 1500);
    return () => {
      if (settingsSyncTimerRef.current) clearTimeout(settingsSyncTimerRef.current);
    };
  }, [receiptSettings, featureSettings, paymentTypes, taxEntries, userFont, userCurrency, savedPrinters, kitchenOrderSettings, onlineDeliveryOptions, onlinePaymentMethods, restaurant.id]);
  // ────────────────────────────────────────────────────────────────────────────

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

      {/* Ordering Number Code */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setReceiptAccordion(prev => ({ ...prev, orderCode: !prev.orderCode }))}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-600/30 transition-all"
        >
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ordering Number</span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${receiptAccordion.orderCode ? 'rotate-180' : ''}`} />
        </button>
        {receiptAccordion.orderCode && (
          <div className="px-4 pb-4 space-y-3 border-t dark:border-gray-600 pt-3">
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Order Code Prefix (2-5 characters)</label>
              <input
                type="text"
                value={orderCode}
                onChange={e => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
                  setOrderCode(val);
                }}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white uppercase tracking-widest"
                placeholder={(() => {
                  const cleaned = restaurant.name.replace(/[^a-zA-Z\s]/g, '').trim();
                  const words = cleaned.split(/\s+/).filter(Boolean);
                  let code: string;
                  if (words.length >= 3) code = words.slice(0, 3).map(w => w[0]).join('');
                  else if (words.length === 2) code = words[0][0] + words[1].substring(0, 2);
                  else code = (words[0] || 'QS').substring(0, 3);
                  return code.toUpperCase().padEnd(3, 'X');
                })()}
                maxLength={5}
                minLength={2}
              />
              <p className="text-[9px] text-gray-400 mt-1.5">
                This prefix is used for order IDs (e.g., <span className="font-bold text-orange-500">{orderCode || (() => {
                  const cleaned = restaurant.name.replace(/[^a-zA-Z\s]/g, '').trim();
                  const words = cleaned.split(/\s+/).filter(Boolean);
                  let code: string;
                  if (words.length >= 3) code = words.slice(0, 3).map(w => w[0]).join('');
                  else if (words.length === 2) code = words[0][0] + words[1].substring(0, 2);
                  else code = (words[0] || 'QS').substring(0, 3);
                  return code.toUpperCase().padEnd(3, 'X');
                })()}0000001</span>). Each restaurant should have a unique code to avoid conflicts.
              </p>
            </div>
            <button
              onClick={async () => {
                if (orderCode.length < 2) {
                  toast('Order code must be at least 2 characters.', 'warning');
                  return;
                }
                setIsSavingOrderCode(true);
                try {
                  const mergedSettings = {
                    ...(restaurant.settings || {}),
                    orderCode: orderCode.toUpperCase(),
                  };
                  const { error } = await supabase
                    .from('restaurants')
                    .update({ settings: mergedSettings })
                    .eq('id', restaurant.id);
                  if (error) {
                    console.warn('Cloud save failed for order code:', error.message);
                  }
                  localStorage.setItem(`qs_settings_${restaurant.id}`, JSON.stringify(mergedSettings));
                  toast('Order code saved successfully!', 'success');
                } catch (err: any) {
                  toast('Failed to save order code: ' + err.message, 'error');
                } finally {
                  setIsSavingOrderCode(false);
                }
              }}
              disabled={isSavingOrderCode || orderCode.length < 2}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50"
            >
              {isSavingOrderCode ? 'Saving...' : 'Save Order Code'}
            </button>
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
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                    staff.role === 'KITCHEN' 
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>{staff.role === 'KITCHEN' ? 'Kitchen' : 'Cashier'}</span>
                  {staff.role === 'KITCHEN' && (
                    <span className="text-[9px] text-gray-400">
                      Departments: {staff.kitchen_categories && staff.kitchen_categories.length > 0 ? staff.kitchen_categories.join(', ') : 'General Kitchen'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-3">
                <button
                  onClick={() => handleEditStaff(staff, idx)}
                  className="p-2 text-gray-300 hover:text-orange-500 transition-colors"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => handleRemoveStaff(staff, idx)}
                  className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => openAddStaffModal()}
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
          onChange={e => setUserCurrency(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
        >
          {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <p className="text-[9px] text-gray-400 mt-1.5">Currency symbol shown on prices</p>
      </div>
    </div>
  );

  const renderFeaturesContent = () => (
    <div className="space-y-4">
      <div className="rounded-xl border dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setBuiltInFeatureSections(prev => ({ ...prev, cashier: !prev.cashier }))}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all"
        >
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cashier Option</p>
          <ChevronDown size={14} className={`text-gray-400 transition-all ${builtInFeatureSections.cashier ? 'rotate-180' : ''}`} />
        </button>
        {builtInFeatureSections.cashier && (
          <div className="space-y-2 p-3 bg-white dark:bg-gray-800">
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
          </div>
        )}
      </div>

      <div className="rounded-xl border dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setBuiltInFeatureSections(prev => ({ ...prev, dining: !prev.dining }))}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all"
        >
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dining Option</p>
          <ChevronDown size={14} className={`text-gray-400 transition-all ${builtInFeatureSections.dining ? 'rotate-180' : ''}`} />
        </button>
        {builtInFeatureSections.dining && (
          <div className="space-y-2 p-3 bg-white dark:bg-gray-800">
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
        )}
      </div>

      <div className="border-t dark:border-gray-700 pt-4">
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
    </div>
  );

  const renderTableManagementContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Saved Bill & Table Management</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Allow counter to save pending bills by table</p>
        </div>
        <button
          onClick={() => {
            setFeatureSettings(prev => {
              const nextEnabled = !prev.savedBillEnabled;
              return {
                ...prev,
                savedBillEnabled: nextEnabled,
                tableManagementEnabled: nextEnabled,
              };
            });
          }}
          className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.savedBillEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${featureSettings.savedBillEnabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      <div className={`space-y-3 p-4 rounded-xl border transition-all ${
        featureSettings.savedBillEnabled
          ? 'bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700'
          : 'bg-gray-200 dark:bg-gray-900/40 border-gray-300 dark:border-gray-800 opacity-80'
      }`}>
        <div>
          <p className="text-xs font-black dark:text-white">Table Layout</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Set total tables and columns — rows are calculated automatically</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Tables</label>
            <input
              type="number"
              min={1}
              value={tableCountDraft}
              disabled={!featureSettings.savedBillEnabled}
              onChange={e => setTableCountDraft(e.target.value)}
              className="w-full px-2 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white disabled:bg-gray-300 disabled:dark:bg-gray-800/70 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Columns</label>
            <input
              type="number"
              min={1}
              max={20}
              value={tableColumnsDraft}
              disabled={!featureSettings.savedBillEnabled}
              onChange={e => setTableColumnsDraft(e.target.value)}
              className="w-full px-2 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white disabled:bg-gray-300 disabled:dark:bg-gray-800/70 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <p className="text-[9px] text-orange-400 font-bold">
          Max 4 columns shown per page — if you set more than 4 columns, the table view will paginate and you can swipe or tap the dots to navigate.
        </p>

        {(tableCountDraft !== String(featureSettings.tableCount) ||
          tableColumnsDraft !== String(featureSettings.tableColumns) ||
          (featureSettings.floorEnabled && floorCountDraft !== String(featureSettings.floorCount || 1))) && (
          <div className="flex items-center justify-end gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <button
              onClick={resetTableManagementDraft}
              disabled={!featureSettings.savedBillEnabled}
              className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTableManagementChanges}
              disabled={!featureSettings.savedBillEnabled}
              className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-green-500 text-white hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        )}
        <p className="text-[9px] text-gray-400">Rows are auto-calculated: {Math.ceil((parsePositiveIntegerDraft(tableCountDraft) ?? featureSettings.tableCount) / (parsePositiveIntegerDraft(tableColumnsDraft) ?? featureSettings.tableColumns))} row(s) based on current values.</p>
      </div>

      {/* Floor Management */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
        <div>
          <p className="text-xs font-black dark:text-white">Enable Floors</p>
          <p className="text-[9px] text-gray-400 mt-0.5">Organize tables by floor level (max 5 floors)</p>
        </div>
        <button
          onClick={() => {
            setFeatureSettings(prev => ({
              ...prev,
              floorEnabled: !prev.floorEnabled,
              floorCount: !prev.floorEnabled ? (prev.floorCount || 1) : prev.floorCount,
            }));
            setSelectedFloor(1);
            setModalSelectedFloor(1);
          }}
          disabled={!featureSettings.savedBillEnabled}
          className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.floorEnabled && featureSettings.savedBillEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'} ${!featureSettings.savedBillEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${featureSettings.floorEnabled && featureSettings.savedBillEnabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {featureSettings.floorEnabled && featureSettings.savedBillEnabled && (
        <div className={`space-y-3 p-4 rounded-xl border transition-all bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700`}>
          <div>
            <p className="text-xs font-black dark:text-white">Number of Floors</p>
            <p className="text-[9px] text-gray-400 mt-0.5">Each floor will have the same table layout ({featureSettings.tableCount} tables per floor)</p>
          </div>
          <div className="w-32">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Floors (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={floorCountDraft}
              onChange={e => setFloorCountDraft(e.target.value)}
              className="w-full px-2 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
            />
          </div>
          <p className="text-[9px] text-gray-400">Tables will be labeled as <span className="font-black text-orange-500">F1-1</span>, <span className="font-black text-orange-500">F1-2</span>, <span className="font-black text-orange-500">F2-1</span>, etc.</p>

          {floorCountDraft !== String(featureSettings.floorCount || 1) && (
            <div className="flex items-center justify-end gap-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <button
                onClick={() => setFloorCountDraft(String(featureSettings.floorCount || 1))}
                className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFloorChanges}
                className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-green-500 text-white hover:bg-green-600 transition-all"
              >
                Save Changes
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderKitchenSettingsContent = () => {
    const kitchenStaff = staffList.filter((s: any) => s.role === 'KITCHEN');
    return (
      <>
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
          <div>
            <p className="text-xs font-black dark:text-white">Kitchen Display System</p>
            <p className="text-[9px] text-gray-400 mt-0.5">Route orders to kitchen screens with department support</p>
          </div>
          <button
            onClick={() => updateFeatureSetting('kitchenEnabled', !featureSettings.kitchenEnabled)}
            className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.kitchenEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${featureSettings.kitchenEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {featureSettings.kitchenEnabled && (
          <>
            {/* Departments / Divisions */}
            <div className="pt-3">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Departments</p>
              <p className="text-[9px] text-gray-400 mb-2">Create kitchen departments to route specific categories to specific screens.</p>
              {kitchenDivisions.length > 0 && (
                <div className="space-y-2 mb-2">
                  {kitchenDivisions.map(dep => (
                    <div key={dep.name} className="p-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-700">
                      <div className="flex items-center justify-between gap-2 mb-0">
                        {renamingDepartment === dep.name ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              autoFocus
                              type="text"
                              value={renameDepartmentValue}
                              onChange={e => setRenameDepartmentValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameDivision(dep.name, renameDepartmentValue);
                                if (e.key === 'Escape') {
                                  setRenamingDepartment(null);
                                  setRenameDepartmentValue('');
                                }
                              }}
                              className="flex-1 px-2 py-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-[10px] font-black dark:text-white uppercase tracking-widest"
                            />
                            <button onClick={() => handleRenameDivision(dep.name, renameDepartmentValue)} className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg transition-colors"><CheckCircle2 size={14} /></button>
                            <button onClick={() => { setRenamingDepartment(null); setRenameDepartmentValue(''); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 dark:text-orange-400">{dep.name}</p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setRenamingDepartment(dep.name);
                                  setRenameDepartmentValue(dep.name);
                                }}
                                className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button onClick={() => handleRemoveDivision(dep.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                            </div>
                          </>
                        )}
                      </div>

                      <p className="text-[8px] text-gray-400 mt-1 mb-1 leading-tight uppercase tracking-wider font-bold">Categories:</p>
                      <div className="flex flex-wrap gap-1">
                        {allFoodCategories.length === 0 ? (
                          <span className="text-[9px] text-gray-400 italic">No categories yet.</span>
                        ) : allFoodCategories.map(categoryName => {
                          const selected = dep.categories.includes(categoryName);
                          return (
                            <button
                              key={`${dep.name}-${categoryName}`}
                              onClick={() => handleToggleDivisionCategory(dep.name, categoryName)}
                              className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide transition-all ${
                                selected
                                  ? 'bg-orange-500 text-white shadow-sm'
                                  : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-600'
                              }`}
                            >
                              {selected && <span className="mr-0.5">✓</span>}{categoryName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDivisionName}
                  onChange={e => setNewDivisionName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddDivision(); }}
                  placeholder="e.g. Grill, Pastry, Drinks..."
                  className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                />
                <button
                  onClick={handleAddDivision}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Kitchen Staff */}
            <div className="pt-3 mt-3">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Kitchen Staff</p>
              <p className="text-[9px] text-gray-400 mb-2">Staff assigned to kitchen role can access the Kitchen Display.</p>
              {kitchenStaff.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {kitchenStaff.map((staff: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                      <div>
                        <p className="text-xs font-black dark:text-white">{staff.username}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">Kitchen</span>
                          <span className="text-[9px] text-gray-400">
                            Departments: {staff.kitchen_categories && staff.kitchen_categories.length > 0 ? staff.kitchen_categories.join(', ') : 'General Kitchen'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveStaff(staff, staffList.indexOf(staff))}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-dashed dark:border-gray-600 mb-3">
                  <Users size={20} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black">No kitchen staff yet</p>
                </div>
              )}
              <button
                onClick={() => openAddStaffModal('KITCHEN')}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={14} /> Add Kitchen Staff
              </button>
            </div>
          </>
        )}
      </>
    );
  };

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

  const renderPaymentAndTaxesContent = () => (
    <div className="space-y-5">
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setPaymentTaxAccordion(prev => ({ ...prev, paymentTypes: !prev.paymentTypes }))}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-600/30 transition-all"
        >
          <div className="text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Payment Type</p>
            <p className="text-[10px] text-gray-400 mt-1">{paymentTypes.length} types</p>
          </div>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${paymentTaxAccordion.paymentTypes ? 'rotate-180' : ''}`} />
        </button>
        {paymentTaxAccordion.paymentTypes && (
          <div className="px-4 pb-4 border-t dark:border-gray-600 pt-3">
            {renderPaymentTypesContent()}
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setPaymentTaxAccordion(prev => ({ ...prev, taxes: !prev.taxes }))}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-600/30 transition-all"
        >
          <div className="text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Taxes</p>
            <p className="text-[10px] text-gray-400 mt-1">{taxEntries.length} configured</p>
          </div>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${paymentTaxAccordion.taxes ? 'rotate-180' : ''}`} />
        </button>
        {paymentTaxAccordion.taxes && (
          <div className="px-4 pb-4 border-t dark:border-gray-600 pt-3">
            {renderTaxesContent()}
          </div>
        )}
      </div>
    </div>
  );

  const renderQrGeneratorContent = () => {
    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : '';

    const startNum = parseInt(qrGenStartNum, 10) || 1;
    const count = Math.min(Math.max(parseInt(qrGenTableCount, 10) || 1, 1), 50);
    const tableNames = Array.from({ length: count }, (_, i) => `${qrGenTablePrefix}${startNum + i}`);

    const buildQrUrl = (tableName: string) => {
      if (restaurant.location === QS_DEFAULT_HUB) {
        const identifier = restaurant.slug || restaurant.id;
        const param = restaurant.slug ? 'r' : 'restaurant';
        return `${baseUrl}/?${param}=${encodeURIComponent(identifier)}&table=${encodeURIComponent(tableName)}`;
      }
      return `${baseUrl}/?loc=${encodeURIComponent(qrGenLocation || restaurant.location)}&table=${encodeURIComponent(tableName)}`;
    };

    const buildQrImageUrl = (tableName: string) => {
      const data = encodeURIComponent(buildQrUrl(tableName));
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data}&margin=10`;
    };

    const handleDownloadQr = async (tableName: string) => {
      const imgUrl = buildQrImageUrl(tableName);
      try {
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${qrGenLocation || restaurant.location}_${tableName}.png`.replace(/\s+/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        toast('Failed to download QR code. Try right-clicking the image and saving it.', 'warning');
      }
    };

    const handlePrintQrs = () => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) { toast('Please allow popups to print QR codes.', 'warning'); return; }
      const qrItems = tableNames.map(t => `
        <div style="display:inline-block;margin:12px;text-align:center;border:1px solid #e5e7eb;border-radius:12px;padding:16px;break-inside:avoid;">
          <img src="${buildQrImageUrl(t)}" style="width:160px;height:160px;" />
          <div style="margin-top:8px;font-weight:900;font-size:14px;font-family:sans-serif;text-transform:uppercase;">${t}</div>
          <div style="font-size:9px;color:#9ca3af;font-family:monospace;margin-top:4px;word-break:break-all;max-width:160px;">${buildQrUrl(t)}</div>
        </div>
      `).join('');
      printWindow.document.write(`
        <html><head><title>QR Codes — ${qrGenLocation || (restaurant.location === QS_DEFAULT_HUB ? restaurant.name : restaurant.location)}</title>
        <style>@media print{body{margin:0}}</style></head>
        <body style="padding:16px;">${qrItems}</body></html>
      `);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); }, 500);
    };

    return (
      <div className="space-y-6">
        {/* Config */}
        <div className="space-y-3">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">{restaurant.location === QS_DEFAULT_HUB ? 'Restaurant Name (for labels)' : 'Location Name'}</label>
            <input
              type="text"
              value={qrGenLocation || (restaurant.location === QS_DEFAULT_HUB ? restaurant.name : restaurant.location)}
              onChange={e => setQrGenLocation(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              placeholder={restaurant.location === QS_DEFAULT_HUB ? restaurant.name : (restaurant.location || 'e.g. Main Hall')}
            />
            <p className="text-[9px] text-gray-400 mt-1 ml-1">{restaurant.location === QS_DEFAULT_HUB ? 'Used as a label on printed QR codes' : <span>This maps to the <code className="font-mono">?loc=</code> parameter in the QR URL</span>}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Table Prefix</label>
              <input
                type="text"
                value={qrGenTablePrefix}
                onChange={e => setQrGenTablePrefix(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                placeholder="Table "
              />
            </div>
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Start Number</label>
              <input
                type="number"
                value={qrGenStartNum}
                onChange={e => setQrGenStartNum(e.target.value)}
                min="1"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                placeholder="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Number of Tables (max 50)</label>
            <input
              type="number"
              value={qrGenTableCount}
              onChange={e => setQrGenTableCount(e.target.value)}
              min="1"
              max="50"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              placeholder="5"
            />
          </div>
        </div>

        {/* Preview single QR */}
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-3">
          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Single QR Preview</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={qrGenPreviewTable}
              onChange={e => setQrGenPreviewTable(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
              placeholder={tableNames[0] || 'Table 1'}
            />
          </div>
          {(() => {
            const t = qrGenPreviewTable || tableNames[0];
            if (!t) return null;
            return (
              <div className="flex flex-col items-center gap-3 py-2">
                <img
                  src={buildQrImageUrl(t)}
                  alt={`QR for ${t}`}
                  className="w-36 h-36 rounded-lg border dark:border-gray-600"
                />
                <p className="text-[10px] font-black dark:text-white uppercase tracking-widest">{t}</p>
                <p className="text-[9px] text-gray-400 font-mono text-center break-all max-w-xs">{buildQrUrl(t)}</p>
                <button
                  onClick={() => handleDownloadQr(t)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-2"
                >
                  <Download size={14} /> Download
                </button>
              </div>
            );
          })()}
        </div>

        {/* Bulk generate */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{count} Table QR Codes</p>
            <button
              onClick={handlePrintQrs}
              className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-500 hover:text-white dark:hover:bg-orange-500 dark:hover:text-white transition-all flex items-center gap-2"
            >
              <Printer size={14} /> Print All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
            {tableNames.map(t => (
              <div key={t} className="flex flex-col items-center gap-1 p-2 bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600">
                <img
                  src={buildQrImageUrl(t)}
                  alt={`QR ${t}`}
                  className="w-full aspect-square rounded"
                />
                <p className="text-[9px] font-black dark:text-white uppercase tracking-tighter text-center line-clamp-1">{t}</p>
                <button
                  onClick={() => handleDownloadQr(t)}
                  className="p-1 text-gray-400 hover:text-orange-500 transition-colors"
                  title={`Download QR for ${t}`}
                >
                  <Download size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

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

      {/* Left Sidebar Navigation */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 border-r dark:border-gray-700 
        flex flex-col transition-all duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isSidebarCollapsed ? 'lg:w-16' : 'w-64'}
      `}>
        <div className={`border-b dark:border-gray-700 flex items-center ${isSidebarCollapsed ? 'p-3 justify-center' : 'px-4 py-4 gap-3'}`}>
          <img src={restaurant.logo} className={`rounded-lg shadow-sm ${isSidebarCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`} />
          {!isSidebarCollapsed && (
            <div>
              <h2 className="font-black dark:text-white text-sm uppercase tracking-tight leading-tight">{restaurant.name}</h2>
              <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest">{showKitchenFeature && showQrFeature ? 'POS + Kitchen + QR' : showKitchenFeature ? 'POS + Kitchen' : showQrFeature ? 'POS + QR' : 'POS Terminal'}</p>
            </div>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2 space-y-1' : 'px-3 py-4 space-y-1'}`}>
          {isKitchenUser && (
            <button
              onClick={() => handleTabSelection('KITCHEN')}
              title="Incoming Orders"
              className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'KITCHEN'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <Coffee size={18} /> {!isSidebarCollapsed && 'Incoming Orders'}
            </button>
          )}

          {!isKitchenUser && (<>
          {/* Operations Group */}
          {!isSidebarCollapsed && (
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Operations</p>
          )}
          <button 
            onClick={() => handleTabSelection('COUNTER')}
            title="Counter"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'COUNTER' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <ShoppingBag size={18} /> {!isSidebarCollapsed && 'Counter'}
          </button>

          {showQrFeature && (
            <button
              onClick={() => handleTabSelection('QR_ORDERS')}
              title="QR Orders"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'QR_ORDERS'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <QrCode size={18} />
                {!isSidebarCollapsed && 'QR Orders'}
              </div>
              {!isSidebarCollapsed && (() => {
                const pendingQr = orders.filter(o => o.status === OrderStatus.PENDING).length;
                return pendingQr > 0 ? (
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">{pendingQr}</span>
                ) : null;
              })()}
              {isSidebarCollapsed && (() => {
                const pendingQr = orders.filter(o => o.status === OrderStatus.PENDING).length;
                return pendingQr > 0 ? (
                  <span className="absolute top-1 right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">{pendingQr}</span>
                ) : null;
              })()}
            </button>
          )}

          {showOnlineShopFeature && (
            <button
              onClick={() => handleTabSelection('ONLINE_ORDERS')}
              title="Online Orders"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'ONLINE_ORDERS'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Globe size={18} />
                {!isSidebarCollapsed && 'Online Orders'}
              </div>
            </button>
          )}

          {/* Management Group */}
          {!isSidebarCollapsed && (
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Management</p>
          )}
          {isSidebarCollapsed && <div className="border-t dark:border-gray-700 my-0.5" />}
          <button 
            onClick={() => handleTabSelection('MENU_EDITOR')}
            title="Menu Editor"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'MENU_EDITOR' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BookOpen size={18} /> {!isSidebarCollapsed && 'Menu Editor'}
          </button>

          <button 
            onClick={handleReportsClick}
            title="Bill and Report"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'REPORTS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BarChart3 size={18} /> {!isSidebarCollapsed && 'Reports'}
          </button>

          <button 
            onClick={() => handleTabSelection('SETTINGS')}
            title="Settings"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'SETTINGS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Settings size={18} /> {!isSidebarCollapsed && 'Settings'}
          </button>

          {/* Account Group */}
          {!isSidebarCollapsed && (
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-4 pb-1">Account</p>
          )}
          {isSidebarCollapsed && <div className="border-t dark:border-gray-700 my-0.5" />}
          <button 
            onClick={() => handleTabSelection('ADDONS')}
            title="Add-on Feature"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'ADDONS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Package size={18} /> {!isSidebarCollapsed && 'Add-on Feature'}
          </button>
          <button 
            onClick={() => handleTabSelection('BILLING')}
            title="Billing"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'BILLING' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <CreditCard size={18} /> {!isSidebarCollapsed && 'Billing'}
          </button>
          </>)}
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

        {/* Printer Connection Status */}
        <div className={`mt-auto border-t dark:border-gray-700 space-y-1.5 ${isSidebarCollapsed ? 'p-2' : 'px-3 py-2'}`}>
          {!isSidebarCollapsed && <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Printer Connection</label>}
          <button
            onClick={handlePrinterButtonClick}
            disabled={isAutoReconnecting}
            className={`w-full py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg ${
              isAutoReconnecting
                ? 'bg-blue-500 text-white cursor-wait'
                : realPrinterConnected
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : connectedDevice
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-gray-400 text-white hover:bg-gray-500'
            }`}
          >
            {isAutoReconnecting ? (
              <>
                <Bluetooth size={18} className="animate-pulse" />
                {!isSidebarCollapsed && 'Connecting...'}
              </>
            ) : realPrinterConnected ? (
              <>
                <BluetoothConnected size={18} />
                {!isSidebarCollapsed && 'Printer Connected'}
              </>
            ) : connectedDevice ? (
              <>
                <Bluetooth size={18} />
                {!isSidebarCollapsed && 'Printer Offline'}
              </>
            ) : (
              <>
                <Bluetooth size={18} />
                {!isSidebarCollapsed && 'No Printer'}
              </>
            )}
          </button>
          {connectedDevice && !isSidebarCollapsed && (
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  isAutoReconnecting ? 'bg-blue-500 scale-125' : (realPrinterConnected ? 'bg-green-500' : 'bg-red-500')
                } transition-all duration-300 animate-pulse`}></div>
                <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">{connectedDevice.name}</span>
              </div>
              {isAutoReconnecting && <RotateCw size={10} className="animate-spin text-blue-500" />}
            </div>
          )}
          {isVendorUser && onNavigateBackOffice && (
            <button
              onClick={onNavigateBackOffice}
              title="Back Office"
              className={`w-full py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg bg-gray-700 dark:bg-gray-600 text-white hover:bg-gray-800 dark:hover:bg-gray-500`}
            >
              <Briefcase size={18} />
              {!isSidebarCollapsed && 'Back Office'}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area - Same as PosView but without Settings tab */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center p-4 landscape:py-1.5 landscape:px-2 bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-30 no-print">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="ml-4 flex items-center gap-2 flex-1 min-w-0">
              <img src={restaurant.logo} className="w-8 h-8 landscape:w-6 landscape:h-6 rounded-lg shadow-sm flex-shrink-0" />
              <h1 className="font-black dark:text-white uppercase tracking-tighter text-sm landscape:text-xs truncate">
                {activeTab === 'COUNTER' ? 'POS Counter' : 
                 activeTab === 'MENU_EDITOR' ? (isFormModalOpen ? (formItem.id ? 'Edit Item' : 'New Item') : 'Menu Editor') : 
                 activeTab === 'REPORTS' ? 'Bill and Report' : 
                 activeTab === 'QR_ORDERS' ? 'QR Orders' :
                 activeTab === 'ONLINE_ORDERS' ? 'Online Orders' :
                 activeTab === 'KITCHEN' ? 'Incoming Orders' :
                 activeTab === 'BILLING' ? 'Billing' :
                 activeTab === 'ADDONS' ? (addonDetailView ? 'Feature Details' : 'Add-on Feature') :
                 'Settings'}
              </h1>
            </div>
            {/* Mobile View Option (only on COUNTER tab) */}
            {activeTab === 'COUNTER' && (
              <div className="relative ml-2 flex-shrink-0">
                <button
                  onClick={() => setShowLayoutPicker(!showLayoutPicker)}
                  className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-all"
                >
                  <LayoutGrid size={18} />
                </button>
                {showLayoutPicker && (
                  <div className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 p-1 rounded-xl shadow-lg">
                    <button onClick={() => { setMobileMenuLayout('2'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${mobileMenuLayout === '2' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>2</button>
                    <button onClick={() => { setMobileMenuLayout('3'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${mobileMenuLayout === '3' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>3</button>
                    <button onClick={() => { setMobileMenuLayout('list'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all ${mobileMenuLayout === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}><List size={14} /></button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Counter Tab - Same as PosView */}
          {activeTab === 'COUNTER' && (
            <>
              {/* Saved Bill selection panel */}
              {counterMode === 'SAVED_BILL' ? (
                <div className="flex-1 overflow-hidden flex flex-col p-4">
                  {!featureSettings.savedBillEnabled ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                      <Receipt size={48} className="mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Saved bill feature is disabled</p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="mb-3">
                        <p className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Table Arrangement</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Choose a table with pending bill to continue editing, or view empty tables ready for new saved bills.</p>
                      </div>
                      {/* Floor tabs */}
                      {featureSettings.floorEnabled && effectiveFloorCount > 1 && (
                        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
                          {Array.from({ length: effectiveFloorCount }, (_, i) => i + 1).map(f => (
                            <button
                              key={f}
                              onClick={() => { setSelectedFloor(f); setTableColPage(0); }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                                selectedFloor === f
                                  ? 'bg-orange-500 text-white shadow-sm'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              Floor {f}
                            </button>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const COLS_PER_PAGE = 4;
                        const totalColPages = Math.ceil(effectiveTableCols / COLS_PER_PAGE);
                        const safePage = Math.min(tableColPage, Math.max(0, totalColPages - 1));
                        const colStart = safePage * COLS_PER_PAGE;
                        // Always use COLS_PER_PAGE columns for consistent cell width,
                        // unless total cols < 4 (then shrink to fit)
                        const gridCols = Math.min(COLS_PER_PAGE, effectiveTableCols);
                        const colsThisPage = Math.min(COLS_PER_PAGE, effectiveTableCols - colStart);
                        return (
                          <>
                      <div
                        className="flex-1 overflow-y-auto space-y-2 min-h-0"
                        onTouchStart={e => { tableSwipeStartX.current = e.touches[0].clientX; }}
                        onTouchEnd={e => {
                          if (tableSwipeStartX.current === null) return;
                          const delta = e.changedTouches[0].clientX - tableSwipeStartX.current;
                          tableSwipeStartX.current = null;
                          if (Math.abs(delta) < 40) return;
                          if (delta < 0) setTableColPage(p => Math.min(p + 1, totalColPages - 1));
                          else setTableColPage(p => Math.max(p - 1, 0));
                        }}
                      >
                        {tableRowsForSelection.map((row, rowIdx) => (
                          <div key={`saved-row-${rowIdx}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
                            {Array.from({ length: colsThisPage }, (_, i) => {
                              const colIdx = colStart + i;
                              const table = colIdx < effectiveTableCols ? (row[colIdx] || null) : null;
                              if (!table) {
                                return <div key={`saved-empty-${rowIdx}-${i}`} aria-hidden="true" />;
                              }
                              const tableBill = savedBillsByTable.get(table);
                              const hasPending = !!tableBill;
                              const isActiveTable = activeSavedBillTable === table;
                              return (
                                <div
                                  key={table}
                                  className={`saved-table-cell rounded-xl border p-3 transition-all ${
                                    isActiveTable
                                      ? 'border-orange-600 bg-orange-100 dark:bg-orange-900/30 shadow-[0_0_0_1px_rgba(234,88,12,0.5),0_0_20px_rgba(234,88,12,0.35)]'
                                      :
                                    hasPending
                                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-[0_0_0_1px_rgba(249,115,22,0.35),0_0_16px_rgba(249,115,22,0.3)]'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-70'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest dark:text-white">{table}</p>
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${hasPending ? 'text-orange-500' : 'text-gray-400'}`}>
                                      {hasPending ? 'Pending' : 'Empty'}
                                    </span>
                                  </div>
                                  {hasPending ? (
                                    <>
                                      <p className="mt-1 text-[9px] text-gray-500 dark:text-gray-300 line-clamp-1">
                                        {tableBill.items.length} items · {currencySymbol}{(tableBill.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + activeTaxEntries.reduce((sum, tax) => sum + ((tableBill.items.reduce((sub, item) => sub + item.price * item.quantity, 0) * tax.percentage) / 100), 0)).toFixed(2)}
                                      </p>
                                      <div className="mt-2 flex gap-1">
                                        <button
                                          onClick={() => loadSavedBill(table)}
                                          className="flex-1 py-1.5 bg-orange-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-600 transition-all"
                                        >
                                          Load
                                        </button>
                                        <button
                                          onClick={() => deleteSavedBill(table)}
                                          className="px-2 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                                        >
                                          Del
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="mt-2 text-[9px] text-gray-400">No pending bill</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      {/* Fixed dot indicator area — always takes space so layout never shifts */}
                      <div className="h-8 flex items-center justify-center gap-1.5 shrink-0">
                        {totalColPages > 1 && Array.from({ length: totalColPages }, (_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setTableColPage(i)}
                            className={`h-2 rounded-full transition-all duration-200 ${
                              i === safePage ? 'bg-orange-500 w-5' : 'bg-gray-300 dark:bg-gray-600 w-2 hover:bg-gray-400'
                            }`}
                          />
                        ))}
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : showQrFeature && counterMode === 'QR_ORDER' ? (
                <div className="flex-1 overflow-y-auto p-4">
                  {(() => {
                    const servedOrders = orders.filter(o => o.status === OrderStatus.SERVED);
                    if (servedOrders.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                          <QrCode size={48} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-widest">No served orders waiting</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {servedOrders.map(order => (
                          <button
                            key={order.id}
                            onClick={() => setSelectedQrOrderForPayment(order)}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                              selectedQrOrderForPayment?.id === order.id
                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <QrCode size={14} className="text-orange-500" />
                                <span className="text-xs font-black dark:text-white uppercase">Table {order.tableNumber}</span>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">#{order.id}</span>
                              </div>
                              <span className="text-xs font-black text-orange-500">{currencySymbol}{order.total.toFixed(2)}</span>
                            </div>
                            <div className="space-y-0.5">
                              {order.items.map((item, idx) => (
                                <p key={idx} className="text-[10px] text-gray-500 dark:text-gray-400">x{item.quantity} {item.name}</p>
                              ))}
                            </div>
                            {selectedQrOrderForPayment?.id === order.id && (
                              <p className="mt-2 text-[9px] font-black text-orange-500 uppercase tracking-widest">Selected — see right panel to complete payment</p>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <>
              <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 lg:px-6 py-3 lg:py-4 max-lg:landscape:py-1.5 flex flex-col gap-3 lg:gap-4 max-lg:landscape:gap-1">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 pb-1">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 lg:px-4 lg:py-2 max-lg:landscape:py-0.5 max-lg:landscape:px-2 rounded-lg font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                          selectedCategory === cat 
                            ? 'bg-black text-white dark:bg-white dark:text-black' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="relative shrink-0 hidden lg:block">
                    <button onClick={() => setShowLayoutPicker(!showLayoutPicker)} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-all">
                      <LayoutGrid size={16} />
                    </button>
                    {showLayoutPicker && (
                      <div className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 p-1 rounded-xl shadow-lg">
                        <button onClick={() => { setMenuLayout('grid-3'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${menuLayout === 'grid-3' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>3</button>
                        <button onClick={() => { setMenuLayout('grid-4'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${menuLayout === 'grid-4' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>4</button>
                        <button onClick={() => { setMenuLayout('grid-5'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${menuLayout === 'grid-5' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>5</button>
                        <button onClick={() => { setMenuLayout('grid-6'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all text-[10px] font-black ${menuLayout === 'grid-6' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>6</button>
                        <button onClick={() => { setMenuLayout('list'); setShowLayoutPicker(false); }} className={`p-2 rounded-lg transition-all ${menuLayout === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}><List size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search menu items..." 
                    className="w-full pl-12 pr-4 py-3 max-lg:landscape:py-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    value={menuSearch}
                    onChange={e => setMenuSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 pb-24 lg:pb-2 scroll-smooth">
                <div className="space-y-4">
                  {Object.entries(groupedMenu).map(([category, items]) => (
                    <section key={category}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">{category}</h3>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                      </div>
                      
                      <div className={`grid gap-1.5 ${
                        mobileMenuLayout === '2' ? 'grid-cols-2' :
                        mobileMenuLayout === '3' ? 'grid-cols-3' :
                        'grid-cols-1'
                      } ${
                        menuLayout === 'list' ? 'lg:grid-cols-1' :
                        menuLayout === 'grid-3' ? 'lg:grid-cols-3' :
                        menuLayout === 'grid-4' ? 'lg:grid-cols-4' :
                        menuLayout === 'grid-5' ? 'lg:grid-cols-5' :
                        'lg:grid-cols-6'
                      }`}>
                        {items.map(item => (
                          <button
                            key={item.id}
                            onClick={() => handleMenuItemClick(item)}
                            className={`relative bg-white dark:bg-gray-800 border dark:border-gray-700 text-left hover:border-orange-500 transition-all group shadow-sm flex p-2 rounded-xl ${
                              mobileMenuLayout === 'list' ? 'flex-row items-center gap-4' : 'flex-col'
                            } ${
                              menuLayout === 'list' ? 'lg:flex-row lg:items-center lg:gap-4' : 'lg:flex-col lg:items-stretch lg:gap-0'
                            } ${flashItemId === item.id ? 'ring-2 ring-green-500 border-green-500 scale-95' : ''}`}
                            style={flashItemId === item.id ? { transition: 'all 0.15s ease-in-out' } : {}}
                          >
                            {flashItemId === item.id && (
                              <div className="absolute inset-0 bg-green-500/20 rounded-xl flex items-center justify-center z-10 pointer-events-none">
                                <CheckCircle2 size={28} className="text-green-500 drop-shadow-md" />
                              </div>
                            )}
                            <div className={`${
                              mobileMenuLayout === 'list' ? 'w-16 h-16' : 'aspect-square w-full'
                            } ${
                              menuLayout === 'list' ? 'lg:w-16 lg:h-16 lg:aspect-auto' : 'lg:aspect-square lg:w-full'
                            } rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0`}
                            style={!item.image && item.color ? { backgroundColor: item.color } : undefined}
                            >
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/70">
                                  <ShoppingBag size={20} />
                                </div>
                              )}
                            </div>
                            <div className={`${mobileMenuLayout === 'list' ? 'flex-1' : 'mt-3'} ${menuLayout === 'list' ? 'lg:flex-1 lg:mt-0' : 'lg:flex-none lg:mt-3'}`}>
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
            </>
          )}

          {/* Reports Tab - Same as PosView */}
          {activeTab === 'REPORTS' && reportsSubMenu === 'salesReport' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
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

          {/* Menu Editor Tab */}
          {activeTab === 'MENU_EDITOR' && isFormModalOpen ? (
            <MenuItemFormModal
              isOpen={isFormModalOpen}
              formItem={formItem}
              setFormItem={setFormItem}
              categories={menuEditorCategories}
              availableModifiers={modifiers}
              availableAddOnItems={addOnItems}
              onClose={handleCloseFormModal}
              onSubmit={handleSaveMenuItem}
              onImageUpload={handleImageUpload}
              onSaveModifier={(modifier) => {
                const duplicate = modifiers.some(m => m.name === modifier.name);
                if (duplicate) {
                  toast('A modifier with this name already exists.', 'warning');
                  return;
                }
                setModifiers(prev => [...prev, modifier]);
              }}
            />
          ) : activeTab === 'MENU_EDITOR' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div>
                <div className="mb-8">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-4">Menu Editor</h1>
                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                      <button onClick={() => setMenuSubTab('KITCHEN')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'KITCHEN' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Kitchen Menu</button>
                      <button onClick={() => setMenuSubTab('CATEGORY')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'CATEGORY' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Category</button>
                      <button onClick={() => setMenuSubTab('MODIFIER')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'MODIFIER' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Modifier</button>
                      <button onClick={() => setMenuSubTab('ADDON')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'ADDON' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Add-On Item</button>
                    </div>

                    {menuSubTab === 'KITCHEN' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setMenuViewMode('grid')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setMenuViewMode('list')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setMenuStatusFilter('ACTIVE')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ACTIVE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Eye size={14} /> <span className="hidden sm:inline">Active</span></button>
                            <button onClick={() => setMenuStatusFilter('ARCHIVED')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ARCHIVED' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Archive size={14} /> <span className="hidden sm:inline">Archived</span></button>
                          </div>
                          <button onClick={() => handleOpenAddModal()} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">+ Add Item</button>
                        </div>
                      </>
                    ) : menuSubTab === 'CATEGORY' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setClassViewMode('grid')} className={`p-2 rounded-lg transition-all ${classViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setClassViewMode('list')} className={`p-2 rounded-lg transition-all ${classViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={() => setShowAddClassModal(true)} className="ml-auto px-4 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Tag size={16} /> + New Category
                        </button>
                      </>
                    ) : menuSubTab === 'MODIFIER' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setModifierViewMode('grid')} className={`p-2 rounded-lg transition-all ${modifierViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setModifierViewMode('list')} className={`p-2 rounded-lg transition-all ${modifierViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={handleAddModifier} className="ml-auto px-4 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Coffee size={16} /> + New Modifier
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setAddOnViewMode('grid')} className={`p-2 rounded-lg transition-all ${addOnViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setAddOnViewMode('list')} className={`p-2 rounded-lg transition-all ${addOnViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={() => setAddOnItems(prev => [...prev, { name: '', price: 0, maxQuantity: 1, required: false }])} className="ml-auto px-4 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <PlusCircle size={16} /> + New Add-On
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {menuSubTab === 'KITCHEN' && (
                  <>
                    <div className="flex items-center gap-2 mb-6 bg-white dark:bg-gray-800 px-4 py-3 border dark:border-gray-700 rounded-lg shadow-sm overflow-x-auto hide-scrollbar sticky top-0 z-20">
                      <Filter size={16} className="text-gray-400 shrink-0" />
                      {menuEditorCategories.map(cat => (
                        <button key={cat} onClick={() => setMenuCategoryFilter(cat)} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuCategoryFilter === cat ? 'bg-orange-100 text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>{cat}</button>
                      ))}
                    </div>

                    {menuViewMode === 'grid' ? (
                      <div className="grid grid-cols-5 gap-3">
                        {currentMenu.map(item => (
                          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border dark:border-gray-700 hover:shadow-md transition-all group flex flex-col">
                            <div className="relative aspect-square overflow-hidden" style={!item.image && item.color ? { backgroundColor: item.color } : undefined}>
                              {item.image ? (
                                <img src={item.image} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/50">
                                  <ShoppingBag size={28} />
                                </div>
                              )}
                              <div className="absolute top-2 right-2 flex gap-1">
                                {menuStatusFilter === 'ACTIVE' ? (
                                  <>
                                    <button onClick={() => handleArchiveItem(item)} className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Archive size={18} /></button>
                                    <button onClick={() => handleOpenEditModal(item)} className="p-1.5 bg-white/90 backdrop-blur rounded-lg text-gray-700 shadow-sm"><Edit3 size={18} /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => handleRestoreItem(item)} className="p-1.5 bg-green-50/90 backdrop-blur rounded-lg text-green-600 shadow-sm"><RotateCcw size={18} /></button>
                                    <button onClick={() => handlePermanentDelete(item.id)} className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Trash2 size={18} /></button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="p-2">
                              <h3 className="font-black text-xs text-gray-900 dark:text-white mb-1 uppercase tracking-tight line-clamp-1">{item.name}</h3>
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-black text-orange-500">{currencySymbol}{item.price.toFixed(2)}</span>
                                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 truncate ml-1">{item.category}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                              <tr>
                                <th className="px-4 py-3 text-left">Dish Profile</th>
                                <th className="px-4 py-3 text-left">Category</th>
                                <th className="px-4 py-3 text-left">Base Cost</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-700">
                              {currentMenu.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      {item.image ? (
                                        <img src={item.image} className="w-10 h-10 rounded-lg object-cover" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60" style={item.color ? { backgroundColor: item.color } : { backgroundColor: '#D1D5DB' }}>
                                          <ShoppingBag size={16} />
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-xs">{item.name}</p>
                                        <p className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-[9px] font-black uppercase text-gray-400">{item.category}</td>
                                  <td className="px-4 py-3 font-black text-gray-900 dark:text-white text-xs">{currencySymbol}{item.price.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end items-center gap-1">
                                      {menuStatusFilter === 'ACTIVE' ? (
                                        <button onClick={() => handleArchiveItem(item)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><Archive size={20} /></button>
                                      ) : (
                                        <button onClick={() => handleRestoreItem(item)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"><RotateCcw size={20} /></button>
                                      )}
                                      <button onClick={() => handleOpenEditModal(item)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg transition-all"><Edit3 size={20} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {menuSubTab === 'CATEGORY' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b dark:border-gray-700 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Layers size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Category Manager</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{extraCategories.length} Total</span>
                    </div>

                    <div className={classViewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4' : 'divide-y dark:divide-gray-700'}>
                      {extraCategories.map(category => {
                        const itemsInCategory = restaurant.menu.filter(item => item.category === category.name && !item.isArchived);

                        if (classViewMode === 'grid') {
                          return (
                            <div key={category.name} className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border dark:border-gray-700 rounded-lg hover:border-orange-200 transition-all">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg flex items-center justify-center">
                                    <Layers size={16} />
                                  </div>
                                  <div>
                                    <h4 className="font-black text-xs dark:text-white uppercase tracking-tight">{category.name}</h4>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase">{itemsInCategory.length} Items</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => { setRenamingClass(category.name); setRenameValue(category.name); }} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg">
                                    <Edit3 size={14} />
                                  </button>
                                  <button onClick={() => handleRemoveCategory(category.name)} className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>


                            </div>
                          );
                        }

                        return (
                          <div key={category.name} className="flex items-center justify-between p-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="w-8 h-8 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-lg flex items-center justify-center">
                                <Layers size={16} />
                              </div>

                              {renamingClass === category.name ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    autoFocus
                                    className="px-2 py-1 text-sm font-black border dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                    value={renameValue}
                                    onChange={event => setRenameValue(event.target.value)}
                                    onKeyDown={event => event.key === 'Enter' && handleRenameCategory(category.name, renameValue)}
                                  />
                                  <button onClick={() => handleRenameCategory(category.name, renameValue)} className="text-green-500">
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button onClick={() => setRenamingClass(null)} className="text-red-500">
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-4 flex-1">
                                  <div>
                                    <p className="text-sm font-black dark:text-white uppercase tracking-tight">{category.name}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                      {itemsInCategory.length} Active Dishes
                                    </p>
                                  </div>


                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button onClick={() => { setRenamingClass(category.name); setRenameValue(category.name); }} className="p-2 text-gray-400 hover:text-orange-500">
                                <Edit3 size={16} />
                              </button>
                              <button onClick={() => handleRemoveCategory(category.name)} className="p-2 text-red-400 hover:text-red-500">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {extraCategories.length === 0 && (
                        <div className="col-span-full text-center py-12">
                          <Layers size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] font-black text-gray-400 uppercase">No categories added yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {menuSubTab === 'MODIFIER' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b dark:border-gray-700 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Coffee size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Modifier Manager</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{modifiers.length} Total</span>
                    </div>

                    <div className={modifierViewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4' : 'divide-y dark:divide-gray-700'}>
                      {modifiers.map(modifier => {
                        if (modifierViewMode === 'grid') {
                          return (
                            <div key={modifier.name} className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border dark:border-gray-700 rounded-lg hover:border-orange-200 transition-all">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg flex items-center justify-center">
                                    <Coffee size={16} />
                                  </div>
                                  <div>
                                    <h4 className="font-black text-xs dark:text-white uppercase tracking-tight">{modifier.name}</h4>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase">{modifier.options.length} Options</p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => handleEditModifier(modifier)} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg" title="Edit">
                                    <Edit3 size={14} />
                                  </button>
                                  <button onClick={() => handleRemoveModifier(modifier.name)} className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Remove">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1 mt-2 pt-2 border-t dark:border-gray-700">
                                {modifier.options.slice(0, 3).map((option, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[8px]">
                                    <span className="font-bold text-gray-600 dark:text-gray-300">{option.name}</span>
                                    <span className="font-black text-orange-500">+{currencySymbol}{option.price.toFixed(2)}</span>
                                  </div>
                                ))}
                                {modifier.options.length > 3 && (
                                  <p className="text-[7px] text-gray-400 italic">+{modifier.options.length - 3} more</p>
                                )}
                                {modifier.options.length === 0 && (
                                  <p className="text-[8px] text-gray-400 italic text-center py-2">No options</p>
                                )}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={modifier.name} className="p-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                                <div className="w-8 h-8 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-lg flex items-center justify-center">
                                  <Coffee size={16} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-black dark:text-white uppercase tracking-tight">{modifier.name}</p>
                                  <p className="text-[9px] font-bold text-gray-400">{modifier.options.length} Options</p>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                {modifier.options.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {modifier.options.slice(0, 3).map((option, idx) => (
                                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-[9px]">
                                        <span className="font-bold text-gray-600 dark:text-gray-300">{option.name}</span>
                                        <span className="font-black text-orange-500">+{currencySymbol}{option.price.toFixed(2)}</span>
                                      </span>
                                    ))}
                                    {modifier.options.length > 3 && (
                                      <span className="inline-flex items-center px-2 py-1 text-[9px] text-gray-400 italic">
                                        +{modifier.options.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[9px] text-gray-400 italic">No options</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Required</span>
                                  <input
                                    type="checkbox"
                                    checked={modifier.required || false}
                                    onChange={() => handleToggleModifierRequired(modifier.name)}
                                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                  />
                                </label>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleEditModifier(modifier)}
                                  className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                                  title="Edit"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={() => handleRemoveModifier(modifier.name)}
                                  className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  title="Remove"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {modifiers.length === 0 && (
                        <div className="col-span-full text-center py-12">
                          <Coffee size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] font-black text-gray-400 uppercase">No modifiers added yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {menuSubTab === 'ADDON' && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b dark:border-gray-700 flex justify-between items-center">
                      <div className="flex items-center gap-2 text-gray-400">
                        <PlusCircle size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Add-On Item Manager</span>
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{addOnItems.length} Total</span>
                    </div>

                    <div className={addOnViewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4' : 'divide-y dark:divide-gray-700'}>
                      {addOnItems.map((addon, index) => {
                        if (addOnViewMode === 'grid') {
                          return (
                            <div key={index} className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border dark:border-gray-700 rounded-lg hover:border-orange-200 transition-all">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg flex items-center justify-center">
                                    <PlusCircle size={16} />
                                  </div>
                                  <div>
                                    <input
                                      type="text"
                                      value={addon.name}
                                      onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, name: e.target.value }; setAddOnItems(updated); }}
                                      placeholder="Add-on name"
                                      className="font-black text-xs dark:text-white uppercase tracking-tight bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none w-full"
                                    />
                                  </div>
                                </div>
                                <button onClick={() => setAddOnItems(prev => prev.filter((_, i) => i !== index))} className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Remove">
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div className="space-y-2 mt-2 pt-2 border-t dark:border-gray-700">
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="font-bold text-gray-500 uppercase">Price</span>
                                  <input
                                    type="number"
                                    value={addon.price || ''}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, price: parseFloat(e.target.value) || 0 }; setAddOnItems(updated); }}
                                    placeholder="0.00"
                                    className="w-20 text-right font-black text-orange-500 bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none text-[10px]"
                                    step="0.01"
                                    min="0"
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="font-bold text-gray-500 uppercase">Max Qty</span>
                                  <input
                                    type="number"
                                    value={addon.maxQuantity}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, maxQuantity: parseInt(e.target.value) || 1 }; setAddOnItems(updated); }}
                                    className="w-16 text-right font-black text-gray-700 dark:text-gray-300 bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none text-[10px]"
                                    min="1"
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="font-bold text-gray-500 uppercase">Required</span>
                                  <input
                                    type="checkbox"
                                    checked={addon.required || false}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, required: e.target.checked }; setAddOnItems(updated); }}
                                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={index} className="p-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-8 h-8 bg-green-50 dark:bg-green-900/20 text-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <PlusCircle size={16} />
                                </div>
                                <input
                                  type="text"
                                  value={addon.name}
                                  onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, name: e.target.value }; setAddOnItems(updated); }}
                                  placeholder="Add-on name"
                                  className="text-sm font-black dark:text-white uppercase tracking-tight bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none min-w-0 w-full"
                                />
                              </div>

                              <div className="flex items-center gap-4 flex-shrink-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase">Price:</span>
                                  <span className="text-[9px] font-bold text-gray-400">{currencySymbol}</span>
                                  <input
                                    type="number"
                                    value={addon.price || ''}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, price: parseFloat(e.target.value) || 0 }; setAddOnItems(updated); }}
                                    placeholder="0.00"
                                    className="w-16 text-right font-black text-orange-500 bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none text-xs"
                                    step="0.01"
                                    min="0"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase">Max:</span>
                                  <input
                                    type="number"
                                    value={addon.maxQuantity}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, maxQuantity: parseInt(e.target.value) || 1 }; setAddOnItems(updated); }}
                                    className="w-12 text-right font-black text-gray-700 dark:text-gray-300 bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:border-orange-500 outline-none text-xs"
                                    min="1"
                                  />
                                </div>

                                <label className="flex items-center gap-2 cursor-pointer">
                                  <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">Required</span>
                                  <input
                                    type="checkbox"
                                    checked={addon.required || false}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, required: e.target.checked }; setAddOnItems(updated); }}
                                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                  />
                                </label>
                              </div>

                              <button
                                onClick={() => setAddOnItems(prev => prev.filter((_, i) => i !== index))}
                                className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                                title="Remove"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {addOnItems.length === 0 && (
                        <div className="col-span-full text-center py-12">
                          <PlusCircle size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] font-black text-gray-400 uppercase">No add-on items yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'SETTINGS' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="animate-in fade-in duration-500">
                <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Settings</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Features, printer, receipt, payment, tax, and staff configuration.</p>

                {isKitchenUser && (
                  <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Kitchen Order Settings</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                        <div>
                          <p className="text-xs font-black dark:text-white">Auto-Accept</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">Automatically accept incoming orders</p>
                        </div>
                        <button
                          onClick={() => toggleKitchenOrderSetting('autoAccept')}
                          className={`w-11 h-6 rounded-full transition-all relative ${kitchenOrderSettings.autoAccept ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${kitchenOrderSettings.autoAccept ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                        <div>
                          <p className="text-xs font-black dark:text-white">Auto-Print</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">Automatically print accepted orders</p>
                        </div>
                        <button
                          onClick={() => toggleKitchenOrderSetting('autoPrint')}
                          className={`w-11 h-6 rounded-full transition-all relative ${kitchenOrderSettings.autoPrint ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${kitchenOrderSettings.autoPrint ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ===== MOBILE: Accordion Layout ===== */}
                <div className="lg:hidden space-y-4">

                  {/* Settings Container */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50/50 dark:bg-emerald-900/10 border-b dark:border-gray-700">
                      <Settings size={14} className="text-emerald-500" />
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Settings</p>
                    </div>
                    <div className="divide-y dark:divide-gray-700">

                  {/* Built-in Features Accordion (moved to top of Settings) */}
                  {!isKitchenUser && (
                  <div>
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'builtin' ? 'printer' : 'builtin')}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'builtin' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                        <Zap size={18} className="text-amber-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'builtin' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Built-in Features</p>
                        <p className="text-[10px] text-gray-400">Auto-print, drawer, dining</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'builtin' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
                    </button>
                    {settingsPanel === 'builtin' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderFeaturesContent()}
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Printer Accordion */}
                  <div>
                    <button
                      onClick={() => { setSettingsPanel(settingsPanel === 'printer' ? 'builtin' : 'printer'); setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'printer' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                        <Printer size={18} className="text-orange-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'printer' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Printer Setup</p>
                        <p className="text-[10px] text-gray-400">{savedPrinters.length > 0 ? savedPrinters[0].model : 'No printer configured'}</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'printer' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
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
                  <div>
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'receipt' ? 'builtin' : 'receipt')}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'receipt' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Receipt size={18} className="text-blue-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'receipt' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Receipt</p>
                        <p className="text-[10px] text-gray-400">Configure receipt layout</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'receipt' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
                    </button>
                    {settingsPanel === 'receipt' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderReceiptContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Type & Taxes Accordion */}
                  <div>
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'payment' ? 'builtin' : 'payment')}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'payment' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                        <CreditCard size={18} className="text-green-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'payment' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Payment Type &amp; Taxes</p>
                        <p className="text-[10px] text-gray-400">{paymentTypes.length} types · {taxEntries.length} configured</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'payment' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
                    </button>
                    {settingsPanel === 'payment' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderPaymentAndTaxesContent()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Staff Accordion */}
                  <div>
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'staff' ? 'builtin' : 'staff')}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'staff' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
                        <Users size={18} className="text-violet-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'staff' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Staff Management</p>
                        <p className="text-[10px] text-gray-400">{staffList.length} member{staffList.length !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'staff' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
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
                  <div>
                    <button
                      onClick={() => setSettingsPanel(settingsPanel === 'ux' ? 'builtin' : 'ux')}
                      className={`w-full flex items-center gap-4 p-4 transition-all group ${settingsPanel === 'ux' ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                        <Type size={18} className="text-indigo-500" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'ux' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>User Experience</p>
                        <p className="text-[10px] text-gray-400">{userFont} · {CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.label}</p>
                      </div>
                      <ChevronDown size={16} className={`transition-all ${settingsPanel === 'ux' ? 'rotate-180 text-orange-500' : 'text-gray-300 group-hover:text-orange-500'}`} />
                    </button>
                    {settingsPanel === 'ux' && (
                      <div className="px-4 pb-4 border-t dark:border-gray-700 pt-4">
                        <div className="max-w-lg">
                          {renderUXContent()}
                        </div>
                      </div>
                    )}
                  </div>

                    </div>
                  </div>

                </div>
                <div className="hidden lg:flex gap-6 min-h-[500px]">
                  {/* Left Sidebar */}
                  <div className="flex-1 space-y-4">

                    {/* Settings Card */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                      <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-50/50 dark:bg-emerald-900/10 border-b dark:border-gray-700">
                        <Settings size={14} className="text-emerald-500" />
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Settings</p>
                      </div>

                      {/* Built-in Features Nav (at top of Settings) */}
                      {!isKitchenUser && (
                      <button
                        onClick={() => setSettingsPanel('builtin')}
                        className={`w-full flex items-center gap-3 p-4 transition-all ${
                          settingsPanel === 'builtin'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'builtin' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Zap size={16} className={settingsPanel === 'builtin' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${settingsPanel === 'builtin' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'}`}>Built-in Features</p>
                          <p className="text-[10px] text-gray-400">Auto-print, drawer, dining</p>
                        </div>
                      </button>
                      )}

                      {/* Printer Nav Item */}
                      <button
                        onClick={() => { setSettingsPanel('printer'); setIsAddPrinterOpen(false); setShowAdvancedSettings(false); }}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-t-gray-700 ${
                          settingsPanel === 'printer'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
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
                            settingsPanel === 'printer' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'
                          }`}>Printer Setup</p>
                          <p className="text-[10px] text-gray-400">{savedPrinters.length > 0 ? savedPrinters[0].model : 'No printer configured'}</p>
                        </div>
                      </button>

                      {/* Receipt Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('receipt')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-t-gray-700 ${
                          settingsPanel === 'receipt'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
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
                            settingsPanel === 'receipt' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'
                          }`}>Receipt</p>
                          <p className="text-[10px] text-gray-400">Configure receipt layout</p>
                        </div>
                      </button>

                      {/* Payment Type & Taxes Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('payment')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-t-gray-700 ${
                          settingsPanel === 'payment'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'payment'
                            ? 'bg-orange-100 dark:bg-orange-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <CreditCard size={16} className={settingsPanel === 'payment' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'payment' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'
                          }`}>Payment Type &amp; Taxes</p>
                          <p className="text-[10px] text-gray-400">{paymentTypes.length} types · {taxEntries.length} configured</p>
                        </div>
                      </button>

                      {/* Staff Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('staff')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-t-gray-700 ${
                          settingsPanel === 'staff'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
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
                            settingsPanel === 'staff' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'
                          }`}>Staff Management</p>
                          <p className="text-[10px] text-gray-400">{staffList.length} member{staffList.length !== 1 ? 's' : ''}</p>
                        </div>
                      </button>

                      {/* User Experience Nav Item */}
                      <button
                        onClick={() => setSettingsPanel('ux')}
                        className={`w-full flex items-center gap-3 p-4 transition-all border-t dark:border-t-gray-700 ${
                          settingsPanel === 'ux'
                            ? 'border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10'
                            : 'border-l-4 border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          settingsPanel === 'ux'
                            ? 'bg-orange-100 dark:bg-orange-900/30'
                            : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                          <Type size={16} className={settingsPanel === 'ux' ? 'text-orange-500' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-xs font-black uppercase tracking-wide ${
                            settingsPanel === 'ux' ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-white'
                          }`}>User Experience</p>
                          <p className="text-[10px] text-gray-400">{userFont} · {CURRENCY_OPTIONS.find(c => c.code === userCurrency)?.label}</p>
                        </div>
                      </button>

                    </div>
                  </div>

                  {/* Right Content Panel */}
                  <div className="w-[560px] shrink-0 min-h-0 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-6">
                      <div className="max-w-lg">
                        {settingsPanel === 'builtin' && renderFeaturesContent()}

                        {settingsPanel === 'table' && (
                          <div className="space-y-4">
                            {renderTableManagementContent()}
                          </div>
                        )}

                        {settingsPanel === 'kitchen' && (
                          <div className="space-y-0">
                            {canUseKitchen ? renderKitchenSettingsContent() : (
                              <div className="text-center py-8">
                                <Coffee size={36} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-sm font-black dark:text-white mb-1">Upgrade to Pro Plus</p>
                                <p className="text-[10px] text-gray-400 mb-4">Kitchen Display System requires the Pro Plus plan</p>
                                <button onClick={() => setShowUpgradeModal(true)} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all">Upgrade Plan</button>
                              </div>
                            )}
                          </div>
                        )}

                        {settingsPanel === 'qr' && (
                          <div className="space-y-4">
                            {canUseQr ? (
                              <>
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                                  <div>
                                    <p className="text-xs font-black dark:text-white">QR Ordering</p>
                                    <p className="text-[9px] text-gray-400 mt-0.5">Let customers scan QR codes to order from their table</p>
                                  </div>
                                  <button
                                    onClick={() => updateFeatureSetting('qrEnabled', !featureSettings.qrEnabled)}
                                    className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.qrEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${featureSettings.qrEnabled ? 'left-6' : 'left-1'}`} />
                                  </button>
                                </div>
                                {featureSettings.qrEnabled && renderQrGeneratorContent()}
                              </>
                            ) : (
                              <div className="text-center py-8">
                                <QrCode size={36} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-sm font-black dark:text-white mb-1">Upgrade to Pro</p>
                                <p className="text-[10px] text-gray-400 mb-4">QR Ordering requires the Pro plan or higher</p>
                                <button onClick={() => setShowUpgradeModal(true)} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all">Upgrade Plan</button>
                              </div>
                            )}
                          </div>
                        )}

                        {settingsPanel === 'printer' && renderPrinterContent()}
                        {settingsPanel === 'receipt' && renderReceiptContent()}
                        {settingsPanel === 'payment' && renderPaymentAndTaxesContent()}
                        {settingsPanel === 'staff' && renderStaffContent()}
                        {settingsPanel === 'ux' && renderUXContent()}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        {showAddClassModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300">
              <button onClick={() => setShowAddClassModal(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
              <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">Add Category</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Category Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="e.g. Beverages"
                    value={newClassName}
                    onChange={event => setNewClassName(event.target.value)}
                  />
                </div>



                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowAddClassModal(false)}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCategory}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest shadow"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showAddModifierModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300">
              <button onClick={() => { setShowAddModifierModal(false); setEditingModifierName(null); }} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
              <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">{editingModifierName ? 'Edit Modifier' : 'Add Modifier'}</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Modifier Name</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="e.g. Sugar Level"
                    value={tempModifierName}
                    onChange={event => setTempModifierName(event.target.value)}
                  />
                </div>

                {/* Required Toggle */}
                <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-900">
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={tempModifierRequired}
                      onChange={(e) => setTempModifierRequired(e.target.checked)}
                      className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                    />
                    <div>
                      <p className="text-[10px] font-black text-gray-700 dark:text-gray-200 uppercase tracking-wide">Required Modifier</p>
                      <p className="text-[8px] text-gray-500 dark:text-gray-400">Cashier must select an option when adding this item to cart</p>
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Options</label>
                    <button onClick={handleAddModifierOption} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-orange-500">
                      + Add Option
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {tempModifierOptions.map((option, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          className="col-span-7 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                          placeholder="Option name"
                          value={option.name}
                          onChange={event => handleModifierOptionChange(idx, 'name', event.target.value)}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="col-span-4 px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                          placeholder="0.00"
                          value={option.price}
                          onChange={event => handleModifierOptionChange(idx, 'price', Number(event.target.value))}
                        />
                        <button
                          onClick={() => handleRemoveModifierOption(idx)}
                          className="col-span-1 p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    {tempModifierOptions.length === 0 && (
                      <div className="text-center py-4 border border-dashed dark:border-gray-700 rounded-lg">
                        <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black">No options yet</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowAddModifierModal(false); setEditingModifierName(null); }}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveModifier}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest shadow"
                  >
                    {editingModifierName ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Staff Modal */}
        {isAddStaffModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in fade-in duration-300 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => {
                  setIsAddStaffModalOpen(false);
                  setEditingStaffIndex(null);
                  resetStaffForm();
                }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>
              <h2 className="text-xl font-black mb-4 dark:text-white uppercase tracking-tighter">
                {isEditingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
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
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">
                    {isEditingStaff ? 'Reset Password (Optional)' : 'Password'}
                  </label>
                  <input 
                    type="password"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder={isEditingStaff ? 'Leave blank to keep current password' : 'Set password'}
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

                {/* Role Selection */}
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Role</label>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => { setNewStaffRole('CASHIER'); setNewStaffKitchenCategories([]); }}
                      className={`flex-1 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                        newStaffRole === 'CASHIER' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' : 'text-gray-400'
                      }`}
                    >Cashier</button>
                    {featureSettings.kitchenEnabled && (
                      <button
                        onClick={() => setNewStaffRole('KITCHEN')}
                        className={`flex-1 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                          newStaffRole === 'KITCHEN' ? 'bg-white dark:bg-gray-800 text-orange-600 shadow-sm' : 'text-gray-400'
                        }`}
                      >Kitchen</button>
                    )}
                  </div>
                </div>

                {/* Kitchen Category Assignment (only for Kitchen role + when divisions exist) */}
                {newStaffRole === 'KITCHEN' && kitchenDivisions.length > 0 && (
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Kitchen Departments</label>
                    <p className="text-[9px] text-gray-400 mb-2 ml-1">Select which departments this user handles. Leave empty for all.</p>
                    <div className="flex flex-wrap gap-2">
                      {kitchenDivisions.map(dep => (
                        <button
                          key={dep.name}
                          onClick={() => {
                            setNewStaffKitchenCategories(prev => 
                              prev.includes(dep.name) ? prev.filter(c => c !== dep.name) : [...prev, dep.name]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                            newStaffKitchenCategories.includes(dep.name)
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-orange-400'
                          }`}
                        >
                          {dep.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => {
                      setIsAddStaffModalOpen(false);
                      setEditingStaffIndex(null);
                      resetStaffForm();
                    }}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveStaff}
                    disabled={isAddingStaff}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest shadow disabled:opacity-50"
                  >
                    {isAddingStaff ? (isEditingStaff ? 'Saving...' : 'Adding...') : (isEditingStaff ? 'Save Changes' : 'Add')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

          {/* Add-on Feature Tab */}
          {activeTab === 'ADDONS' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="animate-in fade-in duration-500">
                {(() => {
                  // Add-on feature definitions
                  const addonFeatures = [
                    {
                      id: 'backoffice',
                      name: 'Back Office',
                      icon: <Briefcase size={28} className="text-gray-600 dark:text-gray-300" />,
                      iconBg: 'bg-gray-100 dark:bg-gray-700',
                      plan: 'Basic',
                      planColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      shortDesc: 'Sales dashboard, inventory, staff & finance management.',
                      description: 'Back Office gives you a comprehensive dashboard to manage your restaurant operations. View sales analytics with KPI cards and charts, manage inventory with purchase orders and stock adjustments, handle staff management, track contacts (suppliers & customers), and access detailed financial reports. Everything you need to run your business from one place.',
                      features: ['Sales Dashboard with KPI cards', 'Daily sales & payment breakdown charts', 'Inventory management (PO, transfers, adjustments)', 'Staff management & performance tracking', 'Supplier & customer contacts', 'Finance reports & analytics', 'Stock valuation & history'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: !!onNavigateBackOffice,
                      canInstall: true,
                      onInstall: () => onNavigateBackOffice?.(),
                      onUninstall: null as (() => void) | null,
                      installLabel: 'Open Back Office',
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'table',
                      name: 'Table Management',
                      icon: <LayoutGrid size={28} className="text-sky-600 dark:text-sky-400" />,
                      iconBg: 'bg-sky-100 dark:bg-sky-900/30',
                      plan: 'Basic',
                      planColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      shortDesc: 'Save bill & manage table layout for dine-in.',
                      description: 'Table Management lets you configure your restaurant floor plan with customizable table layouts. Save bills to specific tables, manage multiple floors, and keep track of occupied and available tables in real time. Perfect for dine-in restaurants that need organized seating management.',
                      features: ['Saved bill per table', 'Customizable table grid layout', 'Multi-floor support', 'Real-time table status', 'Table count & layout configuration'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.tableManagementEnabled || featureSettings.savedBillEnabled,
                      canInstall: true,
                      onInstall: () => { updateFeatureSetting('tableManagementEnabled', true); updateFeatureSetting('savedBillEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('tableManagementEnabled', false); updateFeatureSetting('savedBillEnabled', false); },
                      settingsPanel: 'table' as string | null,
                      renderSettings: () => <div className="space-y-4">{renderTableManagementContent()}</div>,
                    },
                    {
                      id: 'qr',
                      name: 'QR Ordering',
                      icon: <QrCode size={28} className="text-violet-600 dark:text-violet-400" />,
                      iconBg: 'bg-violet-100 dark:bg-violet-900/30',
                      plan: 'Pro',
                      planColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      shortDesc: 'Let customers scan QR codes to order from their table.',
                      description: 'QR Ordering enables your customers to place orders directly from their smartphones. Generate unique QR codes for each table, let customers browse your menu, customize their orders, and submit them — all without waiting for staff. Orders appear instantly on your POS and kitchen display.',
                      features: ['QR code generation per table', 'Mobile-friendly customer menu', 'Real-time order submission', 'Table number auto-detection', 'Works with Kitchen Display System'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.qrEnabled,
                      canInstall: canUseQr,
                      onInstall: () => { updateFeatureSetting('qrEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('qrEnabled', false); },
                      settingsPanel: 'qr' as string | null,
                      renderSettings: () => (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div>
                              <p className="text-xs font-black dark:text-white">QR Ordering</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Let customers scan QR codes to order from their table</p>
                            </div>
                            <button
                              onClick={() => updateFeatureSetting('qrEnabled', !featureSettings.qrEnabled)}
                              className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.qrEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${featureSettings.qrEnabled ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          {featureSettings.qrEnabled && renderQrGeneratorContent()}
                        </div>
                      ),
                    },
                    {
                      id: 'tableside',
                      name: 'Tableside Ordering',
                      icon: <Tablet size={28} className="text-teal-600 dark:text-teal-400" />,
                      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
                      plan: 'Pro',
                      planColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      shortDesc: 'Staff take orders tableside using a tablet device.',
                      description: 'Tableside Ordering lets your staff walk around the restaurant with a tablet to take customer orders directly at the table. Orders are placed through the same system as QR orders and appear instantly in your QR Orders queue and Kitchen Display. No more running back and forth to the POS terminal.',
                      features: ['Staff order-taking on tablet', 'Same workflow as QR ordering', 'Orders appear in QR Orders queue', 'Works with Kitchen Display System', 'Table number assignment', 'Portable & wireless'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.tablesideOrderingEnabled,
                      canInstall: canUseQr,
                      onInstall: () => { updateFeatureSetting('tablesideOrderingEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('tablesideOrderingEnabled', false); },
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'kitchen',
                      name: 'Kitchen Display System',
                      icon: <Coffee size={28} className="text-orange-600 dark:text-orange-400" />,
                      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
                      plan: 'Pro Plus',
                      planColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                      shortDesc: 'Kitchen order management & display system.',
                      description: 'Kitchen Display System (KDS) provides a dedicated screen for your kitchen staff to manage incoming orders. Staff can view, accept, and mark orders as prepared. Supports kitchen departments/divisions so orders are routed to the right station. Auto-accept and auto-print options keep your kitchen running smoothly.',
                      features: ['Dedicated kitchen order screen', 'Accept / reject orders with reasons', 'Kitchen department routing', 'Auto-accept & auto-print options', 'Real-time order updates', 'Kitchen staff login with role filtering'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.kitchenEnabled,
                      canInstall: canUseKitchen,
                      onInstall: () => { updateFeatureSetting('kitchenEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('kitchenEnabled', false); },
                      settingsPanel: 'kitchen' as string | null,
                      renderSettings: () => <div className="space-y-0">{canUseKitchen ? renderKitchenSettingsContent() : (
                        <div className="text-center py-8">
                          <Coffee size={36} className="mx-auto text-gray-300 mb-3" />
                          <p className="text-sm font-black dark:text-white mb-1">Upgrade to Pro Plus</p>
                          <p className="text-[10px] text-gray-400 mb-4">Kitchen Display System requires the Pro Plus plan</p>
                          <button onClick={() => setShowUpgradeModal(true)} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all">Upgrade Plan</button>
                        </div>
                      )}</div>,
                    },
                    {
                      id: 'customer-display',
                      name: 'Customer Display',
                      icon: <Monitor size={28} className="text-emerald-600 dark:text-emerald-400" />,
                      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
                      plan: 'Basic',
                      planColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      shortDesc: 'External customer-facing display screen.',
                      description: 'Customer Display enables a second screen facing your customers, showing them the items being added to their order, prices, and the total in real time. Great for transparency and building customer trust at the checkout counter.',
                      features: ['Real-time order display', 'Shows items, prices & total', 'Second screen support', 'Clean customer-friendly interface'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.customerDisplayEnabled,
                      canInstall: true,
                      onInstall: () => updateFeatureSetting('customerDisplayEnabled', true),
                      onUninstall: () => { updateFeatureSetting('customerDisplayEnabled', false); },
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'online-shop',
                      name: 'Online Shop',
                      icon: <Globe size={28} className="text-blue-600 dark:text-blue-400" />,
                      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
                      plan: 'Pro',
                      planColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      shortDesc: 'Let customers order online via a shareable link.',
                      description: 'Online Shop gives your restaurant an online ordering page accessible via a shareable link. Customers can browse your full menu, add items to cart, and place orders — all from their browser. Orders flow into your Online Orders queue just like QR orders. Share the link on social media, your website, or messaging apps to reach more customers.',
                      features: ['Shareable online ordering link', 'Full menu browsing experience', 'Cart & checkout flow', 'Orders appear in Online Orders tab', 'Works with Kitchen Display System', 'Share via social media & messaging'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.onlineShopEnabled,
                      canInstall: canUseQr,
                      onInstall: () => { updateFeatureSetting('onlineShopEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('onlineShopEnabled', false); },
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                  ];

                  const selectedAddon = addonDetailView ? addonFeatures.find(f => f.id === addonDetailView) : null;

                  // ── Detail View ──
                  if (selectedAddon) {
                    return (
                      <div className="animate-in fade-in duration-300">
                        <button
                          onClick={() => { setAddonDetailView(null); setAddonDetailTab('details'); }}
                          className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors mb-6"
                        >
                          <ArrowLeft size={18} />
                          <span className="uppercase tracking-widest text-[10px]">Back to Add-ons</span>
                        </button>

                        <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden">
                          {/* Header */}
                          <div className="p-6 md:p-8 border-b dark:border-gray-700">
                            <div className="flex flex-col sm:flex-row gap-5">
                              <div className={`w-20 h-20 rounded-2xl ${selectedAddon.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                                {selectedAddon.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                  <h1 className="text-xl font-black dark:text-white uppercase tracking-tight">{selectedAddon.name}</h1>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${selectedAddon.planColor}`}>{selectedAddon.plan} Plan</span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{selectedAddon.shortDesc}</p>
                                <div className="flex flex-wrap items-center gap-3">
                                  {selectedAddon.isInstalled ? (
                                    <>
                                    <button
                                      onClick={selectedAddon.onInstall}
                                      className="px-6 py-2.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg font-black text-[10px] uppercase tracking-widest"
                                    >
                                      {selectedAddon.installLabel || 'Installed'}
                                    </button>
                                    {selectedAddon.onUninstall && (
                                      <button
                                        onClick={() => { if (confirm(`Are you sure you want to uninstall ${selectedAddon.name}? This will disable the feature.`)) { selectedAddon.onUninstall!(); } }}
                                        className="px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/30 transition-all flex items-center gap-2"
                                      >
                                        <Trash2 size={14} />
                                        Uninstall
                                      </button>
                                    )}
                                    </>
                                  ) : selectedAddon.canInstall ? (
                                    <button
                                      onClick={selectedAddon.onInstall}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all"
                                    >
                                      Install
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setShowUpgradeModal(true)}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all"
                                    >
                                      Upgrade to {selectedAddon.plan}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Document-style Tabs */}
                          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-700 px-4 pt-2">
                            <button
                              onClick={() => setAddonDetailTab('details')}
                              className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all rounded-t-lg border border-b-0 ${
                                addonDetailTab === 'details'
                                  ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 -mb-px z-10'
                                  : 'bg-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              Details
                            </button>
                            <button
                              onClick={() => setAddonDetailTab('setting')}
                              className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all rounded-t-lg border border-b-0 ${
                                addonDetailTab === 'setting'
                                  ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 -mb-px z-10'
                                  : 'bg-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              Setting
                            </button>
                          </div>

                          {/* Tab Content */}
                          {addonDetailTab === 'details' && (
                            <div className="flex flex-col lg:flex-row">
                              {/* Left: Description */}
                              <div className="flex-1 p-6 md:p-8 border-b lg:border-b-0 lg:border-r dark:border-gray-700">
                                <h2 className="text-sm font-black dark:text-white uppercase tracking-wider mb-4">Description</h2>
                                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-6">{selectedAddon.description}</p>

                                {/* Screenshots placeholder */}
                                <h2 className="text-sm font-black dark:text-white uppercase tracking-wider mb-4">Screenshots</h2>
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                  <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Coming Soon</p>
                                  </div>
                                  <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Coming Soon</p>
                                  </div>
                                </div>

                                <h2 className="text-sm font-black dark:text-white uppercase tracking-wider mb-4">Key Features</h2>
                                <ul className="space-y-2">
                                  {selectedAddon.features.map((feat, idx) => (
                                    <li key={idx} className="flex items-start gap-2.5">
                                      <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                                      <span className="text-xs text-gray-600 dark:text-gray-300">{feat}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {/* Right: Meta info */}
                              <div className="w-full lg:w-64 p-6 md:p-8 space-y-4 flex-shrink-0">
                                {[
                                  { label: 'Version', value: selectedAddon.version },
                                  { label: 'Required Plan', value: selectedAddon.plan },
                                  { label: 'Author', value: selectedAddon.author },
                                  { label: 'Status', value: selectedAddon.isInstalled ? 'Installed' : (selectedAddon.canInstall ? 'Available' : 'Upgrade Required') },
                                ].map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between py-2.5 border-b dark:border-gray-700 last:border-0">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</span>
                                    <span className="text-xs font-bold dark:text-white">{item.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {addonDetailTab === 'setting' && (
                            <div className="p-6 md:p-8">
                              {!selectedAddon.isInstalled ? (
                                <div className="text-center py-12">
                                  <Settings size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                                  <p className="text-sm font-black dark:text-white mb-2">Feature Not Installed</p>
                                  <p className="text-xs text-gray-400 mb-6 max-w-sm mx-auto">Please install <span className="font-black text-gray-600 dark:text-gray-300">{selectedAddon.name}</span> in order to manage its settings and configuration.</p>
                                  {selectedAddon.canInstall ? (
                                    <button
                                      onClick={selectedAddon.onInstall}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all"
                                    >
                                      Install Now
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setShowUpgradeModal(true)}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all"
                                    >
                                      Upgrade to {selectedAddon.plan}
                                    </button>
                                  )}
                                </div>
                              ) : selectedAddon.renderSettings ? (
                                <div>
                                  <div className="flex items-center gap-3 mb-6">
                                    <div className={`w-10 h-10 rounded-xl ${selectedAddon.iconBg} flex items-center justify-center`}>
                                      {selectedAddon.icon}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black dark:text-white">{selectedAddon.name} Settings</p>
                                      <p className="text-[10px] text-gray-400">Configure and manage this feature.</p>
                                    </div>
                                  </div>
                                  <div className="max-w-lg">
                                    {selectedAddon.renderSettings()}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-12">
                                  <CheckCircle size={40} className="mx-auto text-green-500 mb-4" />
                                  <p className="text-sm font-black dark:text-white mb-2">Feature Active</p>
                                  <p className="text-xs text-gray-400 max-w-sm mx-auto"><span className="font-black text-gray-600 dark:text-gray-300">{selectedAddon.name}</span> is installed and active. No additional configuration is required.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // ── Grid View (WordPress plugin style) ──
                  return (
                    <>
                      <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Add-on Feature</h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Extend your POS with additional features.</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {addonFeatures.map(addon => (
                          <div
                            key={addon.id}
                            className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800/50 transition-all cursor-pointer flex flex-col h-[180px]"
                            onClick={() => { setAddonDetailView(addon.id); setAddonDetailTab('details'); }}
                          >
                            {/* Card top */}
                            <div className="p-5 flex items-start gap-4 flex-1 min-h-0">
                              <div className={`w-14 h-14 rounded-xl ${addon.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                                {addon.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-black dark:text-white truncate">{addon.name}</p>
                                </div>
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${addon.planColor} mb-2`}>{addon.plan} Plan</span>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{addon.shortDesc}</p>
                              </div>
                            </div>

                            {/* Card bottom */}
                            <div className="px-5 py-3 border-t dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between flex-shrink-0">
                              <div className="flex items-center gap-3">
                                <span className="text-[9px] text-gray-400 font-bold">By {addon.author}</span>
                              </div>
                              <div onClick={e => e.stopPropagation()}>
                                {addon.isInstalled ? (
                                  <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                    Installed
                                  </span>
                                ) : addon.canInstall ? (
                                  <button
                                    onClick={addon.onInstall}
                                    className="px-3 py-1 bg-orange-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-orange-600 transition-all"
                                  >
                                    Install
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setShowUpgradeModal(true)}
                                    className="px-3 py-1 bg-orange-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-orange-600 transition-all"
                                  >
                                    Upgrade
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'BILLING' && (
            <BillingPage
              restaurantId={restaurant.id}
              subscription={subscription}
              onUpgradeClick={() => setShowUpgradeModal(true)}
              onSubscriptionUpdated={onSubscriptionUpdated}
            />
          )}

          {/* QR Orders Tab */}
          {activeTab === 'QR_ORDERS' && showQrFeature && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">QR Orders</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1 uppercase tracking-widest">Manage incoming orders from QR scan customers.</p>
                </div>
                <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm overflow-x-auto hide-scrollbar">
                  <button onClick={() => setQrOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>Ongoing</button>
                  <button onClick={() => setQrOrderFilter(OrderStatus.SERVED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.SERVED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>Served</button>
                  <button onClick={() => setQrOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>Cancelled</button>
                  <button onClick={() => setQrOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>All</button>
                </div>
              </div>

              {(() => {
                const filteredQrOrders = orders.filter(o => {
                  if (qrOrderFilter === 'ALL') return true;
                  if (qrOrderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
                  return o.status === qrOrderFilter;
                });

                if (filteredQrOrders.length === 0) {
                  return (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <QrCode size={24} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">No QR Orders</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Waiting for customers to scan and order...</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {filteredQrOrders.map(order => (
                      <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-start gap-6 transition-all hover:border-orange-200">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ORDER #{order.id}</span>
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg">
                                <QrCode size={12} className="text-orange-500" />
                                <span className="text-xs font-black">Table {order.tableNumber}</span>
                              </div>
                              <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                                order.status === OrderStatus.PENDING ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' :
                                order.status === OrderStatus.ONGOING ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                                order.status === OrderStatus.SERVED ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' :
                                order.status === OrderStatus.COMPLETED ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                                'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                              }`}>{order.status}</span>
                              {order.orderSource && (
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                  order.orderSource === 'counter' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                  order.orderSource === 'qr_order' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' :
                                  order.orderSource === 'online' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {order.orderSource === 'counter' ? 'Counter' : order.orderSource === 'qr_order' ? 'QR Order' : order.orderSource === 'online' ? 'Online' : order.orderSource}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-gray-400" />
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {Object.entries(groupItemsByCategory(getSortedOrderItems(order))).map(([categoryName, groupedItems]) => (
                              <div key={`${order.id}-${categoryName}`} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{categoryName}</span>
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                                </div>
                                {groupedItems.map((item, idx) => (
                                  <div key={`${order.id}-${categoryName}-${item.id}-${idx}`} className="flex justify-between items-start text-sm border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                                    <div>
                                      <p className="font-bold text-gray-900 dark:text-white">x{item.quantity} {item.name}</p>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {item.selectedSize && <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">Size: {item.selectedSize}</span>}
                                        {item.selectedTemp && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${item.selectedTemp === 'Hot' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>Temp: {item.selectedTemp}</span>}
                                        {item.selectedOtherVariant && <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">{item.selectedOtherVariant}</span>}
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${getKitchenStatusClass(order.status)}`}>
                                          Kitchen: {getKitchenStatusText(order.status)}
                                        </span>
                                      </div>
                                    </div>
                                    <span className="text-gray-500 dark:text-gray-400 font-bold">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>

                          {order.remark && (
                            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare size={12} className="text-orange-500" />
                                <span className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Special Remark</span>
                              </div>
                              <p className="text-xs text-gray-700 dark:text-gray-300 italic">{order.remark}</p>
                            </div>
                          )}

                          <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                            <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Grand Total</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-white">{currencySymbol}{order.total.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="flex md:flex-col gap-2 min-w-[140px] mt-2 md:mt-0">
                          {/* When kitchen is enabled, POS users can only see order status — kitchen handles accept/reject/serve */}
                          {showKitchenFeature && !isKitchenUser && (order.status === OrderStatus.PENDING || order.status === OrderStatus.ONGOING) ? (
                            <div className={`px-4 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest text-center ${
                              order.status === OrderStatus.PENDING ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' :
                              'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                            }`}>
                              {order.status === OrderStatus.PENDING ? 'Waiting for Kitchen' : 'Kitchen Preparing'}
                            </div>
                          ) : (
                          <>
                          {order.status === OrderStatus.PENDING && (
                            <>
                              <button
                                onClick={() => onUpdateOrder(order.id, OrderStatus.ONGOING)}
                                className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => setRejectingQrOrderId(order.id)}
                                className="flex-1 py-3 px-4 bg-red-50 text-red-500 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-100"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {order.status === OrderStatus.ONGOING && (
                            <button
                              onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)}
                              className="flex-1 py-4 px-4 bg-green-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <CheckCircle size={18} /> Serve Order
                            </button>
                          )}
                          {order.status === OrderStatus.SERVED && (
                            <button
                              onClick={() => {
                                setSelectedQrOrderForPayment(order);
                                setPendingOrderData({
                                  items: order.items,
                                  remark: order.remark,
                                  tableNumber: order.tableNumber,
                                  total: order.total,
                                });
                                setSelectedCashAmount(order.total);
                                setCashAmountInput(order.total.toFixed(2));
                                setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
                                setIsQrPaymentMode(true);
                                setShowPaymentModal(true);
                              }}
                              className="flex-1 py-4 px-4 bg-blue-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <CheckCircle2 size={18} /> Mark Paid
                            </button>
                          )}
                          </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Online Orders Tab - Enhanced with document-style sub-tabs */}
          {activeTab === 'ONLINE_ORDERS' && showOnlineShopFeature && (
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="max-w-7xl mx-auto w-full">
                {/* Header */}
                <div className="mb-5">
                  <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">Online Menu</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your online storefront — orders, products, wallet &amp; settings all in one place.</p>
                </div>

                {/* Document-style tab bar */}
                <div className="flex gap-0 overflow-x-auto hide-scrollbar relative z-10">
                  {([
                    { id: 'INCOMING' as const, label: 'Incoming Orders', icon: <ShoppingBag size={13} /> },
                    { id: 'PRODUCT' as const, label: 'Product', icon: <Package size={13} /> },
                    { id: 'WALLET' as const, label: 'Wallet', icon: <Wallet size={13} /> },
                    { id: 'SETTING' as const, label: 'Setting', icon: <Settings size={13} /> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setOnlineOrderSubTab(tab.id);
                        if (tab.id === 'WALLET') fetchWalletData();
                        if (tab.id === 'SETTING' && subscription?.stripe_customer_id && onlineStripeBalance === null) {
                          setIsLoadingStripeBalance(true);
                          fetch(`/api/stripe/billing?action=balance&customerId=${encodeURIComponent(subscription.stripe_customer_id)}`)
                            .then(r => r.json())
                            .then(data => setOnlineStripeBalance(data.balance ?? 0))
                            .catch(() => setOnlineStripeBalance(0))
                            .finally(() => setIsLoadingStripeBalance(false));
                        }
                      }}
                      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider border border-b-0 rounded-t-xl transition-all -mb-px whitespace-nowrap ${
                        onlineOrderSubTab === tab.id
                          ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 relative z-10'
                          : 'bg-gray-100 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800/60 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-tab content */}
                <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl ${
                  onlineOrderSubTab === 'INCOMING' ? 'rounded-tr-2xl' : 'rounded-t-2xl'
                }`} style={{ marginTop: '-1px' }}>
                {/* ── Incoming Orders Sub-tab ── */}
                {onlineOrderSubTab === 'INCOMING' && (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">Manage orders placed via your online shop link.</p>
                      <div className="flex items-center gap-3">
                        <div className="flex bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm overflow-x-auto hide-scrollbar">
                          <button onClick={() => setQrOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Ongoing</button>
                          <button onClick={() => setQrOrderFilter(OrderStatus.SERVED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.SERVED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Served</button>
                          <button onClick={() => setQrOrderFilter(OrderStatus.COMPLETED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.COMPLETED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Paid</button>
                          <button onClick={() => setQrOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Cancelled</button>
                          <button onClick={() => setQrOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>All</button>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const filteredOnlineOrders = orders.filter(o => {
                        if (o.orderSource && o.orderSource !== 'online') return false;
                        if (qrOrderFilter === 'ALL') return true;
                        if (qrOrderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
                        return o.status === qrOrderFilter;
                      });

                      if (filteredOnlineOrders.length === 0) {
                        return (
                          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-600">
                            <Globe size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-black dark:text-white mb-1">No Online Orders</p>
                            <p className="text-[10px] text-gray-400">Orders placed via your online shop link will appear here.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredOnlineOrders.map(order => (
                            <div key={order.id} className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-4 shadow-sm hover:shadow-md transition-all">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Globe size={14} className="text-blue-500" />
                                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">#{order.id.slice(-6)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {order.orderSource && (
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                      order.orderSource === 'online' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                                      order.orderSource === 'qr_order' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {order.orderSource === 'online' ? 'Online' : order.orderSource === 'qr_order' ? 'QR' : order.orderSource}
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                    order.status === OrderStatus.PENDING ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                    order.status === OrderStatus.ONGOING ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                    order.status === OrderStatus.SERVED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                    order.status === OrderStatus.COMPLETED ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>{order.status}</span>
                                </div>
                              </div>
                              {order.tableNumber && order.tableNumber !== 'N/A' && (
                                <div className="flex items-center gap-1.5 mb-2">
                                  <Hash size={12} className="text-gray-400" />
                                  <span className="text-[10px] font-black text-gray-500 dark:text-gray-400">Table {order.tableNumber}</span>
                                </div>
                              )}
                              <div className="space-y-1 mb-3">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-300">{item.quantity}x {item.name}</span>
                                    <span className="font-bold dark:text-white">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                              {order.remark && (
                                <div className="mb-3 p-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-lg">
                                  <p className="text-[9px] text-gray-600 dark:text-gray-300 italic">{order.remark}</p>
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-3 border-t dark:border-gray-600">
                                <span className="text-[10px] text-gray-400">{new Date(order.timestamp).toLocaleString()}</span>
                                <span className="text-sm font-black dark:text-white">{currencySymbol}{order.total.toFixed(2)}</span>
                              </div>
                              {(order.status === OrderStatus.PENDING || order.status === OrderStatus.ONGOING) && (
                                <div className="flex gap-2 mt-3">
                                  {order.status === OrderStatus.PENDING && (
                                    <button onClick={() => onUpdateOrder(order.id, OrderStatus.ONGOING)} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5">
                                      <CheckCircle size={14} /> Accept
                                    </button>
                                  )}
                                  {order.status === OrderStatus.PENDING && (
                                    <button onClick={() => {
                                      if (onKitchenUpdateOrder) onKitchenUpdateOrder(order.id, OrderStatus.CANCELLED, 'Rejected by vendor');
                                      else onUpdateOrder(order.id, OrderStatus.CANCELLED);
                                    }} className="py-2.5 px-3 bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-200 dark:hover:bg-red-900/40 transition-all">
                                      <X size={14} />
                                    </button>
                                  )}
                                  {order.status === OrderStatus.ONGOING && (
                                    <button onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)} className="flex-1 py-2.5 bg-green-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-1.5">
                                      <CheckCircle2 size={14} /> Mark Ready
                                    </button>
                                  )}
                                </div>
                              )}
                              {order.status === OrderStatus.SERVED && (
                                <div className="flex gap-2 mt-3">
                                  <button onClick={() => {
                                    setSelectedQrOrderForPayment(order);
                                    setPendingOrderData({
                                      items: order.items,
                                      remark: order.remark,
                                      tableNumber: order.tableNumber,
                                      total: order.total,
                                    });
                                    setSelectedCashAmount(order.total);
                                    setCashAmountInput(order.total.toFixed(2));
                                    setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
                                    setIsQrPaymentMode(true);
                                    setShowPaymentModal(true);
                                  }} className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5">
                                    <CreditCard size={14} /> Mark Paid
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── Product Sub-tab ── */}
                {onlineOrderSubTab === 'PRODUCT' && (
                  <div>
                    {/* ── Online Edit Modal ── */}
                    {onlineEditItem ? (
                      <div>
                        <div className="flex items-center gap-3 mb-6">
                          <button onClick={() => { setOnlineEditItem(null); setOnlineEditTab('online'); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
                            <ArrowLeft size={18} className="text-gray-500" />
                          </button>
                          <div className="flex items-center gap-3 flex-1">
                            {onlineEditItem.image && <img src={onlineEditItem.image} alt={onlineEditItem.name} className="w-10 h-10 rounded-lg object-cover" />}
                            <div>
                              <h3 className="text-sm font-black dark:text-white">{onlineEditItem.name}</h3>
                              <p className="text-[9px] text-gray-400">{onlineEditItem.category} · {currencySymbol}{onlineEditItem.price.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>

                        {/* In Store / Online tabs */}
                        <div className="flex gap-0 mb-0 relative z-10">
                          {[
                            { key: 'instore' as const, label: 'In Store' },
                            { key: 'online' as const, label: 'Online' },
                          ].map(t => (
                            <button
                              key={t.key}
                              onClick={() => setOnlineEditTab(t.key)}
                              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border border-b-0 rounded-t-xl transition-all -mb-px ${
                                onlineEditTab === t.key
                                  ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 relative z-10'
                                  : 'bg-gray-100 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {/* In Store tab — opens full menu editor */}
                        {onlineEditTab === 'instore' && (
                          <div className={`border border-gray-200 dark:border-gray-700 rounded-b-2xl rounded-tr-2xl p-5`} style={{ marginTop: '-1px' }}>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Edit in-store details using the full Menu Editor.</p>
                            <button
                              onClick={() => {
                                handleOpenEditModal(onlineEditItem);
                                setOnlineEditItem(null);
                              }}
                              className="px-5 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-1.5"
                            >
                              <Edit3 size={12} /> Open in Menu Editor
                            </button>
                          </div>
                        )}

                        {/* Online tab — 2-column side-by-side layout */}
                        {onlineEditTab === 'online' && (
                          <div className="border border-gray-200 dark:border-gray-700 rounded-b-2xl rounded-t-2xl" style={{ marginTop: '-1px' }}>
                            {/* Two-column form body */}
                            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-200 dark:divide-gray-700">

                              {/* ── LEFT: General ── */}
                              <div className="flex-1 p-5 space-y-4">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <Globe size={13} className="text-orange-500" /> General
                                </h4>

                                {/* Online Listing Toggle */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600">
                                  <div>
                                    <p className="text-xs font-black dark:text-white">Online Listing</p>
                                    <p className="text-[9px] text-gray-400">Show on your online shop</p>
                                  </div>
                                  <button
                                    onClick={() => setOnlineEditForm(prev => ({ ...prev, onlineDisabled: !prev.onlineDisabled }))}
                                    className={`relative w-10 h-5 rounded-full transition-all ${onlineEditForm.onlineDisabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}`}
                                  >
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${onlineEditForm.onlineDisabled ? 'left-0.5' : 'left-[22px]'}`} />
                                  </button>
                                </div>

                                {/* Description */}
                                <div>
                                  <div className="flex items-center justify-between mb-1 ml-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Description</label>
                                    {onlineEditItem.description && (
                                      <button
                                        type="button"
                                        onClick={() => setOnlineEditForm(prev => ({ ...prev, description: onlineEditItem.description }))}
                                        className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"
                                      >
                                        <Copy size={9} /> Copy from In-store
                                      </button>
                                    )}
                                  </div>
                                  <textarea
                                    value={onlineEditForm.description || ''}
                                    onChange={e => setOnlineEditForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Describe this item for online customers..."
                                    rows={4}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                                  />
                                </div>

                                {/* Online Price */}
                                <div>
                                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Online Selling Price</label>
                                  <p className="text-[9px] text-gray-400 mb-2 ml-1">In-store: {currencySymbol} {onlineEditItem.price.toFixed(2)}</p>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 select-none pointer-events-none">{currencySymbol}</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={onlineEditForm.onlinePrice ?? onlineEditItem.price}
                                      onChange={e => setOnlineEditForm(prev => ({ ...prev, onlinePrice: parseFloat(e.target.value) || 0 }))}
                                      className="w-full pl-12 pr-3 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* ── RIGHT: Options ── */}
                              <div className="flex-1 p-5 space-y-4">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                  <Layers size={13} className="text-orange-500" /> Options
                                </h4>

                                {/* Portion Sizes */}
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Portion Sizes</label>
                                    {(onlineEditItem.sizes || []).length > 0 && (
                                      <button type="button" onClick={() => setOnlineEditForm(prev => ({ ...prev, sizes: onlineEditItem.sizes ? [...onlineEditItem.sizes] : [] }))} className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"><Copy size={9} /> Copy from In-store</button>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {(onlineEditForm.sizes || []).map((s, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        <input type="text" value={s.name} onChange={e => { const sizes = [...(onlineEditForm.sizes || [])]; sizes[i] = { ...sizes[i], name: e.target.value }; setOnlineEditForm(prev => ({ ...prev, sizes })); }} placeholder="Size name" className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500" />
                                        <div className="relative w-20">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">{currencySymbol}</span>
                                          <input type="number" step="0.01" value={s.price} onChange={e => { const sizes = [...(onlineEditForm.sizes || [])]; sizes[i] = { ...sizes[i], price: parseFloat(e.target.value) || 0 }; setOnlineEditForm(prev => ({ ...prev, sizes })); }} className="w-full pl-6 pr-2 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-right" />
                                        </div>
                                        <button onClick={() => { const sizes = (onlineEditForm.sizes || []).filter((_, idx) => idx !== i); setOnlineEditForm(prev => ({ ...prev, sizes })); }} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => setOnlineEditForm(prev => ({ ...prev, sizes: [...(prev.sizes || []), { name: '', price: 0 }] }))} className="text-[10px] font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1 uppercase tracking-widest"><Plus size={12} /> Add Size</button>
                                  </div>
                                </div>

                                {/* Thermal */}
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Thermal Options</label>
                                      {(onlineEditItem.tempOptions?.options || []).length > 0 && (
                                        <button type="button" onClick={() => setOnlineEditForm(prev => ({ ...prev, tempOptions: onlineEditItem.tempOptions ? { ...onlineEditItem.tempOptions } : prev.tempOptions }))} className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"><Copy size={9} /> Copy</button>
                                      )}
                                    </div>
                                    <button onClick={() => { const temp = onlineEditForm.tempOptions || { enabled: false, options: [] }; setOnlineEditForm(prev => ({ ...prev, tempOptions: { ...temp, enabled: !temp.enabled } })); }} className={`relative w-9 h-5 rounded-full transition-all ${onlineEditForm.tempOptions?.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${onlineEditForm.tempOptions?.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                  </div>
                                  {onlineEditForm.tempOptions?.enabled && (
                                    <div className="space-y-2">
                                      {(onlineEditForm.tempOptions.options || []).map((opt, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <input type="text" value={opt.name} onChange={e => { const opts = [...(onlineEditForm.tempOptions?.options || [])]; opts[i] = { ...opts[i], name: e.target.value }; setOnlineEditForm(prev => ({ ...prev, tempOptions: { ...prev.tempOptions!, options: opts } })); }} placeholder="e.g. Hot, Cold" className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500" />
                                          <div className="relative w-20">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">{currencySymbol}</span>
                                            <input type="number" step="0.01" value={opt.price} onChange={e => { const opts = [...(onlineEditForm.tempOptions?.options || [])]; opts[i] = { ...opts[i], price: parseFloat(e.target.value) || 0 }; setOnlineEditForm(prev => ({ ...prev, tempOptions: { ...prev.tempOptions!, options: opts } })); }} className="w-full pl-6 pr-2 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-right" />
                                          </div>
                                          <button onClick={() => { const opts = (onlineEditForm.tempOptions?.options || []).filter((_, idx) => idx !== i); setOnlineEditForm(prev => ({ ...prev, tempOptions: { ...prev.tempOptions!, options: opts } })); }} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                                        </div>
                                      ))}
                                      <button onClick={() => { const opts = [...(onlineEditForm.tempOptions?.options || []), { name: '', price: 0 }]; setOnlineEditForm(prev => ({ ...prev, tempOptions: { ...prev.tempOptions!, options: opts } })); }} className="text-[10px] font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1 uppercase tracking-widest"><Plus size={12} /> Add Option</button>
                                    </div>
                                  )}
                                </div>

                                {/* Variants */}
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Variant Options</label>
                                      {(onlineEditItem.variantOptions?.options || []).length > 0 && (
                                        <button type="button" onClick={() => setOnlineEditForm(prev => ({ ...prev, variantOptions: onlineEditItem.variantOptions ? { ...onlineEditItem.variantOptions, options: [...(onlineEditItem.variantOptions.options || [])] } : prev.variantOptions }))} className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"><Copy size={9} /> Copy</button>
                                      )}
                                    </div>
                                    <button onClick={() => { const v = onlineEditForm.variantOptions || { enabled: false, options: [] }; setOnlineEditForm(prev => ({ ...prev, variantOptions: { ...v, enabled: !v.enabled } })); }} className={`relative w-9 h-5 rounded-full transition-all ${onlineEditForm.variantOptions?.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${onlineEditForm.variantOptions?.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                  </div>
                                  {onlineEditForm.variantOptions?.enabled && (
                                    <div className="space-y-2">
                                      {(onlineEditForm.variantOptions.options || []).map((opt, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <input type="text" value={opt.name} onChange={e => { const opts = [...(onlineEditForm.variantOptions?.options || [])]; opts[i] = { ...opts[i], name: e.target.value }; setOnlineEditForm(prev => ({ ...prev, variantOptions: { ...prev.variantOptions!, options: opts } })); }} placeholder="e.g. Spicy, BBQ" className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500" />
                                          <div className="relative w-20">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">{currencySymbol}</span>
                                            <input type="number" step="0.01" value={opt.price} onChange={e => { const opts = [...(onlineEditForm.variantOptions?.options || [])]; opts[i] = { ...opts[i], price: parseFloat(e.target.value) || 0 }; setOnlineEditForm(prev => ({ ...prev, variantOptions: { ...prev.variantOptions!, options: opts } })); }} className="w-full pl-6 pr-2 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-right" />
                                          </div>
                                          <button onClick={() => { const opts = (onlineEditForm.variantOptions?.options || []).filter((_, idx) => idx !== i); setOnlineEditForm(prev => ({ ...prev, variantOptions: { ...prev.variantOptions!, options: opts } })); }} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={14} /></button>
                                        </div>
                                      ))}
                                      <button onClick={() => { const opts = [...(onlineEditForm.variantOptions?.options || []), { name: '', price: 0 }]; setOnlineEditForm(prev => ({ ...prev, variantOptions: { ...prev.variantOptions!, options: opts } })); }} className="text-[10px] font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1 uppercase tracking-widest"><Plus size={12} /> Add Variant</button>
                                    </div>
                                  )}
                                </div>

                                {/* Modifiers */}
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Modifiers</label>
                                    {(onlineEditItem.linkedModifiers || []).length > 0 && (
                                      <button type="button" onClick={() => setOnlineEditForm(prev => ({ ...prev, linkedModifiers: [...(onlineEditItem.linkedModifiers || [])] }))} className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"><Copy size={9} /> Copy from In-store</button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {modifiers.map(mod => {
                                      const isLinked = (onlineEditForm.linkedModifiers || []).includes(mod.name);
                                      return (
                                        <button key={mod.name} onClick={() => { const linked = onlineEditForm.linkedModifiers || []; setOnlineEditForm(prev => ({ ...prev, linkedModifiers: isLinked ? linked.filter(m => m !== mod.name) : [...linked, mod.name] })); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${isLinked ? 'bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' : 'bg-white dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600 hover:border-orange-300'}`}>{mod.name}</button>
                                      );
                                    })}
                                    {modifiers.length === 0 && <p className="text-[9px] text-gray-400">No modifiers created yet.</p>}
                                  </div>
                                </div>

                                {/* Add-ons */}
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-600 p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Add-on Items</label>
                                    {(onlineEditItem.addOns || []).length > 0 && (
                                      <button type="button" onClick={() => setOnlineEditForm(prev => ({ ...prev, addOns: (onlineEditItem.addOns || []).map(a => ({ ...a })) }))} className="text-[8px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1"><Copy size={9} /> Copy from In-store</button>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    {(onlineEditForm.addOns || []).map((addon, i) => (
                                      <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-700/30 rounded-lg">
                                        <input type="text" value={addon.name} onChange={e => { const addOns = [...(onlineEditForm.addOns || [])]; addOns[i] = { ...addOns[i], name: e.target.value }; setOnlineEditForm(prev => ({ ...prev, addOns })); }} placeholder="Add-on name" className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500" />
                                        <div className="relative w-20">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">{currencySymbol}</span>
                                          <input type="number" step="0.01" value={addon.price} onChange={e => { const addOns = [...(onlineEditForm.addOns || [])]; addOns[i] = { ...addOns[i], price: parseFloat(e.target.value) || 0 }; setOnlineEditForm(prev => ({ ...prev, addOns })); }} className="w-full pl-5 pr-1 py-1.5 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-right" />
                                        </div>
                                        <button onClick={() => { const addOns = (onlineEditForm.addOns || []).filter((_, idx) => idx !== i); setOnlineEditForm(prev => ({ ...prev, addOns })); }} className="p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={13} /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => setOnlineEditForm(prev => ({ ...prev, addOns: [...(prev.addOns || []), { name: '', price: 0, maxQuantity: 5 }] }))} className="text-[10px] font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1 uppercase tracking-widest"><Plus size={12} /> Add Add-on</button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* ── Footer: Save / Cancel ── */}
                            <div className="flex items-center gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                              <button
                                onClick={() => {
                                  const updated: MenuItem = {
                                    ...onlineEditItem,
                                    description: onlineEditForm.description ?? onlineEditItem.description,
                                    onlineDisabled: onlineEditForm.onlineDisabled ?? onlineEditItem.onlineDisabled,
                                    onlinePrice: onlineEditForm.onlinePrice === onlineEditItem.price ? undefined : onlineEditForm.onlinePrice,
                                    sizes: onlineEditForm.sizes,
                                    tempOptions: onlineEditForm.tempOptions,
                                    variantOptions: onlineEditForm.variantOptions,
                                    linkedModifiers: onlineEditForm.linkedModifiers,
                                    addOns: onlineEditForm.addOns,
                                  };
                                  onUpdateMenu?.(restaurant.id, updated);
                                  setOnlineEditItem(null);
                                  setOnlineFormPage('general');
                                  toast('Online settings saved!', 'success');
                                }}
                                className="flex-1 px-5 py-2.5 bg-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle size={12} /> Save Changes
                              </button>
                              <button
                                onClick={() => { setOnlineEditItem(null); setOnlineEditTab('online'); setOnlineFormPage('general'); }}
                                className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                    /* ── Product List / Grid View ── */
                    <div>
                      {/* Toolbar */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="relative flex-1 max-w-sm">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={onlineProductSearch}
                            onChange={e => setOnlineProductSearch(e.target.value)}
                            placeholder="Search products..."
                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Status filter dropdown */}
                          <div className="relative">
                            <select
                              value={onlineProductStatus}
                              onChange={e => setOnlineProductStatus(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}
                              className="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                            >
                              <option value="ALL">All Listing</option>
                              <option value="ACTIVE">Listed</option>
                              <option value="ARCHIVED">Unlisted</option>
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          </div>
                          {/* List / Grid toggle */}
                          <div className="flex bg-white dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setOnlineProductView('list')} className={`p-2 rounded-lg transition-all ${onlineProductView === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={16} /></button>
                            <button onClick={() => setOnlineProductView('grid')} className={`p-2 rounded-lg transition-all ${onlineProductView === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const filteredMenu = restaurant.menu.filter(item => {
                          const statusMatch = onlineProductStatus === 'ALL' ? true : onlineProductStatus === 'ACTIVE' ? !item.onlineDisabled : !!item.onlineDisabled;
                          const searchMatch = !onlineProductSearch || item.name.toLowerCase().includes(onlineProductSearch.toLowerCase()) || item.category.toLowerCase().includes(onlineProductSearch.toLowerCase());
                          return statusMatch && searchMatch;
                        });

                        if (filteredMenu.length === 0) {
                          return (
                            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-600">
                              <Package size={32} className="mx-auto text-gray-300 mb-3" />
                              <p className="text-sm font-black dark:text-white mb-1">No Products Found</p>
                              <p className="text-[10px] text-gray-400">{onlineProductSearch ? 'Try a different search term.' : onlineProductStatus === 'ARCHIVED' ? 'No unlisted items found.' : 'Add items in Menu Editor to display them on your online shop.'}</p>
                            </div>
                          );
                        }

                        const categories = Array.from(new Set(filteredMenu.map(item => item.category))).sort();

                        /* ── List View ── */
                        if (onlineProductView === 'list') {
                          return (
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                    <th className="text-left px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product</th>
                                    <th className="text-left px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">In-Store Price</th>
                                    <th className="text-right px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Online Price</th>
                                    <th className="text-center px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Online Listing</th>
                                    <th className="text-center px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredMenu.map(item => (
                                    <tr key={item.id} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${item.onlineDisabled ? 'opacity-50' : ''}`}>
                                      <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                          {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                                          ) : (
                                            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"><Package size={14} className="text-gray-400" /></div>
                                          )}
                                          <div className="min-w-0">
                                            <p className="text-xs font-black dark:text-white truncate">{item.name}</p>
                                            {item.description && <p className="text-[9px] text-gray-400 truncate max-w-[200px]">{item.description}</p>}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{item.category}</td>
                                      <td className="px-4 py-2.5 text-right text-xs font-black text-gray-500 dark:text-gray-400">{currencySymbol}{item.price.toFixed(2)}</td>
                                      <td className="px-4 py-2.5 text-right text-xs font-black text-orange-500">{currencySymbol}{(item.onlinePrice ?? item.price).toFixed(2)}</td>
                                      <td className="px-4 py-2.5 text-center">
                                        <button
                                          onClick={() => { const updated = { ...item, onlineDisabled: !item.onlineDisabled }; onUpdateMenu?.(restaurant.id, updated); }}
                                          className={`relative w-9 h-5 rounded-full transition-all mx-auto ${item.onlineDisabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}`}
                                        >
                                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${item.onlineDisabled ? 'left-0.5' : 'left-[18px]'}`} />
                                        </button>
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        <button
                                          onClick={() => {
                                            setOnlineEditItem(item);
                                            setOnlineEditTab('online');
                                            setOnlineFormPage('general');
                                            setOnlineEditForm({
                                              description: item.description,
                                              onlineDisabled: item.onlineDisabled,
                                              onlinePrice: item.onlinePrice ?? item.price,
                                              sizes: item.sizes ? [...item.sizes] : [],
                                              tempOptions: item.tempOptions ? { ...item.tempOptions, options: item.tempOptions.options ? [...item.tempOptions.options] : [] } : { enabled: false, options: [] },
                                              variantOptions: item.variantOptions ? { ...item.variantOptions, options: item.variantOptions.options ? [...item.variantOptions.options] : [] } : { enabled: false, options: [] },
                                              linkedModifiers: item.linkedModifiers ? [...item.linkedModifiers] : [],
                                              addOns: item.addOns ? [...item.addOns] : [],
                                            });
                                          }}
                                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-all text-gray-400 hover:text-orange-500"
                                        >
                                          <Edit3 size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        }

                        /* ── Grid View ── */
                        return (
                          <div className="space-y-6">
                            {categories.map(category => (
                              <div key={category}>
                                <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                                  <Tag size={14} className="text-orange-500" />
                                  {category}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {filteredMenu.filter(item => item.category === category).map(item => (
                                    <div key={item.id} className={`bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-3 shadow-sm transition-all ${item.onlineDisabled ? 'opacity-50' : ''}`}>
                                      <div className="flex items-center gap-3 mb-2">
                                        {item.image ? (
                                          <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                                        ) : (
                                          <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0"><Package size={16} className="text-gray-400" /></div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-black dark:text-white truncate">{item.name}</p>
                                          {item.description && <p className="text-[9px] text-gray-400 truncate">{item.description}</p>}
                                          <div className="flex items-center gap-2 mt-0.5">
                                            {item.onlinePrice != null && item.onlinePrice !== item.price ? (
                                              <>
                                                <p className="text-xs font-black text-gray-400 line-through">{currencySymbol}{item.price.toFixed(2)}</p>
                                                <p className="text-xs font-black text-orange-500">{currencySymbol}{item.onlinePrice.toFixed(2)}</p>
                                              </>
                                            ) : (
                                              <p className="text-xs font-black text-orange-500">{currencySymbol}{item.price.toFixed(2)}</p>
                                            )}
                                          </div>
                                        </div>
                                        {item.sizes && item.sizes.length > 0 && (
                                          <span className="text-[8px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase">{item.sizes.length} sizes</span>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => { const updated = { ...item, onlineDisabled: !item.onlineDisabled }; onUpdateMenu?.(restaurant.id, updated); }}
                                            className={`relative w-9 h-5 rounded-full transition-all ${item.onlineDisabled ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}`}
                                          >
                                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${item.onlineDisabled ? 'left-0.5' : 'left-[18px]'}`} />
                                          </button>
                                          <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{item.onlineDisabled ? 'Unlisted' : 'Listed'}</span>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setOnlineEditItem(item);
                                            setOnlineEditTab('online');
                                            setOnlineFormPage('general');
                                            setOnlineEditForm({
                                              description: item.description,
                                              onlineDisabled: item.onlineDisabled,
                                              onlinePrice: item.onlinePrice ?? item.price,
                                              sizes: item.sizes ? [...item.sizes] : [],
                                              tempOptions: item.tempOptions ? { ...item.tempOptions, options: item.tempOptions.options ? [...item.tempOptions.options] : [] } : { enabled: false, options: [] },
                                              variantOptions: item.variantOptions ? { ...item.variantOptions, options: item.variantOptions.options ? [...item.variantOptions.options] : [] } : { enabled: false, options: [] },
                                              linkedModifiers: item.linkedModifiers ? [...item.linkedModifiers] : [],
                                              addOns: item.addOns ? [...item.addOns] : [],
                                            });
                                          }}
                                          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all flex items-center gap-1.5 text-gray-600 dark:text-gray-300"
                                        >
                                          <Edit3 size={11} /> Edit
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    )}
                  </div>
                )}

                {/* ── Wallet Sub-tab ── */}
                {onlineOrderSubTab === 'WALLET' && (
                  <div>
                    {/* Wallet Balance Card */}
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 mb-6 text-white shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wallet size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Wallet Balance</span>
                        </div>
                        <button
                          onClick={fetchWalletData}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                        >
                          <RotateCw size={12} className={walletLoading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      <p className="text-3xl font-black">
                        {walletLoading ? (
                          <span className="text-white/50">Loading...</span>
                        ) : (
                          `${currencySymbol}${walletBalance.toFixed(2)}`
                        )}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <p className="text-[10px] opacity-70">Revenue from completed online orders</p>
                        {walletPendingCashout > 0 && (
                          <span className="text-[9px] font-black bg-white/20 px-2 py-0.5 rounded-full">
                            Pending Cashout: {currencySymbol}{walletPendingCashout.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => {
                            if (!bankDetails) { toast('Please save your bank details first.', 'warning'); setShowBankSection(true); setShowBankForm(true); return; }
                            setShowCashoutForm(true);
                          }}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                        >
                          <Send size={12} /> Request Cashout
                        </button>
                      </div>
                    </div>

                    {/* Cashout Request Form */}
                    {showCashoutForm && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5 mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Send size={14} className="text-orange-500" />
                            Request Cashout
                          </h3>
                          <button onClick={() => setShowCashoutForm(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-all">
                            <X size={14} className="text-gray-400" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Amount (RM)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              value={cashoutAmount}
                              onChange={e => setCashoutAmount(e.target.value)}
                              placeholder={`Max: ${(walletBalance - walletPendingCashout).toFixed(2)}`}
                              className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Notes (Optional)</label>
                            <input
                              type="text"
                              value={cashoutNotes}
                              onChange={e => setCashoutNotes(e.target.value)}
                              placeholder="e.g. Monthly withdrawal"
                              className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-[9px] text-gray-400 flex-1">
                            Funds will be transferred to: <span className="font-bold text-gray-600 dark:text-gray-300">{bankDetails?.bankName} — {bankDetails?.accountNumber}</span>
                          </p>
                          <button
                            onClick={handleRequestCashout}
                            disabled={isRequestingCashout}
                            className="px-5 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isRequestingCashout ? <RotateCw size={12} className="animate-spin" /> : <Send size={12} />}
                            Submit Request
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bank Details Section */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 mb-6">
                      <button
                        onClick={() => setShowBankSection(prev => !prev)}
                        className="w-full flex items-center justify-between p-5 text-left"
                      >
                        <h3 className="text-sm font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
                          <Building2 size={14} className="text-orange-500" />
                          Bank Details
                        </h3>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${showBankSection ? 'rotate-180' : ''}`} />
                      </button>

                      {showBankSection && (
                        <div className="px-5 pb-5">
                          {bankDetails && !showBankForm ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank Name</span>
                                <div className="flex items-center gap-2">
                                  {(() => { const b = MALAYSIA_BANKS.find(bk => bk.name === bankDetails.bankName); return b ? <img src={b.logo} alt={b.name} className="h-5 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null; })()}
                                  <span className="text-xs font-black dark:text-white">{bankDetails.bankName}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Holder</span>
                                <span className="text-xs font-black dark:text-white">{bankDetails.accountHolderName}</span>
                              </div>
                              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Number</span>
                                <span className="text-xs font-black dark:text-white">{bankDetails.accountNumber}</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => setShowBankForm(true)}
                                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all flex items-center gap-1.5 text-gray-600 dark:text-gray-300"
                                >
                                  <Edit3 size={11} /> Edit
                                </button>
                                <button
                                  onClick={() => setShowBankSection(false)}
                                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all text-gray-600 dark:text-gray-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Bank Name</label>
                                <div className="relative">
                                  <select
                                    value={bankFormData.bankName}
                                    onChange={e => setBankFormData(prev => ({ ...prev, bankName: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 appearance-none cursor-pointer"
                                  >
                                    <option value="">Select a bank...</option>
                                    {MALAYSIA_BANKS.map(b => (
                                      <option key={b.name} value={b.name}>{b.name}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                                {bankFormData.bankName && (() => {
                                  const selected = MALAYSIA_BANKS.find(b => b.name === bankFormData.bankName);
                                  return selected ? (
                                    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                      <img src={selected.logo} alt={selected.name} className="h-6 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      <span className="text-xs font-bold dark:text-white">{selected.name}</span>
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Account Holder Name</label>
                                <input
                                  type="text"
                                  value={bankFormData.accountHolderName}
                                  onChange={e => setBankFormData(prev => ({ ...prev, accountHolderName: e.target.value }))}
                                  placeholder="e.g. Ahmad bin Ali"
                                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Account Number</label>
                                <input
                                  type="text"
                                  value={bankFormData.accountNumber}
                                  onChange={e => setBankFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                                  placeholder="e.g. 1234567890"
                                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                                />
                              </div>
                              <div className="flex items-center gap-2 pt-2">
                                <button
                                  onClick={handleSaveBank}
                                  disabled={isSavingBank}
                                  className="px-5 py-2.5 bg-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {isSavingBank ? <RotateCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                  Save Changes
                                </button>
                                <button
                                  onClick={() => { setShowBankForm(false); setShowBankSection(false); }}
                                  className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 rounded-lg font-black text-[10px] uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Cashout Request History */}
                    {cashoutRequests.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5 mb-6">
                        <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Banknote size={14} className="text-orange-500" />
                          Cashout Requests
                        </h3>
                        <div className="space-y-2">
                          {cashoutRequests.map((req: any) => (
                            <div key={req.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  req.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                                  req.status === 'approved' ? 'bg-blue-100 dark:bg-blue-900/30' :
                                  req.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                                  'bg-red-100 dark:bg-red-900/30'
                                }`}>
                                  <ArrowUpRight size={14} className={
                                    req.status === 'pending' ? 'text-yellow-600' :
                                    req.status === 'approved' ? 'text-blue-600' :
                                    req.status === 'completed' ? 'text-green-600' :
                                    'text-red-600'
                                  } />
                                </div>
                                <div>
                                  <p className="text-xs font-black dark:text-white">{currencySymbol}{Number(req.amount).toFixed(2)}</p>
                                  <p className="text-[9px] text-gray-400">{new Date(req.created_at).toLocaleDateString()} — {req.bank_name} •••{req.account_number.slice(-4)}</p>
                                </div>
                              </div>
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                req.status === 'pending' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                req.status === 'approved' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                req.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {req.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transaction History */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5">
                      <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Receipt size={14} className="text-orange-500" />
                        Transaction History
                      </h3>
                      {walletTransactions.length === 0 ? (
                        <div className="text-center py-10">
                          <Receipt size={24} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] text-gray-400 font-bold">No transactions yet</p>
                          <p className="text-[9px] text-gray-300 mt-1">Revenue from online orders will appear here.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {walletTransactions.map((tx: any) => (
                            <div key={tx.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  tx.type === 'sale' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                                }`}>
                                  {tx.type === 'sale' ? (
                                    <ArrowDownRight size={14} className="text-green-600" />
                                  ) : (
                                    <ArrowUpRight size={14} className="text-red-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-black dark:text-white">
                                    {tx.type === 'sale' ? '+' : '-'}{currencySymbol}{Number(tx.amount).toFixed(2)}
                                  </p>
                                  <p className="text-[9px] text-gray-400">{tx.description || (tx.type === 'sale' ? 'Online order payment' : 'Cashout')}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</p>
                                <p className="text-[8px] text-gray-300">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Setting Sub-tab ── */}
                {onlineOrderSubTab === 'SETTING' && (
                  <div className="space-y-4">

                    {/* ── Delivery Options ── */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => {
                          if (!deliveryExpanded) setDeliveryDraft([...onlineDeliveryOptions]);
                          setDeliveryExpanded(!deliveryExpanded);
                        }}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Truck size={16} className="text-orange-500" />
                          <span className="text-sm font-black dark:text-white uppercase tracking-widest">Delivery Options</span>
                          <span className="text-[9px] px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full font-bold">
                            {onlineDeliveryOptions.filter(o => o.enabled).length} active
                          </span>
                        </div>
                        <ChevronRight size={16} className={`text-gray-400 transition-transform duration-200 ${deliveryExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {deliveryExpanded && (
                        <div className="px-5 pb-5 border-t dark:border-gray-600">
                          <div className="pt-4 space-y-3">
                            {onlineDeliveryOptions.map((opt, idx) => (
                              <div key={opt.id} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-1">
                                    <p className="text-xs font-black dark:text-white">{opt.type !== 'custom' ? opt.label : ''}</p>
                                    {opt.type === 'custom' && (
                                      <input
                                        type="text"
                                        value={opt.label}
                                        onChange={e => setOnlineDeliveryOptions(prev => prev.map((o, i) => i === idx ? { ...o, label: e.target.value } : o))}
                                        placeholder="Type name..."
                                        className="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {opt.type !== 'pickup' && (
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 select-none">{currencySymbol}</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={opt.fee === 0 ? '' : opt.fee}
                                          onChange={e => setOnlineDeliveryOptions(prev => prev.map((o, i) => i === idx ? { ...o, fee: parseFloat(e.target.value) || 0 } : o))}
                                          placeholder="0.00"
                                          className="w-24 pl-6 pr-2 py-1.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 text-right"
                                        />
                                      </div>
                                    )}
                                    {opt.type === 'custom' && (
                                      <button
                                        onClick={() => setOnlineDeliveryOptions(prev => prev.filter((_, i) => i !== idx))}
                                        className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setOnlineDeliveryOptions(prev => prev.map((o, i) => i === idx ? { ...o, enabled: !o.enabled } : o))}
                                      className={`relative w-10 h-5 rounded-full transition-all ${opt.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${opt.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              onClick={() => setOnlineDeliveryOptions(prev => [...prev, { id: `custom_${Date.now()}`, type: 'custom', label: 'Custom', enabled: true, fee: 0 }])}
                              className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-[10px] font-black text-gray-400 uppercase tracking-widest hover:border-orange-400 hover:text-orange-500 transition-all flex items-center justify-center gap-1.5"
                            >
                              <Plus size={12} /> Add New Type
                            </button>
                          </div>

                          {/* Save / Cancel */}
                          <div className="flex gap-2 mt-4 pt-4 border-t dark:border-gray-600">
                            <button
                              onClick={() => setDeliveryExpanded(false)}
                              className="flex-1 py-2 bg-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle size={12} /> Save Changes
                            </button>
                            <button
                              onClick={() => { setOnlineDeliveryOptions([...deliveryDraft]); setDeliveryExpanded(false); }}
                              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Payment Type ── */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => {
                          if (!paymentExpanded) setPaymentDraft([...onlinePaymentMethods]);
                          setPaymentExpanded(!paymentExpanded);
                        }}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <CreditCard size={16} className="text-orange-500" />
                          <span className="text-sm font-black dark:text-white uppercase tracking-widest">Payment Type</span>
                          <span className="text-[9px] px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full font-bold">
                            {onlinePaymentMethods.filter(m => m.enabled).length} active
                          </span>
                        </div>
                        <ChevronRight size={16} className={`text-gray-400 transition-transform duration-200 ${paymentExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {paymentExpanded && (
                        <div className="px-5 pb-5 border-t dark:border-gray-600">
                          <div className="pt-4 space-y-3">
                            {onlinePaymentMethods.map((method, idx) => (
                              <div key={method.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                                <div>
                                  <p className="text-xs font-black dark:text-white">{method.label}</p>
                                  {method.id === 'cod' && <p className="text-[9px] text-gray-400">Customer pays upon delivery / pickup</p>}
                                  {method.id === 'online' && <p className="text-[9px] text-gray-400">Customer pays online before order is confirmed</p>}
                                </div>
                                <button
                                  onClick={() => setOnlinePaymentMethods(prev => prev.map((m, i) => i === idx ? { ...m, enabled: !m.enabled } : m))}
                                  className={`relative w-10 h-5 rounded-full transition-all ${method.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${method.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Save / Cancel */}
                          <div className="flex gap-2 mt-4 pt-4 border-t dark:border-gray-600">
                            <button
                              onClick={() => setPaymentExpanded(false)}
                              className="flex-1 py-2 bg-green-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle size={12} /> Save Changes
                            </button>
                            <button
                              onClick={() => { setOnlinePaymentMethods([...paymentDraft]); setPaymentExpanded(false); }}
                              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-gray-300 dark:hover:bg-gray-500 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Link to Order ── */}
                    {restaurant.slug && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-5">
                        <h3 className="text-sm font-black dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ExternalLink size={16} className="text-orange-500" />
                          Link to Order
                        </h3>
                        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3">
                          <p className="text-[9px] text-gray-400 mb-2">Share this link with your customers to order online.</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-[10px] font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg border dark:border-gray-600 truncate">
                              {window.location.origin}?r={restaurant.slug}
                            </code>
                            <button
                              onClick={() => {
                                const url = `${window.location.origin}?r=${restaurant.slug}`;
                                navigator.clipboard.writeText(url);
                                toast('Shop link copied to clipboard!', 'success');
                              }}
                              className="shrink-0 px-3 py-2 bg-orange-500 text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center gap-1.5"
                            >
                              <Copy size={12} /> Copy Link
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Kitchen Orders Tab */}
          {activeTab === 'KITCHEN' && showKitchenFeature && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">Incoming Orders</h1>
                    {lastSyncTime && (
                      <div className="flex items-center justify-center gap-2 text-[10px] font-black px-3 py-1.5 rounded-full border transition-all duration-300 min-w-[140px] shrink-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                        SYNC: {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    )}
                  </div>
                  <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm overflow-x-auto hide-scrollbar">
                    <button onClick={() => setKitchenOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${kitchenOrderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ONGOING</button>
                    <button onClick={() => setKitchenOrderFilter(OrderStatus.SERVED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${kitchenOrderFilter === OrderStatus.SERVED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>SERVED</button>
                    <button onClick={() => setKitchenOrderFilter(OrderStatus.COMPLETED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${kitchenOrderFilter === OrderStatus.COMPLETED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>PAID</button>
                    <button onClick={() => setKitchenOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${kitchenOrderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>CANCELLED</button>
                    <button onClick={() => setKitchenOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${kitchenOrderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ALL</button>
                  </div>
                </div>

                <div className="space-y-4">
                  {kitchenFilteredOrders.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <ShoppingBag size={24} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">Kitchen Quiet</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">Waiting for incoming signals...</p>
                    </div>
                  ) : (
                    kitchenFilteredOrders.map(order => (
                      <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-start gap-6 transition-all hover:border-orange-200">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ORDER #{order.id}</span>
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg">
                                <Hash size={12} className="text-orange-500" />
                                <span className="text-xs font-black">Table {order.tableNumber}</span>
                              </div>
                              {order.orderSource && (
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                  order.orderSource === 'counter' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                  order.orderSource === 'qr_order' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' :
                                  order.orderSource === 'online' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {order.orderSource === 'counter' ? 'Counter' : order.orderSource === 'qr_order' ? 'QR Order' : order.orderSource === 'online' ? 'Online' : order.orderSource}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-gray-400" />
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {Object.entries(
                              groupItemsByCategory(
                                getSortedOrderItems(
                                  order,
                                  userRole === 'KITCHEN' ? kitchenScopeCategories : [],
                                ),
                              ),
                            ).map(([categoryName, groupedItems]) => (
                              <div key={`${order.id}-kitchen-${categoryName}`} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{categoryName}</span>
                                  <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
                                </div>
                                {groupedItems.map((item, idx) => (
                                  <div key={`${order.id}-${categoryName}-${item.id}-${idx}`} className="flex justify-between items-start text-sm border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                                    <div>
                                      <p className="font-bold text-gray-900 dark:text-white">x{item.quantity} {item.name}</p>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {item.selectedSize && <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">Size: {item.selectedSize}</span>}
                                        {item.selectedTemp && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${item.selectedTemp === 'Hot' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>Temp: {item.selectedTemp}</span>}
                                        {item.selectedOtherVariant && <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">{item.selectedOtherVariant}</span>}
                                      </div>
                                    </div>
                                    <span className="text-gray-500 dark:text-gray-400 font-bold">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                          {userRole === 'KITCHEN' && kitchenScopeCategories.length > 0 && (
                            <p className="mt-2 text-[9px] text-gray-400 uppercase tracking-wider">Showing only your assigned categories.</p>
                          )}
                          {order.remark && (
                            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageSquare size={12} className="text-orange-500" />
                                <span className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Special Remark</span>
                              </div>
                              <p className="text-xs text-gray-700 dark:text-gray-300 italic">{order.remark}</p>
                            </div>
                          )}
                          <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                            <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Grand Total</span>
                            <span className="text-2xl font-black text-gray-900 dark:text-white">{currencySymbol}{order.total.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex md:flex-col gap-2 min-w-[140px] mt-2 md:mt-0">
                          {(isKitchenUser || isVendorUser) ? (
                            <>
                              {order.status === OrderStatus.PENDING && (
                                <>
                                  <button 
                                    onClick={() => handleKitchenAcceptAndPrint(order.id)} 
                                    className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg"
                                  >
                                    Accept {kitchenOrderSettings.autoPrint && '& Print'}
                                  </button>
                              
                                  {connectedDevice && (
                                    <button 
                                      onClick={() => handleKitchenManualPrint(order)}
                                      disabled={kitchenPrintingOrderId === order.id}
                                      className="flex-1 py-3 px-4 bg-gray-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-gray-700 transition-all shadow-lg disabled:opacity-50"
                                    >
                                      {kitchenPrintingOrderId === order.id ? 'Printing...' : 'Print Only'}
                                    </button>
                                  )}
                              
                                  <button 
                                    onClick={() => setRejectingKitchenOrderId(order.id)} 
                                    className="flex-1 py-3 px-4 bg-red-50 text-red-500 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-100"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                          
                              {order.status === OrderStatus.ONGOING && (
                                <button 
                                  onClick={() => {
                                    if (onKitchenUpdateOrder) {
                                      onKitchenUpdateOrder(order.id, OrderStatus.SERVED);
                                    } else {
                                      onUpdateOrder(order.id, OrderStatus.SERVED);
                                    }
                                  }} 
                                  className="flex-1 py-4 px-4 bg-green-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg"
                                >
                                  <CheckCircle size={18} />
                                  Serve Order
                                </button>
                              )}
                            </>
                          ) : (
                            <div className={`px-4 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest text-center ${
                              order.status === OrderStatus.PENDING ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' :
                              order.status === OrderStatus.ONGOING ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                              order.status === OrderStatus.SERVED ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                              order.status === OrderStatus.COMPLETED ? 'bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400' :
                              'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                            }`}>
                              {order.status === OrderStatus.PENDING ? 'Waiting for Kitchen' :
                               order.status === OrderStatus.ONGOING ? 'Preparing' :
                               order.status === OrderStatus.SERVED ? 'Served' :
                               order.status === OrderStatus.COMPLETED ? 'Completed' :
                               'Cancelled'}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Right Sidebar - Order Summary (Desktop) */}
        {activeTab === 'COUNTER' && (
          <div className={`
            hidden lg:flex w-96 bg-white dark:bg-gray-800 border-l dark:border-gray-700 flex-col
            transition-all duration-300 ease-in-out
          `}>
            {/* Sidebar header */}
            <div className="p-4 border-b dark:border-gray-700">
              {(showSavedBillFeature || showQrFeature) && (
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-3">
                  {showSavedBillFeature && (
                    <button
                      onClick={() => { setCounterMode('SAVED_BILL'); setSelectedQrOrderForPayment(null); }}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                        counterMode === 'SAVED_BILL' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >Saved Bill</button>
                  )}
                  <button
                    onClick={() => { setCounterMode('COUNTER_ORDER'); setSelectedQrOrderForPayment(null); }}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                      counterMode === 'COUNTER_ORDER' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >Counter</button>
                  {showQrFeature && (
                    <button
                      onClick={() => { setCounterMode('QR_ORDER'); setSelectedQrOrderForPayment(null); }}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                        counterMode === 'QR_ORDER' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >QR Order</button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-sm">
                  {showSavedBillFeature && counterMode === 'SAVED_BILL'
                    ? 'Saved Bills'
                    : showQrFeature && counterMode === 'QR_ORDER'
                    ? (selectedQrOrderForPayment ? `Order #${selectedQrOrderForPayment.id}` : 'QR Order')
                    : 'Current Order'}
                </h3>
                {(counterMode === 'COUNTER_ORDER' || (!showQrFeature && counterMode !== 'SAVED_BILL')) && (
                  <button onClick={() => setPosCart([])} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
                {showQrFeature && counterMode === 'QR_ORDER' && selectedQrOrderForPayment && (
                  <button onClick={() => setSelectedQrOrderForPayment(null)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Sidebar content by mode */}
            {showSavedBillFeature && counterMode === 'SAVED_BILL' ? (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                  <Receipt size={48} className="mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Select a saved bill from the left panel</p>
                </div>
              </div>
            ) : showQrFeature && counterMode === 'QR_ORDER' ? (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {!selectedQrOrderForPayment ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                      <QrCode size={48} className="mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Select a served order from the left</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                        <QrCode size={14} className="text-purple-500 shrink-0" />
                        <span className="text-[10px] font-black text-purple-700 dark:text-purple-400 uppercase tracking-widest">Table {selectedQrOrderForPayment.tableNumber}</span>
                      </div>
                      {selectedQrOrderForPayment.items.map((item, idx) => (
                        <div key={`qr-${item.id}-${idx}`} className="flex items-center gap-4">
                          <div className="flex-1">
                            <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                            <p className="text-xs text-orange-500 font-black">{currencySymbol}{item.price.toFixed(2)}</p>
                            <div className="mt-1 space-y-0.5">
                              {item.selectedSize && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Size: {item.selectedSize}</p>}
                              {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Temp: {item.selectedTemp}</p>}
                              {item.selectedOtherVariant && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedOtherVariant}</p>}
                            </div>
                          </div>
                          <span className="text-xs font-black dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">x{item.quantity}</span>
                        </div>
                      ))}
                      {selectedQrOrderForPayment.remark && (
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
                          <p className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-1">Remark</p>
                          <p className="text-xs text-gray-700 dark:text-gray-300 italic">{selectedQrOrderForPayment.remark}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="p-6 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span>Subtotal</span>
                      <span>{currencySymbol}{selectedQrOrderSubtotal.toFixed(2)}</span>
                    </div>
                    {selectedQrTaxLines.map(tax => (
                      <div key={`qr-tax-${tax.id}`} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <span>{tax.name} ({tax.percentage.toFixed(2)}%)</span>
                        <span>{currencySymbol}{tax.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                      <span className="uppercase">Total</span>
                      <span className="text-orange-500">{currencySymbol}{selectedQrGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Table</label>
                        <input
                          type="text"
                          value={selectedQrOrderForPayment?.tableNumber ?? ''}
                          readOnly
                          className="w-full p-2 bg-gray-100 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-xl text-[10px] font-black dark:text-white cursor-not-allowed opacity-80"
                        />
                      </div>
                      <div className="flex-[2]">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Remark</label>
                        <input
                          type="text"
                          value={selectedQrOrderForPayment?.remark ?? ''}
                          readOnly
                          className="w-full p-2 bg-gray-100 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-xl text-[10px] font-black dark:text-white cursor-not-allowed opacity-80"
                          placeholder="No remark"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {showSavedBillFeature && (
                        <button
                          onClick={saveSelectedQrOrderAsBill}
                          disabled={!selectedQrOrderForPayment || isCompletingPayment}
                          className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                        >
                          Saved Bill
                        </button>
                      )}
                      <button
                        onClick={handleQrOrderCheckout}
                        disabled={!selectedQrOrderForPayment || isCompletingPayment}
                        className={`${showSavedBillFeature ? 'flex-[2]' : 'flex-1'} py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2`}
                      >
                        <CreditCard size={16} /> Complete Payment
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {posCart.length === 0 ? (
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
                          {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Temperature: {item.selectedTemp}</p>}
                          {item.selectedVariantOption && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Variant: {item.selectedVariantOption}</p>}
                          {item.selectedOtherVariant && !item.selectedModifiers && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.otherVariantName ? item.otherVariantName.charAt(0).toUpperCase() + item.otherVariantName.slice(1) : 'Option'}: {item.selectedOtherVariant}</p>}
                          {item.selectedModifiers && Object.entries(item.selectedModifiers).map(([modName, optName]) => (
                            optName && <p key={modName} className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {modName.charAt(0).toUpperCase() + modName.slice(1)}: {optName}</p>
                          ))}
                          {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">
                              • Add-ons: {item.selectedAddOns.map(addon => `${addon.name} x${addon.quantity}`).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => updateQuantity(idx, -1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"><Minus size={12} /></button>
                        <span className="text-[10px] font-black w-4 text-center dark:text-white">{item.quantity}</span>
                        <button onClick={() => updateQuantity(idx, 1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"><Plus size={12} /></button>
                      </div>
                      <button onClick={() => removeFromPosCart(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))
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
                  <span>{currencySymbol}{cartTotal.toFixed(2)}</span>
                </div>
                {cartTaxLines.map(tax => (
                  <div key={`cart-tax-${tax.id}`} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <span>{tax.name} ({tax.percentage.toFixed(2)}%)</span>
                    <span>{currencySymbol}{tax.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                  <span className="uppercase">Total</span>
                  <span className="text-orange-500">{currencySymbol}{cartGrandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Table</label>
                    <input type="text" value={posTableNo} onChange={e => setPosTableNo(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white" />
                  </div>
                  <div className="flex-[2]">
                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Remark</label>
                    <input type="text" value={posRemark} onChange={e => setPosRemark(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white" placeholder="No spicy..." />
                  </div>
                </div>

                <div className="flex gap-2">
                  {showSavedBillFeature && (
                    <button
                      onClick={saveCurrentBill}
                      disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                      className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                    >
                      Saved Bill
                    </button>
                  )}
                  <button
                    onClick={handleCheckout}
                    disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                    className={`${showSavedBillFeature ? 'flex-[2]' : 'flex-1'} py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2`}
                  >
                    <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Payment'}
                  </button>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}
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
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            {/* Cart Header */}
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

            {/* Cart Items */}
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

            {/* Cart Footer */}
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
                <span className="text-xl font-black text-orange-500">{currencySymbol}{cartGrandTotal.toFixed(2)}</span>
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
                <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : `Pay ${currencySymbol}${cartGrandTotal.toFixed(2)}`}
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

              {/* Content */}
              <div className="flex-1 px-5 lg:px-8 pb-6 lg:pb-8 pt-[3.75rem] space-y-4 lg:space-y-6 overflow-y-auto">
                {/* Total Amount Due - Centered */}
                <div className="text-center space-y-2 lg:space-y-3">
                  <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Total Amount Due</label>
                  <div className="text-4xl lg:text-6xl font-black text-orange-500 tracking-tighter">
                    {currencySymbol}{pendingOrderData.total.toFixed(2)}
                  </div>
                </div>

                {/* Amount Received - Plain Input */}
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

                {/* Cash Denomination Boxes */}
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

                {/* Payment Method */}
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

              {/* Footer / Action Buttons */}
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
              {/* Header */}
              <div className="px-8 py-5 border-b dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-2xl">Payment Complete</h3>
              </div>

              {/* Content */}
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

              {/* Footer */}
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

      {showSaveBillTableModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeSaveBillTableModal}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[86vw] max-w-3xl h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Select Table For Saved Bill</h3>
                <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">Tap one table based on your custom arrangement</p>
              </div>
              <button onClick={closeSaveBillTableModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Floor tabs in modal */}
              {featureSettings.floorEnabled && effectiveFloorCount > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {Array.from({ length: effectiveFloorCount }, (_, i) => i + 1).map(f => (
                    <button
                      key={f}
                      onClick={() => setModalSelectedFloor(f)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                        modalSelectedFloor === f
                          ? 'bg-orange-500 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Floor {f}
                    </button>
                  ))}
                </div>
              )}
              {tableRowsForModal.map((row, rowIdx) => (
                <div key={`select-row-${rowIdx}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                  {row.map((table) => {
                    const hasPending = savedBillsByTable.has(table);
                    const selected = selectedSaveTableNumber === table;
                    return (
                      <button
                        key={table}
                        onClick={() => setSelectedSaveTableNumber(table)}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          selected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                            : hasPending
                              ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300'
                        }`}
                      >
                        <p className="text-xs font-black uppercase tracking-widest dark:text-white">{table}</p>
                        <p className={`text-[10px] mt-1 ${hasPending ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400'}`}>
                          {hasPending ? 'Has pending bill (will replace)' : 'Available'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t dark:border-gray-700 flex gap-2">
              <button
                onClick={closeSaveBillTableModal}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveBillToTable}
                className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
              >
                Save Bill
              </button>
            </div>
          </div>
        </div>
      )}

      <SimpleItemOptionsModal
        item={selectedItemForOptions}
        restaurantId={restaurant.id}
        modifiers={modifiers}
        onClose={() => setSelectedItemForOptions(null)}
        onConfirm={(item) => {
          addToPosCart(item);
          setSelectedItemForOptions(null);
        }}
      />

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
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Source</span>
                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                  selectedReportOrder.orderSource === 'counter' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                  selectedReportOrder.orderSource === 'qr_order' ? 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' :
                  selectedReportOrder.orderSource === 'online' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' :
                  'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {selectedReportOrder.orderSource === 'counter' ? 'Counter' :
                   selectedReportOrder.orderSource === 'qr_order' ? 'QR Order' :
                   selectedReportOrder.orderSource === 'online' ? 'Online' : '-'}
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

              <div className="border-t dark:border-gray-700 pt-3 space-y-1.5">
                {(() => {
                  const subtotal = selectedReportOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
                  const taxLines = activeTaxEntries.map(tax => ({
                    id: tax.id,
                    name: tax.name,
                    percentage: tax.percentage,
                    amount: (subtotal * tax.percentage) / 100,
                  }));
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400 uppercase tracking-widest">Subtotal</span>
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{currencySymbol}{subtotal.toFixed(2)}</span>
                      </div>
                      {taxLines.map(tax => (
                        <div key={tax.id} className="flex items-center justify-between">
                          <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">{tax.name} ({tax.percentage.toFixed(2)}%)</span>
                          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{currencySymbol}{tax.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
                <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                  <span className="text-sm font-black dark:text-white uppercase tracking-widest">Total</span>
                  <span className="text-2xl font-black text-orange-500">{currencySymbol}{selectedReportOrder.total.toFixed(2)}</span>
                </div>
                {selectedReportOrder.amountReceived != null && (
                  <>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Received Amount</span>
                      <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{currencySymbol}{selectedReportOrder.amountReceived.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Total Change</span>
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
                  {selectedReportOrder.status === OrderStatus.SERVED ? (
                    <button
                      onClick={() => {
                        setCollectCashAmount(selectedReportOrder.total);
                        setCollectCashAmountInput(selectedReportOrder.total.toFixed(2));
                        setCollectPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
                        setCollectPaymentSuccess(false);
                        setShowCollectPaymentSidebar(true);
                      }}
                      className="flex-1 py-3 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2"
                    >
                      <CreditCard size={14} /> Collect Payment
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowRefundConfirm(true)}
                      className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={14} /> Refund
                    </button>
                  )}
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

      {/* Collect Payment Sidebar (slides from right) */}
      {showCollectPaymentSidebar && selectedReportOrder && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55] flex justify-end"
          onClick={() => { if (!collectPaymentProcessing) { setShowCollectPaymentSidebar(false); setCollectPaymentSuccess(false); } }}
        >
          <div
            className="bg-white dark:bg-gray-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Collect Payment</h3>
                <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5">Order #{selectedReportOrder.id}</p>
              </div>
              <button
                onClick={() => { if (!collectPaymentProcessing) { setShowCollectPaymentSidebar(false); setCollectPaymentSuccess(false); } }}
                disabled={collectPaymentProcessing}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {!collectPaymentSuccess ? (
              <>
                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                  {/* Total due */}
                  <div className="text-center">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Total Amount Due</p>
                    <p className="text-5xl font-black text-orange-500 tracking-tighter">{currencySymbol}{selectedReportOrder.total.toFixed(2)}</p>
                  </div>

                  {/* Amount received */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                    <div className="flex items-center border-b-2 dark:border-gray-600 border-gray-300 focus-within:border-orange-500 dark:focus-within:border-orange-500">
                      <span className="text-xl font-black text-gray-600 dark:text-gray-400 pb-3">{currencySymbol}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={collectCashAmountInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          setCollectCashAmountInput(val);
                          if (val === '' || val === '.') { setCollectCashAmount(null); return; }
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed)) setCollectCashAmount(parsed);
                        }}
                        onBlur={() => {
                          if (collectCashAmount !== null) {
                            const rounded = parseFloat(collectCashAmount.toFixed(2));
                            setCollectCashAmount(rounded);
                            setCollectCashAmountInput(rounded.toFixed(2));
                          }
                        }}
                        placeholder="0.00"
                        className="flex-1 p-3 bg-transparent text-xl font-black dark:text-white text-center focus:outline-none border-none"
                      />
                    </div>
                  </div>

                  {/* Quick select denominations */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Quick Select</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CASH_DENOMINATIONS.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => { setCollectCashAmount(amount); setCollectCashAmountInput(amount.toFixed(2)); }}
                          className={`p-3 rounded-xl font-black text-base uppercase tracking-widest transition-all border-2 ${
                            collectCashAmount === amount
                              ? 'bg-orange-500 text-white border-orange-600 shadow-lg'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500'
                          }`}
                        >
                          {currencySymbol} {amount.toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment method */}
                  <div className="space-y-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Payment Method</label>
                    <select
                      value={collectPaymentType}
                      onChange={(e) => setCollectPaymentType(e.target.value)}
                      className="w-full p-3 bg-white dark:bg-gray-700 border-2 dark:border-gray-600 rounded-xl text-base font-black dark:text-white focus:outline-none focus:border-orange-500 dark:focus:border-orange-500"
                    >
                      {paymentTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t dark:border-gray-700 flex gap-3 flex-shrink-0">
                  <button
                    onClick={() => { setShowCollectPaymentSidebar(false); setCollectPaymentSuccess(false); }}
                    disabled={collectPaymentProcessing}
                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!collectCashAmount || collectCashAmount < selectedReportOrder.total) {
                        toast('Amount received cannot be less than the total.', 'error');
                        return;
                      }
                      if (!collectPaymentType) return;
                      setCollectPaymentProcessing(true);
                      const paymentName = paymentTypes.find(p => p.id === collectPaymentType)?.name || collectPaymentType;
                      const changeAmt = Math.max(0, collectCashAmount - selectedReportOrder.total);
                      try {
                        onUpdateOrder(selectedReportOrder.id, OrderStatus.COMPLETED, {
                          paymentMethod: paymentName,
                          cashierName: cashierName || '',
                          amountReceived: collectCashAmount,
                          changeAmount: changeAmt,
                        });
                        counterOrdersCache.mergeReportOrdersCache(restaurant.id, [{
                          id: selectedReportOrder.id,
                          items: selectedReportOrder.items,
                          total: selectedReportOrder.total,
                          status: OrderStatus.COMPLETED,
                          timestamp: selectedReportOrder.timestamp,
                          restaurantId: restaurant.id,
                          tableNumber: selectedReportOrder.tableNumber,
                          remark: selectedReportOrder.remark || '',
                          customerId: '',
                          paymentMethod: paymentName,
                          cashierName: cashierName || '',
                          amountReceived: collectCashAmount,
                          changeAmount: changeAmt,
                          orderSource: selectedReportOrder.orderSource,
                        }]);
                        setCollectPaymentSuccess(true);
                      } catch (err: any) {
                        toast(`Payment failed: ${err?.message || 'Unknown error'}`, 'error');
                      } finally {
                        setCollectPaymentProcessing(false);
                      }
                    }}
                    disabled={collectPaymentProcessing || !collectPaymentType || !collectCashAmount}
                    className="flex-1 py-3 bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {collectPaymentProcessing ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                    ) : (
                      <><CreditCard size={14} /> Confirm Payment</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Success state */
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={36} className="text-green-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-black dark:text-white uppercase tracking-tighter mb-1">Payment Complete</h3>
                  <p className="text-xs text-gray-400 uppercase tracking-widest">Order #{selectedReportOrder.id} marked as paid</p>
                </div>
                <div className="w-full grid grid-cols-2 gap-4 text-center">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                    <p className="text-2xl font-black text-green-500">{currencySymbol}{(collectCashAmount || 0).toFixed(2)}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Received</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                    <p className="text-2xl font-black text-blue-500">{currencySymbol}{Math.max(0, (collectCashAmount || 0) - selectedReportOrder.total).toFixed(2)}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Change</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCollectPaymentSidebar(false);
                    setCollectPaymentSuccess(false);
                    setSelectedReportOrder(null);
                    toast('Payment collected successfully.', 'success');
                  }}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Order Rejection Modal */}
      {rejectingQrOrderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in fade-in duration-200">
            <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter mb-4">Reject QR Order</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reason</label>
                <div className="space-y-2">
                  {['Item out of stock', 'Kitchen too busy', 'Restaurant closed early', 'Other'].map(reason => (
                    <button
                      key={reason}
                      onClick={() => setQrRejectionReason(reason)}
                      className={`w-full text-left px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                        qrRejectionReason === reason
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Note (optional)</label>
                <textarea
                  value={qrRejectionNote}
                  onChange={e => setQrRejectionNote(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-medium dark:text-white resize-none"
                  placeholder="Add a note..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setRejectingQrOrderId(null); setQrRejectionNote(''); }}
                  className="flex-1 py-3 rounded-xl border dark:border-gray-600 font-black text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onUpdateOrder(rejectingQrOrderId, OrderStatus.CANCELLED);
                    setRejectingQrOrderId(null);
                    setQrRejectionNote('');
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kitchen Order Rejection Modal */}
      {rejectingKitchenOrderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in fade-in duration-200">
            <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter mb-4">Reject Kitchen Order</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reason</label>
                <div className="space-y-2">
                  {REJECTION_REASONS.map(reason => (
                    <button
                      key={reason}
                      onClick={() => setKitchenRejectionReason(reason)}
                      className={`w-full text-left px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                        kitchenRejectionReason === reason
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Note (optional)</label>
                <textarea
                  value={kitchenRejectionNote}
                  onChange={e => setKitchenRejectionNote(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-medium dark:text-white resize-none"
                  placeholder="Add a note..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setRejectingKitchenOrderId(null); setKitchenRejectionNote(''); }}
                  className="flex-1 py-3 rounded-xl border dark:border-gray-600 font-black text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleKitchenConfirmRejection}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Kitchen Order Alert */}
      {showNewOrderAlert && showKitchenFeature && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className="bg-orange-500 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Coffee size={20} />
            </div>
            <div>
              <p className="font-black text-sm uppercase tracking-tight">New Order!</p>
              <p className="text-[10px] font-bold opacity-80">A new order has arrived in the kitchen</p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .saved-table-scroll {
          overflow-x: auto;
          padding-bottom: 2px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .saved-table-scroll::-webkit-scrollbar {
          display: none;
        }
        .saved-table-row {
          --visible-cols: 3;
          display: grid;
          gap: 0.5rem;
          width: calc((var(--total-cols) / var(--visible-cols)) * 100%);
          grid-template-columns: repeat(var(--total-cols), minmax(0, 1fr));
        }
        .saved-table-cell {
          min-width: 0;
        }
        .saved-table-cell-empty {
          border: 1px dashed transparent;
          background: transparent;
          pointer-events: none;
        }
        @media (min-width: 768px) {
          .saved-table-row {
            --visible-cols: 4;
          }
        }
        @media (min-width: 1024px) {
          .saved-table-row {
            --visible-cols: 5;
          }
        }
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
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

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <UpgradePlanModal
          currentPlanId={vendorPlan}
          restaurantId={restaurant.id}
          subscription={subscription}
          onClose={() => setShowUpgradeModal(false)}
          onUpgraded={() => {
            setShowUpgradeModal(false);
            onSubscriptionUpdated?.();
          }}
        />
      )}
      </div>
    </div>
  );
};

export default PosOnlyView;