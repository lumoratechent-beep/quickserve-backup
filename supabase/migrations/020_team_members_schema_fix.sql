-- Ensure team_members exists in environments where migration 019 was not applied
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Keep schema aligned if table exists but is missing fields
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

ALTER TABLE public.team_members
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN sort_order SET DEFAULT 0;

UPDATE public.team_members
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.team_members
  ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'Allow read team members'
  ) THEN
    CREATE POLICY "Allow read team members"
      ON public.team_members FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'Allow insert team members'
  ) THEN
    CREATE POLICY "Allow insert team members"
      ON public.team_members FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'Allow update team members'
  ) THEN
    CREATE POLICY "Allow update team members"
      ON public.team_members FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_members'
      AND policyname = 'Allow delete team members'
  ) THEN
    CREATE POLICY "Allow delete team members"
      ON public.team_members FOR DELETE
      USING (true);
  END IF;
END $$;
