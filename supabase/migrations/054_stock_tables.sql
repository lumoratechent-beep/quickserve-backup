-- 054: Dedicated stock tables
-- Moves stock balances out of restaurants.settings.backoffice.stock so inventory
-- changes can sync safely across devices. stock_movements keeps an auditable
-- ledger for PO receiving, production, POS recipe checkout, and manual changes.

CREATE TABLE IF NOT EXISTS stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'menu'
    CHECK (item_type IN ('menu', 'ingredient', 'other')),
  name TEXT NOT NULL DEFAULT 'Unknown Item',
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  last_restocked TIMESTAMPTZ,
  stock_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_items_restaurant_item_unique UNIQUE (restaurant_id, item_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'menu'
    CHECK (item_type IN ('menu', 'ingredient', 'other')),
  item_name TEXT NOT NULL DEFAULT 'Unknown Item',
  movement_type TEXT NOT NULL DEFAULT 'other'
    CHECK (movement_type IN (
      'po_received',
      'po_return',
      'transfer_out',
      'transfer_in',
      'transfer_cancelled',
      'adjustment',
      'production_output',
      'production_ingredient_used',
      'pos_sale',
      'manual_set',
      'migration_import',
      'other'
    )),
  direction TEXT NOT NULL DEFAULT 'adjust'
    CHECK (direction IN ('in', 'out', 'adjust')),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'pcs',
  previous_stock NUMERIC(14,3),
  new_stock NUMERIC(14,3),
  reference_type TEXT,
  reference_id TEXT,
  detail TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_restaurant
  ON stock_items(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_stock_items_restaurant_enabled
  ON stock_items(restaurant_id, stock_enabled);

CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant_created
  ON stock_movements(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant_item_created
  ON stock_movements(restaurant_id, item_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_stock_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_items_updated_at ON stock_items;
CREATE TRIGGER trg_stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW
  EXECUTE FUNCTION set_stock_items_updated_at();

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_items_all" ON stock_items;
DROP POLICY IF EXISTS "stock_movements_all" ON stock_movements;

CREATE POLICY "stock_items_all"
  ON stock_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "stock_movements_all"
  ON stock_movements
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- One-time migration from the old JSON cache into stock_items.
INSERT INTO stock_items (
  restaurant_id,
  item_id,
  item_type,
  name,
  category,
  current_stock,
  low_stock_threshold,
  unit,
  last_restocked,
  stock_enabled
)
SELECT
  r.id::TEXT,
  stock."menuItemId",
  CASE
    WHEN ingredient.id IS NOT NULL THEN 'ingredient'
    ELSE 'menu'
  END,
  COALESCE(NULLIF(stock.name, ''), 'Unknown Item'),
  COALESCE(NULLIF(stock.category, ''), 'Uncategorized'),
  COALESCE(stock."currentStock", 0),
  COALESCE(stock."lowStockThreshold", 0),
  COALESCE(NULLIF(stock.unit, ''), 'pcs'),
  CASE
    WHEN stock."lastRestocked" IS NULL OR stock."lastRestocked" <= 0 THEN NULL
    ELSE to_timestamp(stock."lastRestocked" / 1000.0)
  END,
  COALESCE(stock."stockEnabled", false)
FROM restaurants r
CROSS JOIN LATERAL jsonb_to_recordset(
  CASE
    WHEN jsonb_typeof(r.settings->'backoffice'->'stock') = 'array'
      THEN r.settings->'backoffice'->'stock'
    ELSE '[]'::jsonb
  END
) AS stock(
  "menuItemId" TEXT,
  name TEXT,
  category TEXT,
  "currentStock" NUMERIC,
  "lowStockThreshold" NUMERIC,
  unit TEXT,
  "lastRestocked" NUMERIC,
  "stockEnabled" BOOLEAN
)
LEFT JOIN ingredient_items ingredient
  ON ingredient.restaurant_id = r.id::TEXT
  AND ingredient.id::TEXT = stock."menuItemId"
WHERE stock."menuItemId" IS NOT NULL
  AND stock."menuItemId" <> ''
ON CONFLICT (restaurant_id, item_id) DO UPDATE SET
  item_type = EXCLUDED.item_type,
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  current_stock = EXCLUDED.current_stock,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  unit = EXCLUDED.unit,
  last_restocked = EXCLUDED.last_restocked,
  stock_enabled = EXCLUDED.stock_enabled;

INSERT INTO stock_movements (
  restaurant_id,
  item_id,
  item_type,
  item_name,
  movement_type,
  direction,
  quantity,
  unit,
  previous_stock,
  new_stock,
  reference_type,
  detail
)
SELECT
  restaurant_id,
  item_id,
  item_type,
  name,
  'migration_import',
  'adjust',
  current_stock,
  unit,
  NULL,
  current_stock,
  'settings.backoffice.stock',
  'Imported from legacy stock cache'
FROM stock_items
WHERE current_stock <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM stock_movements movement
    WHERE movement.restaurant_id = stock_items.restaurant_id
      AND movement.item_id = stock_items.item_id
      AND movement.movement_type = 'migration_import'
      AND movement.reference_type = 'settings.backoffice.stock'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'stock_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'stock_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
  END IF;
END $$;
