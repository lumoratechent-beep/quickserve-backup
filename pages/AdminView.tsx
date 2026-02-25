import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Restaurant, Order, Area, OrderStatus, ReportResponse, ReportFilters } from '../types';
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

// System Status Check Component
const SystemStatusDashboard: React.FC = () => {
  const [status, setStatus] = useState<Record<string, { status: 'CHECKING' | 'OK' | 'ERROR'; message: string; lastChecked?: string }>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runAllChecks = async () => {
    setIsRefreshing(true);
    const timestamp = new Date().toLocaleTimeString();
    
    // Hub/Location Check
    try {
      const { data: areas, error: areasError } = await supabase.from('areas').select('count').limit(1);
      setStatus(prev => ({
        ...prev,
        hubs: {
          status: !areasError ? 'OK' : 'ERROR',
          message: !areasError ? `Successfully connected (${areas?.length || 0} hubs found)` : `Error: ${areasError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        hubs: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Vendors Check
    try {
      const { data: users, error: usersError } = await supabase.from('users').select('count').eq('role', 'VENDOR').limit(1);
      setStatus(prev => ({
        ...prev,
        vendors: {
          status: !usersError ? 'OK' : 'ERROR',
          message: !usersError ? `Successfully connected (${users?.length || 0} vendors found)` : `Error: ${usersError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        vendors: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Restaurants Check
    try {
      const { data: restaurants, error: restaurantsError } = await supabase.from('restaurants').select('count').limit(1);
      setStatus(prev => ({
        ...prev,
        restaurants: {
          status: !restaurantsError ? 'OK' : 'ERROR',
          message: !restaurantsError ? `Successfully connected (${restaurants?.length || 0} restaurants found)` : `Error: ${restaurantsError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        restaurants: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Menu Items Check
    try {
      const { data: menu, error: menuError } = await supabase.from('menu_items').select('count').limit(1);
      setStatus(prev => ({
        ...prev,
        menu: {
          status: !menuError ? 'OK' : 'ERROR',
          message: !menuError ? `Successfully connected (${menu?.length || 0} menu items found)` : `Error: ${menuError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        menu: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Orders Check
    try {
      const { data: orders, error: ordersError } = await supabase.from('orders').select('count').limit(1);
      setStatus(prev => ({
        ...prev,
        orders: {
          status: !ordersError ? 'OK' : 'ERROR',
          message: !ordersError ? `Successfully connected (${orders?.length || 0} orders found)` : `Error: ${ordersError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        orders: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Upload/Blob Storage Check
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
            message: `Upload working (test file: ${data.url})`,
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

    // Login System Check
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

    // Database Connection Check
    try {
      const { error } = await supabase.from('areas').select('count').single();
      setStatus(prev => ({
        ...prev,
        database: {
          status: !error ? 'OK' : 'ERROR',
          message: !error ? 'Supabase connection successful' : `Database error: ${error.message}`,
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
