-- Add extension type and financial columns to billing_records
-- type: 'free' (trial extension), 'paid' (cash payment to QuickServe), or 'stripe' (online card payment)
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'free';
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS gross NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS net NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS restaurant_name TEXT;
