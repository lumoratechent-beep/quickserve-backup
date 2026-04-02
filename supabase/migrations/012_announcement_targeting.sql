-- Add hub and restaurant targeting to announcements
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS hub TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS restaurant_id TEXT DEFAULT 'all';
