import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Role, Restaurant, Order, OrderStatus, CartItem, MenuItem, Area, ReportFilters, ReportResponse, PlatformAccess, QS_DEFAULT_HUB } from './src/types';
import CustomerView from './pages/CustomerView';
import AdminView from './pages/AdminView';
import PosOnlyView from './pages/PosOnlyView';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import MarketingPage from './pages/MarketingPage';
import { supabase } from './lib/supabase';
import { LogOut, Sun, Moon, MapPin, LogIn, Loader2 } from 'lucide-react';
import * as offlineQueue from './lib/offlineOrdersQueue';
import { toast } from './components/Toast';

/**
 * Generate a default 3-character order code from a restaurant name.
 * Takes initials of the first 3 words, or first 3 chars if single word.
 * Always uppercase, alpha-only.
 */
const generateDefaultOrderCode = (restaurantName: string): string => {
  const cleaned = restaurantName.replace(/[^a-zA-Z\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  let code: string;
  if (words.length >= 3) {
    code = words.slice(0, 3).map(w => w[0]).join('');
  } else if (words.length === 2) {
    code = words[0][0] + words[1].substring(0, 2);
  } else {
    code = (words[0] || 'QS').substring(0, 3);
  }
  return code.toUpperCase().padEnd(3, 'X');
};

/**
 * Resolve the order code for a restaurant. Priority:
 * 1. Custom orderCode from restaurant settings
 * 2. For QS_DEFAULT_HUB restaurants: auto-generated 3-char code from name
 * 3. For hub restaurants: the area/hub code
 * 4. Fallback: 'QS'
 */
const resolveOrderCode = (restaurant: Restaurant | undefined, areas: Area[]): string => {
  if (!restaurant) return 'QS';
  // Custom code set in settings takes top priority
  const customCode = restaurant.settings?.orderCode?.trim();
  if (customCode && customCode.length >= 2) return customCode.toUpperCase();
  // QS_DEFAULT_HUB restaurants get a unique auto-generated code
  if (restaurant.location === QS_DEFAULT_HUB) {
    return generateDefaultOrderCode(restaurant.name);
  }
  // Hub restaurants use the area code
  const area = areas.find(l => l.name === restaurant.location);
  return area?.code || 'QS';
};

const App: React.FC = () => {
  // --- HYDRATED STATE ---
  const [allUsers, setAllUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('qs_cache_users');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => {
    try {
      const saved = localStorage.getItem('qs_cache_restaurants');
      let res: Restaurant[] = saved ? JSON.parse(saved) : [];
      // Merge with local settings
      return res.map(r => {
        const localSettings = localStorage.getItem(`qs_settings_${r.id}`);
        if (localSettings) {
          return { ...r, settings: JSON.parse(localSettings) };
        }
        return r;
      });
    } catch { return []; }
  });
  
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('qs_cache_orders');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [locations, setLocations] = useState<Area[]>(() => {
    try {
      const saved = localStorage.getItem('qs_cache_locations');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [isLoading, setIsLoading] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const savedView = localStorage.getItem('qs_view');
      // If marketing, we don't need to load anything initially
      if (!savedView && !params.get('loc')) return false;

      const hasRes = localStorage.getItem('qs_cache_restaurants');
      const hasLoc = localStorage.getItem('qs_cache_locations');
      return !(hasRes && hasLoc);
    } catch { return true; }
  });

  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  
  // --- STATUS PRIORITY (prevents stale realtime events from regressing order status) ---
  const STATUS_PRIORITY: Record<string, number> = {
    [OrderStatus.PENDING]: 0,
    [OrderStatus.ONGOING]: 1,
    [OrderStatus.SERVED]: 2,
    [OrderStatus.COMPLETED]: 3,
    [OrderStatus.CANCELLED]: 3,
  };

  // --- TRANSACTION LOCKS ---
  const lockedOrderIds = useRef<Set<string>>(new Set());
  const isStatusLocked = useRef<boolean>(false);
  const isFetchingRef = useRef(false);
  const lastOrderTimestampRef = useRef<number>(0);
  const syncOfflineOrdersRef = useRef<() => Promise<void>>(async () => {});
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('qs_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  
  const [currentRole, setCurrentRole] = useState<Role | null>(() => {
    return localStorage.getItem('qs_role') as Role | null;
  });
  
  const [globalError, setGlobalError] = useState<{
    message: string;
    stack?: string;
    timestamp: number;
  } | null>(null);

  // Global error handler
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('GLOBAL ERROR CAUGHT:', event.error);
      setGlobalError({
        message: event.message || 'Unknown error occurred',
        stack: event.error?.stack,
        timestamp: Date.now(),
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('UNHANDLED PROMISE REJECTION:', event.reason);
      setGlobalError({
        message: String(event.reason?.message || event.reason || 'Unhandled promise rejection'),
        stack: event.reason?.stack,
        timestamp: Date.now(),
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Keep syncOfflineOrders ref up to date so event listeners always call the latest version
  useEffect(() => { syncOfflineOrdersRef.current = syncOfflineOrders; });

  // Online/Offline status listener
  useEffect(() => {
    const unsubscribe = offlineQueue.onOnlineStatusChange((isOnlineNow) => {
      setIsOnline(isOnlineNow);
      if (isOnlineNow) {
        // Try to sync offline orders when back online
        syncOfflineOrdersRef.current();
      }
    });

    // Update pending count on mount
    setPendingOfflineOrdersCount(offlineQueue.getUnsyncedOrders().length);

    // If already online on mount with pending orders, trigger sync
    if (navigator.onLine && offlineQueue.getUnsyncedOrders().length > 0) {
      syncOfflineOrdersRef.current();
    }

    return unsubscribe;
  }, []);
  
  const [view, setView] = useState<'LANDING' | 'LOGIN' | 'APP' | 'MARKETING' | 'POS'>(() => {
    const savedView = localStorage.getItem('qs_view') as any;
    const savedRole = localStorage.getItem('qs_role');
    const params = new URLSearchParams(window.location.search);
    
    // If no session and no params, show marketing page as the first impression
    if (!savedView && !params.get('loc')) {
      return 'MARKETING';
    }

    // If it's a customer and we're at the root without params, always show landing
    if (savedRole === 'CUSTOMER' && !params.get('loc')) {
      return 'LANDING';
    }
    
    return savedView || 'LANDING';
  });
  
  const [sessionLocation, setSessionLocation] = useState<string | null>(() => {
    return localStorage.getItem('qs_session_location');
  });
  
  const [sessionTable, setSessionTable] = useState<string | null>(() => {
    return localStorage.getItem('qs_session_table');
  });

  const [sessionRestaurantId, setSessionRestaurantId] = useState<string | null>(() => {
    return localStorage.getItem('qs_session_restaurant_id');
  });

  const [sessionRestaurantSlug, setSessionRestaurantSlug] = useState<string | null>(() => {
    return localStorage.getItem('qs_session_restaurant_slug');
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOfflineOrdersCount, setPendingOfflineOrdersCount] = useState(0);

  const persistCache = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn("Storage quota exceeded.");
    }
  };

  const parseTimestamp = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts === 'string') {
      if (/^\d+$/.test(ts)) return parseInt(ts, 10);
      const date = new Date(ts);
      const time = date.getTime();
      return isNaN(time) ? Date.now() : time;
    }
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'bigint') return Number(ts);
    return Date.now();
  };

  const fetchUsers = useCallback(async () => {
    // Only fetch users if the user is an admin
    if (currentRole !== 'ADMIN') return;
    
    const { data, error } = await supabase.from('users').select('id, username, role, restaurant_id, is_active, email, phone');
    if (!error && data) {
      const mapped = data.map(u => ({
        id: u.id, 
        username: u.username, 
        role: u.role as Role,
        restaurantId: u.restaurant_id,
        isActive: u.is_active, 
        email: u.email, 
        phone: u.phone
      }));
      setAllUsers(mapped);
      persistCache('qs_cache_users', mapped);
    }
  }, [currentRole]);

  const fetchLocations = useCallback(async () => {
    const { data, error } = await supabase.from('areas').select('*').order('name');
    if (!error && data) {
      const mapped = data.map(l => ({
        id: l.id, name: l.name, city: l.city, state: l.state, code: l.code, isActive: l.is_active ?? true
      }));
      setLocations(mapped);
      persistCache('qs_cache_locations', mapped);
    }
  }, []);

  const fetchRestaurants = useCallback(async () => {
    if (isStatusLocked.current || !currentRole) return;
    
    let query = supabase.from('restaurants').select('*');
    
    if (currentRole === 'CUSTOMER' && sessionRestaurantSlug) {
      query = query.eq('slug', sessionRestaurantSlug).eq('is_online', true);
    } else if (currentRole === 'CUSTOMER' && sessionRestaurantId) {
      query = query.eq('id', sessionRestaurantId).eq('is_online', true);
    } else if (currentRole === 'CUSTOMER' && sessionLocation) {
      query = query.eq('location_name', sessionLocation).eq('is_online', true);
    }

    const { data: resData, error: resError } = await query;
    if (resError || !resData) return;

    const restaurantIds = resData.map(r => r.id);
    let menuQuery = supabase.from('menu_items').select('*').in('restaurant_id', restaurantIds);
    
    if (currentRole === 'CUSTOMER') {
      menuQuery = menuQuery.eq('is_archived', false);
    }

    const { data: menuData, error: menuError } = await menuQuery;

    if (!menuError && menuData) {
      const formatted: Restaurant[] = resData.map(res => ({
        id: res.id, 
        name: res.name, 
        logo: res.logo, 
        vendorId: res.vendor_id,
        location: res.location_name, 
        created_at: res.created_at,
        isOnline: res.is_online === true || res.is_online === null,
        platformAccess: (res.platform_access as PlatformAccess) || 'pos_and_kitchen',
        slug: res.slug || '',
        settings: (() => {
          const localSettings = localStorage.getItem(`qs_settings_${res.id}`);
          const dbSettings = res.settings ? (typeof res.settings === 'string' ? JSON.parse(res.settings) : res.settings) : null;
          return localSettings ? JSON.parse(localSettings) : dbSettings;
        })(),
        categories: res.categories || [],
        modifiers: res.modifiers || [],
        menu: menuData.filter(m => m.restaurant_id === res.id).map(m => {
          const temp = m.temp_options || {};
          const others = m.other_variants || {};
          const addOns = m.add_ons || [];
          
          return {
            id: m.id, name: m.name, description: m.description, price: Number(m.price),
            image: m.image, category: m.category, isArchived: m.is_archived,
            sizes: m.sizes,
            tempOptions: {
              enabled: temp.enabled ?? false,
              hot: temp.hot ?? 0,
              cold: temp.cold ?? 0,
              options: Array.isArray(temp.options) ? temp.options : (temp.enabled ? [
                ...(temp.hot !== undefined ? [{ name: 'Hot', price: temp.hot ?? 0 }] : []),
                ...(temp.cold !== undefined ? [{ name: 'Cold', price: temp.cold ?? 0 }] : []),
              ] : []),
            },
            variantOptions: others.variantOptions ? {
              enabled: others.variantOptions.enabled ?? false,
              options: Array.isArray(others.variantOptions.options) ? others.variantOptions.options : [],
            } : { enabled: false, options: [] },
            otherVariantName: others.name || '',
            otherVariants: others.options || [],
            otherVariantsEnabled: others.enabled ?? false,
            linkedModifiers: others.linkedModifiers || (others.enabled && others.name ? [others.name] : []),
            addOns: addOns
          };
        })
      }));
      setRestaurants(formatted);
      persistCache('qs_cache_restaurants', formatted);
    }
  }, [currentRole, sessionLocation, sessionRestaurantId, sessionRestaurantSlug]);

  const fetchOrders = useCallback(async () => {
    if (isFetchingRef.current || !currentRole) return;
    isFetchingRef.current = true;
    try {
      let query = supabase.from('orders').select('*').order('timestamp', { ascending: false }).limit(200);
      
      if (currentRole === 'CUSTOMER') {
        if (sessionLocation && sessionTable) {
          query = query.eq('location_name', sessionLocation).eq('table_number', sessionTable).limit(10);
        } else {
          isFetchingRef.current = false;
          return;
        }
      } else if (currentRole === 'VENDOR' && currentUser?.restaurantId) {
        query = query.eq('restaurant_id', currentUser.restaurantId);
      }

      const { data, error } = await query;
      if (!error && data) {
        setOrders(prev => {
          const mapped = data.map(o => {
            const mappedOrder: Order = {
              id: o.id, 
              items: Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items) : []), 
              total: Number(o.total || 0),
              status: o.status as OrderStatus, 
              timestamp: parseTimestamp(o.timestamp),
              customerId: o.customer_id, 
              restaurantId: o.restaurant_id,
              tableNumber: o.table_number, 
              locationName: o.location_name,
              remark: o.remark, 
              rejectionReason: o.rejection_reason, 
              rejectionNote: o.rejection_note,
              paymentMethod: o.payment_method,
              cashierName: o.cashier_name,
              amountReceived: o.amount_received != null ? Number(o.amount_received) : undefined,
              changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined
            };
            const localOrder = prev.find(p => p.id === o.id);
            if (localOrder) {
              // If locked, keep local status entirely
              if (lockedOrderIds.current.has(o.id)) {
                mappedOrder.status = localOrder.status;
                mappedOrder.paymentMethod = localOrder.paymentMethod;
                mappedOrder.cashierName = localOrder.cashierName;
                mappedOrder.amountReceived = localOrder.amountReceived;
                mappedOrder.changeAmount = localOrder.changeAmount;
              } else {
                // Even without a lock, never regress status
                const localPriority = STATUS_PRIORITY[localOrder.status] ?? 0;
                const dbPriority = STATUS_PRIORITY[mappedOrder.status] ?? 0;
                if (dbPriority < localPriority) {
                  mappedOrder.status = localOrder.status;
                  mappedOrder.paymentMethod = localOrder.paymentMethod ?? mappedOrder.paymentMethod;
                  mappedOrder.cashierName = localOrder.cashierName ?? mappedOrder.cashierName;
                  mappedOrder.amountReceived = localOrder.amountReceived ?? mappedOrder.amountReceived;
                  mappedOrder.changeAmount = localOrder.changeAmount ?? mappedOrder.changeAmount;
                }
              }
            }
            return mappedOrder;
          });

          if (mapped.length > 0) {
            const maxTs = Math.max(...mapped.map(o => o.timestamp));
            if (maxTs > lastOrderTimestampRef.current) {
              lastOrderTimestampRef.current = maxTs;
            }
          }

          persistCache('qs_cache_orders', mapped);
          return mapped;
        });
      }
    } catch (e) {
      console.error("Fetch orders failed", e);
    } finally {
      isFetchingRef.current = false;
    }
  }, [currentRole, sessionLocation, sessionTable, currentUser]);

  const fetchNewOrders = useCallback(async () => {
    if (isFetchingRef.current) return;
    const savedUser = localStorage.getItem('qs_user');
    if (!savedUser) return;
    const user = JSON.parse(savedUser);
    if (user.role !== 'VENDOR' || !user.restaurantId) return;

    isFetchingRef.current = true;
    try {
      const { data, error } = await supabase.from('orders')
        .select('*')
        .eq('restaurant_id', user.restaurantId)
        .gt('timestamp', lastOrderTimestampRef.current)
        .order('timestamp', { ascending: false });

      if (!error && data && data.length > 0) {
        const newMapped = data.map(o => ({
          id: o.id,
          items: Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items) : []),
          total: Number(o.total || 0),
          status: o.status as OrderStatus,
          timestamp: parseTimestamp(o.timestamp),
          customerId: o.customer_id,
          restaurantId: o.restaurant_id,
          tableNumber: o.table_number,
          locationName: o.location_name,
          remark: o.remark,
          rejectionReason: o.rejection_reason,
          rejectionNote: o.rejection_note,
          paymentMethod: o.payment_method,
          cashierName: o.cashier_name,
          amountReceived: o.amount_received != null ? Number(o.amount_received) : undefined,
          changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined
        }));

        setOrders(prev => {
          const filteredNew = newMapped.filter(n => !prev.some(p => p.id === n.id));
          if (filteredNew.length === 0) return prev;
          const updated = [...filteredNew, ...prev].slice(0, 200);
          persistCache('qs_cache_orders', updated);
          
          const maxTs = Math.max(...updated.map(o => o.timestamp));
          if (maxTs > lastOrderTimestampRef.current) {
            lastOrderTimestampRef.current = maxTs;
          }
          
          return updated;
        });
        setLastSyncTime(new Date());
      }
    } catch (e) {
      console.error("Fetch new orders failed", e);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Combined refresh function to ensure heartbeat works reliably
  const refreshAppData = useCallback(async () => {
    await Promise.allSettled([fetchOrders(), fetchRestaurants()]);
    setLastSyncTime(new Date());
  }, [fetchOrders, fetchRestaurants]);

  // QR Redirection Logic
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loc = params.get('loc');
    const restaurantId = params.get('restaurant');
    const restaurantSlug = params.get('r');
    const table = params.get('table');
    if (restaurantSlug && table) {
      // Short slug QR — e.g. ?r=burger-palace&table=1
      setSessionRestaurantSlug(restaurantSlug);
      setSessionRestaurantId(null);
      setSessionTable(table);
      setSessionLocation(null);
      setCurrentRole('CUSTOMER');
      setView('APP');
      localStorage.setItem('qs_role', 'CUSTOMER');
      localStorage.setItem('qs_view', 'APP');
      localStorage.setItem('qs_session_restaurant_slug', restaurantSlug);
      localStorage.setItem('qs_session_table', table);
      localStorage.removeItem('qs_session_restaurant_id');
      localStorage.removeItem('qs_session_location');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (restaurantId && table) {
      // Legacy full UUID QR
      setSessionRestaurantId(restaurantId);
      setSessionRestaurantSlug(null);
      setSessionTable(table);
      setSessionLocation(null);
      setCurrentRole('CUSTOMER');
      setView('APP');
      localStorage.setItem('qs_role', 'CUSTOMER');
      localStorage.setItem('qs_view', 'APP');
      localStorage.setItem('qs_session_restaurant_id', restaurantId);
      localStorage.setItem('qs_session_table', table);
      localStorage.removeItem('qs_session_restaurant_slug');
      localStorage.removeItem('qs_session_location');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (loc && table) {
      setSessionLocation(loc);
      setSessionTable(table);
      setSessionRestaurantId(null);
      setCurrentRole('CUSTOMER');
      setView('APP');
      localStorage.setItem('qs_role', 'CUSTOMER');
      localStorage.setItem('qs_view', 'APP');
      localStorage.setItem('qs_session_location', loc);
      localStorage.setItem('qs_session_table', table);
      localStorage.removeItem('qs_session_restaurant_id');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Compute active vendor and current area early for hooks
  const activeVendorRes = currentUser?.role === 'VENDOR' ? restaurants.find(r => r.id === currentUser.restaurantId) : null;
  const currentArea = locations.find(l => l.name === sessionLocation);

  // Global Data Initialization
  useEffect(() => {
    const initApp = async () => {
      await Promise.allSettled([fetchUsers(), fetchLocations(), fetchRestaurants(), fetchOrders()]);
       // Initialize order tracker from DB to ensure offline orders use correct sequence
       await initializeOrderNumberTracker();
      setLastSyncTime(new Date());
      setIsLoading(false);
    };
    initApp();
  }, [fetchUsers, fetchLocations, fetchRestaurants, fetchOrders]);
  
    // Initialize tracker when user logs in (for CASHIER/VENDOR roles)
    useEffect(() => {
      if (currentRole === 'CASHIER' || currentRole === 'VENDOR') {
        console.log(`[TRACKER] User logged in/switched role to ${currentRole}, initializing tracker`);
        initializeOrderNumberTracker();
      }
    }, [currentUser?.restaurantId, currentRole]);

  // Real-time Subscriptions
  useEffect(() => {
    // Determine filter based on role
    let orderFilter = undefined;
    if (currentRole === 'CUSTOMER' && sessionLocation) {
      orderFilter = `location_name=eq.${sessionLocation}`;
    } else if (currentRole === 'VENDOR' && currentUser?.restaurantId) {
      orderFilter = `restaurant_id=eq.${currentUser.restaurantId}`;
    }

    const channel = supabase.channel('qs-realtime-optimized')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'orders',
        filter: orderFilter
      }, (payload) => {
        const o = payload.new;
        const mappedOrder: Order = {
          id: o.id, 
          items: Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items) : []), 
          total: Number(o.total || 0),
          status: o.status as OrderStatus, 
          timestamp: parseTimestamp(o.timestamp),
          customerId: o.customer_id, 
          restaurantId: o.restaurant_id,
          tableNumber: o.table_number, 
          locationName: o.location_name,
          remark: o.remark, 
          rejectionReason: o.rejection_reason, 
          rejectionNote: o.rejection_note,
          paymentMethod: o.payment_method,
          cashierName: o.cashier_name,
          amountReceived: o.amount_received != null ? Number(o.amount_received) : undefined,
          changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined
        };
        
        setOrders(prev => {
          if (prev.some(existing => existing.id === mappedOrder.id)) return prev;
          const updated = [mappedOrder, ...prev].slice(0, 200);
          persistCache('qs_cache_orders', updated);
          if (mappedOrder.timestamp > lastOrderTimestampRef.current) {
            lastOrderTimestampRef.current = mappedOrder.timestamp;
          }
          return updated;
        });
        setLastSyncTime(new Date());
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'orders',
        filter: orderFilter
      }, (payload) => {
        const o = payload.new;
        setOrders(prev => {
          const updated = prev.map(existing => {
            if (existing.id === o.id) {
              const incomingStatus = o.status as OrderStatus;

              // If locked, only accept updates that match or advance the status
              if (lockedOrderIds.current.has(o.id)) {
                if (existing.status === incomingStatus) {
                  // Confirmed — clear lock and accept update
                  lockedOrderIds.current.delete(o.id);
                } else {
                  // Still locked and status doesn't match — keep local state
                  return existing;
                }
              }

              // Prevent stale realtime events from regressing order status
              const existingPriority = STATUS_PRIORITY[existing.status] ?? 0;
              const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
              if (incomingPriority < existingPriority) {
                return existing; // Never go backwards
              }

              return {
                ...existing,
                status: incomingStatus,
                rejectionReason: o.rejection_reason,
                rejectionNote: o.rejection_note,
                paymentMethod: o.payment_method ?? existing.paymentMethod,
                cashierName: o.cashier_name ?? existing.cashierName,
                amountReceived: o.amount_received != null ? Number(o.amount_received) : existing.amountReceived,
                changeAmount: o.change_amount != null ? Number(o.change_amount) : existing.changeAmount,
              };
            }
            return existing;
          });
          persistCache('qs_cache_orders', updated);
          return updated;
        });
        setLastSyncTime(new Date());
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'restaurants',
        filter: currentRole === 'CUSTOMER' && sessionLocation ? `location_name=eq.${sessionLocation}` : undefined
      }, (payload) => {
        const res = payload.new;
        const newSettings = res.settings ? (typeof res.settings === 'string' ? JSON.parse(res.settings) : res.settings) : undefined;
        setRestaurants(prev => {
          const updated = prev.map(r => r.id === res.id ? {
            ...r,
            isOnline: res.is_online === true || res.is_online === null,
            ...(newSettings !== undefined ? { settings: newSettings } : {}),
          } : r);
          persistCache('qs_cache_restaurants', updated);
          return updated;
        });
        setLastSyncTime(new Date());
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [currentRole, sessionLocation, currentUser]);

  // Vendor Polling Fallback (poll for all vendors since kitchen/QR features are now dynamic toggles)
  useEffect(() => {
    let interval: any;
    const shouldPoll = currentRole === 'VENDOR';
    
    if (shouldPoll) {
      // Initial fetch to ensure we have the latest before polling
      fetchNewOrders();
      interval = setInterval(() => {
        fetchNewOrders();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentRole, fetchNewOrders]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleScanSimulation = (locationName: string, tableNo: string) => {
    setSessionLocation(locationName);
    setSessionTable(tableNo);
    setCurrentRole('CUSTOMER');
    setView('APP');
    localStorage.setItem('qs_role', 'CUSTOMER');
    localStorage.setItem('qs_view', 'APP');
    localStorage.setItem('qs_session_location', locationName);
    localStorage.setItem('qs_session_table', tableNo);
  };

  const placeOrder = async (remark: string) => {
    if (cart.length === 0) return;
    const uniqueRestaurantIdsInCart = Array.from(new Set(cart.map(item => item.restaurantId)));
    const offlineRestaurants = uniqueRestaurantIdsInCart
      .map(rid => restaurants.find(r => r.id === rid))
      .filter(res => !res || res.isOnline === false);

    if (offlineRestaurants.length > 0) {
      toast(`Error: The following kitchen(s) are currently offline: ${offlineRestaurants.map(r => r?.name).join(', ')}. Please remove these items from your cart.`, 'warning');
      return;
    }

    // Build orders per restaurant, each with its own unique order code
    const ordersToInsert: any[] = [];
    const orderIds: string[] = [];

    for (const rid of uniqueRestaurantIdsInCart) {
      const res = restaurants.find(r => r.id === rid);
      const code = resolveOrderCode(res, locations);

      // Query last order for THIS restaurant with its specific code prefix
      let nextNum = 1;
      const { data: recentOrders } = await supabase.from('orders')
        .select('id')
        .eq('restaurant_id', rid)
        .ilike('id', `${code}%`)
        .order('id', { ascending: false })
        .limit(50);

      if (recentOrders && recentOrders.length > 0) {
        for (const order of recentOrders) {
          const num = offlineQueue.extractOrderNumber(order.id, code);
          if (num > 0) {
            nextNum = num + 1;
            break;
          }
        }
      }

      const orderId = `${code}${String(nextNum).padStart(7, '0')}`;
      const itemsForThisRestaurant = cart.filter(item => item.restaurantId === rid);
      const totalForThisRestaurant = itemsForThisRestaurant.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      ordersToInsert.push({
        id: orderId, items: itemsForThisRestaurant, total: totalForThisRestaurant,
        status: OrderStatus.PENDING, timestamp: Date.now(), customer_id: 'guest_user',
        restaurant_id: rid, table_number: sessionTable || 'N/A', location_name: sessionLocation || QS_DEFAULT_HUB,
        remark: remark
      });
      orderIds.push(orderId);
    }

    const { error } = await supabase.from('orders').insert(ordersToInsert);
    if (error) toast("Placement Error: " + error.message, 'error');
    else { setCart([]); toast(`Your order(s) have been placed! Reference: ${orderIds.join(', ')}`, 'success'); }
  };

  const handleLogin = (user: User) => {
    setIsLoading(true);
    setCurrentUser(user); 
    setCurrentRole(user.role); 
    setView('APP');
    localStorage.setItem('qs_user', JSON.stringify(user));
    localStorage.setItem('qs_role', user.role);
    localStorage.setItem('qs_view', 'APP');
  };

  const handleLogout = () => {
    setCurrentUser(null); 
    setCurrentRole(null); 
    setSessionLocation(null);
    setSessionTable(null);
    setSessionRestaurantId(null);
    setSessionRestaurantSlug(null);
    setView('LANDING'); 
    localStorage.removeItem('qs_user');
    localStorage.removeItem('qs_role');
    localStorage.removeItem('qs_view');
    localStorage.removeItem('qs_session_location');
    localStorage.removeItem('qs_session_table');
    localStorage.removeItem('qs_session_restaurant_id');
    localStorage.removeItem('qs_session_restaurant_slug');
    localStorage.removeItem('qs_cache_users');
    localStorage.removeItem('qs_cache_restaurants');
    localStorage.removeItem('qs_cache_orders');
    localStorage.removeItem('qs_cache_locations');
  };

  const handleClearSession = () => {
    setSessionLocation(null);
    setSessionTable(null);
    setSessionRestaurantId(null);
    setSessionRestaurantSlug(null);
    localStorage.removeItem('qs_session_location');
    localStorage.removeItem('qs_session_table');
    localStorage.removeItem('qs_session_restaurant_id');
    localStorage.removeItem('qs_session_restaurant_slug');
    localStorage.removeItem('qs_role');
    localStorage.removeItem('qs_view');
    setCurrentRole(null);
    setView('LANDING');
  };

  // Adapter for POS views — matches their onUpdateOrder prop signature
  const updateOrderForPos = (orderId: string, status: OrderStatus, paymentDetails?: { paymentMethod?: string; cashierName?: string; amountReceived?: number; changeAmount?: number }) => {
    updateOrderStatus(orderId, status, undefined, undefined, paymentDetails);
  };

  // FIXED: Updated updateOrderStatus to handle printing correctly
  const updateOrderStatus = async (orderId: string, status: OrderStatus, reason?: string, note?: string, paymentDetails?: { paymentMethod?: string; cashierName?: string; amountReceived?: number; changeAmount?: number }) => {
    // Don't lock if we're just marking as ONGOING (for printing)
    const shouldLock = status !== OrderStatus.ONGOING;
    
    if (shouldLock) {
      lockedOrderIds.current.add(orderId);
    }
    
    // Update local state immediately
    setOrders(prev => prev.map(o => o.id === orderId ? { 
      ...o, 
      status, 
      rejectionReason: reason, 
      rejectionNote: note,
      ...(paymentDetails ? {
        paymentMethod: paymentDetails.paymentMethod,
        cashierName: paymentDetails.cashierName,
        amountReceived: paymentDetails.amountReceived,
        changeAmount: paymentDetails.changeAmount,
      } : {}),
    } : o));
    
    // Update database
    await supabase.from('orders').update({ 
      status, 
      rejection_reason: reason, 
      rejection_note: note,
      ...(paymentDetails ? {
        payment_method: paymentDetails.paymentMethod,
        cashier_name: paymentDetails.cashierName,
        amount_received: paymentDetails.amountReceived,
        change_amount: paymentDetails.changeAmount,
      } : {}),
    }).eq('id', orderId);
    
    // Safety fallback: clear lock after 15s in case the realtime confirmation never arrives
    if (shouldLock) {
      setTimeout(() => lockedOrderIds.current.delete(orderId), 15000);
    }
  };

  const toggleVendorOnline = async (restaurantId: string, currentStatus: boolean) => {
    const res = restaurants.find(r => r.id === restaurantId);
    const vendor = allUsers.find(u => u.restaurantId === restaurantId);
    
    // If master activation is disabled, cannot turn online
    if (!currentStatus && vendor && vendor.isActive === false) {
      toast("Cannot turn online: Master Activation is disabled for this vendor.", 'warning');
      return;
    }

    const newStatus = !currentStatus;
    isStatusLocked.current = true;
    setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, isOnline: newStatus } : r));
    const { error } = await supabase.from('restaurants').update({ is_online: newStatus }).eq('id', restaurantId);
    if (error) fetchRestaurants();
    setTimeout(() => isStatusLocked.current = false, 3000);
  };

  const addToCart = (item: CartItem) => {
    const res = restaurants.find(r => r.id === item.restaurantId);
    if (res && res.isOnline === false) { toast("This kitchen is currently offline.", 'warning'); return; }
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id && i.selectedSize === item.selectedSize && i.selectedTemp === item.selectedTemp && i.selectedOtherVariant === item.selectedOtherVariant);
      if (existing) return prev.map(i => (i.id === item.id && i.selectedSize === item.selectedSize && i.selectedTemp === item.selectedTemp && i.selectedOtherVariant === item.selectedOtherVariant) ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      return prev.filter(i => i.id !== itemId);
    });
  };

  // --- MENU ITEM HANDLERS ---
  const handleUpdateMenuItem = async (restaurantId: string, item: MenuItem) => {
    const { error } = await supabase.from('menu_items').update({
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      category: item.category,
      is_archived: item.isArchived,
      sizes: item.sizes,
      temp_options: item.tempOptions || { enabled: false, hot: 0, cold: 0, options: [] },
      other_variants: {
        name: item.otherVariantName,
        options: item.otherVariants,
        enabled: item.otherVariantsEnabled,
        linkedModifiers: item.linkedModifiers || [],
        variantOptions: item.variantOptions || { enabled: false, options: [] }
      },
      add_ons: item.addOns || []
    }).eq('id', item.id);
    
    if (error) {
      toast("Error updating menu item: " + error.message, 'error');
      console.error("Update error:", error);
    } else {
      fetchRestaurants();
    }
  };

  const handleAddMenuItem = async (restaurantId: string, item: MenuItem) => {
    const { error } = await supabase.from('menu_items').insert({
      id: item.id,
      restaurant_id: restaurantId,
      name: item.name,
      description: item.description,
      price: item.price,
      image: item.image,
      category: item.category,
      is_archived: false,
      sizes: item.sizes,
      temp_options: item.tempOptions || { enabled: false, hot: 0, cold: 0, options: [] },
      other_variants: {
        name: item.otherVariantName,
        options: item.otherVariants,
        enabled: item.otherVariantsEnabled,
        linkedModifiers: item.linkedModifiers || [],
        variantOptions: item.variantOptions || { enabled: false, options: [] }
      },
      add_ons: item.addOns || []
    });
    
    if (error) {
      toast("Error adding menu item: " + error.message, 'error');
      console.error("Add error:", error);
    } else {
      fetchRestaurants();
    }
  };

  const handleDeleteMenuItem = async (restaurantId: string, itemId: string) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
    if (!error) fetchRestaurants();
  };

  // --- VENDOR & HUB HANDLERS (UPDATED with platformAccess) ---
  const handleAddVendor = async (user: User, restaurant: Restaurant) => {
    const userId = crypto.randomUUID();
    const resId = crypto.randomUUID();
    
    try {
      // STEP 1: Insert restaurant FIRST with NULL vendor_id (temporary)
      console.log("1. Inserting restaurant with NULL vendor_id...");
      const { error: resError } = await supabase.from('restaurants').insert({
        id: resId, 
        name: restaurant.name, 
        logo: restaurant.logo || 'https://picsum.photos/seed/default/200/200', 
        vendor_id: null,
        location_name: restaurant.location, 
        is_online: true,
        settings: {},
        platform_access: restaurant.platformAccess || 'pos_and_kitchen',
        slug: restaurant.slug || null
      });
      
      if (resError) { 
        toast("Error adding restaurant: " + resError.message, 'error');
        console.error("Restaurant error:", resError);
        return; 
      }
      
      console.log("2. Restaurant inserted successfully");
      
      // STEP 2: Insert user with the restaurant_id
      const { error: userError } = await supabase.from('users').insert({
        id: userId, 
        username: user.username, 
        password: user.password, 
        role: 'VENDOR',
        restaurant_id: resId,
        is_active: true, 
        email: user.email || '', 
        phone: user.phone || ''
      });
      
      if (userError) { 
        toast("Error adding user: " + userError.message, 'error');
        console.error("User error:", userError);
        
        // Rollback: delete the restaurant we just created
        await supabase.from('restaurants').delete().eq('id', resId);
        return; 
      }
      
      console.log("3. User inserted successfully");
      
      // STEP 3: Update restaurant with the correct vendor_id
      const { error: updateError } = await supabase
        .from('restaurants')
        .update({ vendor_id: userId })
        .eq('id', resId);
      
      if (updateError) {
        console.error("Update error:", updateError);
        toast("Restaurant created but couldn't link vendor. Please check manually.", 'warning');
      } else {
        console.log("4. Restaurant updated with vendor_id successfully");
        toast("Vendor added successfully!", 'success');
      }
      
      fetchUsers(); 
      fetchRestaurants();
      
    } catch (error) {
      console.error("Unexpected error:", error);
      toast("An unexpected error occurred", 'error');
    }
  };

  const handleUpdateVendor = async (user: User, restaurant: Restaurant) => {
    const userUpdate: any = {
      username: user.username,
      email: user.email,
      phone: user.phone,
      is_active: user.isActive
    };
    
    // Only update password if a new one is provided
    if (user.password) {
      userUpdate.password = user.password;
    }

    const { error: userError } = await supabase.from('users').update(userUpdate).eq('id', user.id);
    
    // If deactivating vendor, also set restaurant offline
    const resUpdate: any = {
      name: restaurant.name, 
      logo: restaurant.logo, 
      location_name: restaurant.location,
      platform_access: restaurant.platformAccess,
      slug: restaurant.slug || null
    };
    if (user.isActive === false) {
      resUpdate.is_online = false;
    }

    const { error: resError } = await supabase.from('restaurants').update(resUpdate).eq('id', restaurant.id);
    if (userError || resError) toast("Error updating vendor", 'error');
    fetchUsers(); fetchRestaurants();
  };

  const handleDeleteVendor = async (userId: string, restaurantId: string) => {
    try {
      if (restaurantId) {
        // Delete menu items first (foreign key dependency)
        await supabase.from('menu_items').delete().eq('restaurant_id', restaurantId);

        // Delete orders for the restaurant
        await supabase.from('orders').delete().eq('restaurant_id', restaurantId);

        // Delete the restaurant
        await supabase.from('restaurants').delete().eq('id', restaurantId);
      }

      // Delete the user
      const { error: userError } = await supabase.from('users').delete().eq('id', userId);
      if (userError) { toast('Error deleting user: ' + userError.message, 'error'); throw userError; }

      toast('Vendor deleted successfully!', 'success');
      fetchUsers(); fetchRestaurants();
    } catch (error: any) {
      console.error('Delete vendor error:', error);
      throw error;
    }
  };

  const handleAddLocation = async (area: Area) => {
    const id = crypto.randomUUID();
    try {
      console.log("Adding hub:", area);
      const { error } = await supabase.from('areas').insert({
        id, name: area.name, city: area.city, state: area.state, code: area.code, is_active: true
      });
      
      if (error) {
        console.error("Hub insert error:", error);
        toast("Error adding hub: " + error.message, 'error');
        return;
      }
      
      console.log("Hub inserted successfully, fetching locations...");
      toast("Hub registered successfully!", 'success');
      await fetchLocations();
    } catch (error: any) {
      console.error("Unexpected error adding hub:", error);
      toast("Unexpected error: " + error.message, 'error');
    }
  };

  const handleUpdateLocation = async (area: Area) => {
    try {
      console.log("Updating hub:", area);
      const { error } = await supabase.from('areas').update({
        name: area.name, city: area.city, state: area.state, code: area.code, is_active: area.isActive
      }).eq('id', area.id);
      
      if (error) {
        console.error("Hub update error:", error);
        toast("Error updating hub: " + error.message, 'error');
        return;
      }
      
      console.log("Hub updated successfully, fetching locations...");
      toast("Hub updated successfully!", 'success');
      await fetchLocations();
    } catch (error: any) {
      console.error("Unexpected error updating hub:", error);
      toast("Unexpected error: " + error.message, 'error');
    }
  };

  const handleDeleteLocation = async (areaId: string) => {
    try {
      console.log("Deleting hub:", areaId);

      // Find the area's name so we can unlink restaurants and orders that reference it
      const areaToDelete = locations.find(l => l.id === areaId);
      if (areaToDelete) {
        const { error: unlinkRestaurantsError } = await supabase
          .from('restaurants')
          .update({ location_name: null })
          .eq('location_name', areaToDelete.name);
        if (unlinkRestaurantsError) {
          console.error("Error unlinking restaurants from hub:", unlinkRestaurantsError);
          toast("Error unlinking restaurants from hub: " + unlinkRestaurantsError.message, 'error');
          return;
        }

        const { error: unlinkOrdersError } = await supabase
          .from('orders')
          .update({ location_name: null })
          .eq('location_name', areaToDelete.name);
        if (unlinkOrdersError) {
          console.error("Error unlinking orders from hub:", unlinkOrdersError);
          toast("Error unlinking orders from hub: " + unlinkOrdersError.message, 'error');
          return;
        }
      }

      const { error } = await supabase.from('areas').delete().eq('id', areaId);
      
      if (error) {
        console.error("Hub delete error:", error);
        toast("Error deleting hub: " + error.message, 'error');
        return;
      }
      
      console.log("Hub deleted successfully, fetching locations...");
      toast("Hub deleted successfully!", 'success');
      await fetchLocations();
      await fetchRestaurants();
    } catch (error: any) {
      console.error("Unexpected error deleting hub:", error);
      toast("Unexpected error: " + error.message, 'error');
    }
  };

  const onFetchPaginatedOrders = async (filters: ReportFilters, page: number, pageSize: number): Promise<ReportResponse> => {
    // Include timezone offset for proper date filtering
    const tzOffset = new Date().getTimezoneOffset();
    const params = new URLSearchParams({
      ...filters as any,
      timezoneOffsetMinutes: tzOffset.toString(),
      page: page.toString(),
      limit: pageSize.toString()
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    return await response.json();
  };

  const onFetchAllFilteredOrders = async (filters: ReportFilters): Promise<Order[]> => {
    // Include timezone offset for proper date filtering
    const tzOffset = new Date().getTimezoneOffset();
    const params = new URLSearchParams({
      ...filters as any,
      timezoneOffsetMinutes: tzOffset.toString(),
      page: '1',
      limit: '10000'
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    const data = await response.json();
    return data.orders;
  };

  const onFetchStats = async (filters: ReportFilters): Promise<any> => {
    // Include timezone offset for proper date filtering
    const tzOffset = new Date().getTimezoneOffset();
    const params = new URLSearchParams({
      ...filters as any,
      timezoneOffsetMinutes: tzOffset.toString(),
      page: '1',
      limit: '1'
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    const data = await response.json();
    return data.summary;
  };

    /**
     * Initialize order number tracker from database on app start
     * Ensures offline orders continue sequence from last online order
     */
    const initializeOrderNumberTracker = async () => {
      if (!currentUser?.restaurantId) return;
      try {
        const restaurantList = restaurants.filter(r => r.id === currentUser.restaurantId);
        if (restaurantList.length === 0) return;
        for (const restaurant of restaurantList) {
          const code = resolveOrderCode(restaurant, locations);
          const { data: recentOrders, error } = await supabase.from('orders')
            .select('id')
            .eq('restaurant_id', currentUser.restaurantId)
            .ilike('id', `${code}%`)
            .order('id', { ascending: false })
            .limit(50);
          if (!error && recentOrders && recentOrders.length > 0) {
            for (const order of recentOrders) {
              const num = offlineQueue.extractOrderNumber(order.id, code);
              if (num > 0) {
                offlineQueue.updateOrderNumberTracker(code, num);
                console.log(`[INIT] Tracker for ${code}: highest=${num}`);
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize tracker:', error);
      }
    };

  /**
   * Sync offline orders to Supabase when back online
   */
  const syncOfflineOrders = async () => {
    const unsyncedOrders = offlineQueue.getUnsyncedOrders();
    if (unsyncedOrders.length === 0) return;

    console.log(`Syncing ${unsyncedOrders.length} offline orders...`);

    // First, fetch the highest order number for each restaurant/code combination from the database
    // This ensures we don't create duplicates
    const restaurantCodes = new Map<string, Set<string>>(); // restaurant_id -> codes
    for (const order of unsyncedOrders) {
      if (!restaurantCodes.has(order.restaurant_id)) {
        restaurantCodes.set(order.restaurant_id, new Set());
      }
      const res = restaurants.find(r => r.id === order.restaurant_id);
      const code = resolveOrderCode(res, locations);
      restaurantCodes.get(order.restaurant_id)!.add(code);
    }

    // Update local tracker with actual DB values for each restaurant/code
    for (const [restaurantId, codes] of restaurantCodes) {
      for (const code of codes) {
        try {
          // Check last 50 orders to find highest new-format sequential order
          const { data: recentOrders, error } = await supabase.from('orders')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .ilike('id', `${code}%`)
            .order('id', { ascending: false })
            .limit(50);

          if (!error && recentOrders && recentOrders.length > 0) {
            // Find the first new-format order
            for (const order of recentOrders) {
              const lastNum = offlineQueue.extractOrderNumber(order.id, code);
              if (lastNum > 0) {
                offlineQueue.updateOrderNumberTracker(code, lastNum);
                console.log(`Updated tracker for ${code} (restaurant ${restaurantId}): highest sequential number is ${lastNum} from ${order.id}`);
                break;
              }
            }
          }
        } catch (err) {
          console.error(`Failed to fetch last order for ${code}:`, err);
        }
      }
    }

    // Now sync all orders, regenerating IDs if they conflict
    for (const offlineOrder of unsyncedOrders) {
      try {
        const res = restaurants.find(r => r.id === offlineOrder.restaurant_id);
        const code = resolveOrderCode(res, locations);
        let orderId = offlineOrder.id;
        let retries = 0;
        const maxRetries = 5;

        // Try to insert; if duplicate, regenerate ID and retry
        while (retries < maxRetries) {
          const { error } = await supabase.from('orders').insert([{
            id: orderId,
            items: offlineOrder.items,
            total: offlineOrder.total,
            status: offlineOrder.status,
            timestamp: offlineOrder.timestamp,
            customer_id: offlineOrder.customer_id,
            restaurant_id: offlineOrder.restaurant_id,
            table_number: offlineOrder.table_number,
            location_name: offlineOrder.location_name,
            remark: offlineOrder.remark,
            payment_method: offlineOrder.payment_method,
            cashier_name: offlineOrder.cashier_name,
            amount_received: offlineOrder.amount_received ?? null,
            change_amount: offlineOrder.change_amount ?? null
          }]);

          if (!error) {
            console.log(`Successfully synced order ${orderId}`);
            offlineQueue.markOrderAsSynced(offlineOrder.id);
            break;
          } else if (error.code === '23505') {
            // Duplicate key error - generate new ID
            retries++;
            const nextNum = offlineQueue.getNextOrderNumber(code);
            orderId = `${code}${String(nextNum).padStart(7, '0')}`;
            offlineQueue.updateOrderNumberTracker(code, nextNum);
            console.warn(`Duplicate order ID, regenerating to ${orderId} (attempt ${retries})`);
          } else {
            console.error(`Failed to sync order ${orderId}:`, error.message);
            break;
          }
        }

        if (retries >= maxRetries) {
          console.error(`Failed to sync order ${offlineOrder.id} after ${maxRetries} retries`);
        }
      } catch (err) {
        console.error(`Error syncing order ${offlineOrder.id}:`, err);
      }
    }

    // Refresh orders list after syncing
    fetchOrders();
    
    // Update pending count
    setPendingOfflineOrdersCount(offlineQueue.getUnsyncedOrders().length);
  };

  const placePosOrder = async (items: CartItem[], remark: string, tableNumber: string, paymentMethod?: string, cashierName?: string, amountReceived?: number): Promise<string> => {
    if (items.length === 0 || !currentUser?.restaurantId) return '';
    
    const res = restaurants.find(r => r.id === currentUser.restaurantId);
    const code = resolveOrderCode(res, locations);
   
     console.log(`[ORDER] Placing order - Restaurant: ${res?.name}, Location: ${res?.location}, Code: ${code}, Online: ${offlineQueue.isOnline()}`);
    
    // Calculate total
    const total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    // Check if user is online
    if (!offlineQueue.isOnline()) {
      console.warn('User is offline - queueing order locally');
      
      // Get next sequential number from local tracker
      const nextNum = offlineQueue.getNextOrderNumber(code);
      const orderId = `${code}${String(nextNum).padStart(7, '0')}`;
      
      // Update the tracker
      offlineQueue.updateOrderNumberTracker(code, nextNum);

      const offlineOrder: offlineQueue.OfflineOrder = {
        id: orderId,
        items,
        total,
        status: OrderStatus.COMPLETED,
        timestamp: Date.now(),
        customer_id: 'pos_user',
        restaurant_id: currentUser.restaurantId,
        table_number: tableNumber,
        location_name: res?.location || 'Unspecified',
        remark,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        amount_received: amountReceived,
        change_amount: amountReceived != null ? Math.max(0, amountReceived - total) : undefined,
        createdAt: Date.now(),
        synced: false
      };

      // Queue the order locally
      offlineQueue.addOfflineOrder(offlineOrder);

      // Update pending count
      setPendingOfflineOrdersCount(prevCount => prevCount + 1);

      // Show notification
      console.log(`Order queued for later sync: ${orderId}`);

      return orderId;
    }

    // User is online - proceed with normal flow
    let nextNum = 1;
    try {
      // Query for recent orders and find the HIGHEST new-format sequential order
      // (ignoring old timestamp-based orders)
      const { data: recentOrders, error: queryError } = await supabase.from('orders')
        .select('id')
        .eq('restaurant_id', currentUser.restaurantId)
        .ilike('id', `${code}%`)
        .order('id', { ascending: false })
        .limit(50);  // Check last 50 orders to find new format

      console.log(`Queried last 50 orders for restaurant ${currentUser.restaurantId}, code ${code}`);

      if (!queryError && recentOrders && recentOrders.length > 0) {
        // Find the first new-format order (extractOrderNumber returns 0 for old format)
        for (const order of recentOrders) {
          const num = offlineQueue.extractOrderNumber(order.id, code);
          if (num > 0) {
            nextNum = num + 1;
            console.log(`Found new-format order ${order.id}, nextNum will be ${nextNum}`);
            break;
          }
        }
        
        if (nextNum === 1) {
          console.log(`No new-format orders found in last 50, will start fresh at IOI0000001`);
        }
      } else {
        console.warn(`No existing orders found for code ${code}`, queryError);
      }
      
      // Update local tracker with the latest number from DB
      offlineQueue.updateOrderNumberTracker(code, nextNum);
    } catch (error) {
      console.error('Error fetching last order number:', error);
      // If we can't reach the server, fall back to offline mode
      const localNextNum = offlineQueue.getNextOrderNumber(code);
      const orderId = `${code}${String(localNextNum).padStart(7, '0')}`;
      offlineQueue.updateOrderNumberTracker(code, localNextNum);

      const offlineOrder: offlineQueue.OfflineOrder = {
        id: orderId,
        items,
        total,
        status: OrderStatus.COMPLETED,
        timestamp: Date.now(),
        customer_id: 'pos_user',
        restaurant_id: currentUser.restaurantId,
        table_number: tableNumber,
        location_name: res?.location || 'Unspecified',
        remark,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        amount_received: amountReceived,
        change_amount: amountReceived != null ? Math.max(0, amountReceived - total) : undefined,
        createdAt: Date.now(),
        synced: false
      };

      offlineQueue.addOfflineOrder(offlineOrder);
      setPendingOfflineOrdersCount(prevCount => prevCount + 1);
      console.log(`Order queued due to connection error: ${orderId}`);
      return orderId;
    }

    const orderId = `${code}${String(nextNum).padStart(7, '0')}`;

    const orderToInsert = {
      id: orderId,
      items: items,
      total: total,
      status: OrderStatus.COMPLETED,
      timestamp: Date.now(),
      customer_id: 'pos_user',
      restaurant_id: currentUser.restaurantId,
      table_number: tableNumber,
      location_name: res?.location || 'Unspecified',
      remark: remark,
      payment_method: paymentMethod || null,
      cashier_name: cashierName || null,
      amount_received: amountReceived ?? null,
      change_amount: amountReceived != null ? Math.max(0, amountReceived - total) : null
    };

    const { error } = await supabase.from('orders').insert([orderToInsert]);
    if (error) {
      console.error('Failed to insert order:', error);
      // If insert fails, queue it for later
      const offlineOrder: offlineQueue.OfflineOrder = {
        id: orderId,
        items,
        total,
        status: OrderStatus.COMPLETED,
        timestamp: Date.now(),
        customer_id: 'pos_user',
        restaurant_id: currentUser.restaurantId,
        table_number: tableNumber,
        location_name: res?.location || 'Unspecified',
        remark,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        amount_received: amountReceived,
        change_amount: amountReceived != null ? Math.max(0, amountReceived - total) : undefined,
        createdAt: Date.now(),
        synced: false
      };

      offlineQueue.addOfflineOrder(offlineOrder);
      setPendingOfflineOrdersCount(prevCount => prevCount + 1);
      console.log(`Order queued due to insert error: ${orderId}`);
    } else {
      // Successfully inserted - update tracker to remember this number
      offlineQueue.updateOrderNumberTracker(code, nextNum);
      console.log(`Order ${orderId} successfully created online`);
    }
    
    // Return the order ID so it can be used for printing
    return orderId;
  };

  const updateRestaurantSettings = async (restaurantId: string, settings: any) => {
    // Attempt to update Supabase, but handle missing column error gracefully
    const { error } = await supabase
      .from('restaurants')
      .update({ settings })
      .eq('id', restaurantId);
    
    if (error) {
      console.warn('Supabase settings update failed (likely missing column):', error.message);
      // We still update local state so the UI responds
    }
    
    // Save to localStorage as a fallback for persistence in this environment
    localStorage.setItem(`qs_settings_${restaurantId}`, JSON.stringify(settings));
    
    setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, settings } : r));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
        <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-[10px]">Syncing Hub...</p>
      </div>
    );
  }

  if (view === 'MARKETING') {
    return <MarketingPage onGetStarted={() => setView('LANDING')} />;
  }

  if (view === 'LANDING') {
    return <LandingPage onScan={handleScanSimulation} onLoginClick={() => setView('LOGIN')} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} locations={locations.filter(l => l.isActive !== false)} onLearnMore={() => setView('MARKETING')} onClearSession={handleClearSession} />;
  }

  if (view === 'LOGIN') {
    return <LoginPage onLogin={handleLogin} onBack={() => setView('LANDING')} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b dark:border-gray-700 h-16 flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('LANDING')}>
          <img src={isDarkMode ? "/LOGO/9-dark.png" : "/LOGO/9.png"} alt="QuickServe" className="h-10" />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {currentUser && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-gray-400 font-bold uppercase">{currentUser.role}</p>
                <p className="text-xs font-black dark:text-white">{currentUser.username}</p>
              </div>
              {isOnline && (
                <button onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"><LogOut size={20} /></button>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">
        {/* Global Error Display */}
        {globalError && (
          <div className="fixed top-20 left-0 right-0 z-[999999] max-w-2xl mx-auto">
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 m-4 text-red-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-black text-sm mb-1">❌ RUNTIME ERROR</p>
                  <p className="text-xs font-bold mb-2">{globalError.message}</p>
                  {globalError.stack && (
                    <pre className="text-xs bg-red-100 p-2 rounded overflow-auto max-h-32 font-mono mb-2">
                      {globalError.stack}
                    </pre>
                  )}
                </div>
                <button
                  onClick={() => setGlobalError(null)}
                  className="text-red-600 hover:text-red-800 font-bold text-lg flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
        
        {currentRole === 'CUSTOMER' && <CustomerView
          restaurants={
            sessionRestaurantId
              ? restaurants.filter(r => r.id === sessionRestaurantId && r.isOnline === true)
              : restaurants.filter(r => r.location === sessionLocation && r.isOnline === true)
          }
          cart={cart}
          orders={orders}
          onAddToCart={addToCart}
          onRemoveFromCart={removeFromCart}
          onPlaceOrder={placeOrder}
          locationName={sessionLocation || undefined}
          tableNo={sessionTable || undefined}
          areaType={sessionRestaurantId || sessionRestaurantSlug ? 'SINGLE' : 'MULTI'}
          allRestaurants={restaurants}
        />}
        
        {currentRole === 'CASHIER' && view === 'APP' && (
          currentUser && restaurants.find(r => r.id === currentUser.restaurantId) ? (
            <PosOnlyView 
              restaurant={restaurants.find(r => r.id === currentUser.restaurantId)!}
              orders={orders.filter(o => {
                if (o.restaurantId !== currentUser?.restaurantId) return false;
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                return o.timestamp > oneDayAgo;
              })}
              onUpdateOrder={updateOrderForPos}
              onPlaceOrder={placePosOrder}
              onUpdateMenu={handleUpdateMenuItem}
              onAddMenuItem={handleAddMenuItem}
              onPermanentDeleteMenuItem={handleDeleteMenuItem}
              onFetchPaginatedOrders={onFetchPaginatedOrders}
              onFetchAllFilteredOrders={onFetchAllFilteredOrders}
              isOnline={isOnline}
              pendingOfflineOrdersCount={pendingOfflineOrdersCount}
              cashierName={currentUser?.username}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading POS...</p>
            </div>
          )
        )}

        {currentRole === 'VENDOR' && view === 'APP' && (
          activeVendorRes ? (
              <PosOnlyView
                restaurant={activeVendorRes}
                orders={orders.filter(o => {
                  if (o.restaurantId !== currentUser?.restaurantId) return false;
                  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                  return o.timestamp > oneDayAgo;
                })}
                onUpdateOrder={updateOrderForPos}
                onPlaceOrder={placePosOrder}
                onUpdateMenu={handleUpdateMenuItem}
                onAddMenuItem={handleAddMenuItem}
                onPermanentDeleteMenuItem={handleDeleteMenuItem}
                onFetchPaginatedOrders={onFetchPaginatedOrders}
                onFetchAllFilteredOrders={onFetchAllFilteredOrders}
                isOnline={isOnline}
                pendingOfflineOrdersCount={pendingOfflineOrdersCount}
                cashierName={currentUser?.username}
                onKitchenUpdateOrder={updateOrderStatus}
                onToggleOnline={() => toggleVendorOnline(activeVendorRes.id, activeVendorRes.isOnline ?? true)}
                lastSyncTime={lastSyncTime}
              />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading POS...</p>
            </div>
          )
        )}
        
        {currentRole === 'ADMIN' && (
          <AdminView 
            vendors={allUsers.filter(u => u.role === 'VENDOR')} 
            restaurants={restaurants} 
            orders={orders} 
            locations={locations} 
            onAddVendor={handleAddVendor} 
            onUpdateVendor={handleUpdateVendor} 
            onImpersonateVendor={handleLogin} 
            onAddLocation={handleAddLocation} 
            onUpdateLocation={handleUpdateLocation} 
            onDeleteLocation={handleDeleteLocation} 
            onToggleOnline={toggleVendorOnline} 
            onDeleteVendor={handleDeleteVendor}
            onRemoveVendorFromHub={(rid) => supabase.from('restaurants').update({ location_name: null }).eq('id', rid).then(() => fetchRestaurants())} 
            onFetchPaginatedOrders={onFetchPaginatedOrders}
            onFetchAllFilteredOrders={onFetchAllFilteredOrders}
            onFetchStats={onFetchStats}
          />
        )}
      </main>
    </div>
  );
};

export default App;
