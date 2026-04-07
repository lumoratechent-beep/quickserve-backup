-- Join Team applications submitted from marketing page
CREATE TABLE IF NOT EXISTS join_team_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  desired_role TEXT NOT NULL,
  experience_summary TEXT,
  message TEXT,
  source TEXT DEFAULT 'marketing_page',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE join_team_applications ENABLE ROW LEVEL SECURITY;

-- Allow frontend app to submit and admin UI to read/update/delete
CREATE POLICY "Allow read join team applications"
  ON join_team_applications FOR SELECT
  USING (true);

CREATE POLICY "Allow insert join team applications"
  ON join_team_applications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update join team applications"
  ON join_team_applications FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete join team applications"
  ON join_team_applications FOR DELETE
  USING (true);
