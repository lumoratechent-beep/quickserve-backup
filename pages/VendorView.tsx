
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, MenuItemVariant, ReportResponse, ReportFilters } from '../types';
import { uploadImage } from '../lib/storage';
import { ShoppingBag, BookOpen, BarChart3, Edit3, CheckCircle, Clock, X, Plus, Trash2, Image as ImageIcon, LayoutGrid, List, Filter, Archive, RotateCcw, Power, Eye, Upload, Hash, MessageSquare, Download, Calendar, Ban, ChevronLeft, ChevronRight, Bell, Activity, RefreshCw, Layers, Tag, Wifi, WifiOff, QrCode, Printer, ExternalLink, ThermometerSun, Info, Settings2, Menu, ToggleLeft, ToggleRight, Link, Search, ChevronFirst, ChevronLast, Receipt, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'MENU' | 'REPORTS' | 'QR'>('ORDERS');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderStatus | 'ONGOING_ALL' | 'ALL'>('ONGOING_ALL');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCING'>('IDLE');
  
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
    // Default to 30 days ago to ensure users see recent data by default
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

  // New Order Alert State
  const [showNewOrderAlert, setShowNewOrderAlert] = useState(false);
  const pendingOrders = useMemo(() => orders.filter(o => o.status === OrderStatus.PENDING), [orders]);
  const prevPendingCount = useRef(pendingOrders.length);

  // Sound & Visual Alert for New Orders
  useEffect(() => {
    if (pendingOrders.length > prevPendingCount.current) {
      triggerNewOrderAlert();
      setShowNewOrderAlert(true);
      setTimeout(() => setShowNewOrderAlert(false), 5000);
    }
    prevPendingCount.current = pendingOrders.length;
  }, [pendingOrders.length]);

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
      console.warn("Audio Context failed to start (interaction required).");
    }
    setShowNewOrderAlert(true);
    setTimeout(() => setShowNewOrderAlert(false), 5000);
  };

  // Sync Timer Visual Feedback
  useEffect(() => {
    if (lastSyncTime) {
      setSyncStatus('SYNCING');
      const timer = setTimeout(() => setSyncStatus('IDLE'), 1000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncTime]);

  // Sound & Visual Alert for New Orders (Legacy fallback, now handled by subscription)
  useEffect(() => {
    if (pendingOrders.length > prevPendingCount.current) {
      // Already handled by triggerNewOrderAlert in subscription
    }
    prevPendingCount.current = pendingOrders.length;
  }, [pendingOrders.length]);

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
    tempOptions: { enabled: false, hot: 0, cold: 0 }
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

      // Fallback to internal fetch if props are not provided
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
      tempOptions: { enabled: false, hot: 0, cold: 0 }
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
      tempOptions: item.tempOptions ? { ...item.tempOptions } : { enabled: false, hot: 0, cold: 0 }
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
      tempOptions: formItem.tempOptions?.enabled ? formItem.tempOptions : undefined
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
    // Defer the print call to prevent blocking the main thread during event handling, improving INP.
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print();
      }, 50);
    });
  };

  const isOnline = restaurant.isOnline !== false;

  const handleTabSelection = (tab: 'ORDERS' | 'MENU' | 'REPORTS' | 'QR') => {
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
        <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={restaurant.logo} className="w-10 h-10 rounded-lg shadow-sm" />
            <h2 className="font-bold text-gray-900 dark:text-white truncate">{restaurant.name}</h2>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-gray-500">
            <X size={20} />
          </button>
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


        </nav>
        <div className="p-4 mt-auto border-t dark:border-gray-700 space-y-4">
          <div className="space-y-2">
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
          </div>
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
              {activeTab === 'ORDERS' ? 'Incoming Orders' : activeTab === 'MENU' ? 'Menu Editor' : activeTab === 'REPORTS' ? 'Sales Reports' : 'QR Generator'}
            </h1>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'QR' && (
            <div className="max-w-4xl mx-auto no-print">
              <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Table QR Codes</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Generate ordering labels for your tables at {restaurant.location}.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border dark:border-gray-700 shadow-sm space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Generation Mode</label>
                    <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-xl">
                      <button onClick={() => setQrMode('SINGLE')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${qrMode === 'SINGLE' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}>Single Table</button>
                      <button onClick={() => setQrMode('BATCH')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${qrMode === 'BATCH' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}>Batch Range</button>
                    </div>
                  </div>

                  {qrMode === 'SINGLE' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Table Number</label>
                      <div className="relative">
                        <Hash size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white" value={qrTableNo} onChange={e => setQrTableNo(e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">From</label>
                        <input type="number" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white" value={qrStartRange} onChange={e => setQrStartRange(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">To</label>
                        <input type="number" className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white" value={qrEndRange} onChange={e => setQrEndRange(e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-900/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ExternalLink size={14} className="text-orange-500" />
                      <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Target Link</span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400 break-all leading-tight">
                      {getQrUrl(restaurant.location, qrMode === 'SINGLE' ? qrTableNo : '{ID}')}
                    </p>
                  </div>

                  <button onClick={handlePrintQr} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-orange-600 transition-all">
                    <Printer size={18} /> Print Labels
                  </button>
                </div>

                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border dark:border-gray-700 shadow-sm flex flex-col items-center justify-center text-center">
                   {qrMode === 'SINGLE' ? (
                     <>
                       <div className="p-6 bg-white rounded-3xl shadow-xl border border-gray-100 mb-6">
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
                <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm overflow-x-auto hide-scrollbar">
                  <button onClick={() => setOrderFilter('ONGOING_ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === 'ONGOING_ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ONGOING</button>
                  <button onClick={() => setOrderFilter(OrderStatus.COMPLETED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === OrderStatus.COMPLETED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>SERVED</button>
                  <button onClick={() => setOrderFilter(OrderStatus.CANCELLED)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === OrderStatus.CANCELLED ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>CANCELLED</button>
                  <button onClick={() => setOrderFilter('ALL')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${orderFilter === 'ALL' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>ALL ORDER</button>
                </div>
              </div>

              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                      <ShoppingBag size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">Kitchen Quiet</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Waiting for incoming signals...</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-start gap-6 transition-all hover:border-orange-200">
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
                          <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl">
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
                            <button onClick={() => onUpdateOrder(order.id, OrderStatus.ONGOING)} className="flex-1 py-3 px-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg">Accept Order</button>
                            <button onClick={() => setRejectingOrderId(order.id)} className="flex-1 py-3 px-4 bg-red-50 text-red-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-100 dark:bg-red-900/10 dark:border-red-900/20">Reject</button>
                          </>
                        )}
                        {order.status === OrderStatus.ONGOING && (
                          <button onClick={() => onUpdateOrder(order.id, OrderStatus.SERVED)} className="flex-1 py-4 px-4 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg">
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

          {activeTab === 'MENU' && (
            <div className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-4">Kitchen Menu Editor</h1>
                
                <div className="flex flex-wrap items-center gap-4">
                  {/* Sub-Tabs */}
                  <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm">
                    <button onClick={() => setMenuSubTab('KITCHEN')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'KITCHEN' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Kitchen Menu</button>
                    <button onClick={() => setMenuSubTab('CLASSIFICATION')} className={`px-4 py-2 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${menuSubTab === 'CLASSIFICATION' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}>Classification</button>
                  </div>

                  {menuSubTab === 'KITCHEN' ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm">
                          <button onClick={() => setMenuStatusFilter('ACTIVE')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ACTIVE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Eye size={14} /> <span className="hidden sm:inline">Active</span></button>
                          <button onClick={() => setMenuStatusFilter('ARCHIVED')} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuStatusFilter === 'ARCHIVED' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50'}`}><Archive size={14} /> <span className="hidden sm:inline">Archived</span></button>
                        </div>
                        <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm">
                          <button onClick={() => setMenuViewMode('grid')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                          <button onClick={() => setMenuViewMode('list')} className={`p-2 rounded-lg transition-all ${menuViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                        </div>
                      </div>
                      <button onClick={() => handleOpenAddModal()} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg">+ Add Item</button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm">
                          <button onClick={() => setClassViewMode('grid')} className={`p-2 rounded-lg transition-all ${classViewMode === 'grid' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={18} /></button>
                          <button onClick={() => setClassViewMode('list')} className={`p-2 rounded-lg transition-all ${classViewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={18} /></button>
                        </div>
                      </div>
                      <button onClick={() => setShowAddClassModal(true)} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg flex items-center gap-2"><Tag size={16} /> + New Class</button>
                    </>
                  )}
                </div>
              </div>
              
              {menuSubTab === 'KITCHEN' && (
                <>
                  <div className="flex items-center gap-2 mb-8 bg-white dark:bg-gray-800 px-4 py-3 border dark:border-gray-700 rounded-2xl shadow-sm overflow-x-auto hide-scrollbar sticky top-[72px] lg:top-0 z-20">
                    <Filter size={16} className="text-gray-400 shrink-0" />
                    {categories.map(cat => (
                      <button key={cat} onClick={() => setMenuCategoryFilter(cat)} className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${menuCategoryFilter === cat ? 'bg-orange-100 text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>{cat}</button>
                    ))}
                  </div>
                  
                  {currentMenu.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-3xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                          <BookOpen size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tighter">Inventory Empty</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Start adding your signature dishes.</p>
                    </div>
                  ) : (
                    menuViewMode === 'grid' ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                        {currentMenu.map(item => (
                          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl md:rounded-3xl overflow-hidden border dark:border-gray-700 hover:shadow-xl transition-all group flex flex-col">
                            <div className="relative aspect-video sm:aspect-square md:h-48">
                              <img src={item.image} className="w-full h-full object-cover" />
                              <div className="absolute top-2 right-2 md:top-4 md:right-4 flex gap-1 md:gap-2">
                                {menuStatusFilter === 'ACTIVE' ? (
                                  <>
                                    <button onClick={() => handleArchiveItem(item)} className="p-2 md:p-2.5 bg-red-50/90 backdrop-blur rounded-lg md:rounded-xl text-red-600 shadow-sm"><Archive size={14} /></button>
                                    <button onClick={() => handleOpenEditModal(item)} className="p-2 md:p-2.5 bg-white/90 backdrop-blur rounded-lg md:rounded-xl text-gray-700 shadow-sm"><Edit3 size={14} /></button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => handleRestoreItem(item)} className="p-2 md:p-2.5 bg-green-50/90 backdrop-blur rounded-lg md:rounded-xl text-green-600 shadow-sm"><RotateCcw size={14} /></button>
                                    <button onClick={() => handlePermanentDelete(item.id)} className="p-2 md:p-2.5 bg-red-50/90 backdrop-blur rounded-lg md:rounded-xl text-red-600 shadow-sm"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="p-3 md:p-6 flex-1 flex flex-col">
                              <h3 className="font-black text-xs md:text-lg text-gray-900 dark:text-white mb-1 uppercase tracking-tight line-clamp-1">{item.name}</h3>
                              <p className="hidden md:block text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 flex-1">{item.description}</p>
                              <div className="flex justify-between items-center mt-auto pt-2 md:pt-4 border-t dark:border-gray-700">
                                <span className="text-sm md:text-xl font-black text-orange-500">RM{item.price.toFixed(2)}</span>
                                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 truncate ml-2">{item.category}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                              <tr>
                                <th className="px-8 py-4 text-left">Dish Profile</th>
                                <th className="px-4 py-4 text-left">Category</th>
                                <th className="px-4 py-4 text-left">Base Cost</th>
                                <th className="px-8 py-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-700">
                              {currentMenu.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                  <td className="px-8 py-4">
                                    <div className="flex items-center gap-4">
                                      <img src={item.image} className="w-12 h-12 rounded-xl object-cover" />
                                      <div>
                                        <p className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-sm">{item.name}</p>
                                        <p className="hidden sm:block text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-xs">{item.description}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-[10px] font-black uppercase text-gray-400">{item.category}</td>
                                  <td className="px-4 py-4 font-black text-gray-900 dark:text-white text-sm">RM{item.price.toFixed(2)}</td>
                                  <td className="px-8 py-4 text-right">
                                    <div className="flex justify-end items-center gap-2">
                                      {menuStatusFilter === 'ACTIVE' ? (
                                        <button onClick={() => handleArchiveItem(item)} className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"><Archive size={18} /></button>
                                      ) : (
                                        <button onClick={() => handleRestoreItem(item)} className="p-3 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl transition-all"><RotateCcw size={18} /></button>
                                      )}
                                      <button onClick={() => handleOpenEditModal(item)} className="p-3 text-gray-400 hover:text-orange-500 rounded-xl transition-all"><Edit3 size={18} /></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  )}
                </>
              )}
              
              {menuSubTab === 'CLASSIFICATION' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b dark:border-gray-700 flex justify-between items-center">
                     <div className="flex items-center gap-2 text-gray-400">
                        <Settings2 size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Classification Manager</span>
                     </div>
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{categories.length - 1} Total</span>
                  </div>
                  <div className={classViewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4 p-4 md:p-6' : 'divide-y dark:divide-gray-700'}>
                    {categories.filter(c => c !== 'All').map(cat => {
                      const itemsInCat = restaurant.menu.filter(i => i.category === cat && !i.isArchived);
                      if (classViewMode === 'grid') {
                        return (
                          <div key={cat} className="p-4 md:p-6 bg-gray-50/50 dark:bg-gray-900/50 border dark:border-gray-700 rounded-xl flex flex-col gap-4 group hover:border-orange-200 transition-all">
                             <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 md:gap-3">
                                   <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg md:rounded-xl flex items-center justify-center"><Layers size={18} /></div>
                                   <div><h4 className="font-black text-xs md:text-sm dark:text-white uppercase tracking-tight">{cat}</h4><p className="text-[8px] md:text-[10px] font-bold text-gray-400 uppercase">{itemsInCat.length} Items</p></div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <button onClick={() => { setRenamingClass(cat); setRenameValue(cat); }} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-all"><Edit3 size={14} /></button>
                                  <button onClick={() => handleRemoveClassification(cat)} className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><Trash2 size={14} /></button>
                                </div>
                             </div>
                          </div>
                        );
                      }
                      return (
                        <div key={cat} className="flex items-center justify-between p-4 px-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all">
                          <div className="flex items-center gap-4">
                             <div className="w-8 h-8 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-lg flex items-center justify-center"><Layers size={16} /></div>
                             <div>
                               {renamingClass === cat ? (
                                 <div className="flex items-center gap-2">
                                   <input autoFocus className="px-2 py-1 text-sm font-black border dark:border-gray-600 rounded bg-white dark:bg-gray-700" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRenameClassification(cat, renameValue)} />
                                   <button onClick={() => handleRenameClassification(cat, renameValue)} className="text-green-500"><CheckCircle size={16}/></button>
                                   <button onClick={() => setRenamingClass(null)} className="text-red-500"><X size={16}/></button>
                                 </div>
                               ) : (
                                 <>
                                   <p className="text-sm font-black dark:text-white uppercase tracking-tight">{cat}</p>
                                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{itemsInCat.length} Active Dishes</p>
                                 </>
                               )}
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setRenamingClass(cat); setRenameValue(cat); }} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"><Edit3 size={16} /></button>
                            <button onClick={() => handleRemoveClassification(cat)} className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                            <button onClick={() => handleOpenAddModal(cat)} className="p-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg"><Plus size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'REPORTS' && (
            <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
              <h1 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Sales Report</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Financial performance and order history.</p>
              
              <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
                <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Period Selection</label>
                    <div className="flex items-center gap-2"><Calendar size={14} className="text-orange-500 shrink-0" /><input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" /><span className="text-gray-400 font-black">to</span><input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="flex-1 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5" /></div>
                  </div>
                  <div className="w-full sm:w-48">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Order Outcome</label>
                    <select value={reportStatus} onChange={(e) => setReportStatus(e.target.value as any)} className="w-full p-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white appearance-none cursor-pointer">
                      <option value="ALL">All Outcomes</option>
                      <option value={OrderStatus.COMPLETED}>Paid/Finalized</option>
                      <option value={OrderStatus.SERVED}>Served (Unpaid)</option>
                      <option value={OrderStatus.CANCELLED}>Rejected</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleDownloadReport} className="w-full md:w-auto px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all"><Download size={16} /> Export CSV</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl border dark:border-gray-700 shadow-sm">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Revenue</p>
                  <p className="text-xl md:text-2xl font-black dark:text-white">
                    RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl border dark:border-gray-700 shadow-sm">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Order Volume</p>
                  <p className="text-xl md:text-2xl font-black dark:text-white">
                    {reportData?.summary.orderVolume || 0}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl border dark:border-gray-700 shadow-sm">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Efficiency</p>
                  <p className="text-xl md:text-2xl font-black text-green-500">
                    {reportData?.summary.efficiency || 0}%
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative max-w-sm w-full">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search Order ID..." 
                      value={reportSearchQuery}
                      onChange={(e) => setReportSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
                    <select 
                      value={entriesPerPage} 
                      onChange={(e) => setEntriesPerPage(Number(e.target.value))}
                      className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer"
                    >
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-6 py-3 text-left">Order ID</th>
                        <th className="px-6 py-3 text-left">Table</th>
                        <th className="px-6 py-3 text-left">Date</th>
                        <th className="px-6 py-3 text-left">Time</th>
                        <th className="px-6 py-3 text-left">Status</th>
                        <th className="px-6 py-3 text-right">Bill</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {paginatedReports.map(report => (
                        <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-6 py-2.5">
                            <button 
                              onClick={() => setSelectedOrderForDetails(report)}
                              className="text-[10px] font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest underline decoration-dotted underline-offset-4"
                            >
                              {report.id}
                            </button>
                          </td>
                          <td className="px-6 py-2.5 text-[10px] font-black text-gray-900 dark:text-white">#{report.tableNumber}</td>
                          <td className="px-6 py-2.5 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">{new Date(report.timestamp).toLocaleDateString()}</td>
                          <td className="px-6 py-2.5 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-6 py-2.5">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                              report.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' : 
                              report.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                              {report.status === OrderStatus.COMPLETED ? 'Paid' : 
                               report.status === OrderStatus.SERVED ? 'Served' : 
                               report.status}
                            </span>
                          </td>
                          <td className="px-6 py-2.5 text-right font-black dark:text-white text-xs">RM{report.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2 no-print">
                  <button 
                    onClick={() => setCurrentPage(1)} 
                    disabled={currentPage === 1}
                    className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"
                  >
                    <ChevronFirst size={16} />
                  </button>
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                    disabled={currentPage === 1}
                    className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                    disabled={currentPage === totalPages}
                    className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button 
                    onClick={() => setCurrentPage(totalPages)} 
                    disabled={currentPage === totalPages}
                    className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"
                  >
                    <ChevronLast size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Rejection Modal */}
      {rejectingOrderId && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-md w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
            <button onClick={() => setRejectingOrderId(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={20} /></button>
            <h2 className="text-2xl font-black mb-6 dark:text-white uppercase tracking-tighter">Order Rejection</h2>
            <div className="space-y-4">
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Select Reason</label><select className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white appearance-none cursor-pointer" value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}>{REJECTION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div><label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Internal Note (Optional)</label><textarea className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none text-sm font-bold dark:text-white resize-none" rows={3} placeholder="Additional details..." value={rejectionNote} onChange={e => setRejectionNote(e.target.value)} /></div>
              <div className="flex gap-4 pt-2"><button onClick={() => setRejectingOrderId(null)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl font-black uppercase text-[10px] tracking-widest text-gray-500">Cancel</button><button onClick={handleConfirmRejection} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">Confirm Rejection</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Classification Add Modal */}
      {showAddClassModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-sm w-full p-8 shadow-2xl relative">
             <button onClick={() => setShowAddClassModal(false)} className="absolute top-6 right-6 p-2 text-gray-400"><X size={20}/></button>
             <h2 className="text-xl font-black mb-6 dark:text-white uppercase tracking-tight">Add Classification</h2>
             <div className="space-y-4">
                <input autoFocus placeholder="e.g. Beverages" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold text-sm dark:text-white" value={newClassName} onChange={e => setNewClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddClassification()} />
                <button onClick={handleAddClassification} className="w-full py-4 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-xs">Confirm Class</button>
             </div>
          </div>
        </div>
      )}

      {/* Menu Item Form Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button onClick={() => setIsFormModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-black mb-8 dark:text-white uppercase tracking-tighter">{editingItem ? 'Edit Menu Details' : 'New Dish Broadcast'}</h2>
            
            <form onSubmit={handleSaveItem} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Menu Name</label>
                    <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formItem.name} onChange={e => setFormItem({...formItem, name: e.target.value})} placeholder="e.g. Signature Beef Burger" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Description</label>
                    <textarea className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm resize-none" rows={3} value={formItem.description} onChange={e => setFormItem({...formItem, description: e.target.value})} placeholder="Describe the ingredients and preparation..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Base Cost</label>
                      <input required type="number" step="0.01" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formItem.price === 0 ? '' : formItem.price} onChange={e => setFormItem({...formItem, price: e.target.value === '' ? 0 : Number(e.target.value)})} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Classification</label>
                      <select className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm appearance-none cursor-pointer" value={formItem.category} onChange={e => setFormItem({...formItem, category: e.target.value})}>
                        {categories.filter(c => c !== 'All').map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-6">
                   <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Visual Asset</label>
                    <div className="relative group aspect-video rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center cursor-pointer mb-4" onClick={() => fileInputRef.current?.click()}>
                      {formItem.image ? (
                        <img src={formItem.image} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                      ) : (
                        <div className="text-center">
                          <ImageIcon size={32} className="mx-auto text-gray-300 mb-2" />
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upload Frame</span>
                        </div>
                      )}
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-2"><Link size={12}/> Or Image URL</label>
                      <input type="text" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-xs" value={formItem.image} onChange={e => setFormItem({...formItem, image: e.target.value})} placeholder="Paste link here..." />
                    </div>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t dark:border-gray-700">
                 <div>
                   <div className="flex items-center justify-between mb-4">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Portion Variants</label>
                      <button type="button" onClick={() => setFormItem({...formItem, sizesEnabled: !formItem.sizesEnabled})} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${formItem.sizesEnabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {formItem.sizesEnabled ? 'Activated' : 'Disabled'}
                      </button>
                   </div>
                   {formItem.sizesEnabled && (
                     <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-2">
                           <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Options</label>
                           <button type="button" onClick={handleAddSize} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg"><Plus size={16} /></button>
                        </div>
                        {formItem.sizes?.map((size, idx) => (
                          <div key={idx} className="flex gap-2 animate-in slide-in-from-right-2 duration-300">
                            <input type="text" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-bold dark:text-white" placeholder="Portion Name" value={size.name} onChange={e => handleSizeChange(idx, 'name', e.target.value)} />
                            <input type="number" step="0.01" className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-bold dark:text-white" placeholder="+Price" value={size.price === 0 ? '' : size.price} onChange={e => handleSizeChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))} />
                            <button type="button" onClick={() => handleRemoveSize(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                          </div>
                        ))}
                        {(!formItem.sizes || formItem.sizes.length === 0) && <p className="text-[9px] text-gray-400 italic">No variants established yet.</p>}
                     </div>
                   )}
                 </div>

                 <div className="space-y-6">
                   <div>
                     <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Other Variant Group</label>
                        <button type="button" onClick={handleAddOtherVariant} className="p-1.5 text-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg"><Plus size={16} /></button>
                     </div>
                     <div className="space-y-4">
                       {formItem.otherVariants && formItem.otherVariants.length > 0 && (
                         <div className="animate-in fade-in zoom-in-95 duration-300 space-y-4">
                           <div>
                              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Variant Title (e.g. Toppings)</label>
                              <input type="text" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-xs" value={formItem.otherVariantName} onChange={e => setFormItem({...formItem, otherVariantName: e.target.value, otherVariantsEnabled: true})} placeholder="Milk Choice, Toppings, etc." />
                           </div>
                           <div className="space-y-3">
                             {formItem.otherVariants?.map((variant, idx) => (
                               <div key={idx} className="flex gap-2 animate-in slide-in-from-right-2 duration-300">
                                 <input type="text" className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-bold dark:text-white" placeholder="Option Name" value={variant.name} onChange={e => handleOtherVariantChange(idx, 'name', e.target.value)} />
                                 <input type="number" step="0.01" className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-bold dark:text-white" placeholder="+Price" value={variant.price === 0 ? '' : variant.price} onChange={e => handleOtherVariantChange(idx, 'price', e.target.value === '' ? 0 : Number(e.target.value))} />
                                 <button type="button" onClick={() => handleRemoveOtherVariant(idx)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       {(!formItem.otherVariants || formItem.otherVariants.length === 0) && <p className="text-[9px] text-gray-400 italic">No other variants established yet.</p>}
                     </div>
                   </div>

                   <div>
                     <div className="flex items-center justify-between mb-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Thermal Options</label>
                        <button type="button" onClick={() => setFormItem({...formItem, tempOptions: {...formItem.tempOptions!, enabled: !formItem.tempOptions?.enabled}})} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${formItem.tempOptions?.enabled ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          {formItem.tempOptions?.enabled ? 'Activated' : 'Disabled'}
                        </button>
                     </div>
                     {formItem.tempOptions?.enabled && (
                       <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-300">
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-orange-500"><ThermometerSun size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Hot Surcharge</span></div>
                             <input type="number" step="0.01" className="w-full px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border-none rounded-lg text-xs font-bold dark:text-white" value={formItem.tempOptions.hot === 0 ? '' : formItem.tempOptions.hot} onChange={e => setFormItem({...formItem, tempOptions: {...formItem.tempOptions!, hot: e.target.value === '' ? 0 : Number(e.target.value)}})} placeholder="0.00" />
                          </div>
                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-blue-500"><Info size={14} /><span className="text-[9px] font-black uppercase tracking-widest">Cold Surcharge</span></div>
                             <input type="number" step="0.01" className="w-full px-3 py-2 bg-blue-50 dark:bg-blue-900/10 border-none rounded-lg text-xs font-bold dark:text-white" value={formItem.tempOptions.cold === 0 ? '' : formItem.tempOptions.cold} onChange={e => setFormItem({...formItem, tempOptions: {...formItem.tempOptions!, cold: e.target.value === '' ? 0 : Number(e.target.value)}})} placeholder="0.00" />
                          </div>
                       </div>
                     )}
                   </div>
                 </div>
              </div>

              <div className="pt-8 border-t dark:border-gray-700">
                <button type="submit" className="w-full py-5 bg-orange-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-orange-100 dark:shadow-none hover:bg-orange-600 transition-all active:scale-95">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrderForDetails && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
            <button onClick={() => setSelectedOrderForDetails(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Hash size={16} className="text-orange-500" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Details</span>
              </div>
              <h2 className="text-xl font-black dark:text-white uppercase tracking-tighter">#{selectedOrderForDetails.id}</h2>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Table Number</p>
                  <p className="text-sm font-black dark:text-white">#{selectedOrderForDetails.tableNumber}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                    selectedOrderForDetails.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' : 
                    selectedOrderForDetails.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    {selectedOrderForDetails.status === OrderStatus.COMPLETED ? 'Paid' : 
                     selectedOrderForDetails.status === OrderStatus.SERVED ? 'Served' : 
                     selectedOrderForDetails.status}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ordered Items</p>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                  {selectedOrderForDetails.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start py-2 border-b dark:border-gray-700 last:border-0">
                      <div>
                        <p className="text-xs font-black dark:text-white">x{item.quantity} {item.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.selectedSize && <span className="text-[8px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded uppercase tracking-tighter">Size: {item.selectedSize}</span>}
                          {item.selectedTemp && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${item.selectedTemp === 'Hot' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>Temp: {item.selectedTemp}</span>}
                        </div>
                      </div>
                      <p className="text-xs font-black dark:text-white">RM{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedOrderForDetails.remark && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={14} className="text-orange-500" />
                    <span className="text-[9px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Customer Remark</span>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 italic">{selectedOrderForDetails.remark}</p>
                </div>
              )}

              <div className="pt-4 border-t dark:border-gray-700 flex justify-between items-center">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Total Bill</span>
                <span className="text-xl font-black dark:text-white">RM{selectedOrderForDetails.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .page-break-inside-avoid { page-break-inside: avoid; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default VendorView;
