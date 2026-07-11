-- 053: Dedicated purchase orders table
-- Keeps growing PO ledgers out of restaurants.settings.backoffice so Back Office
-- does not load/sync them unless the Purchase Orders screen is opened.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT 'Unknown',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled', 'returned')),
  created_at BIGINT NOT NULL DEFAULT ((EXTRACT(EPOCH FROM now()) * 1000)::BIGINT),
  expected_date DATE,
  received_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_restaurant_created
  ON purchase_orders(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_restaurant_status
  ON purchase_orders(restaurant_id, status);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_orders_all"
  ON purchase_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
