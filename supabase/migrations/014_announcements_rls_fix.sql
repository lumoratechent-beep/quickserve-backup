-- Fix RLS policies for announcements table
-- This app uses the anon key with a custom users table (not Supabase Auth),
-- so auth.role() = 'anon'. Policies must allow the anon role.

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can read active announcements" ON announcements;
DROP POLICY IF EXISTS "Authenticated users can create announcements" ON announcements;
DROP POLICY IF EXISTS "Authenticated users can update announcements" ON announcements;
DROP POLICY IF EXISTS "Authenticated users can delete announcements" ON announcements;
DROP POLICY IF EXISTS "Authenticated users can read all announcements" ON announcements;

-- Allow all operations for announcements (access control is handled at app level)
CREATE POLICY "Allow read announcements"
  ON announcements FOR SELECT
  USING (true);

CREATE POLICY "Allow insert announcements"
  ON announcements FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update announcements"
  ON announcements FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete announcements"
  ON announcements FOR DELETE
  USING (true);
