// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption, AddOnItemData, QS_DEFAULT_HUB, Subscription, PlanId, KitchenDepartment } from '../src/types';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { saveAllSettingsToDb, saveSettingsToDb, compressPosSettings, expandPosSettings, fetchSettingsFromServer, updateFeatureOnServer } from '../lib/sharedSettings';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions } from '../services/printerService';
import MenuItemFormModal, { MenuFormItem } from '../components/MenuItemFormModal';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';
import StandardReport from '../components/StandardReport';
import UpgradePlanModal from '../components/UpgradePlanModal';
import ImageCropModal from '../components/ImageCropModal';
import WalletBillingPage from './WalletBillingPage';
import {
  ShoppingBag, Search, Download, Calendar,
  Printer, QrCode, CreditCard, Trash2, Plus, Minus, LayoutGrid,
  List, Clock, CheckCircle, CheckCircle2, BarChart3, Hash, Menu, Settings, BookOpen,
  X, Edit3, Archive, RotateCcw, Upload, Eye,
  AlertCircle, Users, UserPlus, Bluetooth, BluetoothConnected, PrinterIcon,
  Filter, Tag, Layers, Coffee, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeftRight, RotateCw, Wifi, WifiOff,
  Receipt, Network, Type, MessageSquare, Zap, Briefcase, PlusCircle, Puzzle,
  ArrowLeft, Star, Package, Monitor, Info, ExternalLink,
  Tablet, Globe, ShoppingCart, Wallet, ArrowUpRight, ArrowDownRight, Building2, Banknote, Send, Copy, Truck, Mail,
  MoreVertical, Lock, ImagePlus, EyeOff, User, Link2
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
  announcements?: Array<{id: string; title: string; body: string; category: string; created_at: string; is_read: boolean}>;
  announcementsLoading?: boolean;
  onMarkAnnouncementRead?: (id: string) => void;
  unreadMailCount?: number;
  openMailTab?: boolean;
  onMailTabOpened?: () => void;
  onUpdateOrderItems?: (orderId: string, items: CartItem[], total: number) => void;
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
  announcements = [],
  announcementsLoading = false,
  onMarkAnnouncementRead,
  unreadMailCount = 0,
  openMailTab = false,
  onMailTabOpened,
  onUpdateOrderItems,
}) => {
  const toLocalDateInputValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };

  const [activeTab, setActiveTab] = useState<'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING' | 'ADDONS' | 'ONLINE_ORDERS' | 'MAIL'>(() => {
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
  const [onlineOrderFilter, setOnlineOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'ALL'>('ONGOING_ALL');
  const [rejectingQrOrderId, setRejectingQrOrderId] = useState<string | null>(null);
  const [viewingQrOrderDetail, setViewingQrOrderDetail] = useState<Order | null>(null);
  const [qrOrderView, setQrOrderView] = useState<'grid' | 'list'>('grid');
  const [qrSearchQuery, setQrSearchQuery] = useState('');
  const [qrGridColumns, setQrGridColumns] = useState<2 | 3>(2);
  const [editingQrOrderId, setEditingQrOrderId] = useState<string | null>(null);
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
  const [qrOrderSettings, setQrOrderSettings] = useState<{ autoApprove: boolean; autoPrint: boolean }>(() => {
    const dbSaved = restaurant.settings?.qrOrderSettings;
    if (dbSaved && typeof dbSaved === 'object') return { ...{ autoApprove: false, autoPrint: false }, ...dbSaved };
    const saved = localStorage.getItem(`qr_order_settings_${restaurant.id}`);
    return saved ? JSON.parse(saved) : { autoApprove: false, autoPrint: false };
  });
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const [kitchenPrintingOrderId, setKitchenPrintingOrderId] = useState<string | null>(null);
  const [kitchenDivisions, setKitchenDivisions] = useState<KitchenDepartment[]>(() => normalizeKitchenDepartments(restaurant.kitchenDivisions));
  const [newDivisionName, setNewDivisionName] = useState('');
  const [renamingDepartment, setRenamingDepartment] = useState<string | null>(null);
  const [renameDepartmentValue, setRenameDepartmentValue] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'CASHIER' | 'KITCHEN' | 'ORDER_TAKER'>('CASHIER');
  const [showLockedRoleAlert, setShowLockedRoleAlert] = useState<string | null>(null);
  const [newStaffKitchenCategories, setNewStaffKitchenCategories] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Profile panel state
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileRestaurantName, setProfileRestaurantName] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [profileShowCurrentPw, setProfileShowCurrentPw] = useState(false);
  const [profileShowNewPw, setProfileShowNewPw] = useState(false);
  const [profileCropFile, setProfileCropFile] = useState<File | null>(null);
  const [profileLogoUploading, setProfileLogoUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileLogoPreview, setProfileLogoPreview] = useState<string>(restaurant.logo || '');
  const [profileLogoHovered, setProfileLogoHovered] = useState(false);
  const profileLogoInputRef = useRef<HTMLInputElement>(null);

  // Image link state
  const [profileImageLinkInput, setProfileImageLinkInput] = useState<string>('');
  const [profileShowLinkInput, setProfileShowLinkInput] = useState(false);

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
  const [menuViewMode, setMenuViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`ux_menuViewMode_${restaurant.id}`);
      if (saved === 'grid' || saved === 'list') return saved;
    }
    return 'list';
  });
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('All');
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuSubTab, setMenuSubTab] = useState<'KITCHEN' | 'CATEGORY' | 'MODIFIER' | 'ADDON'>('KITCHEN');
  const [menuEditorStuck, setMenuEditorStuck] = useState(false);
  const menuEditorStickyRef = useRef<HTMLDivElement>(null);
  const [onlineOrderSubTab, setOnlineOrderSubTab] = useState<'INCOMING' | 'PRODUCT' | 'SETTING'>('INCOMING');
  const [qrOrderSubTab, setQrOrderSubTab] = useState<'INCOMING' | 'QR_GENERATOR' | 'SETTING_TAB'>('INCOMING');
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
    // Apply kitchenEnabled from dedicated DB column as the base default only
    if (restaurant.kitchenEnabled) defaults.kitchenEnabled = true;
    // Priority 1: DB settings.features (cross-device authoritative — always prefer DB over localStorage)
    const dbSaved = restaurant.settings?.features;
    if (dbSaved && typeof dbSaved === 'object') {
      return { ...defaults, ...dbSaved };
    }
    // Priority 2: localStorage (same-device offline cache)
    const saved = localStorage.getItem(`features_${restaurant.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaults, ...parsed };
      } catch {}
    }
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
  const [qrGenLocation, setQrGenLocation] = useState<string>(() => restaurant.settings?.qrLocationLabel || '');
  const [qrGenTableCount, setQrGenTableCount] = useState<string>('10');
  const [qrGenTablePrefix, setQrGenTablePrefix] = useState<string>('Table ');
  const [qrGenStartNum, setQrGenStartNum] = useState<string>('1');
  const [qrGenPreviewTable, setQrGenPreviewTable] = useState<string>('');
  const [qrPreviewIndex, setQrPreviewIndex] = useState<number>(0);
  const [qrLogoUrl, setQrLogoUrl] = useState<string>('');
  const [qrShowLogo, setQrShowLogo] = useState<boolean>(false);
  const [qrLogoCropFile, setQrLogoCropFile] = useState<File | null>(null);
  const [qrLogoUploading, setQrLogoUploading] = useState<boolean>(false);
  const qrLogoInputRef = useRef<HTMLInputElement>(null);
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

  const openAddStaffModal = (initialRole: 'CASHIER' | 'KITCHEN' | 'ORDER_TAKER' = 'CASHIER') => {
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
    const mappedRole: 'CASHIER' | 'KITCHEN' | 'ORDER_TAKER' = staff.role === 'KITCHEN' ? 'KITCHEN' : staff.role === 'ORDER_TAKER' ? 'ORDER_TAKER' : 'CASHIER';
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

  // ── Profile Panel Handlers ──────────────────────────────────────────────
  const openProfilePanel = () => {
    setProfileRestaurantName(restaurant.name);
    setProfileCurrentPassword('');
    setProfileNewPassword('');
    setProfileConfirmPassword('');
    setProfileShowCurrentPw(false);
    setProfileShowNewPw(false);
    setProfileLogoPreview(restaurant.logo || '');
    setProfileLogoHovered(false);
    setProfileImageLinkInput('');
    setProfileShowLinkInput(false);
    setShowProfilePanel(true);
  };

  const handleProfileLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please select a PNG or JPEG image file.', 'warning');
      return;
    }
    setProfileCropFile(file);
    if (profileLogoInputRef.current) profileLogoInputRef.current.value = '';
  };

  const handleProfileLogoCropped = async (blob: Blob) => {
    setProfileCropFile(null);
    setProfileLogoUploading(true);
    try {
      const file = new File([blob], `restaurant-logo-${restaurant.id}.png`, { type: 'image/png' });
      const url = await uploadImage(file, 'qr-logos', `${restaurant.id}/restaurant-logo`);
      if (url) {
        const { error } = await supabase
          .from('restaurants')
          .update({ logo: url })
          .eq('id', restaurant.id);
        if (error) throw error;
        setProfileLogoPreview(url);
        toast('Logo updated successfully!', 'success');
      }
    } catch {
      toast('Failed to upload logo.', 'error');
    } finally {
      setProfileLogoUploading(false);
    }
  };

  const handleSaveImageLink = async () => {
    const url = profileImageLinkInput.trim();
    if (!url) { toast('Please enter an image URL.', 'warning'); return; }
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ logo: url })
        .eq('id', restaurant.id);
      if (error) throw error;
      setProfileLogoPreview(url);
      setProfileImageLinkInput('');
      setProfileShowLinkInput(false);
      toast('Logo updated!', 'success');
    } catch {
      toast('Failed to save image link.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ logo: '' })
        .eq('id', restaurant.id);
      if (error) throw error;
      setProfileLogoPreview('');
      setProfileLogoHovered(false);
      toast('Logo removed.', 'success');
    } catch {
      toast('Failed to remove logo.', 'error');
    }
  };

  const handleSaveProfileInfo = async () => {
    const newName = profileRestaurantName.trim();
    if (!newName) {
      toast('Restaurant name cannot be empty.', 'warning');
      return;
    }
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ name: newName })
        .eq('id', restaurant.id);
      if (error) throw error;
      toast('Restaurant info updated!', 'success');
    } catch {
      toast('Failed to update info.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveProfilePassword = async () => {
    if (!profileCurrentPassword) {
      toast('Please enter your current password.', 'warning');
      return;
    }
    if (!profileNewPassword) {
      toast('Please enter a new password.', 'warning');
      return;
    }
    if (profileNewPassword.length < 6) {
      toast('New password must be at least 6 characters.', 'warning');
      return;
    }
    if (profileNewPassword !== profileConfirmPassword) {
      toast('New passwords do not match.', 'warning');
      return;
    }
    setProfileSaving(true);
    try {
      const rawUser = localStorage.getItem('qs_user');
      const currentUser = rawUser ? JSON.parse(rawUser) : null;
      if (!currentUser?.id) throw new Error('User session not found.');

      // Verify current password first
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('password')
        .eq('id', currentUser.id)
        .single();
      if (fetchError || !userData) throw new Error('Could not verify current password.');
      if (userData.password !== profileCurrentPassword) {
        toast('Current password is incorrect.', 'error');
        setProfileSaving(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({ password: profileNewPassword })
        .eq('id', currentUser.id);
      if (error) throw error;
      toast('Password updated successfully!', 'success');
      setProfileCurrentPassword('');
      setProfileNewPassword('');
      setProfileConfirmPassword('');
    } catch (err: any) {
      toast(err.message || 'Failed to update password.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };
  // ───────────────────────────────────────────────────────────────────────

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
    const filtered = restaurant.menu.filter(item => {
      const statusMatch = menuStatusFilter === 'ACTIVE' ? !item.isArchived : !!item.isArchived;
      const categoryMatch = menuCategoryFilter === 'All' || item.category === menuCategoryFilter;
      const searchMatch = !menuSearchQuery || item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) || item.category.toLowerCase().includes(menuSearchQuery.toLowerCase());
      return statusMatch && categoryMatch && searchMatch;
    });
    if (menuCategoryFilter === 'All') {
      return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [restaurant.menu, menuStatusFilter, menuCategoryFilter, menuSearchQuery]);

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

  // Detect when menu editor toolbar becomes stuck
  useEffect(() => {
    const el = menuEditorStickyRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setMenuEditorStuck(entry.intersectionRatio < 1),
      { threshold: [1], rootMargin: '-1px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, menuSubTab]);

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
      : (selectedQrOrderForPayment?.tableNumber ?? 'Table 1');

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

  const handleEditQrOrder = (order: Order) => {
    setPosCart(order.items as CartItem[]);
    setPosTableNo(order.tableNumber || 'Counter');
    setPosRemark(order.remark || '');
    setEditingQrOrderId(order.id);
    setViewingQrOrderDetail(null);
    setActiveTab('COUNTER');
    setCounterMode('COUNTER_ORDER');
  };

  const handleSaveQrOrderEdit = async () => {
    if (!editingQrOrderId) return;
    const savedOrderId = editingQrOrderId;
    const savedItems = [...posCart];
    const savedTotal = cartGrandTotal;
    try {
      await supabase.from('orders').update({ items: savedItems, total: savedTotal }).eq('id', savedOrderId);
      // Update local orders state immediately so all lists reflect the change
      if (onUpdateOrderItems) {
        onUpdateOrderItems(savedOrderId, savedItems, savedTotal);
      }
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
      setEditingQrOrderId(null);
      // Stay in counter, load updated order into QR_ORDER mode for edit/payment
      const updatedOrder = orders.find(o => o.id === savedOrderId);
      if (updatedOrder) {
        setSelectedQrOrderForPayment({ ...updatedOrder, items: savedItems, total: savedTotal });
        setCounterMode('QR_ORDER');
      } else {
        setActiveTab('QR_ORDERS');
      }
    } catch (e) {
      console.error('Failed to update order items:', e);
    }
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

  // Open MAIL tab when triggered from outside (header mail button)
  useEffect(() => {
    if (openMailTab) {
      setActiveTab('MAIL');
      setIsMobileMenuOpen(false);
      onMailTabOpened?.();
    }
  }, [openMailTab]);

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

  // Fetch latest settings from server on mount to ensure cross-device consistency
  useEffect(() => {
    const syncSettingsFromServer = async () => {
      const serverSettingsRaw = await fetchSettingsFromServer(restaurant.id);
      if (!serverSettingsRaw) {
        // Server fetch failed — allow debounced sync to work with local state
        settingsHydratedRef.current = true;
        return;
      }

      // Expand compressed settings from DB to full settings object
      const serverSettings = expandPosSettings(serverSettingsRaw, restaurant.name);

      // Hydrate ALL settings state from server (DB is authoritative for cross-device)
      if (serverSettings.features) {
        setFeatureSettings(prev => ({ ...prev, ...serverSettings.features }));
      }
      if (serverSettings.receipt && typeof serverSettings.receipt === 'object') {
        setReceiptSettings(prev => ({ ...prev, ...serverSettings.receipt }));
      }
      if (Array.isArray(serverSettings.paymentTypes) && serverSettings.paymentTypes.length > 0) {
        setPaymentTypes(serverSettings.paymentTypes);
      }
      if (Array.isArray(serverSettings.taxes)) {
        setTaxEntries(serverSettings.taxes);
      }
      if (serverSettings.currency) {
        setUserCurrency(serverSettings.currency);
      }
      if (serverSettings.font) {
        setUserFont(serverSettings.font);
      }
      if (Array.isArray(serverSettings.printers)) {
        setSavedPrinters(serverSettings.printers as SavedPrinter[]);
      }
      if (serverSettings.kitchenSettings && typeof serverSettings.kitchenSettings === 'object') {
        setKitchenOrderSettings(prev => ({ ...prev, ...serverSettings.kitchenSettings }));
      }
      if (Array.isArray(serverSettings.onlineDeliveryOptions)) {
        setOnlineDeliveryOptions(serverSettings.onlineDeliveryOptions as OnlineDeliveryOption[]);
      }
      if (Array.isArray(serverSettings.onlinePaymentMethods)) {
        setOnlinePaymentMethods(serverSettings.onlinePaymentMethods as OnlinePaymentMethod[]);
      }

      // Update localStorage cache with full expanded settings
      try {
        localStorage.setItem(`qs_settings_${restaurant.id}`, JSON.stringify(serverSettings));
        localStorage.setItem(`features_${restaurant.id}`, JSON.stringify(serverSettings.features));
      } catch (e) {
        console.warn('Failed to update localStorage cache:', e);
      }

      // Mark hydration complete so the debounced sync can start writing user changes
      settingsHydratedRef.current = true;
    };
    syncSettingsFromServer();
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

  // User Experience: persist menu view mode choice
  useEffect(() => {
    localStorage.setItem(`ux_menuViewMode_${restaurant.id}`, menuViewMode);
  }, [menuViewMode, restaurant.id]);

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
        .update({ settings: compressPosSettings(mergedSettings, restaurant.name) })
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

    // Sync to server immediately for cross-device consistency
    const updated = { ...featureSettings, [key]: value };
    const currentSettings = (() => {
      try {
        const cached = localStorage.getItem(`qs_settings_${restaurant.id}`);
        return cached ? JSON.parse(cached) : {};
      } catch {
        return {};
      }
    })();

    const newSettings = {
      ...currentSettings,
      features: {
        ...(currentSettings.features || {}),
        [key]: value,
      },
    };

    // Update localStorage caches immediately
    localStorage.setItem(`qs_settings_${restaurant.id}`, JSON.stringify(newSettings));
    localStorage.setItem(`features_${restaurant.id}`, JSON.stringify(newSettings.features));

    updateFeatureOnServer(restaurant.id, String(key), value as boolean, newSettings)
      .catch(error => {
        console.warn(`Failed to sync ${key} to server:`, error);
      });

    // Also sync kitchenEnabled to the kitchen_enabled DB column for login API compatibility
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

  const handleTabSelection = (tab: 'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING' | 'ADDONS' | 'ONLINE_ORDERS' | 'MAIL') => {
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

  // Sidebar nav item count – used to auto-scale spacing so the menu never needs to scroll
  const sidebarNavItemCount = isKitchenUser
    ? 1
    : 6 + (showQrFeature ? 1 : 0) + (showOnlineShopFeature ? 1 : 0);
  const navCompact      = sidebarNavItemCount >= 9;
  const navExtraCompact = sidebarNavItemCount >= 11;
  const navItemPy       = navExtraCompact ? 'py-1.5' : navCompact ? 'py-2' : 'py-2.5';
  const navSectionPt    = navExtraCompact ? 'pt-2 pb-0' : navCompact ? 'pt-3 pb-0.5' : 'pt-4 pb-1';
  const navContainerPy  = navExtraCompact ? 'py-2' : navCompact ? 'py-3' : 'py-4';
  const navIconSize     = navExtraCompact ? 16 : navCompact ? 17 : 18;
  const navTextSize     = navExtraCompact ? 'text-xs' : 'text-sm';

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

  const toggleQrOrderSetting = (key: 'autoApprove' | 'autoPrint') => {
    setQrOrderSettings(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`qr_order_settings_${restaurant.id}`, JSON.stringify(updated));
      saveSettingsToDb(restaurant.id, restaurant.settings || {}, 'qrOrderSettings', updated);
      return updated;
    });
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

  // QR order auto-approve + auto-print
  const qrPrevPendingCount = useRef(0);
  useEffect(() => {
    if (!showQrFeature) return;
    const qrPendingOrders = orders.filter(o => (o.orderSource === 'qr_order' || o.orderSource === 'tableside') && o.status === OrderStatus.PENDING);
    if (qrPendingOrders.length > qrPrevPendingCount.current && qrOrderSettings.autoApprove) {
      qrPendingOrders.forEach(order => {
        onUpdateOrder(order.id, OrderStatus.ONGOING);
      });
    }
    qrPrevPendingCount.current = qrPendingOrders.length;
  }, [orders, showQrFeature, qrOrderSettings.autoApprove]);

  // Persist kitchen order settings
  useEffect(() => {
    localStorage.setItem(`kitchen_settings_${restaurant.id}`, JSON.stringify(kitchenOrderSettings));
  }, [kitchenOrderSettings, restaurant.id]);

  // ── Cross-device settings sync ──────────────────────────────────────────────
  // Only writes to DB when a setting *changes* after initial server hydration.
  // Skips renders until server settings have been fetched to avoid overwriting
  // DB with stale localStorage data.
  const settingsSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsHydratedRef = useRef(false);
  useEffect(() => {
    // Skip until server settings have been fetched and applied.
    if (!settingsHydratedRef.current) {
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
        ...(restaurant.location === QS_DEFAULT_HUB && qrGenLocation ? { qrLocationLabel: qrGenLocation } : {}),
      };
      saveAllSettingsToDb(restaurant.id, bundle, restaurant.name);
    }, 1500);
    return () => {
      if (settingsSyncTimerRef.current) clearTimeout(settingsSyncTimerRef.current);
    };
  }, [receiptSettings, featureSettings, paymentTypes, taxEntries, userFont, userCurrency, savedPrinters, kitchenOrderSettings, onlineDeliveryOptions, onlinePaymentMethods, qrGenLocation, restaurant.id]);
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
                  const { error: orderCodeError } = await supabase
                    .from('restaurants')
                    .update({ settings: compressPosSettings(mergedSettings, restaurant.name) })
                    .eq('id', restaurant.id);
                  if (orderCodeError) {
                    console.warn('Cloud save failed for order code:', orderCodeError.message);
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
                      : staff.role === 'ORDER_TAKER'
                        ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>{staff.role === 'KITCHEN' ? 'Kitchen' : staff.role === 'ORDER_TAKER' ? 'Order Taker' : 'Cashier'}</span>
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

    const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Please select a PNG or JPEG image file.', 'warning');
        return;
      }
      setQrLogoCropFile(file);
      if (qrLogoInputRef.current) qrLogoInputRef.current.value = '';
    };

    const handleLogoCropped = async (blob: Blob) => {
      setQrLogoCropFile(null);
      setQrLogoUploading(true);
      try {
        const file = new File([blob], `qr-logo-${restaurant.id}.png`, { type: 'image/png' });
        const url = await uploadImage(file, 'qr-logos', `${restaurant.id}/logo`);
        if (url) {
          setQrLogoUrl(url);
          setQrShowLogo(true);
          toast('Logo uploaded successfully!', 'success');
        }
      } catch {
        toast('Failed to upload logo.', 'error');
      } finally {
        setQrLogoUploading(false);
      }
    };

    const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Please drop a PNG or JPEG image file.', 'warning');
        return;
      }
      setQrLogoCropFile(file);
    };

    // Clamp preview index to valid range
    const safePreviewIdx = Math.max(0, Math.min(qrPreviewIndex, tableNames.length - 1));
    const previewTableName = tableNames[safePreviewIdx] || tableNames[0] || 'Table 1';
    const locationLabel = qrGenLocation || (restaurant.location === QS_DEFAULT_HUB ? restaurant.name : restaurant.location);

    return (
      <div className="space-y-8">
        {/* Three-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Column 1: QR Code Generator Config ── */}
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border dark:border-gray-600">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-3">QR Code Generator Config</h3>

            <div className="space-y-3">
              {/* Location Name & Table Prefix side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Location Name</label>
                  <input
                    type="text"
                    value={qrGenLocation || (restaurant.location === QS_DEFAULT_HUB ? restaurant.name : restaurant.location)}
                    onChange={e => { if (restaurant.location === QS_DEFAULT_HUB) setQrGenLocation(e.target.value); }}
                    disabled={restaurant.location !== QS_DEFAULT_HUB}
                    className={`w-full px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white ${restaurant.location !== QS_DEFAULT_HUB ? 'opacity-60 cursor-not-allowed' : ''}`}
                    placeholder={restaurant.location === QS_DEFAULT_HUB ? restaurant.name : (restaurant.location || 'e.g. Main Hall')}
                  />
                  {restaurant.location !== QS_DEFAULT_HUB && (
                    <p className="text-[8px] text-gray-400 mt-1">Location name is set by your hub assignment</p>
                  )}
                  {restaurant.location === QS_DEFAULT_HUB && (
                    <p className="text-[8px] text-gray-400 mt-1">Shown as "Serving At" in customer view</p>
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Table Prefix</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">—</span>
                    <input
                      type="text"
                      value={qrGenTablePrefix}
                      onChange={e => setQrGenTablePrefix(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                      placeholder="Table "
                    />
                  </div>
                </div>
              </div>

              {/* Start Number & Number of Tables side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Start Number</label>
                  <input
                    type="number"
                    value={qrGenStartNum}
                    onChange={e => setQrGenStartNum(e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Number of Tables</label>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQrGenTableCount(String(Math.max(1, (parseInt(qrGenTableCount, 10) || 1) - 1)))}
                      className="p-1.5 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-gray-500 hover:text-orange-500 hover:border-orange-300 transition-all"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      value={qrGenTableCount}
                      onChange={e => setQrGenTableCount(e.target.value)}
                      min="1"
                      max="50"
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white text-center"
                      placeholder="10"
                    />
                    <button
                      onClick={() => setQrGenTableCount(String(Math.min(50, (parseInt(qrGenTableCount, 10) || 0) + 1)))}
                      className="p-1.5 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-gray-500 hover:text-orange-500 hover:border-orange-300 transition-all"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="pt-1">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Bulk Actions</p>
                <button
                  onClick={handlePrintQrs}
                  className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-500 hover:text-white dark:hover:bg-orange-500 dark:hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> Print All [{count}] QR Codes
                </button>
                <button
                  onClick={() => {
                    setQrGenLocation('');
                    setQrGenTablePrefix('Table ');
                    setQrGenStartNum('1');
                    setQrGenTableCount('10');
                    setQrGenPreviewTable('');
                    setQrPreviewIndex(0);
                  }}
                  className="w-full mt-2 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
            </div>
          </div>

          {/* ── Column 2: QR Code Design & Branding ── */}
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border dark:border-gray-600">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-3">QR Code Design & Branding <span className="text-[9px] font-bold text-gray-400 normal-case">(Optional)</span></h3>

            <div className="space-y-3">
              {/* Logo Upload Area */}
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Add Your Logo</p>
                <div
                  onClick={() => qrLogoInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleLogoDrop}
                  className="relative border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 dark:hover:bg-orange-900/10 transition-all group"
                >
                  {qrLogoUploading ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-500">Uploading...</p>
                    </div>
                  ) : qrLogoUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={qrLogoUrl} alt="QR Logo" className="w-12 h-12 object-contain rounded-lg border dark:border-gray-600" />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Click to change logo</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 bg-gray-100 dark:bg-gray-600 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-orange-500 transition-colors">
                        <Upload size={20} />
                      </div>
                      <p className="text-xs font-bold text-gray-600 dark:text-gray-300">Click to Upload or Drag Logo</p>
                      <p className="text-[10px] text-gray-400">Supported file: PNG, JPEG</p>
                    </div>
                  )}
                  <input
                    ref={qrLogoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleLogoFileSelect}
                    className="hidden"
                  />
                </div>
                <p className="text-[9px] text-gray-400 mt-2">*Recommended size: 100x100px. The logo will be placed in the center of the QR code.</p>
              </div>

              {/* Show Logo Toggle */}
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-600">
                <span className="text-xs font-black dark:text-white">Show Logo</span>
                <button
                  onClick={() => {
                    if (!qrLogoUrl) { toast('Upload a logo first.', 'warning'); return; }
                    setQrShowLogo(!qrShowLogo);
                  }}
                  className={`relative w-11 h-6 rounded-full transition-all ${qrShowLogo && qrLogoUrl ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${qrShowLogo && qrLogoUrl ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Column 3: Interactive QR Preview ── */}
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border dark:border-gray-600 flex flex-col">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-3">Interactive QR Preview</h3>

            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              {/* QR Code Preview */}
              <div className="relative">
                <img
                  src={buildQrImageUrl(previewTableName)}
                  alt={`QR for ${previewTableName}`}
                  className="w-32 h-32 rounded-xl border-2 border-gray-200 dark:border-gray-500"
                />
                {qrShowLogo && qrLogoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src={qrLogoUrl} alt="Logo" className="w-8 h-8 rounded-lg bg-white p-0.5 shadow-md" />
                  </div>
                )}
              </div>

              {/* Table Label */}
              <div className="text-center">
                <p className="text-xs font-black dark:text-white uppercase tracking-tight">
                  {previewTableName} <span className="text-gray-400">({locationLabel})</span>
                </p>
                <p className="text-[8px] text-gray-400 font-mono mt-0.5 break-all leading-relaxed max-w-[220px]">{buildQrUrl(previewTableName)}</p>
              </div>

              {/* Preview & Download Button */}
              <button
                onClick={() => handleDownloadQr(previewTableName)}
                className="w-full py-2 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
              >
                <QrCode size={13} /> Preview & Download Single Code
              </button>

              {/* Navigation */}
              <div className="flex items-center justify-between w-full">
                <button
                  onClick={() => setQrPreviewIndex(Math.max(0, safePreviewIdx - 1))}
                  disabled={safePreviewIdx === 0}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  Showing Table {safePreviewIdx + 1} of {tableNames.length}
                </span>
                <button
                  onClick={() => setQrPreviewIndex(Math.min(tableNames.length - 1, safePreviewIdx + 1))}
                  disabled={safePreviewIdx >= tableNames.length - 1}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-gray-400"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Generated QR Code Gallery ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight">
              Generated QR Code Gallery <span className="text-gray-400">[{count} Codes]</span>
            </h3>
            <button
              onClick={() => {
                const newCount = Math.min(50, count + 10);
                setQrGenTableCount(String(newCount));
              }}
              className="px-4 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest hover:border-orange-400 hover:text-orange-500 transition-all"
            >
              Generate More
            </button>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
            {tableNames.map((t, idx) => (
              <div
                key={t}
                className={`flex flex-col items-center gap-1.5 p-2 bg-white dark:bg-gray-800 rounded-xl border-2 transition-all cursor-pointer hover:border-orange-400 hover:shadow-md ${
                  idx === safePreviewIdx ? 'border-orange-500 shadow-md bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-600'
                }`}
                onClick={() => setQrPreviewIndex(idx)}
              >
                <img
                  src={buildQrImageUrl(t)}
                  alt={`QR ${t}`}
                  className="w-full aspect-square rounded-lg"
                />
                <p className="text-[8px] font-black dark:text-white uppercase tracking-tighter text-center line-clamp-1 w-full">{t}</p>
                <button
                  onClick={e => { e.stopPropagation(); handleDownloadQr(t); }}
                  className="flex items-center gap-1 text-[8px] text-gray-400 hover:text-orange-500 transition-colors font-bold"
                  title={`Download QR for ${t}`}
                >
                  <Download size={10} /> Download
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Logo Crop Modal */}
        {qrLogoCropFile && (
          <ImageCropModal
            imageFile={qrLogoCropFile}
            onCrop={(blob) => handleLogoCropped(blob)}
            onCancel={() => setQrLogoCropFile(null)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-gray-50 dark:bg-gray-900 overflow-hidden flex-col">
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
        <div className={`