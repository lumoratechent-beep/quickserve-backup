import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Restaurant, MenuItem, CartItem, ModifierData, SelectedAddOn, OrderStatus, OrderSource } from '../src/types';
import { supabase } from '../lib/supabase';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import {
  ShoppingCart, X, Plus, Minus, ChevronLeft, ChevronRight,
  MapPin, Phone, Loader2, CheckCircle, Package,
  Truck, CreditCard, LogIn, UserPlus, LayoutGrid, Grid3X3,
  ArrowLeft, Search, Tag
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface DeliveryOption { id: string; type: string; label: string; enabled: boolean; fee: number; }
interface PaymentMethod  { id: string; label: string; enabled: boolean; }

type CheckoutStep = 'cart' | 'auth' | 'details' | 'payment' | 'confirmed';

interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  notes: string;
}

// ─── Helper ──────────────────────────────────────────────────────────────────
function getItemDisplayPrice(item: MenuItem): number {
  return item.onlinePrice ?? item.price;
}

// ─── Main Component ──────────────────────────────────────────────────────────
const OnlineShopPage: React.FC<{ slug: string }> = ({ slug }) => {
  // ── Restaurant data ────────────────────────────────────────────────────────
  const [restaurant, setRestaurant]     = useState<Restaurant | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [gridCols, setGridCols]             = useState<2 | 3>(3);
  const [searchQuery, setSearchQuery]       = useState('');
  const [showCart, setShowCart]             = useState(false);

  // ── Cart ───────────────────────────────────────────────────────────────────
  const [cart, setCart]               = useState<CartItem[]>([]);
  const [optionsItem, setOptionsItem] = useState<MenuItem | null>(null);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authMode, setAuthMode]         = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail]       = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName]         = useState('');
  const [authLoading, setAuthLoading]   = useState(false);
  const [authError, setAuthError]       = useState('');
  const [currentUser, setCurrentUser]   = useState<any>(null);

  // ── Checkout ───────────────────────────────────────────────────────────────
  const [checkoutStep, setCheckoutStep]       = useState<CheckoutStep>('cart');
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOption | null>(null);
  const [selectedPayment, setSelectedPayment]   = useState<PaymentMethod | null>(null);
  const [customerInfo, setCustomerInfo]         = useState<CustomerInfo>({
    name: '', phone: '', address: '', city: '', postcode: '', notes: ''
  });
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // ── Fetch restaurant by slug ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .eq('slug', slug)
          .single();

        if (error || !data) { setError('Shop not found.'); return; }
        setRestaurant(data as Restaurant);
        // Pre-select defaults for delivery and payment
        const deliveryOpts: DeliveryOption[] = data.settings?.onlineDeliveryOptions || [];
        const first = deliveryOpts.find((o: DeliveryOption) => o.enabled);
        if (first) setSelectedDelivery(first);
        const paymentMethods: PaymentMethod[] = data.settings?.onlinePaymentMethods || [];
        const firstPayment = paymentMethods.find((m: PaymentMethod) => m.enabled);
        if (firstPayment) setSelectedPayment(firstPayment);
      } catch {
        setError('Failed to load shop.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  // ── Check existing Supabase session ───────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setCurrentUser(data.session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const deliveryOptions: DeliveryOption[] = (restaurant?.settings?.onlineDeliveryOptions || []).filter((o: DeliveryOption) => o.enabled);
  const paymentMethods: PaymentMethod[]   = (restaurant?.settings?.onlinePaymentMethods  || []).filter((m: PaymentMethod)  => m.enabled);
  const modifiers: ModifierData[]          = (restaurant?.modifiers || []) as ModifierData[];

  const visibleMenu = useMemo(() => {
    if (!restaurant) return [];
    return restaurant.menu.filter(item => !item.isArchived && !item.onlineDisabled);
  }, [restaurant]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(visibleMenu.map(i => i.category)));
    return cats;
  }, [visibleMenu]);

  const filteredMenu = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return visibleMenu.filter(item =>
      item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    );
  }, [visibleMenu, searchQuery]);

  const groupedMenu = useMemo(() => {
    const groups: Record<string, MenuItem[]> = {};
    filteredMenu.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredMenu]);

  const cartTotal = cart.reduce((acc, item) => {
    const base = getItemDisplayPrice(item) * item.quantity;
    const addOnTotal = (item.selectedAddOns || []).reduce((s, a) => s + a.price * a.quantity, 0);
    return acc + base + addOnTotal * item.quantity;
  }, 0);

  const deliveryFee = selectedDelivery?.fee || 0;
  const totalWithDelivery = cartTotal + deliveryFee;

  const currencySymbol = restaurant?.settings?.currency || 'RM';

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = (item: CartItem) => {
    setCart(prev => {
      const key = `${item.id}-${item.selectedSize}-${item.selectedTemp}-${item.selectedOtherVariant}`;
      const existing = prev.findIndex(c =>
        `${c.id}-${c.selectedSize}-${c.selectedTemp}-${c.selectedOtherVariant}` === key
      );
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + item.quantity };
        return updated;
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (idx: number) => {
    setCart(prev => {
      const updated = [...prev];
      if (updated[idx].quantity > 1) {
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity - 1 };
      } else {
        updated.splice(idx, 1);
      }
      return updated;
    });
  };

  const handleInitialAdd = (item: MenuItem) => {
    const hasOptions =
      (item.sizes && item.sizes.length > 0) ||
      (item.tempOptions?.enabled) ||
      (item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0) ||
      (item.addOns && item.addOns.length > 0) ||
      (item.variantOptions?.enabled && item.variantOptions?.options && item.variantOptions.options.length > 0) ||
      (item.linkedModifiers && item.linkedModifiers.length > 0);

    if (hasOptions) {
      setOptionsItem(item);
    } else {
      addToCart({
        ...item,
        price: getItemDisplayPrice(item),
        quantity: 1,
        restaurantId: restaurant!.id,
      });
    }
  };

  // Scroll to category
  const scrollToCategory = (cat: string) => {
    setActiveCategory(cat);
    const el = sectionRefs.current[cat];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 160;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // ── Auth handlers ──────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else {
        if (!authName.trim()) throw new Error('Please enter your name.');
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { data: { full_name: authName } },
        });
        if (error) throw error;
      }
      setCheckoutStep('details');
    } catch (e: any) {
      setAuthError(e.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Place order ─────────────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!restaurant || !selectedDelivery || !selectedPayment) return;
    setIsPlacingOrder(true);
    try {
      const orderItems = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        image: item.image,
        selectedSize: item.selectedSize,
        selectedTemp: item.selectedTemp,
        selectedOtherVariant: item.selectedOtherVariant,
        selectedModifiers: item.selectedModifiers,
        selectedAddOns: item.selectedAddOns,
      }));

      const orderId = `ONL-${Date.now()}`;
      const remark = [
        customerInfo.notes,
        `Delivery: ${selectedDelivery.label}`,
        `Address: ${customerInfo.address}, ${customerInfo.city} ${customerInfo.postcode}`,
        `Phone: ${customerInfo.phone}`,
        `Payment: ${selectedPayment.label}`,
      ].filter(Boolean).join(' | ');

      const { error } = await supabase.from('orders').insert({
        id: orderId,
        restaurantId: restaurant.id,
        items: orderItems,
        total: totalWithDelivery,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
        tableNumber: 'Online',
        locationName: restaurant.name,
        remark,
        orderSource: 'online' as OrderSource,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        deliveryAddress: `${customerInfo.address}, ${customerInfo.city} ${customerInfo.postcode}`,
        deliveryOption: selectedDelivery.label,
        paymentMethod: selectedPayment.label,
        deliveryFee,
      });

      if (error) throw error;
      setConfirmedOrderId(orderId);
      setCheckoutStep('confirmed');
      setCart([]);
    } catch (e: any) {
      alert('Failed to place order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ── Render loading / error ────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-3" />
        <p className="text-sm font-black uppercase tracking-widest text-gray-400">Loading Shop...</p>
      </div>
    </div>
  );

  if (error || !restaurant) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-8">
        <Package size={48} className="text-gray-300 mx-auto mb-4" />
        <p className="text-lg font-black text-gray-500 uppercase tracking-widest">{error || 'Shop not found'}</p>
        <p className="text-sm text-gray-400 mt-2">Check the link and try again.</p>
      </div>
    </div>
  );

  // ── Render confirmed ──────────────────────────────────────────────────────
  if (checkoutStep === 'confirmed') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-xl font-black dark:text-white uppercase tracking-tighter mb-2">Order Placed!</h2>
        <p className="text-sm text-gray-500 mb-4">Your order <span className="font-black text-orange-500">{confirmedOrderId}</span> has been received.</p>
        <p className="text-xs text-gray-400 mb-8">The vendor will review and confirm your order shortly.</p>
        <button
          onClick={() => { setCheckoutStep('cart'); setConfirmedOrderId(null); }}
          className="w-full py-3 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );

  // ── Main shop UI ─────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-gray-900 pb-32">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {restaurant.logo && (
            <img src={restaurant.logo} alt={restaurant.name} className="w-10 h-10 rounded-xl object-cover border dark:border-gray-700 shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="12" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`; }} />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-gray-900 dark:text-white text-sm uppercase tracking-tight truncate">{restaurant.name}</h1>
            {restaurant.location && (
              <p className="text-[9px] text-gray-400 flex items-center gap-1 uppercase tracking-widest truncate">
                <MapPin size={9} /> {restaurant.location}
              </p>
            )}
          </div>
          <button
            onClick={() => setGridCols(g => g === 3 ? 2 : 3)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-orange-500 transition-colors"
          >
            {gridCols === 3 ? <LayoutGrid size={16} /> : <Grid3X3 size={16} />}
          </button>
          <button
            onClick={() => setShowCart(true)}
            className="relative p-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
          >
            <ShoppingCart size={18} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-xs font-medium dark:text-white outline-none focus:ring-2 focus:ring-orange-400 border-none"
            />
          </div>
        </div>

        {/* Category nav */}
        {!searchQuery && categories.length > 1 && (
          <nav className="max-w-5xl mx-auto px-4 pb-3 overflow-x-auto hide-scrollbar flex gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border-2 shrink-0 ${
                  activeCategory === cat
                    ? 'bg-orange-500 border-orange-500 text-white shadow'
                    : 'bg-white dark:bg-gray-700 border-gray-100 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-200'
                }`}
              >
                <Tag size={9} /> {cat}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Menu ── */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-10">
        {Object.entries(groupedMenu).map(([cat, items]) => (
          <section key={cat} ref={el => { sectionRefs.current[cat] = el; }}>
            <h2 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              {cat}
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </h2>
            <div className={`grid gap-4 ${gridCols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {items.map(item => (
                <div key={item.id} className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col">
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package size={32} className="text-gray-300" /></div>
                    )}
                    <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[8px] font-black text-white uppercase tracking-widest">{item.category}</div>
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-black text-gray-900 dark:text-white text-xs leading-tight mb-1 line-clamp-2">{item.name}</h3>
                    {item.description && <p className="text-[9px] text-gray-400 mb-2 line-clamp-2">{item.description}</p>}
                    <div className="flex items-center justify-between mt-auto">
                      <span className="font-black text-orange-500 text-sm">{currencySymbol} {getItemDisplayPrice(item).toFixed(2)}</span>
                      <button
                        onClick={() => handleInitialAdd(item)}
                        className="p-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all active:scale-95"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {Object.keys(groupedMenu).length === 0 && (
          <div className="text-center py-16">
            <Package size={40} className="text-gray-300 mx-auto mb-4" />
            <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No items found</p>
          </div>
        )}
      </main>

      {/* ── Floating cart button ── */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-40">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-3.5 px-5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-orange-500 hover:bg-orange-500 dark:hover:bg-orange-500 dark:hover:text-white transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-xs">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </div>
              <span className="font-black text-xs uppercase tracking-widest">View Cart</span>
            </div>
            <span className="font-black text-base">{currencySymbol} {cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ── Item Options Modal ── */}
      {optionsItem && (
        <SimpleItemOptionsModal
          item={optionsItem}
          restaurantId={restaurant.id}
          modifiers={modifiers}
          onClose={() => setOptionsItem(null)}
          onConfirm={item => {
            addToCart({ ...item, price: getItemDisplayPrice(optionsItem), restaurantId: restaurant.id });
            setOptionsItem(null);
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────────────────
           CART / CHECKOUT DRAWER
          ───────────────────────────────────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full flex flex-col shadow-2xl">

            {/* Drawer header */}
            <div className="p-5 border-b dark:border-gray-700 flex items-center gap-3">
              {checkoutStep !== 'cart' && (
                <button
                  onClick={() => {
                    if (checkoutStep === 'auth') setCheckoutStep('cart');
                    else if (checkoutStep === 'details') setCheckoutStep(currentUser ? 'cart' : 'auth');
                    else if (checkoutStep === 'payment') setCheckoutStep('details');
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                >
                  <ArrowLeft size={18} className="text-gray-500" />
                </button>
              )}
              <h2 className="flex-1 text-sm font-black dark:text-white uppercase tracking-widest">
                {checkoutStep === 'cart'    ? 'Your Cart' :
                 checkoutStep === 'auth'    ? (authMode === 'login' ? 'Login' : 'Register') :
                 checkoutStep === 'details' ? 'Delivery Details' :
                 checkoutStep === 'payment' ? 'Payment' : 'Confirm Order'}
              </h2>
              <button onClick={() => setShowCart(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* ── STEP: Cart ── */}
            {checkoutStep === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                      <ShoppingCart size={40} className="text-gray-300 mb-4" />
                      <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Cart is empty</p>
                    </div>
                  ) : cart.map((item, idx) => (
                    <div key={idx} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border dark:border-gray-700">
                      {item.image && (
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xs dark:text-white truncate">{item.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.selectedSize && <span className="text-[8px] font-black px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">{item.selectedSize}</span>}
                          {item.selectedTemp && <span className="text-[8px] font-black px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{item.selectedTemp}</span>}
                          {item.selectedOtherVariant && <span className="text-[8px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.selectedOtherVariant}</span>}
                        </div>
                        {(item.selectedAddOns || []).length > 0 && (
                          <p className="text-[8px] text-gray-400 mt-1">{item.selectedAddOns!.map(a => `+${a.name}`).join(', ')}</p>
                        )}
                        <p className="font-black text-orange-500 text-xs mt-1">{currencySymbol} {(item.price * item.quantity).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => removeFromCart(idx)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-red-400 hover:bg-red-50 transition-all"><Minus size={11} /></button>
                        <span className="font-black text-xs w-5 text-center dark:text-white">{item.quantity}</span>
                        <button onClick={() => addToCart({ ...item, quantity: 1 })} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-green-500 hover:bg-green-50 transition-all"><Plus size={11} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <div className="flex justify-between text-xs mb-4">
                      <span className="font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
                      <span className="font-black dark:text-white">{currencySymbol} {cartTotal.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={() => setCheckoutStep(currentUser ? 'details' : 'auth')}
                      className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                    >
                      Checkout <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── STEP: Auth ── */}
            {checkoutStep === 'auth' && (
              <div className="flex-1 overflow-y-auto p-5">
                <p className="text-xs text-gray-500 mb-6">Please login or create an account to continue.</p>
                <div className="flex gap-2 mb-6">
                  <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${authMode === 'login' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}><LogIn size={12} className="inline mr-1" />Login</button>
                  <button onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${authMode === 'register' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}><UserPlus size={12} className="inline mr-1" />Register</button>
                </div>
                <div className="space-y-3">
                  {authMode === 'register' && (
                    <input type="text" placeholder="Full Name" value={authName} onChange={e => setAuthName(e.target.value)} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                  )}
                  <input type="email" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                  <input type="password" placeholder="Password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                  {authError && <p className="text-xs text-red-500 font-bold">{authError}</p>}
                  <button
                    onClick={handleAuth}
                    disabled={authLoading}
                    className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {authLoading ? <Loader2 size={16} className="animate-spin" /> : (authMode === 'login' ? 'Login & Continue' : 'Create Account')}
                  </button>
                </div>
              </div>
            )}

            {/* ── STEP: Delivery Details ── */}
            {checkoutStep === 'details' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Delivery option */}
                  {deliveryOptions.length > 0 && (
                    <div>
                      <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Delivery Method</label>
                      <div className="space-y-2">
                        {deliveryOptions.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => setSelectedDelivery(opt)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${selectedDelivery?.id === opt.id ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                          >
                            <div className="flex items-center gap-2">
                              <Truck size={14} className={selectedDelivery?.id === opt.id ? 'text-orange-500' : 'text-gray-400'} />
                              <span className={`text-xs font-black uppercase tracking-widest ${selectedDelivery?.id === opt.id ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'}`}>{opt.label}</span>
                            </div>
                            <span className={`text-xs font-black ${selectedDelivery?.id === opt.id ? 'text-orange-500' : 'text-gray-400'}`}>
                              {opt.type === 'pickup' ? 'Free · Self Pickup' : opt.fee > 0 ? `${currencySymbol} ${opt.fee.toFixed(2)}` : 'Free'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Customer info */}
                  <div className="space-y-3">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Your Details</label>
                    <input type="text" placeholder="Full Name *" value={customerInfo.name} onChange={e => setCustomerInfo(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="tel" placeholder="Phone Number *" value={customerInfo.phone} onChange={e => setCustomerInfo(p => ({ ...p, phone: e.target.value }))} className="w-full pl-9 pr-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    {selectedDelivery && selectedDelivery.type !== 'pickup' && (
                      <>
                        <input type="text" placeholder="Address *" value={customerInfo.address} onChange={e => setCustomerInfo(p => ({ ...p, address: e.target.value }))} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" placeholder="City" value={customerInfo.city} onChange={e => setCustomerInfo(p => ({ ...p, city: e.target.value }))} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                          <input type="text" placeholder="Postcode" value={customerInfo.postcode} onChange={e => setCustomerInfo(p => ({ ...p, postcode: e.target.value }))} className="px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400" />
                        </div>
                      </>
                    )}
                    <textarea placeholder="Order notes (optional)" value={customerInfo.notes} onChange={e => setCustomerInfo(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                  </div>
                </div>
                <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <button
                    onClick={() => setCheckoutStep('payment')}
                    disabled={!customerInfo.name || !customerInfo.phone || (selectedDelivery?.type !== 'pickup' && !customerInfo.address)}
                    className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Next: Payment <ChevronRight size={16} />
                  </button>
                </div>
              </>
            )}

            {/* ── STEP: Payment ── */}
            {checkoutStep === 'payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Payment method */}
                  <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Payment Method</label>
                    <div className="space-y-2">
                      {paymentMethods.map(method => (
                        <button
                          key={method.id}
                          onClick={() => setSelectedPayment(method)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${selectedPayment?.id === method.id ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                        >
                          <CreditCard size={16} className={selectedPayment?.id === method.id ? 'text-orange-500' : 'text-gray-400'} />
                          <div>
                            <p className={`text-xs font-black uppercase tracking-widest ${selectedPayment?.id === method.id ? 'text-orange-600 dark:text-orange-400' : 'dark:text-white'}`}>{method.label}</p>
                            {method.id === 'cod' && <p className="text-[9px] text-gray-400">Pay at your door</p>}
                            {method.id === 'online' && <p className="text-[9px] text-gray-400">Pay online — vendor will share payment link</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order summary */}
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl border dark:border-gray-600 p-4 space-y-2">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3">Order Summary</p>
                    {cart.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-300">x{item.quantity} {item.name}</span>
                        <span className="font-bold dark:text-white">{currencySymbol} {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t dark:border-gray-600 pt-2 flex justify-between text-xs">
                      <span className="text-gray-400">Delivery Fee</span>
                      <span className="font-bold dark:text-white">{deliveryFee > 0 ? `${currencySymbol} ${deliveryFee.toFixed(2)}` : 'Free'}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black dark:text-white">
                      <span>Total</span>
                      <span className="text-orange-500">{currencySymbol} {totalWithDelivery.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <button
                    onClick={handlePlaceOrder}
                    disabled={!selectedPayment || isPlacingOrder}
                    className="w-full py-3.5 bg-green-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
                  >
                    {isPlacingOrder ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    {isPlacingOrder ? 'Placing Order...' : `Place Order · ${currencySymbol} ${totalWithDelivery.toFixed(2)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default OnlineShopPage;
