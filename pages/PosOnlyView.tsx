// pages/PosOnlyView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { Restaurant, Order, OrderStatus, MenuItem, CartItem, ReportResponse, ReportFilters } from '../src/types';
import { 
  ShoppingBag, Search, Download, Calendar, ChevronLeft, ChevronRight, 
  Printer, QrCode, CreditCard, Trash2, Plus, Minus, LayoutGrid, 
  List, Clock, CheckCircle2, BarChart3, Hash, Menu, Settings, BookOpen,
  ChevronFirst, ChevronLast, X, Edit3, Archive, RotateCcw, Upload, Eye,
  AlertCircle, Users, UserPlus, Bluetooth, BluetoothConnected, PrinterIcon
} from 'lucide-react';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  onUpdateOrder: (orderId: string, status: OrderStatus) => void;
  onPlaceOrder: (items: CartItem[], remark: string, tableNumber: string) => Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
}

const PosOnlyView: React.FC<Props> = ({ 
  restaurant, 
  orders, 
  onUpdateOrder, 
  onPlaceOrder,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
}) => {
  const [activeTab, setActiveTab] = useState<'COUNTER' | 'REPORTS' | 'MENU_EDITOR' | 'SETTINGS'>('COUNTER');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState<'grid-3' | 'grid-4' | 'grid-5' | 'list'>('grid-4');
  const [posCart, setPosCart] = useState<CartItem[]>([]);
  const [posRemark, setPosRemark] = useState('');
  const [posTableNo, setPosTableNo] = useState('Counter');
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Menu Editor State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [menuStatusFilter, setMenuStatusFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [menuViewMode, setMenuViewMode] = useState<'grid' | 'list'>('grid');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('All');

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

  const addToPosCart = (item: MenuItem) => {
    setPosCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1, restaurantId: restaurant.id }];
    });
  };

  const removeFromPosCart = (itemId: string) => {
    setPosCart(prev => prev.filter(i => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setPosCart(prev => prev.map(i => {
      if (i.id === itemId) {
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

  const unpaidOrders = useMemo(() => {
    return orders.filter(o => o.status === OrderStatus.SERVED && o.restaurantId === restaurant.id);
  }, [orders, restaurant.id]);

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
                            onClick={() => addToPosCart(item)}
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

          {/* Reports Tab - Same as PosView */}
          {activeTab === 'REPORTS' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                  <div>
                    <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">POS Sales Report</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">Financial performance and order history.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-xl border dark:border-gray-700">
                    <Calendar size={14} className="text-orange-500" />
                    <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="bg-transparent border-none text-[10px] font-black dark:text-white outline-none" />
                    <span className="text-gray-400 font-black">to</span>
                    <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="bg-transparent border-none text-[10px] font-black dark:text-white outline-none" />
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-3 md:p-4 rounded-2xl border dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-4 mb-6">
                  <div className="flex-1 flex flex-col sm:flex-row gap-4 w-full">
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
                  <button onClick={handleDownloadReport} className="w-full md:w-auto px-6 py-2 bg-black text-white dark:bg-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-500 transition-all">
                    <Download size={16} /> Export CSV
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-widest mb-2">Total Revenue</p>
                    <p className="text-2xl font-black dark:text-white tracking-tighter">RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-widest mb-2">Order Volume</p>
                    <p className="text-2xl font-black dark:text-white tracking-tighter">{reportData?.summary.orderVolume || 0}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700 shadow-sm">
                    <p className="text-gray-400 text-[8px] font-black uppercase tracking-widest mb-2">Efficiency</p>
                    <p className="text-2xl font-black text-green-500 tracking-tighter">{reportData?.summary.efficiency || 0}%</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-700 overflow-hidden shadow-sm">
                  <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="relative max-w-sm w-full">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Search Order ID..." value={reportSearchQuery} onChange={(e) => setReportSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-xl text-xs font-black dark:text-white outline-none focus:ring-1 focus:ring-orange-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Show</span>
                      <select value={entriesPerPage} onChange={(e) => setEntriesPerPage(Number(e.target.value))} className="bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-[10px] font-black dark:text-white p-1.5 outline-none cursor-pointer">
                        <option value={30}>30</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Entries</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
                          <th className="px-6 py-4 text-[8px] font-black text-gray-400 uppercase tracking-widest">Order ID</th>
                          <th className="px-6 py-4 text-[8px] font-black text-gray-400 uppercase tracking-widest">Table</th>
                          <th className="px-6 py-4 text-[8px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                          <th className="px-6 py-4 text-[8px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[8px] font-black text-gray-400 uppercase tracking-widest">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {paginatedReports.map(order => (
                          <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="px-6 py-4 font-black text-[10px] dark:text-white uppercase tracking-tighter">#{order.id}</td>
                            <td className="px-6 py-4 font-black text-[10px] dark:text-white">{order.tableNumber}</td>
                            <td className="px-6 py-4 font-black text-[10px] text-orange-500">RM{order.total.toFixed(2)}</td>
                            <td className="px-6 py-4">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                                order.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' : 
                                order.status === OrderStatus.SERVED ? 'bg-blue-100 text-blue-600' :
                                'bg-orange-100 text-orange-600'
                              }`}>
                                {order.status === OrderStatus.COMPLETED ? 'Paid' : order.status === OrderStatus.SERVED ? 'Served' : order.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-[10px] text-gray-400 font-medium">{new Date(order.timestamp).toLocaleTimeString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2 overflow-x-auto py-2">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"><ChevronFirst size={16} /></button>
                    <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"><ChevronLeft size={16} /></button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button key={page} onClick={() => setCurrentPage(page)} className={`w-8 h-8 rounded-lg font-black text-[10px] transition-all ${currentPage === page ? 'bg-orange-500 text-white shadow-md' : 'bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-400 hover:border-orange-500'}`}>{page}</button>
                    ))}
                    <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"><ChevronRight size={16} /></button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-400 hover:text-orange-500 disabled:opacity-30 transition-all"><ChevronLast size={16} /></button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Menu Editor Tab */}
          {activeTab === 'MENU_EDITOR' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-4">Menu Editor</h1>
                  
                  <div className="flex flex-wrap items-center gap-4 mb-6">
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
                    <button onClick={() => setIsFormModalOpen(true)} className="ml-auto px-6 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all shadow-lg">+ Add Item</button>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-6 bg-white dark:bg-gray-800 px-4 py-3 border dark:border-gray-700 rounded-lg shadow-sm overflow-x-auto hide-scrollbar sticky top-0 z-20">
                  <Search size={16} className="text-gray-400 shrink-0" />
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setMenuCategoryFilter(cat)} className={`whitespace-nowrap px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${menuCategoryFilter === cat ? 'bg-orange-100 text-orange-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>{cat}</button>
                  ))}
                </div>

                {menuViewMode === 'grid' ? (
                  <div className="grid grid-cols-5 gap-3">
                    {restaurant.menu.filter(item => {
                      const statusMatch = menuStatusFilter === 'ACTIVE' ? !item.isArchived : !!item.isArchived;
                      const categoryMatch = menuCategoryFilter === 'All' || item.category === menuCategoryFilter;
                      return statusMatch && categoryMatch;
                    }).map(item => (
                      <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border dark:border-gray-700 hover:shadow-md transition-all group flex flex-col">
                        <div className="relative aspect-square">
                          <img src={item.image} className="w-full h-full object-cover" />
                          <div className="absolute top-2 right-2 flex gap-1">
                            {menuStatusFilter === 'ACTIVE' ? (
                              <>
                                <button className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Archive size={12} /></button>
                                <button onClick={() => setEditingItem(item)} className="p-1.5 bg-white/90 backdrop-blur rounded-lg text-gray-700 shadow-sm"><Edit3 size={12} /></button>
                              </>
                            ) : (
                              <>
                                <button className="p-1.5 bg-green-50/90 backdrop-blur rounded-lg text-green-600 shadow-sm"><RotateCcw size={12} /></button>
                                <button className="p-1.5 bg-red-50/90 backdrop-blur rounded-lg text-red-600 shadow-sm"><Trash2 size={12} /></button>
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
                          {restaurant.menu.filter(item => {
                            const statusMatch = menuStatusFilter === 'ACTIVE' ? !item.isArchived : !!item.isArchived;
                            const categoryMatch = menuCategoryFilter === 'All' || item.category === menuCategoryFilter;
                            return statusMatch && categoryMatch;
                          }).map(item => (
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
                                    <button className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"><Archive size={16} /></button>
                                  ) : (
                                    <button className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"><RotateCcw size={16} /></button>
                                  )}
                                  <button onClick={() => setEditingItem(item)} className="p-2 text-gray-400 hover:text-orange-500 rounded-lg transition-all"><Edit3 size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-8 uppercase tracking-widest">Configure printer and staff access</p>
                
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
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-4">Configure your thermal printer for receipt printing</p>
                      <button className="px-4 py-2 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-orange-600 transition-all">
                        Setup Printer
                      </button>
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
                              <button className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
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

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => {
                      setIsAddStaffModalOpen(false);
                      setNewStaffUsername('');
                      setNewStaffPassword('');
                    }}
                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-black uppercase text-[9px] tracking-widest text-gray-500"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (newStaffUsername.trim() && newStaffPassword.trim()) {
                        const newStaff = {
                          username: newStaffUsername,
                          password: newStaffPassword,
                          createdAt: new Date().toISOString()
                        };
                        const updated = [...staffList, newStaff];
                        setStaffList(updated);
                        localStorage.setItem(`staff_${restaurant.id}`, JSON.stringify(updated));
                        setIsAddStaffModalOpen(false);
                        setNewStaffUsername('');
                        setNewStaffPassword('');
                        alert('Staff member added successfully!');
                      }
                    }}
                    className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-black uppercase text-[9px] tracking-widest shadow"
                  >
                    Add
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
                posCart.map(item => (
                    <div key={item.id} className="flex items-center gap-4">
                      <div className="flex-1">
                        <h4 className="font-black text-[10px] dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                        <p className="text-[10px] text-orange-500 font-black">RM{item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"><Minus size={12} /></button>
                        <span className="text-[10px] font-black w-4 text-center dark:text-white">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all"><Plus size={12} /></button>
                      </div>
                      <button onClick={() => removeFromPosCart(item.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))
                )
              )}
            </div>

            <div className="p-6 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-4">
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

                <button onClick={handleCheckout} disabled={posCart.length === 0} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2">
                  <CreditCard size={16} /> Complete Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
