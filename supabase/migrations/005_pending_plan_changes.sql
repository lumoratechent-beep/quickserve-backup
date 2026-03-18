-- Store scheduled downgrades without changing current active plan immediately.
ALTER TABLE public.subscriptions
  ADD COLUMN pending_plan_id text CHECK (pending_plan_id = ANY (ARRAY['basic'::text, 'pro'::text, 'pro_plus'::text])),
  ADD COLUMN pending_billing_interval text CHECK (pending_billing_interval = ANY (ARRAY['monthly'::text, 'annual'::text])),
  ADD COLUMN pending_change_effective_at timestamp with time zone;
