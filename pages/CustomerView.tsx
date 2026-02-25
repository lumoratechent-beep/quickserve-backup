
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Restaurant, CartItem, Order, OrderStatus, MenuItem } from '../types';
import { ShoppingCart, Plus, Minus, X, CheckCircle, ChevronRight, Info, ThermometerSun, Maximize2, MapPin, Hash, LayoutGrid, Grid3X3, MessageSquare, AlertTriangle, UtensilsCrossed, LogIn, WifiOff, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  restaurants: Restaurant[];
  cart: CartItem[];
  orders: Order[];
  onAddToCart: (item: CartItem) => void;
  onRemoveFromCart: (itemId: string) => void;
  onPlaceOrder: (remark: string) => void;
  locationName?: string;
  tableNo?: string;
  onLoginClick?: () => void;
  areaType?: 'MULTI' | 'SINGLE';
  allRestaurants?: Restaurant[]; // For cart offline validation
}

const CustomerView: React.FC<Props> = ({ restaurants: propRestaurants, cart, orders: propOrders, onAddToCart, onRemoveFromCart, onPlaceOrder, locationName, tableNo, onLoginClick, areaType = 'MULTI', allRestaurants = [] }) => {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(propRestaurants);
  const [orders, setOrders] = useState<Order[]>(propOrders);
  const [activeRestaurant, setActiveRestaurant] = useState('');
  const [showCart, setShowCart] = useState(false);
  
  // Sync with props
  useEffect(() => {
    setRestaurants(propRestaurants);
  }, [propRestaurants]);

  useEffect(() => {
    setOrders(propOrders);
  }, [propOrders]);

  const [selectedItemForVariants, setSelectedItemForVariants] = useState<{item: MenuItem, resId: string} | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedTemp, setSelectedTemp] = useState<'Hot' | 'Cold' | undefined>(undefined);
  const [selectedOtherVariant, setSelectedOtherVariant] = useState<string>('');
  const [gridColumns, setGridColumns] = useState<2 | 3>(3);
  const [orderRemark, setOrderRemark] = useState('');
  const [dismissedOrders, setDismissedOrders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('qs_dismissed_orders');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});

  const scrollToSection = (id: string) => {
    setActiveRestaurant(id);
    const element = sectionRefs.current[id];
    if (element) {
      const offset = 140; // Adjust for sticky header + nav height
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Check for any cart items from restaurants that are now offline
  const offlineCartItems = useMemo(() => {
    return cart.filter(item => {
      const res = allRestaurants.find(r => r.id === item.restaurantId);
      return res && res.isOnline === false;
    });
  }, [cart, allRestaurants]);

  useEffect(() => {
    if (areaType === 'SINGLE') return;
    const handleScroll = () => {
      const scrollPos = window.scrollY + 180;
      for (const res of restaurants) {
        const el = sectionRefs.current[res.id];
        if (el && el.offsetTop <= scrollPos && el.offsetTop + el.offsetHeight > scrollPos) {
          setActiveRestaurant(res.id);
        }
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [restaurants, areaType]);

  useEffect(() => {
    if (restaurants.length > 0 && (!activeRestaurant || !restaurants.find(r => r.id === activeRestaurant))) {
      setActiveRestaurant(restaurants[0].id);
    }
  }, [restaurants, activeRestaurant]);

  const handleInitialAdd = (item: MenuItem, resId: string) => {
    if ((item.sizes && item.sizes.length > 0) || (item.tempOptions && item.tempOptions.enabled) || (item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0)) {
      setSelectedItemForVariants({ item, resId });
      setSelectedSize(item.sizes?.[0]?.name || '');
      setSelectedTemp(item.tempOptions?.enabled ? 'Hot' : undefined);
      setSelectedOtherVariant(item.otherVariantsEnabled ? (item.otherVariants?.[0]?.name || '') : '');
    } else {
      onAddToCart({ ...item, quantity: 1, restaurantId: resId });
    }
  };

  const confirmVariantAdd = () => {
    if (!selectedItemForVariants) return;
    const { item, resId } = selectedItemForVariants;
    
    let finalPrice = item.price;
    if (selectedSize) {
      const sizeObj = item.sizes?.find(s => s.name === selectedSize);
      if (sizeObj) finalPrice += sizeObj.price;
    }
    if (selectedTemp === 'Hot' && item.tempOptions?.hot) finalPrice += item.tempOptions.hot;
    if (selectedTemp === 'Cold' && item.tempOptions?.cold) finalPrice += item.tempOptions.cold;
    if (selectedOtherVariant) {
      const otherObj = item.otherVariants?.find(v => v.name === selectedOtherVariant);
      if (otherObj) finalPrice += otherObj.price;
    }

    onAddToCart({
      ...item,
      price: finalPrice,
      quantity: 1,
      restaurantId: resId,
      selectedSize,
      selectedTemp,
      selectedOtherVariant
    });
    setSelectedItemForVariants(null);
  };

  const toggleGrid = () => {
    setGridColumns(prev => (prev === 3 ? 2 : 3));
  };

  const handleDismissOrder = (orderId: string) => {
    const updatedDismissed = [...dismissedOrders, orderId];
    setDismissedOrders(updatedDismissed);
    localStorage.setItem('qs_dismissed_orders', JSON.stringify(updatedDismissed));
  };

  // Only show notifications for THIS table and location
  const activeOrders = useMemo(() => {
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    return orders.filter(o => {
      const isCurrentLocation = o.locationName === locationName && o.tableNumber === tableNo;
      if (!isCurrentLocation) return false;
      
      const isDismissed = dismissedOrders.includes(o.id);
      if (isDismissed) return false;

      // Hide completed orders always
      if (o.status === OrderStatus.COMPLETED) return false;

      // Show served orders until dismissed
      if (o.status === OrderStatus.SERVED) return true;

      // Special handling for rejected orders: only show if they are recent (last 30 mins)
      if (o.status === OrderStatus.CANCELLED) {
         return o.timestamp > thirtyMinutesAgo;
      }

      return true;
    });
  }, [orders, locationName, tableNo, dismissedOrders]);

  return (
    <div className="relative min-h-screen pb-28 bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Restaurant Navbar - Only shown for MULTI vendor hubs */}
      {areaType !== 'SINGLE' && (
        <div className="sticky top-16 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-b dark:border-gray-700 shadow-md">
          <div className="px-4 py-2 border-b dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <UtensilsCrossed size={14} className="text-orange-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] dark:text-gray-300">Available Kitchens</span>
            </div>
            <span className="text-[9px] font-bold text-gray-400 uppercase">{restaurants.length} Stores Online</span>
          </div>
          <nav className="overflow-x-auto hide-scrollbar flex items-center px-4 py-3 gap-3">
            {restaurants.map(res => (
              <button
                key={res.id}
                onClick={() => scrollToSection(res.id)}
                className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tight transition-all duration-300 border-2 ${
                  activeRestaurant === res.id 
                    ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-100 dark:shadow-none scale-105' 
                    : 'bg-white dark:bg-gray-700 border-gray-100 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-200'
                }`}
              >
                <img src={res.logo} className="w-4 h-4 rounded-full object-cover" />
                {res.name}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-2 md:px-4 py-4">
        {/* Compact Location Info */}
        <div className="mb-4 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-orange-500 shrink-0" />
            <div className="flex flex-col">
               <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Serving At</span>
               <h2 className="text-[11px] font-black dark:text-white leading-tight uppercase tracking-tight truncate">
                 {locationName || 'QuickServe Hub'}
               </h2>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {tableNo && (
              <div className="flex items-center gap-1 px-3 py-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-black text-[10px] uppercase tracking-tighter">
                <Hash size={12} className="text-orange-500" />
                Table {tableNo}
              </div>
            )}
            
            <button 
              onClick={toggleGrid}
              className="p-2 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-300 rounded-lg hover:text-orange-500 transition-colors flex items-center gap-1.5 border dark:border-gray-600"
            >
              {gridColumns === 3 ? <LayoutGrid size={14} /> : <Grid3X3 size={14} />}
            </button>
          </div>
        </div>

        {/* Active/Cancelled Orders Ticker */}
        {activeOrders.length > 0 && (
          <div className="mb-6 space-y-2">
            {activeOrders.map(order => (
              <div key={order.id} className={`relative p-4 rounded-2xl border flex flex-col gap-2 transition-all shadow-sm ${
                order.status === OrderStatus.CANCELLED 
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30' 
                  : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30'
              }`}>
                <button 
                  onClick={() => handleDismissOrder(order.id)}
                  className="absolute top-3 right-3 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center justify-between pr-8">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        order.status === OrderStatus.CANCELLED ? 'bg-red-500' : 
                        order.status === OrderStatus.SERVED ? 'bg-green-500' :
                        'bg-orange-500 animate-pulse'
                      }`}></div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${
                        order.status === OrderStatus.CANCELLED ? 'text-red-700 dark:text-red-400' : 
                        order.status === OrderStatus.SERVED ? 'text-green-700 dark:text-green-400' :
                        'text-orange-800 dark:text-orange-200'
                      }`}>
                        {order.status === OrderStatus.CANCELLED ? `Rejected: ${order.id}` : 
                         order.status === OrderStatus.SERVED ? `Served: ${order.id} - Please pay at counter` :
                         `Preparing Your Meal: ${order.id}`}
                      </span>
                   </div>
                </div>
                {order.status === OrderStatus.CANCELLED && (
                  <div className="pl-4 border-l-2 border-red-200 dark:border-red-800">
                    <p className="text-[10px] font-bold text-red-800 dark:text-red-300">
                      Reason: {order.rejectionReason}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Menu Sections */}
        <div className="space-y-12">
          {restaurants.map(res => (
            <section 
              key={res.id} 
              id={res.id} 
              ref={el => { sectionRefs.current[res.id] = el; }}
              className={areaType === 'SINGLE' ? "mt-4" : "scroll-mt-48"}
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden border dark:border-gray-700 shadow-sm">
                    <img src={res.logo} alt={res.name} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-sm font-black text-gray-900 dark:text-white leading-tight tracking-tight uppercase">{res.name}</h2>
                </div>
              </div>

              <div className={`grid gap-3 md:gap-6 ${gridColumns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {res.menu.filter(item => !item.isArchived).map(item => (
                  <div key={item.id} className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
                    <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-700">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-lg text-[8px] font-black text-white shadow-sm uppercase tracking-widest">
                        {item.category}
                      </div>
                    </div>
                    <div className="p-2 md:p-4 flex-1 flex flex-col">
                      <div className="mb-2">
                        <h4 className={`font-black text-gray-900 dark:text-white leading-tight line-clamp-1 mb-1 ${gridColumns === 3 ? 'text-[10px] md:text-sm' : 'text-xs md:text-base'}`}>{item.name}</h4>
                        <p className="font-black text-orange-500 text-xs md:text-lg">RM{item.price.toFixed(2)}</p>
                      </div>
                      
                      <button 
                        onClick={() => handleInitialAdd(item, res.id)}
                        className={`mt-auto w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-black uppercase tracking-tighter hover:bg-orange-500 dark:hover:bg-orange-500 hover:text-white transition-all active:scale-95 shadow-sm text-[9px] md:text-xs`}
                      >
                        Add to Order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Variant Selection Modal */}
      {selectedItemForVariants && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in fade-in duration-300">
            <div className="relative h-48">
              <img src={selectedItemForVariants.item.image} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <button onClick={() => setSelectedItemForVariants(null)} className="absolute top-4 right-4 p-2 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/40 transition-colors">
                <X size={20} />
              </button>
              <div className="absolute bottom-6 left-6">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">{selectedItemForVariants.item.name}</h3>
                <p className="text-[10px] text-orange-300 font-bold uppercase tracking-[0.3em]">{selectedItemForVariants.item.category}</p>
              </div>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-6">
                {selectedItemForVariants.item.sizes && selectedItemForVariants.item.sizes.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 ml-1">Choose Portion</label>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedItemForVariants.item.sizes.map(size => (
                        <button
                          key={size.name}
                          onClick={() => setSelectedSize(size.name)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${
                            selectedSize === size.name ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-lg' : 'border-gray-50 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <p className="text-[10px] font-black uppercase tracking-tighter mb-1">{size.name}</p>
                          <p className="font-black text-sm">+{size.price > 0 ? `RM${size.price.toFixed(2)}` : 'FREE'}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItemForVariants.item.otherVariantsEnabled && selectedItemForVariants.item.otherVariants && selectedItemForVariants.item.otherVariants.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 ml-1">
                      {selectedItemForVariants.item.otherVariantName || "Additional Options"}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSelectedOtherVariant('')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${
                          selectedOtherVariant === '' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'border-gray-50 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-tighter mb-1">None</p>
                        <p className="font-black text-sm">Default</p>
                      </button>
                      {selectedItemForVariants.item.otherVariants.map(variant => (
                        <button
                          key={variant.name}
                          onClick={() => setSelectedOtherVariant(variant.name)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all duration-300 ${
                            selectedOtherVariant === variant.name ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 shadow-lg' : 'border-gray-50 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          <p className="text-[10px] font-black uppercase tracking-tighter mb-1">{variant.name}</p>
                          <p className="font-black text-sm">+{variant.price > 0 ? `RM${variant.price.toFixed(2)}` : 'FREE'}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItemForVariants.item.tempOptions?.enabled && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 ml-1">Temperature</label>
                    <div className="flex gap-3">
                      <button onClick={() => setSelectedTemp('Hot')} className={`flex-1 py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${selectedTemp === 'Hot' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-50 text-gray-500'}`}>
                        <ThermometerSun size={20} className="text-orange-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Hot</span>
                      </button>
                      <button onClick={() => setSelectedTemp('Cold')} className={`flex-1 py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${selectedTemp === 'Cold' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-50 text-gray-500'}`}>
                        <Info size={20} className="text-blue-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Cold</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
              <div className="flex items-center justify-between gap-6">
                <p className="text-2xl font-black dark:text-white">
                  RM{(
                    selectedItemForVariants.item.price + 
                    (selectedItemForVariants.item.sizes?.find(s => s.name === selectedSize)?.price || 0) +
                    (selectedTemp === 'Hot' ? (selectedItemForVariants.item.tempOptions?.hot || 0) : (selectedTemp === 'Cold' ? (selectedItemForVariants.item.tempOptions?.cold || 0) : 0)) +
                    (selectedItemForVariants.item.otherVariants?.find(v => v.name === selectedOtherVariant)?.price || 0)
                  ).toFixed(2)}
                </p>
                <button onClick={confirmVariantAdd} className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Add to Cart</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer and FAB Adjusted... */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[340px] px-4 z-50">
          <button onClick={() => setShowCart(true)} className={`w-full py-2.5 px-4 rounded-2xl shadow-xl flex items-center justify-between transition-all border-4 ${offlineCartItems.length > 0 ? 'bg-red-600' : 'bg-black text-white border-white'}`}>
            <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-black text-xs">{cart.length}</div><span className="font-black text-[10px] uppercase">View Tray</span></div>
            <span className="font-black text-lg">RM{cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}
      {/* Drawer... */}
      {showCart && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full flex flex-col">
            <div className="p-6 border-b flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-widest">Your Tray</h2><button onClick={() => setShowCart(false)} className="p-3"><X size={24} /></button></div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cart.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border">
                  <div className="flex-1">
                    <p className="font-black text-sm uppercase">{item.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.selectedSize && <span className="text-[8px] font-black px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">{item.selectedSize}</span>}
                      {item.selectedOtherVariant && <span className="text-[8px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.selectedOtherVariant}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-orange-500 text-xs">RM{(item.price * item.quantity).toFixed(2)}</p>
                    <div className="flex items-center gap-2 mt-2">
                       <button onClick={() => onRemoveFromCart(item.id)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-red-500"><Minus size={12}/></button>
                       <span className="font-black text-xs">{item.quantity}</span>
                       <button onClick={() => onAddToCart(item)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-green-500"><Plus size={12}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-8 border-t"><button onClick={() => { onPlaceOrder(orderRemark); setShowCart(false); }} className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest">Place Order</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerView;
