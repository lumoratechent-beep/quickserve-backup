-- Fix RLS policies for announcements table
-- Allow authenticated users to insert, update, and delete announcements (admin operations)

-- Allow authenticated users to insert announcements
CREATE POLICY "Authenticated users can create announcements"
  ON announcements FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update announcements
CREATE POLICY "Authenticated users can update announcements"
  ON announcements FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to delete announcements
CREATE POLICY "Authenticated users can delete announcements"
  ON announcements FOR DELETE
  USING (auth.role() = 'authenticated');

-- Also allow reading inactive announcements for admin management
DROP POLICY IF EXISTS "Anyone can read active announcements" ON announcements;
CREATE POLICY "Authenticated users can read all announcements"
  ON announcements FOR SELECT
  USING (auth.role() = 'authenticated');
