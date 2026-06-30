-- 050: HR role and staff leave management.
-- Adds leave records plus per-staff entitlement rules stored on staff_profiles.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('CUSTOMER', 'VENDOR', 'ADMIN', 'CASHIER', 'KITCHEN', 'ORDER_TAKER', 'MANAGER', 'HR')
);

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS leave_entitlements JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS staff_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('MC', 'Hospitalization', 'Paternity', 'Annual', 'Other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days NUMERIC(8, 2) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'approved', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_leaves_restaurant_dates ON staff_leaves(restaurant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff ON staff_leaves(staff_user_id, start_date DESC);

ALTER TABLE staff_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_leaves_all" ON staff_leaves;
CREATE POLICY "staff_leaves_all" ON staff_leaves FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_leaves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_leaves;
  END IF;
END $$;
