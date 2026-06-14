-- Preserve subscription expiry changes for renewals and admin reporting.
CREATE TABLE IF NOT EXISTS public.subscription_expiry_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  old_expiry TIMESTAMPTZ,
  new_expiry TIMESTAMPTZ,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('initial', 'renewal', 'manual_adjustment', 'expiry_correction', 'expiry_removed')
  ),
  change_source TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_expiry_history_restaurant
  ON public.subscription_expiry_history(restaurant_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_expiry_history_changed_at
  ON public.subscription_expiry_history(changed_at DESC);

ALTER TABLE public.subscription_expiry_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read subscription expiry history"
  ON public.subscription_expiry_history;

CREATE POLICY "Allow read subscription expiry history"
  ON public.subscription_expiry_history
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.log_subscription_expiry_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_effective_expiry TIMESTAMPTZ;
  new_effective_expiry TIMESTAMPTZ;
  requested_source TEXT;
  requested_note TEXT;
  resolved_event_type TEXT;
BEGIN
  old_effective_expiry := CASE
    WHEN TG_OP = 'INSERT' THEN NULL
    ELSE COALESCE(OLD.current_period_end, OLD.trial_end)
  END;
  new_effective_expiry := COALESCE(NEW.current_period_end, NEW.trial_end);

  IF TG_OP = 'UPDATE' AND old_effective_expiry IS NOT DISTINCT FROM new_effective_expiry THEN
    RETURN NEW;
  END IF;

  requested_source := NULLIF(current_setting('quickserve.subscription_change_source', true), '');
  requested_note := NULLIF(current_setting('quickserve.subscription_change_note', true), '');

  resolved_event_type := CASE
    WHEN requested_source = 'admin' THEN 'manual_adjustment'
    WHEN old_effective_expiry IS NULL AND new_effective_expiry IS NOT NULL THEN 'initial'
    WHEN new_effective_expiry IS NULL THEN 'expiry_removed'
    WHEN new_effective_expiry > old_effective_expiry THEN 'renewal'
    ELSE 'expiry_correction'
  END;

  INSERT INTO public.subscription_expiry_history (
    subscription_id,
    restaurant_id,
    old_expiry,
    new_expiry,
    event_type,
    change_source,
    note
  )
  VALUES (
    NEW.id,
    NEW.restaurant_id,
    old_effective_expiry,
    new_effective_expiry,
    resolved_event_type,
    COALESCE(requested_source, 'system'),
    requested_note
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_subscription_expiry_change
  ON public.subscriptions;

CREATE TRIGGER trg_log_subscription_expiry_change
AFTER INSERT OR UPDATE OF current_period_end, trial_end
ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.log_subscription_expiry_change();

-- Existing dates cannot be reconstructed, so preserve each subscription's current
-- expiry as the starting point for future history.
INSERT INTO public.subscription_expiry_history (
  subscription_id,
  restaurant_id,
  old_expiry,
  new_expiry,
  event_type,
  change_source,
  note,
  changed_at
)
SELECT
  s.id,
  s.restaurant_id,
  NULL,
  COALESCE(s.current_period_end, s.trial_end),
  'initial',
  'migration',
  'Opening expiry snapshot',
  COALESCE(s.updated_at, s.created_at, NOW())
FROM public.subscriptions s
WHERE COALESCE(s.current_period_end, s.trial_end) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscription_expiry_history h
    WHERE h.subscription_id = s.id
  );

CREATE OR REPLACE FUNCTION public.admin_set_subscription_expiry(
  p_restaurant_id UUID,
  p_new_expiry TIMESTAMPTZ,
  p_note TEXT DEFAULT NULL
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_subscription public.subscriptions;
BEGIN
  IF p_new_expiry IS NULL THEN
    RAISE EXCEPTION 'New expiry is required';
  END IF;

  PERFORM set_config('quickserve.subscription_change_source', 'admin', true);
  PERFORM set_config(
    'quickserve.subscription_change_note',
    LEFT(COALESCE(p_note, ''), 500),
    true
  );

  UPDATE public.subscriptions
  SET
    current_period_end = CASE
      WHEN current_period_end IS NOT NULL THEN p_new_expiry
      ELSE current_period_end
    END,
    trial_end = CASE
      WHEN current_period_end IS NULL THEN p_new_expiry
      ELSE trial_end
    END,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id
  RETURNING * INTO updated_subscription;

  IF updated_subscription.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  RETURN updated_subscription;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_subscription_expiry(UUID, TIMESTAMPTZ, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
