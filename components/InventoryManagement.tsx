import React, { useState, useMemo } from 'react';
import { Restaurant, MenuItem } from '../src/types';
import {
  Package, Truck, ArrowUpDown, ClipboardList, Factory,
  History, DollarSign, Plus, Search, Edit3, Trash2, Check, X, ChevronRight,
  ArrowLeft, Eye, Send, Download, Upload, AlertCircle, CheckCircle, XCircle,
  Clock, FileText, BarChart3,
} from 'lucide-react';

// ─── Inventory Types ───
interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

interface PurchaseOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  costPerUnit: number;
  receivedQuantity: number;
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  createdAt: number;
  expectedDate: string;
  receivedDate?: string;
  notes: string;
}

interface TransferOrder {
  id: string;
  fromStore: string;
  toStore: string;
  items: { menuItemId: string; name: string; quantity: number }[];
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
  notes: string;
}

interface StockAdjustment {
  id: string;
  menuItemId: string;
  itemName: string;
  type: 'increase' | 'decrease';
  quantity: number;
  reason: 'received' | 'damaged' | 'loss' | 'correction' | 'other';
  notes: string;
  timestamp: number;
  previousStock: number;
  newStock: number;
}

interface InventoryCountItem {
  menuItemId: string;
  name: string;
  category: string;
  expectedStock: number;
  countedStock: number | null;
  variance: number;
}

interface InventoryCount {
  id: string;
  type: 'full' | 'partial';
  items: InventoryCountItem[];
  status: 'in_progress' | 'completed';
  startedAt: number;
  completedAt?: number;
  notes: string;
}

interface Production {
  id: string;
  producedItemName: string;
  quantityProduced: number;
  ingredients: { name: string; quantityUsed: number; unit: string }[];
  timestamp: number;
  notes: string;
}

interface InventoryHistoryEntry {
  id: string;
  action: string;
  itemName: string;
  quantity: number;
  type: 'in' | 'out' | 'adjust';
  timestamp: number;
  reference: string;
}

type InventorySubTab =
  | 'purchase_orders'
  | 'transfer_orders'
  | 'stock_adjustments'
  | 'inventory_counts'
  | 'productions'
  | 'inventory_history'
  | 'inventory_valuation';

interface Props {
  restaurant: Restaurant;
  currencySymbol: string;
}

const InventoryManagement: React.FC<Props> = ({ restaurant, currencySymbol }) => {
  const [subTab, setSubTab] = useState<InventorySubTab>('purchase_orders');
  const storeKey = (key: string) => `inv_${restaurant.id}_${key}`;

  // ─── Persistent state helpers ───
  const loadState = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(storeKey(key));
      return saved ? JSON.parse(saved) : fallback;
    } catch { return fallback; }
  };
  const saveState = <T,>(key: string, data: T) => {
    localStorage.setItem(storeKey(key), JSON.stringify(data));
  };

  // ─── State ───
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadState('suppliers', []));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => loadState('purchase_orders', []));
  const [transferOrders, setTransferOrders] = useState<TransferOrder[]>(() => loadState('transfer_orders', []));
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(() => loadState('adjustments', []));
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>(() => loadState('counts', []));
  const [productions, setProductions] = useState<Production[]>(() => loadState('productions', []));
  const [historyLog, setHistoryLog] = useState<InventoryHistoryEntry[]>(() => loadState('history', []));

  // ─── Modal/Form States ───
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Purchase order form
  const [poForm, setPoForm] = useState<{ supplierId: string; expectedDate: string; notes: string; items: PurchaseOrderItem[] }>({
    supplierId: '', expectedDate: '', notes: '', items: [],
  });

  // Transfer order form
  const [toForm, setToForm] = useState<{ fromStore: string; toStore: string; notes: string; items: { menuItemId: string; name: string; quantity: number }[] }>({
    fromStore: restaurant.name, toStore: '', notes: '', items: [],
  });

  // Adjustment form
  const [adjForm, setAdjForm] = useState<{ menuItemId: string; type: 'increase' | 'decrease'; quantity: string; reason: StockAdjustment['reason']; notes: string }>({
    menuItemId: '', type: 'increase', quantity: '', reason: 'received', notes: '',
  });

  // Production form
  const [prodForm, setProdForm] = useState<{ producedItemName: string; quantityProduced: string; notes: string; ingredients: { name: string; quantityUsed: string; unit: string }[] }>({
    producedItemName: '', quantityProduced: '', notes: '', ingredients: [{ name: '', quantityUsed: '', unit: 'pcs' }],
  });

  const activeMenuItems = useMemo(() => restaurant.menu.filter(m => !m.isArchived), [restaurant.menu]);

  // ─── History Logger ───
  const addHistory = (entry: Omit<InventoryHistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: InventoryHistoryEntry = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() };
    const updated = [newEntry, ...historyLog].slice(0, 500);
    setHistoryLog(updated);
    saveState('history', updated);
  };

  // ─── Stock values from localStorage ───
  const getStockItems = () => {
    try {
      const saved = localStorage.getItem(`stock_${restaurant.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };

  const updateStockItem = (menuItemId: string, delta: number) => {
    const stockItems = getStockItems();
    const updated = stockItems.map((s: any) =>
      s.menuItemId === menuItemId ? { ...s, currentStock: Math.max(0, s.currentStock + delta), lastRestocked: delta > 0 ? Date.now() : s.lastRestocked } : s
    );
    localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(updated));
  };

  const getStockLevel = (menuItemId: string): number => {
    const stockItems = getStockItems();
    const item = stockItems.find((s: any) => s.menuItemId === menuItemId);
    return item?.currentStock ?? 0;
  };

  // ════════════════════════════════════════
  // PURCHASE ORDER HANDLERS
  // ════════════════════════════════════════
  const handleSavePurchaseOrder = () => {
    if (!poForm.supplierId || poForm.items.length === 0) return;
    const supplier = suppliers.find(s => s.id === poForm.supplierId);
    const newPO: PurchaseOrder = {
      id: crypto.randomUUID(),
      supplierId: poForm.supplierId,
      supplierName: supplier?.name || 'Unknown',
      items: poForm.items,
      status: 'draft',
      createdAt: Date.now(),
      expectedDate: poForm.expectedDate,
      notes: poForm.notes,
    };
    const updated = [newPO, ...purchaseOrders];
    setPurchaseOrders(updated);
    saveState('purchase_orders', updated);
    addHistory({ action: 'Purchase order created', itemName: `PO-${newPO.id.slice(-6)}`, quantity: poForm.items.reduce((s, i) => s + i.quantity, 0), type: 'in', reference: newPO.id });
    setPoForm({ supplierId: '', expectedDate: '', notes: '', items: [] });
    setShowForm(false);
  };

  const handleUpdatePOStatus = (poId: string, newStatus: PurchaseOrder['status']) => {
    const updated = purchaseOrders.map(po => {
      if (po.id !== poId) return po;
      const updatedPO = { ...po, status: newStatus };
      if (newStatus === 'received') {
        updatedPO.receivedDate = new Date().toISOString().split('T')[0];
        po.items.forEach(item => {
          updateStockItem(item.menuItemId, item.quantity);
          addHistory({ action: 'Stock received (PO)', itemName: item.name, quantity: item.quantity, type: 'in', reference: poId });
        });
      }
      return updatedPO;
    });
    setPurchaseOrders(updated);
    saveState('purchase_orders', updated);
  };

  // ════════════════════════════════════════
  // TRANSFER ORDER HANDLERS
  // ════════════════════════════════════════
  const handleSaveTransferOrder = () => {
    if (!toForm.toStore.trim() || toForm.items.length === 0) return;
    const newTO: TransferOrder = {
      id: crypto.randomUUID(),
      fromStore: toForm.fromStore,
      toStore: toForm.toStore,
      items: toForm.items,
      status: 'pending',
      createdAt: Date.now(),
      notes: toForm.notes,
    };
    const updated = [newTO, ...transferOrders];
    setTransferOrders(updated);
    saveState('transfer_orders', updated);
    addHistory({ action: 'Transfer order created', itemName: `TO-${newTO.id.slice(-6)}`, quantity: toForm.items.reduce((s, i) => s + i.quantity, 0), type: 'out', reference: newTO.id });
    setToForm({ fromStore: restaurant.name, toStore: '', notes: '', items: [] });
    setShowForm(false);
  };

  const handleUpdateTOStatus = (toId: string, newStatus: TransferOrder['status']) => {
    const updated = transferOrders.map(to => {
      if (to.id !== toId) return to;
      const updatedTO = { ...to, status: newStatus };
      if (newStatus === 'in_transit') {
        to.items.forEach(item => {
          updateStockItem(item.menuItemId, -item.quantity);
          addHistory({ action: 'Stock transferred out', itemName: item.name, quantity: item.quantity, type: 'out', reference: toId });
        });
      }
      if (newStatus === 'completed') updatedTO.completedAt = Date.now();
      return updatedTO;
    });
    setTransferOrders(updated);
    saveState('transfer_orders', updated);
  };

  // ════════════════════════════════════════
  // STOCK ADJUSTMENT HANDLERS
  // ════════════════════════════════════════
  const handleSaveAdjustment = () => {
    const qty = parseInt(adjForm.quantity);
    if (!adjForm.menuItemId || isNaN(qty) || qty <= 0) return;
    const menuItem = activeMenuItems.find(m => m.id === adjForm.menuItemId);
    if (!menuItem) return;
    const prevStock = getStockLevel(adjForm.menuItemId);
    const delta = adjForm.type === 'increase' ? qty : -qty;
    updateStockItem(adjForm.menuItemId, delta);
    const adj: StockAdjustment = {
      id: crypto.randomUUID(),
      menuItemId: adjForm.menuItemId,
      itemName: menuItem.name,
      type: adjForm.type,
      quantity: qty,
      reason: adjForm.reason,
      notes: adjForm.notes,
      timestamp: Date.now(),
      previousStock: prevStock,
      newStock: Math.max(0, prevStock + delta),
    };
    const updated = [adj, ...adjustments];
    setAdjustments(updated);
    saveState('adjustments', updated);
    addHistory({ action: `Stock ${adjForm.type}d (${adjForm.reason})`, itemName: menuItem.name, quantity: qty, type: adjForm.type === 'increase' ? 'in' : 'out', reference: adj.id });
    setAdjForm({ menuItemId: '', type: 'increase', quantity: '', reason: 'received', notes: '' });
    setShowForm(false);
  };

  // ════════════════════════════════════════
  // INVENTORY COUNT HANDLERS
  // ════════════════════════════════════════
  const handleStartCount = (type: 'full' | 'partial') => {
    const items: InventoryCountItem[] = activeMenuItems.map(m => ({
      menuItemId: m.id,
      name: m.name,
      category: m.category,
      expectedStock: getStockLevel(m.id),
      countedStock: null,
      variance: 0,
    }));
    const newCount: InventoryCount = {
      id: crypto.randomUUID(),
      type,
      items,
      status: 'in_progress',
      startedAt: Date.now(),
      notes: '',
    };
    const updated = [newCount, ...inventoryCounts];
    setInventoryCounts(updated);
    saveState('counts', updated);
    setShowForm(false);
  };

  const handleUpdateCountItem = (countId: string, menuItemId: string, counted: number) => {
    const updated = inventoryCounts.map(c => {
      if (c.id !== countId) return c;
      const items = c.items.map(item =>
        item.menuItemId === menuItemId ? { ...item, countedStock: counted, variance: counted - item.expectedStock } : item
      );
      return { ...c, items };
    });
    setInventoryCounts(updated);
    saveState('counts', updated);
  };

  const handleCompleteCount = (countId: string) => {
    const count = inventoryCounts.find(c => c.id === countId);
    if (!count) return;
    count.items.forEach(item => {
      if (item.countedStock !== null && item.countedStock !== item.expectedStock) {
        const delta = item.countedStock - item.expectedStock;
        updateStockItem(item.menuItemId, delta);
        addHistory({ action: 'Stock adjusted (count)', itemName: item.name, quantity: Math.abs(delta), type: delta > 0 ? 'in' : 'out', reference: countId });
      }
    });
    const updated = inventoryCounts.map(c => c.id === countId ? { ...c, status: 'completed' as const, completedAt: Date.now() } : c);
    setInventoryCounts(updated);
    saveState('counts', updated);
  };

  const handleDeleteCount = (countId: string) => {
    if (!confirm('Delete this inventory count record?')) return;
    const updated = inventoryCounts.filter(c => c.id !== countId);
    setInventoryCounts(updated);
    saveState('counts', updated);
  };

  // ════════════════════════════════════════
  // PRODUCTION HANDLERS
  // ════════════════════════════════════════
  const handleSaveProduction = () => {
    const qty = parseInt(prodForm.quantityProduced);
    if (!prodForm.producedItemName.trim() || isNaN(qty) || qty <= 0) return;
    const prod: Production = {
      id: crypto.randomUUID(),
      producedItemName: prodForm.producedItemName,
      quantityProduced: qty,
      ingredients: prodForm.ingredients.filter(i => i.name.trim()).map(i => ({ name: i.name, quantityUsed: parseFloat(i.quantityUsed) || 0, unit: i.unit })),
      timestamp: Date.now(),
      notes: prodForm.notes,
    };
    const updated = [prod, ...productions];
    setProductions(updated);
    saveState('productions', updated);
    addHistory({ action: 'Production recorded', itemName: prod.producedItemName, quantity: qty, type: 'in', reference: prod.id });
    setProdForm({ producedItemName: '', quantityProduced: '', notes: '', ingredients: [{ name: '', quantityUsed: '', unit: 'pcs' }] });
    setShowForm(false);
  };

  // ─── Inventory Valuation ───
  const valuationData = useMemo(() => {
    const stockItems = getStockItems();
    return stockItems.map((s: any) => {
      const menuItem = restaurant.menu.find(m => m.id === s.menuItemId);
      const unitCost = menuItem?.price ? menuItem.price * 0.4 : 0; // Estimated cost ~40% of price
      return {
        ...s,
        price: menuItem?.price || 0,
        estimatedCost: unitCost,
        totalValue: s.currentStock * unitCost,
        retailValue: s.currentStock * (menuItem?.price || 0),
      };
    });
  }, [restaurant.menu]);

  const totalValuation = useMemo(() => {
    return valuationData.reduce((sum: number, item: any) => sum + item.totalValue, 0);
  }, [valuationData]);

  const totalRetailValue = useMemo(() => {
    return valuationData.reduce((sum: number, item: any) => sum + item.retailValue, 0);
  }, [valuationData]);

  const getIncomingQuantity = (menuItemId: string): number => {
    return purchaseOrders
      .filter(po => po.status === 'draft' || po.status === 'sent' || po.status === 'partial')
      .reduce((total, po) => {
        const item = po.items.find(i => i.menuItemId === menuItemId);
        return total + (item ? item.quantity - item.receivedQuantity : 0);
      }, 0);
  };

  // ─── Sub-tab navigation ───
  const subTabs: { key: InventorySubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'purchase_orders', label: 'Purchase Orders', icon: <FileText size={16} /> },
    { key: 'transfer_orders', label: 'Transfer Orders', icon: <Truck size={16} /> },
    { key: 'stock_adjustments', label: 'Stock Adjustments', icon: <ArrowUpDown size={16} /> },
    { key: 'inventory_counts', label: 'Inventory Counts', icon: <ClipboardList size={16} /> },
    { key: 'productions', label: 'Productions', icon: <Factory size={16} /> },
    { key: 'inventory_history', label: 'History', icon: <History size={16} /> },
    { key: 'inventory_valuation', label: 'Valuation', icon: <DollarSign size={16} /> },
  ];

  // Helper: Status badge
  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-500/20 text-gray-400',
      sent: 'bg-blue-500/20 text-blue-400',
      partial: 'bg-amber-500/20 text-amber-400',
      received: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
      pending: 'bg-amber-500/20 text-amber-400',
      in_transit: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      in_progress: 'bg-blue-500/20 text-blue-400',
      increase: 'bg-green-500/20 text-green-400',
      decrease: 'bg-red-500/20 text-red-400',
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-1 rounded-md capitalize ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-gray-200 dark:border-gray-700 mb-6">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSubTab(tab.key); setShowForm(false); setSearchQuery(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-[10px] md:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all rounded-t-lg ${
              subTab === tab.key
                ? 'bg-amber-600 text-white'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* PURCHASE ORDERS                        */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'purchase_orders' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Purchase Orders</h2>
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
              <Plus size={14} /> New Purchase Order
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">Create Purchase Order</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Supplier *</label>
                  <select value={poForm.supplierId} onChange={e => setPoForm(f => ({ ...f, supplierId: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {suppliers.length === 0 && <p className="text-[10px] text-amber-400 mt-1">Add suppliers first in the Suppliers tab</p>}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Expected Delivery</label>
                  <input type="date" value={poForm.expectedDate} onChange={e => setPoForm(f => ({ ...f, expectedDate: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={poForm.notes} onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none mb-4" />
              </div>

              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Items *</label>
              {poForm.items.length > 0 && (
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="flex-1 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Product</span>
                  <span className="w-16 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">In Stock</span>
                  <span className="w-16 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Incoming</span>
                  <span className="w-20 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Qty</span>
                  <span className="w-24 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center">Cost/Unit</span>
                  <span className="w-8"></span>
                </div>
              )}
              {poForm.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={item.menuItemId} onChange={e => {
                    const mi = activeMenuItems.find(m => m.id === e.target.value);
                    const items = [...poForm.items];
                    items[i] = { ...items[i], menuItemId: e.target.value, name: mi?.name || '' };
                    setPoForm(f => ({ ...f, items }));
                  }} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select item</option>
                    {activeMenuItems.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <span className={`w-16 text-center text-xs font-bold ${item.menuItemId ? (getStockLevel(item.menuItemId) === 0 ? 'text-red-400' : getStockLevel(item.menuItemId) <= 10 ? 'text-amber-400' : 'text-green-400') : 'text-gray-500'}`}>
                    {item.menuItemId ? getStockLevel(item.menuItemId) : '-'}
                  </span>
                  <span className={`w-16 text-center text-xs font-bold ${item.menuItemId && getIncomingQuantity(item.menuItemId) > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                    {item.menuItemId ? getIncomingQuantity(item.menuItemId) : '-'}
                  </span>
                  <input type="number" value={item.quantity || ''} onChange={e => { const items = [...poForm.items]; items[i] = { ...items[i], quantity: parseInt(e.target.value) || 0 }; setPoForm(f => ({ ...f, items })); }} placeholder="Qty" className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                  <input type="number" step="0.01" value={item.costPerUnit || ''} onChange={e => { const items = [...poForm.items]; items[i] = { ...items[i], costPerUnit: parseFloat(e.target.value) || 0 }; setPoForm(f => ({ ...f, items })); }} placeholder="Cost/Unit" className="w-24 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                  <button onClick={() => { const items = poForm.items.filter((_, idx) => idx !== i); setPoForm(f => ({ ...f, items })); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => setPoForm(f => ({ ...f, items: [...f.items, { menuItemId: '', name: '', quantity: 0, costPerUnit: 0, receivedQuantity: 0 }] }))} className="text-xs text-amber-400 font-bold flex items-center gap-1 mt-2 hover:text-amber-300"><Plus size={12} /> Add Item</button>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSavePurchaseOrder} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Create Order</button>
              </div>
            </div>
          )}

          {/* PO List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {purchaseOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Order #</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Supplier</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Items</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Expected</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Total Cost</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map(po => (
                      <tr key={po.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">PO-{po.id.slice(-6)}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{po.supplierName}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{po.items.length} items</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{po.expectedDate || '-'}</td>
                        <td className="px-5 py-4"><StatusBadge status={po.status} /></td>
                        <td className="px-5 py-4 text-xs font-bold text-amber-400 hidden sm:table-cell">{currencySymbol}{po.items.reduce((s, i) => s + i.quantity * i.costPerUnit, 0).toFixed(2)}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {po.status === 'draft' && (
                              <button onClick={() => handleUpdatePOStatus(po.id, 'sent')} className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold hover:bg-blue-500/30" title="Mark as Sent"><Send size={12} /></button>
                            )}
                            {(po.status === 'sent' || po.status === 'partial') && (
                              <button onClick={() => handleUpdatePOStatus(po.id, 'received')} className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold hover:bg-green-500/30" title="Mark as Received"><Check size={12} /></button>
                            )}
                            {po.status !== 'received' && po.status !== 'cancelled' && (
                              <button onClick={() => handleUpdatePOStatus(po.id, 'cancelled')} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500/30" title="Cancel"><X size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <FileText size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No purchase orders yet</p>
                <p className="text-xs text-gray-500 mt-1">Create a purchase order to start tracking stock receipts</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* TRANSFER ORDERS                        */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'transfer_orders' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Transfer Orders</h2>
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
              <Plus size={14} /> New Transfer
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">Create Transfer Order</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">From Store</label>
                  <input type="text" value={toForm.fromStore} onChange={e => setToForm(f => ({ ...f, fromStore: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">To Store *</label>
                  <input type="text" value={toForm.toStore} onChange={e => setToForm(f => ({ ...f, toStore: e.target.value }))} placeholder="Destination store" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={toForm.notes} onChange={e => setToForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>

              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Items *</label>
              {toForm.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={item.menuItemId} onChange={e => {
                    const mi = activeMenuItems.find(m => m.id === e.target.value);
                    const items = [...toForm.items];
                    items[i] = { ...items[i], menuItemId: e.target.value, name: mi?.name || '' };
                    setToForm(f => ({ ...f, items }));
                  }} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select item</option>
                    {activeMenuItems.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="number" value={item.quantity || ''} onChange={e => { const items = [...toForm.items]; items[i] = { ...items[i], quantity: parseInt(e.target.value) || 0 }; setToForm(f => ({ ...f, items })); }} placeholder="Qty" className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                  <button onClick={() => { const items = toForm.items.filter((_, idx) => idx !== i); setToForm(f => ({ ...f, items })); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => setToForm(f => ({ ...f, items: [...f.items, { menuItemId: '', name: '', quantity: 0 }] }))} className="text-xs text-amber-400 font-bold flex items-center gap-1 mt-2 hover:text-amber-300"><Plus size={12} /> Add Item</button>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSaveTransferOrder} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Create Transfer</button>
              </div>
            </div>
          )}

          {/* Transfer Order List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {transferOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Transfer #</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">From</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">To</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Items</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferOrders.map(to => (
                      <tr key={to.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">TO-{to.id.slice(-6)}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{to.fromStore}</td>
                        <td className="px-5 py-4 text-xs text-gray-600 dark:text-gray-300">{to.toStore}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{to.items.length} items</td>
                        <td className="px-5 py-4"><StatusBadge status={to.status} /></td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell">{formatDate(to.createdAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {to.status === 'pending' && (
                              <button onClick={() => handleUpdateTOStatus(to.id, 'in_transit')} className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-bold hover:bg-blue-500/30"><Truck size={12} /></button>
                            )}
                            {to.status === 'in_transit' && (
                              <button onClick={() => handleUpdateTOStatus(to.id, 'completed')} className="px-2 py-1 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-bold hover:bg-green-500/30"><Check size={12} /></button>
                            )}
                            {to.status !== 'completed' && to.status !== 'cancelled' && (
                              <button onClick={() => handleUpdateTOStatus(to.id, 'cancelled')} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold hover:bg-red-500/30"><X size={12} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Truck size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No transfer orders yet</p>
                <p className="text-xs text-gray-500 mt-1">Create a transfer order to move stock between stores</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* STOCK ADJUSTMENTS                      */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'stock_adjustments' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Stock Adjustments</h2>
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
              <Plus size={14} /> New Adjustment
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">Create Stock Adjustment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Item *</label>
                  <select value={adjForm.menuItemId} onChange={e => setAdjForm(f => ({ ...f, menuItemId: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select item</option>
                    {activeMenuItems.map(m => <option key={m.id} value={m.id}>{m.name} (Stock: {getStockLevel(m.id)})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Type</label>
                  <div className="flex gap-2">
                    <button onClick={() => setAdjForm(f => ({ ...f, type: 'increase' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${adjForm.type === 'increase' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>Increase</button>
                    <button onClick={() => setAdjForm(f => ({ ...f, type: 'decrease' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${adjForm.type === 'decrease' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>Decrease</button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Quantity *</label>
                  <input type="number" value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Reason</label>
                  <select value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value as any }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="received">Received</option>
                    <option value="damaged">Damaged</option>
                    <option value="loss">Loss</option>
                    <option value="correction">Correction</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                  <input type="text" value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSaveAdjustment} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Save Adjustment</button>
              </div>
            </div>
          )}

          {/* Adjustments List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {adjustments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Stock Change</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map(adj => (
                      <tr key={adj.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{formatDate(adj.timestamp)}</td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{adj.itemName}</td>
                        <td className="px-5 py-4"><StatusBadge status={adj.type} /></td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{adj.type === 'increase' ? '+' : '-'}{adj.quantity}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 capitalize">{adj.reason}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{adj.previousStock} → {adj.newStock}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell truncate max-w-[150px]">{adj.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <ArrowUpDown size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No adjustments yet</p>
                <p className="text-xs text-gray-500 mt-1">Record stock increases and decreases for received items, damages, and loss</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* INVENTORY COUNTS                       */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'inventory_counts' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Inventory Counts</h2>
            <div className="flex gap-2">
              <button onClick={() => handleStartCount('full')} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
                <ClipboardList size={14} /> Full Count
              </button>
              <button onClick={() => handleStartCount('partial')} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all flex items-center gap-2">
                <ClipboardList size={14} /> Partial Count
              </button>
            </div>
          </div>

          {inventoryCounts.length > 0 ? (
            <div className="space-y-4">
              {inventoryCounts.map(count => (
                <div key={count.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={count.status} />
                      <span className="text-sm font-bold text-gray-900 dark:text-white capitalize">{count.type} Count</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(count.startedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {count.status === 'in_progress' && (
                        <button onClick={() => handleCompleteCount(count.id)} className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-green-700 transition-all flex items-center gap-1">
                          <Check size={12} /> Complete Count
                        </button>
                      )}
                      <button onClick={() => handleDeleteCount(count.id)} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/30 transition-all flex items-center gap-1">
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                  {count.status === 'in_progress' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                            <th className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                            <th className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Expected</th>
                            <th className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Counted</th>
                            <th className="px-5 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {count.items.map(item => (
                            <tr key={item.menuItemId} className="border-b border-gray-100 dark:border-gray-700/50">
                              <td className="px-5 py-3 text-xs font-bold text-gray-900 dark:text-white">{item.name}</td>
                              <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">{item.category}</td>
                              <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">{item.expectedStock}</td>
                              <td className="px-5 py-3">
                                <input
                                  type="number"
                                  value={item.countedStock ?? ''}
                                  onChange={e => handleUpdateCountItem(count.id, item.menuItemId, parseInt(e.target.value) || 0)}
                                  placeholder="Count"
                                  className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none"
                                />
                              </td>
                              <td className="px-5 py-3">
                                {item.countedStock !== null && (
                                  <span className={`text-xs font-bold ${item.variance > 0 ? 'text-green-400' : item.variance < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {item.variance > 0 ? '+' : ''}{item.variance}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {count.status === 'completed' && (
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Items Counted</p>
                          <p className="text-lg font-black text-gray-900 dark:text-white">{count.items.filter(i => i.countedStock !== null).length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Variances</p>
                          <p className="text-lg font-black text-amber-400">{count.items.filter(i => i.variance !== 0).length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{count.completedAt ? formatDate(count.completedAt) : '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
              <ClipboardList size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-bold">No inventory counts yet</p>
              <p className="text-xs text-gray-500 mt-1">Start a full or partial stocktake</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* PRODUCTIONS                            */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'productions' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Productions</h2>
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
              <Plus size={14} /> Record Production
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">Record Production</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Produced Item *</label>
                  <input type="text" value={prodForm.producedItemName} onChange={e => setProdForm(f => ({ ...f, producedItemName: e.target.value }))} placeholder="e.g. Chicken Burger" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Quantity Produced *</label>
                  <input type="number" value={prodForm.quantityProduced} onChange={e => setProdForm(f => ({ ...f, quantityProduced: e.target.value }))} placeholder="0" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={prodForm.notes} onChange={e => setProdForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Ingredients Used</label>
              {prodForm.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input type="text" value={ing.name} onChange={e => { const ingredients = [...prodForm.ingredients]; ingredients[i] = { ...ingredients[i], name: e.target.value }; setProdForm(f => ({ ...f, ingredients })); }} placeholder="Ingredient name" className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                  <input type="number" value={ing.quantityUsed} onChange={e => { const ingredients = [...prodForm.ingredients]; ingredients[i] = { ...ingredients[i], quantityUsed: e.target.value }; setProdForm(f => ({ ...f, ingredients })); }} placeholder="Qty" className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                  <select value={ing.unit} onChange={e => { const ingredients = [...prodForm.ingredients]; ingredients[i] = { ...ingredients[i], unit: e.target.value }; setProdForm(f => ({ ...f, ingredients })); }} className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">L</option>
                    <option value="ml">mL</option>
                  </select>
                  <button onClick={() => { const ingredients = prodForm.ingredients.filter((_, idx) => idx !== i); setProdForm(f => ({ ...f, ingredients })); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => setProdForm(f => ({ ...f, ingredients: [...f.ingredients, { name: '', quantityUsed: '', unit: 'pcs' }] }))} className="text-xs text-amber-400 font-bold flex items-center gap-1 mt-2 hover:text-amber-300"><Plus size={12} /> Add Ingredient</button>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSaveProduction} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Save Production</button>
              </div>
            </div>
          )}

          {/* Productions List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {productions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Produced Item</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Qty Produced</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Ingredients</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productions.map(prod => (
                      <tr key={prod.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{formatDate(prod.timestamp)}</td>
                        <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{prod.producedItemName}</td>
                        <td className="px-5 py-4 text-xs font-bold text-green-400">+{prod.quantityProduced}</td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-[200px]">
                          {prod.ingredients.map(i => `${i.name} (${i.quantityUsed} ${i.unit})`).join(', ') || '-'}
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden sm:table-cell truncate max-w-[150px]">{prod.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Factory size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No productions recorded</p>
                <p className="text-xs text-gray-500 mt-1">Track items produced from ingredients</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* INVENTORY HISTORY                      */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'inventory_history' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Inventory History</h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input type="text" placeholder="Search history..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none w-48" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {historyLog.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Quantity</th>
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLog
                      .filter(h => !searchQuery || h.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || h.action.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(entry => (
                        <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{formatDate(entry.timestamp)}</td>
                          <td className="px-5 py-4 text-xs text-gray-900 dark:text-white">{entry.action}</td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{entry.itemName}</td>
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{entry.quantity}</td>
                          <td className="px-5 py-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                              entry.type === 'in' ? 'bg-green-500/20 text-green-400' :
                              entry.type === 'out' ? 'bg-red-500/20 text-red-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>{entry.type === 'in' ? 'Stock In' : entry.type === 'out' ? 'Stock Out' : 'Adjustment'}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <History size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">No history yet</p>
                <p className="text-xs text-gray-500 mt-1">Inventory actions will be recorded here</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* INVENTORY VALUATION                    */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'inventory_valuation' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black">Inventory Valuation</h2>
          </div>

          {/* Valuation Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Package size={20} className="text-blue-400" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Items</span>
              </div>
              <p className="text-3xl font-black text-gray-900 dark:text-white">{valuationData.length}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center"><DollarSign size={20} className="text-amber-500" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Cost Value</span>
              </div>
              <p className="text-2xl font-black text-amber-400">{currencySymbol}{totalValuation.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Estimated at 40% of retail</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center"><BarChart3 size={20} className="text-green-400" /></div>
                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">Retail Value</span>
              </div>
              <p className="text-2xl font-black text-green-400">{currencySymbol}{totalRetailValue.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">At current selling prices</p>
            </div>
          </div>

          {/* Valuation Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Item</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Unit Cost</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Retail Price</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cost Value</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Retail Value</th>
                  </tr>
                </thead>
                <tbody>
                  {valuationData.map((item: any) => (
                    <tr key={item.menuItemId} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{item.name}</td>
                      <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">{item.category}</td>
                      <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{item.currentStock}</td>
                      <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{currencySymbol}{item.estimatedCost.toFixed(2)}</td>
                      <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{currencySymbol}{item.price.toFixed(2)}</td>
                      <td className="px-5 py-4 text-xs font-bold text-amber-400">{currencySymbol}{item.totalValue.toFixed(2)}</td>
                      <td className="px-5 py-4 text-xs font-bold text-green-400 hidden sm:table-cell">{currencySymbol}{item.retailValue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;
