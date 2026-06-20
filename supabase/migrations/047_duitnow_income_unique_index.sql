-- Make DuitNow income records addressable by ON CONFLICT (duitnow_payment_id).
-- A normal unique index still allows multiple NULL values in Postgres, so it keeps
-- non-DuitNow billing records unrestricted while supporting idempotent payment saves.
DROP INDEX IF EXISTS public.idx_billing_records_duitnow_payment;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_records_duitnow_payment
  ON public.billing_records(duitnow_payment_id);

NOTIFY pgrst, 'reload schema';
