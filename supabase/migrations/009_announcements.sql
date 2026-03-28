-- Announcements table for admin-to-vendor communications
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general', -- 'general', 'billing', 'update', 'maintenance'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Track which vendors have read which announcements
CREATE TABLE IF NOT EXISTS announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, restaurant_id)
);

-- RLS policies
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

-- Anyone can read announcements
CREATE POLICY "Anyone can read active announcements"
  ON announcements FOR SELECT
  USING (is_active = true);

-- Anyone can read/insert their own read status
CREATE POLICY "Anyone can read announcement_reads"
  ON announcement_reads FOR SELECT
  USING (true);

CREATE POLICY "Anyone can mark announcements as read"
  ON announcement_reads FOR INSERT
  WITH CHECK (true);
