import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Role, Restaurant, Order, OrderStatus, CartItem, MenuItem, Area, ReportFilters, ReportResponse, PlatformAccess, QS_DEFAULT_HUB, Subscription, KitchenDepartment, OrderSource } from './src/types';
import CustomerView from './pages/CustomerView';
import AdminView from './pages/AdminView';
import PosOnlyView from './pages/PosOnlyView';
import BackOfficePage from './pages/BackOfficePage';
import LoginPage from './pages/LoginPage';
import MarketingPage from './pages/MarketingPage';
import RegisterPage from './pages/RegisterPage';
import OnlineShopPage from './pages/OnlineShopPage';
import TableSideOrderPage from './pages/TableSideOrderPage';
import { supabase } from './lib/supabase';
import { expandPosSettings } from './lib/sharedSettings';
import { LogOut, Sun, Moon, MapPin, LogIn, Loader2, Mail, RotateCw } from 'lucide-react';
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

const normalizeKitchenDepartments = (raw: any): KitchenDepartment[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        return trimmed ? { name: trimmed, categories: [] } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const name = String(entry.name || '').trim();
      if (!name) return null;
      const categories: string[] = Array.isArray(entry.categories)
        ? entry.categories
            .map((c: any) => String(c || '').trim())
        .filter((c: string) => c.length > 0)
        : [];
      return { name, categories: Array.from(new Set<string>(categories)).sort((a, b) => a.localeCompare(b)) };
    })
    .filter(Boolean) as KitchenDepartment[];
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
      // Merge with local settings and expand any compressed delta from DB.
      return res.map(r => {
        const localSettings = localStorage.getItem(`qs_settings_${r.id}`);
        if (localSettings) {
          const parsed = JSON.parse(localSettings);
          return { ...r, settings: expandPosSettings(parsed, r.name) };
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

  const [vendorSubscriptions, setVendorSubscriptions] = useState<Record<string, Subscription>>({});

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

  // Fix PWA / Chrome refresh viewport height bug.
  // CSS 100vh/100dvh can report a stale value on refresh in installed PWAs.
  // Reading from visualViewport gives the real pixel height and sets a CSS
  // variable that the layout uses instead of any CSS viewport unit.
  useEffect(() => {
    const setAppHeight = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    setAppHeight();
    window.visualViewport?.addEventListener('resize', setAppHeight);
    window.addEventListener('resize', setAppHeight);
    return () => {
      window.visualViewport?.removeEventListener('resize', setAppHeight);
      window.removeEventListener('resize', setAppHeight);
    };
  }, [])

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
  
  // Capture Stripe redirect params ONCE before any state initializer clears the URL
  const stripeRedirectRef = useRef(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const source = params.get('source');
    const checkoutSessionId = params.get('checkout_session_id');
    const setup = params.get('setup');
    if (payment || setup) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Flag PosOnlyView to open on BILLING tab after redirect
    if ((payment && source === 'upgrade') || setup) {
      localStorage.setItem('qs_return_tab', 'BILLING');
    }
    return { payment, source, checkoutSessionId, setup };
  });
  const [stripeRedirect] = useState(() => stripeRedirectRef.current());

  const [onlineShopSlug, setOnlineShopSlug] = useState<string | null>(null);
  const [view, setView] = useState<'LOGIN' | 'REGISTER' | 'APP' | 'MARKETING' | 'POS' | 'BACK_OFFICE' | 'ONLINE_SHOP'>(() => {
    const savedView = localStorage.getItem('qs_view') as any;
    
    // Handle Stripe payment redirect
    if (stripeRedirect.payment === 'success') {
      if (stripeRedirect.source === 'upgrade') {
        return savedView || 'APP';
      }
      return 'LOGIN';
    }
    if (stripeRedirect.payment === 'cancelled') {
      if (stripeRedirect.source === 'upgrade') {
        return savedView || 'APP';
      }
      return 'LOGIN';
    }
    // Handle Stripe card setup redirect — stay on current view
    if (stripeRedirect.setup) {
      return savedView || 'APP';
    }

    // If no session and no params, show marketing page as the first impression
    const params = new URLSearchParams(window.location.search);
    if (!savedView && !params.get('loc')) {
      return 'MARKETING';
    }

    return savedView || 'MARKETING';
  });

  // Show toast for Stripe payment redirect on mount
  useEffect(() => {
    const refreshPlanState = async () => {
      await Promise.all([fetchSubscriptions(), fetchRestaurants()]);
    };

    if (stripeRedirect.payment === 'success') {
      if (stripeRedirect.source === 'upgrade') {
        const syncAfterCheckout = async () => {
          if (stripeRedirect.checkoutSessionId) {
            toast('Payment successful. Finalizing plan update...', 'info');
            try {
              const res = await fetch('/api/stripe/confirm-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutSessionId: stripeRedirect.checkoutSessionId }),
              });
              const data = await res.json();
              if (!res.ok) {
                throw new Error(data?.error || 'Unable to sync plan update.');
              }
              await refreshPlanState();
              const planLabel = (data?.planId || 'new').toString().replace('_', ' ').toUpperCase();
              toast(`Plan updated to ${planLabel}.`, 'success');
              return;
            } catch (err) {
              console.error('Post-checkout sync failed:', err);
            }
          }

          // Fallback path when no session id is present or confirmation fails.
          await refreshPlanState();
          toast('Payment received. Plan sync may take a few seconds to appear.', 'warning');
        };

        syncAfterCheckout();
      } else {
        // New registration: confirm checkout to activate the account
        const activateAfterRegistration = async () => {
          if (stripeRedirect.checkoutSessionId) {
            toast('Activating your account...', 'info');
            try {
              const res = await fetch('/api/stripe/confirm-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutSessionId: stripeRedirect.checkoutSessionId }),
              });
              const data = await res.json();
              if (res.ok) {
                toast('Your account is active! Log in to get started.', 'success');
                setView('LOGIN');
                return;
              }
              console.error('Registration confirm-checkout failed:', data?.error);
            } catch (err) {
              console.error('Registration confirm-checkout error:', err);
            }
          }
          // Fallback: webhook may still activate the account
          toast('Your free trial is active! Log in to get started.', 'success');
          setView('LOGIN');
        };
        activateAfterRegistration();
      }
    } else if (stripeRedirect.payment === 'cancelled') {
      if (stripeRedirect.source === 'upgrade') {
        toast('Checkout was cancelled. You can try again anytime.', 'warning');
      } else {
        toast('Card setup was cancelled. You can try again by registering.', 'error');
        setView('LOGIN');
      }
    } else if (stripeRedirect.setup === 'success') {
      toast('Card added successfully!', 'success');
      refreshPlanState();
    } else if (stripeRedirect.setup === 'cancelled') {
      toast('Card setup was cancelled. You can try again from the Billing page.', 'warning');
    }
  }, []);
  
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

  // Announcements / Mail state
  const [announcements, setAnnouncements] = useState<Array<{id: string; title: string; body: string; category: string; created_at: string; is_read: boolean}>>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [openMailInPOS, setOpenMailInPOS] = useState(false);

  const fetchAnnouncements = useCallback(async (restaurantId?: string) => {
    const rid = restaurantId || currentUser?.restaurantId;
    if (!rid) return;
    setAnnouncementsLoading(true);
    try {
      // Find the restaurant's hub/location for filtering
      const currentRes = restaurants.find(r => r.id === rid);
      const hubName = currentRes?.location || '';

      const { data: items } = await supabase
        .from('announcements')
        .select('id, title, body, category, created_at, hub, restaurant_id')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (!items) { setAnnouncements([]); return; }

      // Filter announcements by hub and restaurant targeting
      const filtered = items.filter((a: any) => {
        const hubMatch = a.hub === 'all' || a.hub === hubName;
        const restMatch = a.restaurant_id === 'all' || a.restaurant_id === rid;
        return hubMatch && restMatch;
      });

      const { data: reads } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('restaurant_id', rid);
      const readIds = new Set((reads || []).map((r: any) => r.announcement_id));
      setAnnouncements(filtered.map((a: any) => ({ ...a, is_read: readIds.has(a.id) })));
    } catch { setAnnouncements([]); } finally { setAnnouncementsLoading(false); }
  }, [currentUser?.restaurantId, restaurants]);

  const markAnnouncementRead = async (announcementId: string) => {
    const rid = currentUser?.restaurantId;
    if (!rid) return;
    await supabase.from('announcement_reads').upsert(
      { announcement_id: announcementId, restaurant_id: rid },
      { onConflict: 'announcement_id,restaurant_id' }
    );
    setAnnouncements(prev => prev.map(a => a.id === announcementId ? { ...a, is_read: true } : a));
  };

  const markAllAnnouncementsRead = async () => {
    const rid = currentUser?.restaurantId;
    if (!rid) return;
    const unread = announcements.filter(a => !a.is_read);
    if (unread.length === 0) return;
    const rows = unread.map(a => ({ announcement_id: a.id, restaurant_id: rid }));
    await supabase.from('announcement_reads').upsert(rows, { onConflict: 'announcement_id,restaurant_id' });
    setAnnouncements(prev => prev.map(a => ({ ...a, is_read: true })));
  };

  const clearAnnouncements = () => {
    setAnnouncements([]);
  };

  const unreadMailCount = announcements.filter(a => !a.is_read).length;

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
    
    const { data, error } = await supabase.from('users').select('id, username, role, restaurant_id, is_active, email, phone, kitchen_categories');
    if (!error && data) {
      const mapped = data.map(u => ({
        id: u.id, 
        username: u.username, 
        role: u.role as Role,
        restaurantId: u.restaurant_id,
        isActive: u.is_active, 
        email: u.email, 
        phone: u.phone,
        kitchenCategories: u.kitchen_categories || undefined,
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
        kitchenDivisions: normalizeKitchenDepartments(res.kitchen_divisions),
        kitchenEnabled: res.kitchen_enabled === true,
        settings: (() => {
          const raw = res.settings ? (typeof res.settings === 'string' ? JSON.parse(res.settings) : res.settings) : null;
          const localSettings = localStorage.getItem(`qs_settings_${res.id}`);
          // DB is authoritative (cross-device); localStorage is only a fallback when DB has nothing.
          // Expand compressed delta → full settings so all consumers get a complete object.
          const base = raw || (localSettings ? JSON.parse(localSettings) : null);
          return base ? expandPosSettings(base, res.name) : undefined;
        })(),
        categories: res.categories || [],
        modifiers: res.modifiers || [],
        addOnItems: res.add_on_items || [],
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
            addOns: addOns,
            cost: others.cost ?? 0,
            sku: others.sku ?? '',
            barcode: others.barcode ?? '',
            soldBy: others.soldBy ?? 'each',
            trackStock: others.trackStock ?? false,
            color: others.color ?? undefined,
            onlineDisabled: others.onlineDisabled ?? false,
            onlinePrice: others.onlinePrice ?? undefined,
          };
        })
      }));
      setRestaurants(formatted);
      persistCache('qs_cache_restaurants', formatted);
    }
  }, [currentRole, sessionLocation, sessionRestaurantId, sessionRestaurantSlug]);

  const fetchSubscriptions = useCallback(async () => {
    const { data, error } = await supabase.from('subscriptions').select('*');
    if (!error && data) {
      const map: Record<string, Subscription> = {};
      data.forEach((s: any) => { map[s.restaurant_id] = s; });
      setVendorSubscriptions(map);
    }
  }, []);

  useEffect(() => {
    const roleCanOwnRestaurant = currentRole === 'VENDOR' || currentRole === 'CASHIER' || currentRole === 'KITCHEN' || currentRole === 'ORDER_TAKER';
    const restaurantId = currentUser?.restaurantId;

    if (!roleCanOwnRestaurant || !restaurantId) return;

    const reconcileAccess = async () => {
      try {
        const res = await fetch('/api/stripe/billing?action=reconcile-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId }),
        });

        if (!res.ok) return;
        const data = await res.json();
        if (data?.updated) {
          await Promise.all([fetchRestaurants(), fetchSubscriptions()]);
        }
      } catch {
        // Silent: this is a best-effort sync.
      }
    };

    reconcileAccess();
  }, [currentRole, currentUser?.restaurantId, fetchRestaurants, fetchSubscriptions]);

  const fetchOrders = useCallback(async () => {
    if (isFetchingRef.current || !currentRole) return;
    isFetchingRef.current = true;
    try {
      let query = supabase.from('orders').select('*').order('timestamp', { ascending: false }).limit(200);
      
      if (currentRole === 'CUSTOMER') {
        if (sessionLocation && sessionTable) {
          query = query.eq('location_name', sessionLocation).eq('table_number', sessionTable).limit(10);
        } else if (sessionRestaurantId && sessionTable) {
          query = query.eq('restaurant_id', sessionRestaurantId).eq('table_number', sessionTable).limit(10);
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
              changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined,
              orderSource: o.order_source || undefined
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
    if (user.role !== 'VENDOR' && user.role !== 'KITCHEN' || !user.restaurantId) return;

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
          changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined,
          orderSource: o.order_source || undefined
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
    if (restaurantSlug && !table) {
      // Online shop — no table needed, show the public shop page
      setOnlineShopSlug(restaurantSlug);
      setView('ONLINE_SHOP');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (restaurantSlug && table) {
      // Short slug QR — e.g. ?r=burger-palace&table=1
      setSessionRestaurantSlug(restaurantSlug);
      setSessionRestaurantId(null);
      setSessionTable(table);
      setSessionLocation(null);
      setCart([]);
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
      setCart([]);
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
      setSessionRestaurantSlug(null);
      setCart([]);
      setCurrentRole('CUSTOMER');
      setView('APP');
      localStorage.setItem('qs_role', 'CUSTOMER');
      localStorage.setItem('qs_view', 'APP');
      localStorage.setItem('qs_session_location', loc);
      localStorage.setItem('qs_session_table', table);
      localStorage.removeItem('qs_session_restaurant_id');
      localStorage.removeItem('qs_session_restaurant_slug');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Resolve slug → restaurant ID once restaurants are fetched
  useEffect(() => {
    if (sessionRestaurantSlug && !sessionRestaurantId && restaurants.length > 0) {
      const match = restaurants.find(r => r.slug === sessionRestaurantSlug);
      if (match) {
        setSessionRestaurantId(match.id);
        localStorage.setItem('qs_session_restaurant_id', match.id);
      }
    }
  }, [restaurants, sessionRestaurantSlug, sessionRestaurantId]);

  // Compute active vendor and current area early for hooks
  const activeVendorRes = (currentUser?.role === 'VENDOR' || currentUser?.role === 'KITCHEN' || currentUser?.role === 'ORDER_TAKER') ? restaurants.find(r => r.id === currentUser.restaurantId) : null;
  const currentArea = locations.find(l => l.name === sessionLocation);

  // Global Data Initialization
  useEffect(() => {
    const initApp = async () => {
      await Promise.allSettled([fetchUsers(), fetchLocations(), fetchRestaurants(), fetchOrders(), fetchSubscriptions()]);
       // Initialize order tracker from DB to ensure offline orders use correct sequence
       await initializeOrderNumberTracker();
      setLastSyncTime(new Date());
      setIsLoading(false);
    };
    initApp();
  }, [fetchUsers, fetchLocations, fetchRestaurants, fetchOrders, fetchSubscriptions]);
  
    // Initialize tracker when user logs in (for CASHIER/VENDOR roles)
    useEffect(() => {
      if (currentRole === 'CASHIER' || currentRole === 'VENDOR' || currentRole === 'KITCHEN') {
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
    } else if (currentRole === 'CUSTOMER' && sessionRestaurantId) {
      orderFilter = `restaurant_id=eq.${sessionRestaurantId}`;
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
          changeAmount: o.change_amount != null ? Number(o.change_amount) : undefined,
          orderSource: o.order_source || undefined
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
                orderSource: o.order_source ?? existing.orderSource,
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
        filter: currentRole === 'CUSTOMER' && sessionLocation
          ? `location_name=eq.${sessionLocation}`
          : currentRole === 'CUSTOMER' && sessionRestaurantId
            ? `id=eq.${sessionRestaurantId}`
            : undefined
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
  }, [currentRole, sessionLocation, sessionRestaurantId, currentUser]);

  // Vendor Polling Fallback (poll for all vendors since kitchen/QR features are now dynamic toggles)
  useEffect(() => {
    let interval: any;
    const shouldPoll = currentRole === 'VENDOR' || currentRole === 'KITCHEN' || currentRole === 'ORDER_TAKER';
    
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

  // Fetch announcements when vendor/cashier logs in
  useEffect(() => {
    if (currentUser?.restaurantId && (currentRole === 'VENDOR' || currentRole === 'CASHIER')) {
      fetchAnnouncements(currentUser.restaurantId);
    }
  }, [currentUser?.restaurantId, currentRole]);

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
        remark: remark,
        order_source: 'qr_order'
      });
      orderIds.push(orderId);
    }

    let { error } = await supabase.from('orders').insert(ordersToInsert);
    if (error && (error.code === 'PGRST204' || (error.message || '').includes('order_source'))) {
      console.warn('order_source column missing – retrying QR batch without it');
      const stripped = ordersToInsert.map(({ order_source, ...rest }: any) => rest);
      ({ error } = await supabase.from('orders').insert(stripped));
    }
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
    setView('MARKETING'); 
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
    setView('MARKETING');
  };

  // Block KITCHEN users at runtime if KDS is disabled for their restaurant
  useEffect(() => {
    if (currentUser?.role === 'KITCHEN' && activeVendorRes && activeVendorRes.kitchenEnabled !== true) {
      toast('Kitchen Display System has been disabled. You have been logged out.', 'warning');
      handleLogout();
    }
  }, [currentUser?.role, activeVendorRes?.kitchenEnabled]);

  // Block ORDER_TAKER users at runtime if tableside ordering is disabled
  useEffect(() => {
    if (currentUser?.role === 'ORDER_TAKER' && activeVendorRes && !activeVendorRes.settings?.features?.tablesideOrderingEnabled) {
      toast('Tableside Ordering has been disabled. You have been logged out.', 'warning');
      handleLogout();
    }
  }, [currentUser?.role, activeVendorRes?.settings?.features?.tablesideOrderingEnabled]);

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

  const updateOrderItems = (orderId: string, items: CartItem[], total: number) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items, total } : o));
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
        variantOptions: item.variantOptions || { enabled: false, options: [] },
        cost: item.cost ?? 0,
        sku: item.sku ?? '',
        barcode: item.barcode ?? '',
        soldBy: item.soldBy ?? 'each',
        trackStock: item.trackStock ?? false,
        color: item.color ?? null,
        onlineDisabled: item.onlineDisabled ?? false,
        onlinePrice: item.onlinePrice ?? null,
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
        variantOptions: item.variantOptions || { enabled: false, options: [] },
        cost: item.cost ?? 0,
        sku: item.sku ?? '',
        barcode: item.barcode ?? '',
        soldBy: item.soldBy ?? 'each',
        trackStock: item.trackStock ?? false,
        color: item.color ?? null,
        onlineDisabled: item.onlineDisabled ?? false,
        onlinePrice: item.onlinePrice ?? null,
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
  const handleAddVendor = async (user: User, restaurant: Restaurant): Promise<string | null> => {
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
        return null; 
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
        return null; 
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

      return resId;
      
    } catch (error) {
      console.error("Unexpected error:", error);
      toast("An unexpected error occurred", 'error');
      return null;
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
      // Use RPC function which runs with SECURITY DEFINER to bypass RLS
      const { data, error } = await supabase.rpc('delete_vendor', {
        p_user_id: userId,
        p_restaurant_id: restaurantId || null
      });

      if (error) {
        toast('Error deleting vendor: ' + error.message, 'error');
        throw error;
      }

      if (data && !data.success) {
        toast(data.message || 'Delete failed — records may still exist.', 'error');
        throw new Error(data.message);
      }

      toast('Vendor deleted successfully!', 'success');
      // Remove from local state immediately for responsive UI
      setAllUsers(prev => prev.filter(u => u.id !== userId));
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
   * Insert a single order row, falling back without order_source if the column
   * doesn't exist yet (PGRST204 – schema cache miss after a pending migration).
   */
  const insertOrderSafe = async (row: Record<string, unknown>): Promise<{ error: any }> => {
    const { error } = await supabase.from('orders').insert([row]);
    if (error && (error.code === 'PGRST204' || (error.message || '').includes('order_source'))) {
      console.warn('order_source column missing – retrying without it');
      const { order_source, ...rowWithout } = row;
      return supabase.from('orders').insert([rowWithout]);
    }
    return { error };
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
          const { error } = await insertOrderSafe({
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
            change_amount: offlineOrder.change_amount ?? null,
            order_source: offlineOrder.order_source ?? null
          });

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
        order_source: 'counter',
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
        order_source: 'counter',
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
      change_amount: amountReceived != null ? Math.max(0, amountReceived - total) : null,
      order_source: 'counter'
    };

    const { error } = await insertOrderSafe(orderToInsert);
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
        order_source: 'counter',
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

  const placeTablesideOrder = async (orderData: { items: CartItem[]; total: number; tableNumber: string; remark: string; orderSource: OrderSource }) => {
    if (orderData.items.length === 0 || !currentUser?.restaurantId) return;
    const res = restaurants.find(r => r.id === currentUser.restaurantId);
    const code = resolveOrderCode(res, locations);

    let nextNum = 1;
    const { data: recentOrders } = await supabase.from('orders')
      .select('id')
      .eq('restaurant_id', currentUser.restaurantId)
      .ilike('id', `${code}%`)
      .order('id', { ascending: false })
      .limit(50);

    if (recentOrders && recentOrders.length > 0) {
      for (const order of recentOrders) {
        const num = offlineQueue.extractOrderNumber(order.id, code);
        if (num > 0) { nextNum = num + 1; break; }
      }
    }

    const orderId = `${code}${String(nextNum).padStart(7, '0')}`;
    const orderToInsert = {
      id: orderId,
      items: orderData.items,
      total: orderData.total,
      status: OrderStatus.PENDING,
      timestamp: Date.now(),
      customer_id: 'tableside_user',
      restaurant_id: currentUser.restaurantId,
      table_number: orderData.tableNumber,
      location_name: res?.location || 'Unspecified',
      remark: orderData.remark,
      cashier_name: currentUser.username,
      order_source: orderData.orderSource || 'tableside',
    };

    const { error } = await insertOrderSafe(orderToInsert);
    if (error) throw new Error(error.message || 'Failed to place order');
    offlineQueue.updateOrderNumberTracker(code, nextNum);
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

  const saveKitchenDivisions = async (restaurantId: string, divisions: KitchenDepartment[]) => {
    const { error } = await supabase
      .from('restaurants')
      .update({ kitchen_divisions: divisions })
      .eq('id', restaurantId);
    
    if (error) {
      console.warn('Failed to save kitchen divisions:', error.message);
    }
    
    localStorage.setItem(`qs_kitchen_divisions_${restaurantId}`, JSON.stringify(divisions));
    setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, kitchenDivisions: divisions } : r));
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
    return <MarketingPage onGetStarted={() => setView('REGISTER')} onLogin={() => setView('LOGIN')} isDarkMode={isDarkMode} onToggleDark={() => setIsDarkMode(!isDarkMode)} />;
  }

  if (view === 'BACK_OFFICE' && currentRole === 'VENDOR' && activeVendorRes) {
    const CURRENCY_MAP: Record<string, string> = { MYR: 'RM', USD: '$', EUR: '€', GBP: '£', SGD: 'S$', JPY: '¥', KRW: '₩', INR: '₹', AUD: 'A$', CNY: '¥', TWD: 'NT$', BND: 'B$' };
    const currCode = activeVendorRes.settings?.currency || localStorage.getItem(`ux_currency_${activeVendorRes.id}`) || 'MYR';
    const currSymbol = CURRENCY_MAP[currCode] || 'RM';
    return (
      <BackOfficePage
        restaurant={activeVendorRes}
        orders={orders.filter(o => o.restaurantId === currentUser?.restaurantId)}
        currencySymbol={currSymbol}
        onFetchAllFilteredOrders={onFetchAllFilteredOrders}
        onBack={() => setView('APP')}
        onAddMenuItem={handleAddMenuItem}
        onUpdateMenu={handleUpdateMenuItem}
        onPermanentDeleteMenuItem={handleDeleteMenuItem}
        subscription={currentUser?.restaurantId ? (vendorSubscriptions[currentUser.restaurantId] ?? null) : null}
      />
    );
  }

  if (view === 'REGISTER') {
    return <RegisterPage onBack={() => setView('MARKETING')} onLoginClick={() => setView('LOGIN')} onRegisterSuccess={() => {
      toast('Registration successful! You can now log in.', 'success');
      setView('LOGIN');
    }} />;
  }

  if (view === 'LOGIN') {
    return <LoginPage onLogin={handleLogin} onBack={() => setView('MARKETING')} onRegister={() => setView('REGISTER')} />;
  }

  return (
    <div className="flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors" style={{ height: 'var(--app-height, 100dvh)' }}>
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b dark:border-gray-700 h-16 flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('MARKETING')}>
          <img src={isDarkMode ? "/LOGO/9-dark.png" : "/LOGO/9.png"} alt="QuickServe" className="h-10" />
        </div>
        <div className="flex items-center gap-3">
          {currentUser?.restaurantId && (currentRole === 'VENDOR' || currentRole === 'CASHIER') && (
            <button
              onClick={() => { setView('APP'); fetchAnnouncements(); setOpenMailInPOS(true); }}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white relative"
              title="Mail"
            >
              <Mail size={20} />
              {unreadMailCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">{unreadMailCount}</span>
              )}
            </button>
          )}
          {/* Theme toggle switch */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            style={isDarkMode ? {
              backgroundColor: '#2D3F55',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
            } : {
              backgroundColor: '#F5D9B8',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
            }}
            className="relative flex items-center w-16 h-8 rounded-full transition-all duration-300 focus:outline-none"
          >
            <span
              style={isDarkMode
                ? { background: 'linear-gradient(135deg, #6366f1 0%, #3730a3 100%)', boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)' }
                : { background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)', boxShadow: '0 0 10px rgba(249, 115, 22, 0.3)' }
              }
              className={`absolute left-1 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 ${
                isDarkMode ? 'translate-x-8' : 'translate-x-0'
              }`}
            >
              {isDarkMode
                ? <Moon size={13} className="text-yellow-100" />
                : <Sun size={13} className="text-white" />}
            </span>
            <Sun size={12} className={`absolute left-2 transition-opacity duration-300 text-orange-400 ${isDarkMode ? 'opacity-40' : 'opacity-0'}`} />
            <Moon size={12} className={`absolute right-2 transition-opacity duration-300 text-indigo-400 ${isDarkMode ? 'opacity-0' : 'opacity-40'}`} />
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
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
        
        {view === 'ONLINE_SHOP' && onlineShopSlug && <OnlineShopPage slug={onlineShopSlug} />}
        {view !== 'ONLINE_SHOP' && currentRole === 'CUSTOMER' && (() => {
          const filteredRestaurants = sessionRestaurantId
            ? restaurants.filter(r => r.id === sessionRestaurantId && r.isOnline === true)
            : sessionRestaurantSlug
              ? restaurants.filter(r => r.slug === sessionRestaurantSlug && r.isOnline === true)
              : restaurants.filter(r => r.location === sessionLocation && r.isOnline === true);
          const isSingle = !!(sessionRestaurantId || sessionRestaurantSlug);
          const singleRes = isSingle ? filteredRestaurants[0] : null;
          const derivedLocationName = sessionLocation
            || singleRes?.settings?.qrLocationLabel
            || singleRes?.name
            || undefined;
          return <CustomerView
            restaurants={filteredRestaurants}
            cart={cart}
            orders={orders}
            onAddToCart={addToCart}
            onRemoveFromCart={removeFromCart}
            onPlaceOrder={placeOrder}
            locationName={derivedLocationName}
            tableNo={sessionTable || undefined}
            areaType={isSingle ? 'SINGLE' : 'MULTI'}
            allRestaurants={restaurants}
          />;
        })()}
        
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
              subscription={currentUser?.restaurantId ? (vendorSubscriptions[currentUser.restaurantId] || null) : null}
              onSubscriptionUpdated={() => { fetchSubscriptions(); fetchRestaurants(); }}
              announcements={announcements}
              announcementsLoading={announcementsLoading}
              onMarkAnnouncementRead={markAnnouncementRead}
              onMarkAllAnnouncementsRead={markAllAnnouncementsRead}
              onClearAnnouncements={clearAnnouncements}
              unreadMailCount={unreadMailCount}
              openMailTab={openMailInPOS}
              onMailTabOpened={() => setOpenMailInPOS(false)}
              onUpdateOrderItems={updateOrderItems}
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
                userRole="VENDOR"
                onSaveKitchenDivisions={(divisions) => saveKitchenDivisions(activeVendorRes.id, divisions)}
                subscription={vendorSubscriptions[activeVendorRes.id] || null}
                onSubscriptionUpdated={() => { fetchSubscriptions(); fetchRestaurants(); }}
                onNavigateBackOffice={() => setView('BACK_OFFICE')}
                announcements={announcements}
                announcementsLoading={announcementsLoading}
                onMarkAnnouncementRead={markAnnouncementRead}
                onMarkAllAnnouncementsRead={markAllAnnouncementsRead}
                onClearAnnouncements={clearAnnouncements}
                unreadMailCount={unreadMailCount}
                openMailTab={openMailInPOS}
                onMailTabOpened={() => setOpenMailInPOS(false)}
                onUpdateOrderItems={updateOrderItems}
              />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading POS...</p>
            </div>
          )
        )}

        {currentRole === 'KITCHEN' && view === 'APP' && (
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
                onFetchPaginatedOrders={onFetchPaginatedOrders}
                onFetchAllFilteredOrders={onFetchAllFilteredOrders}
                isOnline={isOnline}
                pendingOfflineOrdersCount={0}
                cashierName={currentUser?.username}
                onKitchenUpdateOrder={updateOrderStatus}
                lastSyncTime={lastSyncTime}
                userRole="KITCHEN"
                userKitchenCategories={currentUser?.kitchenCategories}
                subscription={vendorSubscriptions[activeVendorRes.id] || null}
                onSubscriptionUpdated={() => { fetchSubscriptions(); fetchRestaurants(); }}
                announcements={announcements}
                announcementsLoading={announcementsLoading}
                onMarkAnnouncementRead={markAnnouncementRead}
                onMarkAllAnnouncementsRead={markAllAnnouncementsRead}
                onClearAnnouncements={clearAnnouncements}
                unreadMailCount={unreadMailCount}
                openMailTab={openMailInPOS}
                onMailTabOpened={() => setOpenMailInPOS(false)}
                onUpdateOrderItems={updateOrderItems}
              />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading Kitchen...</p>
            </div>
          )
        )}
        
        {currentRole === 'ORDER_TAKER' && view === 'APP' && (
          activeVendorRes ? (
            <TableSideOrderPage
              restaurant={activeVendorRes}
              orders={orders.filter(o => {
                if (o.restaurantId !== currentUser?.restaurantId) return false;
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                return o.timestamp > oneDayAgo;
              })}
              cashierName={currentUser?.username}
              onLogout={handleLogout}
              onPlaceOrder={placeTablesideOrder}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading Tableside...</p>
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
