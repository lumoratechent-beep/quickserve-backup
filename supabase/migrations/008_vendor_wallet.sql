-- Vendor bank details for cashout
CREATE TABLE IF NOT EXISTS vendor_bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id)
);

-- Wallet transactions: records each online order payment collected by platform
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id),
  amount NUMERIC(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sale', 'cashout')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'failed')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cashout requests from vendors
CREATE TABLE IF NOT EXISTS cashout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected')),
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_restaurant ON wallet_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order ON wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_cashout_requests_restaurant ON cashout_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cashout_requests_status ON cashout_requests(status);

COMMENT ON TABLE vendor_bank_details IS 'Bank details saved by vendors for receiving cashout payments';
COMMENT ON TABLE wallet_transactions IS 'Records of online order payments (sales) and cashouts for each vendor';
COMMENT ON TABLE cashout_requests IS 'Vendor requests to withdraw their wallet balance, reviewed by admin';
