-- Team members displayed on the marketing page; photos managed by admin
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  photo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read team members"
  ON team_members FOR SELECT
  USING (true);

CREATE POLICY "Allow insert team members"
  ON team_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update team members"
  ON team_members FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete team members"
  ON team_members FOR DELETE
  USING (true);

-- Seed initial team members
INSERT INTO team_members (name, role, sort_order) VALUES
  ('CHAELS STANLLY', 'Software Developer Team Lead', 0),
  ('Wan Mohamed Fawwaz Bin Wan Farid', 'Product Test Partner', 1),
  ('Natasha Devona', 'System Support', 2);
