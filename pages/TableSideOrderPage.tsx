import React, { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Hash, LogOut, Minus, Plus, Search, Send, ShoppingCart, UtensilsCrossed, X } from 'lucide-react';
import { Restaurant, CartItem, Order, OrderStatus, MenuItem, ModifierData, OrderSource } from '../src/types';
import { supabase } from '../lib/supabase';
import SimpleItemOptionsModal from '../components/SimpleItemOptionsModal';
import { toast } from '../components/Toast';

interface Props {
  restaurant: Restaurant;
  orders: Order[];
  cashierName?: string;
  onLogout: () => void;
  onPlaceOrder: (order: { items: CartItem[]; total: number; tableNumber: string; remark: string; orderSource: OrderSource }) => Promise<void>;
  onUpdateOrderItems?: (orderId: string, items: CartItem[], total: number, remark?: string) => void;
  onUpdateOrderStatus?: (orderId: string, status: OrderStatus, reason?: string, note?: string) => void | Promise<void>;
  networkMeta?: {
    label: string;
    title: string;
    color: string;
    bars: number;
    mutedBars: boolean;
  };
  batteryMeta?: {
    percent: number;
    label: string;
    color: string;
  } | null;
  batteryCharging?: boolean;
}

const ACTIVE_TABLE_STATUSES = [OrderStatus.PENDING, OrderStatus.ONGOING, OrderStatus.SERVED];

const getItemKey = (item: CartItem) => [
  item.id,
  item.selectedSize,
  item.selectedTemp,
  item.selectedOtherVariant,
  item.selectedVariantOption,
  JSON.stringify(item.selectedAddOns || []),
  JSON.stringify(item.selectedModifiers || {}),
].join('|');

const TableSideOrderPage: React.FC<Props> = ({
  restaurant,
  orders,
  cashierName,
  onLogout,
  onPlaceOrder,
  onUpdateOrderItems,
  onUpdateOrderStatus,
  networkMeta,
  batteryMeta,
  batteryCharging = false,
}) => {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderRemark, setOrderRemark] = useState('');
  const [selectedItemForVariants, setSelectedItemForVariants] = useState<{ item: MenuItem; resId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState<2 | 3 | 6>(3);
  const [isPlacing, setIsPlacing] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const featureSettings = (restaurant.settings?.features || {}) as Record<string, any>;
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
  const categories = useMemo(() => Array.from(new Set(menu.map(i => i.category))).filter(Boolean), [menu]);

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

  const tableOrders = useMemo(() => {
    if (!selectedTable) return [];
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return orders
      .filter(order =>
        order.restaurantId === restaurant.id &&
        order.tableNumber === selectedTable &&
        ACTIVE_TABLE_STATUSES.includes(order.status) &&
        order.timestamp > oneDayAgo
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, selectedTable, restaurant.id]);

  const editingOrder = useMemo(() => (
    editingOrderId ? orders.find(order => order.id === editingOrderId) || null : null
  ), [orders, editingOrderId]);

  const handleAddToCart = useCallback((item: CartItem) => {
    setCart(prev => {
      const key = getItemKey(item);
      const existingIdx = prev.findIndex(cartItem => getItemKey(cartItem) === key);
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
      if (copy[idx].quantity > 1) copy[idx] = { ...copy[idx], quantity: copy[idx].quantity - 1 };
      else copy.splice(idx, 1);
      return copy;
    });
  }, []);

  const handleDeleteFromCart = useCallback((idx: number) => {
    setCart(prev => prev.filter((_, itemIdx) => itemIdx !== idx));
  }, []);

  const handleInitialAdd = (item: MenuItem) => {
    const hasOptions =
      (item.sizes && item.sizes.length > 0) ||
      (item.tempOptions && item.tempOptions.enabled) ||
      (item.otherVariantsEnabled && item.otherVariants && item.otherVariants.length > 0) ||
      (item.addOns && item.addOns.length > 0) ||
      (item.variantOptions?.enabled && item.variantOptions?.options && item.variantOptions.options.length > 0) ||
      (item.linkedModifiers && item.linkedModifiers.length > 0) ||
      (item.mixAndMatch?.enabled && item.mixAndMatch.selections.length > 0);

    if (hasOptions) setSelectedItemForVariants({ item, resId: restaurant.id });
    else handleAddToCart({ ...item, quantity: 1, restaurantId: restaurant.id });
  };

  const resetOrderDraft = () => {
    setCart([]);
    setOrderRemark('');
    setEditingOrderId(null);
  };

  const handleClearDraft = () => {
    if (cart.length > 0 && !confirm('Clear the current order summary?')) return;
    resetOrderDraft();
  };

  const handleBackToTables = () => {
    if (cart.length > 0 && !confirm('You have items in your order summary. Go back to table selection? The summary will be cleared.')) return;
    resetOrderDraft();
    setSearchQuery('');
    setActiveCategory(null);
    setSelectedTable(null);
  };

  const handleEditOrder = (order: Order) => {
    if (cart.length > 0 && editingOrderId !== order.id && !confirm('Replace the current order summary with this table order?')) return;
    setCart(order.items as CartItem[]);
    setOrderRemark(order.remark || '');
    setEditingOrderId(order.id);
  };

  const handleCancelActiveOrder = async (order: Order) => {
    if (!confirm(`Cancel order ${order.id}?`)) return;
    try {
      if (onUpdateOrderStatus) {
        await onUpdateOrderStatus(order.id, OrderStatus.CANCELLED, 'Cancelled by order taker', '');
      } else {
        const { error } = await supabase
          .from('orders')
          .update({ status: OrderStatus.CANCELLED, rejection_reason: 'Cancelled by order taker' })
          .eq('id', order.id);
        if (error) throw new Error(error.message);
      }
      if (editingOrderId === order.id) resetOrderDraft();
      toast('Order cancelled.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to cancel order', 'error');
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedTable || cart.length === 0 || isPlacing) return;
    setIsPlacing(true);
    try {
      if (editingOrderId) {
        const { error } = await supabase
          .from('orders')
          .update({ items: cart, total: cartTotal, remark: orderRemark })
          .eq('id', editingOrderId);
        if (error) throw new Error(error.message || 'Failed to update order');
        onUpdateOrderItems?.(editingOrderId, cart, cartTotal, orderRemark);
        toast('Order updated successfully!', 'success');
      } else {
        await onPlaceOrder({
          items: cart,
          total: cartTotal,
          tableNumber: selectedTable,
          remark: orderRemark,
          orderSource: 'tableside',
        });
        toast('Order placed successfully!', 'success');
      }

      resetOrderDraft();
      setSearchQuery('');
      setActiveCategory(null);
      setSelectedTable(null);
    } catch (err: any) {
      toast(err?.message || 'Failed to save order', 'error');
    } finally {
      setIsPlacing(false);
    }
  };

  const statusTools = networkMeta && (
    <div className="flex h-8 items-center gap-1 rounded-full bg-gray-100/80 px-1.5 dark:bg-gray-700/70">
      <div
        className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${networkMeta.color}`}
        title={networkMeta.title}
        aria-label={`Network ${networkMeta.label}`}
      >
        <div className="flex h-[18px] w-[18px] items-end justify-center gap-0.5 pb-0.5" aria-hidden="true">
          {[1, 2, 3].map(bar => (
            <span
              key={bar}
              className={`w-1 rounded-full transition-colors ${bar <= networkMeta.bars || !networkMeta.mutedBars ? 'bg-current' : 'bg-gray-300/80 dark:bg-gray-500/80'}`}
              style={{ height: `${bar * 4}px` }}
            />
          ))}
        </div>
      </div>
      {batteryMeta && (
        <div
          className={`flex h-6 w-7 items-center justify-center rounded-full transition-colors ${batteryMeta.color}`}
          title={batteryMeta.label}
          aria-label={batteryMeta.label}
        >
          <div className="flex h-[18px] w-[18px] items-center justify-center" aria-hidden="true">
            <div className="relative h-3 w-5 rounded-[3px] border-2 border-current p-0.5">
              <span className="block h-full rounded-[1px] bg-current transition-all" style={{ width: batteryMeta.percent > 0 ? `${Math.max(batteryMeta.percent, 8)}%` : '0%' }} />
              {batteryCharging && <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black leading-none text-white">+</span>}
            </div>
            <span className="h-1.5 w-0.5 shrink-0 rounded-r bg-current" />
          </div>
        </div>
      )}
    </div>
  );

  const renderHeader = (withBackButton: boolean) => (
    <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center gap-3 shrink-0">
      {withBackButton && (
        <button
          onClick={handleBackToTables}
          className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500 transition-all"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
      )}
      <img
        src={restaurant.logo}
        className="w-8 h-8 rounded-lg shadow-sm"
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="%23fed7aa"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-weight="900" fill="%23f97316">${restaurant.name?.charAt(0) || 'R'}</text></svg>`)}`;
        }}
        alt=""
      />
      <div className="flex-1 min-w-0">
        <h1 className="font-black text-sm uppercase tracking-tight dark:text-white truncate">{restaurant.name}</h1>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Tableside</span>
          {withBackButton && (
            <>
              <span className="text-[9px] font-black text-gray-400">-</span>
              <span className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">{cashierName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusTools}
        {selectedTable && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-black text-[10px] uppercase tracking-tighter">
            <Hash size={12} className="text-orange-500" />
            {selectedTable}
          </div>
        )}
        {!withBackButton && <span className="hidden sm:inline text-[10px] font-black text-gray-400 uppercase tracking-widest">{cashierName}</span>}
        <button
          onClick={onLogout}
          className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );

  if (!selectedTable) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
        {renderHeader(false)}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-black dark:text-white uppercase tracking-tight">Select a Table</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Choose the table you're taking the order for</p>
            </div>

            {floorEnabled && floorCount > 1 && (
              <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
                {Array.from({ length: floorCount }, (_, i) => i + 1).map(floor => (
                  <button
                    key={floor}
                    onClick={() => setSelectedFloor(floor)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      selectedFloor === floor
                        ? 'bg-orange-500 text-white shadow-lg'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border dark:border-gray-700 hover:border-orange-300'
                    }`}
                  >
                    Floor {floor}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {tableLabels.map(label => {
                const activeOrdersForTable = orders.filter(order =>
                  order.restaurantId === restaurant.id &&
                  order.tableNumber === label &&
                  ACTIVE_TABLE_STATUSES.includes(order.status) &&
                  order.timestamp > Date.now() - 24 * 60 * 60 * 1000
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
                    <p className={`text-xs font-black uppercase tracking-tight ${hasActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>{label}</p>
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

        <style>{`
          .hide-scrollbar::-webkit-scrollbar { display: none; }
          .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors">
      {renderHeader(true)}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <section className="min-h-0 flex flex-col lg:basis-4/5 lg:max-w-[80%] border-r border-gray-200 dark:border-gray-700">
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
              <div className="flex items-center gap-1 p-1 bg-gray-50 dark:bg-gray-700 rounded-xl border dark:border-gray-600">
                {[2, 3, 6].map(count => (
                  <button
                    key={count}
                    onClick={() => setGridColumns(count as 2 | 3 | 6)}
                    className={`h-8 min-w-8 px-2 rounded-lg text-[10px] font-black transition-all ${gridColumns === count ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:text-orange-500'}`}
                    title={`${count} tiles`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <nav className="overflow-x-auto hide-scrollbar flex items-center gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!activeCategory ? 'bg-orange-500 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'}`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === cat ? 'bg-orange-500 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'}`}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {filteredMenu.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-40">
                <UtensilsCrossed size={40} />
                <p className="text-xs font-black uppercase tracking-widest mt-3">No items found</p>
              </div>
            ) : (
              <div className={`grid gap-3 ${
                gridColumns === 6
                  ? 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-6'
                  : gridColumns === 3
                    ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                    : 'grid-cols-2 md:grid-cols-3'
              }`}>
                {filteredMenu.map(item => {
                  const itemCount = cart.filter(cartItem => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.quantity, 0);
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
                        <h4 className={`font-black text-gray-900 dark:text-white leading-tight line-clamp-2 mb-1 ${gridColumns === 6 ? 'text-[10px]' : gridColumns === 3 ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm'}`}>
                          {item.name}
                        </h4>
                        <p className="font-black text-orange-500 text-xs md:text-sm mt-auto">RM{item.price.toFixed(2)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="min-h-0 flex flex-col bg-white dark:bg-gray-900 lg:basis-1/5 lg:max-w-[20%] border-t lg:border-t-0 border-gray-200 dark:border-gray-700">
          <div className="p-3 border-b dark:border-gray-700">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-xs font-black uppercase tracking-widest dark:text-white truncate">{editingOrderId ? `Edit ${editingOrderId}` : `Order ${selectedTable}`}</h2>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{cartCount} items - RM{cartTotal.toFixed(2)}</p>
              </div>
              {(cart.length > 0 || editingOrderId) && (
                <button onClick={handleClearDraft} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all" title="Clear">
                  <X size={16} />
                </button>
              )}
            </div>
            {editingOrder && (
              <p className="mt-2 inline-flex px-2 py-1 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 text-[9px] font-black uppercase tracking-widest">
                {editingOrder.status}
              </p>
            )}
          </div>

          {tableOrders.length > 0 && (
            <div className="p-3 border-b dark:border-gray-700 space-y-2">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Table Orders</p>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {tableOrders.map(order => (
                  <div key={order.id} className={`rounded-xl border p-2 ${editingOrderId === order.id ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20' : 'border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black dark:text-white truncate">{order.id}</span>
                      <span className="text-[8px] font-black text-gray-400 uppercase">{order.status}</span>
                    </div>
                    <p className="text-[9px] font-bold text-gray-500 dark:text-gray-400 mt-0.5">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items - RM{order.total.toFixed(2)}</p>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      <button onClick={() => handleEditOrder(order)} className="py-1.5 rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-[8px] font-black uppercase tracking-widest">
                        Edit
                      </button>
                      <button onClick={() => handleCancelActiveOrder(order)} className="py-1.5 rounded-lg bg-red-50 text-red-500 dark:bg-red-900/20 text-[8px] font-black uppercase tracking-widest">
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 min-h-[180px] overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-gray-300 dark:text-gray-600">
                <ShoppingCart size={28} />
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest">No items</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2">
                  <div className="flex gap-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[10px] uppercase dark:text-white truncate">{item.name}</p>
                      <p className="font-black text-orange-500 text-[10px]">RM{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                    <button onClick={() => handleDeleteFromCart(idx)} className="self-start p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete item">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.selectedSize && <span className="text-[8px] font-black px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">{item.selectedSize}</span>}
                    {item.selectedOtherVariant && <span className="text-[8px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">{item.selectedOtherVariant}</span>}
                    {item.selectedTemp && <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.selectedTemp === 'Hot' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>{item.selectedTemp}</span>}
                  </div>
                  {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.selectedAddOns.map((addon, i) => (
                        <div key={i} className="flex justify-between text-[8px] pl-2 border-l-2 border-orange-200">
                          <span className="font-bold text-gray-500 truncate">x{addon.quantity} {addon.name}</span>
                          <span className="font-black text-orange-500">+RM{(addon.price * addon.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <button onClick={() => handleRemoveFromCart(idx)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all" title="Decrease">
                      <Minus size={12} />
                    </button>
                    <span className="font-black text-[11px] text-center dark:text-white">x{item.quantity}</span>
                    <button onClick={() => handleAddToCart(item)} className="p-1.5 bg-white dark:bg-gray-700 rounded-lg text-green-500 hover:bg-green-500 hover:text-white transition-all" title="Increase">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
              <span className="font-black dark:text-white">RM{cartTotal.toFixed(2)}</span>
            </div>
            <div className="mb-3">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Remark</label>
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
              className="w-full py-3 bg-orange-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-orange-600 transition-all active:scale-95 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 text-[10px]"
            >
              {isPlacing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={14} />
                  {editingOrderId ? 'Save Order' : 'Send to Kitchen'}
                </>
              )}
            </button>
          </div>
        </aside>
      </div>

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

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default TableSideOrderPage;
