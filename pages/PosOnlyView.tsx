// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption } from '../src/types';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions } from '../services/printerService';
import MenuItemFormModal, { MenuFormItem } from '../components/MenuItemFormModal';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';
import StandardReport from '../components/StandardReport';
import {
  ShoppingBag, Search, Download, Calendar,
  Printer, QrCode, CreditCard, Trash2, Plus, Minus, LayoutGrid,
  List, Clock, CheckCircle2, BarChart3, Hash, Menu, Settings, BookOpen,
  X, Edit3, Archive, RotateCcw, Upload, Eye,
  AlertCircle, Users, UserPlus, Bluetooth, BluetoothConnected, PrinterIcon,
  Filter, Tag, Layers, Coffee, ChevronDown, RotateCw, Wifi, WifiOff,
  Receipt, Network, Type
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string) => Promise<string>; // Returns order ID
  onUpdateMenu?: (restaurantId: string, updatedItem: MenuItem) => void | Promise<void>;
  onAddMenuItem?: (restaurantId: string, newItem: MenuItem) => void | Promise<void>;
  onPermanentDeleteMenuItem?: (restaurantId: string, itemId: string) => void | Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  isOnline?: boolean;
  pendingOfflineOrdersCount?: number;
}

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

type SettingsPanel = null | 'features' | 'printer' | 'receipt' | 'payment' | 'taxes' | 'staff' | 'ux';

const PosOnlyView: React.FC<Props> = ({ 
  restaurant, 
  orders, 
  onUpdateOrder, 
  onPlaceOrder,
  onUpdateMenu,
  onAddMenuItem,
  onPermanentDeleteMenuItem,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  isOnline = true,
  pendingOfflineOrdersCount = 0,
}) => {
  const toLocalDateInputValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };

  const [activeTab, setActiveTab] = useState<'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS'>('COUNTER');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'list'>('grid-4');
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posRemark, setPosRemark] = useState('');
  const [posTableNo, setPosTableNo] = useState('Counter');
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
    category: 'Main Dish',
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
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('');
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
  const [showPaymentResult, setShowPaymentResult] = useState(false);

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

  const handleOpenAddModal = (initialCategory?: string) => {
    setEditingItem(null);
    setFormItem({
      name: '',
      description: '',
      price: 0,
      image: '',
      category: initialCategory || 'Main Dish',
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
      tempOptions: item.tempOptions ? { ...item.tempOptions } : { enabled: false, hot: 0, cold: 0 },
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
      category: 'Main Dish',
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
    const cats = new Set(restaurant.menu.map(item => item.category));
    return ['ALL', ...Array.from(cats)];
  }, [restaurant.menu]);

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
          }
        : { enabled: false, hot: 0, cold: 0 },
    };

    const hasOptions =
      (sanitizedItem.sizes && sanitizedItem.sizes.length > 0) ||
      (sanitizedItem.tempOptions && sanitizedItem.tempOptions.enabled) ||
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

  const handleCheckout = async () => {
    if (posCart.length === 0 || isCompletingPayment) return;

    // Store the pending order data and show payment modal
    setPendingOrderData({
      items: posCart,
      remark: posRemark,
      tableNumber: posTableNo,
      total: cartTotal,
    });
    
    setSelectedCashAmount(cartTotal);
    setSelectedPaymentType(paymentTypes.length > 0 ? paymentTypes[0].id : '');
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!pendingOrderData || !selectedPaymentType) return;

    setIsCompletingPayment(true);
    setCheckoutNotice('');

    let actualOrderId: string = '';
    
    try {
      // Call onPlaceOrder and get the actual order ID from database
      actualOrderId = await onPlaceOrder(pendingOrderData.items, pendingOrderData.remark, pendingOrderData.tableNumber);
    } catch (error: any) {
      console.error('Order placement error:', error);
      toast(`Failed to place order: ${error?.message || 'Unknown error'}`, 'error');
      setIsCompletingPayment(false);
      setShowPaymentModal(false);
      return;
    }

    // Use the real order ID from database for printing
    const orderForPrint = {
      id: actualOrderId,
      tableNumber: pendingOrderData.tableNumber,
      timestamp: Date.now(),
      total: pendingOrderData.total,
      items: pendingOrderData.items,
      remark: pendingOrderData.remark,
    };

    // Show payment result with slide animation
    setShowPaymentResult(true);
    setIsCompletingPayment(false);

    // Auto-close after 3 seconds
    setTimeout(() => {
      setShowPaymentResult(false);
      setShowPaymentModal(false);
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
      setPendingOrderData(null);
      setShowPaymentSuccess(true);
      
      setTimeout(() => {
        setShowPaymentSuccess(false);
      }, 1800);
    }, 3000);

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

  const fetchReport = async (isExport = false) => {
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
        return data.orders;
      } else {
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
    if (restaurant.categories && restaurant.categories.length > 0) {
      setExtraCategories(restaurant.categories);
    } else {
      const savedCategories = localStorage.getItem(`categories_${restaurant.id}`);
      if (savedCategories) {
        setExtraCategories(JSON.parse(savedCategories));
      }
    }

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
    const existsInMenu = restaurant.menu.some(item => item.category === normalizedName);
    const existsInExtra = extraCategories.some(category => category.name === normalizedName && category.name !== oldName);
    if (existsInMenu || existsInExtra) {
      toast('Category already exists.', 'warning');
      return;
    }

    setExtraCategories(prev => prev.map(category =>
      category.name === oldName ? { ...category, name: normalizedName } : category
    ));
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
    const headers = ['Order ID', 'Table', 'Date', 'Time', 'Status', 'Items', 'Total'];
    const rows = allOrders.map(o => [
      o.id,
      o.tableNumber,
      new Date(o.timestamp).toLocaleDateString(),
      new Date(o.timestamp).toLocaleTimeString(),
      o.status,
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

  const handleTabSelection = (tab: 'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

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
    </div>
  );

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
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WifiOff className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-200 text-sm">You're Offline</p>
              <p className="text-xs text-red-700 dark:text-red-300">Orders will be saved locally and synced when you're back online</p>
            </div>
          </div>
          {pendingOfflineOrdersCount > 0 && (
            <div className="bg-red-100 dark:bg-red-900/40 px-3 py-1 rounded-full">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{pendingOfflineOrdersCount} pending</p>
            </div>
          )}
        </div>
      )}

      {isOnline && pendingOfflineOrdersCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="font-semibold text-yellow-900 dark:text-yellow-200 text-sm">Syncing Orders</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">{pendingOfflineOrdersCount} orders are being synced to the server</p>
            </div>
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
        fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 
        flex flex-col transition-transform duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
          <img src={restaurant.logo} className="w-10 h-10 rounded-lg shadow-sm" />
          <div>
            <h2 className="font-black dark:text-white text-sm uppercase tracking-tight">{restaurant.name}</h2>
            <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mt-0.5">POS Only</p>
          </div>
        </div>

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
            onClick={() => handleTabSelection('MENU_EDITOR')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'MENU_EDITOR' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <BookOpen size={20} /> Menu Editor
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
            onClick={() => handleTabSelection('SETTINGS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'SETTINGS' 
                ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Settings size={20} /> Settings
          </button>
        </nav>

        {/* Printer Connection Status */}
        <div className="p-4 mt-auto border-t dark:border-gray-700 space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Printer Connection</label>
          <button
            onClick={handlePrinterButtonClick}
            disabled={isAutoReconnecting}
            className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg ${
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
                Connecting...
              </>
            ) : realPrinterConnected ? (
              <>
                <BluetoothConnected size={18} />
                Printer Connected
              </>
            ) : connectedDevice ? (
              <>
                <Bluetooth size={18} />
                Printer Offline
              </>
            ) : (
              <>
                <Bluetooth size={18} />
                No Printer
              </>
            )}
          </button>
          {connectedDevice && (
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
        </div>
      </aside>

      {/* Main Content Area - Same as PosView but without Settings tab */}
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
                 activeTab === 'MENU_EDITOR' ? 'Menu Editor' : 
                 activeTab === 'REPORTS' ? 'Sales Report' : 
                 'Settings'}
              </h1>
            </div>
          </div>

          {/* Counter Tab - Same as PosView */}
          {activeTab === 'COUNTER' && (
            <>
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
                    <button onClick={() => setMenuLayout('grid-3')} className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-3' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => setMenuLayout('grid-4')} className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-4' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => setMenuLayout('grid-5')} className={`p-2 rounded-lg transition-all ${menuLayout === 'grid-5' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
                    <button onClick={() => setMenuLayout('list')} className={`p-2 rounded-lg transition-all ${menuLayout === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}><List size={16} /></button>
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

              <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
                <div className="space-y-4">
                      
                      <div className={`grid gap-1.5 ${
                        menuLayout === 'grid-3' ? 'grid-cols-3' : 
                        menuLayout === 'grid-4' ? 'grid-cols-4' : 
                        menuLayout === 'grid-5' ? 'grid-cols-5' : 
                        'grid-cols-1'
                      }`}>
                        {filteredMenu.map(item => (
                          <button
                            key={item.id}
                            onClick={() => handleMenuItemClick(item)}
                            className={`bg-white dark:bg-gray-800 border dark:border-gray-700 text-left hover:border-orange-500 transition-all group shadow-sm flex ${
                              menuLayout === 'list' ? 'flex-row items-center gap-4 p-2 rounded-xl' : 'flex-col p-2 rounded-xl'
                            }`}
                          >
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
                              <p className="text-orange-500 font-black text-sm">RM{item.price.toFixed(2)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                </div>
              </div>
            </>
          )}

          {/* Reports Tab - Same as PosView */}
          {activeTab === 'REPORTS' && (
            <div className="flex-1 overflow-y-auto p-6">
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
          {activeTab === 'MENU_EDITOR' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-4">Menu Editor</h1>
                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                      <button onClick={() => setMenuSubTab('KITCHEN')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'KITCHEN' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Kitchen Menu</button>
                      <button onClick={() => setMenuSubTab('CATEGORY')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'CATEGORY' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Category</button>
                      <button onClick={() => setMenuSubTab('MODIFIER')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'MODIFIER' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Modifier</button>
                    </div>

                    {menuSubTab === 'KITCHEN' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setMenuStatusFilter('ACTIVE')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ACTIVE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Eye size={14} /> <span className="hidden sm:inline">Active</span></button>
                            <button onClick={() => setMenuStatusFilter('ARCHIVED')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ARCHIVED' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Archive size={14} /> <span className="hidden sm:inline">Archived</span></button>
                          </div>
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setMenuViewMode('grid')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setMenuViewMode('list')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={() => handleOpenAddModal()} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg">+ Add Item</button>
                      </>
                    ) : menuSubTab === 'CATEGORY' ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setClassViewMode('grid')} className={`p-2 rounded-lg transition-all ${classViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setClassViewMode('list')} className={`p-2 rounded-lg transition-all ${classViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={() => setShowAddClassModal(true)} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Tag size={16} /> + New Category
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm">
                            <button onClick={() => setModifierViewMode('grid')} className={`p-2 rounded-lg transition-all ${modifierViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                            <button onClick={() => setModifierViewMode('list')} className={`p-2 rounded-lg transition-all ${modifierViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                          </div>
                        </div>
                        <button onClick={handleAddModifier} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2">
                          <Coffee size={16} /> + New Modifier
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
                            <div className="relative aspect-square">
                              <img src={item.image} className="w-full h-full object-cover" />
                              <div className="absolute top-2 right-2 flex gap-1">
                                {menuStatusFilter === 'ACTIVE' ? (
                                  <>
                                    <button onClick={() => handleArchiveItem(item)} className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Archive size={12} /></button>
                                    <button onClick={() => handleOpenEditModal(item)} className="p-1.5 bg-white/90 backdrop-blur rounded-lg text-gray-700 shadow-sm"><Edit3 size={12} /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => handleRestoreItem(item)} className="p-1.5 bg-green-50/90 backdrop-blur rounded-lg text-green-600 shadow-sm"><RotateCcw size={12} /></button>
                                    <button onClick={() => handlePermanentDelete(item.id)} className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Trash2 size={12} /></button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="p-2">
                              <h3 className="font-black text-xs text-gray-900 dark:text-white mb-1 uppercase tracking-tight line-clamp-1">{item.name}</h3>
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-black text-orange-500">RM{item.price.toFixed(2)}</span>
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
                                      <img src={item.image} className="w-10 h-10 rounded-lg object-cover" />
                                      <div>
                                        <p className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-xs">{item.name}</p>
                                        <p className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-[9px] font-black uppercase text-gray-400">{item.category}</td>
                                  <td className="px-4 py-3 font-black text-gray-900 dark:text-white text-xs">RM{item.price.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end items-center gap-1">
                                      {menuStatusFilter === 'ACTIVE' ? (
                                        <button onClick={() => handleArchiveItem(item)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><Archive size={16} /></button>
                                      ) : (
                                        <button onClick={() => handleRestoreItem(item)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"><RotateCcw size={16} /></button>
                                      )}
                                      <button onClick={() => handleOpenEditModal(item)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg transition-all"><Edit3 size={16} /></button>
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
                                    <span className="font-black text-orange-500">+RM{option.price.toFixed(2)}</span>
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
                                        <span className="font-black text-orange-500">+RM{option.price.toFixed(2)}</span>
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
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'SETTINGS' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
                <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Settings</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Features, printer, receipt, payment, tax, and staff configuration.</p>

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
                </div>
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
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        <MenuItemFormModal
          isOpen={isFormModalOpen}
          formItem={formItem}
          setFormItem={setFormItem}
          categories={menuEditorCategories}
          availableModifiers={modifiers}
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
                          
                          // Save to Supabase users table
                          const { data, error } = await supabase
                            .from('users')
                            .insert([newStaff])
                            .select();
                          
                          if (error) {
                            toast('Error saving to database: ' + error.message, 'error');
                            setIsAddingStaff(false);
                            return;
                          }
                          
                          // Also update local state with the data from database (includes created_at, id)
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
        
        {/* Right Sidebar - Order Summary */}
        {activeTab === 'COUNTER' && (
          <div className={`
            w-96 bg-white dark:bg-gray-800 border-l dark:border-gray-700 flex flex-col
            transition-all duration-300 ease-in-out
          `}>
            <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-black dark:text-white uppercase tracking-tighter">
                Current Order
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setPosCart([])} className="text-gray-400 hover:text-red-500 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

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
                        <p className="text-xs text-orange-500 font-black">RM{item.price.toFixed(2)}</p>
                        <div className="mt-1 space-y-0.5">
                          {item.selectedSize && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Size: {item.selectedSize}</p>}
                          {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• Temperature: {item.selectedTemp}</p>}
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
                  <span>RM{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                  <span className="uppercase">Total</span>
                  <span className="text-orange-500">RM{cartTotal.toFixed(2)}</span>
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

                <button onClick={handleCheckout} disabled={posCart.length === 0 || isCompletingPayment || showPaymentSuccess} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2">
                  <CreditCard size={16} /> {isCompletingPayment ? 'Processing...' : showPaymentSuccess ? 'Completed' : 'Complete Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>



      {/* Payment Modal */}
      {showPaymentModal && pendingOrderData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !isCompletingPayment && !showPaymentResult && setShowPaymentModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-4xl h-[800px] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
            
            {/* Payment Input View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-in-out ${showPaymentResult ? '-translate-x-full' : 'translate-x-0'}`}>
              {/* Header */}
              <div className="px-8 py-5 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-2xl">Payment</h3>
                <button 
                  onClick={() => setShowPaymentModal(false)} 
                  disabled={isCompletingPayment}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50"
                >
                  <X size={28} className="text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 p-8 space-y-8">
                {/* Total Amount Due - Centered */}
                <div className="text-center space-y-3">
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Total Amount Due</label>
                  <div className="text-6xl font-black text-orange-500 tracking-tighter">
                    RM{pendingOrderData.total.toFixed(2)}
                  </div>
                </div>

                {/* Amount Received - Plain Input */}
                <div className="space-y-3">
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Amount Received</label>
                  <input 
                    type="number" 
                    value={selectedCashAmount ?? ''} 
                    onChange={(e) => setSelectedCashAmount(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="Enter amount..."
                    className="w-full p-3 bg-transparent border-b-2 dark:border-gray-600 border-gray-300 text-2xl font-black dark:text-white text-center focus:outline-none focus:border-orange-500 dark:focus:border-orange-500"
                  />
                </div>

                {/* Cash Denomination Boxes */}
                <div className="space-y-3">
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Quick Select</label>
                  <div className="grid grid-cols-4 gap-3">
                    {CASH_DENOMINATIONS.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setSelectedCashAmount(amount)}
                        className={`p-3 rounded-xl font-black text-lg uppercase tracking-widest transition-all border-2 ${
                          selectedCashAmount === amount
                            ? 'bg-orange-500 text-white border-orange-600 shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500'
                        }`}
                      >
                        RM {amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-3">
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Payment Method</label>
                  <select 
                    value={selectedPaymentType} 
                    onChange={(e) => setSelectedPaymentType(e.target.value)}
                    className="w-full p-4 bg-white dark:bg-gray-700 border-2 dark:border-gray-600 rounded-xl text-lg font-black dark:text-white focus:outline-none focus:border-orange-500 dark:focus:border-orange-500"
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
              <div className="px-8 py-5 border-t dark:border-gray-700 flex gap-4 flex-shrink-0">
                <button 
                  onClick={() => setShowPaymentModal(false)} 
                  disabled={isCompletingPayment}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-black text-lg uppercase tracking-wider hover:bg-gray-200 dark:hover:bg-gray-600 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmPayment} 
                  disabled={isCompletingPayment || !selectedPaymentType}
                  className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-black text-lg uppercase tracking-wider hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isCompletingPayment ? (
                    <>
                      <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard size={24} /> Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Payment Result View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-500 ease-in-out ${showPaymentResult ? 'translate-x-0' : 'translate-x-full'}`}>
              {/* Header */}
              <div className="px-8 py-5 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-2xl">Payment Complete</h3>
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-green-600 dark:text-green-400" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full space-y-10">
                  {/* Total Paid */}
                  <div className="text-center space-y-3">
                    <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Total Paid</label>
                    <div className="text-6xl font-black text-green-500 tracking-tighter">
                      RM{(selectedCashAmount || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t-2 border-dashed dark:border-gray-700"></div>

                  {/* Change */}
                  <div className="text-center space-y-3">
                    <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Change</label>
                    <div className="text-6xl font-black text-blue-500 tracking-tighter">
                      RM{Math.max(0, (selectedCashAmount || 0) - pendingOrderData.total).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t dark:border-gray-700 text-center flex-shrink-0">
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Thank you for your order!</p>
              </div>
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
                  'bg-orange-100 text-orange-600'
                }`}>
                  {selectedReportOrder.status === OrderStatus.COMPLETED ? 'Paid' : selectedReportOrder.status === OrderStatus.SERVED ? 'Served' : selectedReportOrder.status}
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
                        {item.selectedOtherVariant && !item.selectedModifiers && <p className="text-[9px] text-gray-400 ml-3">-{item.otherVariantName ? item.otherVariantName.charAt(0).toUpperCase() + item.otherVariantName.slice(1) : 'Option'}: {item.selectedOtherVariant}</p>}
                        {item.selectedModifiers && Object.entries(item.selectedModifiers).map(([modName, optName]) => (
                          optName && <p key={modName} className="text-[9px] text-gray-400 ml-3">-{modName.charAt(0).toUpperCase() + modName.slice(1)}: {optName}</p>
                        ))}
                        {item.selectedAddOns?.map((addon, aIdx) => (
                          <p key={aIdx} className="text-[9px] text-gray-400 ml-3">-{addon.name}{addon.quantity > 1 ? ` x${addon.quantity}` : ''}</p>
                        ))}
                      </div>
                      <span className="text-xs font-bold dark:text-white shrink-0 ml-2">RM{(item.price * item.quantity).toFixed(2)}</span>
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

              <div className="border-t dark:border-gray-700 pt-3 flex items-center justify-between">
                <span className="text-xs font-black dark:text-white uppercase tracking-widest">Total</span>
                <span className="text-lg font-black text-orange-500">RM{selectedReportOrder.total.toFixed(2)}</span>
              </div>

              {connectedDevice && (
                <button
                  onClick={async () => {
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
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={14} /> Reprint Receipt
                </button>
              )}
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
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-left {
          animation: slideLeft 0.3s ease-out;
        }
      `}</style>
      </div>
    </div>
  );
};

export default PosOnlyView;
