import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, MenuItemVariant, AddOnItem, ReportResponse, ReportFilters } from '../types';
import { uploadImage } from '../lib/storage';
import { 
  ShoppingBag, BookOpen, BarChart3, Edit3, CheckCircle, Clock, X, Plus, Trash2, 
  Image as ImageIcon, LayoutGrid, List, Filter, Archive, RotateCcw, Power, Eye, Upload, 
  Hash, MessageSquare, Download, Calendar, Ban, ChevronLeft, ChevronRight, Bell, Activity, 
  RefreshCw, Layers, Tag, Wifi, WifiOff, QrCode, Printer, ExternalLink, ThermometerSun, 
  Info, Settings2, Menu, ToggleLeft, ToggleRight, Link, Search, ChevronFirst, ChevronLast, 
  Receipt, CreditCard, PlusCircle, Settings, Bluetooth, BluetoothConnected, AlertCircle,
  CheckCircle2, BellRing, PrinterIcon, Coffee, Utensils, Grid
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import printerService, { PrinterDevice } from '../services/printerService';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus, rejectionReason?: string, rejectionNote?: string) => void;
  onUpdateMenu: (restaurantId: string, updatedItem: MenuItem) => void;
  onAddMenuItem: (restaurantId: string, newItem: MenuItem) => void;
  onPermanentDeleteMenuItem: (restaurantId: string, itemId: string) => void;
  onToggleOnline: () => void;
  lastSyncTime?: Date;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  onSwitchToPos?: () => void;
}

interface OrderSettings {
  autoAccept: boolean;
  autoPrint: boolean;
}

interface CategoryData {
  name: string;
  skipKitchen: boolean;
}

interface ModifierData {
  name: string;
  options: ModifierOption[];
}

interface ModifierOption {
  name: string;
  price: number;
}

const REJECTION_REASONS = [
  'Item out of stock',
  'Kitchen too busy',
  'Restaurant closed early',
  'Other'
];

const VendorView: React.FC<Props> = ({ 
  restaurant, 
  orders, 
  onUpdateOrder, 
  onUpdateMenu, 
  onAddMenuItem, 
  onPermanentDeleteMenuItem, 
  onToggleOnline, 
  lastSyncTime,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  onSwitchToPos
}) => {
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'MENU' | 'REPORTS' | 'QR' | 'SETTINGS'>('ORDERS');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'ALL'>('ONGOING_ALL');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING'>('IDLE');
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  
  // Menu Sub-Tabs
  const [menuSubTab, setMenuSubTab] = useState<'KITCHEN' | 'CATEGORY' | 'MODIFIER'>('KITCHEN');
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [showAddModifierModal, setShowAddModifierModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newModifierName, setNewModifierName] = useState('');
  const [skipKitchen, setSkipKitchen] = useState(false);
  const [extraCategories, setExtraCategories] = useState<CategoryData[]>([]);
  const [modifiers, setModifiers] = useState<ModifierData[]>([]);
  
  // Classification Specific State
  const [classViewMode, setClassViewMode] = useState<'grid' | 'list'>('list');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingSkipKitchen, setEditingSkipKitchen] = useState<string | null>(null);

  // Modifier Specific State
  const [modifierViewMode, setModifierViewMode] = useState<'grid' | 'list'>('list');
  const [editingModifier, setEditingModifier] = useState<string | null>(null);
  const [editingModifierOptions, setEditingModifierOptions] = useState<string | null>(null);
  const [tempModifierOptions, setTempModifierOptions] = useState<ModifierOption[]>([]);
  const [tempModifierName, setTempModifierName] = useState('');

  // QR State
  const [qrMode, setQrMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [qrTableNo, setQrTableNo] = useState<string>('1');
  const [qrStartRange, setQrStartRange] = useState<string>('1');
  const [qrEndRange, setQrEndRange] = useState<string>('10');

  // Rejection State
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>(REJECTION_REASONS[0]);
  const [rejectionNote, setRejectionNote] = useState<string>('');

  // Menu View Options
  const [menuViewMode, setMenuViewMode] = useState<'grid' | 'list'>('grid');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('All');
  const [menuStatusFilter, setMenuStatusFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');

  // Report Filters & Pagination
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatus, setReportStatus] = useState<'ALL' | OrderStatus>('ALL');
  const [reportStart, setReportStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); 
    return d.toISOString().split('T')[0];
  });
  const [reportEnd, setReportEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [entriesPerPage, setEntriesPerPage] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
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

  // Order Settings State
  const [orderSettings, setOrderSettings] = useState<OrderSettings>(() => {
    const saved = localStorage.getItem(`order_settings_${restaurant.id}`);
    return saved ? JSON.parse(saved) : { autoAccept: false, autoPrint: false };
  });

  // New Order Alert State
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  
  // FIXED: Properly filter orders by status only
  const pendingOrders = useMemo(() => {
    return orders.filter(o => o.status === OrderStatus.PENDING);
  }, [orders]);

  // FIXED: Filter orders for display based on selected filter
  const filteredOrders = useMemo(() => {
    if (orderFilter === 'ALL') return orders;
    if (orderFilter === 'ONGOING_ALL') {
      return orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING);
    }
    return orders.filter(o => o.status === orderFilter);
  }, [orders, orderFilter]);

  const prevPendingCount = useRef(pendingOrders.length);

  // FIXED: Load data from restaurant prop first (database), then localStorage as fallback
  useEffect(() => {
    // Load categories from restaurant prop (database)
    if (restaurant.categories && restaurant.categories.length > 0) {
      setExtraCategories(restaurant.categories);
    } else {
      // Fallback to localStorage
      const savedCategories = localStorage.getItem(`categories_${restaurant.id}`);
      if (savedCategories) {
        setExtraCategories(JSON.parse(savedCategories));
      }
    }
    
    // Load modifiers from restaurant prop (database)
    if (restaurant.modifiers && restaurant.modifiers.length > 0) {
      setModifiers(restaurant.modifiers);
    } else {
      // Fallback to localStorage
      const savedModifiers = localStorage.getItem(`modifiers_${restaurant.id}`);
      if (savedModifiers) {
        setModifiers(JSON.parse(savedModifiers));
      }
    }
  }, [restaurant.id, restaurant.categories, restaurant.modifiers]);

  // FIXED: Save categories to database when they change
  const saveCategoriesToDatabase = async (categories: CategoryData[]) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ categories })
        .eq('id', restaurant.id);
      
      if (error) {
        console.error('Error saving categories to database:', error);
      }
    } catch (error) {
      console.error('Error saving categories:', error);
    }
  };

  // FIXED: Save modifiers to database when they change
  const saveModifiersToDatabase = async (modifiers: ModifierData[]) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ modifiers })
        .eq('id', restaurant.id);
      
      if (error) {
        console.error('Error saving modifiers to database:', error);
      }
    } catch (error) {
      console.error('Error saving modifiers:', error);
    }
  };

  // Save categories to localStorage and database
  useEffect(() => {
    localStorage.setItem(`categories_${restaurant.id}`, JSON.stringify(extraCategories));
    saveCategoriesToDatabase(extraCategories);
  }, [extraCategories, restaurant.id]);

  // Save modifiers to localStorage and database
  useEffect(() => {
    localStorage.setItem(`modifiers_${restaurant.id}`, JSON.stringify(modifiers));
    saveModifiersToDatabase(modifiers);
  }, [modifiers, restaurant.id]);

  // Sound & Visual Alert for New Orders
  useEffect(() => {
    if (pendingOrders.length > prevPendingCount.current) {
      triggerNewOrderAlert();
      setShowNewOrderAlert(true);
      setTimeout(() => setShowNewOrderAlert(false), 5000);
      
      // Auto-accept if enabled
      if (orderSettings.autoAccept) {
        const newOrders = orders.filter(o => 
          o.status === OrderStatus.PENDING && 
          o.timestamp > prevPendingCount.current
        );
        newOrders.forEach(order => {
          handleAcceptAndPrint(order.id);
        });
      }
    }
    prevPendingCount.current = pendingOrders.length;
  }, [pendingOrders.length]);

  // Check Bluetooth support
  useEffect(() => {
    if (!('bluetooth' in navigator) || !(navigator as any).bluetooth) {
      setIsBluetoothSupported(false);
      setErrorMessage('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }
  }, []);

  // Load saved printer from localStorage
  useEffect(() => {
    const savedPrinter = localStorage.getItem(`printer_${restaurant.id}`);
    if (savedPrinter) {
      try {
        const printer = JSON.parse(savedPrinter);
        setConnectedDevice(printer);
        setPrinterStatus('connected');
      } catch (e) {
        console.error('Failed to load saved printer');
      }
    }
  }, [restaurant.id]);

  // Save order settings to localStorage
  useEffect(() => {
    localStorage.setItem(`order_settings_${restaurant.id}`, JSON.stringify(orderSettings));
  }, [orderSettings, restaurant.id]);

  const [formItem, setFormItem] = useState<Partial<MenuItem & { sizesEnabled?: boolean }>>({
    name: '',
    description: '',
    price: 0,
    image: '',
    category: 'Main Dish',
    sizes: [],
    sizesEnabled: false,
    otherVariantName: '',
    otherVariants: [],
    otherVariantsEnabled: false,
    tempOptions: { enabled: false, hot: 0, cold: 0 },
    addOns: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const base = new Set(restaurant.menu.map(item => item.category));
    extraCategories.forEach(c => base.add(c.name));
    return ['All', ...Array.from(base)];
  }, [restaurant.menu, extraCategories]);

  const currentMenu = restaurant.menu.filter(item => {
    const statusMatch = menuStatusFilter === 'ACTIVE' ? !item.isArchived : !!item.isArchived;
    const categoryMatch = menuCategoryFilter === 'All' || item.category === menuCategoryFilter;
    return statusMatch && categoryMatch;
  });

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

  const totalPages = reportData ? Math.ceil(reportData.totalCount / entriesPerPage) : 0;
  const paginatedReports = reportData?.orders || [];

  const handleDownloadReport = async () => {
    const allOrders = await fetchReport(true);
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  const handleConfirmRejection = () => {
    if (rejectingOrderId) {
      onUpdateOrder(rejectingOrderId, OrderStatus.CANCELLED, rejectionReason, rejectionNote);
      setRejectingOrderId(null);
      setRejectionReason(REJECTION_REASONS[0]);
      setRejectionNote('');
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
      sizes: [],
      sizesEnabled: false,
      otherVariantName: '',
      otherVariants: [],
      otherVariantsEnabled: false,
      tempOptions: { enabled: false, hot: 0, cold: 0 },
      addOns: []
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
      addOns: item.addOns ? [...item.addOns] : []
    });
    setIsFormModalOpen(true);
  };

  const handleAddSize = () => {
    setFormItem({
      ...formItem,
      sizes: [...(formItem.sizes || []), { name: '', price: 0 }]
    });
  };

  const handleRemoveSize = (index: number) => {
    setFormItem({
      ...formItem,
      sizes: formItem.sizes?.filter((_, i) => i !== index)
    });
  };

  const handleSizeChange = (index: number, field: 'name' | 'price', value: string | number) => {
    const updatedSizes = [...(formItem.sizes || [])];
    updatedSizes[index] = { ...updatedSizes[index], [field]: value };
    setFormItem({ ...formItem, sizes: updatedSizes });
  };

  const handleAddOtherVariant = () => {
    setFormItem({
      ...formItem,
      otherVariants: [...(formItem.otherVariants || []), { name: '', price: 0 }]
    });
  };

  const handleRemoveOtherVariant = (index: number) => {
    setFormItem({
      ...formItem,
      otherVariants: formItem.otherVariants?.filter((_, i) => i !== index)
    });
  };

  const handleOtherVariantChange = (index: number, field: 'name' | 'price', value: string | number) => {
    const updated = [...(formItem.otherVariants || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormItem({ ...formItem, otherVariants: updated });
  };

  // Add-On handlers
  const handleAddAddOn = () => {
    setFormItem({
      ...formItem,
      addOns: [...(formItem.addOns || []), { name: '', price: 0, maxQuantity: 1, required: false }]
    });
  };

  const handleRemoveAddOn = (index: number) => {
    setFormItem({
      ...formItem,
      addOns: formItem.addOns?.filter((_, i) => i !== index)
    });
  };

  const handleAddOnChange = (index: number, field: keyof AddOnItem, value: string | number | boolean) => {
    const updated = [...(formItem.addOns || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormItem({ ...formItem, addOns: updated });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const publicUrl = await uploadImage(file, 'quickserve', 'menu-items');
        setFormItem({ ...formItem, image: publicUrl });
      } catch (error) {
        console.error("Upload failed:", error);
        alert("Failed to upload image. Please try again.");
      }
    }
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItem.name) return;

    const itemToSave: MenuItem = {
      id: editingItem ? editingItem.id : crypto.randomUUID(),
      name: formItem.name || '',
      description: formItem.description || '',
      price: Number(formItem.price || 0),
      image: formItem.image || `https://picsum.photos/seed/${formItem.name}/400/300`,
      category: formItem.category || 'Main Dish',
      isArchived: editingItem ? editingItem.isArchived : false,
      sizes: formItem.sizesEnabled ? formItem.sizes : [],
      otherVariantName: formItem.otherVariantName,
      otherVariants: formItem.otherVariants,
      otherVariantsEnabled: formItem.otherVariantsEnabled,
      tempOptions: formItem.tempOptions?.enabled ? formItem.tempOptions : undefined,
      addOns: formItem.addOns || []
    };

    if (editingItem) {
      onUpdateMenu(restaurant.id, itemToSave);
    } else {
      onAddMenuItem(restaurant.id, itemToSave);
    }
    setIsFormModalOpen(false);
  };

  const handleArchiveItem = (item: MenuItem) => {
    onUpdateMenu(restaurant.id, { ...item, isArchived: true });
  };

  const handleRestoreItem = (item: MenuItem) => {
    onUpdateMenu(restaurant.id, { ...item, isArchived: false });
  };

  const handlePermanentDelete = (itemId: string) => {
    if (confirm('Are you sure you want to permanently delete this item?')) {
      onPermanentDeleteMenuItem(restaurant.id, itemId);
    }
  };

  // Category Handlers
  const handleAddCategory = () => {
    if (!newClassName.trim()) return;
    if (categories.includes(newClassName.trim())) {
      alert("Category already exists.");
      return;
    }
    setExtraCategories(prev => [...prev, { name: newClassName.trim(), skipKitchen }]);
    setNewClassName('');
    setSkipKitchen(false);
    setShowAddClassModal(false);
  };

  const handleToggleSkipKitchen = (categoryName: string) => {
    setExtraCategories(prev => prev.map(c => 
      c.name === categoryName ? { ...c, skipKitchen: !c.skipKitchen } : c
    ));
    setEditingSkipKitchen(null);
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setRenamingClass(null);
      return;
    }
    
    setExtraCategories(prev => prev.map(c => 
      c.name === oldName ? { ...c, name: newName } : c
    ));
    
    const affectedItems = restaurant.menu.filter(i => i.category === oldName);
    affectedItems.forEach(item => {
      onUpdateMenu(restaurant.id, { ...item, category: newName });
    });

    setRenamingClass(null);
  };

  const handleRemoveCategory = (name: string) => {
    if (confirm(`Are you sure you want to remove the "${name}" category? Items in this category will be moved to "Main Dish".`)) {
      setExtraCategories(prev => prev.filter(c => c.name !== name));
      
      const affectedItems = restaurant.menu.filter(i => i.category === name);
      affectedItems.forEach(item => {
        onUpdateMenu(restaurant.id, { ...item, category: 'Main Dish' });
      });
    }
  };

  // Modifier Handlers
  const handleAddModifier = () => {
    setShowAddModifierModal(true);
    setTempModifierName('');
    setTempModifierOptions([]);
  };

  const handleSaveModifier = () => {
    if (!tempModifierName.trim()) {
      alert("Please enter a modifier name");
      return;
    }
    
    // Filter out empty options
    const validOptions = tempModifierOptions.filter(opt => opt.name.trim() !== '');
    
    setModifiers(prev => [...prev, { 
      name: tempModifierName.trim(), 
      options: validOptions 
    }]);
    
    setShowAddModifierModal(false);
    setTempModifierName('');
    setTempModifierOptions([]);
  };

  const handleAddModifierOption = () => {
    setTempModifierOptions([...tempModifierOptions, { name: '', price: 0 }]);
  };

  const handleRemoveModifierOption = (index: number) => {
    setTempModifierOptions(tempModifierOptions.filter((_, i) => i !== index));
  };

  const handleModifierOptionChange = (index: number, field: keyof ModifierOption, value: string | number) => {
    const updated = [...tempModifierOptions];
    updated[index] = { ...updated[index], [field]: value };
    setTempModifierOptions(updated);
  };

  const handleEditModifier = (modifier: ModifierData) => {
    setEditingModifier(modifier.name);
    setTempModifierName(modifier.name);
    setTempModifierOptions([...modifier.options]);
    setShowAddModifierModal(true);
  };

  const handleUpdateModifier = () => {
    if (!tempModifierName.trim() || !editingModifier) return;
    
    const validOptions = tempModifierOptions.filter(opt => opt.name.trim() !== '');
    
    setModifiers(prev => prev.map(m => 
      m.name === editingModifier 
        ? { name: tempModifierName.trim(), options: validOptions }
        : m
    ));
    
    setShowAddModifierModal(false);
    setEditingModifier(null);
    setTempModifierName('');
    setTempModifierOptions([]);
  };

  const handleRemoveModifier = (name: string) => {
    if (confirm(`Are you sure you want to remove the "${name}" modifier?`)) {
      setModifiers(prev => prev.filter(m => m.name !== name));
    }
  };

  const handleRenameModifier = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setEditingModifier(null);
      return;
    }
    
    setModifiers(prev => prev.map(m => 
      m.name === oldName ? { ...m, name: newName } : m
    ));

    setEditingModifier(null);
  };

  const getQrUrl = (hubName: string, table: string) => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?loc=${encodeURIComponent(hubName)}&table=${table}`;
  };

  const handlePrintQr = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 50);
    });
  };

  // Printer Functions using printerService
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
    
    const success = await printerService.printTestPage();
    
    if (success) {
      setTestPrintStatus('success');
      setTimeout(() => setTestPrintStatus('idle'), 3000);
    } else {
      setTestPrintStatus('error');
      setErrorMessage('Print failed');
    }
  };

  // FIXED: Improved handleAcceptAndPrint with better error handling
  const handleAcceptAndPrint = async (orderId: string) => {
    // First update the order status
    await onUpdateOrder(orderId, OrderStatus.ONGOING);
    const order = orders.find(o => o.id === orderId);
    
    // Check if auto-print is enabled
    if (order && orderSettings.autoPrint) {
      if (!connectedDevice) {
        console.error('No printer connected');
        alert('Printer is not connected. Please connect a printer in Settings.');
        return;
      }

      try {
        setPrintingOrderId(orderId);
        
        // Let the printer service handle retries internally
        const printSuccess = await printerService.printReceipt(order, restaurant);
        
        if (printSuccess) {
          console.log('Order printed successfully');
        } else {
          console.error('Failed to print order after multiple attempts');
          alert('Order accepted but failed to print. You can use the "Print Only" button to try again.');
        }
        
      } catch (error) {
        console.error('Error during print process:', error);
        alert('Error occurred while printing. Please check printer connection.');
      } finally {
        setPrintingOrderId(null);
      }
    }
  };

  const handleManualPrint = async (order: Order) => {
    if (!connectedDevice) {
      alert('No printer connected. Please connect a printer in Settings.');
      return;
    }

    setPrintingOrderId(order.id);
    try {
      const success = await printerService.printReceipt(order, restaurant);
      
      if (success) {
        alert('Order printed successfully!');
      } else {
        alert('Failed to print after multiple attempts. Please check printer connection.');
      }
    } catch (error) {
      console.error('Manual print error:', error);
      alert('Error occurred while printing.');
    } finally {
      setPrintingOrderId(null);
    }
  };

  const toggleOrderSetting = (key: keyof OrderSettings) => {
    setOrderSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isOnline = restaurant.isOnline !== false;

  const handleTabSelection = (tab: 'ORDERS' | 'MENU' | 'REPORTS' | 'QR' | 'SETTINGS') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden dark:bg-gray-900 transition-colors relative">
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 
        flex flex-col transition-transform duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
          <img src={restaurant.logo} className="w-10 h-10 rounded-lg shadow-sm" />
          <div>
            <h2 className="font-black dark:text-white text-sm uppercase tracking-tight">{restaurant.name}</h2>
            <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mt-0.5">Kitchen Portal</p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => handleTabSelection('ORDERS')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'ORDERS' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <div className="flex items-center gap-3"><ShoppingBag size={20} /> Incoming Orders</div>
            {pendingOrders.length > 0 && <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">{pendingOrders.length}</span>}
          </button>
          <button 
            onClick={() => handleTabSelection('MENU')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'MENU' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <BookOpen size={20} />
            Menu Editor
          </button>
          {restaurant.settings?.showSalesReport !== false && (
            <button 
              onClick={() => handleTabSelection('REPORTS')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'REPORTS' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              <BarChart3 size={20} />
              Sales Reports
            </button>
          )}
          {restaurant.settings?.showQrGenerator !== false && (
            <button 
              onClick={() => handleTabSelection('QR')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'QR' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              <QrCode size={20} />
              QR Generator
            </button>
          )}
          <button 
            onClick={() => handleTabSelection('SETTINGS')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'SETTINGS' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
          >
            <Settings size={20} />
            Settings
          </button>
        </nav>
        <div className="p-4 mt-auto border-t dark:border-gray-700 space-y-4">
          <button 
            onClick={onSwitchToPos}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all border border-orange-100 dark:border-orange-900/20"
          >
            <CreditCard size={18} /> Switch to POS Terminal
          </button>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Store Presence</label>
          <button 
            onClick={onToggleOnline}
            className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg ${
              isOnline 
                ? 'bg-green-500 text-white hover:bg-green-600' 
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
            {isOnline ? 'Online' : 'Offline'}
          </button>
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600">
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${syncStatus === 'SYNCING' ? 'bg-blue-500 scale-125' : (isOnline ? 'bg-green-500' : 'bg-red-500')} transition-all duration-300 animate-pulse`}></div>
                <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Live Feed</span>
             </div>
             {syncStatus === 'SYNCING' && <RefreshCw size={10} className="animate-spin text-blue-500" />}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-all">
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
              {activeTab === 'ORDERS' ? 'Incoming Orders' : 
               activeTab === 'MENU' ? 'Menu Editor' : 
               activeTab === 'REPORTS' ? 'Sales Reports' : 
               activeTab === 'QR' ? 'QR Generator' : 
               'Settings'}
            </h1>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'QR' && (
            <div className="max-w-4xl mx-auto no-print">
              <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Table QR Codes</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Generate ordering labels for your tables at {restaurant.location}.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border dark:border-gray-700 shadow-sm space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Generation Mode</label>
                    <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-lg">
                      <button onClick={() => setQrMode('SINGLE')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${qrMode === 'SINGLE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-400'}`}>Single Table</button>
                      <button onClick={() => setQrMode('BATCH')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${qrMode === 'BATCH' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-400'}`}>Batch Range</button>
                    </div>
                  </div>

                  {qrMode === 'SINGLE' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Table Number</label>
                      <div className="relative">
                        <Hash size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-sm font-bold dark:text-white" value={qrTableNo} onChange={e => setQrTableNo(e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">From</label>
                        <input type="number" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-sm font-bold dark:text-white" value={qrStartRange} onChange={e => setQrStartRange(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">To</label>
                        <input type="number" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg outline-none text-sm font-bold dark:text-white" value={qrEndRange} onChange={e => setQrEndRange(e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-100 dark:border-orange-900/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ExternalLink size={14} className="text-orange-500" />
                      <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Target Link</span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400 break-all leading-tight">
                      {getQrUrl(restaurant.location, qrMode === 'SINGLE' ? qrTableNo : '{ID}')}
                    </p>
                  </div>

                  <button onClick={handlePrintQr} className="w-full py-4 bg-orange-500 text-white rounded-lg font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-orange-600 transition-all">
                    <Printer size={18} /> Print Labels
                  </button>
                </div>

                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl border dark:border-gray-700 shadow-sm flex flex-col items-center justify-center text-center">
                   {qrMode === 'SINGLE' ? (
                     <>
                       <div className="p-6 bg-white rounded-xl shadow-xl border border-gray-100 mb-6">
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getQrUrl(restaurant.location, qrTableNo))}`} alt="QR Code" className="w-48 h-48" />
                       </div>
                       <p className="font-black text-lg dark:text-white uppercase tracking-tighter">{restaurant.name}</p>
                       <p className="text-3xl font-black text-orange-500 uppercase">TABLE {qrTableNo}</p>
                     </>
                   ) : (
                     <div className="space-y-4">
                       <QrCode size={80} className="mx-auto text-orange-500 opacity-20" />
                       <p className="text-lg font-black dark:text-white uppercase">Batch Range Ready</p>
                       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                         {(() => {
                           const start = parseInt(qrStartRange);
                           const end = parseInt(qrEndRange);
                           if (isNaN(start) || isNaN(end)) return 0;
                           return Math.max(0, end - start + 1);
                         })()} Labels will be printed
                       </p>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ORDERS' && (
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-4">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">kitchen order</h1>
                  {lastSyncTime && (
                    <div className={`flex items-center justify-center gap-2 text-[10px] font-black px-3 py-1.5 rounded-full border transition-all duration-300 min-w-[140px] shrink-0 ${syncStatus === 'SYNCING' ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'SYNCING' ? 'bg-blue-500 animate-ping' : 'bg-gray-300'}`}></div>
                      {syncStatus === 'SYNCING' ? 'SYNCING...' : `SYNC: ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                    </div>
                  )}
                </div>
                <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 border dark:border-gray-700 shadow-sm overflow-x-auto hide-scrollbar">
                  <button onClick={() => setOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ONGOING</button>
                  <button onClick={() => setOrderFilter(OrderStatus.COMPLETED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === OrderStatus.COMPLETED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>SERVED</button>
                  <button onClick={() => setOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>CANCELLED</button>
                  <button onClick={() => setOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ALL ORDER</button>
                </div>
              </div>

              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                      <ShoppingBag size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">Kitchen Quiet</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Waiting for incoming signals...</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-start gap-6 transition-all hover:border-orange-200">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ORDER #{order.id}</span>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg">
                              <Hash size={12} className="text-orange-500" />
                              <span className="text-xs font-black">Table {order.tableNumber}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-sm border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                              <div>
                                  <p className="font-bold text-gray-900 dark:text-white">x{item.quantity} {item.name}</p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                      {item.selectedSize && <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">Size: {item.selectedSize}</span>}
                                      {item.selectedTemp && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${item.selectedTemp === 'Hot' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>Temp: {item.selectedTemp}</span>}
                                  </div>
                              </div>
                              <span className="text-gray-500 dark:text-gray-400 font-bold">RM{(item.price * item.quantity).toFixed(2)}</span>
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
                          <span className="text-2xl font-black text-gray-900 dark:text-white">RM{order.total.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex md:flex-col gap-2 min-w-[140px] mt-2 md:mt-0">
                        {order.status === OrderStatus.PENDING && (
                          <>
                            <button 
                              onClick={() => handleAcceptAndPrint(order.id)} 
                              className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg"
                            >
                              Accept {orderSettings.autoPrint && '& Print'}
                            </button>
                            
                            {/* Manual Print Button */}
                            {connectedDevice && (
                              <button 
                                onClick={() => handleManualPrint(order)}
                                disabled={printingOrderId === order.id}
                                className="flex-1 py-3 px-4 bg-gray-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-gray-700 transition-all shadow-lg disabled:opacity-50"
                              >
                                {printingOrderId === order.id ? 'Printing...' : 'Print Only'}
                              </button>
                            )}
                            
                            <button 
                              onClick={() => setRejectingOrderId(order.id)} 
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
                            <CheckCircle size={18} />
                            Serve Order
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Rest of the component remains exactly the same from here */}
          {activeTab === 'MENU' && (
            <div className="max-w-7xl mx-auto">
              {/* ... existing MENU tab code ... */}
              {/* Keep all your existing MENU tab JSX here */}
            </div>
          )}

          {activeTab === 'REPORTS' && (
            <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
              {/* ... existing REPORTS tab code ... */}
              {/* Keep all your existing REPORTS tab JSX here */}
            </div>
          )}

          {activeTab === 'SETTINGS' && (
            <div className="max-w-4xl mx-auto">
              {/* ... existing SETTINGS tab code ... */}
              {/* Keep all your existing SETTINGS tab JSX here */}
            </div>
          )}
        </div>
      </main>

      {/* All modals remain exactly the same */}
      {/* ... existing modal JSX ... */}
    </div>
  );
};

export default VendorView;
