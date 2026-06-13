-- 041: Dedicated staff claim tables.
-- Staff claims are stored as claim headers plus claim line items, while an
-- aggregate Staff / Claims expense row is still maintained by the app for
-- reporting in All Expenses.

CREATE TABLE IF NOT EXISTS staff_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  claim_period TEXT NOT NULL,
  claim_date DATE NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_claim_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES staff_claims(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  receipt_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_claims_restaurant_date ON staff_claims(restaurant_id, claim_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_claims_staff ON staff_claims(staff_user_id, claim_date DESC);
CREATE INDEX IF NOT EXISTS idx_staff_claim_items_claim ON staff_claim_items(claim_id);

ALTER TABLE staff_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_claim_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_claims_all" ON staff_claims;
CREATE POLICY "staff_claims_all" ON staff_claims FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff_claim_items_all" ON staff_claim_items;
CREATE POLICY "staff_claim_items_all" ON staff_claim_items FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_claims'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_claims;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_claim_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_claim_items;
  END IF;
END $$;
