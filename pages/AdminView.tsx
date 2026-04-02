import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Restaurant, Order, Area, OrderStatus, ReportResponse, ReportFilters, PlatformAccess, Subscription, PlanId } from '../src/types';
import { uploadImage } from '../lib/storage';
import { Users, Store, TrendingUp, Settings, ShieldCheck, Mail, Search, Filter, X, Plus, MapPin, Power, CheckCircle2, AlertCircle, LogIn, Trash2, LayoutGrid, List, ChevronRight, Eye, EyeOff, Globe, Phone, ShoppingBag, Edit3, Hash, Download, Calendar, ChevronLeft, Database, Image as ImageIcon, Key, QrCode, Printer, Layers, Info, ExternalLink, XCircle, Upload, Link, ChevronLast, ChevronFirst, Wifi, HardDrive, Cpu, Activity, RefreshCw, Menu, GripVertical, DollarSign, ArrowUpRight, ArrowDownRight, Receipt, FileText, CreditCard, Radio, FileImage, Wallet, Banknote, CheckCircle, Send } from 'lucide-react';
import ImageCropModal from '../components/ImageCropModal';
import { supabase } from '../lib/supabase';
import { toast } from '../components/Toast';
import { PRICING_PLANS } from '../lib/pricingPlans';
import PitchDeck from '../components/PitchDeck';

interface Props {
  vendors: User[];
  restaurants: Restaurant[];
  orders: Order[];
  locations: Area[];
  onAddVendor: (user: User, restaurant: Restaurant) => Promise<string | null>;
  onUpdateVendor: (user: User, restaurant: Restaurant) => void | Promise<void>;
  onImpersonateVendor: (user: User) => void;
  onAddLocation: (area: Area) => void | Promise<void>;
  onUpdateLocation: (area: Area) => void | Promise<void>;
  onDeleteLocation: (areaId: string) => void | Promise<void>;
  onToggleOnline: (restaurantId: string, currentStatus: boolean) => void;
  onRemoveVendorFromHub: (restaurantId: string) => void;
  onDeleteVendor: (userId: string, restaurantId: string) => Promise<void>;
  onFetchPaginatedOrders?: (filters: ReportFilters, page: number, pageSize: number) => Promise<ReportResponse>;
  onFetchAllFilteredOrders?: (filters: ReportFilters) => Promise<Order[]>;
  onFetchStats?: (filters: ReportFilters) => Promise<any>;
}

// System Status Dashboard Component (keep as is)
const SystemStatusDashboard: React.FC = () => {
  // ... (keep the entire SystemStatusDashboard component exactly as it was in your original code)
  // I'm not including it here to save space, but keep your existing implementation
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

    // Subscriptions table
    try {
      const { error: subsError } = await supabase.from('subscriptions').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        subscriptions: {
          status: !subsError ? 'OK' : 'ERROR',
          message: !subsError ? 'Subscriptions table accessible' : `Error: ${subsError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        subscriptions: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Feature Images table
    try {
      const { error: imgError } = await supabase.from('feature_images').select('count', { count: 'exact', head: true });
      setStatus(prev => ({
        ...prev,
        featureImages: {
          status: !imgError ? 'OK' : 'ERROR',
          message: !imgError ? 'Feature images table accessible' : `Error: ${imgError.message}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        featureImages: { status: 'ERROR', message: `Connection failed: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Stripe API
    try {
      const stripeRes = await fetch('/api/stripe/billing?action=history&limit=1');
      setStatus(prev => ({
        ...prev,
        stripe: {
          status: stripeRes.ok || stripeRes.status === 400 ? 'OK' : 'ERROR',
          message: stripeRes.ok || stripeRes.status === 400 ? 'Stripe API reachable' : `Stripe returned ${stripeRes.status}`,
          lastChecked: timestamp
        }
      }));
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        stripe: { status: 'ERROR', message: `Stripe unreachable: ${error.message}`, lastChecked: timestamp }
      }));
    }

    // Realtime WebSocket
    try {
      const channel = supabase.channel('health-check-' + Date.now());
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {});
      channel.subscribe((subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          setStatus(prev => ({
            ...prev,
            realtime: {
              status: 'OK',
              message: 'Realtime connected',
              lastChecked: timestamp
            }
          }));
          setTimeout(() => supabase.removeChannel(channel), 0);
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          setStatus(prev => ({
            ...prev,
            realtime: {
              status: 'ERROR',
              message: `Realtime status: ${subStatus}`,
              lastChecked: timestamp
            }
          }));
          setTimeout(() => supabase.removeChannel(channel), 0);
        }
      });
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        realtime: { status: 'ERROR', message: `Realtime failed: ${error.message}`, lastChecked: timestamp }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter">System Health Dashboard</h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Click Run All Checks to scan</p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Database Connection */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.database?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.database?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Database size={16} className={status.database?.status === 'OK' ? 'text-green-500' : status.database?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Database</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Supabase</p>
              </div>
            </div>
            {status.database?.status === 'CHECKING' && <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
            {status.database?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.database?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.database?.message || 'Not checked yet'}</p>
        </div>

        {/* Upload System */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.upload?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.upload?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Upload size={16} className={status.upload?.status === 'OK' ? 'text-green-500' : status.upload?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Upload</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Blob Storage</p>
              </div>
            </div>
            {status.upload?.status === 'CHECKING' && <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />}
            {status.upload?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.upload?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.upload?.message || 'Not checked yet'}</p>
        </div>

        {/* Hubs/Locations */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.hubs?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.hubs?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MapPin size={16} className={status.hubs?.status === 'OK' ? 'text-green-500' : status.hubs?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Hubs</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Locations</p>
              </div>
            </div>
            {status.hubs?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.hubs?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.hubs?.message || 'Not checked yet'}</p>
        </div>

        {/* Vendors */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.vendors?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.vendors?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Store size={16} className={status.vendors?.status === 'OK' ? 'text-green-500' : status.vendors?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Vendors</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Users</p>
              </div>
            </div>
            {status.vendors?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.vendors?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.vendors?.message || 'Not checked yet'}</p>
        </div>

        {/* Restaurants */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.restaurants?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.restaurants?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className={status.restaurants?.status === 'OK' ? 'text-green-500' : status.restaurants?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Restaurants</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Stores</p>
              </div>
            </div>
            {status.restaurants?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.restaurants?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.restaurants?.message || 'Not checked yet'}</p>
        </div>

        {/* Menu Items */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.menu?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.menu?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className={status.menu?.status === 'OK' ? 'text-green-500' : status.menu?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Menu Items</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Products</p>
              </div>
            </div>
            {status.menu?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.menu?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.menu?.message || 'Not checked yet'}</p>
        </div>

        {/* Orders System */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.orders?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.orders?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Activity size={16} className={status.orders?.status === 'OK' ? 'text-green-500' : status.orders?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Orders</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Real-time</p>
              </div>
            </div>
            {status.orders?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.orders?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.orders?.message || 'Not checked yet'}</p>
        </div>

        {/* Login System */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.login?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.login?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <LogIn size={16} className={status.login?.status === 'OK' ? 'text-green-500' : status.login?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Auth</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Login System</p>
              </div>
            </div>
            {status.login?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.login?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.login?.message || 'Not checked yet'}</p>
        </div>

        {/* Subscriptions */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.subscriptions?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.subscriptions?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Receipt size={16} className={status.subscriptions?.status === 'OK' ? 'text-green-500' : status.subscriptions?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Subscriptions</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Plans</p>
              </div>
            </div>
            {status.subscriptions?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.subscriptions?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.subscriptions?.message || 'Not checked yet'}</p>
        </div>

        {/* Feature Images */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.featureImages?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.featureImages?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <FileImage size={16} className={status.featureImages?.status === 'OK' ? 'text-green-500' : status.featureImages?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Feature Imgs</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Marketing</p>
              </div>
            </div>
            {status.featureImages?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.featureImages?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.featureImages?.message || 'Not checked yet'}</p>
        </div>

        {/* Stripe API */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.stripe?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.stripe?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className={status.stripe?.status === 'OK' ? 'text-green-500' : status.stripe?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Stripe</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">Payments</p>
              </div>
            </div>
            {status.stripe?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.stripe?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.stripe?.message || 'Not checked yet'}</p>
        </div>

        {/* Realtime */}
        <div className={`p-3 rounded-xl border transition-all ${
          status.realtime?.status === 'OK' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/20' :
          status.realtime?.status === 'ERROR' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/20' :
          'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Radio size={16} className={status.realtime?.status === 'OK' ? 'text-green-500' : status.realtime?.status === 'ERROR' ? 'text-red-500' : 'text-gray-400'} />
              <div>
                <h4 className="font-black dark:text-white text-xs leading-tight">Realtime</h4>
                <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400">WebSocket</p>
              </div>
            </div>
            {status.realtime?.status === 'OK' && <CheckCircle2 size={16} className="text-green-500" />}
            {status.realtime?.status === 'ERROR' && <AlertCircle size={16} className="text-red-500" />}
          </div>
          <p className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate">{status.realtime?.message || 'Not checked yet'}</p>
        </div>
      </div>

      {/* System Summary */}
      <div className="p-4 bg-gray-900 dark:bg-gray-800 rounded-xl text-white">
        <div className="flex items-center gap-2 mb-2">
          <Cpu size={16} className="text-orange-500" />
          <h4 className="font-black uppercase tracking-tighter text-sm">System Summary</h4>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Checks</p>
            <p className="text-lg font-black">{Object.keys(status).length}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Operational</p>
            <p className="text-lg font-black text-green-400">{Object.values(status).filter(s => s.status === 'OK').length}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Issues</p>
            <p className="text-lg font-black text-red-400">{Object.values(status).filter(s => s.status === 'ERROR').length}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Last Scan</p>
            <p className="text-xs font-black">{new Date().toLocaleDateString()}</p>
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
  onDeleteVendor,
  onFetchPaginatedOrders,
  onFetchAllFilteredOrders,
  onFetchStats
}) => {
  const [activeTab, setActiveTab] = useState<'VENDORS' | 'LOCATIONS' | 'INCOME_REPORT' | 'CASHOUT' | 'SYSTEM'>('VENDORS');
  const [incomeReportSubTab, setIncomeReportSubTab] = useState<'REPORTS' | 'INCOME'>('REPORTS');

  // Cashout requests tab state
  const [adminCashouts, setAdminCashouts] = useState<any[]>([]);
  const [adminCashoutsLoading, setAdminCashoutsLoading] = useState(false);
  const [adminCashoutFilter, setAdminCashoutFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'rejected'>('pending');

  const fetchAdminCashouts = async () => {
    setAdminCashoutsLoading(true);
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_cashouts' }),
      });
      const data = await res.json();
      if (data.cashouts) {
        // Enrich with restaurant name
        const enriched = data.cashouts.map((c: any) => {
          const rest = restaurants.find(r => r.id === c.restaurant_id);
          return { ...c, restaurantName: rest?.name || 'Unknown Vendor' };
        });
        setAdminCashouts(enriched);
      }
    } catch (error) {
      console.error('Failed to fetch admin cashouts:', error);
    } finally {
      setAdminCashoutsLoading(false);
    }
  };

  const handleUpdateCashout = async (cashoutId: string, status: 'approved' | 'completed' | 'rejected', notes?: string) => {
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_update_cashout', cashoutId, status, adminNotes: notes }),
      });
      const data = await res.json();
      if (data.error) { toast(data.error, 'error'); return; }
      toast(`Cashout request ${status}`, 'success');
      fetchAdminCashouts();
    } catch (error) {
      toast('Failed to update cashout', 'error');
    }
  };

  // Income tab state
  const [incomeTransactions, setIncomeTransactions] = useState<any[]>([]);
  const [incomeSummary, setIncomeSummary] = useState<{ totalGross: number; totalFees: number; totalNet: number; count: number } | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeStartDate, setIncomeStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [incomeEndDate, setIncomeEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incomeHasMore, setIncomeHasMore] = useState(false);
  const [incomeLastId, setIncomeLastId] = useState<string | null>(null);

  const generateSlug = (name: string): string => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!base) return '';
    const existingSlugs = new Set(restaurants.filter(r => r.id !== editingVendor?.res.id).map(r => r.slug).filter(Boolean));
    if (!existingSlugs.has(base)) return base;
    let i = 2;
    while (existingSlugs.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [hubSearchQuery, setHubSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [vendorSort, setVendorSort] = useState<{ field: 'KITCHEN' | 'HUB'; direction: 'asc' | 'desc' } | null>(null);
  
  // Registration / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingVendor, setIsSubmittingVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<{user: User, res: Restaurant} | null>(null);
  const [formVendor, setFormVendor] = useState({
    username: '',
    password: '',
    restaurantName: '',
    location: '',
    email: '',
    phone: '',
    logo: '',
    platformAccess: 'pos_and_kitchen' as PlatformAccess,
    slug: '',
    planId: 'basic' as PlanId
  });

  // Subscription data for all restaurants
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});

  useEffect(() => {
    const fetchSubscriptions = async () => {
      const { data, error } = await supabase.from('subscriptions').select('*');
      if (!error && data) {
        const map: Record<string, Subscription> = {};
        data.forEach((s: any) => { map[s.restaurant_id] = s; });
        setSubscriptions(map);
      }
    };
    fetchSubscriptions();
  }, [restaurants]);

  const vendorFileInputRef = useRef<HTMLInputElement>(null);

  // Hub Modal State
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [isSubmittingArea, setIsSubmittingArea] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [formArea, setFormArea] = useState<{ name: string; city: string; state: string; code: string }>({ 
    name: '', city: '', state: '', code: '' 
  });
  
  const [viewingHubVendors, setViewingHubVendors] = useState<Area | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Fetch income data
  const fetchIncome = async (loadMore = false) => {
    setIncomeLoading(true);
    try {
      const params = new URLSearchParams();
      if (incomeStartDate) params.set('startDate', incomeStartDate);
      if (incomeEndDate) params.set('endDate', incomeEndDate);
      params.set('limit', '50');
      if (loadMore && incomeLastId) params.set('startingAfter', incomeLastId);
      const resp = await fetch(`/api/stripe/income?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch income data');
      const data = await resp.json();
      if (loadMore) {
        setIncomeTransactions(prev => [...prev, ...data.transactions]);
      } else {
        setIncomeTransactions(data.transactions);
        setIncomeSummary(data.summary);
      }
      setIncomeHasMore(data.hasMore);
      setIncomeLastId(data.lastId);
    } catch (err: any) {
      toast(err.message || 'Failed to load income', 'error');
    } finally {
      setIncomeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'INCOME_REPORT' && incomeReportSubTab === 'INCOME') fetchIncome();
  }, [activeTab, incomeReportSubTab, incomeStartDate, incomeEndDate]);

  // QR Modal State
  const [generatingQrHub, setGeneratingQrHub] = useState<Area | null>(null);
  const [qrMode, setQrMode] = useState<'SINGLE' | 'BATCH'>('SINGLE');
  const [qrTableNo, setQrTableNo] = useState<string>('1');
  const [qrStartRange, setQrStartRange] = useState<string>('1');
  const [qrEndRange, setQrEndRange] = useState<string>('10');
  
  // Global QR Selection State
  const [isHubSelectionModalOpen, setIsHubSelectionModalOpen] = useState(false);

  // Feature Images State
  const [systemSubTab, setSystemSubTab] = useState<'STATUS' | 'FEATURE_IMAGES'>('STATUS');
  const [showPitchDeck, setShowPitchDeck] = useState(false);
  const [featureImages, setFeatureImages] = useState<{ id: string; url: string; alt: string; crop_shape: string; display_width: number; display_height: number; sort_order: number; category: string }[]>([]);
  const [isLoadingFeatureImages, setIsLoadingFeatureImages] = useState(false);
  const [featureCropFile, setFeatureCropFile] = useState<File | null>(null);
  const featureFileRef = useRef<HTMLInputElement>(null);
  const [featureImageCategory, setFeatureImageCategory] = useState<string>('partner');

  const fetchFeatureImages = async () => {
    setIsLoadingFeatureImages(true);
    const { data } = await supabase.from('feature_images').select('*').order('sort_order');
    if (data) setFeatureImages(data);
    setIsLoadingFeatureImages(false);
  };

  useEffect(() => { if (systemSubTab === 'FEATURE_IMAGES') fetchFeatureImages(); }, [systemSubTab]);

  const handleFeatureImageCropped = async (blob: Blob, cropShape: string, width: number, height: number) => {
    try {
      const file = new File([blob], `feature-${Date.now()}.png`, { type: 'image/png' });
      const url = await uploadImage(file, 'quickserve', 'feature-images');
      const { error } = await supabase.from('feature_images').insert({ url, alt: '', crop_shape: cropShape, display_width: width, display_height: height, sort_order: featureImages.length, category: featureImageCategory });
      if (error) throw error;
      toast('Feature image added!', 'success');
      fetchFeatureImages();
    } catch (err: any) {
      toast(err.message || 'Upload failed', 'error');
    }
    setFeatureCropFile(null);
  };

  const deleteFeatureImage = async (id: string) => {
    const { error } = await supabase.from('feature_images').delete().eq('id', id);
    if (error) { toast('Delete failed', 'error'); return; }
    toast('Image removed', 'success');
    fetchFeatureImages();
  };

  // Reports State
  const [reportSearchQuery, setReportSearchQuery] = useState('');
  const [reportStatus, setReportStatus] = useState<'ALL' | OrderStatus>('ALL');
  const [reportVendor, setReportVendor] = useState<string>('ALL');
  const [reportHub, setReportHub] = useState<string>('ALL');
  const [reportStart, setReportStart] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [reportEnd, setReportEnd] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [entriesPerPage, setEntriesPerPage] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);

  const filteredVendors = useMemo(() => {
    const base = vendors.filter(vendor => {
      const res = restaurants.find(r => r.id === vendor.restaurantId);
      const matchesSearch = vendor.username.toLowerCase().includes(searchQuery.toLowerCase()) || res?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = vendorFilter === 'ALL' ? true : (vendorFilter === 'ACTIVE' ? vendor.isActive : !vendor.isActive);
      return matchesSearch && matchesStatus;
    });

    if (!vendorSort) return base;

    return [...base].sort((a, b) => {
      const restaurantA = restaurants.find(r => r.id === a.restaurantId);
      const restaurantB = restaurants.find(r => r.id === b.restaurantId);

      const valueA = vendorSort.field === 'KITCHEN'
        ? (restaurantA?.name || '').toLowerCase()
        : (restaurantA?.location || '').toLowerCase();
      const valueB = vendorSort.field === 'KITCHEN'
        ? (restaurantB?.name || '').toLowerCase()
        : (restaurantB?.location || '').toLowerCase();

      const order = valueA.localeCompare(valueB);
      return vendorSort.direction === 'asc' ? order : -order;
    });
  }, [vendors, restaurants, searchQuery, vendorFilter, vendorSort]);

  const handleVendorSort = (field: 'KITCHEN' | 'HUB') => {
    setVendorSort(prev => {
      if (!prev || prev.field !== field) {
        return { field, direction: 'asc' };
      }
      return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

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
    if (activeTab === 'INCOME_REPORT' && incomeReportSubTab === 'REPORTS') {
      fetchReport();
    }
  }, [activeTab, incomeReportSubTab, reportStart, reportEnd, reportStatus, reportSearchQuery, reportVendor, reportHub, currentPage, entriesPerPage]);

  const totalPages = reportData ? Math.ceil(reportData.totalCount / entriesPerPage) : 0;
  const paginatedReports = reportData?.orders || [];

  const handleDownloadReport = async () => {
    const allOrders = await fetchReport(true);
    if (!allOrders || allOrders.length === 0) return;
    const headers = ['Order ID', 'Kitchen', 'Hub', 'Table No', 'Date', 'Time', 'Status', 'Payment Method', 'Cashier', 'Menu Order', 'Total Bill'];
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
        o.paymentMethod || '',
        o.cashierName || '',
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
      const autoSlug = res.slug || (res.location === 'QuickServe Hub' && res.name ? res.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '');
      setFormVendor({
        username: user.username,
        password: user.password || '',
        restaurantName: res.name,
        location: res.location,
        email: user.email || '',
        phone: user.phone || '',
        logo: res.logo,
        platformAccess: res.platformAccess || 'pos_and_kitchen',
        slug: autoSlug,
        planId: (subscriptions[res.id]?.plan_id as PlanId) || 'basic'
      });
      setShowPassword(false);
      setIsModalOpen(true);
    } else {
      // Orphaned vendor — restaurant data missing from Supabase
      if (confirm(`Restaurant data for "${user.username}" is missing. Do you want to remove this orphaned vendor record?`)) {
        onDeleteVendor(user.id, user.restaurantId || '').catch(() => {});
      }
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
      platformAccess: 'pos_and_kitchen',
      slug: '',
      planId: 'basic' as PlanId
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
        toast("Failed to upload logo. Please try again.", 'error');
      }
    }
  };

  const handleSubmitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVendor.username || !formVendor.location) {
      toast("Please fill out all required fields", 'error');
      return;
    }
    
    setIsSubmittingVendor(true);
    try {
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
        // Derive platformAccess from plan selection
        platformAccess: (formVendor.planId === 'pro_plus' ? 'pos_and_kitchen' : formVendor.planId === 'pro' ? 'pos_and_qr' : 'pos_only') as PlatformAccess,
        slug: formVendor.slug || undefined
      };
      
      if (editingVendor) {
        await onUpdateVendor(userPayload, resPayload);
      } else {
        const newResId = await onAddVendor(userPayload, resPayload);
        if (newResId) {
          resPayload.id = newResId;
        }
      }

      // Upsert subscription with selected plan
      const restaurantId = resPayload.id || editingVendor?.res.id;
      if (restaurantId) {
        const planAccess: PlatformAccess = formVendor.planId === 'pro_plus' ? 'pos_and_kitchen' : formVendor.planId === 'pro' ? 'pos_and_qr' : 'pos_only';
        await supabase.from('restaurants').update({ platform_access: planAccess }).eq('id', restaurantId);
        const { data: existingSub } = await supabase.from('subscriptions').select('id').eq('restaurant_id', restaurantId).single();
        if (existingSub) {
          await supabase.from('subscriptions').update({ plan_id: formVendor.planId, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId);
        } else {
          await supabase.from('subscriptions').insert({ restaurant_id: restaurantId, plan_id: formVendor.planId, status: 'active', trial_start: new Date().toISOString(), trial_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        }
        // Refresh subscriptions
        const { data: subData } = await supabase.from('subscriptions').select('*');
        if (subData) {
          const map: Record<string, Subscription> = {};
          subData.forEach((s: any) => { map[s.restaurant_id] = s; });
          setSubscriptions(map);
        }
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error submitting vendor:', error);
    } finally {
      setIsSubmittingVendor(false);
    }
  };

  const handleOpenHubEdit = (loc: Area) => {
    setEditingArea(loc);
    setFormArea({ name: loc.name, city: loc.city, state: loc.state, code: loc.code });
    setIsAreaModalOpen(true);
  };

  const handleOpenHubAdd = () => {
    setEditingArea(null);
    setFormArea({ name: '', city: '', state: '', code: '' });
    setIsAreaModalOpen(true);
  };

  const handleHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formArea.name || !formArea.city || !formArea.state || !formArea.code) {
      toast("Please fill out all hub fields", 'error');
      return;
    }
    
    setIsSubmittingArea(true);
    try {
      if (editingArea) {
        await onUpdateLocation({ ...editingArea, ...formArea });
      } else {
        await onAddLocation({ ...formArea, id: '', isActive: true });
      }
      setIsAreaModalOpen(false);
    } catch (error) {
      console.error('Error submitting hub:', error);
    } finally {
      setIsSubmittingArea(false);
    }
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
    <div className="flex h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 border-r dark:border-gray-700
        flex flex-col transition-all duration-300 ease-in-out no-print
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarCollapsed ? 'lg:w-16' : 'w-64'}
      `}>

        {/* Navigation */}
        <nav className={`flex-1 space-y-1 ${sidebarCollapsed ? 'p-2 pt-4' : 'p-4 pt-5'}`}>
          {([
            { id: 'VENDORS', label: 'Vendors', icon: Store },
            { id: 'LOCATIONS', label: 'Hubs', icon: MapPin },
            { id: 'INCOME_REPORT', label: 'Income & Report', icon: TrendingUp },
            { id: 'CASHOUT', label: 'Cashout', icon: Wallet },
            { id: 'SYSTEM', label: 'System', icon: Database },
          ] as { id: 'VENDORS' | 'LOCATIONS' | 'INCOME_REPORT' | 'CASHOUT' | 'SYSTEM'; label: string; icon: React.ElementType }[]).map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
              title={item.label}
              className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} py-3 rounded-xl font-medium transition-all ${
                activeTab === item.id
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <item.icon size={20} />
              {!sidebarCollapsed && <span className="text-sm font-semibold">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <div className={`hidden lg:flex ${sidebarCollapsed ? 'justify-center p-2' : 'justify-end px-4'} py-2`}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <div className="pb-2" />
      </aside>

      {/* Main Content */}
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
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <ShieldCheck size={16} className="text-white" />
            </div>
            <h1 className="font-black dark:text-white uppercase tracking-tighter text-sm">
              {activeTab === 'VENDORS' ? 'Vendors' :
               activeTab === 'LOCATIONS' ? 'Hubs' :
               activeTab === 'INCOME_REPORT' ? 'Income & Report' :
               activeTab === 'CASHOUT' ? 'Cashout' :
               'System'}
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
        {activeTab === 'VENDORS' && (
          <div>
            <div className="px-4 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Vendor Directory</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Manage registered kitchens and their subscription plans</p>
              </div>
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
            <div className="mx-4 md:mx-8 my-4 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-4 text-left group">
                      <div className="inline-flex items-center gap-1.5">
                        <span>Kitchen</span>
                        <button
                          onClick={() => handleVendorSort('KITCHEN')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-orange-500"
                          aria-label="Sort Kitchen"
                          title="Sort Kitchen"
                        >
                          {vendorSort?.field === 'KITCHEN' && vendorSort.direction === 'desc' ? '▼' : '▲'}
                        </button>
                      </div>
                    </th>
                    <th className="px-8 py-4 text-left group">
                      <div className="inline-flex items-center gap-1.5">
                        <span>Hub</span>
                        <button
                          onClick={() => handleVendorSort('HUB')}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-orange-500"
                          aria-label="Sort Hub"
                          title="Sort Hub"
                        >
                          {vendorSort?.field === 'HUB' && vendorSort.direction === 'desc' ? '▼' : '▲'}
                        </button>
                      </div>
                    </th>
                    <th className="px-8 py-4 text-center">Plan</th>
                    <th className="px-8 py-4 text-center">Plan Expiry</th>
                    <th className="px-8 py-4 text-center">Master Activation</th>
                    <th className="px-8 py-4 text-center">Live Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700/50">
                  {filteredVendors.map(vendor => {
                    const res = restaurants.find(r => r.id === vendor.restaurantId);
                    const isOnline = res?.isOnline ?? false;
                    return (
                      <tr key={vendor.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
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
                          {(() => {
                            const sub = res ? subscriptions[res.id] : null;
                            const planId = sub?.plan_id || 'basic';
                            const planColors: Record<string, string> = { basic: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', pro: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', pro_plus: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
                            const planLabels: Record<string, string> = { basic: 'Basic', pro: 'Pro', pro_plus: 'Pro Plus' };
                            return <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${planColors[planId] || planColors.basic}`}>{planLabels[planId] || 'Basic'}</span>;
                          })()}
                        </td>
                        <td className="px-8 py-5 text-center">
                          {(() => {
                            const sub = res ? subscriptions[res.id] : null;
                            if (!sub) return <span className="text-[9px] font-bold text-gray-400">—</span>;
                            const endDate = sub.current_period_end || sub.trial_end;
                            if (!endDate) return <span className="text-[9px] font-bold text-gray-400">—</span>;
                            const d = new Date(endDate);
                            const isExpired = d < new Date();
                            return <span className={`text-[9px] font-black ${isExpired ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{d.toLocaleDateString()}</span>;
                          })()}
                        </td>
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
                            {!res && (
                              <button onClick={() => { if (confirm(`Remove orphaned vendor "${vendor.username}"?`)) onDeleteVendor(vendor.id, vendor.restaurantId || '').catch(() => {}); }} className="p-2 text-gray-400 hover:text-red-500" title="Delete orphaned vendor"><Trash2 size={18} /></button>
                            )}
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
          </div>
        )}

        {activeTab === 'LOCATIONS' && (
          <div>
            <div className="px-4 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Hub Registry</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Configure service locations and generate table QR codes</p>
              </div>
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
            <div className="mx-4 md:mx-8 my-4 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-4 text-left">Hub</th>
                    <th className="px-8 py-4 text-center">Vendors</th>
                    <th className="px-8 py-4 text-center">Status</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700/50">
                  {filteredHubs.map(loc => (
                    <tr key={loc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 text-orange-500 rounded-xl flex items-center justify-center shadow-inner group-hover:bg-orange-500 group-hover:text-white transition-all"><MapPin size={20} /></div>
                          <div>
                            <span className="font-black dark:text-white text-sm block uppercase tracking-tight">{loc.name}</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{loc.code} | {loc.state}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        {(() => {
                          const count = restaurants.filter(r => r.location === loc.name).length;
                          return (
                            <button
                              onClick={() => setViewingHubVendors(loc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-500 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50"
                            >
                              <Users size={14} />
                              {count}
                            </button>
                          );
                        })()}
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
          </div>
        )}

        {activeTab === 'INCOME_REPORT' && (
          <div>
            {/* Sub-tab bar */}
            <div className="px-4 md:px-8 pt-6 pb-0">
              <div className="flex gap-0 relative mb-6">
                {([
                  { id: 'REPORTS' as const, label: 'Sales Report', icon: <TrendingUp size={14} /> },
                  { id: 'INCOME' as const, label: 'Stripe Income', icon: <DollarSign size={14} /> },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setIncomeReportSubTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                      incomeReportSubTab === tab.id
                        ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                        : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {incomeReportSubTab === 'REPORTS' && (
            <div>
            <div className="px-4 md:px-8 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Sales Analysis</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Platform-wide order history, revenue and performance metrics</p>
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
                  {/* Period selection */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Period Selection</label>
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-xl border dark:border-gray-600">
                      <Calendar size={14} className="text-orange-500 shrink-0" />
                      <input type="date" value={reportStart} onChange={(e) => {setReportStart(e.target.value); setCurrentPage(1);}} className="flex-1 bg-transparent border-none text-[10px] font-black dark:text-white p-0 outline-none" />
                      <span className="text-gray-400 font-black">-</span>
                      <input type="date" value={reportEnd} onChange={(e) => {setReportEnd(e.target.value); setCurrentPage(1);}} className="flex-1 bg-transparent border-none text-[10px] font-black dark:text-white p-0 outline-none" />
                    </div>
                  </div>

                  {/* Vendor Filter */}
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

                  {/* Hub Filter */}
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

                  {/* Status Filter */}
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
                          <th className="px-8 py-3 text-left">Payment</th>
                          <th className="px-8 py-3 text-left">Cashier</th>
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
                              <td className="px-8 py-2.5 text-[10px] font-black text-gray-700 dark:text-gray-300 uppercase">{report.paymentMethod || '-'}</td>
                              <td className="px-8 py-2.5 text-[10px] font-black text-gray-700 dark:text-gray-300">{report.cashierName || '-'}</td>
                              <td className="px-8 py-2.5 text-right font-black dark:text-white text-[10px]">RM{report.total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                        {paginatedReports.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-20 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">No matching records found.</td>
                          </tr>
                        )}
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

            {incomeReportSubTab === 'INCOME' && (
          <div className="p-4 md:p-8">
            <div className="mb-6">
              <h3 className="font-black dark:text-white uppercase tracking-tighter text-lg">Stripe Income</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">All subscription payments collected via Stripe</p>
            </div>

            {/* Summary Cards */}
            {incomeSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center"><ArrowUpRight size={16} className="text-green-500" /></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Gross Income</span>
                  </div>
                  <p className="text-2xl font-black dark:text-white">RM {incomeSummary.totalGross.toFixed(2)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center"><ArrowDownRight size={16} className="text-red-500" /></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stripe Fees</span>
                  </div>
                  <p className="text-2xl font-black dark:text-white">RM {incomeSummary.totalFees.toFixed(2)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center justify-center"><DollarSign size={16} className="text-orange-500" /></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net Income</span>
                  </div>
                  <p className="text-2xl font-black text-orange-500">RM {incomeSummary.totalNet.toFixed(2)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center"><Receipt size={16} className="text-blue-500" /></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transactions</span>
                  </div>
                  <p className="text-2xl font-black dark:text-white">{incomeSummary.count}</p>
                </div>
              </div>
            )}

            {/* Date Filters */}
            <div className="flex flex-col sm:flex-row items-end gap-3 mb-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">From</label>
                <input type="date" className="px-4 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-sm outline-none font-bold dark:text-white" value={incomeStartDate} onChange={e => setIncomeStartDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">To</label>
                <input type="date" className="px-4 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-sm outline-none font-bold dark:text-white" value={incomeEndDate} onChange={e => setIncomeEndDate(e.target.value)} />
              </div>
              <button onClick={() => fetchIncome()} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95 flex items-center gap-2">
                <Search size={14} /> Filter
              </button>
            </div>

            {/* Transactions Table */}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-800">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50">
                    <th className="w-[11%] px-3 py-2.5 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="w-[16%] px-3 py-2.5 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">Restaurant</th>
                    <th className="w-[9%] px-3 py-2.5 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest">Plan</th>
                    <th className="w-[22%] px-3 py-2.5 text-left text-[9px] font-black text-gray-400 uppercase tracking-widest hidden lg:table-cell">Description</th>
                    <th className="w-[11%] px-3 py-2.5 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">Gross</th>
                    <th className="w-[10%] px-3 py-2.5 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest hidden md:table-cell">Fee</th>
                    <th className="w-[11%] px-3 py-2.5 text-right text-[9px] font-black text-gray-400 uppercase tracking-widest">Net</th>
                    <th className="w-[10%] px-3 py-2.5 text-center text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {incomeLoading && incomeTransactions.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-400"><RefreshCw size={24} className="mx-auto animate-spin mb-2" /> Loading transactions…</td></tr>
                  ) : incomeTransactions.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12">
                      <FileText size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm font-bold text-gray-400">No transactions found</p>
                      <p className="text-xs text-gray-400 mt-1">Try adjusting the date range</p>
                    </td></tr>
                  ) : incomeTransactions.map(txn => (
                    <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-3 py-2 text-xs font-bold dark:text-gray-300 truncate">
                        {new Date(txn.date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-2 text-xs font-bold dark:text-gray-300 truncate">{txn.restaurantName}</td>
                      <td className="px-3 py-2">
                        {txn.planName !== '—' ? (
                          <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            txn.planId === 'pro_plus' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600' :
                            txn.planId === 'pro' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-500'
                          }`}>{txn.planName}</span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs dark:text-gray-300 truncate hidden lg:table-cell">{txn.description}</td>
                      <td className="px-3 py-2 text-xs font-bold dark:text-gray-300 text-right">{txn.amount.toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs text-red-400 text-right hidden md:table-cell">-{txn.fee.toFixed(2)}</td>
                      <td className="px-3 py-2 text-xs font-black text-orange-500 text-right">{txn.net.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          txn.status === 'succeeded' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' :
                          txn.status === 'failed' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                          'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600'
                        }`}>
                          <CheckCircle2 size={10} /> {txn.status === 'succeeded' ? 'Success' : txn.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Load More */}
              {incomeHasMore && (
                <div className="p-4 border-t dark:border-gray-700 text-center">
                  <button onClick={() => fetchIncome(true)} disabled={incomeLoading} className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto">
                    {incomeLoading ? <><RefreshCw size={14} className="animate-spin" /> Loading…</> : 'Load More Transactions'}
                  </button>
                </div>
              )}
            </div>
          </div>
            )}
          </div>
        )}

        {activeTab === 'CASHOUT' && (
          <div className="p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-xl font-black dark:text-white uppercase tracking-tighter flex items-center gap-2">
                  <Wallet size={20} className="text-orange-500" />
                  Cashout Requests
                </h2>
                <p className="text-xs text-gray-400 mt-1">Manage vendor withdrawal requests. Approve, complete, or reject cashouts.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAdminCashouts}
                  disabled={adminCashoutsLoading}
                  className="px-4 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-xs hover:bg-orange-600 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={adminCashoutsLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 border dark:border-gray-600 shadow-sm mb-6 overflow-x-auto hide-scrollbar w-fit">
              {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => { setAdminCashoutFilter(f); if (adminCashouts.length === 0) fetchAdminCashouts(); }}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    adminCashoutFilter === f
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {adminCashoutsLoading && adminCashouts.length === 0 ? (
              <div className="text-center py-20">
                <RefreshCw size={24} className="mx-auto text-gray-300 animate-spin mb-3" />
                <p className="text-sm text-gray-400 font-bold">Loading cashout requests...</p>
              </div>
            ) : (() => {
              const filtered = adminCashoutFilter === 'all' ? adminCashouts : adminCashouts.filter(c => c.status === adminCashoutFilter);
              if (filtered.length === 0) {
                return (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-20 text-center border border-dashed border-gray-300 dark:border-gray-700">
                    <Wallet size={32} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-sm font-black dark:text-white mb-1">No Cashout Requests</p>
                    <p className="text-[10px] text-gray-400">
                      {adminCashouts.length === 0 ? 'Click Refresh to load requests.' : `No ${adminCashoutFilter} requests found.`}
                    </p>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  {filtered.map((req: any) => (
                    <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            req.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                            req.status === 'approved' ? 'bg-blue-100 dark:bg-blue-900/30' :
                            req.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                            'bg-red-100 dark:bg-red-900/30'
                          }`}>
                            <Banknote size={18} className={
                              req.status === 'pending' ? 'text-yellow-600' :
                              req.status === 'approved' ? 'text-blue-600' :
                              req.status === 'completed' ? 'text-green-600' :
                              'text-red-600'
                            } />
                          </div>
                          <div>
                            <p className="text-sm font-black dark:text-white">{req.restaurantName}</p>
                            <p className="text-lg font-black text-orange-500">RM{Number(req.amount).toFixed(2)}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-[9px] text-gray-400">
                                {req.bank_name} — {req.account_holder_name} — •••{req.account_number?.slice(-4)}
                              </span>
                              <span className="text-[9px] text-gray-400">
                                {new Date(req.created_at).toLocaleDateString()} {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {req.notes && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic">Note: {req.notes}</p>
                            )}
                            {req.admin_notes && (
                              <p className="text-[10px] text-blue-500 mt-1 italic">Admin: {req.admin_notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                            req.status === 'pending' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            req.status === 'approved' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                            req.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                            'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {req.status}
                          </span>
                          {req.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleUpdateCashout(req.id, 'approved')}
                                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-1"
                              >
                                <CheckCircle size={12} /> Approve
                              </button>
                              <button
                                onClick={() => handleUpdateCashout(req.id, 'rejected')}
                                className="px-3 py-1.5 bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-red-200 transition-all flex items-center gap-1"
                              >
                                <X size={12} /> Reject
                              </button>
                            </>
                          )}
                          {req.status === 'approved' && (
                            <button
                              onClick={() => handleUpdateCashout(req.id, 'completed', 'Funds transferred')}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-green-600 transition-all flex items-center gap-1"
                            >
                              <Send size={12} /> Mark Transferred
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'SYSTEM' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-8 pb-0 md:pb-0">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-1">System</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-widest">System status, feature images, and tools.</p>
                </div>
                <button
                  onClick={() => setShowPitchDeck(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25"
              >
                <FileText size={16} /> Pitch Deck
              </button>
              </div>

              {/* Document-style tab bar */}
              <div className="flex gap-0 relative">
                {([
                  { id: 'STATUS' as const, label: 'System Status', icon: <Activity size={13} /> },
                  { id: 'FEATURE_IMAGES' as const, label: 'Feature Images', icon: <ImageIcon size={13} /> },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSystemSubTab(tab.id)}
                    style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                    className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                      systemSubTab === tab.id
                        ? 'bg-white dark:bg-gray-800 text-orange-500 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-orange-500 z-10'
                        : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {/* Sub-tab content */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm p-5 md:p-6 rounded-b-2xl rounded-tr-2xl">

            {systemSubTab === 'STATUS' && <SystemStatusDashboard />}

            {systemSubTab === 'FEATURE_IMAGES' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black dark:text-white uppercase tracking-tight">Feature Images</h3>
                    <p className="text-xs text-gray-400 mt-1">Upload images for partner carousel and add-on features</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={featureImageCategory}
                      onChange={e => setFeatureImageCategory(e.target.value)}
                      className="px-3 py-2.5 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl text-xs font-bold dark:text-white outline-none"
                    >
                      <option value="partner">Partner Logos</option>
                      <option value="backoffice">Back Office</option>
                      <option value="table">Table Management</option>
                      <option value="qr">QR Ordering</option>
                      <option value="tableside">Tableside Ordering</option>
                      <option value="kitchen">Kitchen Display</option>
                      <option value="customer-display">Customer Display</option>
                      <option value="online-shop">Online Shop</option>
                    </select>
                    <button
                      onClick={() => featureFileRef.current?.click()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25"
                    >
                      <Upload size={16} /> Add Image
                    </button>
                  </div>
                  <input type="file" ref={featureFileRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) setFeatureCropFile(f); e.target.value = ''; }} />
                </div>

                {/* Category filter tabs */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'partner', label: 'Partner Logos' },
                    { id: 'backoffice', label: 'Back Office' },
                    { id: 'table', label: 'Table Mgmt' },
                    { id: 'qr', label: 'QR Ordering' },
                    { id: 'tableside', label: 'Tableside' },
                    { id: 'kitchen', label: 'Kitchen' },
                    { id: 'customer-display', label: 'Customer Display' },
                    { id: 'online-shop', label: 'Online Shop' },
                  ].map(cat => {
                    const count = cat.id === 'all' ? featureImages.length : featureImages.filter(fi => (fi.category || 'partner') === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setFeatureImageCategory(cat.id === 'all' ? 'partner' : cat.id)}
                        className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                          (cat.id === 'all' && featureImageCategory === 'partner') || featureImageCategory === cat.id
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {cat.label}
                        {count > 0 && <span className="text-[8px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 rounded-full px-1.5 py-0.5">{count}</span>}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const filtered = featureImages.filter(fi => (fi.category || 'partner') === featureImageCategory);
                  return isLoadingFeatureImages ? (
                    <div className="text-center py-12 text-gray-400"><RefreshCw size={24} className="mx-auto animate-spin mb-2" /> Loading…</div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                      <ImageIcon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-sm font-bold text-gray-400">No images in this category</p>
                      <p className="text-xs text-gray-400 mt-1">Select a category above and click "Add Image" to upload</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {filtered.map((fi) => (
                        <div key={fi.id} className="group relative bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 p-4 flex flex-col items-center gap-3 hover:border-orange-500/50 transition-all">
                          <div className={`flex items-center justify-center w-full h-20 ${
                            fi.crop_shape === 'circle' ? 'rounded-full' : 'rounded-lg'
                          } overflow-hidden bg-white dark:bg-gray-900`}>
                            <img src={fi.url} alt={fi.alt} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider text-center">
                            {fi.display_width}×{fi.display_height} · {fi.crop_shape}
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            {fi.category || 'partner'}
                          </span>
                          <button
                            onClick={() => deleteFeatureImage(fi.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 dark:hover:bg-red-900/40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {/* Feature Image Crop Modal */}
        {featureCropFile && (
          <ImageCropModal
            imageFile={featureCropFile}
            onCrop={handleFeatureImageCropped}
            onCancel={() => setFeatureCropFile(null)}
          />
        )}

        {/* Pitch Deck Modal */}
        {showPitchDeck && <PitchDeck onClose={() => setShowPitchDeck(false)} />}

        </div>
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
                 <input required type="text" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm" value={formVendor.restaurantName} onChange={e => {
                   const name = e.target.value;
                   const updates: any = { restaurantName: name };
                   if (formVendor.location === 'QuickServe Hub') updates.slug = generateSlug(name);
                   setFormVendor({...formVendor, ...updates});
                 }} />
               </div>
               <div>
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Assign to Hub</label>
                 <select required className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm appearance-none cursor-pointer" value={formVendor.location} onChange={e => {
                   const loc = e.target.value;
                   const updates: any = { location: loc };
                   if (loc === 'QuickServe Hub' && formVendor.restaurantName) updates.slug = generateSlug(formVendor.restaurantName);
                   else updates.slug = '';
                   setFormVendor({...formVendor, ...updates});
                 }}>
                   <option value="">Select a Hub</option>
                   {locations.filter(l => l.isActive !== false).map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                 </select>
               </div>

               {/* QR Slug (auto-generated) */}
               {formVendor.location === 'QuickServe Hub' && formVendor.slug && (
                 <div className="md:col-span-2">
                   <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/20">
                     <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">QR Link:</span>
                     <code className="text-[10px] font-bold text-gray-600 dark:text-gray-300">?r={formVendor.slug}</code>
                   </div>
                 </div>
               )}

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

               {/* Plan Selection */}
               <div className="md:col-span-2">
                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Plan</label>
                 <div className="flex bg-gray-50 dark:bg-gray-700 p-1 rounded-xl">
                   {PRICING_PLANS.map(plan => (
                     <button
                       key={plan.id}
                       type="button"
                       onClick={() => setFormVendor({...formVendor, planId: plan.id})}
                       className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                         formVendor.planId === plan.id 
                           ? 'bg-white dark:bg-gray-600 shadow-sm text-orange-500' 
                           : 'text-gray-400'
                       }`}
                     >
                       {plan.name}
                     </button>
                   ))}
                 </div>
                 <p className="text-[8px] text-gray-400 mt-1 ml-1">
                   Basic = POS only · Pro = POS + QR · Pro Plus = POS + QR + Kitchen
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

               <div className="md:col-span-2 pt-4 flex gap-3">
                  <button type="submit" disabled={isSubmittingVendor} className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">{isSubmittingVendor ? <><RefreshCw size={16} className="animate-spin" /> Saving...</> : 'Save Changes'}</button>
                  {editingVendor && (
                    <button type="button" disabled={isSubmittingVendor} onClick={async () => {
                      if (!confirm(`Are you sure you want to permanently delete "${editingVendor.res.name}"? This will remove the vendor, restaurant, and all menu items. This action cannot be undone.`)) return;
                      setIsSubmittingVendor(true);
                      try {
                        await onDeleteVendor(editingVendor.user.id, editingVendor.res.id);
                        setEditingVendor(null);
                        setIsModalOpen(false);
                      } catch (e) {
                        // error toast handled by parent
                      } finally {
                        setIsSubmittingVendor(false);
                      }
                    }} className="py-4 px-6 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
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
                <div>
                   <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Short Code</label>
                   <input required type="text" maxLength={3} placeholder="e.g. SF" className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl outline-none font-bold dark:text-white text-sm uppercase" value={formArea.code} onChange={e => setFormArea({...formArea, code: e.target.value.toUpperCase()})} />
                </div>
                <div className="pt-4 flex gap-4">
                   {editingArea && (
                     <button type="button" onClick={async () => { if(confirm('Delete Hub?')) { setIsSubmittingArea(true); try { await onDeleteLocation(editingArea.id); setIsAreaModalOpen(false); } catch (error) { console.error('Error deleting hub:', error); } finally { setIsSubmittingArea(false); } } }} disabled={isSubmittingArea} className="p-3 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"><Trash2 size={24} /></button>
                   )}
                   <button type="submit" disabled={isSubmittingArea} className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">{isSubmittingArea ? <><RefreshCw size={16} className="animate-spin" /> Processing...</> : 'Confirm Hub Data'}</button>
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

      {/* Hub Vendors List Modal */}
      {viewingHubVendors && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative animate-in zoom-in fade-in duration-300">
            <button onClick={() => setViewingHubVendors(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            <h2 className="text-2xl font-black mb-1 dark:text-white uppercase tracking-tighter">Hub Vendors</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">{viewingHubVendors.name} — {viewingHubVendors.code}</p>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {(() => {
                const hubRestaurants = restaurants.filter(r => r.location === viewingHubVendors.name);
                if (hubRestaurants.length === 0) {
                  return (
                    <div className="text-center py-12 opacity-40">
                      <Store size={48} className="mx-auto mb-4 text-gray-300" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No vendors assigned to this hub</p>
                    </div>
                  );
                }
                return hubRestaurants.map(res => {
                  const vendor = vendors.find(v => v.restaurantId === res.id);
                  return (
                    <div key={res.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-2xl border dark:border-gray-700 group transition-all hover:bg-gray-100 dark:hover:bg-gray-700">
                      <div className="flex items-center gap-3">
                        {res.logo ? (
                          <img src={res.logo} alt={res.name} className="w-10 h-10 rounded-xl object-cover" />
                        ) : (
                          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/30 text-orange-500 rounded-xl flex items-center justify-center"><Store size={20} /></div>
                        )}
                        <div>
                          <span className="font-black dark:text-white text-sm block uppercase tracking-tight">{res.name}</span>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{vendor?.username || 'Unknown'}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remove "${res.name}" from ${viewingHubVendors.name}?`)) {
                            onRemoveVendorFromHub(res.id);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                        title="Remove from hub"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  );
                });
              })()}
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
