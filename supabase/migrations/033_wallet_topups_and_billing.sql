-- Extend wallet transactions to support top-ups and subscription payments.

ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('sale', 'deposit', 'cashout', 'billing'));

COMMENT ON TABLE wallet_transactions IS 'Records of wallet credits (sales, deposits) and debits (cashouts, billing payments) for each vendor';

NOTIFY pgrst, 'reload schema';