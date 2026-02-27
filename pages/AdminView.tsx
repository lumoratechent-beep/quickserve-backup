import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Restaurant, Order, Area, OrderStatus, ReportResponse, ReportFilters, PlatformAccess } from '../types';
import { uploadImage } from '../lib/storage';
import { Users, Store, TrendingUp, Settings, ShieldCheck, Mail, Search, Filter, X, Plus, MapPin, Power, CheckCircle2, AlertCircle, LogIn, Trash2, LayoutGrid, List, ChevronRight, Eye, EyeOff, Globe, Phone, ShoppingBag, Edit3, Hash, Download, Calendar, ChevronLeft, Database, Image as ImageIcon, Key, QrCode, Printer, Layers, Info, ExternalLink, XCircle, Upload, Link, ChevronLast, ChevronFirst, Wifi, HardDrive, Cpu, Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  vendors: User[];
  restaurants: Restaurant[];
  orders: Order[];
  locations: Area[];
  onAddVendor: (user: User, restaurant: Restaurant) => void;
  onUpdateVendor: (user: User, restaurant: Restaurant) => void;
  onImpersonateVendor: (user: User) => void;
  onAddLocation: (area: Area) => void;
  onUpdateLocation: (area: Area) => void;
  onDeleteLocation: (areaId: string) => void;
  onToggleOnline: (restaurantId: string, currentStatus: boolean) => void;
  onRemoveVendorFromHub: (restaurantId: string) => void;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  onFetchStats?: (filters: ReportFilters) => Promise<any>;
}

// System Status Dashboard Component (unchanged)
const SystemStatusDashboard: React.FC = () => {
  // ... (keep the entire SystemStatusDashboard component exactly as is)
  const [status, setStatus] = useState<Record<string, { status: 'CHECKING' | 'OK' | 'ERROR'; message: string; lastChecked?: string }>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runAllChecks = async () => {
    setIsRefreshing(true);
    const timestamp = new Date().toLocaleTimeString();
    
    try {
      const { data: areas, error: areasError } = await supabase.from('areas').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        hubs: {
          status: !areasError ? 'OK' : 'ERROR',
          message: !areasError ? `Successfully connected to areas table` : `Error: ${areasError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        hubs: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const { data: users, error: usersError } = await supabase.from('users').select('count', { count: 'exact', head: true }).eq('role', 'VENDOR');
      setStatus(prev => ({
        ...prev,
        vendors: {
          status: !usersError ? 'OK' : 'ERROR',
          message: !usersError ? `Successfully connected to users table` : `Error: ${usersError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        vendors: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const { data: restaurants, error: restaurantsError } = await supabase.from('restaurants').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        restaurants: {
          status: !restaurantsError ? 'OK' : 'ERROR',
          message: !restaurantsError ? `Successfully connected to restaurants table` : `Error: ${restaurantsError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        restaurants: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const { data: menu, error: menuError } = await supabase.from('menu_items').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        menu: {
          status: !menuError ? 'OK' : 'ERROR',
          message: !menuError ? `Successfully connected to menu_items table` : `Error: ${menuError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        menu: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const { data: orders, error: ordersError } = await supabase.from('orders').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        orders: {
          status: !ordersError ? 'OK' : 'ERROR',
          message: !ordersError ? `Successfully connected to orders table` : `Error: ${ordersError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        orders: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', testFile);
      formData.append('filename', `system-check/test-${Date.now()}.txt`);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(prev => ({
          ...prev,
          upload: {
            status: 'OK',
            message: `Upload working (test file uploaded)`,
            lastChecked: timestamp
          }
        }));
      } else {
        const error = await response.json();
        setStatus(prev => ({
          ...prev,
          upload: {
            status: 'ERROR',
            message: `Upload failed: ${error.error || 'Unknown error'}`,
            lastChecked: timestamp
          }
        }));
      }
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        upload: { status: 'ERROR', message: `Upload check failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        setStatus(prev => ({
          ...prev,
          login: {
            status: 'OK',
            message: 'API endpoints accessible',
            lastChecked: timestamp
          }
        }));
      } else {
        setStatus(prev => ({
          ...prev,
          login: {
            status: 'ERROR',
            message: 'API health check failed',
            lastChecked: timestamp
          }
        }));
      }
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        login: { status: 'ERROR', message: `Login system check failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    try {
      const { error } = await supabase.from('areas').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        database: {
          status: !error ? 'OK' : 'ERROR',
          message: !error ? 'Supabase connection successful' : `Database error: ${error?.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        database: { status: 'ERROR', message: `Database connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    setIsRefreshing(false);
  };

  useEffect(() => {
    runAllChecks();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter">System Health Dashboard</h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Real-time status of all platform components</p>
        </div>
        <button
          onClick={runAllChecks}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Checking...' : 'Run All Checks'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database Connection */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.database?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.database?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Database size={20} className={status.database?.status === 'OK' ? 'text-green-500' : status.database?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Database Connection</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Supabase</p>
              </div>
            </div>
            {status.database?.status === 'CHECKING' && <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
            {status.database?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.database?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.database?.message || 'Checking...'}</p>
          {status.database?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.database.lastChecked}</p>
          )}
        </div>

        {/* Upload System */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.upload?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.upload?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Upload size={20} className={status.upload?.status === 'OK' ? 'text-green-500' : status.upload?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Image Upload</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Vercel Blob Storage</p>
              </div>
            </div>
            {status.upload?.status === 'CHECKING' && <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
            {status.upload?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.upload?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.upload?.message || 'Checking...'}</p>
          {status.upload?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.upload.lastChecked}</p>
          )}
        </div>

        {/* Hubs/Locations */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.hubs?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.hubs?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <MapPin size={20} className={status.hubs?.status === 'OK' ? 'text-green-500' : status.hubs?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Hubs/Locations</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">CRUD Operations</p>
              </div>
            </div>
            {status.hubs?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.hubs?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.hubs?.message || 'Checking...'}</p>
          {status.hubs?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.hubs.lastChecked}</p>
          )}
        </div>

        {/* Vendors */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.vendors?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.vendors?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Store size={20} className={status.vendors?.status === 'OK' ? 'text-green-500' : status.vendors?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Vendors</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">CRUD Operations</p>
              </div>
            </div>
            {status.vendors?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.vendors?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.vendors?.message || 'Checking...'}</p>
          {status.vendors?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.vendors.lastChecked}</p>
          )}
        </div>

        {/* Restaurants */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.restaurants?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.restaurants?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ShoppingBag size={20} className={status.restaurants?.status === 'OK' ? 'text-green-500' : status.restaurants?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Restaurants</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">CRUD Operations</p>
              </div>
            </div>
            {status.restaurants?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.restaurants?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.restaurants?.message || 'Checking...'}</p>
          {status.restaurants?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.restaurants.lastChecked}</p>
          )}
        </div>

        {/* Menu Items */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.menu?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.menu?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ImageIcon size={20} className={status.menu?.status === 'OK' ? 'text-green-500' : status.menu?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Menu Items</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">CRUD Operations</p>
              </div>
            </div>
            {status.menu?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.menu?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.menu?.message || 'Checking...'}</p>
          {status.menu?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.menu.lastChecked}</p>
          )}
        </div>

        {/* Orders System */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.orders?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.orders?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Activity size={20} className={status.orders?.status === 'OK' ? 'text-green-500' : status.orders?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Orders System</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Real-time Updates</p>
              </div>
            </div>
            {status.orders?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.orders?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.orders?.message || 'Checking...'}</p>
          {status.orders?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.orders.lastChecked}</p>
          )}
        </div>

        {/* Login System */}
        <div className={`p-6 rounded-2xl border transition-all ${
          status.login?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.login?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <LogIn size={20} className={status.login?.status === 'OK' ? 'text-green-500' : status.login?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-sm">Authentication</h4>
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Login System</p>
              </div>
            </div>
            {status.login?.status === 'OK' && <CheckCircle2 size={20} className="text-green-500" />}
            {status.login?.status === 'ERROR' && <AlertCircle size={20} className="text-red-500" />}
          </div>
          <p className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">{status.login?.message || 'Checking...'}</p>
          {status.login?.lastChecked && (
            <p className="mt-2 text-[8px] font-bold text-gray-400 uppercase tracking-widest">Last checked: {status.login.lastChecked}</p>
          )}
        </div>
      </div>

      {/* System Summary */}
      <div className="mt-8 p-6 bg-gray-900 dark:bg-gray-800 rounded-2xl text-white">
        <div className="flex items-center gap-3 mb-4">
          <Cpu size={20} className="text-orange-500" />
          <h4 className="font-black uppercase tracking-tighter">System Summary</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Checks</p>
            <p className="text-xl font-black">{Object.keys(status).length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Operational</p>
            <p className="text-xl font-black text-green-400">{Object.values(status).filter(s => s.status === 'OK').length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Issues Found</p>
            <p className="text-xl font-black text-red-400">{Object.values(status).filter(s => s.status === 'ERROR').length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Last Full Scan</p>
            <p className="text-sm font-black">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminView: React.FC<Props> = ({ 
  vendors, 
  restaurants, 
  orders, 
  locations, 
  onAddVendor, 
  onUpdateVendor, 
  onImpersonateVendor, 
  onAddLocation, 
  onUpdateLocation, 
  onDeleteLocation, 
  onToggleOnline, 
  onRemoveVendorFromHub,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  onFetchStats
}) => {
  const [activeTab, setActiveTab] = useState<'VENDORS' | 'LOCATIONS' | 'REPORTS' | 'SYSTEM'>('VENDORS');
  const [searchQuery, setSearchQuery] = useState('');
  const [hubSearchQuery, setHubSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  
  // Registration / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingVendor, setEditingVendor] = useState<{user: User, res: Restaurant} | null>(null);
  const [formVendor, setFormVendor] = useState({
    username: '',
    password: '',
    restaurantName: '',
    location: '',
    email: '',
    phone: '',
    logo: '',
    platformAccess: 'pos_and_kitchen' as PlatformAccess // ADD THIS
  });

  const vendorFileInputRef = useRef<HTMLInputElement>(null);

  // Hub Modal State
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [formArea, setFormArea] = useState<{ name: string; city: string; state: string; code: string; type: 'MULTI' | 'SINGLE' }>({ 
    name: '', city: '', state: '', code: '', type: 'MULTI' 
  });
  
  const [viewingHubVendors, setViewingHubVendors] = useState<Area | null>(null);

  // QR Modal State
  const [generatingQrHub, setGeneratingQrHub] = useState<Area | null>(null);
  const [qrMode, setQrMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [qrTableNo, setQrTableNo] = useState<string>('1');
  const [qrStartRange, setQrStartRange] = useState<string>('1');
  const [qrEndRange, setQrEndRange] = useState<string>('10');
  
  // Global QR Selection State
  const [isHubSelectionModalOpen, setIsHubSelectionModalOpen] = useState(false);

  // Reports State
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatus, setReportStatus] = useState<'ALL' | OrderStatus>('ALL');
  const [reportVendor, setReportVendor] = useState<string>('ALL');
  const [reportHub, setReportHub] = useState<string>('ALL');
  const [reportStart, setReportStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); 
    return d.toISOString().split('T')[0];
  });
  const [reportEnd, setReportEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [entriesPerPage, setEntriesPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      const res = restaurants.find(r => r.id === vendor.restaurantId);
      const matchesSearch = vendor.username.toLowerCase().includes(searchQuery.toLowerCase()) || res?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = vendorFilter === 'ALL' ? true : (vendorFilter === 'ACTIVE' ? vendor.isActive : !vendor.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [vendors, restaurants, searchQuery, vendorFilter]);

  const filteredHubs = useMemo(() => {
    return locations.filter(loc => 
      loc.name.toLowerCase().includes(hubSearchQuery.toLowerCase()) ||
      loc.city.toLowerCase().includes(hubSearchQuery.toLowerCase()) ||
      loc.code.toLowerCase().includes(hubSearchQuery.toLowerCase())
    );
  }, [locations, hubSearchQuery]);

  const fetchReport = async (isExport = false) => {
    if (!isExport) setIsReportLoading(true);
    try {
      const filters: ReportFilters = {
        restaurantId: reportVendor,
        locationName: reportHub,
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
  }, [activeTab, reportStart, reportEnd, reportStatus, reportSearchQuery, reportVendor, reportHub, currentPage, entriesPerPage]);

  const totalPages = reportData ? Math.ceil(reportData.totalCount / entriesPerPage) : 0;
  const paginatedReports = reportData?.orders || [];

  const handleDownloadReport = async () => {
    const allOrders = await fetchReport(true);
    if (!allOrders || allOrders.length === 0) return;
    const headers = ['Order ID', 'Kitchen', 'Hub', 'Table No', 'Date', 'Time', 'Status', 'Menu Order', 'Total Bill'];
    const rows = allOrders.map(o => {
      const res = restaurants.find(r => r.id === o.restaurantId);
      return [
        o.id, 
        res?.name || 'Unknown', 
        o.locationName || 'Unknown', 
        o.tableNumber || 'N/A',
        new Date(o.timestamp).toLocaleDateString(),
        new Date(o.timestamp).toLocaleTimeString(),
        o.status, 
        o.items.map(i => `${i.name} (x${i.quantity})`).join('; '), 
        o.total.toFixed(2)
      ];
    });
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `platform_sales_report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenEdit = (user: User) => {
    const res = restaurants.find(r => r.id === user.restaurantId);
    if (res) {
      setEditingVendor({ user, res });
      setFormVendor({
        username: user.username,
        password: user.password || '',
        restaurantName: res.name,
        location: res.location,
        email: user.email || '',
        phone: user.phone || '',
        logo: res.logo,
        platformAccess: res.platformAccess || 'pos_and_kitchen' // ADD THIS
      });
      setShowPassword(false);
      setIsModalOpen(true);
    }
  };

  const handleOpenAdd = () => {
    setEditingVendor(null);
    setFormVendor({ 
      username: '', 
      password: '', 
      restaurantName: '', 
      location: '', 
      email: '', 
      phone: '', 
      logo: '',
      platformAccess: 'pos_and_kitchen' // ADD THIS
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleVendorImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const publicUrl = await uploadImage(file, 'quickserve', 'logos');
        setFormVendor({ ...formVendor, logo: publicUrl });
      } catch (error) {
        console.error("Upload failed:", error);
        alert("Failed to upload logo. Please try again.");
      }
    }
  };

  const handleSubmitVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVendor.username || !formVendor.location) return;
    
    const userPayload: User = { 
      id: editingVendor?.user.id || '', 
      username: formVendor.username, 
      password: formVendor.password, 
      role: 'VENDOR', 
      email: formVendor.email, 
      phone: formVendor.phone,
      isActive: editingVendor ? editingVendor.user.isActive : true 
    };
    
    const resPayload: Restaurant = { 
      id: editingVendor?.res.id || '', 
      name: formVendor.restaurantName, 
      logo: formVendor.logo, 
      vendorId: editingVendor?.user.id || '', 
      location: formVendor.location, 
      menu: editingVendor?.res.menu || [],
      platformAccess: formVendor.platformAccess // ADD THIS
    };
    
    if (editingVendor) onUpdateVendor(userPayload, resPayload);
    else onAddVendor(userPayload, resPayload);
    setIsModalOpen(false);
  };

  const handleOpenHubEdit = (loc: Area) => {
    setEditingArea(loc);
    setFormArea({ name: loc.name, city: loc.city, state: loc.state, code: loc.code, type: loc.type || 'MULTI' });
    setIsAreaModalOpen(true);
  };

  const handleOpenHubAdd = () => {
    setEditingArea(null);
    setFormArea({ name: '', city: '', state: '', code: '', type: 'MULTI' });
    setIsAreaModalOpen(true);
  };

  const handleHubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingArea) {
      onUpdateLocation({ ...editingArea, ...formArea });
    } else {
      onAddLocation({ ...formArea, id: '', isActive: true });
    }
    setIsAreaModalOpen(false);
  };

  const toggleVendorStatus = (user: User) => {
    const res = restaurants.find(r => r.id === user.restaurantId);
    if (res) onUpdateVendor({ ...user, isActive: !user.isActive }, res);
  };

  const toggleHubStatus = (loc: Area) => {
    onUpdateLocation({ ...loc, isActive: !loc.isActive });
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

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* ... (keep all the existing JSX exactly as is until the Vendor Registration/Edit Modal) ... */}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 md:mb-12 gap-6 no-print">
        <div>
          <h1 className="text-3xl md:text-4xl font-black dark:text-white tracking-tighter uppercase leading-none mb-1">Platform Master</h1>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-[8px] md:text-[10px] ml-1">Administrative Controls</p>
        </div>
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl p-1.5 border dark:border-gray-700 shadow-sm transition-colors overflow-x-auto hide-scrollbar">
          {[
            { id: 'VENDORS', label: 'Vendors', icon: Store },
            { id: 'LOCATIONS', label: 'Hubs', icon: MapPin },
            { id: 'REPORTS', label: 'Report', icon: TrendingUp },
            { id: 'SYSTEM', label: 'System', icon: Database }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 md:px-6 md:py-3 rounded-xl font-black transition-all text-[10px] md:text-xs uppercase tracking-widest ${activeTab === tab.id ? 'bg-orange-500 text-white shadow-xl' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="no-print">
        {activeTab === 'VENDORS' && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 md:px-8 py-6 border-b dark:border-gray-700 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-gray-50/50 dark:bg-gray-700/50">
              <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Vendor Directory</h3>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                <div className="relative flex-1 sm:flex-none sm:w-64">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search..." className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-sm outline-none font-bold dark:text-white" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <div className="relative flex-1 sm:flex-none">
                   <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                   <select className="w-full pl-11 pr-8 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-sm appearance-none outline-none font-bold dark:text-white" value={vendorFilter} onChange={e => setVendorFilter(e.target.value as any)}>
                      <option value="ALL">All Activation</option>
                      <option value="ACTIVE">Master Active</option>
                      <option value="INACTIVE">Master Deactive</option>
                   </select>
                </div>
                <button onClick={handleOpenAdd} className="w-full sm:w-auto px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95">+ Register</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-4 text-left">Kitchen</th>
                    <th className="px-8 py-4 text-left">Hub</th>
                    <th className="px-8 py-4 text-center">Master Activation</th>
                    <th className="px-8 py-4 text-center">Live Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filteredVendors.map(vendor => {
                    const res = restaurants.find(r => r.id === vendor.restaurantId);
                    const isOnline = res?.isOnline ?? false;
                    return (
                      <tr key={vendor.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <img src={res?.logo} className="w-10 h-10 rounded-xl shadow-sm object-cover border dark:border-gray-600" />
                            <div>
                                <span className="font-black dark:text-white text-sm block">{res?.name}</span>
                                <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">@{vendor.username}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-sm font-bold text-gray-500 dark:text-gray-400 uppercase truncate max-w-[120px]">{res?.location || 'Unassigned'}</td>
                        <td className="px-8 py-5 text-center">
                          <button onClick={() => toggleVendorStatus(vendor)} className={`p-2 rounded-xl transition-all ${vendor.isActive ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 bg-gray-50 dark:bg-gray-700'}`}>
                             {vendor.isActive ? <CheckCircle2 size={20} /> : <Power size={20} />}
                          </button>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <button 
                            onClick={() => res && onToggleOnline(res.id, isOnline)} 
                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isOnline ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
                          >
                            {isOnline ? 'Online' : 'Offline'}
                          </button>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleOpenEdit(vendor)} className="p-2 text-gray-400 hover:text-blue-500"><Edit3 size={18} /></button>
                            <button onClick={() => onImpersonateVendor(vendor)} className="p-2 text-gray-400 hover:text-orange-500"><LogIn size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'LOCATIONS' && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 md:px-8 py-6 border-b dark:border-gray-700 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-gray-50/50 dark:bg-gray-700/50">
              <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Hub Registry</h3>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                <div className="relative flex-1 sm:flex-none sm:w-64">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search hubs..." className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-sm outline-none font-bold dark:text-white" value={hubSearchQuery} onChange={e => setHubSearchQuery(e.target.value)} />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => setIsHubSelectionModalOpen(true)} className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-gray-900 text-orange-500 border-2 border-orange-500 rounded-xl font-black uppercase tracking-widest text-[9px] shadow-sm flex items-center justify-center gap-2 hover:bg-orange-500 hover:text-white transition-all">
                      <QrCode size={16} /> QR
                    </button>
                    <button onClick={handleOpenHubAdd} className="flex-[2] sm:flex-none px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg">Register Hub</button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-4 text-left">Hub</th>
                    <th className="px-8 py-4 text-left">Type</th>
                    <th className="px-8 py-4 text-center">Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filteredHubs.map(loc => (
                    <tr key={loc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 text-orange-500 rounded-xl flex items-center justify-center shadow-inner group-hover:bg-orange-500 group-hover:text-white transition-all"><MapPin size={20} /></div>
                          <div>
                            <span className="font-black dark:text-white text-sm block uppercase tracking-tight">{loc.name}</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{loc.code} | {loc.state}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-tighter ${loc.type === 'SINGLE' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'}`}>
                          {loc.type || 'MULTI'}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button onClick={() => toggleHubStatus(loc)} className={`p-2 rounded-xl transition-all ${loc.isActive !== false ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 bg-gray-50 dark:bg-gray-700'}`}>
                           {loc.isActive !== false ? <Power size={20} /> : <Power size={20} className="opacity-40" />}
                        </button>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setGeneratingQrHub(loc)} className="p-2 text-gray-400 hover:text-orange-500"><QrCode size={18} /></button>
                          <button onClick={() => handleOpenHubEdit(loc)} className="p-2 text-gray-400 hover:text-blue-500"><Edit3 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'REPORTS' && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-500">
            <div className="px-4 md:px-8 py-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Sales Analysis</h3>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="ID or Kitchen..." 
                    className="w-full h-[36px] pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-orange-500 transition-all dark:text-white"
                    value={reportSearchQuery}
                    onChange={e => {setReportSearchQuery(e.target.value); setCurrentPage(1);}}
                  />
                </div>
                <button 
                  onClick={handleDownloadReport} 
                  disabled={!reportData || reportData.totalCount === 0} 
                  className="h-[36px] px-4 py-2 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-orange-500 hover:text-white transition-all shadow-lg whitespace-nowrap"
                >
                  <Download size={14} /> Download report
                </button>
              </div>
            </div>
            
            <div className="p-2 md:p-4">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-2xl border dark:border-gray-700 mb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Period Selection</label>
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-xl border dark:border-gray-600">
                      <Calendar size={14} className="text-orange-500 shrink-0" />
                      <input type="date" value={reportStart} onChange={(e) => {setReportStart(e.target.value); setCurrentPage(1);}} className="flex-1 bg-transparent border-none text-[10px] font-black dark:text-white p-0 outline-none" />
                      <span className="text-gray-400 font-black">-</span>
                      <input type="date" value={reportEnd} onChange={(e) => {setReportEnd(e.target.value); setCurrentPage(1);}} className="flex-1 bg-transparent border-none text-[10px] font-black dark:text-white p-0 outline-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Filter by Kitchen</label>
                    <div className="relative">
                      <Store size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select 
                        value={reportVendor} 
                        onChange={(e) => {setReportVendor(e.target.value); setCurrentPage(1);}}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl text-[10px] font-black dark:text-white appearance-none cursor-pointer outline-none"
                      >
                        <option value="ALL">All Kitchens</option>
                        {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Filter by Hub</label>
                    <div className="relative">
                      <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select 
                        value={reportHub} 
                        onChange={(e) => {setReportHub(e.target.value); setCurrentPage(1);}}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl text-[10px] font-black dark:text-white appearance-none cursor-pointer outline-none"
                      >
                        <option value="ALL">All Hubs</option>
                        {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Order Outcome</label>
                    <div className="relative">
                      <Filter size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select 
                        value={reportStatus} 
                        onChange={(e) => {setReportStatus(e.target.value as any); setCurrentPage(1);}}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl text-[10px] font-black dark:text-white appearance-none cursor-pointer outline-none"
                      >
                        <option value="ALL">All Outcomes</option>
                        <option value={OrderStatus.COMPLETED}>Served</option>
                        <option value={OrderStatus.PENDING}>Pending</option>
                        <option value={OrderStatus.ONGOING}>Ongoing</option>
                        <option value={OrderStatus.CANCELLED}>Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-4">
                <div className="bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-gray-400 dark:text-gray-500 text-[8px] md:text-[9px] font-black mb-1 uppercase tracking-widest">Platform Revenue</p>
                  <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white tracking-tighter leading-none">
                    RM{reportData?.summary.totalRevenue.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-gray-400 dark:text-gray-500 text-[8px] md:text-[9px] font-black mb-1 uppercase tracking-widest">Filtered Orders</p>
                  <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white tracking-tighter leading-none">
                    {reportData?.summary.orderVolume || 0}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <p className="text-gray-400 dark:text-gray-500 text-[8px] md:text-[9px] font-black mb-1 uppercase tracking-widest">Global Health</p>
                  <p className="text-lg md:text-xl font-black text-green-500 tracking-tighter leading-none">
                    {reportData?.summary.efficiency || 0}%
                  </p>
                </div>
              </div>

              <h3 className="text-xs font-black dark:text-white uppercase tracking-widest mb-3 ml-1">All Order</h3>
              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                        <tr>
                          <th className="px-8 py-3 text-left">ID</th>
                          <th className="px-8 py-3 text-left">Kitchen</th>
                          <th className="px-8 py-3 text-left">Hub</th>
                          <th className="px-8 py-3 text-left">Table No</th>
                          <th className="px-8 py-3 text-left">Date</th>
                          <th className="px-8 py-3 text-left">Time</th>
                          <th className="px-8 py-3 text-left">Status</th>
                          <th className="px-8 py-3 text-right">Total Bill</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {paginatedReports.map(report => {
                          const res = restaurants.find(r => r.id === report.restaurantId);
                          return (
                            <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="px-8 py-2.5 text-[10px] font-black dark:text-white uppercase tracking-widest">{report.id}</td>
                              <td className="px-8 py-2.5">
                                 <div className="flex items-center gap-2">
                                   <img src={res?.logo} className="w-4 h-4 rounded object-cover" />
                                   <span className="text-[10px] font-black dark:text-white uppercase tracking-tight truncate max-w-[80px]">{res?.name}</span>
                                 </div>
                              </td>
                              <td className="px-8 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">{report.locationName}</td>
                              <td className="px-8 py-2.5 text-[10px] font-black text-gray-900 dark:text-white uppercase tracking-widest">#{report.tableNumber}</td>
                              <td className="px-8 py-2.5 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-tighter">{new Date(report.timestamp).toLocaleDateString()}</td>
                              <td className="px-8 py-2.5 text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase">{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="px-8 py-2.5">
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${report.status === OrderStatus.COMPLETED ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{report.status === OrderStatus.COMPLETED ? 'Served' : report.status}</span>
                              </td>
                              <td className="px-8 py-2.5 text-right font-black dark:text-white text-[10px]">RM{report.total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        {paginatedReports.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-20 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">No matching records found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                </div>
              </div>

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
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2))
                      .map((p, i, arr) => {
                        const showEllipsis = i > 0 && p !== arr[i-1] + 1;
                        return (
                          <React.Fragment key={p}>
                            {showEllipsis && <span className="text-gray-400 px-1">...</span>}
                            <button
                              onClick={() => setCurrentPage(p)}
                              className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
                                currentPage === p 
                                ? 'bg-orange-500 text-white shadow-lg' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })
                    }
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
          </div>
        )}

        {activeTab === 'SYSTEM' && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 md:px-8 py-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/50">
              <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">System Health Monitor</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Real-time platform diagnostics</p>
            </div>
            <div className="p-4 md:p-8">
              <SystemStatusDashboard />
            </div>
          </div>
        )}
      </div>

      {/* MODALS SECTION */}

      {/* Vendor Registration/Edit Modal - UPDATED with Platform Access */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-black mb-8 dark:text-white uppercase tracking-tighter">{editingVendor ? 'Modify Vendor' : 'New Kitchen Signal'}</h2>
            <form onSubmit={handleSubmitVendor} className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {/* Kitchen Name (1) & Assign Hub (2) */}
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Kitchen Name</label>
                 <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formVendor.restaurantName} onChange={e => setFormVendor({...formVendor, restaurantName: e.target.value})} />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Assign to Hub</label>
                 <select required className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm appearance-none cursor-pointer" value={formVendor.location} onChange={e => setFormVendor({...formVendor, location: e.target.value})}>
                   <option value="">Select a Hub</option>
                   {locations.filter(l => l.isActive !== false).map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                 </select>
               </div>

               {/* Logo URL (3) & Contact Phone (4) */}
               <div className="space-y-4">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Kitchen Logo (Asset)</label>
                  <div className="flex gap-2">
                    <div 
                      onClick={() => vendorFileInputRef.current?.click()}
                      className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-xl flex items-center justify-center border-2 border-dashed border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors shrink-0"
                    >
                      {formVendor.logo ? <img src={formVendor.logo} className="w-full h-full object-cover rounded-lg" /> : <Upload size={18} />}
                    </div>
                    <div className="flex-1 relative">
                      <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Paste URL or upload..." className="w-full pl-9 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-xs" value={formVendor.logo} onChange={e => setFormVendor({...formVendor, logo: e.target.value})} />
                    </div>
                    <input type="file" ref={vendorFileInputRef} className="hidden" accept="image/*" onChange={handleVendorImageUpload} />
                  </div>
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Contact Phone No.</label>
                 <input type="tel" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formVendor.phone} onChange={e => setFormVendor({...formVendor, phone: e.target.value})} />
               </div>

               {/* Contact Email (5) & Vendor Username (6) */}
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Contact Email</label>
                 <input type="email" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formVendor.email} onChange={e => setFormVendor({...formVendor, email: e.target.value})} />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Vendor Username</label>
                 <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formVendor.username} onChange={e => setFormVendor({...formVendor, username: e.target.value})} />
               </div>

               {/* Platform Access (NEW) - Add this after username and before password */}
               <div className="md:col-span-2">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Platform Access</label>
                 <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-xl">
                   <button
                     type="button"
                     onClick={() => setFormVendor({...formVendor, platformAccess: 'pos_and_kitchen'})}
                     className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                       formVendor.platformAccess === 'pos_and_kitchen' 
                         ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' 
                         : 'text-gray-400'
                     }`}
                   >
                     POS & Kitchen
                   </button>
                   <button
                     type="button"
                     onClick={() => setFormVendor({...formVendor, platformAccess: 'pos_only'})}
                     className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                       formVendor.platformAccess === 'pos_only' 
                         ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' 
                         : 'text-gray-400'
                     }`}
                   >
                     POS Only
                   </button>
                 </div>
                 <p className="text-[8px] text-gray-400 mt-1 ml-1">
                   Determines what features this restaurant's staff can access
                 </p>
               </div>

               {/* Password (7) */}
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Secret Key (Password)</label>
                  <div className="relative">
                    <input 
                      required={!editingVendor} 
                      type={showPassword ? "text" : "password"} 
                      className="w-full pl-4 pr-11 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" 
                      value={formVendor.password} 
                      onChange={e => setFormVendor({...formVendor, password: e.target.value})} 
                      placeholder={editingVendor ? "Leave blank to keep current password" : "Enter password"}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>

               <div className="md:col-span-2 pt-4">
                  <button type="submit" className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-orange-600 transition-all active:scale-95">Save Changes</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {/* Hub Add/Edit Modal (unchanged) */}
      {isAreaModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
             <button onClick={() => setIsAreaModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
             <h2 className="text-2xl font-black mb-8 dark:text-white uppercase tracking-tighter">{editingArea ? 'Modify Hub' : 'Register New Hub'}</h2>
             <form onSubmit={handleHubSubmit} className="space-y-6">
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Hub Name</label>
                   <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formArea.name} onChange={e => setFormArea({...formArea, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-6">
                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">City</label>
                      <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formArea.city} onChange={e => setFormArea({...formArea, city: e.target.value})} />
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">State</label>
                      <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formArea.state} onChange={e => setFormArea({...formArea, state: e.target.value})} />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Short Code</label>
                      <input required type="text" maxLength={3} placeholder="e.g. SF" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm uppercase" value={formArea.code} onChange={e => setFormArea({...formArea, code: e.target.value.toUpperCase()})} />
                   </div>
                   <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Hub Type</label>
                      <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-xl">
                        <button type="button" onClick={() => setFormArea({...formArea, type: 'MULTI'})} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formArea.type === 'MULTI' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}>Multi</button>
                        <button type="button" onClick={() => setFormArea({...formArea, type: 'SINGLE'})} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formArea.type === 'SINGLE' ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' : 'text-gray-400'}`}>Single</button>
                      </div>
                   </div>
                </div>
                <div className="pt-4 flex gap-4">
                   {editingArea && (
                     <button type="button" onClick={() => { if(confirm('Delete Hub?')) onDeleteLocation(editingArea.id); setIsAreaModalOpen(false); }} className="p-3 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={24} /></button>
                   )}
                   <button type="submit" className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl">Confirm Hub Data</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* QR Generator Modal (Hub Specific) (unchanged) */}
      {generatingQrHub && (
        <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-4xl w-full p-8 shadow-2xl relative animate-in zoom-in duration-300">
             <button onClick={() => setGeneratingQrHub(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors no-print"><X size={24} /></button>
             
             <div className="no-print">
               <h2 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Hub QR Factory</h2>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-8">Generating for: {generatingQrHub.name}</p>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                 <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-2xl space-y-4">
                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Range Strategy</label>
                       <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl">
                          <button onClick={() => setQrMode('SINGLE')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${qrMode === 'SINGLE' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-400'}`}>Single</button>
                          <button onClick={() => setQrMode('BATCH')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${qrMode === 'BATCH' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-400'}`}>Batch</button>
                       </div>
                    </div>
                    {qrMode === 'SINGLE' ? (
                       <input type="text" className="w-full px-4 py-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl outline-none font-bold text-sm dark:text-white" value={qrTableNo} onChange={e => setQrTableNo(e.target.value)} placeholder="Table No." />
                    ) : (
                       <div className="flex gap-4">
                          <input type="number" className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl outline-none font-bold text-sm dark:text-white" value={qrStartRange} onChange={e => setQrStartRange(e.target.value)} placeholder="Start" />
                          <input type="number" className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl outline-none font-bold text-sm dark:text-white" value={qrEndRange} onChange={e => setQrEndRange(e.target.value)} placeholder="End" />
                       </div>
                    )}
                    <button onClick={handlePrintQr} className="w-full py-4 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center justify-center gap-2"><Printer size={18} /> Print Labelling</button>
                 </div>
                 <div className="bg-white dark:bg-gray-900 rounded-2xl border-4 border-dashed border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center p-8">
                    {qrMode === 'SINGLE' ? (
                      <>
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getQrUrl(generatingQrHub.name, qrTableNo))}`} alt="QR" className="w-40 h-40 mb-4" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{generatingQrHub.name}</span>
                        <span className="text-2xl font-black text-orange-500 uppercase tracking-tighter">TABLE {qrTableNo}</span>
                      </>
                    ) : (
                      <div className="text-center opacity-40">
                        <Layers size={48} className="mx-auto mb-4 text-gray-300" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Multiple Print Nodes Ready</p>
                      </div>
                    )}
                 </div>
               </div>
             </div>

             <div className="hidden print:block bg-white text-black p-0">
               {qrMode === 'SINGLE' ? (
                 <div className="flex flex-col items-center justify-center h-screen">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getQrUrl(generatingQrHub.name, qrTableNo))}`} className="w-80 h-80 mb-8" />
                    <h1 className="text-4xl font-black uppercase">{generatingQrHub.name}</h1>
                    <h2 className="text-6xl font-black text-orange-600">TABLE {qrTableNo}</h2>
                 </div>
               ) : (
                 <div className="grid grid-cols-2 gap-8 p-8">
                    {(() => {
                      const start = parseInt(qrStartRange);
                      const end = parseInt(qrEndRange);
                      if (isNaN(start) || isNaN(end)) return null;
                      const length = Math.max(0, end - start + 1);
                      return Array.from({ length }).map((_, i) => {
                         const num = start + i;
                         return (
                           <div key={num} className="page-break-inside-avoid border-2 border-gray-200 p-8 flex flex-col items-center rounded-[2rem]">
                              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(getQrUrl(generatingQrHub.name, String(num)))}`} className="w-48 h-48 mb-4" />
                              <p className="text-xs font-bold uppercase tracking-widest mb-1 text-gray-500">{generatingQrHub.name}</p>
                              <p className="text-2xl font-black uppercase">TABLE {num}</p>
                           </div>
                         );
                      });
                    })()}
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {isHubSelectionModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white dark:bg-gray-800 rounded-3xl max-lg w-full p-8 shadow-2xl relative">
              <button onClick={() => setIsHubSelectionModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
              <h2 className="text-2xl font-black mb-6 dark:text-white uppercase tracking-tighter">Select Hub to Generate</h2>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                 {locations.filter(l => l.isActive !== false).map(loc => (
                   <button key={loc.id} onClick={() => { setGeneratingQrHub(loc); setIsHubSelectionModalOpen(false); }} className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-2xl border dark:border-gray-700 group transition-all">
                      <div className="flex items-center gap-3">
                         <MapPin size={20} className="text-orange-500" />
                         <span className="font-black dark:text-white uppercase tracking-tight text-sm">{loc.name}</span>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-orange-500 translate-x-0 group-hover:translate-x-1 transition-all" />
                   </button>
                 ))}
              </div>
           </div>
        </div>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default AdminView;
