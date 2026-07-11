import { supabase } from './supabase';

export interface PurchaseOrderLine {
  menuItemId: string;
  name: string;
  quantity: number;
  costPerUnit: number;
  receivedQuantity: number;
  purchaseUnit?: string;
  stockUnit?: string;
  stockQuantityPerUnit?: number;
}

export interface PurchaseOrderStatusLogEntry {
  id: string;
  fromStatus: PurchaseOrderRecord['status'] | 'created';
  toStatus: PurchaseOrderRecord['status'];
  staffName: string;
  timestamp: number;
  notes: string;
}

export interface PurchaseOrderRecord {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderLine[];
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled' | 'returned';
  createdAt: number;
  expectedDate: string;
  receivedDate?: string;
  notes: string;
  statusLog: PurchaseOrderStatusLogEntry[];
}

type PurchaseOrderRow = {
  id: string;
  order_number: string | null;
  restaurant_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  items: PurchaseOrderLine[] | null;
  status: PurchaseOrderRecord['status'] | null;
  created_at: number | null;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
  status_log: PurchaseOrderStatusLogEntry[] | null;
};

const VALID_STATUSES: PurchaseOrderRecord['status'][] = ['draft', 'sent', 'partial', 'received', 'cancelled', 'returned'];

const normalizeStatus = (status: unknown): PurchaseOrderRecord['status'] => (
  VALID_STATUSES.includes(status as PurchaseOrderRecord['status'])
    ? status as PurchaseOrderRecord['status']
    : 'draft'
);

const normalizeLine = (line: Partial<PurchaseOrderLine>): PurchaseOrderLine => ({
  menuItemId: line.menuItemId || '',
  name: line.name || 'Unknown Item',
  quantity: Number(line.quantity || 0),
  costPerUnit: Number(line.costPerUnit || 0),
  receivedQuantity: Number(line.receivedQuantity || 0),
  purchaseUnit: line.purchaseUnit || 'pcs',
  stockUnit: line.stockUnit || 'pcs',
  stockQuantityPerUnit: Number(line.stockQuantityPerUnit || 1),
});

const normalizeStatusLogEntry = (entry: Partial<PurchaseOrderStatusLogEntry>): PurchaseOrderStatusLogEntry => ({
  id: entry.id || crypto.randomUUID(),
  fromStatus: entry.fromStatus === 'created' ? 'created' : normalizeStatus(entry.fromStatus),
  toStatus: normalizeStatus(entry.toStatus),
  staffName: entry.staffName || 'Current staff',
  timestamp: Number(entry.timestamp || Date.now()),
  notes: entry.notes || '',
});

const fromRow = (row: PurchaseOrderRow): PurchaseOrderRecord => ({
  id: row.id,
  orderNumber: row.order_number || '',
  supplierId: row.supplier_id || '',
  supplierName: row.supplier_name || 'Unknown',
  items: Array.isArray(row.items) ? row.items.map(normalizeLine) : [],
  status: normalizeStatus(row.status),
  createdAt: Number(row.created_at || Date.now()),
  expectedDate: row.expected_date || '',
  receivedDate: row.received_date || undefined,
  notes: row.notes || '',
  statusLog: Array.isArray(row.status_log) ? row.status_log.map(normalizeStatusLogEntry) : [],
});

const toRow = (restaurantId: string, po: PurchaseOrderRecord) => ({
  id: po.id,
  order_number: po.orderNumber || null,
  restaurant_id: restaurantId,
  supplier_id: po.supplierId || '',
  supplier_name: po.supplierName || 'Unknown',
  items: po.items || [],
  status: normalizeStatus(po.status),
  created_at: Number(po.createdAt || Date.now()),
  expected_date: po.expectedDate || null,
  received_date: po.receivedDate || null,
  notes: po.notes || '',
  status_log: po.statusLog || [],
});

export async function fetchPurchaseOrdersFromDb(restaurantId: string): Promise<PurchaseOrderRecord[] | null> {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Purchase order cloud load skipped:', error.message);
      return null;
    }
    return (data || []).map(row => fromRow(row as PurchaseOrderRow));
  } catch (error) {
    console.warn('Purchase order cloud load skipped:', error);
    return null;
  }
}

export async function savePurchaseOrderToDb(restaurantId: string, po: PurchaseOrderRecord): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .upsert(toRow(restaurantId, po), { onConflict: 'id' });

    if (error) {
      console.warn('Purchase order cloud save skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Purchase order cloud save skipped:', error);
    return false;
  }
}

export async function savePurchaseOrdersToDb(restaurantId: string, orders: PurchaseOrderRecord[]): Promise<boolean> {
  if (orders.length === 0) return true;
  try {
    const { error } = await supabase
      .from('purchase_orders')
      .upsert(orders.map(po => toRow(restaurantId, po)), { onConflict: 'id' });

    if (error) {
      console.warn('Purchase order cloud sync skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Purchase order cloud sync skipped:', error);
    return false;
  }
}
