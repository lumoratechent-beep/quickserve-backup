-- Local billing records for admin-granted extensions and other non-Stripe transactions
CREATE TABLE IF NOT EXISTS billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_records_restaurant ON billing_records(restaurant_id);
