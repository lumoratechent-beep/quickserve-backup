-- Record whether a DuitNow plan payment renews the current plan or upgrades it.
-- The requested plan remains pending in duitnow_payments until admin approval.
ALTER TABLE public.duitnow_payments
  ADD COLUMN IF NOT EXISTS change_type TEXT NOT NULL DEFAULT 'renew'
  CHECK (change_type IN ('renew', 'upgrade'));

CREATE INDEX IF NOT EXISTS idx_duitnow_payments_pending_change_type
  ON public.duitnow_payments(status, change_type)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
