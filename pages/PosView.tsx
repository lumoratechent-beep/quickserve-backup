// pages/PosView.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters } from '../src/types';
import StandardReport from '../components/StandardReport';
import ItemOptionsModal from '../components/ItemOptionsModal';
import { 
  ShoppingBag, Search, Filter, Download, Calendar, ChevronLeft, ChevronRight, 
  Printer, QrCode, CreditCard, Banknote, User, Trash2, Plus, Minus, LayoutGrid, 
  List, Clock, CheckCircle2, AlertCircle, RefreshCw, BarChart3, Receipt, Hash, 
  Settings2, Menu, Wifi, WifiOff, ExternalLink, X, ChevronFirst, ChevronLast,
  Coffee, BookOpen, BarChart, QrCode as QrCodeIcon, Settings, ChevronUp
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string) => Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  onUpdateRestaurantSettings?: (restaurantId: string, settings: any) => Promise<void>;
  onSwitchToVendor?: () => void;
}

const PosView: React.FC<Props> = ({ 
  restaurant, 
  orders, 
  onUpdateOrder, 
  onPlaceOrder,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  onUpdateRestaurantSettings,
  onSwitchToVendor
}) => {
  const [activeTab, setActiveTab] = useState<'COUNTER' | 'QR_ORDERS' | 'REPORTS' | 'QR_GEN' | 'SETTINGS'>('COUNTER');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'list'>('grid-4');
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
    const firstAddOns = JSON.stringify((first.selectedAddOns || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
    const secondAddOns = JSON.stringify((second.selectedAddOns || []).slice().sort((a, b) => a.name.localeCompare(b.name)));

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
    if (posCart.length === 0) return;
    try {
      await onPlaceOrder(posCart, posRemark, posTableNo);
      setPosCart([]);
      setPosRemark('');
      setPosTableNo('Counter');
      alert('Order placed successfully!');
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to place order');
    }
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
      await onPlaceOrder(cartItems, selectedQrOrder.remark || '', selectedQrOrder.tableNumber || '');
      // Mark the original order as COMPLETED
      await onUpdateOrder(selectedQrOrder.id, OrderStatus.COMPLETED);

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
      alert('Failed to complete payment');
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

  const fetchReport = async (isExport = false) => {
    if (!onFetchPaginatedOrders) return;
    if (!isExport) setIsReportLoading(true);
    try {
      const data = await onFetchPaginatedOrders({
        restaurantId: restaurant.id,
        startDate: reportStart,
        endDate: reportEnd,
        status: reportStatus,
        search: reportSearchQuery
      }, isExport ? 1 : currentPage, isExport ? 10000 : entriesPerPage);
      
      if (isExport) {
        return data.orders;
      } else {
        setReportData(data);
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

  const toggleSetting = async (key: 'showSalesReport' | 'showQrGenerator') => {
    if (!onUpdateRestaurantSettings) return;
    const currentSettings = restaurant.settings || {};
    const newSettings = {
      ...currentSettings,
      [key]: currentSettings[key] === false ? true : false
    };
    await onUpdateRestaurantSettings(restaurant.id, newSettings);
  };

  const handleTabSelection = (tab: 'COUNTER' | 'QR_ORDERS' | 'REPORTS' | 'QR_GEN' | 'SETTINGS') => {
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
                                      RM{(item.price * item.quantity).toFixed(2)}
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
                                          • {addon.name} x{addon.quantity} (+RM{(addon.price * addon.quantity).toFixed(2)})
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
                            <span className="text-xl font-black text-orange-500">RM{order.total.toFixed(2)}</span>
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
              <div className="max-w-2xl mx-auto">
                <h3 className="text-xl font-black dark:text-white uppercase tracking-tighter mb-6">Kitchen Access Settings</h3>
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="font-black dark:text-white uppercase tracking-tighter">Sales Reports</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Allow kitchen staff to view financial reports</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showSalesReport')}
                      className={`w-12 h-6 rounded-full transition-all relative ${
                        restaurant.settings?.showSalesReport !== false ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                        restaurant.settings?.showSalesReport !== false ? 'left-7' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="font-black dark:text-white uppercase tracking-tighter">QR Generator</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Allow kitchen staff to generate table QR codes</p>
                    </div>
                    <button 
                      onClick={() => toggleSetting('showQrGenerator')}
                      className={`w-12 h-6 rounded-full transition-all relative ${
                        restaurant.settings?.showQrGenerator !== false ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                        restaurant.settings?.showQrGenerator !== false ? 'left-7' : 'left-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

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
                        <h4 className="font-black text-[10px] dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                        <p className="text-[10px] text-orange-500 font-black">RM{item.price.toFixed(2)} x{item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-xs dark:text-white">RM{(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                    </div>
                    
                    {/* Variants and Options */}
                    <div className="ml-4 space-y-1">
                      {item.selectedSize && (
                        <p className="text-[9px] text-gray-500 dark:text-gray-400">• Size: {item.selectedSize}</p>
                      )}
                      {item.selectedTemp && (
                        <p className="text-[9px] text-gray-500 dark:text-gray-400">• {item.selectedTemp}</p>
                      )}
                      {item.selectedOtherVariant && (
                        <p className="text-[9px] text-gray-500 dark:text-gray-400">• {item.selectedOtherVariant}</p>
                      )}
                      
                      {/* Add-ons */}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <div className="mt-1">
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Add-ons:</p>
                          {item.selectedAddOns.map((addon, addonIdx) => (
                            <p key={addonIdx} className="text-[9px] text-gray-500 dark:text-gray-400 ml-2">
                              • {addon.name} x{addon.quantity} (+RM{(addon.price * addon.quantity).toFixed(2)})
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
                        <h4 className="font-black text-[10px] dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                        <p className="text-[10px] text-orange-500 font-black">RM{item.price.toFixed(2)}</p>
                        <div className="mt-1 space-y-0.5">
                          {item.selectedSize && <p className="text-[9px] text-gray-500 dark:text-gray-400">• Size: {item.selectedSize}</p>}
                          {item.selectedTemp && <p className="text-[9px] text-gray-500 dark:text-gray-400">• {item.selectedTemp}</p>}
                          {item.selectedOtherVariant && <p className="text-[9px] text-gray-500 dark:text-gray-400">• {item.selectedOtherVariant}</p>}
                          {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                            <p className="text-[9px] text-gray-500 dark:text-gray-400">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <span>Subtotal</span>
                  <span>RM{selectedQrOrder ? selectedQrOrder.total.toFixed(2) : cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
                  <span className="uppercase">Total</span>
                  <span className="text-orange-500">RM{selectedQrOrder ? selectedQrOrder.total.toFixed(2) : cartTotal.toFixed(2)}</span>
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
                    disabled={posCart.length === 0}
                    className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    <CreditCard size={16} /> Complete Order
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
      `}</style>
    </div>
  );
};

export default PosView;
