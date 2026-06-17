-- Persist category grouping as a restaurant-level setting.
-- Existing restaurants keep the old behavior disabled; app defaults enable it for new restaurants.
UPDATE public.restaurants
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{features,groupMenuByCategory}',
  'false'::jsonb,
  true
)
WHERE COALESCE(settings #>> '{features,groupMenuByCategory}', '') = '';

NOTIFY pgrst, 'reload schema';
