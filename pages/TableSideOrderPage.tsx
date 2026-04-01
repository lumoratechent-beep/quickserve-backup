import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Restaurant, CartItem, Order, OrderStatus, MenuItem, ModifierData, OrderSource } from '../src/types';
import { ShoppingCart, Plus, Minus, X, Hash, LogOut, ChefHat, Search, LayoutGrid, List, Grid3X3, CheckCircle2, AlertCircle, Clock, XCircle, Tablet, ArrowLeft, Send, MessageSquare, UtensilsCrossed } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  cashierName?: string;
  onLogout: () => void;
  onPlaceOrder: (order: { items: CartItem[]; total: number; tableNumber: string; remark: string; orderSource: OrderSource }) => Promise<void>;
}

const TableSideOrderPage: React.FC<Props> = ({ restaurant, orders, cashierName, onLogout, onPlaceOrder }) => {
  // ---------- State ----------
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [orderRemark, setOrderRemark] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<{ item: MenuItem; resId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState<2 | 3>(3);
  const [isPlacing, setIsPlacing] = useState(false);
  const [recentOrderIds, setRecentOrderIds] = useState<string[]>([]);

  // ---------- Derived ----------
  const featureSettings = restaurant.settings?.features || {} as any;
  const tableCount = Math.max(1, Number(featureSettings.tableCount) || 12);
  const floorEnabled = !!featureSettings.floorEnabled;
  const floorCount = floorEnabled ? Math.min(5, Math.max(1, Number(featureSettings.floorCount) || 1)) : 1;
  const [selectedFloor, setSelectedFloor] = useState(1);

  const tableLabels = useMemo(() => {
    if (floorEnabled && floorCount > 1) {
      return Array.from({ length: tableCount }, (_, idx) => `F${selectedFloor}-T${idx + 1}`);
    }
    return Array.from({ length: tableCount }, (_, idx) => `Table ${idx + 1}`);
  }, [tableCount, floorEnabled, floorCount, selectedFloor]);

  const menu = useMemo(() => restaurant.menu.filter(item => !item.isArchived), [restaurant.menu]);
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menu.map(i => i.category))).filter(Boolean);
    return cats;
  }, [menu]);

  const filteredMenu = useMemo(() => {
    let items = menu;
    if (activeCategory) items = items.filter(i => i.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return items;
  }, [menu, activeCategory, searchQuery]);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Orders for selected table (recent)
  const tableOrders = useMemo(() => {
    if (!selectedTable) return [];
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    return orders.filter(o =>
      o.restaurantId === restaurant.id &&
      o.tableNumber === selectedTable &&
      o.timestamp > thirtyMinAgo
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, selectedTable, restaurant.id]);

  // ---------- Handlers ----------
  const handleAddToCart = useCallback((item: CartItem) => {
    setCart(prev => {
      // Build a unique key from id + variant selections
      const key = [item.id, item.selectedSize, item.selectedTemp, item.selectedOtherVariant, item.selectedVariantOption,
        JSON.stringify(item.selectedAddOns || []), JSON.stringify(item.selectedModifiers || {})].join('|');
      const existingIdx = prev.findIndex(c => {
        const ck = [c.id, c.selectedSize, c.selectedTemp, c.selectedOtherVariant, c.selectedVariantOption,
          JSON.stringify(c.selectedAddOns || []), JSON.stringify(c.selectedModifiers || {})].join('|');
        return ck === key;
      });
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + (item.quantity || 1) };
        return copy;
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
  }, []);

  const handleRemoveFromCart = useCallback((idx: number) => {
    setCart(prev => {
      const copy = [...prev];
      if (copy[idx].quantity > 1) {
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity - 1 };
      } else {
        copy.splice(idx, 1);
      }
      return copy;
    });
  }, []);

  const handleInitialAdd = (item: MenuItem) => {
    const hasOptions =
      (item.sizes && item.sizes.length > 0) ||
      (item.tempOptions && item.tempOptions.enabled) ||
      (item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0) ||
      (item.addOns && item.addOns.length > 0) ||
      (item.variantOptions?.enabled && item.variantOptions?.options && item.variantOptions.options.length > 0) ||
      (item.linkedModifiers && item.linkedModifiers.length > 0);

    if (hasOptions) {
      setSelectedItemForVariants({ item, resId: restaurant.id });
    } else {
      handleAddToCart({ ...item, quantity: 1, restaurantId: restaurant.id });
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedTable || cart.length === 0 || isPlacing) return;
    setIsPlacing(true);
    try {
      await onPlaceOrder({
        items: cart,
        total: cartTotal,
        tableNumber: selectedTable,
        remark: orderRemark,
        orderSource: 'tableside',
      });
      setRecentOrderIds([]); // will be updated by orders prop
      setCart([]);
      setOrderRemark('');
      setShowCart(false);
      toast('Order placed successfully!', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to place order', 'error');
    } finally {
      setIsPlacing(false);
    }
  };

  const handleBackToTables = () => {
    if (cart.length > 0) {
      if (!confirm('You have items in your cart. Go back to table selection? Cart will be cleared.')) return;
    }
    setCart([]);
    setOrderRemark('');
    setSearchQuery('');
    setActiveCategory(null);
    setSelectedTable(null);
  };

  // ---------- Table Selection View ----------
  if (!selectedTable) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img src={restaurant.logo} className="w-10 h-10 rounded-xl shadow-sm" />
            <div>
              <h1 className="font-black text-sm uppercase tracking-tight dark:text-white">{restaurant.name}</h1>
              <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Tableside Ordering</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{cashierName}</span>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Table Selection */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-black dark:text-white uppercase tracking-tight">Select a Table</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose the table you're taking the order for</p>
            </div>

            {/* Floor Tabs */}
            {floorEnabled && floorCount > 1 && (
              <div className="flex items-center gap-2 mb-4 overflow-x-auto">
                {Array.from({ length: floorCount }, (_, i) => i + 1).map(f => (
                  <button
                    key={f}
                    onClick={() => setSelectedFloor(f)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      selectedFloor === f
                        ? 'bg-orange-500 text-white shadow-lg'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    Floor {f}
                  </button>
                ))}
              </div>
            )}

            {/* Table Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {tableLabels.map((label) => {
                // Check if table has active orders
                const activeOrdersForTable = orders.filter(o =>
                  o.restaurantId === restaurant.id &&
                  o.tableNumber === label &&
                  (o.status === OrderStatus.PENDING || o.status === OrderStatus.ONGOING) &&
                  o.timestamp > Date.now() - 60 * 60 * 1000
                );
                const hasActive = activeOrdersForTable.length > 0;

                return (
                  <button
                    key={label}
                    onClick={() => setSelectedTable(label)}
                    className={`relative p-4 rounded-2xl border-2 transition-all text-center hover:scale-105 active:scale-95 ${
                      hasActive
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 hover:border-orange-500'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600'
                    }`}
                  >
                    <Hash size={16} className={`mx-auto mb-1 ${hasActive ? 'text-orange-500' : 'text-gray-400'}`} />
                    <p className={`text-xs font-black uppercase tracking-tight ${hasActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {label}
                    </p>
                    {hasActive && (
                      <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                        {activeOrdersForTable.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Menu / Ordering View ----------
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={handleBackToTables}
          className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <img src={restaurant.logo} className="w-8 h-8 rounded-lg shadow-sm" />
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-sm uppercase tracking-tight dark:text-white truncate">{restaurant.name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Tableside</span>
            <span className="text-[9px] font-black text-gray-400">•</span>
            <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{cashierName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-tighter">
            <Hash size={12} className="text-orange-500" />
            {selectedTable}
          </div>

        </div>
      </header>

      {/* Category Tabs + Search */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl text-xs font-medium dark:text-white"
            />
          </div>
          <button
            onClick={() => setGridColumns(prev => prev === 3 ? 2 : 3)}
            className="p-2 bg-gray-50 dark:bg-gray-700 text-gray-400 rounded-xl hover:text-orange-500 transition-colors border dark:border-gray-600"
          >
            {gridColumns === 3 ? <LayoutGrid size={16} /> : <Grid3X3 size={16} />}
          </button>
        </div>
        <nav className="overflow-x-auto hide-scrollbar flex items-center gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              !activeCategory ? 'bg-orange-500 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                activeCategory === cat ? 'bg-orange-500 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </nav>
      </div>

      {/* Active Orders for this Table */}
      {tableOrders.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/10 border-b border-orange-200 dark:border-orange-900/30 px-4 py-2 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            <span className="text-[9px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-widest whitespace-nowrap">Active:</span>
            {tableOrders.slice(0, 5).map(o => (
              <div key={o.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                o.status === OrderStatus.PENDING ? 'bg-yellow-100 text-yellow-700' :
                o.status === OrderStatus.ONGOING ? 'bg-blue-100 text-blue-700' :
                o.status === OrderStatus.SERVED ? 'bg-green-100 text-green-700' :
                o.status === OrderStatus.CANCELLED ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {o.status === OrderStatus.PENDING && <Clock size={10} />}
                {o.status === OrderStatus.ONGOING && <ChefHat size={10} />}
                {o.status === OrderStatus.SERVED && <CheckCircle2 size={10} />}
                {o.status === OrderStatus.CANCELLED && <XCircle size={10} />}
                {o.id} — {o.status}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredMenu.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <UtensilsCrossed size={40} />
            <p className="text-xs font-black uppercase tracking-widest mt-3">No items found</p>
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColumns === 3 ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {filteredMenu.map(item => {
              const itemCount = cart.filter(c => c.id === item.id).reduce((s, c) => s + c.quantity, 0);
              return (
                <button
                  key={item.id}
                  onClick={() => handleInitialAdd(item)}
                  className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col text-left active:scale-95 relative"
                >
                  {itemCount > 0 && (
                    <div className="absolute top-2 right-2 z-10 bg-orange-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                      {itemCount}
                    </div>
                  )}
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-700">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-lg text-[7px] font-black text-white shadow-sm uppercase tracking-widest">
                      {item.category}
                    </div>
                  </div>
                  <div className="p-2 md:p-3 flex-1 flex flex-col">
                    <h4 className={`font-black text-gray-900 dark:text-white leading-tight line-clamp-2 mb-1 ${gridColumns === 3 ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm'}`}>
                      {item.name}
                    </h4>
                    <p className="font-black text-orange-500 text-xs md:text-sm mt-auto">
                      RM{item.price.toFixed(2)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Item Options Modal */}
      {selectedItemForVariants && (
        <SimpleItemOptionsModal
          item={selectedItemForVariants.item}
          restaurantId={selectedItemForVariants.resId}
          modifiers={restaurant.modifiers as ModifierData[] | undefined}
          onClose={() => setSelectedItemForVariants(null)}
          onConfirm={(cartItem) => {
            handleAddToCart(cartItem);
            setSelectedItemForVariants(null);
          }}
        />
      )}

      {/* Cart FAB */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[380px] px-4 z-50">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-3 px-5 rounded-2xl shadow-2xl flex items-center justify-between bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-2 border-orange-500 active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shadow-lg">
                {cartCount}
              </div>
              <span className="font-black text-[10px] uppercase tracking-widest">View Order</span>
            </div>
            <span className="font-black text-lg">RM{cartTotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {showCart && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full flex flex-col">
            {/* Cart Header */}
            <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest dark:text-white">Order for {selectedTable}</h2>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{cartCount} items • RM{cartTotal.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowCart(false)} className="p-3 text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border dark:border-gray-700">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs uppercase dark:text-white truncate">{item.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.selectedSize && <span className="text-[8px] font-black px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">{item.selectedSize}</span>}
                      {item.selectedOtherVariant && <span className="text-[8px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.selectedOtherVariant}</span>}
                      {item.selectedTemp && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.selectedTemp === 'Hot' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>{item.selectedTemp}</span>}
                    </div>
                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {item.selectedAddOns.map((addon, i) => (
                          <div key={i} className="flex justify-between text-[8px] pl-2 border-l-2 border-orange-200">
                            <span className="font-bold text-gray-500">x{addon.quantity} {addon.name}</span>
                            <span className="font-black text-orange-500">+RM{(addon.price * addon.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-orange-500 text-[11px]">RM{(item.price * item.quantity).toFixed(2)}</p>
                    <div className="flex items-center justify-end gap-1.5 mt-2">
                      <button onClick={() => handleRemoveFromCart(idx)} className="p-1 bg-white dark:bg-gray-700 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all">
                        <Minus size={12} />
                      </button>
                      <span className="font-black text-[11px] w-4 text-center dark:text-white">{item.quantity}</span>
                      <button onClick={() => handleAddToCart(item)} className="p-1 bg-white dark:bg-gray-700 rounded-lg text-green-500 hover:bg-green-500 hover:text-white transition-all">
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout */}
            <div className="p-5 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
                <span className="font-black dark:text-white">RM{cartTotal.toFixed(2)}</span>
              </div>
              <div className="mb-3">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Special Instructions</label>
                <textarea
                  value={orderRemark}
                  onChange={e => setOrderRemark(e.target.value)}
                  placeholder="Any special requests?"
                  className="w-full p-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl text-xs font-medium dark:text-white resize-none"
                  rows={2}
                />
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacing || cart.length === 0}
                className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-orange-600 transition-all active:scale-95 shadow-lg disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isPlacing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={16} />
                    Send to Kitchen • RM{cartTotal.toFixed(2)}
                  </>
                )}
              </button>
            </div>
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

export default TableSideOrderPage;
