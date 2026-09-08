ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION set_user_kds_preference(
  p_user_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_preferences JSONB;
BEGIN
  IF p_key NOT IN ('ticketsPerPage', 'fontSize', 'alertSound', 'autoServe', 'selectedPrinterId') THEN
    RAISE EXCEPTION 'Unsupported KDS preference';
  END IF;

  UPDATE users
  SET preferences = jsonb_set(
    COALESCE(preferences, '{}'::jsonb),
    ARRAY['kds', p_key],
    p_value,
    true
  )
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT preferences INTO updated_preferences FROM users WHERE id = p_user_id;
  RETURN updated_preferences;
END;
$$;