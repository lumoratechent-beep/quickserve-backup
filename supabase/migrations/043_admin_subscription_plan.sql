-- Apply admin plan changes atomically with the restaurant's kitchen access.
CREATE OR REPLACE FUNCTION public.admin_set_subscription_plan(
  p_restaurant_id UUID,
  p_plan_id TEXT
)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_subscription public.subscriptions;
BEGIN
  IF p_plan_id NOT IN ('basic', 'pro', 'pro_plus') THEN
    RAISE EXCEPTION 'Invalid subscription plan';
  END IF;

  UPDATE public.subscriptions
  SET
    plan_id = p_plan_id,
    pending_plan_id = NULL,
    pending_billing_interval = NULL,
    pending_change_effective_at = NULL,
    updated_at = NOW()
  WHERE restaurant_id = p_restaurant_id
  RETURNING * INTO updated_subscription;

  IF updated_subscription.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  UPDATE public.restaurants
  SET kitchen_enabled = (p_plan_id = 'pro_plus')
  WHERE id = p_restaurant_id;

  RETURN updated_subscription;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_subscription_plan(UUID, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
