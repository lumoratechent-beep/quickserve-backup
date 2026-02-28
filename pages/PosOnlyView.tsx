// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters, CategoryData, ModifierData, ModifierOption } from '../src/types';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import * as counterOrdersCache from '../lib/counterOrdersCache';
import printerService, { PrinterDevice, ReceiptPrintOptions } from '../services/printerService';
import MenuItemFormModal, { MenuFormItem } from '../components/MenuItemFormModal';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import StandardReport from '../components/StandardReport';
import ReceiptPreview from '../components/ReceiptPreview';
import { 
  ShoppingBag, Search, Download, Calendar, ChevronLeft, ChevronRight, 
  Printer, QrCode, CreditCard, Trash2, Plus, Minus, LayoutGrid, 
  List, Clock, CheckCircle2, BarChart3, Hash, Menu, Settings, BookOpen,
  ChevronFirst, ChevronLast, X, Edit3, Archive, RotateCcw, Upload, Eye,
  AlertCircle, Users, UserPlus, Bluetooth, BluetoothConnected, PrinterIcon,
  Filter, Tag, Layers, Coffee
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string) => Promise<void>;
  onUpdateMenu?: (restaurantId: string, updatedItem: MenuItem) => void | Promise<void>;
  onAddMenuItem?: (restaurantId: string, newItem: MenuItem) => void | Promise<void>;
  onPermanentDeleteMenuItem?: (restaurantId: string, itemId: string) => void | Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
}

interface ReceiptSettings {
  autoPrintEnabled: boolean;
  businessName: string;
  headerLine1: string;
  headerLine2: string;
  horizontalOffset: number;
  businessNameAlign: 'left' | 'center' | 'right';
  headerLine1Align: 'left' | 'center' | 'right';
  headerLine2Align: 'left' | 'center' | 'right';
  showDateTime: boolean;
  showOrderId: boolean;
  showTableNumber: boolean;
  showItems: boolean;
  showRemark: boolean;
  showTotal: boolean;
  totalAlign: 'left' | 'center' | 'right';
  footerLine1: string;
  footerLine2: string;
  footerLine1Align: 'left' | 'center' | 'right';
  footerLine2Align: 'left' | 'center' | 'right';
}

const getDefaultReceiptSettings = (restaurantName: string): ReceiptSettings => ({
  autoPrintEnabled: false,
  businessName: restaurantName,
  headerLine1: '',
  headerLine2: '',
  horizontalOffset: 0,
  businessNameAlign: 'center',
  headerLine1Align: 'center',
  headerLine2Align: 'center',
  showDateTime: true,
  showOrderId: true,
  showTableNumber: true,
  showItems: true,
  showRemark: true,
  showTotal: true,
  totalAlign: 'right',
  footerLine1: 'Thank you!',
  footerLine2: 'Please come again',
  footerLine1Align: 'center',
  footerLine2Align: 'center',
});

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
    tempOptions: { enabled: false, hot: 0, cold: 0 },
    addOns: [],
  });

  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddModifierModal, setShowAddModifierModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [skipKitchen, setSkipKitchen] = useState(false);
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

  // Reports State
  const [reportStart, setReportStart] = useState(() => {
    const now = new Date();
    return toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [reportEnd, setReportEnd] = useState(() => {
    const now = new Date();
    return toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
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
  const [errorMessage, setErrorMessage] = useState('');
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => getDefaultReceiptSettings(restaurant.name));
  const [isSavingReceiptSettings, setIsSavingReceiptSettings] = useState(false);
  const [receiptSettingsSaved, setReceiptSettingsSaved] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

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

  // Counter Orders Cache State - For local caching strategy
  const [cachedCounterOrders, setCachedCounterOrders] = useState<Order[]>(() => {
    return counterOrdersCache.getCachedCounterOrders(restaurant.id);
  });
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState<string>('');

  const handleRemoveStaff = async (staff: any, index: number) => {
    const updated = staffList.filter((_: any, idx: number) => idx !== index);

    try {
      if (staff?.id) {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', staff.id);

        if (error) {
          alert('Error removing staff: ' + error.message);
          return;
        }
      }

      setStaffList(updated);
      localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
    } catch (error: any) {
      alert('Error removing staff: ' + error.message);
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
      tempOptions: { enabled: false, hot: 0, cold: 0 },
      addOns: [],
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormItem({
      ...item,
      sizes: item.sizes ? [...item.sizes] : [],
      sizesEnabled: !!(item.sizes && item.sizes.length > 0),
      otherVariantName: item.otherVariantName || '',
      otherVariants: item.otherVariants ? [...item.otherVariants] : [],
      otherVariantsEnabled: !!item.otherVariantsEnabled,
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
      alert('Failed to upload image. Please try again.');
    }
  };

  const handleSaveMenuItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formItem.name?.trim()) {
      alert('Please enter item name');
      return;
    }
    if (!formItem.category?.trim()) {
      alert('Please enter category');
      return;
    }
    if (!onAddMenuItem && !onUpdateMenu) {
      alert('Menu editing is not enabled for this account.');
      return;
    }

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
      otherVariantName: formItem.otherVariantName,
      otherVariants: formItem.otherVariants,
      otherVariantsEnabled: formItem.otherVariantsEnabled,
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
      alert('Failed to save menu item: ' + error.message);
    } finally {
      setIsSavingMenuItem(false);
    }
  };

  const handleArchiveItem = async (item: MenuItem) => {
    if (!onUpdateMenu) {
      alert('Menu editing is not enabled for this account.');
      return;
    }
    await onUpdateMenu(restaurant.id, { ...item, isArchived: true });
  };

  const handleRestoreItem = async (item: MenuItem) => {
    if (!onUpdateMenu) {
      alert('Menu editing is not enabled for this account.');
      return;
    }
    await onUpdateMenu(restaurant.id, { ...item, isArchived: false });
  };

  const handlePermanentDelete = async (itemId: string) => {
    if (!onPermanentDeleteMenuItem) {
      alert('Permanent delete is not enabled for this account.');
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

    const orderForPrint = {
      id: `POS-${Date.now()}`,
      tableNumber: posTableNo,
      timestamp: Date.now(),
      total: cartTotal,
      items: posCart,
      remark: posRemark,
    };

    setIsCompletingPayment(true);
    setCheckoutNotice('');

    try {
      await onPlaceOrder(posCart, posRemark, posTableNo);
    } catch (error: any) {
      console.error('Order placement error:', error);
      alert(`Failed to place order: ${error?.message || 'Unknown error'}`);
      setIsCompletingPayment(false);
      return;
    }

    setPosCart([]);
    setPosRemark('');
    setPosTableNo('Counter');
    setShowPaymentSuccess(true);

    setTimeout(() => {
      setShowPaymentSuccess(false);
      setIsCompletingPayment(false);
    }, 1800);

    if (receiptSettings.autoPrintEnabled) {
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
    if (!receiptSettingsSaved) return;
    const timer = setTimeout(() => setReceiptSettingsSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [receiptSettingsSaved]);

  const handleAddCategory = () => {
    if (!newClassName.trim()) return;
    const categoryName = newClassName.trim();

    const existsInMenu = restaurant.menu.some(item => item.category === categoryName);
    const existsInExtra = extraCategories.some(category => category.name === categoryName);
    if (existsInMenu || existsInExtra) {
      alert('Category already exists.');
      return;
    }

    setExtraCategories(prev => [...prev, { name: categoryName, skipKitchen }]);
    setNewClassName('');
    setSkipKitchen(false);
    setShowAddClassModal(false);
  };

  const handleToggleSkipKitchen = (categoryName: string) => {
    setExtraCategories(prev => prev.map(category =>
      category.name === categoryName ? { ...category, skipKitchen: !category.skipKitchen } : category
    ));
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
      alert('Category already exists.');
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
    setShowAddModifierModal(true);
  };

  const handleSaveModifier = () => {
    if (!tempModifierName.trim()) {
      alert('Please enter a modifier name');
      return;
    }

    const nextName = tempModifierName.trim();
    const duplicate = modifiers.some(modifier => modifier.name === nextName && modifier.name !== editingModifierName);
    if (duplicate) {
      alert('Modifier already exists.');
      return;
    }

    const validOptions = tempModifierOptions.filter(option => option.name.trim() !== '');

    if (editingModifierName) {
      setModifiers(prev => prev.map(modifier =>
        modifier.name === editingModifierName
          ? { name: nextName, options: validOptions }
          : modifier
      ));
    } else {
      setModifiers(prev => [...prev, { name: nextName, options: validOptions }]);
    }

    setShowAddModifierModal(false);
    setEditingModifierName(null);
    setTempModifierName('');
    setTempModifierOptions([]);
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
  };

  const handleRenameModifier = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setRenamingModifier(null);
      return;
    }

    const normalizedName = newName.trim();
    const duplicate = modifiers.some(modifier => modifier.name === normalizedName && modifier.name !== oldName);
    if (duplicate) {
      alert('Modifier already exists.');
      return;
    }

    setModifiers(prev => prev.map(modifier =>
      modifier.name === oldName ? { ...modifier, name: normalizedName } : modifier
    ));
    setRenamingModifier(null);
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
      horizontalOffset: receiptSettings.horizontalOffset,
      businessNameAlign: receiptSettings.businessNameAlign,
      headerLine1Align: receiptSettings.headerLine1Align,
      totalAlign: receiptSettings.totalAlign,
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
        alert('Receipt settings saved locally. Cloud sync is unavailable right now.');
        setReceiptSettingsSaved(true);
        return;
      }

      setReceiptSettingsSaved(true);
    } catch (error: any) {
      alert('Failed to save receipt settings: ' + error.message);
    } finally {
      setIsSavingReceiptSettings(false);
    }
  };

  const getReceiptPrintOptions = (): ReceiptPrintOptions => ({
    showDateTime: receiptSettings.showDateTime,
    showOrderId: receiptSettings.showOrderId,
    showTableNumber: receiptSettings.showTableNumber,
    showItems: receiptSettings.showItems,
    showRemark: receiptSettings.showRemark,
    showTotal: receiptSettings.showTotal,
    horizontalOffset: receiptSettings.horizontalOffset,
    businessNameAlign: receiptSettings.businessNameAlign,
    headerLine1Align: receiptSettings.headerLine1Align,
    headerLine2Align: receiptSettings.headerLine2Align,
    totalAlign: receiptSettings.totalAlign,
    headerLine1: receiptSettings.headerLine1,
    headerLine2: receiptSettings.headerLine2,
    footerLine1: receiptSettings.footerLine1,
    footerLine2: receiptSettings.footerLine2,
    footerLine1Align: receiptSettings.footerLine1Align,
    footerLine2Align: receiptSettings.footerLine2Align,
  });

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

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-900 overflow-hidden">
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

                              <div className="flex items-center justify-between mt-2 pt-2 border-t dark:border-gray-700">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Skip Kitchen</span>
                                <button
                                  onClick={() => handleToggleSkipKitchen(category.name)}
                                  className={`w-10 h-5 rounded-full transition-all relative ${
                                    category.skipKitchen ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                                  }`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                                    category.skipKitchen ? 'left-5' : 'left-0.5'
                                  }`} />
                                </button>
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

                                  <div className="flex items-center gap-2 ml-4">
                                    <span className="text-[8px] font-black text-gray-400">Skip Kitchen</span>
                                    <button
                                      onClick={() => handleToggleSkipKitchen(category.name)}
                                      className={`w-8 h-4 rounded-full transition-all relative ${
                                        category.skipKitchen ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                                      }`}
                                    >
                                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
                                        category.skipKitchen ? 'left-4' : 'left-0.5'
                                      }`} />
                                    </button>
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
                                  <button onClick={() => handleEditModifier(modifier)} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg">
                                    <Edit3 size={14} />
                                  </button>
                                  <button onClick={() => handleRemoveModifier(modifier.name)} className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-8 h-8 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-lg flex items-center justify-center">
                                  <Coffee size={16} />
                                </div>

                                {renamingModifier === modifier.name ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      className="px-2 py-1 text-sm font-black border dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      value={renameValue}
                                      onChange={event => setRenameValue(event.target.value)}
                                      onKeyDown={event => event.key === 'Enter' && handleRenameModifier(modifier.name, renameValue)}
                                    />
                                    <button onClick={() => handleRenameModifier(modifier.name, renameValue)} className="text-green-500">
                                      <CheckCircle2 size={16} />
                                    </button>
                                    <button onClick={() => setRenamingModifier(null)} className="text-red-500">
                                      <X size={16} />
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-sm font-black dark:text-white uppercase tracking-tight">{modifier.name}</p>
                                    <p className="text-[9px] font-bold text-gray-400">{modifier.options.length} Options</p>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button onClick={() => { setRenamingModifier(modifier.name); setRenameValue(modifier.name); }} className="p-2 text-gray-400 hover:text-orange-500">
                                  <Edit3 size={16} />
                                </button>
                                <button onClick={() => handleEditModifier(modifier)} className="p-2 text-gray-400 hover:text-orange-500">
                                  <Upload size={16} />
                                </button>
                                <button onClick={() => handleRemoveModifier(modifier.name)} className="p-2 text-red-400 hover:text-red-500">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>

                            {modifier.options.length > 0 && (
                              <div className="mt-3 pl-11 space-y-1">
                                {modifier.options.map((option, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[9px]">
                                    <span className="font-bold text-gray-600 dark:text-gray-300">{option.name}</span>
                                    <span className="font-black text-orange-500">+RM{option.price.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {modifier.options.length === 0 && (
                              <div className="mt-2 pl-11">
                                <p className="text-[8px] text-gray-400 italic">No options</p>
                              </div>
                            )}
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
              <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Settings</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Configure printer, receipt format, and staff access</p>
                
                <div className="space-y-8">
                  {/* Printer Configuration */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <PrinterIcon size={16} className="text-orange-500" />
                        <h2 className="font-black dark:text-white uppercase tracking-tighter text-sm">Printer Configuration</h2>
                      </div>
                    </div>
                    <div className="p-4">
                      {!isBluetoothSupported && (
                        <div className="text-center py-8">
                          <AlertCircle size={32} className="mx-auto text-red-500 mb-3" />
                          <h3 className="text-base font-black dark:text-white mb-1">Bluetooth Not Supported</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{errorMessage}</p>
                          <p className="text-[9px] text-gray-400 mt-3">Use Chrome, Edge, or Opera</p>
                        </div>
                      )}

                      {isBluetoothSupported && (
                        <>
                          <div className={`p-4 rounded-lg border-2 transition-all mb-4 ${
                            printerStatus === 'connected'
                              ? 'bg-green-50 dark:bg-green-900/10 border-green-200'
                              : 'bg-gray-50 dark:bg-gray-800 border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  printerStatus === 'connected'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                }`}>
                                  <Printer size={20} />
                                </div>
                                <div>
                                  <h3 className="font-black dark:text-white text-xs">CX58D Thermal Printer</h3>
                                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    {printerStatus === 'connected'
                                      ? `Connected to ${connectedDevice?.name}`
                                      : 'No printer connected'}
                                  </p>
                                </div>
                              </div>
                              <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                printerStatus === 'connected'
                                  ? 'bg-green-100 text-green-600'
                                  : printerStatus === 'connecting'
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {printerStatus === 'connected' ? 'Connected' :
                                 printerStatus === 'connecting' ? 'Connecting...' :
                                 'Disconnected'}
                              </div>
                            </div>
                          </div>

                          {printerStatus !== 'connected' ? (
                            <div className="space-y-3">
                              <button
                                onClick={scanForPrinters}
                                disabled={isScanning}
                                className="w-full py-3 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isScanning ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Scanning...
                                  </>
                                ) : (
                                  <>
                                    <Bluetooth size={14} />
                                    Scan for Bluetooth Printers
                                  </>
                                )}
                              </button>

                              {devices.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Found Printers</h4>
                                  {devices.map(device => (
                                    <button
                                      key={device.id}
                                      onClick={() => connectToPrinter(device)}
                                      className="w-full p-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg flex items-center justify-between hover:border-orange-500 transition-all group"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Printer size={16} className="text-gray-400 group-hover:text-orange-500" />
                                        <span className="font-bold dark:text-white text-xs">{device.name}</span>
                                      </div>
                                      <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Connect</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100">
                                <div className="flex items-center gap-2 mb-1">
                                  <BluetoothConnected size={14} className="text-blue-500" />
                                  <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Connected Device</span>
                                </div>
                                <p className="font-bold dark:text-white text-xs mb-1">{connectedDevice?.name}</p>
                                <p className="text-[8px] text-gray-500">ID: {connectedDevice?.id}</p>
                              </div>

                              <button
                                onClick={printTestPage}
                                disabled={testPrintStatus === 'printing'}
                                className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {testPrintStatus === 'printing' ? (
                                  <>Printing...</>
                                ) : testPrintStatus === 'success' ? (
                                  <>
                                    <CheckCircle2 size={14} className="text-green-500" />
                                    Test Page Sent!
                                  </>
                                ) : (
                                  <>
                                    <Printer size={14} />
                                    Print Test Page
                                  </>
                                )}
                              </button>

                              <button
                                onClick={disconnectPrinter}
                                className="w-full py-2 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-200"
                              >
                                Disconnect Printer
                              </button>
                            </div>
                          )}

                          {errorMessage && (
                            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200">
                              <p className="text-[9px] text-red-600 dark:text-red-400">{errorMessage}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Receipt Settings */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard size={16} className="text-orange-500" />
                        <h2 className="font-black dark:text-white uppercase tracking-tighter text-sm">Receipt Settings</h2>
                      </div>
                      {receiptSettingsSaved && (
                        <span className="text-[8px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-2 py-1 rounded">Saved</span>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700">
                        <div>
                          <h3 className="font-black text-xs dark:text-white">Auto-Print Receipt</h3>
                          <p className="text-[9px] text-gray-500 dark:text-gray-400">Automatically print after successful checkout</p>
                        </div>
                        <button
                          onClick={() => updateReceiptSetting('autoPrintEnabled', !receiptSettings.autoPrintEnabled)}
                          className={`w-12 h-6 rounded-full transition-all relative ${
                            receiptSettings.autoPrintEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                            receiptSettings.autoPrintEnabled ? 'left-7' : 'left-1'
                          }`} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Business Name</label>
                          <input
                            type="text"
                            value={receiptSettings.businessName}
                            onChange={event => updateReceiptSetting('businessName', event.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                            placeholder="Printed store name"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Header Line 1</label>
                          <input
                            type="text"
                            value={receiptSettings.headerLine1}
                            onChange={event => updateReceiptSetting('headerLine1', event.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Header Line 2</label>
                          <input
                            type="text"
                            value={receiptSettings.headerLine2}
                            onChange={event => updateReceiptSetting('headerLine2', event.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Footer Line 1</label>
                          <input
                            type="text"
                            value={receiptSettings.footerLine1}
                            onChange={event => updateReceiptSetting('footerLine1', event.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                            placeholder="Thank you!"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Footer Line 2</label>
                          <input
                            type="text"
                            value={receiptSettings.footerLine2}
                            onChange={event => updateReceiptSetting('footerLine2', event.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                            placeholder="Please come again"
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700 space-y-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Alignment & Offset</p>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Horizontal Offset</label>
                            <span className="text-[10px] font-black text-gray-600 dark:text-gray-300">{receiptSettings.horizontalOffset >= 0 ? `+${receiptSettings.horizontalOffset}` : receiptSettings.horizontalOffset}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={8}
                            step={1}
                            value={receiptSettings.horizontalOffset}
                            onChange={event => updateReceiptSetting('horizontalOffset', Number(event.target.value))}
                            className="w-full"
                          />
                          <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">Shift all aligned lines right for printer calibration</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            { key: 'businessNameAlign', label: 'Business Name' },
                            { key: 'headerLine1Align', label: 'Header Line 1' },
                            { key: 'headerLine2Align', label: 'Header Line 2' },
                            { key: 'totalAlign', label: 'Total Line' },
                            { key: 'footerLine1Align', label: 'Footer Line 1' },
                            { key: 'footerLine2Align', label: 'Footer Line 2' },
                          ].map(item => (
                            <div key={item.key}>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">{item.label} Align</label>
                              <select
                                value={receiptSettings[item.key as keyof ReceiptSettings] as string}
                                onChange={event => updateReceiptSetting(item.key as keyof ReceiptSettings, event.target.value as any)}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-xs font-bold dark:text-white"
                              >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Printed Fields</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {[
                            { key: 'showDateTime', label: 'Date & Time' },
                            { key: 'showOrderId', label: 'Order ID' },
                            { key: 'showTableNumber', label: 'Table Number' },
                            { key: 'showItems', label: 'Items' },
                            { key: 'showRemark', label: 'Remark' },
                            { key: 'showTotal', label: 'Total' },
                          ].map(field => (
                            <label key={field.key} className="flex items-center gap-2 text-[10px] font-bold text-gray-700 dark:text-gray-200">
                              <input
                                type="checkbox"
                                checked={receiptSettings[field.key as keyof ReceiptSettings] as boolean}
                                onChange={event => updateReceiptSetting(field.key as keyof ReceiptSettings, event.target.checked as any)}
                                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                              />
                              {field.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setShowReceiptPreview(true)}
                          className="px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-lg font-black uppercase text-[9px] tracking-widest text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 transition-all"
                        >
                          👁️ Preview
                        </button>
                        <button
                          onClick={() => setReceiptSettings(getDefaultReceiptSettings(restaurant.name))}
                          className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500 hover:text-orange-500"
                        >
                          Reset
                        </button>
                        <button
                          onClick={saveReceiptSettings}
                          disabled={isSavingReceiptSettings}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSavingReceiptSettings ? 'Saving...' : 'Save Receipt Settings'}
                        </button>
                      </div>
                    </div>
                  </div>



                  {/* Staff Management */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-orange-500" />
                        <h2 className="font-black dark:text-white uppercase tracking-tighter text-sm">Staff Management</h2>
                      </div>
                      <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{staffList.length} Staff</span>
                    </div>
                    <div className="p-4 space-y-4">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4">Add staff members to track transaction history and maintain audit trails</p>
                      
                      {staffList.length === 0 ? (
                        <div className="text-center py-8 border border-dashed dark:border-gray-700 rounded-lg">
                          <Users size={24} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">No staff added yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {staffList.map((staff: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700">
                              <div>
                                <p className="font-black text-xs dark:text-white">{staff.username}</p>
                                <p className="text-[8px] text-gray-400 uppercase tracking-widest">Created: {new Date(staff.createdAt || Date.now()).toLocaleDateString()}</p>
                              </div>
                              <button
                                onClick={() => handleRemoveStaff(staff, idx)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <button 
                        onClick={() => setIsAddStaffModalOpen(true)}
                        className="w-full py-3 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                      >
                        <UserPlus size={16} /> Add Staff Member
                      </button>
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
          onClose={handleCloseFormModal}
          onSubmit={handleSaveMenuItem}
          onImageUpload={handleImageUpload}
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

                <div className="flex items-center justify-between border dark:border-gray-700 rounded-lg p-3">
                  <div>
                    <p className="font-black text-xs dark:text-white uppercase tracking-tight">Skip Kitchen</p>
                    <p className="text-[9px] text-gray-400">Hide this category in kitchen workflow</p>
                  </div>
                  <button
                    onClick={() => setSkipKitchen(prev => !prev)}
                    className={`w-10 h-5 rounded-full transition-all relative ${
                      skipKitchen ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
                      skipKitchen ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
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
                            alert('Error saving to database: ' + error.message);
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
                          alert('Staff member added successfully!');
                        } catch (error: any) {
                          alert('Error: ' + error.message);
                          setIsAddingStaff(false);
                        }
                      } else {
                        alert('Please fill in all fields');
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
                          {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedTemp}</p>}
                          {item.selectedOtherVariant && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">• {item.selectedOtherVariant}</p>}
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



      <SimpleItemOptionsModal
        item={selectedItemForOptions}
        restaurantId={restaurant.id}
        onClose={() => setSelectedItemForOptions(null)}
        onConfirm={(item) => {
          addToPosCart(item);
          setSelectedItemForOptions(null);
        }}
      />

      {showReceiptPreview && (
        <ReceiptPreview
          receiptSettings={receiptSettings}
          sampleOrder={{
            id: 'ORD001',
            tableNumber: '5',
            timestamp: Date.now(),
            total: 8.50,
            items: [
              {
                name: 'Iced Coffee',
                quantity: 1,
                selectedSize: 'Large',
                selectedTemp: '',
                selectedOtherVariant: '',
                selectedAddOns: [],
              },
            ],
            remark: '',
          }}
          onClose={() => setShowReceiptPreview(false)}
        />
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
  );
};

export default PosOnlyView;
