-- Patch one feature flag without replacing the rest of restaurants.settings.
-- kitchen_enabled is authoritative for KDS installation and is mirrored in the
-- JSON settings document in the same row update for older clients.
CREATE OR REPLACE FUNCTION public.set_restaurant_feature(
  p_restaurant_id UUID,
  p_feature_name TEXT,
  p_value BOOLEAN
)
RETURNS TABLE(settings JSONB, kitchen_enabled BOOLEAN)
LANGUAGE plpgsql
AS $$
BEGIN
  IF NULLIF(BTRIM(p_feature_name), '') IS NULL THEN
    RAISE EXCEPTION 'feature name is required';
  END IF;

  RETURN QUERY
  UPDATE public.restaurants AS restaurant
  SET
    settings = jsonb_set(
      CASE
        WHEN jsonb_typeof(restaurant.settings) = 'object' THEN restaurant.settings
        ELSE '{}'::jsonb
      END,
      '{features}',
      CASE
        WHEN jsonb_typeof(restaurant.settings->'features') = 'object'
          THEN restaurant.settings->'features'
        ELSE '{}'::jsonb
      END || jsonb_build_object(p_feature_name, p_value),
      TRUE
    ),
    kitchen_enabled = CASE
      WHEN p_feature_name = 'kitchenEnabled' THEN p_value
      ELSE restaurant.kitchen_enabled
    END
  WHERE restaurant.id = p_restaurant_id
  RETURNING restaurant.settings, restaurant.kitchen_enabled;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_restaurant_feature(UUID, TEXT, BOOLEAN) TO anon, authenticated;

-- Department names are the persisted routing keys on kitchen users. Rename
-- both sides in one transaction so an active staff login cannot lose its scope.
CREATE OR REPLACE FUNCTION public.save_kds_departments(
  p_restaurant_id UUID,
  p_divisions JSONB,
  p_old_name TEXT DEFAULT NULL,
  p_new_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  kitchen_categories_type TEXT;
BEGIN
  IF jsonb_typeof(p_divisions) <> 'array' THEN
    RAISE EXCEPTION 'departments must be a JSON array';
  END IF;

  UPDATE public.restaurants
  SET kitchen_divisions = p_divisions
  WHERE id = p_restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant not found';
  END IF;

  IF NULLIF(p_old_name, '') IS NOT NULL
     AND NULLIF(p_new_name, '') IS NOT NULL
     AND p_old_name <> p_new_name THEN
    SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO kitchen_categories_type
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.users'::regclass
      AND attribute.attname = 'kitchen_categories'
      AND NOT attribute.attisdropped;

    -- Existing deployments have used both JSONB and PostgreSQL text arrays
    -- for this field. Dynamic SQL keeps this migration valid for either one.
    IF kitchen_categories_type = 'jsonb' THEN
      EXECUTE $statement$
        UPDATE public.users AS staff
        SET kitchen_categories = (
          SELECT jsonb_agg(
            CASE WHEN assignment.value #>> '{}' = $2 THEN to_jsonb($3::text) ELSE assignment.value END
            ORDER BY assignment.ordinal
          )
          FROM jsonb_array_elements(staff.kitchen_categories)
            WITH ORDINALITY AS assignment(value, ordinal)
        )
        WHERE staff.restaurant_id = $1
          AND staff.role = 'KITCHEN'
          AND jsonb_typeof(staff.kitchen_categories) = 'array'
          AND staff.kitchen_categories ? $2
      $statement$ USING p_restaurant_id, p_old_name, p_new_name;
    ELSIF kitchen_categories_type = 'json' THEN
      EXECUTE $statement$
        UPDATE public.users AS staff
        SET kitchen_categories = (
          SELECT jsonb_agg(
            CASE WHEN assignment.value #>> '{}' = $2 THEN to_jsonb($3::text) ELSE assignment.value END
            ORDER BY assignment.ordinal
          )::json
          FROM jsonb_array_elements(staff.kitchen_categories::jsonb)
            WITH ORDINALITY AS assignment(value, ordinal)
        )
        WHERE staff.restaurant_id = $1
          AND staff.role = 'KITCHEN'
          AND jsonb_typeof(staff.kitchen_categories::jsonb) = 'array'
          AND staff.kitchen_categories::jsonb ? $2
      $statement$ USING p_restaurant_id, p_old_name, p_new_name;
    ELSIF kitchen_categories_type = 'text[]' THEN
      EXECUTE $statement$
        UPDATE public.users AS staff
        SET kitchen_categories = array_replace(staff.kitchen_categories, $2::text, $3::text)
        WHERE staff.restaurant_id = $1
          AND staff.role = 'KITCHEN'
          AND $2::text = ANY(staff.kitchen_categories)
      $statement$ USING p_restaurant_id, p_old_name, p_new_name;
    ELSIF kitchen_categories_type = 'character varying[]' THEN
      EXECUTE $statement$
        UPDATE public.users AS staff
        SET kitchen_categories = array_replace(staff.kitchen_categories, $2::varchar, $3::varchar)
        WHERE staff.restaurant_id = $1
          AND staff.role = 'KITCHEN'
          AND $2::varchar = ANY(staff.kitchen_categories)
      $statement$ USING p_restaurant_id, p_old_name, p_new_name;
    ELSE
      RAISE EXCEPTION 'unsupported users.kitchen_categories type: %', kitchen_categories_type;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_kds_departments(UUID, JSONB, TEXT, TEXT) TO anon, authenticated;
