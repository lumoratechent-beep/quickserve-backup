ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS collaboration_header TEXT,
  ADD COLUMN IF NOT EXISTS collaboration_description TEXT,
  ADD COLUMN IF NOT EXISTS trait_one TEXT,
  ADD COLUMN IF NOT EXISTS trait_two TEXT,
  ADD COLUMN IF NOT EXISTS trait_three TEXT;

UPDATE public.team_members
SET
  collaboration_header = COALESCE(collaboration_header, 'Collaboration Style'),
  collaboration_description = COALESCE(collaboration_description, 'Our team combines technical execution, responsive support, and practical product thinking to build reliable experiences for growing businesses.'),
  trait_one = COALESCE(trait_one, 'Customer Focused'),
  trait_two = COALESCE(trait_two, 'Fast Iteration'),
  trait_three = COALESCE(trait_three, 'Operational Mindset');

ALTER TABLE public.team_members
  ALTER COLUMN collaboration_header SET DEFAULT 'Collaboration Style',
  ALTER COLUMN collaboration_description SET DEFAULT 'Our team combines technical execution, responsive support, and practical product thinking to build reliable experiences for growing businesses.',
  ALTER COLUMN trait_one SET DEFAULT 'Customer Focused',
  ALTER COLUMN trait_two SET DEFAULT 'Fast Iteration',
  ALTER COLUMN trait_three SET DEFAULT 'Operational Mindset';