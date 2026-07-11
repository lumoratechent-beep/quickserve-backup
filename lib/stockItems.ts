import { supabase } from './supabase';

export interface StockItemRecord {
  menuItemId: string;
  name: string;
  category: string;
  currentStock: number;
  lowStockThreshold: number;
  unit: string;
  lastRestocked?: number;
  stockEnabled: boolean;
}

export interface StockMovementRecord {
  itemId: string;
  itemType?: 'menu' | 'ingredient' | 'other';
  itemName: string;
  movementType:
    | 'po_received'
    | 'po_return'
    | 'transfer_out'
    | 'transfer_in'
    | 'transfer_cancelled'
    | 'adjustment'
    | 'production_output'
    | 'production_ingredient_used'
    | 'pos_sale'
    | 'manual_set'
    | 'migration_import'
    | 'other';
  direction: 'in' | 'out' | 'adjust';
  quantity: number;
  unit?: string;
  previousStock?: number;
  newStock?: number;
  referenceType?: string;
  referenceId?: string;
  detail?: string;
  createdBy?: string;
}

type StockItemRow = {
  item_id: string;
  name: string | null;
  category: string | null;
  current_stock: number | string | null;
  low_stock_threshold: number | string | null;
  unit: string | null;
  last_restocked: string | null;
  stock_enabled: boolean | null;
};

const fromRow = (row: StockItemRow): StockItemRecord => ({
  menuItemId: row.item_id,
  name: row.name || 'Unknown Item',
  category: row.category || 'Uncategorized',
  currentStock: Number(row.current_stock || 0),
  lowStockThreshold: Number(row.low_stock_threshold || 0),
  unit: row.unit || 'pcs',
  lastRestocked: row.last_restocked ? new Date(row.last_restocked).getTime() : undefined,
  stockEnabled: Boolean(row.stock_enabled),
});

const inferItemType = (itemId: string, ingredientIds?: Set<string>): 'menu' | 'ingredient' | 'other' => {
  if (ingredientIds?.has(itemId)) return 'ingredient';
  return 'menu';
};

const toRow = (restaurantId: string, item: StockItemRecord, ingredientIds?: Set<string>) => ({
  restaurant_id: restaurantId,
  item_id: item.menuItemId,
  item_type: inferItemType(item.menuItemId, ingredientIds),
  name: item.name || 'Unknown Item',
  category: item.category || 'Uncategorized',
  current_stock: Number(item.currentStock || 0),
  low_stock_threshold: Number(item.lowStockThreshold || 0),
  unit: item.unit || 'pcs',
  last_restocked: item.lastRestocked ? new Date(item.lastRestocked).toISOString() : null,
  stock_enabled: Boolean(item.stockEnabled),
});

export async function fetchStockItemsFromDb(restaurantId: string): Promise<StockItemRecord[] | null> {
  try {
    const { data, error } = await supabase
      .from('stock_items')
      .select('item_id,name,category,current_stock,low_stock_threshold,unit,last_restocked,stock_enabled')
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true });

    if (error) {
      console.warn('Stock cloud load skipped:', error.message);
      return null;
    }
    return (data || []).map(row => fromRow(row as StockItemRow));
  } catch (error) {
    console.warn('Stock cloud load skipped:', error);
    return null;
  }
}

export async function saveStockItemsToDb(
  restaurantId: string,
  items: StockItemRecord[],
  ingredientIds?: Set<string>,
): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const { error } = await supabase
      .from('stock_items')
      .upsert(items.map(item => toRow(restaurantId, item, ingredientIds)), { onConflict: 'restaurant_id,item_id' });

    if (error) {
      console.warn('Stock cloud save skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Stock cloud save skipped:', error);
    return false;
  }
}

export async function saveStockMovementsToDb(
  restaurantId: string,
  movements: StockMovementRecord[],
): Promise<boolean> {
  if (movements.length === 0) return true;
  try {
    const { error } = await supabase
      .from('stock_movements')
      .insert(movements.map(movement => ({
        restaurant_id: restaurantId,
        item_id: movement.itemId,
        item_type: movement.itemType || 'menu',
        item_name: movement.itemName || 'Unknown Item',
        movement_type: movement.movementType,
        direction: movement.direction,
        quantity: Number(movement.quantity || 0),
        unit: movement.unit || 'pcs',
        previous_stock: movement.previousStock ?? null,
        new_stock: movement.newStock ?? null,
        reference_type: movement.referenceType || null,
        reference_id: movement.referenceId || null,
        detail: movement.detail || null,
        created_by: movement.createdBy || null,
      })));

    if (error) {
      console.warn('Stock movement cloud save skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Stock movement cloud save skipped:', error);
    return false;
  }
}
