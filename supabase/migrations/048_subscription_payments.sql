-- Unified subscription payment status index.
--
-- Keep this table lean:
-- - subscriptions owns the current plan/access state.
-- - billing_records owns accepted income amounts/fees/plan snapshots.
-- - duitnow_payments owns DuitNow proof, review notes, requested plan, and amount.
-- - wallet_transactions owns wallet movement amount/status.
--
-- This table only answers: "what happened to this subscription payment attempt,
-- through which provider, and which source/final records does it point to?"

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'duitnow', 'wallet')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'approved', 'rejected', 'cancelled')),
  provider_reference TEXT NOT NULL,
  billing_record_id UUID REFERENCES public.billing_records(id) ON DELETE SET NULL,
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  duitnow_payment_id UUID REFERENCES public.duitnow_payments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_payments_provider_reference_unique UNIQUE (provider, provider_reference)
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_restaurant
  ON public.subscription_payments(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_provider_status
  ON public.subscription_payments(provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_billing_record
  ON public.subscription_payments(billing_record_id)
  WHERE billing_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_wallet_transaction
  ON public.subscription_payments(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_duitnow_payment
  ON public.subscription_payments(duitnow_payment_id)
  WHERE duitnow_payment_id IS NOT NULL;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read subscription payments"
  ON public.subscription_payments;

CREATE POLICY "Allow read subscription payments"
  ON public.subscription_payments
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert subscription payments"
  ON public.subscription_payments;

CREATE POLICY "Allow insert subscription payments"
  ON public.subscription_payments
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update subscription payments"
  ON public.subscription_payments;

CREATE POLICY "Allow update subscription payments"
  ON public.subscription_payments
  FOR UPDATE
  USING (true);

-- Backfill existing DuitNow review rows without copying plan/amount/review data.
INSERT INTO public.subscription_payments (
  restaurant_id,
  provider,
  status,
  provider_reference,
  duitnow_payment_id,
  created_at,
  updated_at
)
SELECT
  dp.restaurant_id,
  'duitnow',
  dp.status,
  COALESCE(dp.reference_code, 'duitnow-' || dp.id::text),
  dp.id,
  COALESCE(dp.created_at, NOW()),
  COALESCE(dp.updated_at, dp.reviewed_at, dp.created_at, NOW())
FROM public.duitnow_payments dp
ON CONFLICT (provider, provider_reference) DO UPDATE
SET status = EXCLUDED.status,
    duitnow_payment_id = EXCLUDED.duitnow_payment_id,
    updated_at = EXCLUDED.updated_at;

-- Link approved DuitNow status rows to their final income rows when present.
UPDATE public.subscription_payments sp
SET billing_record_id = br.id,
    updated_at = NOW()
FROM public.billing_records br
WHERE sp.provider = 'duitnow'
  AND sp.duitnow_payment_id IS NOT NULL
  AND br.duitnow_payment_id = sp.duitnow_payment_id
  AND sp.billing_record_id IS NULL;

-- Backfill existing Stripe and wallet accepted-income rows as succeeded statuses.
INSERT INTO public.subscription_payments (
  restaurant_id,
  provider,
  status,
  provider_reference,
  billing_record_id,
  created_at,
  updated_at
)
SELECT
  br.restaurant_id,
  CASE
    WHEN br.created_by = 'wallet' OR br.type = 'wallet' THEN 'wallet'
    ELSE 'stripe'
  END,
  'succeeded',
  COALESCE(
    br.reference_code,
    CASE
      WHEN br.created_by = 'wallet' OR br.type = 'wallet' THEN 'wallet-billing-' || br.id::text
      ELSE 'stripe-billing-' || br.id::text
    END
  ),
  br.id,
  br.created_at,
  br.created_at
FROM public.billing_records br
WHERE br.duitnow_payment_id IS NULL
  AND (br.created_by IN ('stripe', 'wallet') OR br.type IN ('stripe', 'wallet'))
ON CONFLICT (provider, provider_reference) DO UPDATE
SET status = EXCLUDED.status,
    billing_record_id = EXCLUDED.billing_record_id,
    updated_at = EXCLUDED.updated_at;

NOTIFY pgrst, 'reload schema';
