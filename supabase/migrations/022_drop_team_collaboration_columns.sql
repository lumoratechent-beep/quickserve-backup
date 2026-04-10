ALTER TABLE public.team_members
  DROP COLUMN IF EXISTS collaboration_header,
  DROP COLUMN IF EXISTS collaboration_description,
  DROP COLUMN IF EXISTS trait_one,
  DROP COLUMN IF EXISTS trait_two,
  DROP COLUMN IF EXISTS trait_three;
