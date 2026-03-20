-- Feature images for the marketing page partner carousel
CREATE TABLE IF NOT EXISTS feature_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  crop_shape text NOT NULL DEFAULT 'square',
  display_width integer NOT NULL DEFAULT 120,
  display_height integer NOT NULL DEFAULT 60,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Allow public read for the marketing page
ALTER TABLE feature_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature_images"
  ON feature_images FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage feature_images"
  ON feature_images FOR ALL
  USING (auth.role() = 'authenticated');
