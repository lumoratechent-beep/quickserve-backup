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
  SET preferences = CASE
    WHEN p_value IS NULL THEN COALESCE(preferences, '{}'::jsonb) #- ARRAY['kds', p_key]
    ELSE jsonb_set(COALESCE(preferences, '{}'::jsonb), ARRAY['kds', p_key], p_value, true)
  END
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT preferences INTO updated_preferences FROM users WHERE id = p_user_id;
  RETURN updated_preferences;
END;
$$;

UPDATE users
SET preferences = preferences #- ARRAY['kds', 'ticketsPerPage']
WHERE preferences->'kds'->>'ticketsPerPage' = '4';

UPDATE users
SET preferences = preferences #- ARRAY['kds', 'fontSize']
WHERE preferences->'kds'->>'fontSize' = 'LARGE';

UPDATE users
SET preferences = preferences #- ARRAY['kds', 'alertSound']
WHERE preferences->'kds'->>'alertSound' = 'SIREN';

UPDATE users
SET preferences = preferences #- ARRAY['kds', 'autoServe']
WHERE preferences->'kds'->>'autoServe' = 'false';

UPDATE users
SET preferences = preferences #- ARRAY['kds', 'selectedPrinterId']
WHERE preferences->'kds'->>'selectedPrinterId' = '';