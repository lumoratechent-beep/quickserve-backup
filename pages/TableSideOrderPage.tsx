import React, { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Hash, LogOut, Minus, Plus, Search, ShoppingCart, Trash2, UtensilsCrossed, X } from 'lucide-react';
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
  const [gridColumns, setGridColumns] = useState<2 | 3 | 6 | 8>(3);
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

  const latestTableOrder = tableOrders[0] || null;

  const groupedMenu = useMemo(() => {
    return filteredMenu.reduce<Record<string, MenuItem[]>>((groups, item) => {
      const category = item.category || 'Uncategorized';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
      return groups;
    }, {});
  }, [filteredMenu]);

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

      <div className="flex-1 min-h-0 flex">
        <section className="min-w-0 flex-1 flex flex-col overflow-hidden">
          <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 lg:px-5 py-2 lg:py-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-1">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${!activeCategory ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  All
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 p-1 rounded-xl shadow-sm">
                {[2, 3, 6, 8].map(count => (
                  <button
                    key={count}
                    onClick={() => setGridColumns(count as 2 | 3 | 6 | 8)}
                    className={`p-2 rounded-lg transition-all text-[10px] font-black ${gridColumns === count ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    title={`${count} tiles`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search menu items..."
                className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-xs font-black dark:text-white outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 pb-24 lg:pb-2 scroll-smooth">
            {filteredMenu.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-40">
                <UtensilsCrossed size={40} />
                <p className="text-xs font-black uppercase tracking-widest mt-3">No items found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedMenu).map(([category, items]) => (
                  <section key={category}>
                    <div className="mb-2 text-center">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] whitespace-nowrap">{category}</h3>
                    </div>
                    <div className={`grid gap-1.5 ${
                      gridColumns === 2 ? 'grid-cols-2 lg:grid-cols-3' :
                      gridColumns === 3 ? 'grid-cols-3 lg:grid-cols-4' :
                      gridColumns === 6 ? 'grid-cols-3 lg:grid-cols-6' :
                      'grid-cols-4 lg:grid-cols-8'
                    }`}>
                      {items.map(item => {
                        const itemCount = cart.filter(cartItem => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.quantity, 0);
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleInitialAdd(item)}
                            className="relative bg-white dark:bg-gray-800 border dark:border-gray-700 text-left hover:border-orange-500 transition-all group shadow-sm flex p-2 rounded-xl flex-col"
                          >
                            {itemCount > 0 && (
                              <div className="absolute top-2 right-2 z-10 bg-orange-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                                {itemCount}
                              </div>
                            )}
                            <div className="aspect-square w-full rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0">
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-500">
                                  <UtensilsCrossed size={28} />
                                </div>
                              )}
                            </div>
                            <div className="mt-3">
                              <h4 className="font-black text-xs dark:text-white uppercase tracking-tighter mb-1 line-clamp-1">{item.name}</h4>
                              <p className="text-orange-500 font-black text-sm">RM{item.price.toFixed(2)}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="hidden lg:flex w-96 bg-white dark:bg-gray-800 border-l dark:border-gray-700 flex-col">
          <div className="p-4 border-b dark:border-gray-700">
            <div className="flex min-h-8 items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-black dark:text-white uppercase tracking-tighter text-sm leading-none">Current Order</h3>
              </div>
              <button
                onClick={handleClearDraft}
                disabled={cart.length === 0 && !editingOrderId}
                className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-400"
                title="Clear"
              >
                <Trash2 size={18} />
              </button>
            </div>
            {editingOrder && <p className="mt-2 text-[9px] font-black text-orange-500 uppercase tracking-widest">Editing #{editingOrder.id.slice(-7)}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                <ShoppingCart size={48} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Cart is empty</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter line-clamp-1">{item.name}</h4>
                    <p className="text-xs text-orange-500 font-black">RM{item.price.toFixed(2)}</p>
                    <div className="mt-1 space-y-0.5">
                      {item.selectedSize && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">Size: {item.selectedSize}</p>}
                      {item.selectedTemp && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">Temperature: {item.selectedTemp}</p>}
                      {item.selectedVariantOption && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">Variant: {item.selectedVariantOption}</p>}
                      {item.selectedOtherVariant && <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">{item.selectedOtherVariant}</p>}
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-bold">
                          Add-ons: {item.selectedAddOns.map(addon => `${addon.name} x${addon.quantity}`).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    <button onClick={() => handleRemoveFromCart(idx)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all" title="Decrease">
                      <Minus size={12} />
                    </button>
                    <span className="text-[10px] font-black w-4 text-center dark:text-white">{item.quantity}</span>
                    <button onClick={() => handleAddToCart(item)} className="p-1 hover:bg-white dark:hover:bg-gray-600 rounded shadow-sm transition-all" title="Increase">
                      <Plus size={12} />
                    </button>
                  </div>
                  <button onClick={() => handleDeleteFromCart(idx)} className="text-gray-300 hover:text-red-500" title="Delete item">
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-gray-50 dark:bg-gray-700/30 border-t dark:border-gray-700 space-y-4">
            <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subtotal</span>
              <span className="font-black dark:text-white">RM{cartTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-black dark:text-white tracking-tighter">
              <span className="uppercase">Total</span>
              <span className="text-orange-500">RM{cartTotal.toFixed(2)}</span>
            </div>
            </div>
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Remark</label>
              <textarea
                value={orderRemark}
                onChange={e => setOrderRemark(e.target.value)}
                placeholder="Any special requests?"
                className="w-full p-3 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-xl text-xs font-medium dark:text-white resize-none"
                rows={2}
              />
            </div>
            <div className="flex justify-between pb-2">
              <button
                onClick={() => latestTableOrder && handleEditOrder(latestTableOrder)}
                disabled={!latestTableOrder || isPlacing}
                className={`w-[47.5%] py-4 rounded-lg font-black text-[10px] uppercase tracking-[0.15em] transition-all disabled:opacity-50 ${
                  latestTableOrder
                    ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-xl shadow-blue-500/20'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                Edit Order
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacing || cart.length === 0}
                className="w-[47.5%] py-4 border-2 border-orange-700/70 dark:border-orange-300/60 bg-orange-500 text-white rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:shadow-none"
              >
                {isPlacing ? 'Sending...' : editingOrderId ? 'Save Changes' : 'Send to Kitchen'}
              </button>
            </div>
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
