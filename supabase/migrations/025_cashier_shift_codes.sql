-- 025: Add restaurant-scoped shift codes for cashier shifts

ALTER TABLE cashier_shifts
ADD COLUMN IF NOT EXISTS shift_code TEXT;

CREATE OR REPLACE FUNCTION public.get_cashier_shift_prefix(target_restaurant_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  raw_code TEXT;
  cleaned_code TEXT;
BEGIN
  SELECT COALESCE(r.settings ->> 'orderCode', r.name, 'QS')
  INTO raw_code
  FROM restaurants r
  WHERE r.id = target_restaurant_id
  LIMIT 1;

  cleaned_code := UPPER(REGEXP_REPLACE(COALESCE(raw_code, 'QS'), '[^A-Z0-9]', '', 'g'));
  cleaned_code := LEFT(cleaned_code, 3);

  IF cleaned_code = '' THEN
    cleaned_code := 'QS';
  END IF;

  RETURN RPAD(cleaned_code, 3, 'X');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_cashier_shift_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_sequence INTEGER;
  prefix TEXT;
BEGIN
  IF NEW.shift_code IS NOT NULL AND BTRIM(NEW.shift_code) <> '' THEN
    RETURN NEW;
  END IF;

  prefix := public.get_cashier_shift_prefix(NEW.restaurant_id);

  SELECT COALESCE(MAX((REGEXP_MATCH(shift_code, '-S([0-9]+)$'))[1]::INTEGER), 0) + 1
  INTO next_sequence
  FROM cashier_shifts
  WHERE restaurant_id = NEW.restaurant_id;

  NEW.shift_code := prefix || '-S' || LPAD(next_sequence::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_cashier_shift_code ON cashier_shifts;

CREATE TRIGGER trg_assign_cashier_shift_code
BEFORE INSERT ON cashier_shifts
FOR EACH ROW
EXECUTE FUNCTION public.assign_cashier_shift_code();

WITH ranked_shifts AS (
  SELECT
    cs.id,
    public.get_cashier_shift_prefix(cs.restaurant_id) AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY cs.restaurant_id
      ORDER BY cs.opened_at ASC, cs.created_at ASC, cs.id ASC
    ) AS sequence_number
  FROM cashier_shifts cs
)
UPDATE cashier_shifts cs
SET shift_code = ranked_shifts.prefix || '-S' || LPAD(ranked_shifts.sequence_number::TEXT, 4, '0')
FROM ranked_shifts
WHERE cs.id = ranked_shifts.id
  AND (cs.shift_code IS NULL OR BTRIM(cs.shift_code) = '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_shifts_restaurant_shift_code
ON cashier_shifts(restaurant_id, shift_code);