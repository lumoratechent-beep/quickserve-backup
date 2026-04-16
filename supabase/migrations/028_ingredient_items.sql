-- 028: Ingredient / non-menu stock items
-- Allows vendors to track items that are NOT on the menu (e.g. ice blocks, sugar,
-- ketchup, packaging) so they can appear in purchase orders and P&L analysis.

CREATE TABLE IF NOT EXISTS ingredient_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,        -- cost per unit (for COGS / P&L)
  unit TEXT NOT NULL DEFAULT 'pcs',               -- pcs, kg, litre, box, pack …
  sku TEXT,
  barcode TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ingredient_items_restaurant ON ingredient_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_items_category ON ingredient_items(restaurant_id, category);

-- Enable RLS
ALTER TABLE ingredient_items ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow all operations for authenticated users
CREATE POLICY "ingredient_items_all" ON ingredient_items FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE ingredient_items;
