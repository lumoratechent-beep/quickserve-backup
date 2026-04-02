-- Add category column to feature_images for add-on feature images
ALTER TABLE feature_images ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'partner';
-- 'partner' = existing partner carousel logos
-- other values match add-on feature IDs (e.g. 'qr', 'kitchen', 'table', etc.)
