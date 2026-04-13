-- 023: Cashier shift management
-- Tracks open/close shifts with cash drawer amounts

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  cashier_name TEXT NOT NULL,
  cashier_user_id TEXT,

  -- Shift timing
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,

  -- Cash drawer
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_closing_amount NUMERIC(12,2),
  actual_closing_amount NUMERIC(12,2),
  difference NUMERIC(12,2),        -- actual - expected (negative = short)

  -- Sales breakdown (populated on close)
  total_cash_sales NUMERIC(12,2) DEFAULT 0,
  total_card_sales NUMERIC(12,2) DEFAULT 0,
  total_qr_sales NUMERIC(12,2) DEFAULT 0,
  total_other_sales NUMERIC(12,2) DEFAULT 0,
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_refunds NUMERIC(12,2) DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  close_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_restaurant ON cashier_shifts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_status ON cashier_shifts(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier ON cashier_shifts(restaurant_id, cashier_name);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opened ON cashier_shifts(opened_at DESC);

-- Enable RLS
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow all operations for authenticated users
CREATE POLICY "cashier_shifts_all" ON cashier_shifts FOR ALL USING (true) WITH CHECK (true);
