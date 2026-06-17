-- Admin-controlled subscription access lock.
-- Keeps vendor login available while restricting POS access until renewal.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS access_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_lock_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_access_lock_at
  ON public.subscriptions(access_lock_at)
  WHERE access_lock_at IS NOT NULL;
