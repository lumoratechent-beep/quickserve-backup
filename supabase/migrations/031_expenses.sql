-- 031: Dedicated expenses table
-- Moves expenses from the restaurants.settings.backoffice JSONB blob
-- into a proper relational table for better querying, indexing, and scalability.

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  notes TEXT NOT NULL DEFAULT '',
  attachment_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('COGS', 'OPEX')),
  -- Staff payslip fields (nullable, only used when category = 'Staff' and subcategory = 'Salary')
  staff_name TEXT,
  staff_role TEXT,
  basic_salary NUMERIC(12, 2),
  allowances NUMERIC(12, 2),
  deductions NUMERIC(12, 2),
  pay_period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_restaurant ON expenses(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_restaurant_date ON expenses(restaurant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_restaurant_category ON expenses(restaurant_id, category);

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow all operations (auth handled at app level)
CREATE POLICY "expenses_all" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for cross-device sync
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
