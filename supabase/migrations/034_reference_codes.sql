-- Add DB-backed reference codes so admin, wallet, and billing views use the same source of truth.

CREATE SEQUENCE IF NOT EXISTS wallet_reference_code_seq;
CREATE SEQUENCE IF NOT EXISTS duitnow_reference_code_seq;
CREATE SEQUENCE IF NOT EXISTS billing_reference_code_seq;

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reference_code TEXT;
ALTER TABLE duitnow_payments ADD COLUMN IF NOT EXISTS reference_code TEXT;
ALTER TABLE billing_records ADD COLUMN IF NOT EXISTS reference_code TEXT;

CREATE OR REPLACE FUNCTION next_formatted_reference_code(prefix TEXT, source_date TIMESTAMPTZ, seq_name REGCLASS)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_value BIGINT;
BEGIN
  SELECT nextval(seq_name) INTO seq_value;

  RETURN prefix
    || '-'
    || TO_CHAR(COALESCE(source_date, NOW()), 'YYYYMMDD')
    || '-'
    || LPAD(seq_value::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION assign_wallet_reference_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
BEGIN
  IF NEW.reference_code IS NOT NULL AND BTRIM(NEW.reference_code) <> '' THEN
    RETURN NEW;
  END IF;

  prefix := CASE
    WHEN NEW.type = 'deposit' AND COALESCE(NEW.description, '') ILIKE 'Wallet deposit via QR%' THEN 'DNW'
    WHEN NEW.type = 'deposit' THEN 'WLT'
    WHEN NEW.type = 'billing' THEN 'BIL'
    WHEN NEW.type = 'cashout' THEN 'COT'
    WHEN NEW.type = 'sale' THEN 'SAL'
    ELSE 'WTX'
  END;

  NEW.reference_code := next_formatted_reference_code(prefix, COALESCE(NEW.created_at, NOW()), 'wallet_reference_code_seq'::REGCLASS);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_duitnow_reference_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR BTRIM(NEW.reference_code) = '' THEN
    NEW.reference_code := next_formatted_reference_code('DNB', COALESCE(NEW.created_at, NOW()), 'duitnow_reference_code_seq'::REGCLASS);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_billing_reference_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_code IS NULL OR BTRIM(NEW.reference_code) = '' THEN
    NEW.reference_code := next_formatted_reference_code('BIL', COALESCE(NEW.created_at, NOW()), 'billing_reference_code_seq'::REGCLASS);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_reference_code_trigger ON wallet_transactions;
CREATE TRIGGER wallet_transactions_reference_code_trigger
BEFORE INSERT ON wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION assign_wallet_reference_code();

DROP TRIGGER IF EXISTS duitnow_payments_reference_code_trigger ON duitnow_payments;
CREATE TRIGGER duitnow_payments_reference_code_trigger
BEFORE INSERT ON duitnow_payments
FOR EACH ROW
EXECUTE FUNCTION assign_duitnow_reference_code();

DROP TRIGGER IF EXISTS billing_records_reference_code_trigger ON billing_records;
CREATE TRIGGER billing_records_reference_code_trigger
BEFORE INSERT ON billing_records
FOR EACH ROW
EXECUTE FUNCTION assign_billing_reference_code();

WITH ordered_wallet AS (
  SELECT
    id,
    CASE
      WHEN type = 'deposit' AND COALESCE(description, '') ILIKE 'Wallet deposit via QR%' THEN 'DNW'
      WHEN type = 'deposit' THEN 'WLT'
      WHEN type = 'billing' THEN 'BIL'
      WHEN type = 'cashout' THEN 'COT'
      WHEN type = 'sale' THEN 'SAL'
      ELSE 'WTX'
    END AS prefix,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY
      CASE
        WHEN type = 'deposit' AND COALESCE(description, '') ILIKE 'Wallet deposit via QR%' THEN 'DNW'
        WHEN type = 'deposit' THEN 'WLT'
        WHEN type = 'billing' THEN 'BIL'
        WHEN type = 'cashout' THEN 'COT'
        WHEN type = 'sale' THEN 'SAL'
        ELSE 'WTX'
      END,
      DATE(COALESCE(created_at, NOW()))
      ORDER BY COALESCE(created_at, NOW()), id
    ) AS seq
  FROM wallet_transactions
  WHERE reference_code IS NULL OR BTRIM(reference_code) = ''
)
UPDATE wallet_transactions wt
SET reference_code = ordered_wallet.prefix || '-' || TO_CHAR(COALESCE(ordered_wallet.created_at, NOW()), 'YYYYMMDD') || '-' || LPAD(ordered_wallet.seq::TEXT, 6, '0')
FROM ordered_wallet
WHERE wt.id = ordered_wallet.id;

WITH ordered_duitnow AS (
  SELECT
    id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY DATE(COALESCE(created_at, NOW())) ORDER BY COALESCE(created_at, NOW()), id) AS seq
  FROM duitnow_payments
  WHERE reference_code IS NULL OR BTRIM(reference_code) = ''
)
UPDATE duitnow_payments dp
SET reference_code = 'DNB-' || TO_CHAR(COALESCE(ordered_duitnow.created_at, NOW()), 'YYYYMMDD') || '-' || LPAD(ordered_duitnow.seq::TEXT, 6, '0')
FROM ordered_duitnow
WHERE dp.id = ordered_duitnow.id;

WITH ordered_billing AS (
  SELECT
    id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY DATE(COALESCE(created_at, NOW())) ORDER BY COALESCE(created_at, NOW()), id) AS seq
  FROM billing_records
  WHERE reference_code IS NULL OR BTRIM(reference_code) = ''
)
UPDATE billing_records br
SET reference_code = 'BIL-' || TO_CHAR(COALESCE(ordered_billing.created_at, NOW()), 'YYYYMMDD') || '-' || LPAD(ordered_billing.seq::TEXT, 6, '0')
FROM ordered_billing
WHERE br.id = ordered_billing.id;

SELECT setval('wallet_reference_code_seq', GREATEST((SELECT COUNT(*) FROM wallet_transactions), 1), true);
SELECT setval('duitnow_reference_code_seq', GREATEST((SELECT COUNT(*) FROM duitnow_payments), 1), true);
SELECT setval('billing_reference_code_seq', GREATEST((SELECT COUNT(*) FROM billing_records), 1), true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_reference_code ON wallet_transactions(reference_code) WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_duitnow_payments_reference_code ON duitnow_payments(reference_code) WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_records_reference_code ON billing_records(reference_code) WHERE reference_code IS NOT NULL;