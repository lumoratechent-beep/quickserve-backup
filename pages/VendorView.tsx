import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, MenuItemVariant, AddOnItem, ReportResponse, ReportFilters } from '../types';
import { uploadImage } from '../lib/storage';
import { 
  ShoppingBag, BookOpen, BarChart3, Edit3, CheckCircle, Clock, X, Plus, Trash2, 
  Image as ImageIcon, LayoutGrid, List, Filter, Archive, RotateCcw, Power, Eye, Upload, 
  Hash, MessageSquare, Download, Calendar, Ban, ChevronLeft, ChevronRight, Bell, Activity, 
  RefreshCw, Layers, Tag, Wifi, WifiOff, QrCode, Printer, ExternalLink, ThermometerSun, 
  Info, Settings2, Menu, ToggleLeft, ToggleRight, Link, Search, ChevronFirst, ChevronLast, 
  Receipt, CreditCard, PlusCircle, Settings, PrinterIcon, BellRing, ChefHat, AlertCircle,
  Bluetooth, BluetoothConnected, CheckCircle2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PrinterSettings from '../components/PrinterSettings';
import OrderSettings from '../components/OrderSettings';
import printerService from '../services/printerService';

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
  const [printerConnected, setPrinterConnected] = useState(false);
  
  // Menu Sub-Tabs
  const [menuSubTab, setMenuSubTab] = useState<'KITCHEN' | 'CLASSIFICATION'>('KITCHEN');
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  
  // Classification Specific State
  const [classViewMode, setClassViewMode] = useState<'grid' | 'list'>('list');
  const [renamingClass, setRenamingClass] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  // Order Settings
  const [orderSettings, setOrderSettings] = useState<OrderSettings>(() => {
    const saved = localStorage.getItem(`order_settings_${restaurant.id}`);
    return saved ? JSON.parse(saved) : { autoAccept: false, autoPrint: false };
  });

  // New Order Alert
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const pendingOrders = useMemo(() => orders.filter(o => o.status === OrderStatus.PENDING), [orders]);
  const prevPendingCount = useRef(pendingOrders.length);

  // Auto-accept new orders
  useEffect(() => {
    if (pendingOrders.length > prevPendingCount.current) {
      triggerNewOrderAlert();
      
      if (orderSettings.autoAccept) {
        const newOrders = orders.filter(o => 
          o.status === OrderStatus.PENDING && 
          o.timestamp > Date.now() - 5000
        );
        newOrders.forEach(order => {
          handleAcceptAndPrint(order.id);
        });
      }
    }
    prevPendingCount.current = pendingOrders.length;
  }, [pendingOrders.length]);

  // Save order settings
  useEffect(() => {
    localStorage.setItem(`order_settings_${restaurant.id}`, JSON.stringify(orderSettings));
  }, [orderSettings]);

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
    extraCategories.forEach(c => base.add(c));
    return ['All', ...Array.from(base)];
  }, [restaurant.menu, extraCategories]);

  const filteredOrders = orders.filter(o => {
    if (orderFilter === 'ALL') return true;
    if (orderFilter === 'ONGOING_ALL') return o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING;
    return o.status === orderFilter;
  });

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

  const handleAcceptAndPrint = async (orderId: string) => {
    await onUpdateOrder(orderId, OrderStatus.ONGOING);
    const order = orders.find(o => o.id === orderId);
    
    if (order && orderSettings.autoPrint && printerConnected) {
      await printerService.printReceipt(order, restaurant);
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
        alert("Failed to upload image");
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

  const handleAddClassification = () => {
    if (!newClassName.trim()) return;
    if (categories.includes(newClassName.trim())) {
      alert("Classification already exists.");
      return;
    }
    setExtraCategories(prev => [...prev, newClassName.trim()]);
    setNewClassName('');
    setShowAddClassModal(false);
  };

  const handleRenameClassification = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setRenamingClass(null);
      return;
    }
    
    setExtraCategories(prev => prev.map(c => c === oldName ? newName : c));
    
    const affectedItems = restaurant.menu.filter(i => i.category === oldName);
    affectedItems.forEach(item => {
      onUpdateMenu(restaurant.id, { ...item, category: newName });
    });

    setRenamingClass(null);
  };

  const handleRemoveClassification = (name: string) => {
    if (confirm(`Are you sure you want to remove the "${name}" classification? Items in this category will be moved to "Main Dish".`)) {
      setExtraCategories(prev => prev.filter(c => c !== name));
      
      const affectedItems = restaurant.menu.filter(i => i.category === name);
      affectedItems.forEach(item => {
        onUpdateMenu(restaurant.id, { ...item, category: 'Main Dish' });
      });
    }
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
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 
        flex flex-col transition-transform duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Restaurant Header */}
        <div className="p-6 border-b dark:border-gray-700 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-orange-200 dark:shadow-none">
            {restaurant.name.charAt(0)}
          </div>
          <div>
            <h2 className="font-black dark:text-white text-sm uppercase tracking-tight">{restaurant.name}</h2>
            <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mt-0.5">Kitchen Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'ORDERS', label: 'Incoming Orders', icon: ShoppingBag },
            { id: 'MENU', label: 'Menu Editor', icon: BookOpen },
            { id: 'REPORTS', label: 'Sales Reports', icon: BarChart3 },
            { id: 'QR', label: 'QR Generator', icon: QrCode },
            { id: 'SETTINGS', label: 'Settings', icon: Settings }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === 'ORDERS' && pendingOrders.length > 0;
            
            return (
              <button
                key={tab.id}
                onClick={() => handleTabSelection(tab.id as any)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all ${
                  isActive 
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <tab.icon size={20} />
                  <span className="text-xs font-black uppercase tracking-widest">{tab.label}</span>
                </div>
                {showBadge && (
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
                    {pendingOrders.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 space-y-4">
          <button 
            onClick={onSwitchToPos}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all border border-orange-100 dark:border-orange-900/20"
          >
            <CreditCard size={18} />
            POS Terminal
          </button>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Store Presence
            </label>
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
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${syncStatus === 'SYNCING' ? 'bg-blue-500 scale-125' : (isOnline ? 'bg-green-500' : 'bg-red-500')} transition-all duration-300 animate-pulse`} />
              <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Live Feed
              </span>
            </div>
            {syncStatus === 'SYNCING' && <RefreshCw size={10} className="animate-spin text-blue-500" />}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-all">
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
              {activeTab === 'ORDERS' ? 'Incoming Orders' : 
               activeTab === 'MENU' ? 'Menu Editor' : 
               activeTab === 'REPORTS' ? 'Sales Reports' : 
               activeTab === 'QR' ? 'QR Generator' : 
               'Settings'}
            </h1>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {/* Orders Tab */}
          {activeTab === 'ORDERS' && (
            <div className="max-w-5xl mx-auto">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-4">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">Kitchen Orders</h1>
                  {lastSyncTime && (
                    <div className={`flex items-center justify-center gap-2 text-[10px] font-black px-3 py-1.5 rounded-full border transition-all duration-300 min-w-[140px] shrink-0 ${
                      syncStatus === 'SYNCING' 
                        ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' 
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'SYNCING' ? 'bg-blue-500 animate-ping' : 'bg-gray-300'}`} />
                      {syncStatus === 'SYNCING' ? 'SYNCING...' : `SYNC: ${lastSyncTime.toLocaleTimeString()}`}
                    </div>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm overflow-x-auto hide-scrollbar">
                  {[
                    { value: 'ONGOING_ALL', label: 'ACTIVE' },
                    { value: 'COMPLETED', label: 'SERVED' },
                    { value: 'CANCELLED', label: 'CANCELLED' },
                    { value: 'ALL', label: 'ALL' }
                  ].map(filter => (
                    <button
                      key={filter.value}
                      onClick={() => setOrderFilter(filter.value as any)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                        orderFilter === filter.value
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orders List */}
              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                      <ChefHat size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">
                      Kitchen Quiet
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                      Waiting for incoming signals...
                    </p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-start gap-6 transition-all hover:border-orange-200">
                      {/* Order Details */}
                      <div className="flex-1">
                        {/* Order Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              ORDER #{order.id}
                            </span>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg">
                              <Hash size={12} className="text-orange-500" />
                              <span className="text-xs font-black">Table {order.tableNumber}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-gray-400" />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {new Date(order.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {/* Order Items */}
                        <div className="space-y-3">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-sm border-l-2 border-gray-100 dark:border-gray-700 pl-3">
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white">
                                  x{item.quantity} {item.name}
                                </p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {item.selectedSize && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">
                                      Size: {item.selectedSize}
                                    </span>
                                  )}
                                  {item.selectedTemp && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${
                                      item.selectedTemp === 'Hot' 
                                        ? 'bg-orange-50 text-orange-600' 
                                        : 'bg-blue-50 text-blue-600'
                                    }`}>
                                      Temp: {item.selectedTemp}
                                    </span>
                                  )}
                                  {item.selectedAddOns?.map((addon, i) => (
                                    <span key={i} className="text-[8px] font-bold text-gray-500 block w-full">
                                      + {addon.name} x{addon.quantity}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <span className="text-gray-500 dark:text-gray-400 font-bold">
                                RM{(item.price * item.quantity).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Special Remark */}
                        {order.remark && (
                          <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                              <MessageSquare size={12} className="text-orange-500" />
                              <span className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">
                                Special Remark
                              </span>
                            </div>
                            <p className="text-xs text-gray-700 dark:text-gray-300 italic">
                              {order.remark}
                            </p>
                          </div>
                        )}

                        {/* Order Total */}
                        <div className="mt-4 pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                          <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Grand Total
                          </span>
                          <span className="text-2xl font-black text-gray-900 dark:text-white">
                            RM{order.total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex md:flex-col gap-2 min-w-[140px] mt-2 md:mt-0">
                        {order.status === OrderStatus.PENDING && (
                          <>
                            <button 
                              onClick={() => handleAcceptAndPrint(order.id)} 
                              className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg"
                            >
                              Accept {orderSettings.autoPrint && '& Print'}
                            </button>
                            <button 
                              onClick={() => setRejectingOrderId(order.id)} 
                              className="flex-1 py-3 px-4 bg-red-50 text-red-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-100 dark:bg-red-900/10 dark:border-red-900/20"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {order.status === OrderStatus.ONGOING && (
                          <button 
                            onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)} 
                            className="flex-1 py-4 px-4 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg"
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

          {/* Settings Tab */}
          {activeTab === 'SETTINGS' && (
            <div className="max-w-4xl mx-auto">
              <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Settings</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">
                Configure your kitchen preferences
              </p>
              
              <div className="space-y-8">
                {/* Order Settings Card */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <BellRing size={18} className="text-orange-500" />
                      <h2 className="font-black dark:text-white uppercase tracking-tighter">Order Processing</h2>
                    </div>
                  </div>
                  <div className="p-6">
                    <OrderSettings
                      autoAccept={orderSettings.autoAccept}
                      autoPrint={orderSettings.autoPrint}
                      printerConnected={printerConnected}
                      onToggleAccept={() => toggleOrderSetting('autoAccept')}
                      onTogglePrint={() => toggleOrderSetting('autoPrint')}
                    />
                  </div>
                </div>

                {/* Printer Settings Card */}
                <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <PrinterIcon size={18} className="text-orange-500" />
                      <h2 className="font-black dark:text-white uppercase tracking-tighter">Printer</h2>
                    </div>
                  </div>
                  <div className="p-6">
                    <PrinterSettings
                      restaurantId={restaurant.id}
                      onPrinterConnected={setPrinterConnected}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Other tabs (MENU, REPORTS, QR) remain the same as your original code */}
          {/* ... */}
        </div>
      </main>

      {/* Rejection Modal */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
            <button 
              onClick={() => setRejectingOrderId(null)} 
              className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-black mb-6 dark:text-white uppercase tracking-tighter">Order Rejection</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Select Reason
                </label>
                <select 
                  value={rejectionReason} 
                  onChange={e => setRejectionReason(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white appearance-none cursor-pointer"
                >
                  {REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Internal Note (Optional)
                </label>
                <textarea 
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white resize-none" 
                  rows={3} 
                  placeholder="Additional details..." 
                  value={rejectionNote} 
                  onChange={e => setRejectionNote(e.target.value)} 
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => setRejectingOrderId(null)} 
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl font-black uppercase text-[10px] tracking-widest text-gray-500"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmRejection} 
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default VendorView;
