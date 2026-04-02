-- Add add_on_items column to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS add_on_items jsonb DEFAULT '[]'::jsonb;
