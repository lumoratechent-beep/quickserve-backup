-- Track the original subscription state while a DuitNow renewal is pending.
-- This supports a 24-hour provisional access window and exact rollback on rejection.
ALTER TABLE public.duitnow_payments
  ADD COLUMN IF NOT EXISTS provisional_access_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_status TEXT,
  ADD COLUMN IF NOT EXISTS original_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS original_billing_interval TEXT,
  ADD COLUMN IF NOT EXISTS original_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_trial_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_duitnow_payments_provisional_access
  ON public.duitnow_payments(provisional_access_until)
  WHERE status = 'pending';

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS duitnow_payment_id UUID REFERENCES public.duitnow_payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_records_duitnow_payment
  ON public.billing_records(duitnow_payment_id)
  WHERE duitnow_payment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
