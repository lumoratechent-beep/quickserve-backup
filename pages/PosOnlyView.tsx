// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption, AddOnItemData, QS_DEFAULT_HUB, Subscription, PlanId, KitchenDepartment, CashierShift } from '../src/types';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { saveAllSettingsToDb, saveSettingsToDb, compressPosSettings, expandPosSettings, fetchSettingsFromServer, updateFeatureOnServer } from '../lib/sharedSettings';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions, SavedPrinter, ReceiptConfig, OrderListConfig, KitchenTicketConfig, DEFAULT_RECEIPT_CONFIG, DEFAULT_ORDER_LIST_CONFIG, DEFAULT_KITCHEN_TICKET_CONFIG, createDefaultPrinter } from '../services/printerService';
import type { PaperSize } from '../services/printerService';
import PrinterSettings from '../components/PrinterSettings';
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
  MoreVertical, Lock, ImagePlus, EyeOff, User, Link2, Delete
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus, paymentDetails?: { paymentMethod?: string; cashierName?: string; amountReceived?: number; changeAmount?: number }) => void;
  onKitchenUpdateOrder?: (orderId: string, status: OrderStatus, rejectionReason?: string, rejectionNote?: string) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string, diningType?: string, paymentMethod?: string, cashierName?: string, amountReceived?: number) => Promise<string>;
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
  onMarkAllAnnouncementsRead?: () => void;
  onClearAnnouncements?: () => void;
  unreadMailCount?: number;
  openMailTab?: boolean;
  onMailTabOpened?: () => void;
  onUpdateOrderItems?: (orderId: string, items: CartItem[], total: number) => void;
  onComparePlans?: () => void;
  activeShift?: CashierShift | null;
  onOpenShiftModal?: () => void;
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

// Receipt and printer configs are now managed by the PrinterSettings component
// and the service types from printerService.ts

type SettingsPanel = 'builtin' | 'printer' | 'receipt' | 'orderList' | 'payment' | 'staff' | 'addon-table' | 'addon-qr' | 'addon-kitchen' | 'addon-tableside' | 'addon-customer-display' | 'addon-online-shop' | 'addon-shift';

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
  shiftEnabled: boolean;
}

const getDefaultFeatureSettings = (): FeatureSettings => ({
  autoPrintReceipt: false,
  autoOpenDrawer: false,
  dineInEnabled: true,
  takeawayEnabled: true,
  deliveryEnabled: false,
  savedBillEnabled: false,
  tableManagementEnabled: false,
  tableCount: 20,
  tableRows: 4,
  tableColumns: 5,
  floorEnabled: false,
  floorCount: 1,
  customerDisplayEnabled: false,
  kitchenEnabled: false,
  qrEnabled: false,
  tablesideOrderingEnabled: false,
  onlineShopEnabled: false,
  shiftEnabled: false,
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
  enabled: boolean;
}

const DEFAULT_PAYMENT_TYPES = [
  { id: 'cash', name: 'Cash' },
  { id: 'qr', name: 'QR' },
  { id: 'card', name: 'Card' },
] as const;

const NON_REMOVABLE_PAYMENT_TYPE_IDS = new Set<string>(DEFAULT_PAYMENT_TYPES.map((type) => type.id));

const getDefaultPaymentTypes = (): PaymentType[] => (
  DEFAULT_PAYMENT_TYPES.map((type) => ({ ...type, enabled: true }))
);

const normalizePaymentTypes = (types: unknown): PaymentType[] => {
  const source = Array.isArray(types) ? types : [];
  const uniqueById = new Map<string, PaymentType>();

  source.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const candidate = item as Partial<PaymentType>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!id || !name || uniqueById.has(id)) return;

    uniqueById.set(id, {
      id,
      name,
      enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    });
  });

  const defaults = DEFAULT_PAYMENT_TYPES.map((type) => ({
    id: type.id,
    name: type.name,
    enabled: uniqueById.get(type.id)?.enabled ?? true,
  }));

  const customTypes = Array.from(uniqueById.values()).filter((type) => !NON_REMOVABLE_PAYMENT_TYPE_IDS.has(type.id));
  return [...defaults, ...customTypes];
};

const getFirstEnabledPaymentTypeId = (types: PaymentType[]): string => {
  return types.find((type) => type.enabled)?.id || '';
};

const getPreferredPaymentTypeId = (types: PaymentType[]): string => {
  const cashType = types.find((type) => type.enabled && type.id.toLowerCase() === 'cash');
  if (cashType) return cashType.id;
  return getFirstEnabledPaymentTypeId(types);
};

// Legacy placeholder URLs that were previously auto-generated for items without images.
const MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX = 'https://picsum.photos/seed/';
const MENU_ITEM_DEFAULT_TILE_COLOR = '#D1D5DB';

const hasRenderableMenuItemImage = (item: Pick<MenuItem, 'image'>): boolean => (
  Boolean(item.image) && !item.image.startsWith(MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX)
);

const getMenuItemTileBackground = (item: Pick<MenuItem, 'image' | 'color'>): string => (
  item.color || MENU_ITEM_DEFAULT_TILE_COLOR
);

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
  diningType?: string;
  createdAt: number;
}

type TableModalMode = 'SAVE_BILL' | 'COUNTER_PICK';

type AddonActionKind = 'install' | 'uninstall';
type AddonActionPhase = 'running' | 'done';

interface AddonActionState {
  addonId: string;
  kind: AddonActionKind;
  phase: AddonActionPhase;
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
  onMarkAllAnnouncementsRead,
  onClearAnnouncements,
  unreadMailCount = 0,
  openMailTab = false,
  onMailTabOpened,
  onUpdateOrderItems,
  onComparePlans,
  activeShift,
  onOpenShiftModal,
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
  const [qrOrderView, setQrOrderView] = useState<'grid' | 'list'>('list');
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
  const [tablesideOrderSettings, setTablesideOrderSettings] = useState<{ autoApprove: boolean; autoPrint: boolean }>(() => {
    const dbSaved = restaurant.settings?.tablesideOrderSettings;
    if (dbSaved && typeof dbSaved === 'object') return { ...{ autoApprove: true, autoPrint: false }, ...dbSaved };
    const saved = localStorage.getItem(`tableside_order_settings_${restaurant.id}`);
    return saved ? JSON.parse(saved) : { autoApprove: true, autoPrint: false };
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
  const [addonFeatureTab, setAddonFeatureTab] = useState<'AVAILABLE' | 'UPCOMING'>('AVAILABLE');
  const [addonActionState, setAddonActionState] = useState<AddonActionState | null>(null);
  const [addonPendingUninstallId, setAddonPendingUninstallId] = useState<string | null>(null);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'grid-6' | 'list'>('grid-5');
  const [mobileMenuLayout, setMobileMenuLayout] = useState<'2' | '3' | 'list'>('3');
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posRemark, setPosRemark] = useState('');
  const [posTableNo, setPosTableNo] = useState('Counter');
  const [posDiningType, setPosDiningType] = useState('Dine-in');
  const [savedBills, setSavedBills] = useState<SavedBillEntry[]>(() => {
    const saved = localStorage.getItem(`saved_bills_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeSavedBillTable, setActiveSavedBillTable] = useState<string | null>(null);
  const [showSaveBillTableModal, setShowSaveBillTableModal] = useState(false);
  const [pendingSaveBillSource, setPendingSaveBillSource] = useState<'COUNTER' | 'QR' | null>(null);
  const [tableModalMode, setTableModalMode] = useState<TableModalMode | null>(null);
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

  // Printer Settings State (Loyverse-style)
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [realPrinterConnected, setRealPrinterConnected] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);
  const [selectedReportOrder, setSelectedReportOrder] = useState<Order | null>(null);

  // Loyverse-style printer config
  const [savedPrinters, setSavedPrinters] = useState<SavedPrinter[]>(() => {
    const dbSaved = restaurant.settings?.printers;
    if (Array.isArray(dbSaved) && dbSaved.length > 0) return dbSaved as SavedPrinter[];
    const saved = localStorage.getItem(`printers_${restaurant.id}`);
    return saved ? JSON.parse(saved) : [];
  });

  const normalizeReceiptConfig = (config: Partial<ReceiptConfig> | null | undefined): ReceiptConfig => {
    const legacyAddress = typeof (config as (Partial<ReceiptConfig> & { businessAddress?: string }) | null | undefined)?.businessAddress === 'string'
      ? (config as (Partial<ReceiptConfig> & { businessAddress?: string })).businessAddress
      : '';

    return {
      ...DEFAULT_RECEIPT_CONFIG,
      businessName: restaurant.name,
      ...(config || {}),
      businessAddressLine1: config?.businessAddressLine1 || legacyAddress || '',
      businessAddressLine2: config?.businessAddressLine2 || '',
    };
  };

  const normalizeOrderListConfig = (config: Partial<OrderListConfig> | null | undefined): OrderListConfig => {
    const legacyAddress = typeof (config as (Partial<OrderListConfig> & { businessAddress?: string }) | null | undefined)?.businessAddress === 'string'
      ? (config as (Partial<OrderListConfig> & { businessAddress?: string })).businessAddress
      : '';

    return {
      ...DEFAULT_ORDER_LIST_CONFIG,
      businessName: restaurant.name,
      ...(config || {}),
      businessAddressLine1: config?.businessAddressLine1 || legacyAddress || '',
      businessAddressLine2: config?.businessAddressLine2 || '',
    };
  };

  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(() => {
    const dbSaved = restaurant.settings?.receipt;
    if (dbSaved && typeof dbSaved === 'object') return normalizeReceiptConfig(dbSaved as Partial<ReceiptConfig>);
    const saved = localStorage.getItem(`receipt_config_${restaurant.id}`);
    if (saved) {
      try {
        return normalizeReceiptConfig(JSON.parse(saved));
      } catch {}
    }
    return normalizeReceiptConfig({ businessName: restaurant.name });
  });

  const [orderListConfig, setOrderListConfig] = useState<OrderListConfig>(() => {
    const dbSaved = restaurant.settings?.orderList;
    if (dbSaved && typeof dbSaved === 'object') return normalizeOrderListConfig(dbSaved as Partial<OrderListConfig>);
    const saved = localStorage.getItem(`order_list_config_${restaurant.id}`);
    if (saved) {
      try {
        return normalizeOrderListConfig(JSON.parse(saved));
      } catch {}
    }
    return normalizeOrderListConfig({ businessName: restaurant.name });
  });

  const [kitchenConfig, setKitchenConfig] = useState<KitchenTicketConfig>(() => {
    const dbSaved = restaurant.settings?.kitchenTicket;
    if (dbSaved && typeof dbSaved === 'object') return { ...DEFAULT_KITCHEN_TICKET_CONFIG, ...dbSaved } as KitchenTicketConfig;
    const saved = localStorage.getItem(`kitchen_config_${restaurant.id}`);
    if (saved) try { return { ...DEFAULT_KITCHEN_TICKET_CONFIG, ...JSON.parse(saved) }; } catch {}
    return { ...DEFAULT_KITCHEN_TICKET_CONFIG };
  });

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

  // Fetch staff from database on mount (localStorage is only a cache)
  useEffect(() => {
    const fetchStaff = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, restaurant_id, is_active, email, phone, kitchen_categories')
        .eq('restaurant_id', restaurant.id)
        .in('role', ['CASHIER', 'KITCHEN', 'ORDER_TAKER']);
      if (!error && data) {
        setStaffList(data);
        localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(data));
      }
    };
    fetchStaff();
  }, [restaurant.id]);

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

  // Shift guard: if shift feature is enabled but cashier has no active shift
  const shiftRequired = featureSettings.shiftEnabled && !activeShift;

  // Shift schedules (for record only — not validation)
  interface ShiftScheduleEntry { cashierName: string; startTime: string; endTime: string; }
  const [shiftSchedules, setShiftSchedules] = useState<ShiftScheduleEntry[]>(() => {
    const dbSaved = restaurant.settings?.features?.shiftSchedules;
    if (Array.isArray(dbSaved)) return dbSaved;
    return [];
  });
  const [newScheduleCashier, setNewScheduleCashier] = useState('');
  const [newScheduleStart, setNewScheduleStart] = useState('');
  const [newScheduleEnd, setNewScheduleEnd] = useState('');

  const saveShiftSchedules = (schedules: ShiftScheduleEntry[]) => {
    setShiftSchedules(schedules);
    const currentSettings = (() => {
      try {
        const cached = localStorage.getItem(`qs_settings_${restaurant.id}`);
        return cached ? JSON.parse(cached) : {};
      } catch { return {}; }
    })();
    const newSettings = {
      ...currentSettings,
      features: { ...(currentSettings.features || {}), shiftSchedules: schedules },
    };
    localStorage.setItem(`qs_settings_${restaurant.id}`, JSON.stringify(newSettings));
    fetch(`/api/settings?restaurantId=${restaurant.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: newSettings }),
    }).catch(() => {});
  };

  const [tableCountDraft, setTableCountDraft] = useState<string>('20');
  const [tableRowsDraft, setTableRowsDraft] = useState<string>('4');
  const [tableColumnsDraft, setTableColumnsDraft] = useState<string>('5');
  const [floorCountDraft, setFloorCountDraft] = useState<string>(String(featureSettings.floorCount || 1));
  const [tableColPage, setTableColPage] = useState(0);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [modalSelectedFloor, setModalSelectedFloor] = useState(1);
  const tableSwipeStartX = useRef<number | null>(null);

  // Payment types
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>(() => {
    const dbSaved = restaurant.settings?.paymentTypes;
    if (Array.isArray(dbSaved)) return normalizePaymentTypes(dbSaved);
    const saved = localStorage.getItem(`payment_types_${restaurant.id}`);
    if (saved) {
      try {
        return normalizePaymentTypes(JSON.parse(saved));
      } catch {}
    }
    return getDefaultPaymentTypes();
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
  const [isQrGeneratorRedirecting, setIsQrGeneratorRedirecting] = useState<boolean>(false);
  const qrLogoInputRef = useRef<HTMLInputElement>(null);

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
  const [showPaymentAmountKeypad, setShowPaymentAmountKeypad] = useState(false);
  const [paymentAmountKeypadInput, setPaymentAmountKeypadInput] = useState<string>('');
  const [keypadFreshEntry, setKeypadFreshEntry] = useState(true);
  const [showCollectAmountKeypad, setShowCollectAmountKeypad] = useState(false);
  const [collectAmountKeypadInput, setCollectAmountKeypadInput] = useState<string>('');
  const [collectKeypadFreshEntry, setCollectKeypadFreshEntry] = useState(true);
  const enabledPaymentTypes = useMemo(() => paymentTypes.filter((type) => type.enabled), [paymentTypes]);
  const paymentMethodButtons = useMemo(() => enabledPaymentTypes.slice(0, 3), [enabledPaymentTypes]);
  const availableDiningOptions = useMemo(() => {
    const options: string[] = [];
    if (featureSettings.dineInEnabled) options.push('Dine-in');
    if (featureSettings.takeawayEnabled) options.push('Takeaway');
    if (featureSettings.deliveryEnabled) options.push('Delivery');
    return options.length > 0 ? options : ['Dine-in'];
  }, [featureSettings.dineInEnabled, featureSettings.takeawayEnabled, featureSettings.deliveryEnabled]);
  const preferredDiningOption = useMemo(() => {
    return availableDiningOptions.includes('Dine-in') ? 'Dine-in' : availableDiningOptions[0];
  }, [availableDiningOptions]);

  const roundUpToUnit = (amount: number, unit: number) => Math.ceil(amount / unit) * unit;
  const getCashQuickSelectAmounts = (rawTotal: number) => {
    const total = Math.max(0, rawTotal || 0);
    const hasCents = Math.abs(total - Math.round(total)) > 0.0001;
    const nearestPractical = total <= 0 ? 5 : hasCents ? roundUpToUnit(total, 5) : Math.ceil(total);
    const nearestTen = roundUpToUnit(total, 10);
    const tier2 = nearestTen > nearestPractical ? nearestTen : nearestPractical + 10;
    const tier3 = total <= 50 ? 50 : total <= 100 ? 100 : roundUpToUnit(total, 50);
    const tier4 = total <= 100 ? 100 : roundUpToUnit(total, 100);

    const suggestions: number[] = [];
    const pushUnique = (value: number) => {
      const normalized = Math.max(0, Math.round(value));
      if (!suggestions.includes(normalized)) suggestions.push(normalized);
    };

    pushUnique(nearestPractical);
    pushUnique(tier2);
    pushUnique(tier3);
    pushUnique(tier4);

    while (suggestions.length < 4) {
      const last = suggestions[suggestions.length - 1] ?? nearestPractical;
      const next = last < 100 ? last + 10 : last + 50;
      pushUnique(next);
    }

    return suggestions.slice(0, 4);
  };

  const paymentQuickSelectAmounts = useMemo(() => {
    const totalDue = typeof pendingOrderData?.total === 'number' ? pendingOrderData.total : 0;
    return getCashQuickSelectAmounts(totalDue);
  }, [pendingOrderData?.total]);
  const collectQuickSelectAmounts = useMemo(() => {
    const totalDue = typeof selectedReportOrder?.total === 'number' ? selectedReportOrder.total : 0;
    return getCashQuickSelectAmounts(totalDue);
  }, [selectedReportOrder?.total]);

  const sanitizeAmountInput = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    const normalized = firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
    if (!normalized.includes('.')) return normalized;
    const [whole, decimal = ''] = normalized.split('.');
    return `${whole}.${decimal.slice(0, 2)}`;
  };

  const applyPaymentAmountInput = (value: string) => {
    const next = sanitizeAmountInput(value);
    setCashAmountInput(next);
    if (next === '' || next === '.') {
      setSelectedCashAmount(null);
      return;
    }
    const parsed = parseFloat(next);
    if (!isNaN(parsed)) setSelectedCashAmount(parsed);
  };

  const openPaymentAmountKeypad = () => {
    setPaymentAmountKeypadInput(cashAmountInput);
    setKeypadFreshEntry(true);
    setShowPaymentAmountKeypad(true);
  };

  const appendPaymentKeypadValue = (token: string) => {
    if (keypadFreshEntry) {
      setPaymentAmountKeypadInput(sanitizeAmountInput(token));
      setKeypadFreshEntry(false);
    } else {
      setPaymentAmountKeypadInput((prev) => sanitizeAmountInput(`${prev}${token}`));
    }
  };

  const backspacePaymentKeypadValue = () => {
    setKeypadFreshEntry(false);
    setPaymentAmountKeypadInput((prev) => prev.slice(0, -1));
  };

  const savePaymentAmountFromKeypad = () => {
    const next = sanitizeAmountInput(paymentAmountKeypadInput);
    applyPaymentAmountInput(next);
    if (next !== '' && next !== '.') {
      const parsed = parseFloat(next);
      if (!isNaN(parsed)) {
        const rounded = parseFloat(parsed.toFixed(2));
        setSelectedCashAmount(rounded);
        setCashAmountInput(rounded.toFixed(2));
      }
    }
    setShowPaymentAmountKeypad(false);
  };

  useEffect(() => {
    if (!showPaymentModal) {
      setShowPaymentAmountKeypad(false);
      setPaymentAmountKeypadInput('');
    }
  }, [showPaymentModal]);

  const openCollectAmountKeypad = () => {
    setCollectAmountKeypadInput(collectCashAmountInput);
    setCollectKeypadFreshEntry(true);
    setShowCollectAmountKeypad(true);
  };

  const appendCollectKeypadValue = (token: string) => {
    if (collectKeypadFreshEntry) {
      setCollectAmountKeypadInput(sanitizeAmountInput(token));
      setCollectKeypadFreshEntry(false);
    } else {
      setCollectAmountKeypadInput((prev) => sanitizeAmountInput(`${prev}${token}`));
    }
  };

  const backspaceCollectKeypadValue = () => {
    setCollectKeypadFreshEntry(false);
    setCollectAmountKeypadInput((prev) => prev.slice(0, -1));
  };

  const saveCollectAmountFromKeypad = () => {
    const next = sanitizeAmountInput(collectAmountKeypadInput);
    if (next !== '' && next !== '.') {
      const parsed = parseFloat(next);
      if (!isNaN(parsed)) {
        const rounded = parseFloat(parsed.toFixed(2));
        setCollectCashAmount(rounded);
        setCollectCashAmountInput(rounded.toFixed(2));
      }
    } else {
      setCollectCashAmount(null);
      setCollectCashAmountInput('');
    }
    setShowCollectAmountKeypad(false);
  };

  useEffect(() => {
    if (!showCollectPaymentSidebar) {
      setShowCollectAmountKeypad(false);
      setCollectAmountKeypadInput('');
    }
  }, [showCollectPaymentSidebar]);

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
    setMenuEditorStuck(false);
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
    setMenuEditorStuck(false);
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
    setMenuEditorStuck(false);
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
    const trimmedImage = (formItem.image || '').trim();
    const hasCustomImage = Boolean(trimmedImage) && !trimmedImage.startsWith(MENU_ITEM_PLACEHOLDER_IMAGE_PREFIX);
    const resolvedTileColor = hasCustomImage
      ? (formItem.color || undefined)
      : (formItem.color || MENU_ITEM_DEFAULT_TILE_COLOR);
    const payload: MenuItem = {
      id: editingItem?.id || crypto.randomUUID(),
      name: formItem.name.trim(),
      description: (formItem.description || '').trim(),
      price: Number(formItem.price || 0),
      image: hasCustomImage ? trimmedImage : '',
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
      color: resolvedTileColor,
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

  useEffect(() => {
    if (activeTab !== 'MENU_EDITOR' || isFormModalOpen) {
      setMenuEditorStuck(false);
      return;
    }

    const el = menuEditorStickyRef.current;
    if (!el) {
      setMenuEditorStuck(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setMenuEditorStuck(entry.intersectionRatio < 1),
      { threshold: [1], rootMargin: '-1px 0px 0px 0px' }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      setMenuEditorStuck(false);
    };
  }, [activeTab, menuSubTab, isFormModalOpen]);

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

  const getItemsSubtotal = (items: CartItem[]): number => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const getItemsGrandTotal = (items: CartItem[]): number => {
    const subtotal = getItemsSubtotal(items);
    const taxAmount = activeTaxEntries.reduce((sum, tax) => sum + ((subtotal * tax.percentage) / 100), 0);
    return subtotal + taxAmount;
  };

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

  const selectedSavedBillEntry = useMemo(() => {
    if (!activeSavedBillTable) return null;
    return savedBillsByTable.get(activeSavedBillTable) ?? null;
  }, [activeSavedBillTable, savedBillsByTable]);

  const selectedSavedBillSubtotal = useMemo(() => {
    if (!selectedSavedBillEntry) return 0;
    return getItemsSubtotal(selectedSavedBillEntry.items);
  }, [selectedSavedBillEntry]);

  const selectedSavedBillTaxLines = useMemo(() => {
    return activeTaxEntries.map(tax => ({
      id: tax.id,
      name: tax.name,
      percentage: tax.percentage,
      amount: (selectedSavedBillSubtotal * tax.percentage) / 100,
    }));
  }, [activeTaxEntries, selectedSavedBillSubtotal]);

  const selectedSavedBillTaxTotal = useMemo(() => {
    return selectedSavedBillTaxLines.reduce((sum, tax) => sum + tax.amount, 0);
  }, [selectedSavedBillTaxLines]);

  const selectedSavedBillGrandTotal = useMemo(() => {
    return selectedSavedBillSubtotal + selectedSavedBillTaxTotal;
  }, [selectedSavedBillSubtotal, selectedSavedBillTaxTotal]);

  const getFloorFromTableLabel = (tableNumber: string): number => {
    if (!featureSettings.floorEnabled || effectiveFloorCount <= 1) return 1;
    const match = /^F(\d+)-/i.exec(tableNumber.trim());
    if (!match) return 1;
    const floor = Number(match[1]);
    if (!Number.isInteger(floor)) return 1;
    return Math.min(Math.max(floor, 1), effectiveFloorCount);
  };

  const isCounterTableValue = (tableNumber: string): boolean => {
    const normalized = tableNumber.trim().toLowerCase();
    return normalized === '' || normalized === 'counter';
  };

  const saveBillToTable = (source: 'COUNTER' | 'QR', tableNumber: string): boolean => {
    const targetTable = tableNumber.trim() || tableLabels[0] || 'Table 1';
    const now = Date.now();

    const entry: SavedBillEntry | null = source === 'COUNTER'
      ? {
          id: `${now}`,
          items: posCart,
          remark: posRemark,
          tableNumber: targetTable,
          diningType: posDiningType,
          createdAt: now,
        }
      : (selectedQrOrderForPayment
          ? {
              id: `${now}`,
              items: selectedQrOrderForPayment.items,
              remark: selectedQrOrderForPayment.remark ?? '',
              tableNumber: targetTable,
              diningType: selectedQrOrderForPayment.diningType,
              createdAt: now,
            }
          : null);

    if (!entry) return false;

    setSavedBills(prev => {
      const withoutSameTable = prev.filter(bill => bill.tableNumber !== targetTable);
      return [entry, ...withoutSameTable];
    });
    setActiveSavedBillTable(targetTable);

    if (source === 'COUNTER') {
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
      setPosDiningType(preferredDiningOption);
    } else {
      setSelectedQrOrderForPayment(null);
    }

    setCounterMode('SAVED_BILL');
    toast(`Bill saved to ${targetTable}.`, 'success');
    return true;
  };

  const openSaveBillTableModal = (source: 'COUNTER' | 'QR', preferredTable?: string) => {
    const fallbackTable = tableLabels[0] || 'Table 1';
    const defaultTable = preferredTable?.trim() || fallbackTable;
    setTableModalMode('SAVE_BILL');
    setPendingSaveBillSource(source);
    setSelectedSaveTableNumber(defaultTable);
    setModalSelectedFloor(getFloorFromTableLabel(defaultTable));
    setShowSaveBillTableModal(true);
  };

  const openCounterTablePicker = () => {
    const fallbackTable = tableLabels[0] || 'Table 1';
    const defaultTable = !isCounterTableValue(posTableNo) ? posTableNo.trim() : fallbackTable;
    setTableModalMode('COUNTER_PICK');
    setPendingSaveBillSource(null);
    setSelectedSaveTableNumber(defaultTable);
    setModalSelectedFloor(getFloorFromTableLabel(defaultTable));
    setShowSaveBillTableModal(true);
  };

  const startSaveBillFlow = (source: 'COUNTER' | 'QR') => {
    if (source === 'COUNTER' && posCart.length === 0) {
      toast('Cart is empty. Add items before saving bill.', 'warning');
      return;
    }
    if (source === 'QR' && !selectedQrOrderForPayment) {
      toast('Select a QR order first.', 'warning');
      return;
    }

    if (source === 'COUNTER') {
      const currentCounterTable = posTableNo?.trim() || '';
      if (!isCounterTableValue(currentCounterTable)) {
        saveBillToTable('COUNTER', currentCounterTable);
        return;
      }
      openSaveBillTableModal('COUNTER', tableLabels[0] || 'Table 1');
      return;
    }

    const defaultTable = selectedQrOrderForPayment?.tableNumber?.trim() || tableLabels[0] || 'Table 1';
    openSaveBillTableModal('QR', defaultTable);
  };

  const closeSaveBillTableModal = () => {
    setShowSaveBillTableModal(false);
    setPendingSaveBillSource(null);
    setTableModalMode(null);
  };

  const clearSavedBillByTable = (tableNumber: string) => {
    setSavedBills(prev => prev.filter(bill => bill.tableNumber !== tableNumber));
  };

  const handleSaveBillModalTableClick = (tableNumber: string) => {
    setSelectedSaveTableNumber(tableNumber);

    if (tableModalMode === 'COUNTER_PICK') {
      setPosTableNo(tableNumber);
      closeSaveBillTableModal();
      toast(`Table set to ${tableNumber}.`, 'success');
    }
  };

  const confirmSaveBillToTable = () => {
    const targetTable = selectedSaveTableNumber || tableLabels[0] || 'Table 1';

    if (tableModalMode === 'COUNTER_PICK') {
      setPosTableNo(targetTable);
      closeSaveBillTableModal();
      toast(`Table set to ${targetTable}.`, 'success');
      return;
    }

    if (!pendingSaveBillSource) return;
    const isSaved = saveBillToTable(pendingSaveBillSource, targetTable);
    if (!isSaved) return;
    closeSaveBillTableModal();
  };

  const saveCurrentBill = () => {
    startSaveBillFlow('COUNTER');
  };

  const handleSavedBillCheckout = () => {
    if (!selectedSavedBillEntry || isCompletingPayment) return;

    setPendingOrderData({
      items: selectedSavedBillEntry.items,
      remark: selectedSavedBillEntry.remark,
      tableNumber: selectedSavedBillEntry.tableNumber,
      diningType: selectedSavedBillEntry.diningType || preferredDiningOption,
      total: selectedSavedBillGrandTotal,
    });
    setSelectedCashAmount(selectedSavedBillGrandTotal);
    setCashAmountInput(selectedSavedBillGrandTotal.toFixed(2));
    setSelectedPaymentType(getPreferredPaymentTypeId(paymentTypes));
    setIsQrPaymentMode(false);
    setShowPaymentModal(true);
  };

  const loadSavedBill = (tableNumber: string) => {
    const selectedBill = savedBillsByTable.get(tableNumber);
    if (!selectedBill) return;

    setPosCart(selectedBill.items);
    setPosRemark(selectedBill.remark);
    setPosTableNo(selectedBill.tableNumber);
    setPosDiningType(selectedBill.diningType || preferredDiningOption);
    setActiveSavedBillTable(tableNumber);
    setCounterMode('COUNTER_ORDER');
    toast(`${tableNumber} bill loaded into counter.`, 'success');
  };

  const saveSelectedQrOrderAsBill = () => {
    startSaveBillFlow('QR');
  };

  const handleCheckout = async () => {
    if (posCart.length === 0 || isCompletingPayment) return;

    // Block checkout if shift is required but not active
    if (shiftRequired) {
      toast('Please open your shift before completing a payment.', 'error');
      return;
    }

    // Store the pending order data and show payment modal
    setPendingOrderData({
      items: posCart,
      remark: posRemark,
      tableNumber: posTableNo,
      diningType: posDiningType,
      total: cartGrandTotal,
    });
    
    setSelectedCashAmount(cartGrandTotal);
    setCashAmountInput(cartGrandTotal.toFixed(2));
    setSelectedPaymentType(getPreferredPaymentTypeId(paymentTypes));
    setIsQrPaymentMode(false);
    setShowPaymentModal(true);
  };

  const handleEditQrOrder = (order: Order) => {
    setPosCart(order.items as CartItem[]);
    setPosTableNo(order.tableNumber || 'Counter');
    setPosRemark(order.remark || '');
    setPosDiningType(order.diningType || preferredDiningOption);
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
      setPosDiningType(preferredDiningOption);
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
      diningType: selectedQrOrderForPayment.diningType,
      total: selectedQrGrandTotal,
    });
    setSelectedCashAmount(selectedQrGrandTotal);
    setCashAmountInput(selectedQrGrandTotal.toFixed(2));
    setSelectedPaymentType(getPreferredPaymentTypeId(paymentTypes));
    setIsQrPaymentMode(true);
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrderData || !selectedPaymentType) return;

    // Block payment if shift is required but not active
    if (shiftRequired) {
      toast('Please open your shift before completing a payment.', 'error');
      return;
    }

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
        diningType: selectedQrOrderForPayment.diningType,
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
        actualOrderId = await onPlaceOrder(
          pendingOrderData.items,
          pendingOrderData.remark,
          pendingOrderData.tableNumber,
          pendingOrderData.diningType,
          paymentName,
          cashierName,
          selectedCashAmount ?? undefined
        );
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
        diningType: pendingOrderData.diningType,
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
      diningType: pendingOrderData.diningType,
      timestamp: isQrPaymentMode && selectedQrOrderForPayment ? selectedQrOrderForPayment.timestamp : nowTs,
      total: pendingOrderData.total,
      items: pendingOrderData.items,
      remark: pendingOrderData.remark,
      paymentMethod: paymentName,
      cashierName: cashierName || '',
      amountReceived: selectedCashAmount ?? undefined,
      changeAmount: selectedCashAmount != null ? Math.max(0, selectedCashAmount - pendingOrderData.total) : undefined,
      orderSource: isQrPaymentMode ? (selectedQrOrderForPayment?.orderSource || 'qr_order') : 'counter',
    };

    // Show payment result with slide animation
    setShowPaymentResult(true);
    setIsCompletingPayment(false);

    if (receiptConfig.autoPrintAfterSale) {
      if (connectedDevice) {
        const printRestaurant = {
          ...restaurant,
          name: receiptConfig.businessName.trim() || restaurant.name,
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
    } else if (receiptConfig.openCashDrawerOnPayment) {
      if (connectedDevice) {
        printerService
          .openDrawer()
          .then((drawerSuccess) => {
            if (!drawerSuccess) {
              setCheckoutNotice('Order saved. Cash drawer could not be opened.');
            }
          })
          .catch((drawerError: any) => {
            console.error('Cash drawer open error:', drawerError);
            const errorMsg = drawerError?.message || 'Failed to open cash drawer';
            setCheckoutNotice(`Order saved. ${errorMsg}`);
          });
      } else {
        setCheckoutNotice('Order saved. Cash drawer is enabled but no printer is connected.');
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
      setPosDiningType(preferredDiningOption);
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
    const nonCancelled = filtered.filter(o => o.status !== OrderStatus.CANCELLED);

    const txMap: Record<string, { count: number; total: number }> = {};
    nonCancelled.forEach(o => {
      const method = o.paymentMethod || '-';
      if (!txMap[method]) txMap[method] = { count: 0, total: 0 };
      txMap[method].count += 1;
      txMap[method].total += o.total;
    });
    const byTransactionType = Object.entries(txMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);

    const cashierMap: Record<string, { count: number; total: number }> = {};
    nonCancelled.forEach(o => {
      const name = o.cashierName || '-';
      if (!cashierMap[name]) cashierMap[name] = { count: 0, total: 0 };
      cashierMap[name].count += 1;
      cashierMap[name].total += o.total;
    });
    const byCashier = Object.entries(cashierMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.total - a.total);

    const summary = {
      totalRevenue: completedOrders.reduce((sum, o) => sum + o.total, 0),
      orderVolume: filtered.length,
      efficiency: filtered.length > 0
        ? Math.round((completedOrders.length / filtered.length) * 100)
        : 0,
      byTransactionType,
      byCashier,
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
        setReceiptConfig(prev => normalizeReceiptConfig({ ...prev, ...serverSettings.receipt }));
      }
      if (serverSettings.orderList && typeof serverSettings.orderList === 'object') {
        setOrderListConfig(prev => normalizeOrderListConfig({ ...prev, ...serverSettings.orderList }));
      }
      if (serverSettings.kitchenTicket && typeof serverSettings.kitchenTicket === 'object') {
        setKitchenConfig(prev => ({ ...prev, ...serverSettings.kitchenTicket }));
      }
      if (Array.isArray(serverSettings.paymentTypes)) {
        setPaymentTypes(normalizePaymentTypes(serverSettings.paymentTypes));
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
      if (serverSettings.qrOrderSettings && typeof serverSettings.qrOrderSettings === 'object') {
        setQrOrderSettings(prev => ({ ...prev, ...serverSettings.qrOrderSettings }));
      }
      if (serverSettings.tablesideOrderSettings && typeof serverSettings.tablesideOrderSettings === 'object') {
        setTablesideOrderSettings(prev => ({ ...prev, ...serverSettings.tablesideOrderSettings }));
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
                dining_type: order.diningType || null,
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
    const savedPrinter = localStorage.getItem(`printer_${restaurant.id}`);
    if (savedPrinter) {
      try {
        const printer = JSON.parse(savedPrinter);
        setConnectedDevice(printer);
        setIsAutoReconnecting(true);
        printerService.autoReconnect(printer.name).then((success) => {
          setRealPrinterConnected(success);
          setIsAutoReconnecting(false);
        }).catch(() => {
          setRealPrinterConnected(false);
          setIsAutoReconnecting(false);
        });
      } catch (error) {
        console.error('Failed to load saved printer', error);
      }
    }
  }, [restaurant.id]);

  // Load order code from restaurant settings
  useEffect(() => {
    const saved = restaurant.settings?.orderCode || '';
    setOrderCode(saved);
  }, [restaurant.id, restaurant.settings?.orderCode]);

  useEffect(() => {
    localStorage.setItem(`receipt_config_${restaurant.id}`, JSON.stringify(receiptConfig));
  }, [receiptConfig, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`order_list_config_${restaurant.id}`, JSON.stringify(orderListConfig));
  }, [orderListConfig, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`kitchen_config_${restaurant.id}`, JSON.stringify(kitchenConfig));
  }, [kitchenConfig, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`printers_${restaurant.id}`, JSON.stringify(savedPrinters));
  }, [savedPrinters, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`features_${restaurant.id}`, JSON.stringify(featureSettings));
  }, [featureSettings, restaurant.id]);

  useEffect(() => {
    localStorage.setItem(`payment_types_${restaurant.id}`, JSON.stringify(paymentTypes));
  }, [paymentTypes, restaurant.id]);

  useEffect(() => {
    if (selectedPaymentType && enabledPaymentTypes.some((type) => type.id === selectedPaymentType)) return;
    setSelectedPaymentType(getPreferredPaymentTypeId(enabledPaymentTypes));
  }, [enabledPaymentTypes, selectedPaymentType]);

  useEffect(() => {
    if (collectPaymentType && enabledPaymentTypes.some((type) => type.id === collectPaymentType)) return;
    setCollectPaymentType(getFirstEnabledPaymentTypeId(enabledPaymentTypes));
  }, [enabledPaymentTypes, collectPaymentType]);

  useEffect(() => {
    if (availableDiningOptions.includes(posDiningType)) return;
    setPosDiningType(preferredDiningOption);
  }, [availableDiningOptions, preferredDiningOption, posDiningType]);

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

  // Periodically check real Bluetooth printer connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const connected = printerService.isConnected();
      setRealPrinterConnected(connected);
    }, 3000);
    return () => clearInterval(interval);
  }, [connectedDevice]);

  const handlePrinterButtonClick = async () => {
    if (!connectedDevice) {
      // No saved printer - scan and connect in one go
      setIsAutoReconnecting(true);
      const found = await printerService.scanForPrinters();
      if (found.length > 0) {
        const device = found[0];
        const success = await printerService.connect(device.name);
        if (success) {
          setConnectedDevice(device);
          setRealPrinterConnected(true);
          localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
          await supabase
            .from('restaurants')
            .update({ printer_settings: { connected: true, deviceId: device.id, deviceName: device.name } })
            .eq('id', restaurant.id);
        }
      }
      setIsAutoReconnecting(false);
      return;
    }
    if (realPrinterConnected) return;
    // Has saved printer but disconnected - try reconnect
    setIsAutoReconnecting(true);
    const success = await printerService.autoReconnect(connectedDevice.name);
    if (success) {
      setRealPrinterConnected(true);
    } else {
      const pickSuccess = await printerService.connect(connectedDevice.name);
      setRealPrinterConnected(pickSuccess);
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

  const isAddonActionRunning = (addonId: string, kind: AddonActionKind): boolean => (
    addonActionState?.addonId === addonId
      && addonActionState.kind === kind
      && addonActionState.phase === 'running'
  );

  const isAddonActionDone = (addonId: string, kind: AddonActionKind): boolean => (
    addonActionState?.addonId === addonId
      && addonActionState.kind === kind
      && addonActionState.phase === 'done'
  );

  const runAddonActionWithEffect = async (
    addonId: string,
    addonName: string,
    kind: AddonActionKind,
    action: (() => void | Promise<void>) | null | undefined,
  ) => {
    if (!action) return;
    if (isAddonActionRunning(addonId, kind)) return;

    const minimumRunningDuration = 700;
    const startedAt = Date.now();
    setAddonActionState({ addonId, kind, phase: 'running' });

    try {
      await Promise.resolve(action());
    } catch (error) {
      console.error(`Failed to ${kind} ${addonName}:`, error);
      toast(`Failed to ${kind} ${addonName}.`, 'error');
      setAddonActionState(null);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const waitMs = Math.max(0, minimumRunningDuration - elapsed);

    setTimeout(() => {
      setAddonActionState((prev) => {
        if (!prev || prev.addonId !== addonId || prev.kind !== kind) return prev;
        return { ...prev, phase: 'done' };
      });
    }, waitMs);

    setTimeout(() => {
      setAddonActionState((prev) => {
        if (!prev || prev.addonId !== addonId || prev.kind !== kind || prev.phase !== 'done') return prev;
        return null;
      });
    }, waitMs + 900);
  };

  useEffect(() => {
    setAddonPendingUninstallId(null);
  }, [addonDetailView]);

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
      enabled: true,
    };
    setPaymentTypes(prev => [...prev, newType]);
    setNewPaymentTypeName('');
  };

  const handleTogglePaymentType = (id: string) => {
    setPaymentTypes(prev => prev.map(pt => pt.id === id ? { ...pt, enabled: !pt.enabled } : pt));
  };

  const handleRemovePaymentType = (id: string) => {
    if (NON_REMOVABLE_PAYMENT_TYPE_IDS.has(id)) return;
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
    return {
      showDateTime: receiptConfig.showDateTime,
      showOrderId: receiptConfig.showOrderNumber,
      showTableNumber: receiptConfig.showTableNumber,
      showItems: receiptConfig.showItems,
      showRemark: receiptConfig.showRemark,
      showTotal: receiptConfig.showTotal,
      headerText: receiptConfig.headerText,
      footerText: receiptConfig.footerText,
      businessAddressLine1: receiptConfig.businessAddressLine1,
      businessAddressLine2: receiptConfig.businessAddressLine2,
      businessPhone: receiptConfig.businessPhone,
      autoOpenDrawer: receiptConfig.openCashDrawerOnPayment,
      paperSize: printer?.paperSize || '58mm',
      printDensity: printer?.printDensity || 'medium',
      autoCut: printer?.autoCut ?? true,
      showOrderSource: receiptConfig.showOrderSource,
      showCashierName: receiptConfig.showCashierName,
      cashierName: cashierName || '',
      showAmountReceived: receiptConfig.showAmountReceived,
      showChange: receiptConfig.showChange,
      showTaxes: receiptConfig.showTaxes,
      taxes: taxEntries.map(t => ({ name: t.name, amount: t.percentage })),
      titleSize: receiptConfig.titleSize,
      titleFont: receiptConfig.titleFont,
      titleAlignment: receiptConfig.titleAlignment,
      headerSize: receiptConfig.headerSize,
      headerFont: receiptConfig.headerFont,
      headerAlignment: receiptConfig.headerAlignment,
      footerSize: receiptConfig.footerSize,
      footerFont: receiptConfig.footerFont,
      footerAlignment: receiptConfig.footerAlignment,
    };
  };

  const getOrderListPrintOptions = (): ReceiptPrintOptions => {
    const printer = savedPrinters.length > 0 ? savedPrinters[0] : null;
    return {
      showDateTime: orderListConfig.showDateTime,
      showOrderId: orderListConfig.showOrderNumber,
      showTableNumber: orderListConfig.showTableNumber,
      showItems: orderListConfig.showItems,
      showItemPrice: orderListConfig.showItemPrice,
      showRemark: orderListConfig.showRemark,
      showTotal: orderListConfig.showTotal,
      showPaymentMethod: orderListConfig.showPaymentMethod,
      headerText: orderListConfig.headerText,
      footerText: orderListConfig.footerText,
      businessAddressLine1: orderListConfig.businessAddressLine1,
      businessAddressLine2: orderListConfig.businessAddressLine2,
      businessPhone: orderListConfig.businessPhone,
      autoOpenDrawer: false,
      paperSize: printer?.paperSize || '58mm',
      printDensity: printer?.printDensity || 'medium',
      autoCut: printer?.autoCut ?? true,
      showOrderSource: orderListConfig.showOrderSource,
      showCashierName: orderListConfig.showCashierName,
      cashierName: cashierName || '',
      showAmountReceived: false,
      showChange: false,
      showTaxes: false,
      titleSize: orderListConfig.titleSize,
      titleFont: orderListConfig.titleFont,
      titleAlignment: orderListConfig.titleAlignment,
      headerSize: orderListConfig.headerSize,
      headerFont: orderListConfig.headerFont,
      headerAlignment: orderListConfig.headerAlignment,
      footerSize: orderListConfig.footerSize,
      footerFont: orderListConfig.footerFont,
      footerAlignment: orderListConfig.footerAlignment,
    };
  };

  const handleDownloadReport = async () => {
    const allOrders = await fetchReport(true) as Order[];
    if (!allOrders || allOrders.length === 0) return;
    const headers = ['Order ID', 'Table', 'Dining Option', 'Date', 'Time', 'Status', 'Payment Method', 'Cashier', 'Items', 'Total'];
    const rows = allOrders.map(o => [
      o.id,
      o.tableNumber,
      o.diningType || '-',
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

  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloadingPDF(true);
    try {
    const allOrders = await fetchReport(true) as Order[];
    if (!allOrders || allOrders.length === 0) { setIsDownloadingPDF(false); return; }
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 14;
    const darkGray = [55, 65, 81] as [number, number, number];
    const amber = [217, 119, 6] as [number, number, number];
    const lightAmber = [254, 243, 199] as [number, number, number];
    const green = [16, 185, 129] as [number, number, number];
    const red = [239, 68, 68] as [number, number, number];
    const blue = [59, 130, 246] as [number, number, number];
    const contentW = pw - margin * 2;

    // Compute analytics from allOrders
    const completed = allOrders.filter(o => o.status === OrderStatus.COMPLETED);
    const cancelled = allOrders.filter(o => o.status === OrderStatus.CANCELLED);
    const pending = allOrders.filter(o => o.status === OrderStatus.PENDING);
    const served = allOrders.filter(o => o.status === OrderStatus.SERVED);
    const ongoing = allOrders.filter(o => o.status === OrderStatus.ONGOING);
    const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
    const avgOrder = completed.length > 0 ? totalRevenue / completed.length : 0;
    const cancelledValue = cancelled.reduce((s, o) => s + o.total, 0);

    // =====================================================
    // PAGE 1: OVERVIEW DASHBOARD
    // =====================================================

    // Header with accent bar
    doc.setFillColor(...amber);
    doc.rect(0, 0, pw, 3, 'F');
    y = 12;
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
    doc.text(restaurant.name || 'Sales Report', margin, y); y += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text(`Report Period: ${reportStart}  to  ${reportEnd}`, margin, y);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pw - margin, y, { align: 'right' }); y += 2;
    doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3); doc.line(margin, y, pw - margin, y); y += 8;

    // Section title helper (no underline)
    const sectionTitle = (title: string) => {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text(title, margin, y);
      y += 7;
    };

    // KPI Cards - 4 cards in a row with border outlines
    sectionTitle('Sales Overview');
    const cardW = (contentW - 6) / 4;
    const cardH = 24;
    const kpiCards = [
      { label: 'Total Revenue', value: `RM ${totalRevenue.toFixed(2)}`, sub: `${completed.length} paid orders`, color: amber },
      { label: 'Total Orders', value: `${allOrders.length}`, sub: `${completed.length} completed`, color: blue },
      { label: 'Avg Order Value', value: `RM ${avgOrder.toFixed(2)}`, sub: 'per completed order', color: green },
      { label: 'Cancelled', value: `${cancelled.length}`, sub: `RM ${cancelledValue.toFixed(2)} lost`, color: red },
    ];
    kpiCards.forEach((card, i) => {
      const cx = margin + i * (cardW + 2);
      // Fill background
      doc.setFillColor(248, 250, 252); doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'F');
      // Border outline
      doc.setDrawColor(...card.color); doc.setLineWidth(0.5); doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'S');
      // Left accent bar
      doc.setFillColor(...card.color); doc.rect(cx + 0.5, y + 3, 1.2, cardH - 6, 'F');
      // Text
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(130, 130, 130);
      doc.text(card.label.toUpperCase(), cx + 4, y + 6);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text(card.value, cx + 4, y + 14);
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
      doc.text(card.sub, cx + 4, y + 19);
    });
    y += cardH + 12;

    // Payment Type Breakdown with visual bars
    const paymentMap: Record<string, { count: number; total: number }> = {};
    completed.forEach(o => {
      const rawMethod = o.paymentMethod || 'Cash';
      // Normalize to UPPERCASE to merge "CASH" / "Cash" / "cash"
      const m = rawMethod.toUpperCase();
      if (!paymentMap[m]) paymentMap[m] = { count: 0, total: 0 };
      paymentMap[m].count += 1; paymentMap[m].total += o.total;
    });
    const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1].total - a[1].total);

    if (paymentEntries.length > 0) {
      sectionTitle('Payment Methods');
      const paymentColors: [number, number, number][] = [
        [217, 119, 6],   // amber
        [59, 130, 246],  // blue
        [16, 185, 129],  // green
        [251, 191, 36],  // yellow
        [239, 68, 68],   // red
      ];
      // Rounded container
      const pmRowH = 10;
      const pmPadTop = 5;
      const pmPadBot = 5;
      const pmContainerH = paymentEntries.length * pmRowH + pmPadTop + pmPadBot;
      doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3);
      doc.setFillColor(252, 252, 253);
      doc.roundedRect(margin, y - 2, contentW, pmContainerH, 3, 3, 'FD');
      y += pmPadTop - 2;

      paymentEntries.forEach(([method, d], idx) => {
        const pct = totalRevenue > 0 ? (d.total / totalRevenue) * 100 : 0;
        const col = paymentColors[idx % paymentColors.length];
        const rowMidY = y + pmRowH / 2;
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
        doc.text(method, margin + 4, rowMidY + 1);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
        doc.text(`${d.count} txns`, margin + 32, rowMidY + 1);
        // Progress bar vertically centered in row
        const barX = margin + 52; const barTotalW = contentW - 72; const barH = 5;
        const barY = rowMidY - barH / 2;
        doc.setFillColor(240, 240, 240); doc.roundedRect(barX, barY, barTotalW, barH, 1, 1, 'F');
        doc.setFillColor(...col); doc.roundedRect(barX, barY, Math.max((pct / 100) * barTotalW, 1), barH, 1, 1, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...col);
        doc.text(`${pct.toFixed(1)}%`, barX + barTotalW + 2, rowMidY + 1);
        y += pmRowH;
      });
      y += pmPadBot + 10;
    }

    // Daily Sales Summary (bar-like visual)
    const dailyMap: Record<string, { orders: number; revenue: number }> = {};
    completed.forEach(o => {
      const day = new Date(o.timestamp).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' });
      if (!dailyMap[day]) dailyMap[day] = { orders: 0, revenue: 0 };
      dailyMap[day].orders += 1; dailyMap[day].revenue += o.total;
    });
    const dailyEntries = Object.entries(dailyMap).sort((a, b) => {
      const da = new Date(a[0] + ', 2024'); const db = new Date(b[0] + ', 2024');
      return da.getTime() - db.getTime();
    });

    // Group daily entries into date ranges if > 14 days
    let displayDailyEntries = dailyEntries;
    if (dailyEntries.length > 14) {
      const groupSize = Math.ceil(dailyEntries.length / 10);
      const grouped: [string, { orders: number; revenue: number }][] = [];
      for (let g = 0; g < dailyEntries.length; g += groupSize) {
        const chunk = dailyEntries.slice(g, g + groupSize);
        const aggregated = { orders: 0, revenue: 0 };
        chunk.forEach(([, d]) => { aggregated.orders += d.orders; aggregated.revenue += d.revenue; });
        const rangeLabel = chunk.length === 1 ? chunk[0][0] : `${chunk[0][0]} - ${chunk[chunk.length - 1][0]}`;
        grouped.push([rangeLabel, aggregated]);
      }
      displayDailyEntries = grouped;
    }

    if (displayDailyEntries.length > 0 && displayDailyEntries.length <= 31) {
      sectionTitle('Daily Sales');
      const chartLeftMargin = 18;
      const chartH = 36;
      const chartW = contentW - chartLeftMargin - 4;
      const chartX = margin + chartLeftMargin;
      const chartY = y + 2;
      const maxDailyRev = Math.max(...displayDailyEntries.map(e => e[1].revenue));

      // Rounded container around the chart area — tightly fit to content
      const dsContainerPadTop = 4;
      const dsContainerPadBot = 10; // room for x-axis labels
      const dsContainerH = dsContainerPadTop + chartH + dsContainerPadBot;
      doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3);
      doc.setFillColor(252, 252, 253);
      doc.roundedRect(margin, chartY - dsContainerPadTop, contentW, dsContainerH, 3, 3, 'FD');

      // Y-axis grid lines & labels (positioned left of chart area)
      doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.1);
      for (let i = 0; i <= 4; i++) {
        const ly = chartY + chartH - (chartH * i / 4);
        doc.line(chartX, ly, chartX + chartW, ly);
        const val = (maxDailyRev * i / 4);
        doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
        doc.text(`RM${Math.round(val)}`, margin + 2, ly + 1.2);
      }

      // Compute points for line chart (starts after Y-axis label area)
      const points = displayDailyEntries.map(([, d], i) => {
        const px = chartX + (i / Math.max(displayDailyEntries.length - 1, 1)) * chartW;
        const py = chartY + chartH - (maxDailyRev > 0 ? (d.revenue / maxDailyRev) * chartH : 0);
        return { x: px, y: py };
      });

      // Generate smooth curve points using Catmull-Rom spline interpolation
      const smoothPoints: {x: number; y: number}[] = [];
      if (points.length <= 2) {
        smoothPoints.push(...points);
      } else {
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          const steps = 12;
          for (let t = 0; t < 1; t += 1 / steps) {
            const t2 = t * t;
            const t3 = t2 * t;
            const sx = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const sy = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            smoothPoints.push({ x: sx, y: sy });
          }
        }
        smoothPoints.push(points[points.length - 1]);
      }

      // Draw filled area under smooth curve (using triangles)
      const baseY = chartY + chartH;
      doc.setFillColor(217, 119, 6); doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
      for (let i = 0; i < smoothPoints.length - 1; i++) {
        doc.triangle(smoothPoints[i].x, smoothPoints[i].y, smoothPoints[i + 1].x, smoothPoints[i + 1].y, smoothPoints[i].x, baseY, 'F');
        doc.triangle(smoothPoints[i + 1].x, smoothPoints[i + 1].y, smoothPoints[i + 1].x, baseY, smoothPoints[i].x, baseY, 'F');
      }
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      // Draw the smooth line
      doc.setDrawColor(...amber); doc.setLineWidth(0.6);
      for (let i = 0; i < smoothPoints.length - 1; i++) {
        doc.line(smoothPoints[i].x, smoothPoints[i].y, smoothPoints[i + 1].x, smoothPoints[i + 1].y);
      }

      // Draw dots on original data points
      points.forEach(p => {
        doc.setFillColor(...amber); doc.circle(p.x, p.y, 0.8, 'F');
      });

      // X-axis date labels — draw dots for all points, labels for selected ones
      const labelInterval = Math.max(1, Math.ceil(displayDailyEntries.length / 8));
      displayDailyEntries.forEach(([day], i) => {
        // Small dot on every data point on the x-axis
        doc.setFillColor(180, 180, 180); doc.circle(points[i].x, chartY + chartH + 1.5, 0.4, 'F');
        if (i % labelInterval === 0 || i === displayDailyEntries.length - 1) {
          doc.setFontSize(4.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(140, 140, 140);
          doc.text(day, points[i].x, chartY + chartH + 5, { align: 'center' });
        }
      });

      // Advance y past the container bottom + section gap
      y = chartY - dsContainerPadTop + dsContainerH + 10;
    }

    // Order Status Breakdown
    sectionTitle('Order Status');
    const statuses = [
      { label: 'Completed', count: completed.length, color: green },
      { label: 'Served', count: served.length, color: blue },
      { label: 'Ongoing', count: ongoing.length, color: amber },
      { label: 'Pending', count: pending.length, color: [251, 191, 36] as [number, number, number] },
      { label: 'Cancelled', count: cancelled.length, color: red },
    ].filter(s => s.count > 0);
    const totalForStatus = allOrders.length;

    // Rounded container
    const osRowH = 10;
    const osPadTop = 5;
    const osPadBot = 5;
    const osContainerH = statuses.length * osRowH + osPadTop + osPadBot;
    doc.setDrawColor(230, 230, 230); doc.setLineWidth(0.3);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(margin, y - 2, contentW, osContainerH, 3, 3, 'FD');
    y += osPadTop - 2;

    statuses.forEach(s => {
      const pct = totalForStatus > 0 ? (s.count / totalForStatus) * 100 : 0;
      const rowMidY = y + osRowH / 2;
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text(`${s.label}`, margin + 4, rowMidY + 1);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
      doc.text(`${s.count} orders`, margin + 32, rowMidY + 1);
      // Progress bar vertically centered in row
      const barX = margin + 52; const barTotalW = contentW - 72; const barH = 5;
      const barY = rowMidY - barH / 2;
      doc.setFillColor(240, 240, 240); doc.roundedRect(barX, barY, barTotalW, barH, 1, 1, 'F');
      doc.setFillColor(...s.color); doc.roundedRect(barX, barY, Math.max((pct / 100) * barTotalW, 1), barH, 1, 1, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...s.color);
      doc.text(`${pct.toFixed(1)}%`, barX + barTotalW + 2, rowMidY + 1);
      y += osRowH;
    });
    y += osPadBot + 10;

    // Cashier Performance (compact overview on page 1)
    const cashierMap: Record<string, { orders: number; revenue: number; cancelled: number }> = {};
    allOrders.forEach(o => {
      const name = o.cashierName || 'Unknown';
      if (!cashierMap[name]) cashierMap[name] = { orders: 0, revenue: 0, cancelled: 0 };
      if (o.status === OrderStatus.CANCELLED) { cashierMap[name].cancelled += 1; }
      else { cashierMap[name].orders += 1; cashierMap[name].revenue += o.total; }
    });
    const cashierEntries = Object.entries(cashierMap).sort((a, b) => b[1].revenue - a[1].revenue);

    if (cashierEntries.length > 0 && y < ph - 50) {
      sectionTitle('Cashier Performance');
      autoTable(doc, {
        startY: y,
        head: [['Cashier', 'Orders', 'Revenue', 'Avg Order', 'Cancelled']],
        body: cashierEntries.map(([name, d]) => [
          name, `${d.orders}`, `RM ${d.revenue.toFixed(2)}`,
          `RM ${(d.orders > 0 ? d.revenue / d.orders : 0).toFixed(2)}`, `${d.cancelled}`
        ]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: lightAmber },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // =====================================================
    // PAGE 2+: DETAILED TABLES
    // =====================================================
    doc.addPage();
    y = 14;
    doc.setFillColor(...amber); doc.rect(0, 0, pw, 3, 'F');

    // Payment Type Detailed Table
    const paymentRows = paymentEntries
      .map(([method, d]) => [method, `${d.count}`, `RM ${d.total.toFixed(2)}`, `${totalRevenue > 0 ? ((d.total / totalRevenue) * 100).toFixed(1) : '0'}%`]);
    if (paymentRows.length > 0) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text('Sales by Payment Type', margin, y); y += 6;
      autoTable(doc, {
        startY: y, head: [['Payment Method', 'Transactions', 'Revenue', '% of Total']], body: paymentRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: lightAmber },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Sales by Item (all items)
    const itemMap: Record<string, { qty: number; revenue: number }> = {};
    completed.forEach(o => o.items.forEach(i => {
      if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0 };
      itemMap[i.name].qty += i.quantity; itemMap[i.name].revenue += i.price * i.quantity;
    }));
    const itemRows = Object.entries(itemMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, d]) => [name, `${d.qty}`, `RM ${d.revenue.toFixed(2)}`, `RM ${(d.qty > 0 ? d.revenue / d.qty : 0).toFixed(2)}`]);
    if (itemRows.length > 0) {
      if (y > 240) { doc.addPage(); y = 14; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text('Sales by Item', margin, y); y += 6;
      autoTable(doc, {
        startY: y, head: [['Item', 'Qty Sold', 'Revenue', 'Avg Price']], body: itemRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 243, 199] },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Sales by Category
    const catMap: Record<string, { items: number; revenue: number; orders: number }> = {};
    completed.forEach(o => {
      const seen = new Set<string>();
      o.items.forEach(i => {
        const cat = i.category || 'Uncategorized';
        if (!catMap[cat]) catMap[cat] = { items: 0, revenue: 0, orders: 0 };
        catMap[cat].items += i.quantity; catMap[cat].revenue += i.price * i.quantity; seen.add(cat);
      });
      seen.forEach(c => { catMap[c].orders += 1; });
    });
    const catRows = Object.entries(catMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, d]) => [name, `${d.items}`, `${d.orders}`, `RM ${d.revenue.toFixed(2)}`]);
    if (catRows.length > 0) {
      if (y > 240) { doc.addPage(); y = 14; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text('Sales by Category', margin, y); y += 6;
      autoTable(doc, {
        startY: y, head: [['Category', 'Items Sold', 'Orders', 'Revenue']], body: catRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 243, 199] },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Hourly sales distribution
    const hourlyMap: Record<number, { orders: number; revenue: number }> = {};
    completed.forEach(o => {
      const h = new Date(o.timestamp).getHours();
      if (!hourlyMap[h]) hourlyMap[h] = { orders: 0, revenue: 0 };
      hourlyMap[h].orders += 1; hourlyMap[h].revenue += o.total;
    });
    const hourlyRows = Object.entries(hourlyMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, d]) => {
        const hr = Number(h); const ampm = hr >= 12 ? 'PM' : 'AM'; const h12 = hr % 12 || 12;
        return [`${h12}:00 ${ampm}`, `${d.orders}`, `RM ${d.revenue.toFixed(2)}`];
      });
    if (hourlyRows.length > 0) {
      if (y > 240) { doc.addPage(); y = 14; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...darkGray);
      doc.text('Hourly Sales Distribution', margin, y); y += 6;
      autoTable(doc, {
        startY: y, head: [['Hour', 'Orders', 'Revenue']], body: hourlyRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 243, 199] },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Footer on every page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(160, 160, 160);
      doc.text(`Page ${i} of ${pageCount}`, pw - margin, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
      doc.text(`${restaurant.name} — QuickServe POS`, margin, doc.internal.pageSize.getHeight() - 8);
    }

    doc.save(`POS_Report_${reportStart}_to_${reportEnd}.pdf`);
    } catch (e) {
      console.error('PDF generation error:', e);
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const totalPages = reportData ? Math.ceil(reportData.totalCount / entriesPerPage) : 0;
  const paginatedReports = reportData?.orders || [];

  const handleTabSelection = (tab: 'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS' | 'QR_ORDERS' | 'KITCHEN' | 'BILLING' | 'ADDONS' | 'ONLINE_ORDERS' | 'MAIL') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    if (tab !== 'ADDONS') { setAddonDetailView(null); setAddonDetailTab('details'); }
    if (tab !== 'ADDONS') setAddonFeatureTab('AVAILABLE');
  };

  const handleReportsClick = () => {
    setReportsSubMenu('salesReport');
    setActiveTab('REPORTS');
    setIsMobileMenuOpen(false);
  };

  // --- Kitchen Feature Logic ---
  // Plan-based feature gating
  const vendorPlan: PlanId = subscription?.plan_id || 'basic';
  const vendorPlanLabel = vendorPlan === 'pro_plus' ? 'Plan: Pro Plus' : vendorPlan === 'pro' ? 'Plan: Pro' : 'Plan: Basic';
  const canUseQr = vendorPlan === 'pro' || vendorPlan === 'pro_plus';
  const canUseKitchen = vendorPlan === 'pro_plus';
  const canUseSavedBill = vendorPlan === 'basic' || vendorPlan === 'pro' || vendorPlan === 'pro_plus';
  const showQrOrderingFeature = canUseQr && (showQrOrders || featureSettings.qrEnabled);
  const showKitchenFeature = canUseKitchen && featureSettings.kitchenEnabled;
  const showSavedBillFeature = canUseSavedBill && featureSettings.savedBillEnabled;
  const showTablesideFeature = canUseQr && featureSettings.tablesideOrderingEnabled;
  const showQrFeature = showQrOrderingFeature || showTablesideFeature;
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

        const printRestaurant = {
          ...restaurant,
          name: orderListConfig.businessName.trim() || restaurant.name,
        };
        const printSuccess = await printerService.printReceipt(orderToPrint, printRestaurant, getOrderListPrintOptions());
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

      const printRestaurant = {
        ...restaurant,
        name: orderListConfig.businessName.trim() || restaurant.name,
      };
      const success = await printerService.printReceipt(orderToPrint, printRestaurant, getOrderListPrintOptions());
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

  const toggleTablesideOrderSetting = (key: 'autoApprove' | 'autoPrint') => {
    setTablesideOrderSettings(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem(`tableside_order_settings_${restaurant.id}`, JSON.stringify(updated));
      saveSettingsToDb(restaurant.id, restaurant.settings || {}, 'tablesideOrderSettings', updated);
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
    if (!showQrOrderingFeature) return;
    const qrPendingOrders = orders.filter(o => o.orderSource === 'qr_order' && o.status === OrderStatus.PENDING);
    if (qrPendingOrders.length > qrPrevPendingCount.current && qrOrderSettings.autoApprove) {
      qrPendingOrders.forEach(order => {
        onUpdateOrder(order.id, OrderStatus.ONGOING);
      });
    }
    qrPrevPendingCount.current = qrPendingOrders.length;
  }, [orders, showQrOrderingFeature, qrOrderSettings.autoApprove]);

  // Tableside order auto-approve + auto-print
  const tablesidePrevPendingCount = useRef(0);
  useEffect(() => {
    if (!showTablesideFeature) return;
    const tablesidePendingOrders = orders.filter(o => o.orderSource === 'tableside' && o.status === OrderStatus.PENDING);
    if (tablesidePendingOrders.length > tablesidePrevPendingCount.current && tablesideOrderSettings.autoApprove) {
      tablesidePendingOrders.forEach(order => {
        onUpdateOrder(order.id, OrderStatus.ONGOING);
      });
    }
    tablesidePrevPendingCount.current = tablesidePendingOrders.length;
  }, [orders, showTablesideFeature, tablesideOrderSettings.autoApprove]);

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
        receipt: receiptConfig,
        orderList: orderListConfig,
        kitchenTicket: kitchenConfig,
        features: featureSettings,
        paymentTypes,
        taxes: taxEntries,
        font: userFont,
        currency: userCurrency,
        printers: savedPrinters,
        kitchenSettings: kitchenOrderSettings,
        qrOrderSettings,
        tablesideOrderSettings,
        onlineDeliveryOptions,
        onlinePaymentMethods,
        ...(restaurant.location === QS_DEFAULT_HUB && qrGenLocation ? { qrLocationLabel: qrGenLocation } : {}),
      };
      saveAllSettingsToDb(restaurant.id, bundle, restaurant.name);
    }, 1500);
    return () => {
      if (settingsSyncTimerRef.current) clearTimeout(settingsSyncTimerRef.current);
    };
  }, [receiptConfig, orderListConfig, kitchenConfig, featureSettings, paymentTypes, taxEntries, userFont, userCurrency, savedPrinters, kitchenOrderSettings, qrOrderSettings, tablesideOrderSettings, onlineDeliveryOptions, onlinePaymentMethods, qrGenLocation, restaurant.id]);
  // ────────────────────────────────────────────────────────────────────────────

  const renderStaffContent = () => (
    <div>
      {staffList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl mb-5">
          <Users size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No staff added yet</p>
        </div>
      ) : (
        <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700 mb-5">
          {staffList.map((staff: any, idx: number) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{staff.username}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    staff.role === 'KITCHEN' 
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                      : staff.role === 'ORDER_TAKER'
                        ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>{staff.role === 'KITCHEN' ? 'Kitchen' : staff.role === 'ORDER_TAKER' ? 'Order Taker' : 'Cashier'}</span>
                  {staff.role === 'KITCHEN' && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {staff.kitchen_categories && staff.kitchen_categories.length > 0 ? staff.kitchen_categories.join(', ') : 'General Kitchen'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => handleEditStaff(staff, idx)}
                  className="p-2 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  onClick={() => handleRemoveStaff(staff, idx)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => openAddStaffModal()}
        className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
      >
        <UserPlus size={15} /> Add Staff Member
      </button>
    </div>
  );

  const renderUXContent = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Font Family</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This only applies to your screen</p>
        </div>
        <div className="flex items-center">
          <select
            value={userFont}
            onChange={e => setUserFont(e.target.value)}
            className="w-full sm:w-56 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm text-gray-900 dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
            style={{ fontFamily: `'${userFont}', sans-serif` }}
          >
            {FONT_OPTIONS.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>{f}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 last:pb-0">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Currency</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Currency symbol shown on prices</p>
        </div>
        <div className="flex items-center">
          <select
            value={userCurrency}
            onChange={e => setUserCurrency(e.target.value)}
            className="w-full sm:w-56 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm text-gray-900 dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
          >
            {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  const renderFeaturesContent = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Cashier Options</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Checkout behavior and cash drawer actions.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-Print Receipt</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Print automatically after checkout</p>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => updateFeatureSetting('autoPrintReceipt', !featureSettings.autoPrintReceipt)}
                className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.autoPrintReceipt ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${featureSettings.autoPrintReceipt ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Auto Open Drawer</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open cash drawer after checkout</p>
            </div>
            <div className="flex items-center justify-end">
              <button
                onClick={() => updateFeatureSetting('autoOpenDrawer', !featureSettings.autoOpenDrawer)}
                className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.autoOpenDrawer ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${featureSettings.autoOpenDrawer ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Dining Options</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Control available order types for customers.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          {([
            { key: 'dineInEnabled' as const, label: 'Dine-in', desc: 'Allow dine-in orders' },
            { key: 'takeawayEnabled' as const, label: 'Takeaway', desc: 'Allow takeaway orders' },
            { key: 'deliveryEnabled' as const, label: 'Delivery', desc: 'Allow delivery orders' },
          ]).map(item => (
            <div key={item.key} className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => updateFeatureSetting(item.key, !featureSettings[item.key])}
                  className={`w-11 h-6 rounded-full transition-all relative ${featureSettings[item.key] ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${featureSettings[item.key] ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTableManagementContent = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      {/* Table Layout Section */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Table Layout</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Configure table grid and column layout.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Tables & Columns</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set total tables and columns — rows are calculated automatically</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tables</label>
                  <input
                    type="number"
                    min={1}
                    value={tableCountDraft}
                    onChange={e => setTableCountDraft(e.target.value)}
                    className="w-24 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm text-gray-900 dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Columns</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={tableColumnsDraft}
                    onChange={e => setTableColumnsDraft(e.target.value)}
                    className="w-24 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm text-gray-900 dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Rows: {Math.ceil((parsePositiveIntegerDraft(tableCountDraft) ?? featureSettings.tableCount) / (parsePositiveIntegerDraft(tableColumnsDraft) ?? featureSettings.tableColumns))} (auto-calculated)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Floor Management Section */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Floor Management</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Organize tables across multiple floors.</p>
        </div>
        <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Enable Floors</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Organize tables by floor level (max 5 floors)</p>
            </div>
            <div className="flex items-center justify-end">
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
                className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.floorEnabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${featureSettings.floorEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 last:pb-0">
            <div>
              <p className={`text-sm font-medium ${featureSettings.floorEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>Number of Floors</p>
              <p className={`text-xs mt-0.5 ${featureSettings.floorEnabled ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}`}>Each floor has {featureSettings.tableCount} tables. Labels: <span className={`font-semibold ${featureSettings.floorEnabled ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'}`}>F1-1</span>, <span className={`font-semibold ${featureSettings.floorEnabled ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'}`}>F2-1</span>, etc.</p>
            </div>
            <div className="flex items-center justify-end">
              <input
                type="number"
                min={1}
                max={5}
                value={floorCountDraft}
                disabled={!featureSettings.floorEnabled}
                onChange={e => setFloorCountDraft(e.target.value)}
                className="w-24 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm text-gray-900 dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors disabled:bg-gray-100 disabled:dark:bg-gray-800/70 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save/Cancel bar */}
      {(tableCountDraft !== String(featureSettings.tableCount) ||
        tableColumnsDraft !== String(featureSettings.tableColumns) ||
        (featureSettings.floorEnabled && floorCountDraft !== String(featureSettings.floorCount || 1))) && (
        <div className="flex items-center justify-end gap-2 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <button
            onClick={resetTableManagementDraft}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTableManagementChanges}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
          >
            Save Changes
          </button>
        </div>
      )}

      {featureSettings.floorEnabled && floorCountDraft !== String(featureSettings.floorCount || 1) && !(tableCountDraft !== String(featureSettings.tableCount) || tableColumnsDraft !== String(featureSettings.tableColumns)) && (
        <div className="flex items-center justify-end gap-2 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <button
            onClick={() => setFloorCountDraft(String(featureSettings.floorCount || 1))}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveFloorChanges}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-all"
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );

  const renderKitchenSettingsContent = () => {
    const kitchenStaff = staffList.filter((s: any) => s.role === 'KITCHEN');
    return (
      <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
        {/* Enable/Disable Toggle */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Kitchen Display</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Enable and configure the kitchen display system.</p>
          </div>
          <div className="min-w-0 divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-5 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Kitchen Display System</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Route orders to kitchen screens with department support</p>
              </div>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => updateFeatureSetting('kitchenEnabled', !featureSettings.kitchenEnabled)}
                  className={`w-11 h-6 rounded-full transition-all relative ${featureSettings.kitchenEnabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${featureSettings.kitchenEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {featureSettings.kitchenEnabled && (
          <>
            {/* Departments / Divisions */}
            <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Departments</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Route specific categories to specific kitchen screens.</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Create kitchen departments to route specific categories to specific screens.</p>
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
                              className="flex-1 px-2 py-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-medium dark:text-white"
                            />
                            <button onClick={() => handleRenameDivision(dep.name, renameDepartmentValue)} className="p-1.5 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"><CheckCircle2 size={14} /></button>
                            <button onClick={() => { setRenamingDepartment(null); setRenameDepartmentValue(''); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">{dep.name}</p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setRenamingDepartment(dep.name);
                                  setRenameDepartmentValue(dep.name);
                                }}
                                className="p-1.5 text-gray-400 hover:text-orange-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button onClick={() => handleRemoveDivision(dep.name)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"><Trash2 size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 mb-1.5">Categories:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {allFoodCategories.length === 0 ? (
                          <span className="text-xs text-gray-400 italic">No categories yet.</span>
                        ) : allFoodCategories.map(categoryName => {
                          const selected = dep.categories.includes(categoryName);
                          return (
                            <button
                              key={`${dep.name}-${categoryName}`}
                              onClick={() => handleToggleDivisionCategory(dep.name, categoryName)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                selected
                                  ? 'bg-orange-500 text-white shadow-sm'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-600'
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
                  className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
                />
                <button
                  onClick={handleAddDivision}
                  className="px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 transition-all"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            </div>

            {/* Kitchen Staff */}
            <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Kitchen Staff</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Assign staff to the kitchen role.</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Staff assigned to kitchen role can access the Kitchen Display.</p>
              {kitchenStaff.length > 0 ? (
                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700 mb-4">
                  {kitchenStaff.map((staff: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{staff.username}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">Kitchen</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {staff.kitchen_categories && staff.kitchen_categories.length > 0 ? staff.kitchen_categories.join(', ') : 'General Kitchen'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveStaff(staff, staffList.indexOf(staff))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl mb-4">
                  <Users size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No kitchen staff yet</p>
                </div>
              )}
              <button
                onClick={() => openAddStaffModal('KITCHEN')}
                className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={15} /> Add Kitchen Staff
              </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderPaymentTypesContent = () => (
    <div>
      {paymentTypes.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl mb-4">
          <CreditCard size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No payment types</p>
        </div>
      ) : (
        <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700 mb-4">
          {paymentTypes.map(pt => (
            <div key={pt.id} className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{pt.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {NON_REMOVABLE_PAYMENT_TYPE_IDS.has(pt.id) ? 'Built-in method' : 'Custom method'} · {pt.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2">
                {!NON_REMOVABLE_PAYMENT_TYPE_IDS.has(pt.id) && (
                  <button onClick={() => handleRemovePaymentType(pt.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50">
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={() => handleTogglePaymentType(pt.id)}
                  className={`w-11 h-6 rounded-full transition-all relative ${pt.enabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${pt.enabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newPaymentTypeName}
          onChange={e => setNewPaymentTypeName(e.target.value)}
          className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
          placeholder="e.g. CREDIT CARD"
          onKeyDown={e => e.key === 'Enter' && handleAddPaymentType()}
        />
        <button
          onClick={handleAddPaymentType}
          disabled={!newPaymentTypeName.trim()}
          className="px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          <Plus size={15} /> Add
        </button>
      </div>
    </div>
  );

  const renderTaxesContent = () => (
    <div>
      {taxEntries.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl mb-4">
          <Tag size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">No taxes configured</p>
        </div>
      ) : (
        <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700 mb-4">
          {taxEntries.map(tax => (
            <div key={tax.id} className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-8 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{tax.name} ({tax.percentage}%)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tax.applyToItems ? 'Applied to items' : 'Not applied to items'}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => handleRemoveTaxEntry(tax.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50">
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={() => handleToggleTaxApply(tax.id)}
                  className={`w-11 h-6 rounded-full transition-all relative ${tax.applyToItems ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${tax.applyToItems ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Tax Form */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Add Tax</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={newTaxName}
              onChange={e => setNewTaxName(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
              placeholder="e.g. GST, SST"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Percentage</label>
            <input
              type="number"
              value={newTaxPercentage}
              onChange={e => setNewTaxPercentage(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm dark:text-white focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors"
              placeholder="e.g. 6"
              min="0"
              step="0.01"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
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
          className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus size={15} /> Add Tax
        </button>
      </div>
    </div>
  );

  const renderPaymentAndTaxesContent = () => (
    <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Payment Types</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Manage accepted payment methods for checkout.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{paymentTypes.length} payment type{paymentTypes.length !== 1 ? 's' : ''} configured</p>
        </div>
        <div className="min-w-0">{renderPaymentTypesContent()}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 last:pb-0">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Taxes</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Set tax rules and choose whether each tax applies to items.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{taxEntries.length} tax{taxEntries.length !== 1 ? 'es' : ''} configured</p>
        </div>
        <div className="min-w-0">{renderTaxesContent()}</div>
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
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border dark:border-gray-600 min-w-0">
            <h3 className="text-sm font-black dark:text-white uppercase tracking-tight mb-3">QR Code Generator Config</h3>

            <div className="space-y-3">
              {/* Location Name & Table Prefix side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
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
                <div className="min-w-0">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
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
                <div className="min-w-0">
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
                      className="flex-1 min-w-0 px-2 py-2 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white text-center"
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
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 border dark:border-gray-600 min-w-0">
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
        <div className={`flex items-center ${isSidebarCollapsed ? 'p-3 justify-center' : 'px-4 py-4 gap-3'}`}>
          {isSidebarCollapsed ? (
            <button onClick={openProfilePanel} title="Account & Settings" className="rounded-lg hover:ring-2 hover:ring-orange-300 transition-all">
              <img src={restaurant.logo} className="w-8 h-8 rounded-lg shadow-sm cursor-pointer" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`; }} />
            </button>
          ) : (
            <img src={restaurant.logo} className="w-10 h-10 rounded-lg shadow-sm flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`; }} />
          )}
          {!isSidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <h2 className="font-black dark:text-white text-sm uppercase tracking-tight leading-tight truncate">{restaurant.name}</h2>
                <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest">{vendorPlanLabel}</p>
              </div>
              <button
                onClick={openProfilePanel}
                title="Account & Restaurant Settings"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <MoreVertical size={16} />
              </button>
            </>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'p-2 space-y-1' : ('px-3 pt-2 pb-2 space-y-1')}`}>
          {isKitchenUser && (
            <button
              onClick={() => handleTabSelection('KITCHEN')}
              title="Incoming Orders"
              className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
                activeTab === 'KITCHEN'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <Coffee size={navIconSize} /> {!isSidebarCollapsed && 'Incoming Orders'}
            </button>
          )}

          {!isKitchenUser && (<>
          {/* Operations Group */}
          {!isSidebarCollapsed && (
            <p className={`text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-1 pb-1`}>Operations</p>
          )}
          <button 
            onClick={() => handleTabSelection('COUNTER')}
            title="Counter"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'COUNTER' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <ShoppingBag size={navIconSize} /> {!isSidebarCollapsed && 'Counter'}
          </button>

          {showQrFeature && (
            <button
              onClick={() => handleTabSelection('QR_ORDERS')}
              title="QR & Table Order"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2 relative' : 'justify-between px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
                activeTab === 'QR_ORDERS'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <QrCode size={navIconSize} />
                {!isSidebarCollapsed && 'QR & Table Order'}
              </div>
              {!isSidebarCollapsed && (() => {
                const pendingQr = orders.filter(o => (o.orderSource === 'qr_order' || o.orderSource === 'tableside') && o.status === OrderStatus.PENDING).length;
                return pendingQr > 0 ? (
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">{pendingQr}</span>
                ) : null;
              })()}
              {isSidebarCollapsed && (() => {
                const pendingQr = orders.filter(o => (o.orderSource === 'qr_order' || o.orderSource === 'tableside') && o.status === OrderStatus.PENDING).length;
                return pendingQr > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">{pendingQr}</span>
                ) : null;
              })()}
            </button>
          )}

          {showOnlineShopFeature && (
            <button
              onClick={() => handleTabSelection('ONLINE_ORDERS')}
              title="Online Shop"
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2 relative' : 'justify-between px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
                activeTab === 'ONLINE_ORDERS'
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Globe size={navIconSize} />
                {!isSidebarCollapsed && 'Online Shop'}
              </div>
              {!isSidebarCollapsed && (() => {
                const pendingOnline = orders.filter(o => o.orderSource === 'online' && o.status === OrderStatus.PENDING).length;
                return pendingOnline > 0 ? (
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">{pendingOnline}</span>
                ) : null;
              })()}
              {isSidebarCollapsed && (() => {
                const pendingOnline = orders.filter(o => o.orderSource === 'online' && o.status === OrderStatus.PENDING).length;
                return pendingOnline > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">{pendingOnline}</span>
                ) : null;
              })()}
            </button>
          )}

          {/* Management Group */}
          {!isSidebarCollapsed && (
            <p className={`text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 ${navSectionPt}`}>Management</p>
          )}
          {isSidebarCollapsed && <div className="border-t dark:border-gray-700 my-0.5" />}
          <button 
            onClick={() => handleTabSelection('MENU_EDITOR')}
            title="Menu Editor"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'MENU_EDITOR' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BookOpen size={navIconSize} /> {!isSidebarCollapsed && 'Menu Editor'}
          </button>

          <button 
            onClick={handleReportsClick}
            title="Bill and Report"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'REPORTS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BarChart3 size={navIconSize} /> {!isSidebarCollapsed && 'Reports'}
          </button>

          <button 
            onClick={() => handleTabSelection('SETTINGS')}
            title="Settings"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'SETTINGS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Settings size={navIconSize} /> {!isSidebarCollapsed && 'Settings'}
          </button>

          {/* Account Group */}
          {!isSidebarCollapsed && (
            <p className={`text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 ${navSectionPt}`}>Account</p>
          )}
          {isSidebarCollapsed && <div className="border-t dark:border-gray-700 my-0.5" />}
          <button 
            onClick={() => handleTabSelection('ADDONS')}
            title="Add-on Feature"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'ADDONS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Package size={navIconSize} /> {!isSidebarCollapsed && 'Add-on Feature'}
          </button>
          <button 
            onClick={() => handleTabSelection('BILLING')}
            title="Billing"
            className={`w-full flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${navItemPy} rounded-xl ${navTextSize} font-medium transition-all ${
              activeTab === 'BILLING' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <CreditCard size={navIconSize} /> {!isSidebarCollapsed && 'Wallet & billing'}
          </button>

          </>)}
        </nav>

        {/* Sidebar Collapse Toggle — in-flow, sits just above the printer separator */}
        <div className={`hidden lg:flex ${isSidebarCollapsed ? 'justify-center px-2 pb-1' : 'justify-end px-3 pb-1'}`}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          >
            {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Printer Connection Status */}
        <div className={`mt-auto border-t dark:border-gray-700 space-y-1.5 ${isSidebarCollapsed ? 'p-2' : 'px-3 py-2'}`}>
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
                    : 'bg-red-500 text-white hover:bg-red-600'
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
              <img src={restaurant.logo} className="w-8 h-8 landscape:w-6 landscape:h-6 rounded-lg shadow-sm flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`; }} />
              <h1 className="font-black dark:text-white uppercase tracking-tighter text-sm landscape:text-xs truncate">
                {activeTab === 'COUNTER' ? 'POS Counter' : 
                 activeTab === 'MENU_EDITOR' ? (isFormModalOpen ? (formItem.id ? 'Edit Item' : 'New Item') : 'Menu Editor') : 
                 activeTab === 'REPORTS' ? 'Bill and Report' : 
                 activeTab === 'QR_ORDERS' ? 'QR & Table Order' :
                 activeTab === 'ONLINE_ORDERS' ? 'Online Shop' :
                 activeTab === 'KITCHEN' ? 'Incoming Orders' :
                 activeTab === 'BILLING' ? 'Wallet & billing' :
                 activeTab === 'ADDONS' ? (addonDetailView ? 'Feature Details' : 'Add-on Feature') :
                 activeTab === 'MAIL' ? 'Mail' :
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
                <div className="flex-1 overflow-hidden flex flex-col p-4" onClick={() => setActiveSavedBillTable(null)}>
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
                        const COLS_PER_PAGE = 5;
                        const totalColPages = Math.ceil(effectiveTableCols / COLS_PER_PAGE);
                        const safePage = Math.min(tableColPage, Math.max(0, totalColPages - 1));
                        const colStart = safePage * COLS_PER_PAGE;
                        // Always use COLS_PER_PAGE columns for consistent cell width,
                        // unless total cols < 5 (then shrink to fit)
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
                              const tableItemCount = tableBill?.items.length ?? 0;
                              const tableGrandTotal = tableBill ? getItemsGrandTotal(tableBill.items) : 0;
                              return (
                                <button
                                  type="button"
                                  key={table}
                                  disabled={!hasPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!hasPending) return;
                                    setActiveSavedBillTable(isActiveTable ? null : table);
                                  }}
                                  className={`saved-table-cell h-[96px] rounded-xl border-2 p-3 transition-all text-left flex flex-col justify-between ${
                                    isActiveTable
                                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-[0_0_0_2px_rgba(249,115,22,0.5)]'
                                      :
                                    hasPending
                                      ? 'border-transparent bg-orange-50 dark:bg-orange-900/20'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-70'
                                  }`}
                                >
                                  <p className="text-[10px] font-black uppercase tracking-widest dark:text-white line-clamp-1">{table}</p>
                                  <p className={`text-[9px] font-black uppercase tracking-widest ${hasPending ? 'text-orange-500' : 'text-gray-400'}`}>
                                    {hasPending ? 'Pending' : 'Available'}
                                  </p>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-300 line-clamp-1">
                                    {hasPending ? `${tableItemCount} ${tableItemCount === 1 ? 'item' : 'items'} ${currencySymbol}${tableGrandTotal.toFixed(2)}` : `0 item ${currencySymbol}0.00`}
                                  </p>
                                </button>
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
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* QR Order toolbar */}
                  <div className="px-4 py-4 border-b dark:border-gray-700 flex items-center gap-3 bg-white dark:bg-gray-800 shrink-0">
                    <div className="relative flex-1">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={qrSearchQuery}
                        onChange={e => setQrSearchQuery(e.target.value)}
                        placeholder="Search table or order..."
                        className="w-full h-10 pl-9 pr-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div className="flex bg-gray-50 dark:bg-gray-700 rounded-lg p-0.5 border dark:border-gray-600 shrink-0 h-10 items-center">
                      <button onClick={() => setQrOrderView('list')} className={`p-2 rounded-md transition-all ${qrOrderView === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
                      <button onClick={() => { setQrOrderView('grid'); setQrGridColumns(2); }} className={`px-2.5 py-2 rounded-md transition-all text-[10px] font-black ${qrOrderView === 'grid' && qrGridColumns === 2 ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}>2</button>
                      <button onClick={() => { setQrOrderView('grid'); setQrGridColumns(3); }} className={`px-2.5 py-2 rounded-md transition-all text-[10px] font-black ${qrOrderView === 'grid' && qrGridColumns === 3 ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}>3</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                  {(() => {
                    const servedOrders = orders.filter(o => {
                      if (o.status !== OrderStatus.SERVED) return false;
                      if (!qrSearchQuery) return true;
                      const q = qrSearchQuery.toLowerCase();
                      return (o.tableNumber || '').toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.items.some(i => i.name.toLowerCase().includes(q));
                    });
                    if (servedOrders.length === 0) {
                      return (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                          <QrCode size={48} className="mb-4" />
                          <p className="text-[10px] font-black uppercase tracking-widest">{qrSearchQuery ? 'No matching orders' : 'No served orders waiting'}</p>
                        </div>
                      );
                    }
                    return (
                      <div className={qrOrderView === 'grid' ? `grid ${qrGridColumns === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-3` : 'space-y-3'}>
                        {servedOrders.map(order => (
                          <button
                            key={order.id}
                            onClick={() => setSelectedQrOrderForPayment(order)}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-all overflow-hidden ${
                              selectedQrOrderForPayment?.id === order.id
                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/10'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-orange-300'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2 gap-1">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                                <QrCode size={14} className="text-orange-500 shrink-0" />
                                <span className="text-xs font-black dark:text-white uppercase truncate">{order.tableNumber}</span>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">#{order.id.slice(-7)}</span>
                              </div>
                              <span className="text-xs font-black text-orange-500 shrink-0 whitespace-nowrap">{currencySymbol}{order.total.toFixed(2)}</span>
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
                </div>
              ) : (
                <>
              {/* Shift-required dim overlay */}
              {shiftRequired && (
                <div className="bg-red-50 dark:bg-red-900/30 border-b-2 border-red-300 dark:border-red-700 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-red-500" />
                    <span className="text-xs font-black text-red-700 dark:text-red-300 uppercase tracking-wider">Shift not started — counter inactive</span>
                  </div>
                </div>
              )}
              <div className={`flex-1 flex flex-col overflow-hidden ${shiftRequired ? 'opacity-40 pointer-events-auto' : ''}`} style={shiftRequired ? { filter: 'grayscale(0.3)' } : undefined}>
              <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 lg:px-5 py-2 lg:py-2.5 max-lg:landscape:py-1 flex flex-col gap-2 lg:gap-2 max-lg:landscape:gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 lg:px-3 lg:py-1.5 max-lg:landscape:py-0.5 max-lg:landscape:px-2 rounded-lg font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
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
                    <button onClick={() => setShowLayoutPicker(!showLayoutPicker)} className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-all">
                      <LayoutGrid size={14} />
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
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search menu items..." 
                    className="w-full pl-10 pr-3 py-2 max-lg:landscape:py-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    value={menuSearch}
                    onChange={e => setMenuSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 pb-24 lg:pb-2 scroll-smooth">
                <div className="space-y-4">
                  {Object.entries(groupedMenu).map(([category, items]) => (
                    <section key={category}>
                      <div className="mb-2 text-center">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">{category}</h3>
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
                            style={!hasRenderableMenuItemImage(item) ? { backgroundColor: getMenuItemTileBackground(item) } : undefined}
                            >
                              {hasRenderableMenuItemImage(item) ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/70">
                                  <Coffee size={28} />
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
              </div>{/* close shift dim wrapper */}
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
                onDownloadPDF={handleDownloadPDF}
                isDownloadingPDF={isDownloadingPDF}
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
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 md:p-8 pb-0 md:pb-0">
                <div className="mb-5">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-1">Menu Editor</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your menu items, categories, modifiers, and add-ons.</p>
                </div>

                {/* Document-style tab bar */}
                <div className="flex gap-0 relative">
                  {([
                    { id: 'KITCHEN' as const, label: 'Kitchen Menu', icon: <BookOpen size={13} /> },
                    { id: 'CATEGORY' as const, label: 'Category', icon: <Layers size={13} /> },
                    { id: 'MODIFIER' as const, label: 'Modifier', icon: <Coffee size={13} /> },
                    { id: 'ADDON' as const, label: 'Add-On Item', icon: <PlusCircle size={13} /> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setMenuSubTab(tab.id)}
                      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                        menuSubTab === tab.id
                          ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-tab content */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl rounded-tr-2xl">

                  {/* Sub-tab controls — sticky toolbar */}
                  <div
                    ref={menuEditorStickyRef}
                    className={`sticky top-0 z-30 -mx-5 md:-mx-6 px-5 md:px-6 -mt-5 md:-mt-6 pt-3 pb-2 space-y-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 supports-[backdrop-filter]:dark:bg-gray-800/85 transition-[box-shadow,border-color] duration-200 ${
                      menuEditorStuck
                        ? 'shadow-md border-b border-gray-200 dark:border-gray-700'
                        : 'border-b border-transparent rounded-tr-2xl'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                    {menuSubTab === 'KITCHEN' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setMenuViewMode('grid')} className={`px-2 rounded-md transition-all ${menuViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={14} /></button>
                            <button onClick={() => setMenuViewMode('list')} className={`px-2 rounded-md transition-all ${menuViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
                          </div>
                          <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              value={menuSearchQuery}
                              onChange={e => setMenuSearchQuery(e.target.value)}
                              placeholder="Search menu..."
                              className="h-8 w-48 pl-9 pr-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex h-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setMenuStatusFilter('ACTIVE')} className={`flex items-center gap-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ACTIVE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Eye size={13} /> <span className="hidden sm:inline">Active</span></button>
                            <button onClick={() => setMenuStatusFilter('ARCHIVED')} className={`flex items-center gap-1.5 px-3 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ARCHIVED' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Archive size={13} /> <span className="hidden sm:inline">Archived</span></button>
                          </div>
                          <button onClick={() => handleOpenAddModal()} className="h-8 px-4 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">+ Add Item</button>
                        </div>
                      </>
                    ) : menuSubTab === 'CATEGORY' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setClassViewMode('grid')} className={`px-2 rounded-md transition-all ${classViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={14} /></button>
                            <button onClick={() => setClassViewMode('list')} className={`px-2 rounded-md transition-all ${classViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
                          </div>
                        </div>
                        <button onClick={() => setShowAddClassModal(true)} className="ml-auto h-8 px-4 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Tag size={14} /> + New Category
                        </button>
                      </>
                    ) : menuSubTab === 'MODIFIER' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setModifierViewMode('grid')} className={`px-2 rounded-md transition-all ${modifierViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={14} /></button>
                            <button onClick={() => setModifierViewMode('list')} className={`px-2 rounded-md transition-all ${modifierViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
                          </div>
                        </div>
                        <button onClick={handleAddModifier} className="ml-auto h-8 px-4 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Coffee size={14} /> + New Modifier
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm">
                            <button onClick={() => setAddOnViewMode('grid')} className={`px-2 rounded-md transition-all ${addOnViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={14} /></button>
                            <button onClick={() => setAddOnViewMode('list')} className={`px-2 rounded-md transition-all ${addOnViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
                          </div>
                        </div>
                        <button onClick={() => setAddOnItems(prev => [...prev, { name: '', price: 0, maxQuantity: 1, required: false }])} className="ml-auto h-8 px-4 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <PlusCircle size={14} /> + New Add-On
                        </button>
                      </>
                    )}
                    </div>

                    {/* Category filter — included in sticky toolbar */}
                    {menuSubTab === 'KITCHEN' && (
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 px-3 py-1.5 border dark:border-gray-700 rounded-lg overflow-x-auto hide-scrollbar">
                        <Filter size={14} className="text-gray-400 shrink-0" />
                        {menuEditorCategories.map(cat => (
                          <button key={cat} onClick={() => setMenuCategoryFilter(cat)} className={`whitespace-nowrap px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuCategoryFilter === cat ? 'bg-orange-100 text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>{cat}</button>
                        ))}
                      </div>
                    )}
                  </div>

                {menuSubTab === 'KITCHEN' && (
                  <>
                    {menuViewMode === 'grid' ? (
                      <div className="grid grid-cols-5 gap-3 mt-4">
                        {currentMenu.map(item => (
                          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border dark:border-gray-700 hover:shadow-md transition-all group flex flex-col">
                            <div className="relative aspect-square overflow-hidden" style={!hasRenderableMenuItemImage(item) ? { backgroundColor: getMenuItemTileBackground(item) } : undefined}>
                              {hasRenderableMenuItemImage(item) ? (
                                <img src={item.image} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/50">
                                  <Coffee size={36} />
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
                                      {hasRenderableMenuItemImage(item) ? (
                                        <img src={item.image} className="w-10 h-10 rounded-lg object-cover" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white/60" style={{ backgroundColor: getMenuItemTileBackground(item) }}>
                                          <Coffee size={20} />
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
                                        <>
                                          <button onClick={() => handleRestoreItem(item)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all" title="Restore"><RotateCcw size={20} /></button>
                                          <button onClick={() => handlePermanentDelete(item.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Delete permanently"><Trash2 size={20} /></button>
                                        </>
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
                                    value={addon.price === 0 || addon.price === undefined ? '' : addon.price}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, price: e.target.value === '' ? 0 : Number(e.target.value) }; setAddOnItems(updated); }}
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
                                    value={addon.maxQuantity && addon.maxQuantity > 0 ? addon.maxQuantity : ''}
                                    onChange={e => {
                                      const nextValue = e.target.value;
                                      const updated = [...addOnItems];
                                      updated[index] = { ...addon, maxQuantity: nextValue === '' ? 0 : Math.max(1, parseInt(nextValue, 10) || 0) };
                                      setAddOnItems(updated);
                                    }}
                                    placeholder="No limit"
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
                                    value={addon.price === 0 || addon.price === undefined ? '' : addon.price}
                                    onChange={e => { const updated = [...addOnItems]; updated[index] = { ...addon, price: e.target.value === '' ? 0 : Number(e.target.value) }; setAddOnItems(updated); }}
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
                                    value={addon.maxQuantity && addon.maxQuantity > 0 ? addon.maxQuantity : ''}
                                    onChange={e => {
                                      const nextValue = e.target.value;
                                      const updated = [...addOnItems];
                                      updated[index] = { ...addon, maxQuantity: nextValue === '' ? 0 : Math.max(1, parseInt(nextValue, 10) || 0) };
                                      setAddOnItems(updated);
                                    }}
                                    placeholder="No limit"
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
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'SETTINGS' && (() => {
            const settingsTabs: Array<{ key: SettingsPanel; label: string; info: string; icon: React.ElementType; badge: string }> =
              isKitchenUser
                ? [
                    {
                      key: 'builtin',
                      label: 'Kitchen Orders',
                      info: 'Configure how kitchen orders are accepted and printed.',
                      icon: Coffee,
                      badge: 'Automation'
                    },
                    {
                      key: 'printer',
                      label: 'Printer',
                      info: 'Connect printers and manage printer profiles.',
                      icon: Printer,
                      badge: 'Hardware'
                    },
                    {
                      key: 'receipt',
                      label: 'Receipt',
                      info: 'Configure receipt text, fields, and printing behavior.',
                      icon: Receipt,
                      badge: 'Layout'
                    },
                    {
                      key: 'orderList',
                      label: 'Order List',
                      info: 'Configure prep list fields and visibility for kitchen-ready printouts.',
                      icon: List,
                      badge: 'Prep'
                    },
                  ]
                : [
                    {
                      key: 'builtin',
                      label: 'Build in Features.',
                      info: 'Core POS behavior such as cashier and dining options.',
                      icon: Layers,
                      badge: 'Core'
                    },
                    {
                      key: 'printer',
                      label: 'Printer',
                      info: 'Connect printers and manage printer profiles.',
                      icon: Printer,
                      badge: 'Hardware'
                    },
                    {
                      key: 'receipt',
                      label: 'Receipt',
                      info: 'Configure receipt text, fields, and printing behavior.',
                      icon: Receipt,
                      badge: 'Layout'
                    },
                    {
                      key: 'orderList',
                      label: 'Order List',
                      info: 'Configure prep list fields and visibility for kitchen-ready printouts.',
                      icon: List,
                      badge: 'Prep'
                    },
                    {
                      key: 'payment',
                      label: 'Payment & Taxes',
                      info: 'Manage payment methods and tax rules.',
                      icon: CreditCard,
                      badge: 'Finance'
                    },
                    {
                      key: 'staff',
                      label: 'Staff',
                      info: 'Manage staff accounts and permissions.',
                      icon: Users,
                      badge: 'Access'
                    },
                  ];

            const addonPanelMeta: Record<string, { label: string; info: string; icon: React.ElementType; badge: string; addonId: string; isInstalled: boolean }> = {
              'addon-table': { label: 'Table Management', info: 'Save bill & manage table layout for dine-in.', icon: LayoutGrid, badge: 'Add-on', addonId: 'table', isInstalled: featureSettings.tableManagementEnabled || featureSettings.savedBillEnabled },
              'addon-qr': { label: 'QR Ordering', info: 'Let customers scan QR codes to order from their table.', icon: QrCode, badge: 'Add-on', addonId: 'qr', isInstalled: featureSettings.qrEnabled },
              'addon-kitchen': { label: 'Kitchen Display', info: 'Kitchen order management & display system.', icon: Coffee, badge: 'Add-on', addonId: 'kitchen', isInstalled: featureSettings.kitchenEnabled },
              'addon-tableside': { label: 'Tableside Ordering', info: 'Staff take orders tableside using a tablet device.', icon: Tablet, badge: 'Add-on', addonId: 'tableside', isInstalled: featureSettings.tablesideOrderingEnabled },
              'addon-customer-display': { label: 'Customer Display', info: 'External customer-facing display screen.', icon: Monitor, badge: 'Add-on', addonId: 'customer-display', isInstalled: featureSettings.customerDisplayEnabled },
              'addon-online-shop': { label: 'Online Shop', info: 'Let customers order online via a shareable link.', icon: Globe, badge: 'Add-on', addonId: 'online-shop', isInstalled: featureSettings.onlineShopEnabled },
              'addon-shift': { label: 'Shift Management', info: 'Cashier shift open/close with cash drawer reconciliation & schedule.', icon: Clock, badge: 'Add-on', addonId: 'shift', isInstalled: featureSettings.shiftEnabled },
            };

            const isAddonPanel = settingsPanel.startsWith('addon-');
            const hasVisiblePanel = settingsTabs.some(tab => tab.key === settingsPanel) || isAddonPanel;
            const activeSettingsPanel = hasVisiblePanel ? settingsPanel : settingsTabs[0].key;
            const activeSettingsTab = isAddonPanel && addonPanelMeta[settingsPanel]
              ? addonPanelMeta[settingsPanel]
              : (settingsTabs.find(tab => tab.key === activeSettingsPanel) || settingsTabs[0]);
            const ActiveSettingsIcon = activeSettingsTab.icon;

            const enabledFeatureCount = [
              featureSettings.autoPrintReceipt,
              featureSettings.autoOpenDrawer,
              featureSettings.dineInEnabled,
              featureSettings.takeawayEnabled,
              featureSettings.deliveryEnabled,
              featureSettings.savedBillEnabled,
              featureSettings.tableManagementEnabled,
              featureSettings.floorEnabled,
              featureSettings.kitchenEnabled,
              featureSettings.qrEnabled,
              featureSettings.tablesideOrderingEnabled,
              featureSettings.onlineShopEnabled,
            ].filter(Boolean).length;

            const panelMetaLine = (() => {
              switch (activeSettingsPanel) {
                case 'builtin':
                  return isKitchenUser
                    ? `${kitchenOrderSettings.autoAccept ? 'Auto-accept enabled' : 'Auto-accept disabled'} · ${kitchenOrderSettings.autoPrint ? 'Auto-print enabled' : 'Auto-print disabled'}`
                    : `${enabledFeatureCount} feature toggle${enabledFeatureCount !== 1 ? 's' : ''} enabled`;
                case 'printer':
                  return `${savedPrinters.length} printer profile${savedPrinters.length !== 1 ? 's' : ''} configured`;
                case 'receipt':
                  return `${receiptConfig.autoPrintAfterSale ? 'Auto-print after sale enabled' : 'Manual print after sale'} · ${receiptConfig.businessPhone ? 'Business phone shown' : 'Business phone not set'}`;
                case 'orderList':
                  return `${orderListConfig.showItemPrice ? 'Item prices shown' : 'Item prices hidden'} · ${orderListConfig.showPaymentMethod ? 'Payment method shown' : 'Payment method hidden'}`;
                case 'payment':
                  return `${paymentTypes.length} payment type${paymentTypes.length !== 1 ? 's' : ''} · ${taxEntries.length} tax rule${taxEntries.length !== 1 ? 's' : ''}`;
                case 'staff':
                  return `${staffList.length} staff account${staffList.length !== 1 ? 's' : ''} managed in this outlet`;
                case 'addon-table':
                  return (featureSettings.tableManagementEnabled || featureSettings.savedBillEnabled) ? 'Installed · Table management enabled' : 'Not installed';
                case 'addon-qr':
                  return featureSettings.qrEnabled ? 'Installed · QR ordering enabled' : 'Not installed';
                case 'addon-kitchen':
                  return featureSettings.kitchenEnabled ? 'Installed · Kitchen display enabled' : 'Not installed';
                case 'addon-tableside':
                  return featureSettings.tablesideOrderingEnabled ? 'Installed · Tableside ordering enabled' : 'Not installed';
                case 'addon-customer-display':
                  return featureSettings.customerDisplayEnabled ? 'Installed · Customer display enabled' : 'Not installed';
                case 'addon-online-shop':
                  return featureSettings.onlineShopEnabled ? 'Installed · Online shop enabled' : 'Not installed';
                case 'addon-shift':
                  return featureSettings.shiftEnabled ? 'Installed · Shift management enabled' : 'Not installed';
                default:
                  return '';
              }
            })();

            return (
              <div className="relative flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-orange-50/40 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
                <div className="mx-auto w-full max-w-[1480px] px-3 pb-8 pt-3 sm:px-5 sm:pt-5 lg:px-8 lg:pt-6">
                  <div className="animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
                      <aside className="h-fit rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/90 md:sticky md:top-4">
                        <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">General Setting</p>

                        <div className="space-y-1.5">
                          {settingsTabs.map(tab => {
                            const isActive = activeSettingsPanel === tab.key;

                            return (
                              <button
                                key={tab.key}
                                onClick={() => setSettingsPanel(tab.key)}
                                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                                  isActive
                                    ? 'border-orange-300 bg-orange-50/90 dark:border-orange-500/50 dark:bg-orange-500/10'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800/70 dark:hover:border-gray-500 dark:hover:bg-gray-700/80'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`w-3 text-center text-xs font-black ${isActive ? 'text-orange-500 dark:text-orange-300' : 'text-slate-300 dark:text-gray-600'}`}>{isActive ? '>' : ''}</span>
                                  <span className={`text-sm font-semibold ${isActive ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-gray-200'}`}>{tab.label}</span>
                                </div>

                                <div className={`overflow-hidden transition-all duration-200 ${isActive ? 'mt-1.5 max-h-16 opacity-100' : 'mt-0 max-h-0 opacity-0'}`}>
                                  <p className="pl-5 pr-1 text-xs leading-relaxed text-slate-500 dark:text-gray-400">{tab.info}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {!isKitchenUser && (() => {
                          const addonSettingsList: Array<{ key: SettingsPanel; label: string; info: string; icon: React.ReactNode; badge: string; isInstalled: boolean; addonId: string }> = [
                            { key: 'addon-table', label: 'Table Management', info: 'Save bill & manage table layout for dine-in.', icon: <LayoutGrid size={14} />, badge: 'Add-on', isInstalled: featureSettings.tableManagementEnabled || featureSettings.savedBillEnabled, addonId: 'table' },
                            { key: 'addon-qr', label: 'QR Ordering', info: 'Let customers scan QR codes to order from their table.', icon: <QrCode size={14} />, badge: 'Add-on', isInstalled: featureSettings.qrEnabled, addonId: 'qr' },
                            { key: 'addon-kitchen', label: 'Kitchen Display', info: 'Kitchen order management & display system.', icon: <Coffee size={14} />, badge: 'Add-on', isInstalled: featureSettings.kitchenEnabled, addonId: 'kitchen' },
                            { key: 'addon-tableside', label: 'Tableside Ordering', info: 'Staff take orders tableside using a tablet device.', icon: <Tablet size={14} />, badge: 'Add-on', isInstalled: featureSettings.tablesideOrderingEnabled, addonId: 'tableside' },
                            { key: 'addon-customer-display', label: 'Customer Display', info: 'External customer-facing display screen.', icon: <Monitor size={14} />, badge: 'Add-on', isInstalled: featureSettings.customerDisplayEnabled, addonId: 'customer-display' },
                            { key: 'addon-online-shop', label: 'Online Shop', info: 'Let customers order online via a shareable link.', icon: <Globe size={14} />, badge: 'Add-on', isInstalled: featureSettings.onlineShopEnabled, addonId: 'online-shop' },
                            { key: 'addon-shift', label: 'Shift Management', info: 'Cashier shift open/close with cash drawer reconciliation & schedule.', icon: <Clock size={14} />, badge: 'Add-on', isInstalled: featureSettings.shiftEnabled, addonId: 'shift' },
                          ];
                          return (
                            <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-gray-700/80">
                              <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-gray-400">Add-on Feature Setting</p>
                              <div className="space-y-1.5">
                                {addonSettingsList.map(addon => {
                                  const isActive = activeSettingsPanel === addon.key;
                                  return (
                                    <button
                                      key={addon.key}
                                      onClick={() => setSettingsPanel(addon.key)}
                                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                                        isActive
                                          ? 'border-orange-300 bg-orange-50/90 dark:border-orange-500/50 dark:bg-orange-500/10'
                                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800/70 dark:hover:border-gray-500 dark:hover:bg-gray-700/80'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={`w-3 text-center text-xs font-black ${isActive ? 'text-orange-500 dark:text-orange-300' : 'text-slate-300 dark:text-gray-600'}`}>{isActive ? '>' : ''}</span>
                                        <span className={`flex items-center gap-1.5 text-sm font-semibold ${isActive ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-gray-200'}`}>
                                          {addon.icon} {addon.label}
                                        </span>
                                      </div>
                                      <div className={`overflow-hidden transition-all duration-200 ${isActive ? 'mt-1.5 max-h-16 opacity-100' : 'mt-0 max-h-0 opacity-0'}`}>
                                        <p className="pl-5 pr-1 text-xs leading-relaxed text-slate-500 dark:text-gray-400">{addon.info}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => handleTabSelection('ADDONS')}
                                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-600 dark:border-gray-600 dark:bg-gray-800/30 dark:text-gray-400 dark:hover:border-orange-500/50 dark:hover:text-orange-400"
                              >
                                <Package size={12} /> Manage Add-ons
                              </button>
                            </div>
                          );
                        })()}
                      </aside>

                      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_16px_45px_-40px_rgba(15,23,42,0.7)] backdrop-blur-sm dark:border-gray-700/80 dark:bg-gray-800/90">
                      <div className="border-b border-slate-200/80 px-4 py-4 dark:border-gray-700/80 sm:px-6 sm:py-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-2 text-orange-600 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300">
                              <ActiveSettingsIcon size={18} />
                            </div>
                            <div>
                              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{activeSettingsTab.label}</h2>
                              <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">{activeSettingsTab.info}</p>
                            </div>
                          </div>
                          {isAddonPanel && addonPanelMeta[activeSettingsPanel] ? (
                            <div className="flex flex-shrink-0 items-center gap-2">
                              {addonPanelMeta[activeSettingsPanel].isInstalled ? (
                                <button
                                  onClick={() => {
                                    const m = addonPanelMeta[activeSettingsPanel];
                                    if (m.addonId === 'table') { updateFeatureSetting('tableManagementEnabled', false); updateFeatureSetting('savedBillEnabled', false); }
                                    else if (m.addonId === 'qr') updateFeatureSetting('qrEnabled', false);
                                    else if (m.addonId === 'kitchen') updateFeatureSetting('kitchenEnabled', false);
                                    else if (m.addonId === 'tableside') updateFeatureSetting('tablesideOrderingEnabled', false);
                                    else if (m.addonId === 'customer-display') updateFeatureSetting('customerDisplayEnabled', false);
                                    else if (m.addonId === 'online-shop') updateFeatureSetting('onlineShopEnabled', false);
                                    else if (m.addonId === 'shift') updateFeatureSetting('shiftEnabled', false);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                                >
                                  <X size={12} /> Uninstall
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    const m = addonPanelMeta[activeSettingsPanel];
                                    if (m.addonId === 'table') { updateFeatureSetting('tableManagementEnabled', true); updateFeatureSetting('savedBillEnabled', true); }
                                    else if (m.addonId === 'qr') updateFeatureSetting('qrEnabled', true);
                                    else if (m.addonId === 'kitchen') updateFeatureSetting('kitchenEnabled', true);
                                    else if (m.addonId === 'tableside') updateFeatureSetting('tablesideOrderingEnabled', true);
                                    else if (m.addonId === 'customer-display') updateFeatureSetting('customerDisplayEnabled', true);
                                    else if (m.addonId === 'online-shop') updateFeatureSetting('onlineShopEnabled', true);
                                    else if (m.addonId === 'shift') updateFeatureSetting('shiftEnabled', true);
                                  }}
                                  disabled={(['qr','tableside','online-shop'].includes(addonPanelMeta[activeSettingsPanel].addonId) && !canUseQr) || (addonPanelMeta[activeSettingsPanel].addonId === 'kitchen' && !canUseKitchen)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-green-600 transition-all hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20"
                                >
                                  <Download size={12} /> Install
                                </button>
                              )}
                              <button
                                onClick={() => { handleTabSelection('ADDONS'); setAddonDetailView(addonPanelMeta[activeSettingsPanel].addonId); setAddonDetailTab('details'); }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-orange-500/50 dark:hover:text-orange-400"
                              >
                                <Info size={12} /> Learn More
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 dark:border-gray-600 dark:bg-gray-700/80 dark:text-gray-300">{activeSettingsTab.badge}</span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300">{panelMetaLine}</span>
                        </div>
                      </div>

                        <div className="px-4 py-4 sm:px-6 sm:py-6">
                          {isKitchenUser && activeSettingsPanel === 'builtin' && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                  <div className="mb-3">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Auto-Accept</p>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Automatically accept incoming kitchen orders.</p>
                                  </div>
                                  <button
                                    onClick={() => toggleKitchenOrderSetting('autoAccept')}
                                    className={`w-11 h-6 rounded-full transition-all relative ${kitchenOrderSettings.autoAccept ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${kitchenOrderSettings.autoAccept ? 'left-6' : 'left-1'}`} />
                                  </button>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                  <div className="mb-3">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Auto-Print</p>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">Automatically print accepted kitchen orders.</p>
                                  </div>
                                  <button
                                    onClick={() => toggleKitchenOrderSetting('autoPrint')}
                                    className={`w-11 h-6 rounded-full transition-all relative ${kitchenOrderSettings.autoPrint ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                  >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${kitchenOrderSettings.autoPrint ? 'left-6' : 'left-1'}`} />
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
                                These automation toggles update instantly and apply to incoming kitchen workflow across this device profile.
                              </div>
                            </div>
                          )}

                          {!isKitchenUser && activeSettingsPanel === 'builtin' && (
                            <div className="min-w-0">{renderFeaturesContent()}</div>
                          )}

                          {activeSettingsPanel === 'printer' && (
                            <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-gray-700/70 dark:bg-gray-900/30 sm:p-4">
                              <PrinterSettings
                                restaurantId={restaurant.id}
                                restaurantName={restaurant.name}
                                categories={allFoodCategories}
                                initialTab="printers"
                                visibleTabs={['printers']}
                                savedPrinters={savedPrinters}
                                receiptConfig={receiptConfig}
                                orderListConfig={orderListConfig}
                                kitchenConfig={kitchenConfig}
                                onPrintersChange={(printers) => setSavedPrinters(printers)}
                                onReceiptConfigChange={(config) => setReceiptConfig(config)}
                                onOrderListConfigChange={(config) => setOrderListConfig(config)}
                                onKitchenConfigChange={(config) => setKitchenConfig(config)}
                                onPrinterConnected={(device) => {
                                  setConnectedDevice(device);
                                  setRealPrinterConnected(true);
                                  localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
                                }}
                              />
                            </div>
                          )}

                          {activeSettingsPanel === 'receipt' && (
                            <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-gray-700/70 dark:bg-gray-900/30 sm:p-4">
                              <PrinterSettings
                                restaurantId={restaurant.id}
                                restaurantName={restaurant.name}
                                categories={allFoodCategories}
                                initialTab="receipts"
                                visibleTabs={['receipts']}
                                savedPrinters={savedPrinters}
                                receiptConfig={receiptConfig}
                                orderListConfig={orderListConfig}
                                kitchenConfig={kitchenConfig}
                                onPrintersChange={(printers) => setSavedPrinters(printers)}
                                onReceiptConfigChange={(config) => setReceiptConfig(config)}
                                onOrderListConfigChange={(config) => setOrderListConfig(config)}
                                onKitchenConfigChange={(config) => setKitchenConfig(config)}
                                onPrinterConnected={(device) => {
                                  setConnectedDevice(device);
                                  setRealPrinterConnected(true);
                                  localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
                                }}
                              />
                            </div>
                          )}

                          {activeSettingsPanel === 'orderList' && (
                            <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-gray-700/70 dark:bg-gray-900/30 sm:p-4">
                              <PrinterSettings
                                restaurantId={restaurant.id}
                                restaurantName={restaurant.name}
                                categories={allFoodCategories}
                                initialTab="orderList"
                                visibleTabs={['orderList']}
                                savedPrinters={savedPrinters}
                                receiptConfig={receiptConfig}
                                orderListConfig={orderListConfig}
                                kitchenConfig={kitchenConfig}
                                onPrintersChange={(printers) => setSavedPrinters(printers)}
                                onReceiptConfigChange={(config) => setReceiptConfig(config)}
                                onOrderListConfigChange={(config) => setOrderListConfig(config)}
                                onKitchenConfigChange={(config) => setKitchenConfig(config)}
                                onPrinterConnected={(device) => {
                                  setConnectedDevice(device);
                                  setRealPrinterConnected(true);
                                  localStorage.setItem(`printer_${restaurant.id}`, JSON.stringify(device));
                                }}
                              />
                            </div>
                          )}

                          {activeSettingsPanel === 'payment' && (
                            <div className="min-w-0">{renderPaymentAndTaxesContent()}</div>
                          )}

                          {activeSettingsPanel === 'staff' && (
                            <div className="min-w-0">{renderStaffContent()}</div>
                          )}

                          {activeSettingsPanel === 'addon-table' && (
                            <div className="min-w-0">
                              {(featureSettings.tableManagementEnabled || featureSettings.savedBillEnabled) ? (
                                <div className="space-y-4">{renderTableManagementContent()}</div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-qr' && (
                            <div className="min-w-0">
                              {featureSettings.qrEnabled ? (
                                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
                                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">QR Code Generator</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Generate and customize QR codes for table ordering.</p>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center justify-end">
                                        <button
                                          onClick={() => {
                                            if (isQrGeneratorRedirecting) return;
                                            setIsQrGeneratorRedirecting(true);
                                            window.setTimeout(() => {
                                              setActiveTab('QR_ORDERS');
                                              setQrOrderSubTab('QR_GENERATOR');
                                              setIsQrGeneratorRedirecting(false);
                                            }, 220);
                                          }}
                                          disabled={isQrGeneratorRedirecting}
                                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                          {isQrGeneratorRedirecting ? (
                                            <>
                                              <RotateCw size={15} className="animate-spin" /> Redirecting...
                                            </>
                                          ) : (
                                            <>
                                              <QrCode size={15} /> Open QR Generator
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-kitchen' && (
                            <div className="min-w-0">
                              {featureSettings.kitchenEnabled ? (
                                canUseKitchen ? (
                                  <div className="space-y-0">{renderKitchenSettingsContent()}</div>
                                ) : (
                                  <div className="text-center py-8">
                                    <Coffee size={36} className="mx-auto text-gray-300 mb-3" />
                                    <p className="text-sm font-black dark:text-white mb-1">Upgrade to Pro Plus</p>
                                    <p className="text-[10px] text-gray-400 mb-4">Kitchen Display System requires the Pro Plus plan</p>
                                    <button onClick={() => setShowUpgradeModal(true)} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all">Upgrade Plan</button>
                                  </div>
                                )
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-tableside' && (
                            <div className="min-w-0">
                              {featureSettings.tablesideOrderingEnabled ? (
                                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
                                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How It Works</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Order flow and routing.</p>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
                                        Tableside ordering uses the same workflow as QR ordering. Orders placed by staff will appear in the QR Orders queue and Kitchen Display.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-customer-display' && (
                            <div className="min-w-0">
                              {featureSettings.customerDisplayEnabled ? (
                                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
                                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How It Works</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Customer-facing display setup.</p>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
                                        Enable a second screen facing your customers showing items, prices, and the total in real time.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-online-shop' && (
                            <div className="min-w-0">
                              {featureSettings.onlineShopEnabled ? (
                                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
                                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How It Works</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Online ordering channel.</p>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
                                        Share your online ordering link on social media, your website, or messaging apps to reach more customers.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {activeSettingsPanel === 'addon-shift' && (
                            <div className="min-w-0">
                              {featureSettings.shiftEnabled ? (
                                <div className="divide-y divide-dotted divide-gray-200 dark:divide-gray-700">
                                  <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 lg:gap-8 py-6 first:pt-0">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">How It Works</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">Shift workflow and cashier lock behavior.</p>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300">
                                        Shift Management requires cashiers to open a shift before they can complete payment. If a shift is not active, checkout is blocked with an error notice.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12">
                                  <Package size={36} className="mb-3 text-amber-300" />
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Please install this add-on to review the setting.</p>
                                  <p className="mt-1 text-xs text-amber-500 dark:text-amber-400/70">Click the Install button above or visit the Add-on Feature page.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

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
                    <button
                      onClick={() => {
                        if (!featureSettings.kitchenEnabled) { setShowLockedRoleAlert('Kitchen Display'); return; }
                        setNewStaffRole('KITCHEN');
                      }}
                      className={`flex-1 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${
                        newStaffRole === 'KITCHEN' ? 'bg-white dark:bg-gray-800 text-orange-600 shadow-sm' : 'text-gray-400'
                      }`}
                    >
                      Kitchen
                      {!featureSettings.kitchenEnabled && <Lock size={10} />}
                    </button>
                    <button
                      onClick={() => {
                        if (!featureSettings.tablesideOrderingEnabled) { setShowLockedRoleAlert('Tableside Ordering'); return; }
                        setNewStaffRole('ORDER_TAKER'); setNewStaffKitchenCategories([]);
                      }}
                      className={`flex-1 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${
                        newStaffRole === 'ORDER_TAKER' ? 'bg-white dark:bg-gray-800 text-teal-600 shadow-sm' : 'text-gray-400'
                      }`}
                    >
                      Order Taker
                      {!featureSettings.tablesideOrderingEnabled && <Lock size={10} />}
                    </button>
                  </div>
                </div>

                {/* Locked Role Alert */}
                {showLockedRoleAlert && (
                  <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowLockedRoleAlert(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                          <Lock size={20} className="text-orange-500" />
                        </div>
                        <div>
                          <h3 className="font-black text-sm dark:text-white uppercase tracking-tight">Feature Required</h3>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Add-on not installed</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mb-4">
                        Please install the <span className="font-black text-orange-500">{showLockedRoleAlert}</span> feature from the Add-on Features page before creating this role.
                      </p>
                      <button
                        onClick={() => setShowLockedRoleAlert(null)}
                        className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}

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
            <div className="flex-1 overflow-y-auto p-3 md:p-5 xl:p-6">
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
                    {
                      id: 'shift',
                      name: 'Shift Management',
                      icon: <Clock size={28} className="text-amber-600 dark:text-amber-400" />,
                      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
                      plan: 'Basic',
                      planColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      shortDesc: 'Cashier shift open/close with cash drawer reconciliation.',
                      description: 'Shift Management helps enforce cashier accountability by requiring shift open and close sessions. It tracks shift lifecycle, supports cash drawer reconciliation, and blocks payment completion while no active shift is available.',
                      features: ['Shift open/close workflow', 'Cash drawer reconciliation support', 'Shift schedule awareness', 'Payment completion lock when shift is inactive', 'Cashier accountability tracking'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: featureSettings.shiftEnabled,
                      canInstall: true,
                      onInstall: () => { updateFeatureSetting('shiftEnabled', true); },
                      onUninstall: () => { updateFeatureSetting('shiftEnabled', false); },
                      settingsPanel: 'addon-shift' as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'foodpanda',
                      name: 'FoodPanda Integration',
                      icon: <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZ8WyOVgm7u4MbpCHXhobc5aXOxHw7JBrB4w&s" alt="FoodPanda" className="w-7 h-7 object-contain" />,
                      iconBg: 'bg-pink-100 dark:bg-pink-900/30',
                      plan: 'Pro',
                      planColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      shortDesc: 'Receive FoodPanda orders directly in your POS.',
                      description: 'FoodPanda Integration connects your QuickServe POS directly to FoodPanda. Receive delivery orders in real-time, manage them alongside dine-in and takeaway orders, and streamline your kitchen workflow. No more switching between tablets — everything in one place.',
                      features: ['Real-time FoodPanda order sync', 'Orders appear in delivery queue', 'Automatic menu sync', 'Order status updates to FoodPanda', 'Works with Kitchen Display System', 'Unified order management'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: false,
                      canInstall: false,
                      isComingSoon: true,
                      onInstall: () => {},
                      onUninstall: null as (() => void) | null,
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'grabfood',
                      name: 'GrabFood Integration',
                      icon: <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ6fjai_GH6_ALG_h0E1FA2YjJyRi7S6tjuiQ&s" alt="GrabFood" className="w-7 h-7 object-contain" />,
                      iconBg: 'bg-green-100 dark:bg-green-900/30',
                      plan: 'Pro',
                      planColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      shortDesc: 'Receive GrabFood orders directly in your POS.',
                      description: 'GrabFood Integration connects your QuickServe POS directly to GrabFood. Receive delivery orders in real-time, manage them alongside dine-in and takeaway orders, and streamline your kitchen workflow. No more switching between tablets — everything in one place.',
                      features: ['Real-time GrabFood order sync', 'Orders appear in delivery queue', 'Automatic menu sync', 'Order status updates to GrabFood', 'Works with Kitchen Display System', 'Unified order management'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: false,
                      canInstall: false,
                      isComingSoon: true,
                      onInstall: () => {},
                      onUninstall: null as (() => void) | null,
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                    {
                      id: 'shopee',
                      name: 'Shopee Food Integration',
                      icon: <img src="https://pvc-59e770c8-2cb3-44f2-ae48-15e1acc03f35.ams3.digitaloceanspaces.com/images/Shopee%20Food.webp" alt="Shopee Food" className="w-7 h-7 object-contain" />,
                      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
                      plan: 'Pro',
                      planColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      shortDesc: 'Receive Shopee Food orders directly in your POS.',
                      description: 'Shopee Food Integration connects your QuickServe POS directly to Shopee Food. Receive delivery orders in real-time, manage them alongside dine-in and takeaway orders, and streamline your kitchen workflow. No more switching between tablets — everything in one place.',
                      features: ['Real-time Shopee Food order sync', 'Orders appear in delivery queue', 'Automatic menu sync', 'Order status updates to Shopee Food', 'Works with Kitchen Display System', 'Unified order management'],
                      version: '1.0.0',
                      author: 'QuickServe',
                      isInstalled: false,
                      canInstall: false,
                      isComingSoon: true,
                      onInstall: () => {},
                      onUninstall: null as (() => void) | null,
                      settingsPanel: null as string | null,
                      renderSettings: null as (() => React.ReactNode) | null,
                    },
                  ];

                  const selectedAddon = addonDetailView ? addonFeatures.find(f => f.id === addonDetailView) : null;

                  // ── Detail View ──
                  if (selectedAddon) {
                    const selectedAddonInstalling = isAddonActionRunning(selectedAddon.id, 'install');
                    const selectedAddonUninstalling = isAddonActionRunning(selectedAddon.id, 'uninstall');
                    const selectedAddonInstallDone = isAddonActionDone(selectedAddon.id, 'install');
                    const selectedAddonUninstallDone = isAddonActionDone(selectedAddon.id, 'uninstall');
                    const selectedAddonAwaitingUninstallConfirm = addonPendingUninstallId === selectedAddon.id;

                    return (
                      <div className="animate-in fade-in duration-300">
                        <button
                          onClick={() => { setAddonDetailView(null); setAddonDetailTab('details'); setAddonPendingUninstallId(null); }}
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
                                      selectedAddonAwaitingUninstallConfirm ? (
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              if (selectedAddonUninstalling) return;
                                              setAddonPendingUninstallId(null);
                                              void runAddonActionWithEffect(selectedAddon.id, selectedAddon.name, 'uninstall', selectedAddon.onUninstall);
                                            }}
                                            disabled={selectedAddonUninstalling}
                                            className="px-5 py-2.5 bg-red-500 text-white border border-red-600 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                          >
                                            {selectedAddonUninstalling ? (
                                              <>
                                                <RotateCw size={14} className="animate-spin" />
                                                Uninstalling...
                                              </>
                                            ) : (
                                              <>
                                                <Trash2 size={14} />
                                                Confirm Uninstall
                                              </>
                                            )}
                                          </button>
                                          <button
                                            onClick={() => setAddonPendingUninstallId(null)}
                                            disabled={selectedAddonUninstalling}
                                            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            if (selectedAddonUninstalling) return;
                                            setAddonPendingUninstallId(selectedAddon.id);
                                          }}
                                          disabled={selectedAddonUninstalling}
                                          className="px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/30 transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                          {selectedAddonUninstalling ? (
                                            <>
                                              <RotateCw size={14} className="animate-spin" />
                                              Uninstalling...
                                            </>
                                          ) : selectedAddonUninstallDone ? (
                                            <>
                                              <CheckCircle2 size={14} />
                                              Uninstalled
                                            </>
                                          ) : (
                                            <>
                                              <Trash2 size={14} />
                                              Uninstall
                                            </>
                                          )}
                                        </button>
                                      )
                                    )}
                                    </>
                                  ) : (selectedAddon as any).isComingSoon ? (
                                    <span className="px-6 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg font-black text-[10px] uppercase tracking-widest">
                                      Coming Soon
                                    </span>
                                  ) : selectedAddon.canInstall ? (
                                    <button
                                      onClick={() => {
                                        void runAddonActionWithEffect(selectedAddon.id, selectedAddon.name, 'install', selectedAddon.onInstall);
                                      }}
                                      disabled={selectedAddonInstalling}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                      {selectedAddonInstalling ? (
                                        <span className="inline-flex items-center gap-2">
                                          <RotateCw size={14} className="animate-spin" />
                                          Installing Package...
                                        </span>
                                      ) : selectedAddonInstallDone ? (
                                        <span className="inline-flex items-center gap-2">
                                          <CheckCircle2 size={14} />
                                          Installed
                                        </span>
                                      ) : (
                                        'Install'
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setShowUpgradeModal(true)}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all"
                                    >
                                      Upgrade to {selectedAddon.plan}
                                    </button>
                                  )}
                                  {(selectedAddonInstalling || selectedAddonUninstalling || selectedAddonInstallDone || selectedAddonUninstallDone) && (
                                    <span
                                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${
                                        selectedAddonInstalling || selectedAddonUninstalling
                                          ? 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800'
                                          : selectedAddonInstallDone
                                            ? 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                                            : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                                      }`}
                                    >
                                      {selectedAddonInstalling || selectedAddonUninstalling ? (
                                        <RotateCw size={12} className="animate-spin" />
                                      ) : selectedAddonInstallDone ? (
                                        <CheckCircle2 size={12} />
                                      ) : (
                                        <Trash2 size={12} />
                                      )}
                                      <span>
                                        {selectedAddonInstalling
                                          ? `Installing package: ${selectedAddon.name}...`
                                          : selectedAddonUninstalling
                                            ? `Uninstalling package: ${selectedAddon.name}...`
                                            : selectedAddonInstallDone
                                              ? `${selectedAddon.name} installed`
                                              : `${selectedAddon.name} uninstalled`}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Document-style Tabs */}
                          <div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-700 px-4 pt-2">
                            <button
                              onClick={() => setAddonDetailTab('details')}
                              style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                              className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors duration-150 rounded-t-lg border border-b-0 ${
                                addonDetailTab === 'details'
                                  ? 'bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 -mb-px z-10'
                                  : 'bg-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              Details
                            </button>
                            <button
                              onClick={() => setAddonDetailTab('setting')}
                              style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                              className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors duration-150 rounded-t-lg border border-b-0 ${
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
                                  { label: 'Status', value: selectedAddon.isInstalled ? 'Installed' : ((selectedAddon as any).isComingSoon ? 'Coming Soon' : (selectedAddon.canInstall ? 'Available' : 'Upgrade Required')) },
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
                              {(selectedAddon as any).isComingSoon ? (
                                <div className="text-center py-12">
                                  <Clock size={40} className="mx-auto text-amber-500 mb-4" />
                                  <p className="text-sm font-black dark:text-white mb-2">Coming Soon</p>
                                  <p className="text-xs text-gray-400 max-w-sm mx-auto"><span className="font-black text-gray-600 dark:text-gray-300">{selectedAddon.name}</span> is currently in development. Stay tuned for updates!</p>
                                </div>
                              ) : !selectedAddon.isInstalled ? (
                                <div className="text-center py-12">
                                  <Settings size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                                  <p className="text-sm font-black dark:text-white mb-2">Feature Not Installed</p>
                                  <p className="text-xs text-gray-400 mb-6 max-w-sm mx-auto">Please install <span className="font-black text-gray-600 dark:text-gray-300">{selectedAddon.name}</span> in order to manage its settings and configuration.</p>
                                  {selectedAddon.canInstall ? (
                                    <button
                                      onClick={() => {
                                        void runAddonActionWithEffect(selectedAddon.id, selectedAddon.name, 'install', selectedAddon.onInstall);
                                      }}
                                      disabled={selectedAddonInstalling}
                                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                      {selectedAddonInstalling ? (
                                        <span className="inline-flex items-center gap-2">
                                          <RotateCw size={14} className="animate-spin" />
                                          Installing Package...
                                        </span>
                                      ) : selectedAddonInstallDone ? (
                                        <span className="inline-flex items-center gap-2">
                                          <CheckCircle2 size={14} />
                                          Installed
                                        </span>
                                      ) : (
                                        'Install Now'
                                      )}
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
                  const existingAddons = addonFeatures.filter(a => !(a as any).isComingSoon);
                  const upcomingAddons = addonFeatures.filter(a => (a as any).isComingSoon);

                  const renderAddonCard = (addon: typeof addonFeatures[0]) => {
                    const addonInstalling = isAddonActionRunning(addon.id, 'install');
                    const addonInstallDone = isAddonActionDone(addon.id, 'install');

                    return (
                      <div
                        key={addon.id}
                        className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-orange-200 dark:hover:border-orange-800/50 transition-all cursor-pointer flex flex-col min-h-[156px]"
                        onClick={() => { setAddonDetailView(addon.id); setAddonDetailTab('details'); }}
                      >
                        {/* Card top */}
                        <div className="p-4 flex items-start gap-3 flex-1 min-h-0">
                          <div className={`w-12 h-12 rounded-lg ${addon.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                            {addon.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-black dark:text-white truncate">{addon.name}</p>
                            </div>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${addon.planColor} mb-2`}>{addon.plan} Plan</span>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{addon.shortDesc}</p>
                          </div>
                        </div>

                        {/* Card bottom */}
                        <div className="px-4 py-2.5 border-t dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between gap-2 flex-shrink-0">
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] text-gray-400 font-bold">By {addon.author}</span>
                          </div>
                          <div onClick={e => e.stopPropagation()}>
                            {addon.isInstalled ? (
                              <span className="px-3 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                Installed
                              </span>
                            ) : (addon as any).isComingSoon ? (
                              <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                Coming Soon
                              </span>
                            ) : addon.canInstall ? (
                              <button
                                onClick={() => {
                                  void runAddonActionWithEffect(addon.id, addon.name, 'install', addon.onInstall);
                                }}
                                disabled={addonInstalling}
                                className="px-3 py-1 bg-orange-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow hover:bg-orange-600 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                              >
                                {addonInstalling ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <RotateCw size={11} className="animate-spin" />
                                    Installing...
                                  </span>
                                ) : addonInstallDone ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <CheckCircle2 size={11} />
                                    Installed
                                  </span>
                                ) : (
                                  'Install'
                                )}
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
                    );
                  };

                  const addonOverviewTabs = [
                    {
                      id: 'AVAILABLE' as const,
                      label: 'Available Feature',
                      icon: <Package size={13} />,
                      count: existingAddons.length,
                      countClassName: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
                    },
                    {
                      id: 'UPCOMING' as const,
                      label: 'Upcoming Feature',
                      icon: <Clock size={13} />,
                      count: upcomingAddons.length,
                      countClassName: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                    },
                  ];

                  const activeAddonItems = addonFeatureTab === 'AVAILABLE' ? existingAddons : upcomingAddons;
                  const activeAddonConfig = addonOverviewTabs.find(tab => tab.id === addonFeatureTab)!;
                  const activeEmptyState = addonFeatureTab === 'AVAILABLE'
                    ? {
                        icon: <Package size={24} />,
                        title: 'No Available Features',
                        description: 'Installed and ready-to-enable features will appear here.',
                      }
                    : {
                        icon: <Clock size={24} />,
                        title: 'No Upcoming Features',
                        description: 'New add-on releases will be listed here once scheduled.',
                      };

                  return (
                    <>
                      <div className="mb-4">
                        <h1 className="text-xl md:text-2xl font-black dark:text-white uppercase tracking-tighter mb-1">Add-on Feature</h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Extend your POS with installable tools and upcoming releases.</p>
                      </div>

                      <div className="flex gap-0 relative">
                        {addonOverviewTabs.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setAddonFeatureTab(tab.id)}
                            style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                            className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                              addonFeatureTab === tab.id
                                ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                                : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                          >
                            {tab.icon}
                            <span>{tab.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${tab.countClassName}`}>
                              {tab.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-4 md:p-5 xl:p-6 rounded-b-2xl rounded-tr-2xl">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-400 mb-1.5">{addonFeatureTab === 'AVAILABLE' ? 'Installable Now' : 'Roadmap Preview'}</p>
                            <h2 className="text-base md:text-lg font-black dark:text-white uppercase tracking-tight">{activeAddonConfig.label}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {addonFeatureTab === 'AVAILABLE'
                                ? 'Manage features that are already live for your restaurant.'
                                : 'Preview planned features and open their detail cards for more context.'}
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${addonFeatureTab === 'AVAILABLE' ? 'bg-green-50 dark:bg-green-900/20 text-green-500' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'}`}>
                              {activeAddonConfig.icon}
                            </span>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-400">Total</p>
                              <p className="text-xs md:text-sm font-black text-gray-900 dark:text-white">{activeAddonItems.length} feature{activeAddonItems.length === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                        </div>

                        {activeAddonItems.length === 0 ? (
                          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-10 md:p-14 text-center border border-dashed border-gray-300 dark:border-gray-600">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                              {activeEmptyState.icon}
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">{activeEmptyState.title}</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{activeEmptyState.description}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {activeAddonItems.map(renderAddonCard)}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'BILLING' && (
            <WalletBillingPage
              restaurant={restaurant}
              restaurantId={restaurant.id}
              subscription={subscription}
              onUpgradeClick={() => setShowUpgradeModal(true)}
              onSubscriptionUpdated={onSubscriptionUpdated}
              onComparePlans={onComparePlans}
            />
          )}

          {/* Mail Tab */}
          {activeTab === 'MAIL' && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter flex items-center gap-2">
                      <Mail size={18} className="text-orange-500" /> Inbox
                      {unreadMailCount > 0 && (
                        <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-black">{unreadMailCount} new</span>
                      )}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Announcements and updates from QuickServe.</p>
                  </div>
                  {announcements.length > 0 && (
                    <div className="flex items-center gap-2">
                      {unreadMailCount > 0 && (
                        <button
                          onClick={() => onMarkAllAnnouncementsRead?.()}
                          className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-xl transition-colors"
                        >
                          <CheckCircle2 size={13} /> Mark All Read
                        </button>
                      )}
                      <button
                        onClick={() => onClearAnnouncements?.()}
                        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                      >
                        <Trash2 size={13} /> Clear All
                      </button>
                    </div>
                  )}
                </div>

                {announcementsLoading ? (
                  <div className="flex items-center justify-center py-32">
                    <RotateCw size={28} className="animate-spin text-gray-400" />
                  </div>
                ) : announcements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32">
                    <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                      <Mail size={36} className="text-gray-300 dark:text-gray-600" />
                    </div>
                    <p className="text-base font-bold dark:text-gray-300">No announcements yet</p>
                    <p className="text-sm text-gray-400 mt-1">When the admin sends updates, they will appear here.</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden divide-y dark:divide-gray-700">
                    {announcements.map(a => (
                      <div
                        key={a.id}
                        onClick={() => { if (!a.is_read) onMarkAnnouncementRead?.(a.id); }}
                        className={`px-5 py-4 transition-all cursor-pointer flex items-start gap-4 ${
                          a.is_read
                            ? 'hover:bg-gray-50 dark:hover:bg-gray-750'
                            : 'bg-orange-50/60 dark:bg-orange-900/10 hover:bg-orange-50 dark:hover:bg-orange-900/15'
                        }`}
                      >
                        {/* Category icon */}
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          a.category === 'billing' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                          a.category === 'update' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                          a.category === 'maintenance' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                          a.category === 'promotion' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {a.category === 'billing' ? <Wallet size={16} /> :
                           a.category === 'update' ? <Zap size={16} /> :
                           a.category === 'maintenance' ? <AlertCircle size={16} /> :
                           a.category === 'promotion' ? <Star size={16} /> :
                           <Mail size={16} />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {!a.is_read && <span className="w-2 h-2 bg-orange-500 rounded-full shrink-0" />}
                            <h3 className={`text-sm truncate ${!a.is_read ? 'font-black dark:text-white' : 'font-semibold text-gray-700 dark:text-gray-300'}`}>{a.title}</h3>
                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${
                              a.category === 'billing' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                              a.category === 'update' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                              a.category === 'maintenance' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                              a.category === 'promotion' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}>{a.category}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line leading-relaxed line-clamp-2">{a.body}</p>
                        </div>

                        {/* Date & status */}
                        <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold whitespace-nowrap">
                            {new Date(a.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-[9px] text-gray-300 dark:text-gray-600">
                            {new Date(a.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {a.is_read ? (
                            <CheckCircle2 size={12} className="text-gray-300 dark:text-gray-600 mt-1" />
                          ) : (
                            <span className="text-[8px] font-black text-orange-500 uppercase mt-1">New</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* QR Orders Tab - Document-style sub-tabs */}
          {activeTab === 'QR_ORDERS' && showQrFeature && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="w-full">
                {/* Header */}
                <div className="mb-5">
                  <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">QR & Table Order</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage incoming QR scan and tableside orders.</p>
                </div>

                {/* Document-style tab bar */}
                <div className="flex gap-0 relative">
                  {([
                    { id: 'INCOMING' as const, label: 'Incoming Orders', icon: <QrCode size={13} /> },
                    { id: 'QR_GENERATOR' as const, label: 'QR Generator', icon: <QrCode size={13} /> },
                    { id: 'SETTING_TAB' as const, label: 'Setting', icon: <Settings size={13} /> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setQrOrderSubTab(tab.id)}
                      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                        qrOrderSubTab === tab.id
                          ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-tab content */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl rounded-tr-2xl">

                {/* ── Incoming Orders Sub-tab ── */}
                {qrOrderSubTab === 'INCOMING' && (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">Manage orders placed via QR table scan.</p>
                      <div className="flex items-center gap-3">
                        <div className="flex bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm overflow-x-auto hide-scrollbar">
                          <button onClick={() => setQrOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Ongoing</button>
                          <button onClick={() => setQrOrderFilter(OrderStatus.SERVED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.SERVED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Served</button>
                          <button onClick={() => setQrOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Cancelled</button>
                          <button onClick={() => setQrOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${qrOrderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>All</button>
                        </div>
                        <div className="flex bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm shrink-0">
                          <button onClick={() => setQrOrderView('grid')} className={`p-2 rounded-md transition-all ${qrOrderView === 'grid' ? 'bg-white dark:bg-gray-600 text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}><LayoutGrid size={13} /></button>
                          <button onClick={() => setQrOrderView('list')} className={`p-2 rounded-md transition-all ${qrOrderView === 'list' ? 'bg-white dark:bg-gray-600 text-orange-500 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}><List size={13} /></button>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const filteredQrOrders = orders.filter(o => {
                        if (o.orderSource !== 'qr_order' && o.orderSource !== 'tableside') return false;
                        if (qrOrderFilter === 'ALL') return true;
                        if (qrOrderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
                        return o.status === qrOrderFilter;
                      });

                      if (filteredQrOrders.length === 0) {
                        return (
                          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-600">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                              <QrCode size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">No QR Orders</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Waiting for customers to scan and order...</p>
                          </div>
                        );
                      }

                      return (
                        <>
                          {qrOrderView === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {filteredQrOrders.map(order => {
                                const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                                const orderId = typeof order.id === 'string' ? order.id.slice(-6).toUpperCase() : String(order.id).slice(-6).toUpperCase();
                                const orderTime = new Date(order.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' · ' + new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                const borderColor = order.status === OrderStatus.PENDING ? 'border-l-amber-400' : order.status === OrderStatus.ONGOING ? 'border-l-blue-500' : order.status === OrderStatus.SERVED ? 'border-l-purple-500' : order.status === OrderStatus.COMPLETED ? 'border-l-green-500' : 'border-l-red-400';
                                const statusPill = <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${order.status === OrderStatus.PENDING ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : order.status === OrderStatus.ONGOING ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : order.status === OrderStatus.SERVED ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{order.status}</span>;
                                const actionButtons = (compact?: boolean) => (<>
                                  {showKitchenFeature && !isKitchenUser && (order.status === OrderStatus.PENDING || order.status === OrderStatus.ONGOING) ? (
                                    <div className={`${compact ? 'px-3 py-1.5 text-[9px]' : 'px-4 py-2 text-[10px]'} rounded-lg font-black uppercase tracking-widest text-center whitespace-nowrap ${order.status === OrderStatus.PENDING ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>{order.status === OrderStatus.PENDING ? 'Waiting for Kitchen' : 'Kitchen Preparing'}</div>
                                  ) : (
                                    <div className="flex justify-between gap-1.5">
                                      {order.status === OrderStatus.PENDING && (<><button onClick={() => setRejectingQrOrderId(order.id)} className={`${compact ? 'w-[47.5%] px-2 py-1.5 text-[9px]' : 'w-[47.5%] py-2.5 text-[10px]'} rounded-lg font-black uppercase tracking-widest border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all`}>Reject</button><button onClick={() => onUpdateOrder(order.id, OrderStatus.ONGOING)} className={`${compact ? 'w-[47.5%] px-2 py-1.5 text-[9px]' : 'w-[47.5%] py-2.5 text-[10px]'} bg-orange-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow`}>Accept</button></>)}
                                      {order.status === OrderStatus.ONGOING && (<button onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)} className={`${compact ? 'w-full px-3 py-1.5 text-[9px]' : 'w-full py-2.5 text-[10px]'} bg-green-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow`}>Serve</button>)}
                                      {order.status === OrderStatus.SERVED && (<button onClick={() => { setSelectedQrOrderForPayment(order); setActiveTab('COUNTER'); setCounterMode('QR_ORDER'); }} className={`${compact ? 'w-full px-3 py-1.5 text-[9px]' : 'w-full py-2.5 text-[10px]'} bg-blue-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow`}>Collect Payment</button>)}
                                      {(order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) && (<div className={`${compact ? 'w-full px-3 py-1.5 text-[9px]' : 'w-full py-2.5 text-[10px]'} rounded-lg font-black uppercase tracking-widest text-center ${order.status === OrderStatus.COMPLETED ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>{order.status}</div>)}
                                    </div>
                                  )}
                                </>);
                                return (
                                  <div key={order.id} className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 ${borderColor} rounded-xl flex flex-col cursor-pointer hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-600 transition-all`} onClick={() => handleEditQrOrder(order)}>
                                    <div className="flex items-center justify-between px-4 pt-3 pb-1">
                                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Items: <span className="text-gray-900 dark:text-white font-black">{totalQty}</span></span>
                                      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400"><Clock size={10} /><span className="text-[10px]">{orderTime}</span></div>
                                    </div>
                                    <div className="px-4 pb-3">
                                      <button onClick={(e) => { e.stopPropagation(); setViewingQrOrderDetail(order); }} className="text-orange-500 hover:text-orange-600 text-[11px] font-black uppercase tracking-wider transition-colors">View Order Details →</button>
                                    </div>
                                    <div className="h-px bg-gray-100 dark:bg-gray-700" />
                                    <div className="flex items-center justify-between px-4 py-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">{order.orderSource === 'tableside' ? <Tablet size={14} className="text-orange-500" /> : <QrCode size={14} className="text-orange-500" />}</div>
                                        <div>
                                          <p className="text-[11px] font-black text-gray-800 dark:text-white uppercase tracking-tight">#{orderId}</p>
                                          <p className="text-[10px] text-gray-500 dark:text-gray-400">{order.tableNumber}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">{statusPill}<p className="text-lg font-black text-gray-900 dark:text-white mt-1">{currencySymbol}{order.total.toFixed(2)}</p></div>
                                    </div>
                                    <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>{actionButtons()}</div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* ── List / Table view ── */
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[9px] font-black uppercase tracking-widest border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                      <th className="px-5 py-3 text-center">Status</th>
                                      <th className="px-5 py-3 text-center">Order No.</th>
                                      <th className="px-5 py-3 text-center">Table</th>
                                      <th className="px-5 py-3 text-center">Date</th>
                                      <th className="px-5 py-3 text-center">Time</th>
                                      <th className="px-5 py-3 text-center">Items</th>
                                      <th className="px-5 py-3 text-center">Details</th>
                                      <th className="px-5 py-3 text-center">Total</th>
                                      <th className="px-5 py-3 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredQrOrders.map(order => {
                                      const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                                      const orderId = typeof order.id === 'string' ? order.id.slice(-6).toUpperCase() : String(order.id).slice(-6).toUpperCase();
                                      const orderDate = new Date(order.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
                                      const orderTimeStr = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                      const statusPill = <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${order.status === OrderStatus.PENDING ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : order.status === OrderStatus.ONGOING ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : order.status === OrderStatus.SERVED ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{order.status}</span>;
                                      const actionButtons = (compact?: boolean) => (<>
                                        {showKitchenFeature && !isKitchenUser && (order.status === OrderStatus.PENDING || order.status === OrderStatus.ONGOING) ? (
                                          <div className={`${compact ? 'px-3 py-1.5 text-[9px]' : 'px-4 py-2 text-[10px]'} rounded-lg font-black uppercase tracking-widest text-center whitespace-nowrap ${order.status === OrderStatus.PENDING ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>{order.status === OrderStatus.PENDING ? 'In Kitchen' : 'Preparing'}</div>
                                        ) : (
                                          <div className="flex justify-between gap-1.5">
                                            {order.status === OrderStatus.PENDING && (<><button onClick={() => setRejectingQrOrderId(order.id)} className="w-[47.5%] px-2 py-1.5 text-[9px] rounded-lg font-black uppercase tracking-widest border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Reject</button><button onClick={() => onUpdateOrder(order.id, OrderStatus.ONGOING)} className="w-[47.5%] px-2 py-1.5 text-[9px] bg-orange-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow">Accept</button></>)}
                                            {order.status === OrderStatus.ONGOING && (<button onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)} className="w-full px-3 py-1.5 text-[9px] bg-green-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow">Serve</button>)}
                                            {order.status === OrderStatus.SERVED && (<button onClick={() => { setSelectedQrOrderForPayment(order); setActiveTab('COUNTER'); setCounterMode('QR_ORDER'); }} className="w-full px-3 py-1.5 text-[9px] bg-blue-500 text-white rounded-lg font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow">Collect Payment</button>)}
                                            {(order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) && (<div className={`w-full px-3 py-1.5 text-[9px] rounded-lg font-black uppercase tracking-widest text-center ${order.status === OrderStatus.COMPLETED ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>{order.status}</div>)}
                                          </div>
                                        )}
                                      </>);
                                      return (
                                        <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer" onClick={() => handleEditQrOrder(order)}>
                                          <td className="px-5 py-3 text-center">{statusPill}</td>
                                          <td className="px-5 py-3 text-center text-[11px] font-black text-gray-800 dark:text-white uppercase">#{orderId}</td>
                                          <td className="px-5 py-3 text-center text-[10px] text-gray-600 dark:text-gray-300">{order.tableNumber}</td>
                                          <td className="px-5 py-3 text-center text-[10px] text-gray-500 dark:text-gray-400">{orderDate}</td>
                                          <td className="px-5 py-3 text-center text-[10px] text-gray-500 dark:text-gray-400">{orderTimeStr}</td>
                                          <td className="px-5 py-3 text-center text-[10px] text-gray-500 dark:text-gray-400">{totalQty}</td>
                                          <td className="px-5 py-3 text-center"><button onClick={(e) => { e.stopPropagation(); setViewingQrOrderDetail(order); }} className="text-orange-500 hover:text-orange-600 text-[10px] font-black uppercase tracking-wider transition-colors whitespace-nowrap">View Details →</button></td>
                                          <td className="px-5 py-3 text-center text-[10px] font-black text-gray-900 dark:text-white whitespace-nowrap">{currencySymbol}{order.total.toFixed(2)}</td>
                                          <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>{actionButtons(true)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* ── Order Detail Modal ── */}
                    {viewingQrOrderDetail && (() => {
                      const o = viewingQrOrderDetail;
                      const modLine = (item: typeof o.items[0]) => {
                        const parts: string[] = [];
                        if (item.selectedSize) parts.push(item.selectedSize);
                        if (item.selectedTemp) parts.push(item.selectedTemp);
                        if (item.selectedOtherVariant) parts.push(item.selectedOtherVariant);
                        if (item.selectedModifiers) Object.values(item.selectedModifiers).forEach(v => v && parts.push(v));
                        if (item.selectedAddOns) item.selectedAddOns.forEach(a => parts.push(a.quantity > 1 ? `${a.name} ×${a.quantity}` : a.name));
                        return parts.join('  ·  ');
                      };
                      return (
                        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setViewingQrOrderDetail(null)}>
                          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-[440px] sm:h-[600px] flex flex-col" onClick={e => e.stopPropagation()}>

                            {/* Modal header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex items-center justify-center">
                                  <QrCode size={16} className="text-orange-500" />
                                </div>
                                <div>
                                  <p className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-sm">
                                    #{typeof o.id === 'string' ? o.id.slice(-6).toUpperCase() : String(o.id).slice(-6).toUpperCase()}
                                  </p>
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                    {o.tableNumber} · {new Date(o.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })} {new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest ${
                                  o.status === OrderStatus.PENDING ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  o.status === OrderStatus.ONGOING ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                  o.status === OrderStatus.SERVED  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                  o.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>{o.status}</span>
                                <button onClick={() => setViewingQrOrderDetail(null)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">
                                  <X size={15} />
                                </button>
                              </div>
                            </div>

                            {/* Items list */}
                            <div className="overflow-y-auto flex-1 px-5 py-3 divide-y divide-gray-100 dark:divide-gray-700/50">
                              {getSortedOrderItems(o).map((item, idx) => (
                                <div key={`modal-${o.id}-${idx}`} className="flex items-start gap-3 py-2.5">
                                  <span className="text-xs font-black text-gray-500 dark:text-gray-400 shrink-0 w-5 pt-0.5">×{item.quantity}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800 dark:text-white">{item.name}</p>
                                    {modLine(item) && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{modLine(item)}</p>}
                                  </div>
                                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0">{currencySymbol}{(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>

                            {/* Remark */}
                            {o.remark && (
                              <div className="mx-5 mb-3 px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-lg flex items-start gap-2 shrink-0">
                                <MessageSquare size={11} className="text-orange-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-gray-600 dark:text-gray-300 italic">{o.remark}</p>
                              </div>
                            )}

                            {/* Total + Actions */}
                            <div className="border-t border-gray-100 dark:border-gray-700 px-5 pt-4 pb-6 shrink-0">
                              <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Grand Total</span>
                                <span className="text-2xl font-black text-gray-900 dark:text-white">{currencySymbol}{o.total.toFixed(2)}</span>
                              </div>
                              {(o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING) && (
                                <button onClick={() => handleEditQrOrder(o)} className="w-full py-3 mb-3 rounded-xl font-black text-xs uppercase tracking-widest border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                                  Edit Order
                                </button>
                              )}
                              {showKitchenFeature && !isKitchenUser && (o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING) ? (
                                <div className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-center ${o.status === OrderStatus.PENDING ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                                  {o.status === OrderStatus.PENDING ? 'Waiting for Kitchen' : 'Kitchen Preparing'}
                                </div>
                              ) : (
                                <>
                                  {o.status === OrderStatus.PENDING && (
                                    <div className="flex justify-between">
                                      <button onClick={() => { setRejectingQrOrderId(o.id); setViewingQrOrderDetail(null); }} className="w-[47.5%] py-3 rounded-xl font-black text-xs uppercase tracking-widest border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">Reject</button>
                                      <button onClick={() => { onUpdateOrder(o.id, OrderStatus.ONGOING); setViewingQrOrderDetail(null); }} className="w-[47.5%] py-3 bg-orange-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg">Accept</button>
                                    </div>
                                  )}
                                  {o.status === OrderStatus.ONGOING && (
                                    <button onClick={() => { onUpdateOrder(o.id, OrderStatus.SERVED); setViewingQrOrderDetail(null); }} className="w-full py-3 bg-green-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg">
                                      Serve Order
                                    </button>
                                  )}
                                  {o.status === OrderStatus.SERVED && (
                                    <button onClick={() => {
                                      setSelectedQrOrderForPayment(o);
                                      setViewingQrOrderDetail(null);
                                      setActiveTab('COUNTER');
                                      setCounterMode('QR_ORDER');
                                    }} className="w-full py-3 bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg">
                                      Collect Payment
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── QR Generator Sub-tab ── */}
                {qrOrderSubTab === 'QR_GENERATOR' && (
                  <div className="space-y-4">
                    {featureSettings.qrEnabled ? (
                      renderQrGeneratorContent()
                    ) : (
                      <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/30 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                        <QrCode size={36} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-sm font-black dark:text-white mb-1">QR Ordering Not Installed</p>
                        <p className="text-[10px] text-gray-400">Please install QR Ordering in order to manage its settings and configuration.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Setting Sub-tab ── */}
                {qrOrderSubTab === 'SETTING_TAB' && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">QR Order Settings</p>
                      {featureSettings.qrEnabled ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div>
                              <p className="text-xs font-black dark:text-white">Auto-Approve Order</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Automatically approve incoming QR orders</p>
                            </div>
                            <button
                              onClick={() => toggleQrOrderSetting('autoApprove')}
                              className={`w-11 h-6 rounded-full transition-all relative ${qrOrderSettings.autoApprove ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${qrOrderSettings.autoApprove ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div>
                              <p className="text-xs font-black dark:text-white">Auto-Print Order</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Automatically print incoming QR orders</p>
                            </div>
                            <button
                              onClick={() => toggleQrOrderSetting('autoPrint')}
                              className={`w-11 h-6 rounded-full transition-all relative ${
                                !connectedDevice
                                  ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                                  : qrOrderSettings.autoPrint ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              disabled={!connectedDevice}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                !connectedDevice
                                  ? 'left-1 opacity-50'
                                  : qrOrderSettings.autoPrint ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                          </div>
                          {!connectedDevice && qrOrderSettings.autoPrint && (
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                              <p className="text-[10px] text-yellow-600 dark:text-yellow-400">Auto-print enabled but no printer connected. Connect a printer to use this feature.</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">Please install QR Ordering in order to manage its settings and configuration.</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 space-y-3">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tableside Order Settings</p>
                      {featureSettings.tablesideOrderingEnabled ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div>
                              <p className="text-xs font-black dark:text-white">Auto-Approve Order</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Automatically approve incoming tableside orders</p>
                            </div>
                            <button
                              onClick={() => toggleTablesideOrderSetting('autoApprove')}
                              className={`w-11 h-6 rounded-full transition-all relative ${tablesideOrderSettings.autoApprove ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${tablesideOrderSettings.autoApprove ? 'left-6' : 'left-1'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                            <div>
                              <p className="text-xs font-black dark:text-white">Auto-Print Order</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Automatically print incoming tableside orders</p>
                            </div>
                            <button
                              onClick={() => toggleTablesideOrderSetting('autoPrint')}
                              className={`w-11 h-6 rounded-full transition-all relative ${
                                !connectedDevice
                                  ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                                  : tablesideOrderSettings.autoPrint ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                              disabled={!connectedDevice}
                            >
                              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                !connectedDevice
                                  ? 'left-1 opacity-50'
                                  : tablesideOrderSettings.autoPrint ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                          </div>
                          {!connectedDevice && tablesideOrderSettings.autoPrint && (
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                              <p className="text-[10px] text-yellow-600 dark:text-yellow-400">Auto-print enabled but no printer connected. Connect a printer to use this feature.</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                          <p className="text-[10px] text-gray-500 dark:text-gray-400">Please install Tableside Ordering in order to manage its settings and configuration.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                </div>
              </div>
            </div>
          )}


          {activeTab === 'ONLINE_ORDERS' && showOnlineShopFeature && (
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="w-full">
                {/* Header */}
                <div className="mb-5">
                  <h2 className="text-lg font-black dark:text-white uppercase tracking-tighter">Online Shop</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage your online storefront — orders, products, wallet &amp; settings all in one place.</p>
                </div>

                {/* Document-style tab bar */}
                <div className="flex gap-0 relative">
                  {([
                    { id: 'INCOMING' as const, label: 'Incoming Orders', icon: <ShoppingBag size={13} /> },
                    { id: 'PRODUCT' as const, label: 'Product', icon: <Package size={13} /> },
                    { id: 'SETTING' as const, label: 'Setting', icon: <Settings size={13} /> },
                  ]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setOnlineOrderSubTab(tab.id);
                        if (tab.id === 'SETTING' && subscription?.stripe_customer_id && onlineStripeBalance === null) {
                          setIsLoadingStripeBalance(true);
                          fetch(`/api/stripe/billing?action=balance&customerId=${encodeURIComponent(subscription.stripe_customer_id)}`)
                            .then(r => r.json())
                            .then(data => setOnlineStripeBalance(data.balance ?? 0))
                            .catch(() => setOnlineStripeBalance(0))
                            .finally(() => setIsLoadingStripeBalance(false));
                        }
                      }}
                      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                      className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                        onlineOrderSubTab === tab.id
                          ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-tab content */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl rounded-tr-2xl">
                {/* ── Incoming Orders Sub-tab ── */}
                {onlineOrderSubTab === 'INCOMING' && (
                  <>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">Manage orders placed via your online shop link.</p>
                      <div className="flex items-center gap-3">
                        <div className="flex bg-gray-50 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm overflow-x-auto hide-scrollbar">
                          <button onClick={() => setOnlineOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${onlineOrderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Ongoing</button>
                          <button onClick={() => setOnlineOrderFilter(OrderStatus.SERVED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${onlineOrderFilter === OrderStatus.SERVED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Served</button>
                          <button onClick={() => setOnlineOrderFilter(OrderStatus.COMPLETED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${onlineOrderFilter === OrderStatus.COMPLETED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Paid</button>
                          <button onClick={() => setOnlineOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${onlineOrderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>Cancelled</button>
                          <button onClick={() => setOnlineOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${onlineOrderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>All</button>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const filteredOnlineOrders = orders.filter(o => {
                        if (o.orderSource !== 'online') return false;
                        if (onlineOrderFilter === 'ALL') return true;
                        if (onlineOrderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
                        return o.status === onlineOrderFilter;
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
                                      order.orderSource === 'tableside' ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {order.orderSource === 'online' ? 'Online' : order.orderSource === 'qr_order' ? 'QR' : order.orderSource === 'tableside' ? 'Tableside' : order.orderSource}
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
                                  <span className="text-[10px] font-black text-gray-500 dark:text-gray-400">{order.tableNumber}</span>
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
                                      diningType: order.diningType,
                                      total: order.total,
                                    });
                                    setSelectedCashAmount(order.total);
                                    setCashAmountInput(order.total.toFixed(2));
                                    setSelectedPaymentType(getFirstEnabledPaymentTypeId(paymentTypes));
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
                                <span className="text-xs font-black">{order.tableNumber}</span>
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
            ${shiftRequired ? 'opacity-40' : ''}
          `} style={shiftRequired ? { filter: 'grayscale(0.3)' } : undefined}>
            {/* Sidebar header */}
            <div className="p-4 border-b dark:border-gray-700">
              {editingQrOrderId && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-3">
                  <Edit3 size={13} className="text-blue-500 shrink-0" />
                  <span className="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">Editing QR Order #{editingQrOrderId.slice(-6).toUpperCase()}</span>
                </div>
              )}
                  {(showSavedBillFeature || showQrFeature) && (
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-3">
                      {showSavedBillFeature && (
                        <button
                          onClick={() => { if (editingQrOrderId) return; setCounterMode('SAVED_BILL'); setSelectedQrOrderForPayment(null); }}
                          className={`relative flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                            editingQrOrderId
                              ? 'bg-blue-500 text-white shadow-sm'
                              : counterMode === 'SAVED_BILL' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >{editingQrOrderId ? 'Edit Order' : 'SAVED BILL'}
                          {!editingQrOrderId && savedBills.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{savedBills.length}</span>
                          )}
                        </button>
                      )}
                      {!showSavedBillFeature && editingQrOrderId && (
                        <button
                          className="relative flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all bg-blue-500 text-white shadow-sm"
                        >Edit Order</button>
                      )}
                      <button
                        onClick={() => { if (editingQrOrderId) { setEditingQrOrderId(null); setPosCart([]); setPosRemark(''); setPosTableNo('Counter'); setPosDiningType(preferredDiningOption); } setCounterMode('COUNTER_ORDER'); setSelectedQrOrderForPayment(null); }}
                        className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                          !editingQrOrderId && counterMode === 'COUNTER_ORDER' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >Counter</button>
                      {showQrFeature && (() => {
                        const servedQrCount = orders.filter(o => o.status === OrderStatus.SERVED).length;
                        return (
                        <button
                          onClick={() => { if (editingQrOrderId) { setEditingQrOrderId(null); setPosCart([]); setPosRemark(''); setPosTableNo('Counter'); setPosDiningType(preferredDiningOption); } setCounterMode('QR_ORDER'); setSelectedQrOrderForPayment(null); }}
                          className={`relative flex-1 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                            !editingQrOrderId && counterMode === 'QR_ORDER' ? 'bg-white dark:bg-gray-800 text-orange-500 shadow-sm' : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >QR Order
                          {servedQrCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{servedQrCount}</span>
                          )}
                        </button>
                        );
                      })()}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <h3 className="font-black dark:text-white uppercase tracking-tighter text-sm">
                      {editingQrOrderId
                        ? `Editing Order #${editingQrOrderId.slice(-6).toUpperCase()}`
                        : showSavedBillFeature && counterMode === 'SAVED_BILL'
                        ? 'Saved Bills'
                        : showQrFeature && counterMode === 'QR_ORDER'
                        ? (selectedQrOrderForPayment ? `Order #${selectedQrOrderForPayment.id.slice(-6).toUpperCase()}` : 'QR Order')
                        : activeSavedBillTable && counterMode === 'COUNTER_ORDER' && posTableNo === activeSavedBillTable
                        ? `Editing Saved Bill: ${activeSavedBillTable}`
                        : 'Current Order'}
                    </h3>
                    {!editingQrOrderId && (counterMode === 'COUNTER_ORDER' || (!showQrFeature && counterMode !== 'SAVED_BILL')) && (
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
              <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {!selectedSavedBillEntry ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                    <Receipt size={48} className="mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Select a pending table from the left panel</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                      <Receipt size={14} className="text-orange-500 shrink-0" />
                      <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">{selectedSavedBillEntry.tableNumber}</span>
                    </div>
                    {selectedSavedBillEntry.items.map((item, idx) => (
                      <div key={`saved-${item.id}-${idx}`} className="flex items-center gap-4">
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
                        <span className="text-xs font-black dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">x{item.quantity}</span>
                      </div>
                    ))}
                    {selectedSavedBillEntry.remark && (
                      <div className="p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
                        <p className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest mb-1">Remark</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 italic">{selectedSavedBillEntry.remark}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <span>Subtotal</span>
                    <span>{currencySymbol}{selectedSavedBillSubtotal.toFixed(2)}</span>
                  </div>
                  {selectedSavedBillTaxLines.map(tax => (
                    <div key={`saved-tax-${tax.id}`} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span>{tax.name} ({tax.percentage.toFixed(2)}%)</span>
                      <span>{currencySymbol}{tax.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                    <span className="uppercase">Total</span>
                    <span className="text-orange-500">{currencySymbol}{selectedSavedBillGrandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { if (activeSavedBillTable) loadSavedBill(activeSavedBillTable); }}
                    disabled={!selectedSavedBillEntry || isCompletingPayment}
                    className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                  >
                    Edit Bill
                  </button>
                  <button
                    onClick={handleSavedBillCheckout}
                    disabled={!selectedSavedBillEntry || isCompletingPayment}
                    className="flex-[2] py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    Complete Payment
                  </button>
                </div>
              </div>
              </>
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
                        <span className="text-[10px] font-black text-purple-700 dark:text-purple-400 uppercase tracking-widest">{selectedQrOrderForPayment.tableNumber}</span>
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
                      <button
                        onClick={() => { if (selectedQrOrderForPayment) handleEditQrOrder(selectedQrOrderForPayment); }}
                        disabled={!selectedQrOrderForPayment || isCompletingPayment}
                        className="flex-1 py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Edit3 size={14} /> Edit Order
                      </button>
                      <button
                        onClick={handleQrOrderCheckout}
                        disabled={!selectedQrOrderForPayment || isCompletingPayment}
                        className="flex-[2] py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
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
                {!editingQrOrderId && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Table</label>
                      <button
                        type="button"
                        onClick={openCounterTablePicker}
                        className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white text-left flex items-center justify-between hover:border-orange-300 dark:hover:border-orange-500 transition-all"
                      >
                        <span>{posTableNo || 'Counter'}</span>
                        <ChevronDown size={14} className="text-gray-400" />
                      </button>
                    </div>
                    <div className="flex-[2]">
                      <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Dining Option</label>
                      <select value={posDiningType} onChange={e => setPosDiningType(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white">
                        {availableDiningOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pb-2">
                  {editingQrOrderId ? (
                    <>
                      <button
                        onClick={() => { setEditingQrOrderId(null); setPosCart([]); setPosRemark(''); setPosTableNo('Counter'); setPosDiningType(preferredDiningOption); }}
                        className="w-[47.5%] py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveQrOrderEdit}
                        disabled={posCart.length === 0}
                        className="w-[47.5%] py-4 bg-blue-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
                      >
                        Save Changes
                      </button>
                    </>
                  ) : showSavedBillFeature ? (
                    <>
                      <button
                        onClick={saveCurrentBill}
                        disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                        className="w-[47.5%] py-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                      >
                        Save Bill
                      </button>
                      <button
                        onClick={handleCheckout}
                        disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                        className="w-[47.5%] py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
                      >
                        {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Payment'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCheckout}
                      disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess}
                      className="w-full py-4 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
                    >
                      {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Payment'}
                    </button>
                  )}
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
                  <select value={posDiningType} onChange={e => setPosDiningType(e.target.value)} className="w-full p-2.5 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-[10px] font-black dark:text-white">
                    {availableDiningOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
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
          <div className="bg-white dark:bg-gray-800 rounded-t-3xl lg:rounded-3xl shadow-2xl w-full lg:max-w-4xl h-[100dvh] lg:h-[900px] lg:max-h-[99dvh] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Payment Input View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-in-out ${showPaymentResult ? '-translate-x-full' : 'translate-x-0'}`}>
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={isCompletingPayment}
                className="absolute top-4 right-5 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50"
              >
                <X size={28} className="text-gray-400" />
              </button>

              <div className="relative flex-1 min-h-0 overflow-hidden pt-[3.75rem]">
                {/* Main payment view */}
                <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${showPaymentAmountKeypad ? '-translate-x-full' : 'translate-x-0'}`}>
                  {/* Content */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 lg:px-8 pb-6 lg:pb-8 pt-8 lg:pt-10 space-y-4 lg:space-y-6">
                    {/* Total Amount Due - Centered */}
                    <div className="text-center space-y-2 lg:space-y-3">
                      <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Total Amount Due</label>
                      <div className="text-4xl lg:text-6xl font-black text-orange-500 tracking-tighter">
                        {currencySymbol}{pendingOrderData.total.toFixed(2)}
                      </div>
                    </div>

                    {/* Amount Received - Tap to keypad */}
                    <div className="space-y-3 mt-6 lg:mt-8">
                      <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                      <button
                        type="button"
                        onClick={openPaymentAmountKeypad}
                        className="w-full flex items-center justify-center border-b-2 dark:border-gray-600 border-gray-300 hover:border-orange-500 dark:hover:border-orange-500 transition-colors pb-2"
                      >
                        <span className="text-2xl font-black text-gray-600 dark:text-gray-400">{currencySymbol}</span>
                        <span className="flex-1 p-2 text-2xl font-black dark:text-white text-center">
                          {cashAmountInput || '0.00'}
                        </span>
                      </button>
                    </div>

                    {/* Cash Denomination Boxes */}
                    <div className="space-y-2 lg:space-y-3">
                      <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Quick Select</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3">
                        {paymentQuickSelectAmounts.map((amount, index) => (
                          <button
                            key={`pay-quick-${index}-${amount}`}
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
                      <div className="grid grid-cols-3 gap-2 lg:gap-3">
                        {Array.from({ length: 3 }, (_, index) => {
                          const type = paymentMethodButtons[index];
                          if (!type) return <div key={`payment-method-empty-${index}`} aria-hidden="true" />;
                          const selected = selectedPaymentType === type.id;
                          return (
                            <button
                              key={type.id}
                              type="button"
                              onClick={() => setSelectedPaymentType(type.id)}
                              className={`py-3 lg:py-3.5 rounded-xl border-2 text-sm lg:text-base font-black uppercase tracking-widest transition-all ${
                                selected
                                  ? 'bg-orange-500 text-white border-orange-600 shadow-lg'
                                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500'
                              }`}
                            >
                              {type.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Remark */}
                    <div className="space-y-2 lg:space-y-3">
                      <label className="block text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Remark</label>
                      <textarea
                        value={pendingOrderData.remark || ''}
                        onChange={(e) => {
                          const nextRemark = e.target.value;
                          setPendingOrderData((prev: any) => ({ ...(prev || {}), remark: nextRemark }));
                          setPosRemark(nextRemark);
                        }}
                        rows={2}
                        placeholder="Optional order note"
                        className="w-full p-2.5 lg:p-3 bg-white dark:bg-gray-700 border-2 dark:border-gray-600 rounded-xl text-sm lg:text-base font-semibold dark:text-white focus:outline-none focus:border-orange-500 dark:focus:border-orange-500 resize-none"
                      />
                    </div>
                  </div>

                  {/* Footer / Action Buttons */}
                  <div className="px-5 lg:px-8 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:py-5 border-t dark:border-gray-700 flex gap-3 lg:gap-4 flex-shrink-0">
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

                {/* Amount keypad view */}
                <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${showPaymentAmountKeypad ? 'translate-x-0' : 'translate-x-full'}`}>
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 lg:px-8 pb-6 lg:pb-8 pt-10 lg:pt-14 space-y-5 lg:space-y-6">
                    <div className="text-center space-y-3">
                      <p className="text-xs lg:text-sm font-black text-gray-400 uppercase tracking-widest">Amount Received</p>
                      <div className="mx-auto w-64 lg:w-80 relative flex items-end border-b-2 border-orange-500 pb-1">
                        <span className="absolute left-0 bottom-1 text-xl lg:text-2xl font-black text-orange-500">{currencySymbol}</span>
                        <span className="w-full text-4xl lg:text-5xl font-black text-orange-500 tracking-tighter text-center">
                          {paymentAmountKeypadInput || '0.00'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 lg:gap-3">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((token) => (
                        <button
                          key={`pay-keypad-${token}`}
                          type="button"
                          onClick={() => appendPaymentKeypadValue(token)}
                          className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                        >
                          {token}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => appendPaymentKeypadValue('.')}
                        className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                      >
                        .
                      </button>
                      <button
                        type="button"
                        onClick={() => appendPaymentKeypadValue('0')}
                        className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-2xl lg:text-3xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={backspacePaymentKeypadValue}
                        className="py-4 lg:py-5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 flex items-center justify-center hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                      >
                        <Delete size={24} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPaymentAmountKeypadInput('')}
                      className="w-full py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-black uppercase tracking-widest hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="px-5 lg:px-8 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:py-5 border-t dark:border-gray-700 flex gap-3 lg:gap-4 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentAmountKeypadInput(cashAmountInput);
                        setShowPaymentAmountKeypad(false);
                      }}
                      className="flex-1 py-2 lg:py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={savePaymentAmountFromKeypad}
                      className="flex-1 py-2 lg:py-3 bg-orange-500 text-white rounded-xl font-black text-sm lg:text-lg uppercase tracking-normal lg:tracking-wider hover:bg-orange-600 transition-all"
                    >
                      Save
                    </button>
                  </div>
                </div>
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
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">
                  {tableModalMode === 'COUNTER_PICK' ? 'Select Table For Counter Order' : 'Select Table For Saved Bill'}
                </h3>
                <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">
                  {tableModalMode === 'COUNTER_PICK' ? 'Tap one table to set for counter order' : 'Tap one table based on your custom arrangement'}
                </p>
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
                <div
                  key={`select-row-${rowIdx}`}
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${effectiveTableCols}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: effectiveTableCols }, (_, colIdx) => {
                    const table = row[colIdx];
                    if (!table) {
                      return <div key={`select-empty-${rowIdx}-${colIdx}`} aria-hidden="true" />;
                    }
                    const hasPending = savedBillsByTable.has(table);
                    const selected = selectedSaveTableNumber === table;
                    return (
                      <button
                        key={table}
                        onClick={() => handleSaveBillModalTableClick(table)}
                        className={`h-[84px] p-4 rounded-lg border-2 text-left transition-all flex flex-col justify-between ${
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
                disabled={!selectedSaveTableNumber}
                className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tableModalMode === 'COUNTER_PICK' ? 'Use Selected Table' : 'Save Bill'}
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
                <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">
                  {selectedReportOrder.orderSource === 'counter' ? 'Counter' :
                   selectedReportOrder.orderSource === 'qr_order' ? 'QR Order' :
                   selectedReportOrder.orderSource === 'online' ? 'Online' : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Dining Option</span>
                <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">{selectedReportOrder.diningType || '-'}</span>
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
                        name: receiptConfig.businessName.trim() || restaurant.name,
                      };
                      const orderForPrint = {
                        id: selectedReportOrder.id,
                        tableNumber: selectedReportOrder.tableNumber,
                        timestamp: selectedReportOrder.timestamp,
                        total: selectedReportOrder.total,
                        items: selectedReportOrder.items,
                        remark: selectedReportOrder.remark || '',
                        paymentMethod: (selectedReportOrder as any).paymentMethod || '',
                        cashierName: (selectedReportOrder as any).cashierName || '',
                        amountReceived: (selectedReportOrder as any).amountReceived,
                        changeAmount: (selectedReportOrder as any).changeAmount,
                        orderSource: (selectedReportOrder as any).orderSource,
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
                        setCollectPaymentType(getFirstEnabledPaymentTypeId(paymentTypes));
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
                {/* Body with sliding keypad */}
                <div className="relative flex-1 min-h-0 overflow-hidden">
                  {/* Main collect view */}
                  <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${showCollectAmountKeypad ? '-translate-x-full' : 'translate-x-0'}`}>
                    <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                      {/* Total due */}
                      <div className="text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Total Amount Due</p>
                        <p className="text-5xl font-black text-orange-500 tracking-tighter">{currencySymbol}{selectedReportOrder.total.toFixed(2)}</p>
                      </div>

                      {/* Amount received - Tap to keypad */}
                      <div className="space-y-2 mt-6">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                        <button
                          type="button"
                          onClick={openCollectAmountKeypad}
                          className="w-full flex items-center justify-center border-b-2 dark:border-gray-600 border-gray-300 hover:border-orange-500 dark:hover:border-orange-500 transition-colors pb-2"
                        >
                          <span className="text-xl font-black text-gray-600 dark:text-gray-400">{currencySymbol}</span>
                          <span className="flex-1 p-2 text-xl font-black dark:text-white text-center">
                            {collectCashAmountInput || '0.00'}
                          </span>
                        </button>
                      </div>

                      {/* Quick select denominations */}
                      <div className="space-y-2">
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Quick Select</label>
                        <div className="grid grid-cols-2 gap-2">
                          {collectQuickSelectAmounts.map((amount, index) => (
                            <button
                              key={`collect-quick-${index}-${amount}`}
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
                          {enabledPaymentTypes.map((type) => (
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
                      if (shiftRequired) {
                        toast('Please open your shift before completing a payment.', 'error');
                        return;
                      }
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
                          diningType: selectedReportOrder.diningType,
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
                  </div>

                  {/* Collect amount keypad view */}
                  <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${showCollectAmountKeypad ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-8 space-y-4">
                      <div className="text-center space-y-3">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Amount Received</p>
                        <div className="mx-auto w-56 relative flex items-end border-b-2 border-orange-500 pb-1">
                          <span className="absolute left-0 bottom-1 text-lg font-black text-orange-500">{currencySymbol}</span>
                          <span className="w-full text-3xl font-black text-orange-500 tracking-tighter text-center">
                            {collectAmountKeypadInput || '0.00'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((token) => (
                          <button
                            key={`collect-keypad-${token}`}
                            type="button"
                            onClick={() => appendCollectKeypadValue(token)}
                            className="py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                          >
                            {token}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => appendCollectKeypadValue('.')}
                          className="py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                        >
                          .
                        </button>
                        <button
                          type="button"
                          onClick={() => appendCollectKeypadValue('0')}
                          className="py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xl font-black hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={backspaceCollectKeypadValue}
                          className="py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 flex items-center justify-center hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                        >
                          <Delete size={20} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCollectAmountKeypadInput('')}
                        className="w-full py-2.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-black text-sm uppercase tracking-widest hover:border-orange-500 dark:hover:border-orange-500 transition-all"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="px-5 py-4 border-t dark:border-gray-700 flex gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCollectAmountKeypadInput(collectCashAmountInput);
                          setShowCollectAmountKeypad(false);
                        }}
                        className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveCollectAmountFromKeypad}
                        className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all"
                      >
                        Save
                      </button>
                    </div>
                  </div>
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

      {/* ── Profile / Account Panel ─────────────────────────────────────── */}
      {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-300 ${showProfilePanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setShowProfilePanel(false)}
        />
        {/* Panel */}
        <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-white dark:bg-gray-800 shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${showProfilePanel ? 'translate-x-0' : '-translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-700">
              <div className="flex items-center gap-2">
                <User size={18} className="text-orange-500" />
                <h2 className="font-black text-sm uppercase tracking-tight dark:text-white">Account & Settings</h2>
              </div>
              <button
                onClick={() => setShowProfilePanel(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

              {/* ── Restaurant Logo ── */}
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Restaurant Logo</p>
                <div className="flex flex-col items-center gap-4">
                  {/* Photo Frame with hover-delete */}
                  <div
                    className="relative cursor-pointer"
                    onMouseEnter={() => profileLogoPreview ? setProfileLogoHovered(true) : undefined}
                    onMouseLeave={() => setProfileLogoHovered(false)}
                  >
                    <div className="w-28 h-28 rounded-2xl border-2 border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-700 shadow-sm">
                      {profileLogoPreview ? (
                        <img
                          src={profileLogoPreview}
                          alt="Restaurant logo"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImagePlus size={28} className="text-gray-300 dark:text-gray-500" />
                        </div>
                      )}
                    </div>
                    {/* Hover overlay – delete */}
                    {profileLogoHovered && profileLogoPreview && (
                      <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center">
                        <button
                          onClick={handleDeleteLogo}
                          className="flex flex-col items-center gap-1 text-white hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={20} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Remove</span>
                        </button>
                      </div>
                    )}
                    {profileLogoUploading && (
                      <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                        <RotateCw size={20} className="text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full">
                    <button
                      onClick={() => profileLogoInputRef.current?.click()}
                      disabled={profileLogoUploading}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors disabled:opacity-50 border border-orange-200 dark:border-orange-800/40"
                    >
                      <Upload size={13} /> Upload
                    </button>
                    <button
                      onClick={() => setProfileShowLinkInput(v => !v)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-colors border ${
                        profileShowLinkInput
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40'
                          : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                    >
                      <Link2 size={13} /> Add Link
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">PNG or JPEG recommended</p>
                  <input
                    ref={profileLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfileLogoFileSelect}
                  />
                </div>

                {/* Link Input */}
                {profileShowLinkInput && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={profileImageLinkInput}
                        onChange={e => setProfileImageLinkInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveImageLink()}
                        className="flex-1 border dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        placeholder="https://example.com/image.png"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveImageLink}
                        disabled={profileSaving || !profileImageLinkInput.trim()}
                        className="px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {profileSaving ? <RotateCw size={12} className="animate-spin" /> : 'Set'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Restaurant Info ── */}
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Restaurant Info</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Restaurant Name</label>
                    <input
                      type="text"
                      value={profileRestaurantName}
                      onChange={e => setProfileRestaurantName(e.target.value)}
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Restaurant name"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfileInfo}
                    disabled={profileSaving}
                    className="w-full py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {profileSaving ? <RotateCw size={13} className="animate-spin" /> : null}
                    Save Info
                  </button>
                </div>
              </div>

              {/* ── Change Password ── */}
              <div>
                <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Change Password</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Current Password</label>
                    <div className="relative">
                      <input
                        type={profileShowCurrentPw ? 'text' : 'password'}
                        value={profileCurrentPassword}
                        onChange={e => setProfileCurrentPassword(e.target.value)}
                        className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 pr-9"
                        placeholder="Current password"
                      />
                      <button
                        type="button"
                        onClick={() => setProfileShowCurrentPw(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        {profileShowCurrentPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={profileShowNewPw ? 'text' : 'password'}
                        value={profileNewPassword}
                        onChange={e => setProfileNewPassword(e.target.value)}
                        className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400 pr-9"
                        placeholder="New password (min 6 chars)"
                      />
                      <button
                        type="button"
                        onClick={() => setProfileShowNewPw(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        {profileShowNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={profileConfirmPassword}
                      onChange={e => setProfileConfirmPassword(e.target.value)}
                      className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Confirm new password"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfilePassword}
                    disabled={profileSaving}
                    className="w-full py-2 rounded-lg bg-gray-800 dark:bg-gray-200 hover:bg-gray-700 dark:hover:bg-white text-white dark:text-gray-900 text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {profileSaving ? <RotateCw size={13} className="animate-spin" /> : <Lock size={13} />}
                    Update Password
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Logo Crop Modal */}
          {profileCropFile && (
            <ImageCropModal
              imageFile={profileCropFile}
              onCrop={handleProfileLogoCropped}
              onCancel={() => setProfileCropFile(null)}
            />
          )}


      {/* ─────────────────────────────────────────────────────────────────── */}

      </div>
    </div>
  );
};

export default PosOnlyView;