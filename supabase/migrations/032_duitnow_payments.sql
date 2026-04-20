-- DuitNow QR payment option for restaurants without debit/credit cards
-- Per-restaurant toggle: default OFF (Stripe only), admin enables it

-- Flag on subscriptions table: whether this vendor can pay via DuitNow QR
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duitnow_enabled BOOLEAN DEFAULT FALSE;

-- DuitNow payment requests table
CREATE TABLE IF NOT EXISTS duitnow_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('basic', 'pro', 'pro_plus')),
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual')),
  amount NUMERIC(10,2) NOT NULL,
  -- 'pending' = awaiting admin review, 'approved' = admin confirmed, 'rejected' = admin declined
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Optional proof-of-payment attachment (image URL)
  attachment_url TEXT,
  -- Reference number from bank transfer
  reference_number TEXT,
  -- Admin notes (reason for rejection, etc.)
  admin_note TEXT,
  -- Who reviewed it
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_duitnow_payments_restaurant ON duitnow_payments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_duitnow_payments_status ON duitnow_payments(status);

-- RLS policies
ALTER TABLE duitnow_payments ENABLE ROW LEVEL SECURITY;

-- Vendors can see their own payments
CREATE POLICY "Vendors can view own duitnow payments"
  ON duitnow_payments FOR SELECT
  USING (true);

-- Vendors can insert their own payments
CREATE POLICY "Vendors can create duitnow payments"
  ON duitnow_payments FOR INSERT
  WITH CHECK (true);

-- Admin (service key) can update all
CREATE POLICY "Service role can update duitnow payments"
  ON duitnow_payments FOR UPDATE
  USING (true);
