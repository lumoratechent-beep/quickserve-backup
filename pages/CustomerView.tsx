import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Restaurant, CartItem, Order, OrderStatus, MenuItem, ModifierData } from '../src/types';
import { ShoppingCart, Plus, Minus, X, CheckCircle, ChevronRight, Info, ThermometerSun, Maximize2, MapPin, Hash, LayoutGrid, Grid3X3, List, Search, MessageSquare, AlertTriangle, UtensilsCrossed, LogIn, WifiOff, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';

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
  const [viewMode, setViewMode] = useState<'list' | 2 | 3>(3);
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderRemark, setOrderRemark] = useState('');
  const [dismissedOrders, setDismissedOrders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('qs_dismissed_orders');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const sectionRefs = useRef<{ [key: string]: HTMLElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    setActiveRestaurant(id);
    const element = sectionRefs.current[id];
    const container = scrollContainerRef.current;
    if (element && container) {
      const offset = 140;
      const elementTop = element.offsetTop;
      container.scrollTo({
        top: elementTop - offset,
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
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const scrollPos = container.scrollTop + 180;
      for (const res of restaurants) {
        const el = sectionRefs.current[res.id];
        if (el && el.offsetTop <= scrollPos && el.offsetTop + el.offsetHeight > scrollPos) {
          setActiveRestaurant(res.id);
        }
      }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [restaurants, areaType]);

  useEffect(() => {
    if (restaurants.length > 0 && (!activeRestaurant || !restaurants.find(r => r.id === activeRestaurant))) {
      setActiveRestaurant(restaurants[0].id);
    }
  }, [restaurants, activeRestaurant]);

  const handleInitialAdd = (item: MenuItem, resId: string) => {
    const hasOptions =
      (item.sizes && item.sizes.length > 0) ||
      (item.tempOptions && item.tempOptions.enabled) ||
      (item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0) ||
      (item.addOns && item.addOns.length > 0) ||
      (item.variantOptions?.enabled && item.variantOptions?.options && item.variantOptions.options.length > 0) ||
      (item.linkedModifiers && item.linkedModifiers.length > 0);

    if (hasOptions) {
      setSelectedItemForVariants({ item, resId });
    } else {
      onAddToCart({ ...item, quantity: 1, restaurantId: resId });
    }
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
      // For SINGLE mode (slug/id QR), match by table only since orders are already restaurant-filtered
      const isCurrentLocation = areaType === 'SINGLE'
        ? o.tableNumber === tableNo
        : o.locationName === locationName && o.tableNumber === tableNo;
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
  }, [orders, locationName, tableNo, dismissedOrders, areaType]);

  return (
    <div ref={scrollContainerRef} className="relative flex-1 min-h-0 overflow-y-auto pb-28 bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Restaurant Navbar - Only shown for MULTI vendor hubs */}
      {areaType !== 'SINGLE' && (
        <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-md">
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
        <div className="mb-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm flex items-center justify-between gap-2">
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
                {tableNo}
              </div>
            )}
          </div>
        </div>

        {/* Search Bar & View Options */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Search menu..."
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
            />
          </div>
          <div className="flex bg-white dark:bg-gray-800 rounded-xl p-1 border dark:border-gray-700 shadow-sm shrink-0">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}><List size={14} /></button>
            <button onClick={() => setViewMode(2)} className={`px-2 py-1.5 rounded-lg transition-all text-[10px] font-black ${viewMode === 2 ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}>2</button>
            <button onClick={() => setViewMode(3)} className={`px-2 py-1.5 rounded-lg transition-all text-[10px] font-black ${viewMode === 3 ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400'}`}>3</button>
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

              {viewMode === 'list' ? (
                <div className="space-y-2">
                  {res.menu.filter(item => !item.isArchived && item.name.toLowerCase().includes(customerSearch.toLowerCase())).map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleInitialAdd(item, res.id)}
                      className="w-full flex items-center gap-3 p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:border-orange-500 transition-all text-left"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{item.category}</span>
                        <h4 className="text-xs font-black text-gray-900 dark:text-white leading-tight line-clamp-1">{item.name}</h4>
                        <p className="font-black text-orange-500 text-xs">RM{item.price.toFixed(2)}</p>
                      </div>
                      <div className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black text-[9px] uppercase tracking-tighter shrink-0">
                        Add
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`grid gap-3 md:gap-6 ${viewMode === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {res.menu.filter(item => !item.isArchived && item.name.toLowerCase().includes(customerSearch.toLowerCase())).map(item => (
                    <div key={item.id} className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col">
                      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-700">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-lg text-[8px] font-black text-white shadow-sm uppercase tracking-widest">
                          {item.category}
                        </div>
                      </div>
                      <div className="p-2 md:p-4 flex-1 flex flex-col">
                        <div className="mb-2">
                          <h4 className={`font-black text-gray-900 dark:text-white leading-tight line-clamp-1 mb-1 ${viewMode === 3 ? 'text-[10px] md:text-sm' : 'text-xs md:text-base'}`}>{item.name}</h4>
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
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Item Options Modal */}
      {selectedItemForVariants && (
        <SimpleItemOptionsModal
          item={selectedItemForVariants.item}
          restaurantId={selectedItemForVariants.resId}
          modifiers={restaurants.find(r => r.id === selectedItemForVariants.resId)?.modifiers as ModifierData[] | undefined}
          onClose={() => setSelectedItemForVariants(null)}
          onConfirm={(cartItem) => {
            onAddToCart(cartItem);
            setSelectedItemForVariants(null);
          }}
        />
      )}

      {/* Cart Drawer Button */}
{cart.length > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[340px] px-4 z-50">
    <button 
      onClick={() => setShowCart(true)} 
      className={`w-full py-3 px-4 rounded-2xl shadow-2xl flex items-center justify-between transition-all border-2 ${
        offlineCartItems.length > 0 
          ? 'bg-red-600 text-white border-red-400' 
          : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-orange-500'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shadow-lg">
          {cart.length}
        </div>
        <span className="font-black text-[10px] uppercase tracking-widest">
          View Tray
        </span>
      </div>
      <span className="font-black text-lg">RM{cartTotal.toFixed(2)}</span>
    </button>
  </div>
)}

      {/* Cart Drawer Modal */}
{showCart && (
  <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex justify-end">
    <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full flex flex-col">
      <div className="p-6 border-b flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest">Your Tray</h2>
        <button onClick={() => setShowCart(false)} className="p-3"><X size={24} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {cart.map((item, idx) => (
          <div key={idx} className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border">
            {/* Food Image - Fixed */}
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
              <img 
                src={item.image || 'https://picsum.photos/seed/default/100/100'} 
                alt={item.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/default/100/100';
                }}
              />
            </div>
            
            <div className="flex-1">
              <p className="font-black text-sm uppercase">{item.name}</p>
              
              {/* Size/Temperature/Other Variant Indicators */}
              <div className="flex flex-wrap gap-1 mt-1">
                {item.selectedSize && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">
                    {item.selectedSize}
                  </span>
                )}
                {item.selectedOtherVariant && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">
                    {item.selectedOtherVariant}
                  </span>
                )}
                {item.selectedTemp && (
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                    item.selectedTemp === 'Hot' 
                      ? 'bg-orange-100 text-orange-600' 
                      : 'bg-blue-100 text-blue-600'
                  }`}>
                    {item.selectedTemp}
                  </span>
                )}
              </div>

              {/* Add-Ons Indicators - Fixed */}
              {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Add-ons:</p>
                  {item.selectedAddOns.map((addon, i) => (
                    <div key={i} className="flex justify-between text-[9px] pl-2 border-l-2 border-orange-200">
                      <span className="font-bold text-gray-600 dark:text-gray-300">
                        x{addon.quantity} {addon.name}
                      </span>
                      <span className="font-black text-orange-500">
                        RM{(addon.price * addon.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price and Quantity Controls */}
            <div className="text-right min-w-[80px]">
              <p className="font-black text-orange-500 text-xs">
                RM{(item.price * item.quantity).toFixed(2)}
              </p>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button 
                  onClick={() => onRemoveFromCart(item.id)} 
                  className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all"
                >
                  <Minus size={12}/>
                </button>
                <span className="font-black text-xs w-4 text-center dark:text-white">
                  {item.quantity}
                </span>
                <button 
                  onClick={() => onAddToCart(item)} 
                  className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-green-500 hover:bg-green-500 hover:text-white transition-all"
                >
                  <Plus size={12}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Total and Checkout */}
      <div className="p-8 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
          <span className="font-black dark:text-white">RM{cartTotal.toFixed(2)}</span>
        </div>
        
        <div className="mb-4">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
            Special Instructions
          </label>
          <textarea
            value={orderRemark}
            onChange={(e) => setOrderRemark(e.target.value)}
            placeholder="Any special requests? (e.g., no spicy, extra sauce)"
            className="w-full p-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl text-xs font-medium dark:text-white resize-none"
            rows={2}
          />
        </div>

        <button 
          onClick={() => { 
            onPlaceOrder(orderRemark); 
            setShowCart(false); 
            setOrderRemark('');
          }} 
          className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-orange-600 transition-all active:scale-95 shadow-lg"
        >
          Place Order • RM{cartTotal.toFixed(2)}
        </button>
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
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

export default CustomerView;
