import { IngredientItem } from '../src/types';
import { supabase } from './supabase';

type IngredientItemRow = {
  id: string;
  restaurant_id: string;
  name: string;
  category: string | null;
  cost: number | string | null;
  unit: string | null;
  purchase_unit: string | null;
  purchase_to_stock_quantity: number | string | null;
  sku: string | null;
  barcode: string | null;
  is_archived: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const normalizeIngredient = (item: Partial<IngredientItem>): IngredientItem => ({
  id: item.id || crypto.randomUUID(),
  restaurant_id: item.restaurant_id || '',
  name: item.name || '',
  category: item.category || 'Uncategorized',
  cost: Number(item.cost || 0),
  unit: item.unit || 'pcs',
  purchase_unit: item.purchase_unit || item.unit || 'pcs',
  purchase_to_stock_quantity: Number(item.purchase_to_stock_quantity || 1),
  sku: item.sku || '',
  barcode: item.barcode || '',
  is_archived: Boolean(item.is_archived),
  notes: item.notes || '',
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const fromRow = (row: IngredientItemRow): IngredientItem => normalizeIngredient({
  id: row.id,
  restaurant_id: row.restaurant_id,
  name: row.name,
  category: row.category || 'Uncategorized',
  cost: Number(row.cost || 0),
  unit: row.unit || 'pcs',
  purchase_unit: row.purchase_unit || row.unit || 'pcs',
  purchase_to_stock_quantity: Number(row.purchase_to_stock_quantity || 1),
  sku: row.sku || '',
  barcode: row.barcode || '',
  is_archived: Boolean(row.is_archived),
  notes: row.notes || '',
  created_at: row.created_at || undefined,
  updated_at: row.updated_at || undefined,
});

const toRow = (restaurantId: string, item: IngredientItem) => {
  const normalized = normalizeIngredient({ ...item, restaurant_id: restaurantId });
  return {
    id: normalized.id,
    restaurant_id: restaurantId,
    name: normalized.name,
    category: normalized.category || 'Uncategorized',
    cost: Number(normalized.cost || 0),
    unit: normalized.unit || 'pcs',
    purchase_unit: normalized.purchase_unit || normalized.unit || 'pcs',
    purchase_to_stock_quantity: Number(normalized.purchase_to_stock_quantity || 1),
    sku: normalized.sku || null,
    barcode: normalized.barcode || null,
    is_archived: Boolean(normalized.is_archived),
    notes: normalized.notes || '',
    created_at: normalized.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export async function fetchIngredientItemsFromDb(restaurantId: string): Promise<IngredientItem[] | null> {
  try {
    const { data, error } = await supabase
      .from('ingredient_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Ingredient cloud load skipped:', error.message);
      return null;
    }
    return (data || []).map(row => fromRow(row as IngredientItemRow));
  } catch (error) {
    console.warn('Ingredient cloud load skipped:', error);
    return null;
  }
}

export async function saveIngredientItemsToDb(restaurantId: string, items: IngredientItem[]): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const { error } = await supabase
      .from('ingredient_items')
      .upsert(items.map(item => toRow(restaurantId, item)), { onConflict: 'id' });

    if (error) {
      console.warn('Ingredient cloud sync skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Ingredient cloud sync skipped:', error);
    return false;
  }
}

export async function deleteIngredientItemFromDb(restaurantId: string, itemId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('ingredient_items')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('id', itemId);

    if (error) {
      console.warn('Ingredient cloud delete skipped:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Ingredient cloud delete skipped:', error);
    return false;
  }
}
