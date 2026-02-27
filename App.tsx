import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Role, Restaurant, Order, OrderStatus, CartItem, MenuItem, Area, ReportFilters, ReportResponse, PlatformAccess } from './src/types';
import CustomerView from './pages/CustomerView';
import VendorView from './pages/VendorView';
import AdminView from './pages/AdminView';
import PosView from './pages/PosView';
import PosOnlyView from './pages/PosOnlyView'; // Import the new POS Only view
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import MarketingPage from './pages/MarketingPage';
import { supabase } from './lib/supabase';
import { LogOut, Sun, Moon, MapPin, LogIn, Loader2 } from 'lucide-react';

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
  
  // --- TRANSACTION LOCKS ---
  const lockedOrderIds = useRef<Set<string>>(new Set());
  const isStatusLocked = useRef<boolean>(false);
  const isFetchingRef = useRef(false);
  const lastOrderTimestampRef = useRef<number>(0);
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('qs_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });
  
  const [currentRole, setCurrentRole] = useState<Role | null>(() => {
    return localStorage.getItem('qs_role') as Role | null;
  });
  
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

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

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
        id: l.id, name: l.name, city: l.city, state: l.state, code: l.code, isActive: l.is_active ?? true, type: l.type as 'MULTI' | 'SINGLE'
      }));
      setLocations(mapped);
      persistCache('qs_cache_locations', mapped);
    }
  }, []);

  const fetchRestaurants = useCallback(async () => {
    if (isStatusLocked.current || !currentRole) return;
    
    let query = supabase.from('restaurants').select('*');
    
    if (currentRole === 'CUSTOMER' && sessionLocation) {
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
              cold: temp.cold ?? 0
            },
            otherVariantName: others.name || '',
            otherVariants: others.options || [],
            otherVariantsEnabled: others.enabled ?? false,
            addOns: addOns
          };
        })
      }));
      setRestaurants(formatted);
      persistCache('qs_cache_restaurants', formatted);
    }
  }, [currentRole, sessionLocation]);

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
              rejectionNote: o.rejection_note
            };
            if (lockedOrderIds.current.has(o.id)) {
              const localOrder = prev.find(p => p.id === o.id);
              if (localOrder) mappedOrder.status = localOrder.status;
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
          rejectionNote: o.rejection_note
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
    const table = params.get('table');
    if (loc && table) {
      setSessionLocation(loc);
      setSessionTable(table);
      setCurrentRole('CUSTOMER');
      setView('APP');
      localStorage.setItem('qs_role', 'CUSTOMER');
      localStorage.setItem('qs_view', 'APP');
      localStorage.setItem('qs_session_location', loc);
      localStorage.setItem('qs_session_table', table);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Global Data Initialization
  useEffect(() => {
    const initApp = async () => {
      await Promise.allSettled([fetchUsers(), fetchLocations(), fetchRestaurants(), fetchOrders()]);
      setLastSyncTime(new Date());
      setIsLoading(false);
    };
    initApp();
  }, [fetchUsers, fetchLocations, fetchRestaurants, fetchOrders]);

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
          rejectionNote: o.rejection_note
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
              // Don't override if it's locked AND it's an ONGOING status (for printing)
              if (lockedOrderIds.current.has(o.id) && o.status === OrderStatus.ONGOING) {
                return existing; // Keep local state for ongoing orders (don't override)
              }
              
              // Clear lock if status matches (meaning update was received)
              if (lockedOrderIds.current.has(o.id) && existing.status === o.status) {
                lockedOrderIds.current.delete(o.id);
              }
              
              // If still locked, don't update
              if (lockedOrderIds.current.has(o.id)) return existing;

              return {
                ...existing,
                status: o.status as OrderStatus,
                rejectionReason: o.rejection_reason,
                rejectionNote: o.rejection_note
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
        setRestaurants(prev => {
          const updated = prev.map(r => r.id === res.id ? { ...r, isOnline: res.is_online === true || res.is_online === null } : r);
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

  // Vendor Polling Fallback
  useEffect(() => {
    let interval: any;
    if (currentRole === 'VENDOR') {
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
      alert(`Error: The following kitchen(s) are currently offline: ${offlineRestaurants.map(r => r?.name).join(', ')}. Please remove these items from your cart.`);
      return;
    }

    const area = locations.find(l => l.name === sessionLocation);
    const code = area?.code || 'QS';
    let nextNum = 1;
    const { data: lastOrder } = await supabase.from('orders')
      .select('id')
      .ilike('id', `${code}%`)
      .order('id', { ascending: false })
      .limit(1);

    if (lastOrder && lastOrder[0]) {
      const lastIdFull = lastOrder[0].id;
      const basePart = lastIdFull.split('-')[0];
      const numPart = basePart.substring(code.length);
      const parsed = parseInt(numPart);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const baseOrderId = `${code}${String(nextNum).padStart(7, '0')}`;

    const ordersToInsert = uniqueRestaurantIdsInCart.map((rid, index) => {
      const itemsForThisRestaurant = cart.filter(item => item.restaurantId === rid);
      const totalForThisRestaurant = itemsForThisRestaurant.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const finalOrderId = uniqueRestaurantIdsInCart.length > 1 ? `${baseOrderId}-${index + 1}` : baseOrderId;
      return {
        id: finalOrderId, items: itemsForThisRestaurant, total: totalForThisRestaurant,
        status: OrderStatus.PENDING, timestamp: Date.now(), customer_id: 'guest_user',
        restaurant_id: rid, table_number: sessionTable || 'N/A', location_name: sessionLocation || 'Unspecified',
        remark: remark
      };
    });

    const { error } = await supabase.from('orders').insert(ordersToInsert);
    if (error) alert("Placement Error: " + error.message);
    else { setCart([]); alert(`Your order(s) have been placed! Reference: ${baseOrderId}`); }
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
    setView('LANDING'); 
    localStorage.removeItem('qs_user');
    localStorage.removeItem('qs_role');
    localStorage.removeItem('qs_view');
    localStorage.removeItem('qs_session_location');
    localStorage.removeItem('qs_session_table');
    localStorage.removeItem('qs_cache_users');
    localStorage.removeItem('qs_cache_restaurants');
    localStorage.removeItem('qs_cache_orders');
    localStorage.removeItem('qs_cache_locations');
  };

  const handleClearSession = () => {
    setSessionLocation(null);
    setSessionTable(null);
    localStorage.removeItem('qs_session_location');
    localStorage.removeItem('qs_session_table');
    localStorage.removeItem('qs_role');
    localStorage.removeItem('qs_view');
    setCurrentRole(null);
    setView('LANDING');
  };

  // FIXED: Updated updateOrderStatus to handle printing correctly
  const updateOrderStatus = async (orderId: string, status: OrderStatus, reason?: string, note?: string) => {
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
      rejectionNote: note 
    } : o));
    
    // Update database
    await supabase.from('orders').update({ 
      status, 
      rejection_reason: reason, 
      rejection_note: note 
    }).eq('id', orderId);
    
    // Only lock for non-ONGOING status changes
    if (shouldLock) {
      setTimeout(() => lockedOrderIds.current.delete(orderId), 3000);
    }
  };

  const toggleVendorOnline = async (restaurantId: string, currentStatus: boolean) => {
    const res = restaurants.find(r => r.id === restaurantId);
    const vendor = allUsers.find(u => u.restaurantId === restaurantId);
    
    // If master activation is disabled, cannot turn online
    if (!currentStatus && vendor && vendor.isActive === false) {
      alert("Cannot turn online: Master Activation is disabled for this vendor.");
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
    if (res && res.isOnline === false) { alert("This kitchen is currently offline."); return; }
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
      temp_options: item.tempOptions || { enabled: false, hot: 0, cold: 0 },
      other_variants: {
        name: item.otherVariantName,
        options: item.otherVariants,
        enabled: item.otherVariantsEnabled
      },
      add_ons: item.addOns || []
    }).eq('id', item.id);
    
    if (error) {
      alert("Error updating menu item: " + error.message);
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
      temp_options: item.tempOptions || { enabled: false, hot: 0, cold: 0 },
      other_variants: {
        name: item.otherVariantName,
        options: item.otherVariants,
        enabled: item.otherVariantsEnabled
      },
      add_ons: item.addOns || []
    });
    
    if (error) {
      alert("Error adding menu item: " + error.message);
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
        platform_access: restaurant.platformAccess || 'pos_and_kitchen'
      });
      
      if (resError) { 
        alert("Error adding restaurant: " + resError.message);
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
        alert("Error adding user: " + userError.message);
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
        alert("Restaurant created but couldn't link vendor. Please check manually.");
      } else {
        console.log("4. Restaurant updated with vendor_id successfully");
        alert("Vendor added successfully!");
      }
      
      fetchUsers(); 
      fetchRestaurants();
      
    } catch (error) {
      console.error("Unexpected error:", error);
      alert("An unexpected error occurred");
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
      platform_access: restaurant.platformAccess
    };
    if (user.isActive === false) {
      resUpdate.is_online = false;
    }

    const { error: resError } = await supabase.from('restaurants').update(resUpdate).eq('id', restaurant.id);
    if (userError || resError) alert("Error updating vendor");
    fetchUsers(); fetchRestaurants();
  };

  const handleAddLocation = async (area: Area) => {
    const id = crypto.randomUUID();
    const { error } = await supabase.from('areas').insert({
      id, name: area.name, city: area.city, state: area.state, code: area.code, is_active: true, type: area.type || 'MULTI'
    });
    if (!error) fetchLocations();
  };

  const handleUpdateLocation = async (area: Area) => {
    const { error } = await supabase.from('areas').update({
      name: area.name, city: area.city, state: area.state, code: area.code, is_active: area.isActive, type: area.type
    }).eq('id', area.id);
    if (!error) fetchLocations();
  };

  const handleDeleteLocation = async (areaId: string) => {
    const { error } = await supabase.from('areas').delete().eq('id', areaId);
    if (!error) fetchLocations();
  };

  const onFetchPaginatedOrders = async (filters: ReportFilters, page: number, pageSize: number): Promise<ReportResponse> => {
    const params = new URLSearchParams({
      ...filters as any,
      page: page.toString(),
      limit: pageSize.toString()
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    return await response.json();
  };

  const onFetchAllFilteredOrders = async (filters: ReportFilters): Promise<Order[]> => {
    const params = new URLSearchParams({
      ...filters as any,
      page: '1',
      limit: '10000'
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    const data = await response.json();
    return data.orders;
  };

  const onFetchStats = async (filters: ReportFilters): Promise<any> => {
    const params = new URLSearchParams({
      ...filters as any,
      page: '1',
      limit: '1'
    });
    const response = await fetch(`/api/orders/report?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch report');
    const data = await response.json();
    return data.summary;
  };

  const placePosOrder = async (items: CartItem[], remark: string, tableNumber: string) => {
    if (items.length === 0 || !currentUser?.restaurantId) return;
    
    const res = restaurants.find(r => r.id === currentUser.restaurantId);
    const area = locations.find(l => l.name === res?.location);
    const code = area?.code || 'QS';
    
    let nextNum = 1;
    const { data: lastOrder } = await supabase.from('orders')
      .select('id')
      .ilike('id', `${code}%`)
      .order('id', { ascending: false })
      .limit(1);

    if (lastOrder && lastOrder[0]) {
      const lastIdFull = lastOrder[0].id;
      const basePart = lastIdFull.split('-')[0];
      const numPart = basePart.substring(code.length);
      const parsed = parseInt(numPart);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    const orderId = `${code}${String(nextNum).padStart(7, '0')}`;
    const total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

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
      remark: remark
    };

    const { error } = await supabase.from('orders').insert([orderToInsert]);
    if (error) throw error;
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

  const activeVendorRes = currentUser?.role === 'VENDOR' ? restaurants.find(r => r.id === currentUser.restaurantId) : null;
  const currentArea = locations.find(l => l.name === sessionLocation);

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
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black">Q</div>
          <h1 className="text-xl font-black dark:text-white">QuickServe</h1>
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
              <button onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-white"><LogOut size={20} /></button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">
        {currentRole === 'CUSTOMER' && <CustomerView restaurants={restaurants.filter(r => r.location === sessionLocation && r.isOnline === true)} cart={cart} orders={orders} onAddToCart={addToCart} onRemoveFromCart={removeFromCart} onPlaceOrder={placeOrder} locationName={sessionLocation || undefined} tableNo={sessionTable || undefined} areaType={currentArea?.type || 'MULTI'} allRestaurants={restaurants} />}
        
        {currentRole === 'VENDOR' && view === 'APP' && (
          activeVendorRes ? (
            // Check platformAccess to determine which view to show
            activeVendorRes.platformAccess === 'pos_only' ? (
              <PosOnlyView 
                restaurant={activeVendorRes}
                orders={orders.filter(o => {
                  if (o.restaurantId !== currentUser?.restaurantId) return false;
                  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                  return o.timestamp > oneDayAgo;
                })}
                onUpdateOrder={updateOrderStatus}
                onPlaceOrder={placePosOrder}
                onFetchPaginatedOrders={onFetchPaginatedOrders}
                onFetchAllFilteredOrders={onFetchAllFilteredOrders}
              />
            ) : (
              <VendorView 
                restaurant={activeVendorRes} 
                orders={orders.filter(o => {
                  if (o.restaurantId !== currentUser?.restaurantId) return false;
                  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                  return o.timestamp > oneDayAgo;
                })} 
                onUpdateOrder={updateOrderStatus} 
                onUpdateMenu={handleUpdateMenuItem} 
                onAddMenuItem={handleAddMenuItem} 
                onPermanentDeleteMenuItem={handleDeleteMenuItem} 
                onToggleOnline={() => toggleVendorOnline(activeVendorRes.id, activeVendorRes.isOnline ?? true)} 
                lastSyncTime={lastSyncTime}
                onFetchPaginatedOrders={onFetchPaginatedOrders}
                onFetchAllFilteredOrders={onFetchAllFilteredOrders}
                onSwitchToPos={() => setView('POS')}
              />
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
              <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Loading Kitchen Dashboard...</p>
            </div>
          )
        )}
        
        {currentRole === 'VENDOR' && view === 'POS' && activeVendorRes && (
          <PosView 
            restaurant={activeVendorRes}
            orders={orders}
            onUpdateOrder={updateOrderStatus}
            onPlaceOrder={placePosOrder}
            onFetchPaginatedOrders={onFetchPaginatedOrders}
            onFetchAllFilteredOrders={onFetchAllFilteredOrders}
            onUpdateRestaurantSettings={updateRestaurantSettings}
            onSwitchToVendor={() => setView('APP')}
          />
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
