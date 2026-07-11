import React, { useState, useMemo, useEffect } from 'react';
import { Restaurant, MenuItem, IngredientItem } from '../src/types';
import { loadBackofficeData, syncBackofficeToDb } from '../lib/sharedSettings';
import { fetchPurchaseOrdersFromDb, savePurchaseOrderToDb, savePurchaseOrdersToDb } from '../lib/purchaseOrders';
import {
  Package, Truck, ArrowUpDown, ClipboardList, Factory,
  History, DollarSign, Plus, Search, Edit3, Trash2, Check, X, ChevronRight,
  ArrowLeft, Eye, Send, Download, Upload, XCircle,
  Clock, FileText, BarChart3, ShoppingBag, Info, MoreVertical, Copy, FileSpreadsheet,
} from 'lucide-react';

// ─── Inventory Types ───
interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  postcode: string;
  state: string;
  country: string;
  notes: string;
}

interface PurchaseOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  costPerUnit: number;
  receivedQuantity: number;
  purchaseUnit?: string;
  stockUnit?: string;
  stockQuantityPerUnit?: number;
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled' | 'returned';
  createdAt: number;
  expectedDate: string;
  receivedDate?: string;
  notes: string;
}

const PO_STATUS_VALUES: PurchaseOrder['status'][] = ['draft', 'sent', 'partial', 'received', 'cancelled', 'returned'];

const normalizePurchaseOrder = (po: Partial<PurchaseOrder>): PurchaseOrder => {
  const status = PO_STATUS_VALUES.includes(po.status as PurchaseOrder['status'])
    ? po.status as PurchaseOrder['status']
    : 'draft';
  return {
    id: po.id || crypto.randomUUID(),
    supplierId: po.supplierId || '',
    supplierName: po.supplierName || 'Unknown',
    items: (po.items || []).map(item => ({
      menuItemId: item.menuItemId || '',
      name: item.name || 'Unknown Item',
      quantity: Number(item.quantity || 0),
      costPerUnit: Number(item.costPerUnit || 0),
      receivedQuantity: Number(item.receivedQuantity || 0),
      purchaseUnit: item.purchaseUnit || 'pcs',
      stockUnit: item.stockUnit || 'pcs',
      stockQuantityPerUnit: Number(item.stockQuantityPerUnit || 1),
    })),
    status,
    createdAt: Number(po.createdAt || Date.now()),
    expectedDate: po.expectedDate || '',
    receivedDate: po.receivedDate,
    notes: po.notes || '',
  };
};

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
  producedItemId: string;
  producedItemName: string;
  quantityProduced: number;
  appliesTo?: 'all' | 'variants';
  variantKey?: string;
  variantLabel?: string;
  ingredients: { menuItemId: string; name: string; quantityUsed: number; unit: string; stockQuantityUsed?: number; stockUnit?: string }[];
  timestamp: number;
  notes: string;
}

interface InventoryHistoryEntry {
  id: string;
  action: string;
  itemName: string;
  quantity: number;
  unit?: string;
  detail?: string;
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
  initialSubTab?: InventorySubTab;
  onNavigateToItemsStock?: () => void;
}

// Unified selectable item: either a menu item or an ingredient
interface SelectableItem {
  id: string;
  name: string;
  category: string;
  price?: number;
  cost?: number;
  type: 'menu' | 'ingredient';
}

const getProductionVariantOptions = (item?: MenuItem | null): Array<{ key: string; label: string }> => {
  if (!item) return [];
  const options = new Map<string, { key: string; label: string }>();
  if (Array.isArray(item.sizes)) {
    item.sizes.forEach(size => {
      if (size?.name) options.set(`size:${size.name}`, { key: `size:${size.name}`, label: `Size: ${size.name}` });
    });
  }
  if (Array.isArray(item.otherVariants)) {
    item.otherVariants.forEach(variant => {
      if (variant?.name) options.set(`other:${variant.name}`, { key: `other:${variant.name}`, label: `${item.otherVariantName || 'Option'}: ${variant.name}` });
    });
  }
  if (item.tempOptions?.enabled && Array.isArray(item.tempOptions.options)) {
    item.tempOptions.options.forEach(option => {
      if (option?.name) options.set(`temp:${option.name}`, { key: `temp:${option.name}`, label: `Temp: ${option.name}` });
    });
  }
  if (item.variantOptions?.enabled && Array.isArray(item.variantOptions.options)) {
    item.variantOptions.options.forEach(option => {
      if (option?.name) options.set(`variant:${option.name}`, { key: `variant:${option.name}`, label: `Variant: ${option.name}` });
    });
  }
  return Array.from(options.values());
};

const UNIT_LABELS: Record<string, string> = {
  pcs: 'pcs',
  bottle: 'bottle',
  box: 'box',
  pack: 'pack',
  bag: 'bag',
  can: 'can',
  roll: 'roll',
  kg: 'kg',
  g: 'g',
  litre: 'L',
  l: 'L',
  ml: 'ml',
};

const PURCHASE_UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
  { value: 'bag', label: 'Bag' },
  { value: 'can', label: 'Can' },
  { value: 'roll', label: 'Roll' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre' },
  { value: 'ml', label: 'Millilitre (ml)' },
];

const STOCK_UNIT_OPTIONS = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre' },
  { value: 'ml', label: 'Millilitre (ml)' },
];

const normalizeUnit = (unit?: string) => {
  const normalized = (unit || 'pcs').toLowerCase();
  return normalized === 'l' ? 'litre' : normalized;
};

const getIngredientPurchaseUnit = (item?: Partial<IngredientItem>) => item?.purchase_unit || item?.unit || 'pcs';
const getIngredientStockUnit = (item?: Partial<IngredientItem>) => item?.unit || 'pcs';
const getIngredientPurchaseRatio = (item?: Partial<IngredientItem>) => {
  const ratio = Number(item?.purchase_to_stock_quantity);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

const getUnitLabel = (unit?: string) => UNIT_LABELS[normalizeUnit(unit)] || unit || 'pcs';

const getRelatedUnits = (ingredient?: IngredientItem) => {
  const baseUnit = normalizeUnit(getIngredientStockUnit(ingredient));
  const purchaseUnit = normalizeUnit(getIngredientPurchaseUnit(ingredient));
  const units = new Set<string>([baseUnit]);
  if (baseUnit === 'ml' || baseUnit === 'litre') {
    units.add('ml');
    units.add('litre');
  } else if (baseUnit === 'g' || baseUnit === 'kg') {
    units.add('g');
    units.add('kg');
  }
  if (purchaseUnit) units.add(purchaseUnit);
  return Array.from(units);
};

const convertBetweenStockUnits = (quantity: number, fromUnit?: string, toUnit?: string) => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;
  if (from === 'litre' && to === 'ml') return quantity * 1000;
  if (from === 'ml' && to === 'litre') return quantity / 1000;
  if (from === 'kg' && to === 'g') return quantity * 1000;
  if (from === 'g' && to === 'kg') return quantity / 1000;
  return quantity;
};

const convertIngredientUsageToStock = (ingredient: IngredientItem | undefined, quantity: number, unit?: string) => {
  if (!ingredient) return quantity;
  const usageUnit = normalizeUnit(unit);
  const purchaseUnit = normalizeUnit(getIngredientPurchaseUnit(ingredient));
  const stockUnit = normalizeUnit(getIngredientStockUnit(ingredient));
  if (usageUnit === purchaseUnit) return quantity * getIngredientPurchaseRatio(ingredient);
  return convertBetweenStockUnits(quantity, usageUnit, stockUnit);
};

const InventoryManagement: React.FC<Props> = ({ restaurant, currencySymbol, initialSubTab, onNavigateToItemsStock }) => {
  const [subTab, setSubTab] = useState<InventorySubTab>(initialSubTab || 'purchase_orders');
  const [productionTab, setProductionTab] = useState<'batch_stock' | 'recipe_checkout'>('batch_stock');

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);
  const storeKey = (key: string) => `inv_${restaurant.id}_${key}`;

  // ─── Persistent state helpers ───
  const loadState = <T,>(key: string, fallback: T): T =>
    loadBackofficeData<T>(storeKey(key), restaurant.settings, key, fallback);
  const saveState = <T,>(key: string, data: T) => {
    localStorage.setItem(storeKey(key), JSON.stringify(data));
    syncBackofficeToDb(restaurant.id);
  };
  const loadPurchaseOrders = (): PurchaseOrder[] => {
    try {
      const local = localStorage.getItem(storeKey('purchase_orders'));
      if (local) return (JSON.parse(local) as Partial<PurchaseOrder>[]).map(normalizePurchaseOrder);
    } catch { /* ignore corrupt cache */ }

    const legacyOrders = restaurant.settings?.backoffice?.purchase_orders;
    if (Array.isArray(legacyOrders)) {
      const normalized = legacyOrders.map(normalizePurchaseOrder);
      try { localStorage.setItem(storeKey('purchase_orders'), JSON.stringify(normalized)); } catch { /* ignore */ }
      return normalized;
    }
    return [];
  };

  // ─── State ───
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadState('suppliers', []));
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => subTab === 'purchase_orders' ? loadPurchaseOrders() : []);
  const [purchaseOrdersLoaded, setPurchaseOrdersLoaded] = useState(false);
  const [transferOrders, setTransferOrders] = useState<TransferOrder[]>(() => loadState('transfer_orders', []));
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(() => loadState('adjustments', []));
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>(() => loadState('counts', []));
  const [productions, setProductions] = useState<Production[]>(() => loadState('productions', []));
  const [historyLog, setHistoryLog] = useState<InventoryHistoryEntry[]>(() => loadState('history', []));
  const [ingredientItems, setIngredientItems] = useState<IngredientItem[]>(() => {
    try {
      const saved = localStorage.getItem(`ingredients_${restaurant.id}`);
      return saved ? (JSON.parse(saved) as IngredientItem[]).filter(i => !i.is_archived) : [];
    } catch { return []; }
  });

  // ─── Modal/Form States ───
  const [showForm, setShowForm] = useState(false);
  const [showPOInfoModal, setShowPOInfoModal] = useState(false);
  const [showProductionInfoModal, setShowProductionInfoModal] = useState(false);
  const [showQuantityProducedInfoModal, setShowQuantityProducedInfoModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState<'ALL' | PurchaseOrder['status']>('ALL');
  const [openPOActionMenuId, setOpenPOActionMenuId] = useState<string | null>(null);
  const [poEntriesPerPage, setPoEntriesPerPage] = useState(30);
  const [poCurrentPage, setPoCurrentPage] = useState(1);
  const [poFormError, setPoFormError] = useState('');
  const [productionSearch, setProductionSearch] = useState('');
  const [productionCategoryFilter, setProductionCategoryFilter] = useState('ALL');
  const [productionEntriesPerPage, setProductionEntriesPerPage] = useState(30);
  const [productionCurrentPage, setProductionCurrentPage] = useState(1);

  // ─── Quick Add Supplier Modal ───
  const blankSupplierForm = (): Omit<Supplier, 'id'> => ({
    name: '', email: '', phone: '', addressLine1: '', postcode: '', state: '', country: '', notes: '',
  });
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState<Omit<Supplier, 'id'>>(blankSupplierForm());
  const blankIngredientForm = (): Partial<IngredientItem> => ({
    name: '',
    category: '',
    cost: 0,
    unit: 'pcs',
    purchase_unit: 'pcs',
    purchase_to_stock_quantity: 1,
    sku: '',
    barcode: '',
    notes: '',
    is_archived: false,
  });
  const [quickAddIngredientRow, setQuickAddIngredientRow] = useState<number | null>(null);
  const [quickAddIngredientForm, setQuickAddIngredientForm] = useState<Partial<IngredientItem>>(blankIngredientForm());

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
  const [prodForm, setProdForm] = useState<{ producedItemId: string; producedItemName: string; quantityProduced: string; notes: string; appliesTo: 'all' | 'variants'; variantKey: string; variantLabel: string; ingredients: { menuItemId: string; name: string; quantityUsed: string; unit: string }[] }>({
    producedItemId: '', producedItemName: '', quantityProduced: '', notes: '', appliesTo: 'all', variantKey: '', variantLabel: '', ingredients: [{ menuItemId: '', name: '', quantityUsed: '', unit: 'pcs' }],
  });

  // Partial count category filter
  const [showPartialCountModal, setShowPartialCountModal] = useState(false);
  const [selectedCountCategories, setSelectedCountCategories] = useState<string[]>([]);

  // PO Receive modal
  const [viewingPOId, setViewingPOId] = useState<string | null>(null);
  const [receivingPOId, setReceivingPOId] = useState<string | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    setPurchaseOrdersLoaded(false);
    if (subTab !== 'purchase_orders') setPurchaseOrders([]);
  }, [restaurant.id]);

  const savePurchaseOrders = (orders: PurchaseOrder[], changedOrder?: PurchaseOrder) => {
    setPurchaseOrders(orders);
    localStorage.setItem(storeKey('purchase_orders'), JSON.stringify(orders));
    if (changedOrder) savePurchaseOrderToDb(restaurant.id, changedOrder).catch(() => {});
  };

  useEffect(() => {
    if (subTab !== 'purchase_orders' || purchaseOrdersLoaded) return;

    const cachedOrders = loadPurchaseOrders();
    setPurchaseOrders(cachedOrders);
    setPurchaseOrdersLoaded(true);

    let cancelled = false;
    fetchPurchaseOrdersFromDb(restaurant.id).then(remoteOrders => {
      if (cancelled || !remoteOrders) return;

      const merged = new Map<string, PurchaseOrder>();
      remoteOrders.forEach(po => merged.set(po.id, normalizePurchaseOrder(po)));
      cachedOrders.forEach(po => {
        if (!merged.has(po.id)) merged.set(po.id, normalizePurchaseOrder(po));
      });

      const nextOrders = Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
      setPurchaseOrders(nextOrders);
      localStorage.setItem(storeKey('purchase_orders'), JSON.stringify(nextOrders));

      const hasLocalOnlyOrders = cachedOrders.some(po => !remoteOrders.some(remote => remote.id === po.id));
      if (hasLocalOnlyOrders) savePurchaseOrdersToDb(restaurant.id, nextOrders).catch(() => {});
    });

    return () => { cancelled = true; };
  }, [subTab, purchaseOrdersLoaded, restaurant.id]);

  const activeMenuItems = useMemo(() => restaurant.menu.filter(m => !m.isArchived), [restaurant.menu]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ingredients_${restaurant.id}`);
      setIngredientItems(saved ? (JSON.parse(saved) as IngredientItem[]).filter(i => !i.is_archived) : []);
    } catch {
      setIngredientItems([]);
    }
  }, [restaurant.id]);

  // Combined list of menu items + ingredient items for selectors in PO, transfers, etc.
  const allSelectableItems = useMemo<SelectableItem[]>(() => [
    ...activeMenuItems.map(m => ({ id: m.id, name: m.name, category: m.category, price: m.price, cost: m.cost, type: 'menu' as const })),
    ...ingredientItems.map(i => ({ id: i.id, name: i.name, category: i.category, price: undefined, cost: i.cost, type: 'ingredient' as const })),
  ], [activeMenuItems, ingredientItems]);

  // ─── History Logger ───
  const menuSelectableItems = useMemo(() => allSelectableItems.filter(m => m.type === 'menu'), [allSelectableItems]);
  const ingredientSelectableItems = useMemo(() => allSelectableItems.filter(m => m.type === 'ingredient'), [allSelectableItems]);
  const getIngredientById = (itemId: string) => ingredientItems.find(i => i.id === itemId);
  const selectedProducedMenuItem = useMemo(() => activeMenuItems.find(item => item.id === prodForm.producedItemId), [activeMenuItems, prodForm.producedItemId]);
  const selectedProductionVariantOptions = useMemo(() => getProductionVariantOptions(selectedProducedMenuItem), [selectedProducedMenuItem]);
  const productionRecipeRows = useMemo(() => {
    const latestByScope = new Map<string, Production>();
    [...productions]
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .forEach(prod => {
        const scopeKey = prod.appliesTo === 'variants' && prod.variantKey
          ? `${prod.producedItemId}::${prod.variantKey}`
          : `${prod.producedItemId}::all`;
        if (!latestByScope.has(scopeKey)) latestByScope.set(scopeKey, prod);
      });

    return Array.from(latestByScope.values()).map(prod => {
      const totalIngredientCost = prod.ingredients.reduce((sum, ingredientLine) => {
        const ingredient = getIngredientById(ingredientLine.menuItemId);
        const unitCost = ingredient?.cost ? ingredient.cost / getIngredientPurchaseRatio(ingredient) : 0;
        const stockQuantity = ingredientLine.stockQuantityUsed ?? convertIngredientUsageToStock(ingredient, ingredientLine.quantityUsed, ingredientLine.unit);
        return sum + (unitCost * stockQuantity);
      }, 0);
      const quantityProduced = Number(prod.quantityProduced || 0);
      return {
        ...prod,
        costPerUnit: quantityProduced > 0 ? totalIngredientCost / quantityProduced : totalIngredientCost,
      };
    });
  }, [productions, ingredientItems]);
  const productionCategories = useMemo(() => {
    const categories = activeMenuItems.map(item => item.category || 'Uncategorized');
    return ['ALL', ...Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b))];
  }, [activeMenuItems]);
  const ingredientCategories = useMemo(() => {
    const categories = ingredientItems.map(item => item.category || 'Uncategorized');
    return ['ALL', ...Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b))];
  }, [ingredientItems]);
  const filteredPurchaseOrders = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    return purchaseOrders.filter(po => {
      if (poStatusFilter !== 'ALL' && po.status !== poStatusFilter) return false;
      if (!q) return true;
      return (
        `po-${po.id.slice(-6)}`.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.notes || '').toLowerCase().includes(q) ||
        po.items.some(item => item.name.toLowerCase().includes(q))
      );
    });
  }, [purchaseOrders, poSearch, poStatusFilter]);
  const poTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredPurchaseOrders.length / poEntriesPerPage)), [filteredPurchaseOrders.length, poEntriesPerPage]);
  const paginatedPurchaseOrders = useMemo(() => {
    const start = (poCurrentPage - 1) * poEntriesPerPage;
    return filteredPurchaseOrders.slice(start, start + poEntriesPerPage);
  }, [filteredPurchaseOrders, poCurrentPage, poEntriesPerPage]);
  const filteredProductions = useMemo(() => {
    const q = productionSearch.trim().toLowerCase();
    return productions.filter(prod => {
      const producedMenuItem = activeMenuItems.find(item => item.id === prod.producedItemId);
      const category = producedMenuItem?.category || 'Uncategorized';
      if (productionCategoryFilter !== 'ALL' && category !== productionCategoryFilter) return false;
      if (!q) return true;
      return (
        prod.producedItemName.toLowerCase().includes(q) ||
        (prod.variantLabel || '').toLowerCase().includes(q) ||
        (prod.notes || '').toLowerCase().includes(q) ||
        prod.ingredients.some(ingredient => ingredient.name.toLowerCase().includes(q))
      );
    });
  }, [productions, activeMenuItems, productionSearch, productionCategoryFilter]);
  const filteredProductionRecipeRows = useMemo(() => {
    const q = productionSearch.trim().toLowerCase();
    return productionRecipeRows.filter(recipe => {
      const producedMenuItem = activeMenuItems.find(item => item.id === recipe.producedItemId);
      const category = producedMenuItem?.category || 'Uncategorized';
      if (productionCategoryFilter !== 'ALL' && category !== productionCategoryFilter) return false;
      if (!q) return true;
      return (
        recipe.producedItemName.toLowerCase().includes(q) ||
        (recipe.variantLabel || '').toLowerCase().includes(q) ||
        (recipe.notes || '').toLowerCase().includes(q) ||
        recipe.ingredients.some(ingredient => ingredient.name.toLowerCase().includes(q))
      );
    });
  }, [productionRecipeRows, activeMenuItems, productionSearch, productionCategoryFilter]);
  const activeProductionCount = productionTab === 'batch_stock' ? filteredProductions.length : filteredProductionRecipeRows.length;
  const productionTotalPages = useMemo(() => Math.max(1, Math.ceil(activeProductionCount / productionEntriesPerPage)), [activeProductionCount, productionEntriesPerPage]);
  const paginatedProductions = useMemo(() => {
    const start = (productionCurrentPage - 1) * productionEntriesPerPage;
    return filteredProductions.slice(start, start + productionEntriesPerPage);
  }, [filteredProductions, productionCurrentPage, productionEntriesPerPage]);
  const paginatedProductionRecipeRows = useMemo(() => {
    const start = (productionCurrentPage - 1) * productionEntriesPerPage;
    return filteredProductionRecipeRows.slice(start, start + productionEntriesPerPage);
  }, [filteredProductionRecipeRows, productionCurrentPage, productionEntriesPerPage]);

  useEffect(() => {
    setProductionCurrentPage(1);
  }, [productionSearch, productionCategoryFilter, productionEntriesPerPage, productionTab]);

  useEffect(() => {
    setPoCurrentPage(1);
  }, [poSearch, poStatusFilter, poEntriesPerPage]);

  const getPOPurchaseUnit = (item: PurchaseOrderItem) => item.purchaseUnit || getIngredientPurchaseUnit(getIngredientById(item.menuItemId));
  const getPOStockUnit = (item: PurchaseOrderItem) => item.stockUnit || getIngredientStockUnit(getIngredientById(item.menuItemId));
  const getPOStockQuantityPerUnit = (item: PurchaseOrderItem) => {
    const quantity = Number(item.stockQuantityPerUnit);
    if (Number.isFinite(quantity) && quantity > 0) return quantity;
    return getIngredientPurchaseRatio(getIngredientById(item.menuItemId));
  };
  const getPOStockQuantity = (item: PurchaseOrderItem, quantity = item.quantity) => quantity * getPOStockQuantityPerUnit(item);

  const addHistory = (entry: Omit<InventoryHistoryEntry, 'id' | 'timestamp'>) => {
    const newEntry: InventoryHistoryEntry = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() };
    let current = historyLog;
    try {
      const saved = localStorage.getItem(storeKey('history'));
      if (saved) current = JSON.parse(saved) as InventoryHistoryEntry[];
    } catch { /* keep current state */ }
    const updated = [newEntry, ...current].slice(0, 500);
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

  const saveIngredientItems = (items: IngredientItem[]) => {
    setIngredientItems(items.filter(item => !item.is_archived));
    localStorage.setItem(`ingredients_${restaurant.id}`, JSON.stringify(items));
    syncBackofficeToDb(restaurant.id);
  };

  const saveStockItems = (items: any[]) => {
    localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(items));
    syncBackofficeToDb(restaurant.id);
  };

  const updateStockItem = (menuItemId: string, delta: number, requireTracking = false) => {
    const stockItems = getStockItems();
    const matchedItem = stockItems.find((s: any) => s.menuItemId === menuItemId);
    if (requireTracking && !matchedItem?.stockEnabled) return false;
    const updated = stockItems.map((s: any) =>
      s.menuItemId === menuItemId ? { ...s, currentStock: Math.max(0, s.currentStock + delta), lastRestocked: delta > 0 ? Date.now() : s.lastRestocked } : s
    );
    if (!matchedItem && !requireTracking) {
      const menuItem = activeMenuItems.find(m => m.id === menuItemId);
      const ingredient = getIngredientById(menuItemId);
      updated.push({
        menuItemId,
        name: ingredient?.name || menuItem?.name || 'Unknown Item',
        category: ingredient?.category || menuItem?.category || 'Uncategorized',
        currentStock: Math.max(0, delta),
        lowStockThreshold: 10,
        unit: ingredient ? getIngredientStockUnit(ingredient) : 'pcs',
        lastRestocked: delta > 0 ? Date.now() : undefined,
        stockEnabled: true,
      });
    }
    localStorage.setItem(`stock_${restaurant.id}`, JSON.stringify(updated));
    return true;
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
    setPoFormError('');
    if (!poForm.supplierId) {
      setPoFormError('Please select a supplier before creating the purchase order.');
      return;
    }
    const validItems = poForm.items
      .filter(item => item.menuItemId && Number(item.quantity || 0) > 0)
      .map(item => ({
        ...item,
        quantity: Number(item.quantity || 0),
        costPerUnit: Number(item.costPerUnit || 0),
        receivedQuantity: Number(item.receivedQuantity || 0),
        purchaseUnit: item.purchaseUnit || 'pcs',
        stockUnit: item.stockUnit || 'pcs',
        stockQuantityPerUnit: Number(item.stockQuantityPerUnit || 1),
      }));
    if (validItems.length === 0) {
      setPoFormError('Add at least one item with a quantity above 0.');
      return;
    }
    const supplier = suppliers.find(s => s.id === poForm.supplierId);
    const newPO: PurchaseOrder = {
      id: crypto.randomUUID(),
      supplierId: poForm.supplierId,
      supplierName: supplier?.name || 'Unknown',
      items: validItems,
      status: 'draft',
      createdAt: Date.now(),
      expectedDate: poForm.expectedDate,
      notes: poForm.notes,
    };
    const updated = [newPO, ...purchaseOrders];
    savePurchaseOrders(updated, newPO);
    addHistory({ action: 'Purchase order created', itemName: `PO-${newPO.id.slice(-6)}`, quantity: validItems.reduce((s, i) => s + i.quantity, 0), type: 'in', reference: newPO.id });
    setPoForm({ supplierId: '', expectedDate: '', notes: '', items: [] });
    setShowForm(false);
  };

  // ─── Quick Add Supplier (from PO form) ───
  const handleQuickAddSupplier = () => {
    if (!newSupplierForm.name.trim()) return;
    const newSupplier: Supplier = { ...newSupplierForm, id: crypto.randomUUID() };
    const updated = [...suppliers, newSupplier];
    setSuppliers(updated);
    saveState('suppliers', updated);
    setPoForm(f => ({ ...f, supplierId: newSupplier.id }));
    setNewSupplierForm(blankSupplierForm());
    setShowAddSupplierModal(false);
  };

  const openQuickAddIngredient = (rowIndex: number) => {
    setQuickAddIngredientRow(rowIndex);
    setQuickAddIngredientForm(blankIngredientForm());
  };

  const closeQuickAddIngredient = () => {
    setQuickAddIngredientRow(null);
    setQuickAddIngredientForm(blankIngredientForm());
  };

  const handleQuickAddIngredient = () => {
    const name = quickAddIngredientForm.name?.trim();
    if (!name || quickAddIngredientRow === null) return;

    const newIngredient: IngredientItem = {
      id: crypto.randomUUID(),
      restaurant_id: restaurant.id,
      name,
      category: quickAddIngredientForm.category?.trim() || 'Uncategorized',
      cost: Number(quickAddIngredientForm.cost || 0),
      unit: getIngredientStockUnit(quickAddIngredientForm),
      purchase_unit: getIngredientPurchaseUnit(quickAddIngredientForm),
      purchase_to_stock_quantity: getIngredientPurchaseRatio(quickAddIngredientForm),
      sku: quickAddIngredientForm.sku || '',
      barcode: quickAddIngredientForm.barcode || '',
      notes: quickAddIngredientForm.notes || '',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let storedIngredients: IngredientItem[] = ingredientItems;
    try {
      const saved = localStorage.getItem(`ingredients_${restaurant.id}`);
      if (saved) storedIngredients = JSON.parse(saved) as IngredientItem[];
    } catch { /* keep active ingredient state */ }
    saveIngredientItems([...storedIngredients, newIngredient]);
    const stockItems = getStockItems();
    const hasStockRecord = stockItems.some((item: any) => item.menuItemId === newIngredient.id);
    if (!hasStockRecord) {
      saveStockItems([
        ...stockItems,
        {
          menuItemId: newIngredient.id,
          name: newIngredient.name,
          category: newIngredient.category,
          currentStock: 0,
          lowStockThreshold: 10,
          unit: newIngredient.unit,
          lastRestocked: Date.now(),
          stockEnabled: true,
        },
      ]);
    }

    setProdForm(form => {
      const ingredients = [...form.ingredients];
      ingredients[quickAddIngredientRow] = {
        ...ingredients[quickAddIngredientRow],
        menuItemId: newIngredient.id,
        name: newIngredient.name,
        unit: getIngredientStockUnit(newIngredient),
      };
      return { ...form, ingredients };
    });
    closeQuickAddIngredient();
  };

  const handleUpdatePOStatus = (poId: string, newStatus: PurchaseOrder['status']) => {
    const updated = purchaseOrders.map(po => {
      if (po.id !== poId) return po;
      const updatedPO = { ...po, status: newStatus };
      if (newStatus === 'received') {
        updatedPO.receivedDate = new Date().toISOString().split('T')[0];
        updatedPO.items = po.items.map(item => ({ ...item, receivedQuantity: item.quantity }));
        po.items.forEach(item => {
          const remaining = item.quantity - item.receivedQuantity;
          if (remaining > 0) {
            const stockQuantity = getPOStockQuantity(item, remaining);
            updateStockItem(item.menuItemId, stockQuantity);
            addHistory({ action: 'Stock received (PO)', itemName: item.name, quantity: stockQuantity, unit: getPOStockUnit(item), type: 'in', reference: poId });
          }
        });
      }
      return updatedPO;
    });
    const changedOrder = updated.find(po => po.id === poId);
    savePurchaseOrders(updated, changedOrder);
  };

  const handleOpenReceiveModal = (poId: string) => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) return;
    const quantities: Record<string, number> = {};
    po.items.forEach(item => { quantities[item.menuItemId] = 0; });
    setReceiveQuantities(quantities);
    setReceivingPOId(poId);
  };

  const handleConfirmPartialReceive = () => {
    if (!receivingPOId) return;
    const updated = purchaseOrders.map(po => {
      if (po.id !== receivingPOId) return po;
      const updatedItems = po.items.map(item => {
        const receiving = receiveQuantities[item.menuItemId] || 0;
        if (receiving > 0) {
          const stockQuantity = getPOStockQuantity(item, receiving);
          updateStockItem(item.menuItemId, stockQuantity);
          addHistory({ action: 'Stock received (PO)', itemName: item.name, quantity: stockQuantity, unit: getPOStockUnit(item), type: 'in', reference: receivingPOId });
        }
        return { ...item, receivedQuantity: item.receivedQuantity + receiving };
      });
      const allReceived = updatedItems.every(item => item.receivedQuantity >= item.quantity);
      const anyReceived = updatedItems.some(item => item.receivedQuantity > 0);
      const newStatus: PurchaseOrder['status'] = allReceived ? 'received' : anyReceived ? 'partial' : po.status;
      return { ...po, items: updatedItems, status: newStatus, ...(allReceived ? { receivedDate: new Date().toISOString().split('T')[0] } : {}) };
    });
    const changedOrder = updated.find(po => po.id === receivingPOId);
    savePurchaseOrders(updated, changedOrder);
    setReceivingPOId(null);
    setReceiveQuantities({});
  };

  // ════════════════════════════════════════
  const getPOCostSign = (po: PurchaseOrder) => po.status === 'returned' ? -1 : 1;
  const getPOTotal = (po: PurchaseOrder, receivedOnly = false) => {
    const total = po.items.reduce((sum, item) => {
      const qty = receivedOnly ? item.receivedQuantity : item.quantity;
      return sum + qty * item.costPerUnit;
    }, 0);
    return total * getPOCostSign(po);
  };
  const formatMoney = (value: number) => `${value < 0 ? '-' : ''}${currencySymbol}${Math.abs(value).toFixed(2)}`;
  const downloadTextFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const buildPOCsv = (po: PurchaseOrder) => {
    const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Order #', `PO-${po.id.slice(-6)}`],
      ['Supplier', po.supplierName],
      ['Status', po.status],
      ['Created', formatDate(po.createdAt)],
      ['Expected', po.expectedDate || '-'],
      ['Received Date', po.receivedDate || '-'],
      ['Notes', po.notes || '-'],
      [],
      ['Item', 'Ordered Qty', 'Received Qty', 'Purchase Unit', 'Stock Added', 'Stock Unit', 'Cost Per Unit', 'Line Total'],
      ...po.items.map(item => [
        item.name,
        item.quantity,
        item.receivedQuantity,
        getUnitLabel(getPOPurchaseUnit(item)),
        getPOStockQuantity(item, item.receivedQuantity),
        getUnitLabel(getPOStockUnit(item)),
        item.costPerUnit,
        item.quantity * item.costPerUnit * getPOCostSign(po),
      ]),
      [],
      ['Order Total', getPOTotal(po)],
      ['Received Total', getPOTotal(po, true)],
    ];
    return rows.map(row => row.map(csvValue).join(',')).join('\n');
  };
  const downloadPOExcel = (po: PurchaseOrder) => {
    downloadTextFile(`PO-${po.id.slice(-6)}.csv`, buildPOCsv(po), 'text/csv;charset=utf-8');
  };
  const downloadPOPdf = async (po: PurchaseOrder) => {
    const jsPDFModule = await import('jspdf');
    const doc = new jsPDFModule.default();
    let y = 16;
    doc.setFontSize(16);
    doc.text(`PO-${po.id.slice(-6)}`, 14, y);
    y += 8;
    doc.setFontSize(10);
    [
      `Supplier: ${po.supplierName}`,
      `Status: ${po.status}`,
      `Created: ${formatDate(po.createdAt)}`,
      `Expected: ${po.expectedDate || '-'}`,
      `Order Total: ${formatMoney(getPOTotal(po))}`,
      `Received Total: ${formatMoney(getPOTotal(po, true))}`,
    ].forEach(line => {
      doc.text(line, 14, y);
      y += 6;
    });
    if (po.notes) {
      y += 2;
      doc.text(`Notes: ${po.notes}`, 14, y);
      y += 8;
    }
    y += 4;
    doc.setFontSize(9);
    po.items.forEach(item => {
      if (y > 276) {
        doc.addPage();
        y = 16;
      }
      const purchaseUnit = getUnitLabel(getPOPurchaseUnit(item));
      const stockUnit = getUnitLabel(getPOStockUnit(item));
      doc.text(item.name, 14, y);
      y += 5;
      doc.text(`Ordered: ${item.quantity} ${purchaseUnit} | Received: ${item.receivedQuantity} ${purchaseUnit} | Stock: ${getPOStockQuantity(item, item.receivedQuantity)} ${stockUnit} | Cost: ${formatMoney(item.costPerUnit)} | Total: ${formatMoney(item.quantity * item.costPerUnit * getPOCostSign(po))}`, 18, y);
      y += 7;
    });
    doc.save(`PO-${po.id.slice(-6)}.pdf`);
  };
  const copyAndCreatePO = (po: PurchaseOrder) => {
    setPoForm({
      supplierId: po.supplierId,
      expectedDate: '',
      notes: po.notes ? `Copied from PO-${po.id.slice(-6)}. ${po.notes}` : `Copied from PO-${po.id.slice(-6)}`,
      items: po.items.map(item => ({ ...item, receivedQuantity: 0 })),
    });
    setShowForm(true);
    setOpenPOActionMenuId(null);
    setViewingPOId(null);
  };
  const markPOReturned = (poId: string) => {
    const po = purchaseOrders.find(order => order.id === poId);
    if (!po || po.status === 'returned') return;
    po.items.forEach(item => {
      if (item.receivedQuantity > 0) {
        const stockQuantity = getPOStockQuantity(item, item.receivedQuantity);
        updateStockItem(item.menuItemId, -stockQuantity, true);
        addHistory({ action: 'Purchase return', itemName: item.name, quantity: stockQuantity, unit: getPOStockUnit(item), type: 'out', reference: po.id });
      }
    });
    const updated = purchaseOrders.map(order => order.id === poId ? { ...order, status: 'returned' as const } : order);
    const changedOrder = updated.find(po => po.id === poId);
    savePurchaseOrders(updated, changedOrder);
    setOpenPOActionMenuId(null);
  };

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
      if (newStatus === 'cancelled' && to.status === 'in_transit') {
        to.items.forEach(item => {
          updateStockItem(item.menuItemId, item.quantity);
          addHistory({ action: 'Stock restored (transfer cancelled)', itemName: item.name, quantity: item.quantity, type: 'in', reference: toId });
        });
      }
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
    const menuItem = allSelectableItems.find(m => m.id === adjForm.menuItemId);
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
  const handleStartCount = (type: 'full' | 'partial', categories?: string[]) => {
    const filteredItems = type === 'partial' && categories && categories.length > 0
      ? allSelectableItems.filter(m => categories.includes(m.category))
      : allSelectableItems;
    const items: InventoryCountItem[] = filteredItems.map(m => ({
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

  const allCategories = useMemo(() => [...new Set(allSelectableItems.map(m => m.category).filter(Boolean))], [allSelectableItems]);

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
    const qty = parseFloat(prodForm.quantityProduced);
    if (!prodForm.producedItemId || isNaN(qty) || qty < 0) return;
    if (prodForm.appliesTo === 'variants' && !prodForm.variantKey) return;
    const producedMenuItem = menuSelectableItems.find(m => m.id === prodForm.producedItemId);
    if (!producedMenuItem) return;
    const validIngredients = prodForm.ingredients.filter(i => i.menuItemId).map(i => {
      const ingredient = getIngredientById(i.menuItemId);
      const quantityUsed = parseFloat(i.quantityUsed) || 0;
      return {
        menuItemId: i.menuItemId,
        name: i.name,
        quantityUsed,
        unit: i.unit,
        stockQuantityUsed: convertIngredientUsageToStock(ingredient, quantityUsed, i.unit),
        stockUnit: getIngredientStockUnit(ingredient),
      };
    });
    const prod: Production = {
      id: crypto.randomUUID(),
      producedItemId: prodForm.producedItemId,
      producedItemName: producedMenuItem.name,
      quantityProduced: qty,
      appliesTo: prodForm.appliesTo,
      variantKey: prodForm.appliesTo === 'variants' ? prodForm.variantKey : '',
      variantLabel: prodForm.appliesTo === 'variants' ? prodForm.variantLabel : '',
      ingredients: validIngredients,
      timestamp: Date.now(),
      notes: prodForm.notes,
    };
    if (qty > 0) {
      // Credit stock to produced item
      updateStockItem(prodForm.producedItemId, qty);
      addHistory({
        action: 'Production output',
        itemName: producedMenuItem.name,
        quantity: qty,
        unit: 'pcs',
        detail: `${prod.appliesTo === 'variants' && prod.variantLabel ? `${prod.variantLabel}: ` : ''}Produced from ${validIngredients.length} ingredient${validIngredients.length === 1 ? '' : 's'}`,
        type: 'in',
        reference: prod.id,
      });
      // Deduct stock from each ingredient
      validIngredients.forEach(ing => {
        if (ing.quantityUsed > 0) {
          const stockQuantityUsed = ing.stockQuantityUsed ?? ing.quantityUsed;
          const deducted = updateStockItem(ing.menuItemId, -stockQuantityUsed, true);
          if (!deducted) return;
          addHistory({
            action: 'Production ingredient used',
            itemName: ing.name,
            quantity: stockQuantityUsed,
            unit: ing.stockUnit,
            detail: `Used for ${producedMenuItem.name}`,
            type: 'out',
            reference: prod.id,
          });
        }
      });
    }
    const updated = [prod, ...productions];
    setProductions(updated);
    saveState('productions', updated);
    setProdForm({ producedItemId: '', producedItemName: '', quantityProduced: '', notes: '', appliesTo: 'all', variantKey: '', variantLabel: '', ingredients: [{ menuItemId: '', name: '', quantityUsed: '', unit: 'pcs' }] });
    setShowForm(false);
  };

  // ─── Inventory Valuation ───
  const getLatestCostFromPOs = (menuItemId: string): number => {
    for (const po of purchaseOrders) {
      if (po.status === 'received' || po.status === 'partial') {
        const item = po.items.find(i => i.menuItemId === menuItemId);
        if (item && item.costPerUnit > 0) return item.costPerUnit / getPOStockQuantityPerUnit(item);
      }
    }
    return 0;
  };

  const valuationData = useMemo(() => {
    const stockItems = getStockItems();
    return stockItems.map((s: any) => {
      const menuItem = restaurant.menu.find(m => m.id === s.menuItemId);
      const ingredient = ingredientItems.find(i => i.id === s.menuItemId);
      const poCost = getLatestCostFromPOs(s.menuItemId);
      const ingredientStockCost = ingredient?.cost ? ingredient.cost / getIngredientPurchaseRatio(ingredient) : 0;
      const unitCost = poCost > 0 ? poCost : ingredientStockCost > 0 ? ingredientStockCost : (menuItem?.price ? menuItem.price * 0.4 : 0);
      return {
        ...s,
        price: menuItem?.price || 0,
        estimatedCost: unitCost,
        hasPOCost: poCost > 0 || (ingredient?.cost ?? 0) > 0,
        totalValue: s.currentStock * unitCost,
        retailValue: s.currentStock * (menuItem?.price || 0),
        isIngredient: !!ingredient,
      };
    });
  }, [restaurant.menu, ingredientItems, purchaseOrders]);

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
        return total + (item ? getPOStockQuantity(item, item.quantity - item.receivedQuantity) : 0);
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
      returned: 'bg-purple-500/20 text-purple-400',
      pending: 'bg-amber-500/20 text-amber-400',
      in_transit: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      in_progress: 'bg-blue-500/20 text-blue-400',
      increase: 'bg-green-500/20 text-green-400',
      decrease: 'bg-red-500/20 text-red-400',
    };
    const labels: Record<string, string> = {
      draft: 'Planned',
      sent: 'Ordered',
      partial: 'Partially Delivered',
      received: 'Delivered',
      cancelled: 'Cancelled',
      returned: 'Returned',
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-1 rounded-md capitalize ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
        {labels[status] || status.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
    <div>
      <div>

      {/* ═══════════════════════════════════════ */}
      {/* PURCHASE ORDERS                        */}
      {/* ═══════════════════════════════════════ */}
      {subTab === 'purchase_orders' && (
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">Purchase Orders</h2>
                <button
                  type="button"
                  onClick={() => setShowPOInfoModal(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:border-amber-300 hover:text-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-700"
                  aria-label="Purchase order status information"
                  title="Purchase order status information"
                >
                  <Info size={15} />
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Plan supplier purchases, track ordered and delivered quantities, and keep returns visible as negative value movements.</p>
            </div>
            <button onClick={() => { setPoFormError(''); setShowForm(!showForm); }} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20">
              <Plus size={14} /> New Purchase Order
            </button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-black mb-4">Create Purchase Order</h3>
              <div className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
                <span className="leading-tight">If an ingredient or supply is missing, create it first in Items & Stock so purchase and production units match.</span>
                {onNavigateToItemsStock && (
                  <button onClick={onNavigateToItemsStock} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 text-[9px] font-bold uppercase tracking-wider text-blue-700 shadow-sm transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70">
                    <ShoppingBag size={12} /> Items & Stock
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Supplier *</label>
                  <select value={poForm.supplierId} onChange={e => {
                    if (e.target.value === '__add_new__') {
                      setShowAddSupplierModal(true);
                    } else {
                      setPoForm(f => ({ ...f, supplierId: e.target.value }));
                    }
                  }} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__add_new__">+ Add new Supplier</option>
                  </select>
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
                <div className="grid grid-cols-[minmax(240px,1fr)_72px_72px_88px_132px_100px_32px] items-end gap-2 mb-2 px-1">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Product</span>
                  <span className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">In Stock</span>
                  <span className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">Incoming</span>
                  <span className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">Qty</span>
                  <span className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">Stock Added</span>
                  <span className="text-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">Cost/Unit</span>
                  <span></span>
                </div>
              )}
              {poForm.items.map((item, i) => (
                <div key={i} className="grid grid-cols-[minmax(240px,1fr)_72px_72px_88px_132px_100px_32px] items-start gap-2 mb-2">
                  <select value={item.menuItemId} onChange={e => {
                    const mi = allSelectableItems.find(m => m.id === e.target.value);
                    const ingredient = getIngredientById(e.target.value);
                    const items = [...poForm.items];
                    items[i] = {
                      ...items[i],
                      menuItemId: e.target.value,
                      name: mi?.name || '',
                      costPerUnit: items[i].costPerUnit || mi?.cost || 0,
                      purchaseUnit: ingredient ? getIngredientPurchaseUnit(ingredient) : 'pcs',
                      stockUnit: ingredient ? getIngredientStockUnit(ingredient) : 'pcs',
                      stockQuantityPerUnit: ingredient ? getIngredientPurchaseRatio(ingredient) : 1,
                    };
                    setPoForm(f => ({ ...f, items }));
                  }} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select item</option>
                    <optgroup label="Menu Items">
                      {menuSelectableItems.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                    {ingredientSelectableItems.length > 0 && (
                      <optgroup label="Ingredients / Supplies">
                        {ingredientSelectableItems.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <span className={`flex h-10 items-center justify-center text-xs font-bold ${item.menuItemId ? (getStockLevel(item.menuItemId) === 0 ? 'text-red-400' : getStockLevel(item.menuItemId) <= 10 ? 'text-amber-400' : 'text-green-400') : 'text-gray-500'}`}>
                    {item.menuItemId ? getStockLevel(item.menuItemId) : '-'}
                  </span>
                  <span className={`flex h-10 items-center justify-center text-xs font-bold ${item.menuItemId && getIncomingQuantity(item.menuItemId) > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                    {item.menuItemId ? getIncomingQuantity(item.menuItemId) : '-'}
                  </span>
                  <div>
                    <input type="number" value={item.quantity || ''} onChange={e => { const items = [...poForm.items]; items[i] = { ...items[i], quantity: parseFloat(e.target.value) || 0 }; setPoForm(f => ({ ...f, items })); }} placeholder="Qty" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                    {item.menuItemId && <p className="mt-1 text-center text-[9px] font-bold text-gray-400">{getUnitLabel(getPOPurchaseUnit(item))}</p>}
                  </div>
                  <span className="flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-2 text-center text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    {item.menuItemId ? `= ${getPOStockQuantity(item).toLocaleString()} ${getUnitLabel(getPOStockUnit(item))}` : '-'}
                  </span>
                  <input type="number" step="0.01" value={item.costPerUnit || ''} onChange={e => { const items = [...poForm.items]; items[i] = { ...items[i], costPerUnit: parseFloat(e.target.value) || 0 }; setPoForm(f => ({ ...f, items })); }} placeholder="Cost/Unit" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none" />
                  <button onClick={() => { const items = poForm.items.filter((_, idx) => idx !== i); setPoForm(f => ({ ...f, items })); }} className="flex h-10 items-center justify-center text-red-400 hover:bg-red-500/20 rounded-lg"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => setPoForm(f => ({ ...f, items: [...f.items, { menuItemId: '', name: '', quantity: 0, costPerUnit: 0, receivedQuantity: 0, purchaseUnit: 'pcs', stockUnit: 'pcs', stockQuantityPerUnit: 1 }] }))} className="text-xs text-amber-400 font-bold flex items-center gap-1 mt-2 hover:text-amber-300"><Plus size={12} /> Add Item</button>

              {poFormError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {poFormError}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleSavePurchaseOrder} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Create Order</button>
              </div>
            </div>
          )}

          {/* PO List */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Showing {filteredPurchaseOrders.length === 0 ? 0 : (poCurrentPage - 1) * poEntriesPerPage + 1}-{Math.min(poCurrentPage * poEntriesPerPage, filteredPurchaseOrders.length)} of {filteredPurchaseOrders.length}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search PO, supplier, item..."
                    value={poSearch}
                    onChange={e => setPoSearch(e.target.value)}
                    className="w-64 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <select value={poStatusFilter} onChange={e => setPoStatusFilter(e.target.value as 'ALL' | PurchaseOrder['status'])} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  <option value="ALL">All Status</option>
                  <option value="draft">Planned</option>
                  <option value="sent">Ordered</option>
                  <option value="partial">Partially Delivered</option>
                  <option value="received">Delivered</option>
                  <option value="returned">Returned</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show</span>
                  <select value={poEntriesPerPage} onChange={e => setPoEntriesPerPage(Number(e.target.value))} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-1 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entries</span>
                </div>
              </div>
            </div>
            {paginatedPurchaseOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Order #</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Supplier</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Items</th>
                      <th className="hidden px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 md:table-cell">Expected</th>
                      <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Status</th>
                      <th className="hidden px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">Value</th>
                      <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {paginatedPurchaseOrders.map(po => (
                      <tr
                        key={po.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      >
                        <td className="px-4 py-2 text-xs font-bold">
                          <button onClick={() => setViewingPOId(po.id)} className="font-black text-amber-500 transition hover:text-amber-600 hover:underline">
                            PO-{po.id.slice(-6)}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{po.supplierName}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{po.items.length} items</td>
                        <td className="hidden px-4 py-2 text-xs text-gray-500 dark:text-gray-400 md:table-cell">{po.expectedDate || '-'}</td>
                        <td className="px-4 py-2"><StatusBadge status={po.status} /></td>
                        <td className={`hidden px-4 py-2 text-right text-xs font-bold sm:table-cell ${po.status === 'returned' ? 'text-red-400' : 'text-amber-400'}`}>{formatMoney(getPOTotal(po))}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => setOpenPOActionMenuId(openPOActionMenuId === po.id ? null : po.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-amber-500 dark:hover:bg-gray-700"
                              title="Purchase order actions"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openPOActionMenuId === po.id && (
                              <div className="absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
                                <button onClick={() => { setViewingPOId(po.id); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"><Eye size={13} /> View</button>
                                <button onClick={() => { downloadPOExcel(po); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"><FileSpreadsheet size={13} /> Download Excel</button>
                                <button onClick={() => { void downloadPOPdf(po); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"><FileText size={13} /> Download PDF</button>
                                <button onClick={() => copyAndCreatePO(po)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"><Copy size={13} /> Copy & Create New</button>
                                {po.status === 'draft' && <button onClick={() => { handleUpdatePOStatus(po.id, 'sent'); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"><Send size={13} /> Mark Ordered</button>}
                                {(po.status === 'sent' || po.status === 'partial') && <button onClick={() => { handleOpenReceiveModal(po.id); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"><Download size={13} /> Receive Items</button>}
                                {(po.status === 'sent' || po.status === 'partial') && <button onClick={() => { handleUpdatePOStatus(po.id, 'received'); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"><Check size={13} /> Mark Delivered</button>}
                                {(po.status === 'partial' || po.status === 'received') && <button onClick={() => markPOReturned(po.id)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"><ArrowUpDown size={13} /> Mark Returned</button>}
                                {po.status !== 'received' && po.status !== 'cancelled' && po.status !== 'returned' && <button onClick={() => { handleUpdatePOStatus(po.id, 'cancelled'); setOpenPOActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><X size={13} /> Cancel</button>}
                              </div>
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
                <p className="text-sm font-bold">{purchaseOrders.length === 0 ? 'No purchase orders yet' : 'No purchase orders match the filters'}</p>
                <p className="text-xs text-gray-500 mt-1">{purchaseOrders.length === 0 ? 'Create a purchase order to start tracking stock receipts' : 'Try changing the search or status filter'}</p>
              </div>
            )}
          </div>
          {poTotalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
              <button onClick={() => setPoCurrentPage(1)} disabled={poCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">First</button>
              <button onClick={() => setPoCurrentPage(page => Math.max(1, page - 1))} disabled={poCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Prev</button>
              <span className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Page {poCurrentPage} / {poTotalPages}</span>
              <button onClick={() => setPoCurrentPage(page => Math.min(poTotalPages, page + 1))} disabled={poCurrentPage === poTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Next</button>
              <button onClick={() => setPoCurrentPage(poTotalPages)} disabled={poCurrentPage === poTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Last</button>
            </div>
          )}
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
                    const mi = allSelectableItems.find(m => m.id === e.target.value);
                    const items = [...toForm.items];
                    items[i] = { ...items[i], menuItemId: e.target.value, name: mi?.name || '' };
                    setToForm(f => ({ ...f, items }));
                  }} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select item</option>
                    <optgroup label="Menu Items">
                      {allSelectableItems.filter(m => m.type === 'menu').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                    {allSelectableItems.some(m => m.type === 'ingredient') && (
                      <optgroup label="Ingredients / Supplies">
                        {allSelectableItems.filter(m => m.type === 'ingredient').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </optgroup>
                    )}
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
                    <optgroup label="Menu Items">
                      {allSelectableItems.filter(m => m.type === 'menu').map(m => <option key={m.id} value={m.id}>{m.name} (Stock: {getStockLevel(m.id)})</option>)}
                    </optgroup>
                    {allSelectableItems.some(m => m.type === 'ingredient') && (
                      <optgroup label="Ingredients / Supplies">
                        {allSelectableItems.filter(m => m.type === 'ingredient').map(m => <option key={m.id} value={m.id}>{m.name} (Stock: {getStockLevel(m.id)})</option>)}
                      </optgroup>
                    )}
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
              <button onClick={() => { setSelectedCountCategories([]); setShowPartialCountModal(true); }} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all flex items-center gap-2">
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
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">Productions</h2>
                <button
                  type="button"
                  onClick={() => setShowProductionInfoModal(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:border-amber-300 hover:text-amber-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-700"
                  aria-label="How productions work"
                  title="How productions work"
                >
                  <Info size={15} />
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use produced stock first, then fall back to recipe ingredients when stock runs out.</p>
            </div>
            <button onClick={() => setShowForm(true)} className="inline-flex h-[38px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700">
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="flex gap-0 relative overflow-x-auto overflow-y-hidden hide-scrollbar">
            {([
              { key: 'batch_stock' as const, label: 'Batch Stock', icon: <Factory size={13} /> },
              { key: 'recipe_checkout' as const, label: 'Recipe at Checkout', icon: <ShoppingBag size={13} /> },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setProductionTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors duration-150 whitespace-nowrap -mb-px relative ${
                  productionTab === tab.key
                    ? 'bg-white dark:bg-gray-800 text-amber-600 border-x border-t border-gray-200 dark:border-gray-600 dark:border-t-amber-500 z-10'
                    : 'bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {productionTab === 'batch_stock' ? (
            <>
          {/* Productions List */}
          <div className="overflow-hidden rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-black text-gray-900 dark:text-white">Batch Stock</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Record finished items produced before selling. Quantity above zero adds finished stock and deducts ingredients immediately.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search item, ingredient, notes..."
                    value={productionSearch}
                    onChange={e => setProductionSearch(e.target.value)}
                    className="w-64 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>
                <select value={productionCategoryFilter} onChange={e => setProductionCategoryFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                  {productionCategories.map(category => <option key={category} value={category}>{category === 'ALL' ? 'All Categories' : category}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Showing {activeProductionCount === 0 ? 0 : (productionCurrentPage - 1) * productionEntriesPerPage + 1}-{Math.min(productionCurrentPage * productionEntriesPerPage, activeProductionCount)} of {activeProductionCount}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show</span>
                <select value={productionEntriesPerPage} onChange={e => setProductionEntriesPerPage(Number(e.target.value))} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-1 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entries</span>
              </div>
            </div>
            {paginatedProductions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Date</th>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Produced Item</th>
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Qty Produced</th>
                      <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 md:table-cell">Ingredients</th>
                      <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {paginatedProductions.map(prod => (
                      <tr key={prod.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{formatDate(prod.timestamp)}</td>
                        <td className="px-4 py-2">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">{prod.producedItemName}</p>
                          <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-gray-400">{prod.appliesTo === 'variants' ? prod.variantLabel || 'Adjusted variant' : 'All variants'}</p>
                        </td>
                        <td className="px-4 py-2 text-xs font-bold text-green-400">+{prod.quantityProduced}</td>
                        <td className="hidden max-w-[200px] truncate px-4 py-2 text-xs text-gray-500 dark:text-gray-400 md:table-cell">
                          {prod.ingredients.map(i => {
                            const converted = i.stockQuantityUsed && i.stockUnit && (i.stockQuantityUsed !== i.quantityUsed || normalizeUnit(i.stockUnit) !== normalizeUnit(i.unit))
                              ? ` = ${i.stockQuantityUsed.toLocaleString()} ${getUnitLabel(i.stockUnit)}`
                              : '';
                            return `${i.name} (${i.quantityUsed} ${getUnitLabel(i.unit)}${converted})`;
                          }).join(', ') || '-'}
                        </td>
                        <td className="hidden max-w-[150px] truncate px-4 py-2 text-xs text-gray-500 dark:text-gray-400 sm:table-cell">{prod.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                <Factory size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">{productions.length === 0 ? 'No productions recorded' : 'No productions match the filters'}</p>
                <p className="text-xs text-gray-500 mt-1">{productions.length === 0 ? 'Track items produced from ingredients' : 'Try changing the search or category filter'}</p>
              </div>
            )}
          </div>
          {productionTotalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
              <button onClick={() => setProductionCurrentPage(1)} disabled={productionCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">First</button>
              <button onClick={() => setProductionCurrentPage(page => Math.max(1, page - 1))} disabled={productionCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Prev</button>
              <span className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Page {productionCurrentPage} / {productionTotalPages}</span>
              <button onClick={() => setProductionCurrentPage(page => Math.min(productionTotalPages, page + 1))} disabled={productionCurrentPage === productionTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Next</button>
              <button onClick={() => setProductionCurrentPage(productionTotalPages)} disabled={productionCurrentPage === productionTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Last</button>
            </div>
          )}
            </>
          ) : (
            <div>
              <div className="overflow-hidden rounded-b-2xl rounded-tr-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-gray-900 dark:text-white">Recipe at Checkout</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Auto based on the latest previous production record. Checkout uses this recipe only when produced stock is not enough.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        placeholder="Search item, ingredient, notes..."
                        value={productionSearch}
                        onChange={e => setProductionSearch(e.target.value)}
                        className="w-64 rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </div>
                    <select value={productionCategoryFilter} onChange={e => setProductionCategoryFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
                      {productionCategories.map(category => <option key={category} value={category}>{category === 'ALL' ? 'All Categories' : category}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900/40">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Showing {activeProductionCount === 0 ? 0 : (productionCurrentPage - 1) * productionEntriesPerPage + 1}-{Math.min(productionCurrentPage * productionEntriesPerPage, activeProductionCount)} of {activeProductionCount}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show</span>
                    <select value={productionEntriesPerPage} onChange={e => setProductionEntriesPerPage(Number(e.target.value))} className="cursor-pointer rounded-lg border border-gray-200 bg-white p-1 text-[10px] font-bold text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entries</span>
                  </div>
                </div>
                {paginatedProductionRecipeRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Menu Item</th>
                          <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Scope</th>
                          <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 md:table-cell">Ingredients per Batch</th>
                          <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">Recipe Cost</th>
                          <th className="hidden px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {paginatedProductionRecipeRows.map(recipe => (
                          <tr key={`${recipe.producedItemId}-${recipe.variantKey || 'all'}`} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-2 text-xs font-bold text-gray-900 dark:text-white">{recipe.producedItemName}</td>
                            <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{recipe.appliesTo === 'variants' ? recipe.variantLabel || 'Adjusted variant' : 'All variants'}</td>
                            <td className="hidden max-w-[260px] truncate px-4 py-2 text-xs text-gray-500 dark:text-gray-400 md:table-cell">
                              {recipe.ingredients.map(i => `${i.name} (${i.quantityUsed} ${getUnitLabel(i.unit)})`).join(', ') || '-'}
                            </td>
                            <td className="px-4 py-2 text-xs font-bold text-amber-500">{currencySymbol}{recipe.costPerUnit.toFixed(2)} / item</td>
                            <td className="hidden px-4 py-2 text-xs text-gray-500 dark:text-gray-400 sm:table-cell">{formatDate(recipe.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-48 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                    <FileText size={40} className="mb-3 opacity-30" />
                    <p className="text-sm font-bold">{productionRecipeRows.length === 0 ? 'No recipe source yet' : 'No recipes match the filters'}</p>
                    <p className="text-xs text-gray-500 mt-1">{productionRecipeRows.length === 0 ? 'Record a production batch to create the current recipe reference' : 'Try changing the search or category filter'}</p>
                  </div>
                )}
              </div>
              {productionTotalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2 overflow-x-auto py-2">
                  <button onClick={() => setProductionCurrentPage(1)} disabled={productionCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">First</button>
                  <button onClick={() => setProductionCurrentPage(page => Math.max(1, page - 1))} disabled={productionCurrentPage === 1} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Prev</button>
                  <span className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Page {productionCurrentPage} / {productionTotalPages}</span>
                  <button onClick={() => setProductionCurrentPage(page => Math.min(productionTotalPages, page + 1))} disabled={productionCurrentPage === productionTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Next</button>
                  <button onClick={() => setProductionCurrentPage(productionTotalPages)} disabled={productionCurrentPage === productionTotalPages} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-[10px] font-black text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-all">Last</button>
                </div>
              )}
            </div>
          )}
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
                      <th className="px-5 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Detail</th>
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
                          <td className="px-5 py-4 text-xs font-bold text-gray-900 dark:text-white">{entry.quantity.toLocaleString()} {entry.unit ? getUnitLabel(entry.unit) : ''}</td>
                          <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 hidden md:table-cell">{entry.detail || '-'}</td>
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
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Based on PO costs (or 40% estimate)</p>
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
    </div>

      {/* ─── Quick Add Supplier Modal ─── */}
      {showPOInfoModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPOInfoModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Purchase Order Status</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">How each purchase order state is used.</p>
              </div>
              <button onClick={() => setShowPOInfoModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Planned means not sent yet; Ordered is sent to supplier; Delivered is fully received; Returned shows negative value.
            </p>
            <button onClick={() => setShowPOInfoModal(false)} className="mt-6 w-full rounded-xl bg-amber-600 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-amber-700">
              Got It
            </button>
          </div>
        </div>
      )}

      {showAddSupplierModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddSupplierModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-gray-900 dark:text-white">Add New Supplier</h3>
              <button onClick={() => setShowAddSupplierModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Name *</label>
                <input type="text" value={newSupplierForm.name} onChange={e => setNewSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Email</label>
                <input type="email" value={newSupplierForm.email} onChange={e => setNewSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="supplier@email.com" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Phone</label>
                <input type="tel" value={newSupplierForm.phone} onChange={e => setNewSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Street / Address Line</label>
                <input type="text" value={newSupplierForm.addressLine1} onChange={e => setNewSupplierForm(f => ({ ...f, addressLine1: e.target.value }))} placeholder="Street address" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Postcode</label>
                <input type="text" value={newSupplierForm.postcode} onChange={e => setNewSupplierForm(f => ({ ...f, postcode: e.target.value }))} placeholder="Postcode" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">State</label>
                <input type="text" value={newSupplierForm.state} onChange={e => setNewSupplierForm(f => ({ ...f, state: e.target.value }))} placeholder="State / Province" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Country</label>
                <input type="text" value={newSupplierForm.country} onChange={e => setNewSupplierForm(f => ({ ...f, country: e.target.value }))} placeholder="Country" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={newSupplierForm.notes} onChange={e => setNewSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowAddSupplierModal(false); setNewSupplierForm(blankSupplierForm()); }} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
              <button onClick={handleQuickAddSupplier} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Add Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Partial Count Category Modal ─── */}
      {quickAddIngredientRow !== null && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeQuickAddIngredient} />
          <div className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Add Ingredient / Supply</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Create it here and use it in this production immediately.</p>
              </div>
              <button onClick={closeQuickAddIngredient} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); handleQuickAddIngredient(); }} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Name *</label>
                <input type="text" value={quickAddIngredientForm.name || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, name: e.target.value }))} placeholder="e.g. Sugar, Ice Block, Ketchup" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Category</label>
                  <input type="text" value={quickAddIngredientForm.category || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, category: e.target.value }))} placeholder="e.g. Ingredients, Packaging" list="production-ingredient-categories" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                  <datalist id="production-ingredient-categories">
                    {ingredientCategories.filter(category => category !== 'ALL').map(category => <option key={category} value={category} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Purchase Unit</label>
                  <select value={getIngredientPurchaseUnit(quickAddIngredientForm)} onChange={e => setQuickAddIngredientForm(form => ({ ...form, purchase_unit: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    {PURCHASE_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Stock Unit</label>
                  <select value={getIngredientStockUnit(quickAddIngredientForm)} onChange={e => setQuickAddIngredientForm(form => ({ ...form, unit: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    {STOCK_UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">1 {getIngredientPurchaseUnit(quickAddIngredientForm)} Equals</label>
                  <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-amber-500 dark:border-gray-700 dark:bg-gray-900">
                    <input type="number" step="0.001" min="0" value={quickAddIngredientForm.purchase_to_stock_quantity || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, purchase_to_stock_quantity: parseFloat(e.target.value) || 0 }))} placeholder="1" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-gray-900 outline-none dark:text-white" />
                    <span className="flex items-center border-l border-gray-200 px-3 text-xs font-bold text-gray-400 dark:border-gray-700">{getIngredientStockUnit(quickAddIngredientForm)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Cost per {getIngredientPurchaseUnit(quickAddIngredientForm)} ({currencySymbol})</label>
                  <input type="number" step="0.01" value={quickAddIngredientForm.cost || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, cost: parseFloat(e.target.value) || 0 }))} placeholder="0.00" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">SKU</label>
                  <input type="text" value={quickAddIngredientForm.sku || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, sku: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Barcode</label>
                  <input type="text" value={quickAddIngredientForm.barcode || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, barcode: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
                  <input type="text" value={quickAddIngredientForm.notes || ''} onChange={e => setQuickAddIngredientForm(form => ({ ...form, notes: e.target.value }))} placeholder="Optional notes" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button type="button" onClick={closeQuickAddIngredient} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {subTab === 'productions' && showForm && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Add Production</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Record finished stock or save a recipe cost reference.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Produced Item *</label>
                <select value={prodForm.producedItemId} onChange={e => { const mi = menuSelectableItems.find(m => m.id === e.target.value); setProdForm(f => ({ ...f, producedItemId: e.target.value, producedItemName: mi?.name || '', appliesTo: 'all', variantKey: '', variantLabel: '' })); }} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">Select menu item to produce</option>
                  {menuSelectableItems.map(m => <option key={m.id} value={m.id}>{m.name} (Stock: {getStockLevel(m.id)})</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quantity Produced *</label>
                  <button
                    type="button"
                    onClick={() => setShowQuantityProducedInfoModal(true)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition hover:border-amber-300 hover:text-amber-500 dark:border-gray-700"
                    aria-label="Quantity produced information"
                    title="Quantity produced information"
                  >
                    <Info size={12} />
                  </button>
                </div>
                <input type="number" step="0.001" min="0" value={prodForm.quantityProduced} onChange={e => setProdForm(f => ({ ...f, quantityProduced: e.target.value }))} placeholder="0" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Applicable</label>
                <div className="flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-900">
                  {([['all', 'All Variants'], ['variants', 'Adjust Variant']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProdForm(f => ({ ...f, appliesTo: key, variantKey: key === 'all' ? '' : f.variantKey, variantLabel: key === 'all' ? '' : f.variantLabel }))}
                      className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${prodForm.appliesTo === key ? 'bg-white text-amber-600 shadow-sm dark:bg-gray-800 dark:text-amber-400' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {prodForm.appliesTo === 'variants' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Variant</label>
                  <select value={prodForm.variantKey} onChange={e => { const option = selectedProductionVariantOptions.find(v => v.key === e.target.value); setProdForm(f => ({ ...f, variantKey: e.target.value, variantLabel: option?.label || '' })); }} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                    <option value="">Select variant</option>
                    {selectedProductionVariantOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                  {selectedProductionVariantOptions.length === 0 && <p className="mt-1 text-[10px] font-semibold text-gray-400">This menu item has no variants yet.</p>}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Notes</label>
              <input type="text" value={prodForm.notes} onChange={e => setProdForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>

            <div className="mb-2 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
              <span className="leading-tight">Ingredients missing from the list can be added from the dropdown, or managed with full details in Items & Stock.</span>
              {onNavigateToItemsStock && (
                <button onClick={onNavigateToItemsStock} className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 text-[9px] font-bold uppercase tracking-wider text-blue-700 shadow-sm transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70">
                  <ShoppingBag size={12} /> Items & Stock
                </button>
              )}
            </div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Ingredients Used</label>
            {prodForm.ingredients.map((ing, i) => (
              <div key={i} className="flex flex-col gap-2 mb-2 sm:flex-row sm:items-center">
                <select value={ing.menuItemId} onChange={e => {
                  if (e.target.value === '__add_ingredient__') {
                    openQuickAddIngredient(i);
                    return;
                  }
                  const mi = ingredientSelectableItems.find(m => m.id === e.target.value);
                  const ingredient = getIngredientById(e.target.value);
                  const ingredients = [...prodForm.ingredients];
                  ingredients[i] = { ...ingredients[i], menuItemId: e.target.value, name: mi?.name || '', unit: getIngredientStockUnit(ingredient) };
                  setProdForm(f => ({ ...f, ingredients }));
                }} className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="">Select ingredient</option>
                  {ingredientSelectableItems.map(m => {
                    const ingredient = getIngredientById(m.id);
                    return <option key={m.id} value={m.id}>{m.name} (Stock: {getStockLevel(m.id)} {getUnitLabel(getIngredientStockUnit(ingredient))})</option>;
                  })}
                  <option value="__add_ingredient__">+ Add Ingredient / Supply</option>
                </select>
                <div className="flex gap-2">
                  <input type="number" step="0.001" min="0" value={ing.quantityUsed} onChange={e => { const ingredients = [...prodForm.ingredients]; ingredients[i] = { ...ingredients[i], quantityUsed: e.target.value }; setProdForm(f => ({ ...f, ingredients })); }} placeholder="Qty" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none sm:w-20" />
                  <select value={ing.unit} onChange={e => { const ingredients = [...prodForm.ingredients]; ingredients[i] = { ...ingredients[i], unit: e.target.value }; setProdForm(f => ({ ...f, ingredients })); }} className="w-24 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none sm:w-20">
                    {getRelatedUnits(getIngredientById(ing.menuItemId)).map(unit => (
                      <option key={unit} value={unit}>{getUnitLabel(unit)}</option>
                    ))}
                  </select>
                  <button onClick={() => { const ingredients = prodForm.ingredients.filter((_, idx) => idx !== i); setProdForm(f => ({ ...f, ingredients })); }} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><X size={14} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setProdForm(f => ({ ...f, ingredients: [...f.ingredients, { menuItemId: '', name: '', quantityUsed: '', unit: 'pcs' }] }))} className="text-xs text-amber-400 font-bold flex items-center gap-1 mt-2 hover:text-amber-300"><Plus size={12} /> Add Ingredient</button>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
              <button
                onClick={handleSaveProduction}
                disabled={prodForm.appliesTo === 'variants' && !prodForm.variantKey}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Production
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductionInfoModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowProductionInfoModal(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">How Productions Work</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose the tab based on how you want stock to move.</p>
              </div>
              <button onClick={() => setShowProductionInfoModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
                <p className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">Batch Stock</p>
                <p className="mt-1 text-xs leading-relaxed">Use this when finished menu items are prepared before sale. A quantity above zero increases finished stock and deducts ingredient stock immediately.</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
                <p className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Recipe at Checkout</p>
                <p className="mt-1 text-xs leading-relaxed">Checkout uses produced stock first. When produced stock is not enough, the latest saved production recipe can be used as the ingredient reference for the remaining sold quantity.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200">Cost Only</p>
                <p className="mt-1 text-xs leading-relaxed">Enter 0 in Quantity Produced to save the ingredient cost reference without increasing finished stock or deducting ingredients.</p>
              </div>
            </div>
            <button onClick={() => setShowProductionInfoModal(false)} className="mt-6 w-full rounded-xl bg-amber-600 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-amber-700">
              Got It
            </button>
          </div>
        </div>
      )}

      {showQuantityProducedInfoModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowQuantityProducedInfoModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 className="text-base font-black text-gray-900 dark:text-white">Quantity Produced</h3>
              <button onClick={() => setShowQuantityProducedInfoModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              Enter the number of finished items produced. Enter 0 if you only want to save the recipe cost, without adding finished stock or deducting ingredients.
            </p>
            <button onClick={() => setShowQuantityProducedInfoModal(false)} className="mt-6 w-full rounded-xl bg-amber-600 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-amber-700">
              Got It
            </button>
          </div>
        </div>
      )}

      {showPartialCountModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPartialCountModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-gray-900 dark:text-white">Select Categories to Count</h3>
              <button onClick={() => setShowPartialCountModal(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Choose which categories to include in the partial count.</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
              {allCategories.map(cat => (
                <label key={cat} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedCountCategories.includes(cat)}
                    onChange={e => {
                      setSelectedCountCategories(prev =>
                        e.target.checked ? [...prev, cat] : prev.filter(c => c !== cat)
                      );
                    }}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">{cat}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{allSelectableItems.filter(m => m.category === cat).length} items</span>
                </label>
              ))}
              {allCategories.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">No categories found in menu items</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPartialCountModal(false)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
              <button
                onClick={() => { handleStartCount('partial', selectedCountCategories); setShowPartialCountModal(false); }}
                disabled={selectedCountCategories.length === 0}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >Start Count ({selectedCountCategories.length} categories)</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PO Detail Modal ─── */}
      {viewingPOId && (() => {
        const po = purchaseOrders.find(p => p.id === viewingPOId);
        if (!po) return null;
        const supplier = suppliers.find(s => s.id === po.supplierId);
        const orderedTotal = getPOTotal(po);
        const receivedTotal = getPOTotal(po, true);
        const orderedQuantity = po.items.reduce((sum, item) => sum + item.quantity, 0);
        const receivedQuantity = po.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
        const poSign = getPOCostSign(po);
        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingPOId(null)} />
            <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-gray-900 dark:text-white">PO-{po.id.slice(-6)}</h3>
                    <StatusBadge status={po.status} />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Purchase order details, item quantities, prices, and receipt progress.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => downloadPOExcel(po)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 transition hover:border-amber-300 hover:text-amber-600 dark:border-gray-700 dark:text-gray-300">
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                  <button onClick={() => void downloadPOPdf(po)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-500 transition hover:border-amber-300 hover:text-amber-600 dark:border-gray-700 dark:text-gray-300">
                    <FileText size={13} /> PDF
                  </button>
                  <button onClick={() => setViewingPOId(null)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Supplier</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{po.supplierName}</p>
                  {supplier?.phone && <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{supplier.phone}</p>}
                  {supplier?.email && <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{supplier.email}</p>}
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Created</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{formatDate(po.createdAt)}</p>
                  <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Expected: {po.expectedDate || '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Quantity</p>
                  <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{receivedQuantity.toLocaleString()} / {orderedQuantity.toLocaleString()}</p>
                  <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Received / ordered</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">Cost</p>
                  <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-300">{formatMoney(orderedTotal)}</p>
                  <p className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-200/80">Received: {formatMoney(receivedTotal)}</p>
                </div>
              </div>

              {po.notes && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Notes</p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{po.notes}</p>
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">Item</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Ordered</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Received</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Stock Added</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Cost / Unit</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-gray-400">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {po.items.map((item, index) => {
                        const purchaseUnit = getUnitLabel(getPOPurchaseUnit(item));
                        const stockUnit = getUnitLabel(getPOStockUnit(item));
                        const stockAdded = getPOStockQuantity(item, item.receivedQuantity) * poSign;
                        const lineTotal = item.quantity * item.costPerUnit * poSign;
                        return (
                          <tr key={`${item.menuItemId}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-3">
                              <p className="text-xs font-bold text-gray-900 dark:text-white">{item.name}</p>
                              <p className="mt-1 text-[10px] text-gray-400">1 {purchaseUnit} = {getPOStockQuantityPerUnit(item).toLocaleString()} {stockUnit}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-300">{item.quantity.toLocaleString()} {purchaseUnit}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-300">{item.receivedQuantity.toLocaleString()} {purchaseUnit}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-300">{stockAdded.toLocaleString()} {stockUnit}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-900 dark:text-white">{formatMoney(item.costPerUnit)}</td>
                            <td className={`px-4 py-3 text-right text-xs font-bold ${lineTotal < 0 ? 'text-red-400' : 'text-amber-500'}`}>{formatMoney(lineTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => setViewingPOId(null)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Close</button>
                {(po.status === 'sent' || po.status === 'partial') && (
                  <button onClick={() => { setViewingPOId(null); handleOpenReceiveModal(po.id); }} className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">Receive Items</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── PO Receive Items Modal ─── */}
      {receivingPOId && (() => {
        const po = purchaseOrders.find(p => p.id === receivingPOId);
        if (!po) return null;
        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReceivingPOId(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-gray-900 dark:text-white">Receive Items — PO-{po.id.slice(-6)}</h3>
                <button onClick={() => setReceivingPOId(null)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-white transition-all">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Enter the quantity received for each item.</p>
              <div className="space-y-3 max-h-60 overflow-y-auto mb-6">
                {po.items.map(item => {
                  const remaining = item.quantity - item.receivedQuantity;
                  return (
                    <div key={item.menuItemId} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-[10px] text-gray-400">
                          Ordered: {item.quantity} {getUnitLabel(getPOPurchaseUnit(item))} | Received: {item.receivedQuantity} {getUnitLabel(getPOPurchaseUnit(item))} | Remaining: {remaining} {getUnitLabel(getPOPurchaseUnit(item))}
                        </p>
                        <p className="text-[10px] text-gray-400">Stock added if full remaining: {getPOStockQuantity(item, remaining).toLocaleString()} {getUnitLabel(getPOStockUnit(item))}</p>
                      </div>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={remaining}
                        value={receiveQuantities[item.menuItemId] || ''}
                        onChange={e => setReceiveQuantities(prev => ({ ...prev, [item.menuItemId]: Math.min(parseFloat(e.target.value) || 0, remaining) }))}
                        placeholder="0"
                        className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReceivingPOId(null)} className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-gray-300 dark:hover:bg-gray-600 transition-all">Cancel</button>
                <button onClick={handleConfirmPartialReceive} className="flex-1 py-3 rounded-xl bg-green-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-green-700 transition-all shadow-lg shadow-green-600/20">Confirm Receive</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};

export default InventoryManagement;
