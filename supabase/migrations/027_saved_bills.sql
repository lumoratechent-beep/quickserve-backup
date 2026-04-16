-- 027: Saved bills persistence & cross-device sync
-- Moves saved bills from localStorage to Supabase for persistence and multi-device sync

CREATE TABLE IF NOT EXISTS saved_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  table_number TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  remark TEXT NOT NULL DEFAULT '',
  dining_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One saved bill per table per restaurant
  CONSTRAINT saved_bills_restaurant_table_unique UNIQUE (restaurant_id, table_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_bills_restaurant ON saved_bills(restaurant_id);

-- Enable RLS
ALTER TABLE saved_bills ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow all operations for authenticated users
CREATE POLICY "saved_bills_all" ON saved_bills FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for cross-device sync
ALTER PUBLICATION supabase_realtime ADD TABLE saved_bills;
