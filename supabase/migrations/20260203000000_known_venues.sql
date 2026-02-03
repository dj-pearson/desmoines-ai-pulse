-- Known Venues table for auto-populating event data
-- This reduces AI token usage and ensures consistent venue information

CREATE TABLE IF NOT EXISTS known_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary venue name (canonical name)
  name TEXT NOT NULL,

  -- Aliases for matching (e.g., "Vibrant", "VMH" for "Vibrant Music Hall")
  aliases TEXT[] DEFAULT '{}',

  -- Address information
  address TEXT,
  city TEXT DEFAULT 'Des Moines',
  state TEXT DEFAULT 'IA',
  zip TEXT,

  -- Coordinates for maps
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Contact information
  phone TEXT,
  email TEXT,
  website TEXT,

  -- Venue details
  venue_type TEXT, -- 'music_hall', 'arena', 'theater', 'bar', 'restaurant', 'park', 'convention_center', etc.
  capacity INTEGER,
  description TEXT,

  -- SEO fields (can be used to enhance events at this venue)
  seo_keywords TEXT[],

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  -- Ensure unique canonical names
  CONSTRAINT unique_venue_name UNIQUE (name)
);

-- Create index for fast alias searching
CREATE INDEX IF NOT EXISTS idx_known_venues_aliases ON known_venues USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_known_venues_name_lower ON known_venues (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_known_venues_city ON known_venues (city);
CREATE INDEX IF NOT EXISTS idx_known_venues_active ON known_venues (is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE known_venues ENABLE ROW LEVEL SECURITY;

-- Public read access for venue matching
DROP POLICY IF EXISTS "Public can view active venues" ON known_venues;
CREATE POLICY "Public can view active venues"
  ON known_venues FOR SELECT
  USING (is_active = true);

-- Admin-only write access (uses existing is_admin() function)
DROP POLICY IF EXISTS "Admins can manage venues" ON known_venues;
CREATE POLICY "Admins can manage venues"
  ON known_venues FOR ALL
  USING (is_admin());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_known_venues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_known_venues_updated_at ON known_venues;
CREATE TRIGGER trigger_known_venues_updated_at
  BEFORE UPDATE ON known_venues
  FOR EACH ROW
  EXECUTE FUNCTION update_known_venues_updated_at();

-- Function to find matching venue by name or alias
CREATE OR REPLACE FUNCTION find_matching_venue(venue_text TEXT)
RETURNS UUID AS $$
DECLARE
  venue_id UUID;
  search_text TEXT;
BEGIN
  -- Normalize the search text
  search_text := LOWER(TRIM(venue_text));

  -- First try exact match on canonical name
  SELECT id INTO venue_id
  FROM known_venues
  WHERE LOWER(name) = search_text
    AND is_active = true
  LIMIT 1;

  IF venue_id IS NOT NULL THEN
    RETURN venue_id;
  END IF;

  -- Then try matching aliases
  SELECT id INTO venue_id
  FROM known_venues
  WHERE is_active = true
    AND EXISTS (
      SELECT 1 FROM unnest(aliases) AS alias
      WHERE LOWER(alias) = search_text
    )
  LIMIT 1;

  IF venue_id IS NOT NULL THEN
    RETURN venue_id;
  END IF;

  -- Try partial match on name (contains)
  SELECT id INTO venue_id
  FROM known_venues
  WHERE is_active = true
    AND (
      LOWER(name) LIKE '%' || search_text || '%'
      OR search_text LIKE '%' || LOWER(name) || '%'
    )
  ORDER BY
    CASE
      WHEN LOWER(name) = search_text THEN 0
      WHEN LOWER(name) LIKE search_text || '%' THEN 1
      WHEN LOWER(name) LIKE '%' || search_text THEN 2
      ELSE 3
    END
  LIMIT 1;

  RETURN venue_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get venue details for auto-population
CREATE OR REPLACE FUNCTION get_venue_details(venue_id UUID)
RETURNS TABLE (
  venue_name TEXT,
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  venue_latitude DOUBLE PRECISION,
  venue_longitude DOUBLE PRECISION,
  venue_phone TEXT,
  venue_email TEXT,
  venue_website TEXT,
  full_location TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kv.name,
    kv.address,
    kv.city,
    kv.state,
    kv.zip,
    kv.latitude,
    kv.longitude,
    kv.phone,
    kv.email,
    kv.website,
    CASE
      WHEN kv.address IS NOT NULL THEN
        kv.address || ', ' || COALESCE(kv.city, '') || ', ' || COALESCE(kv.state, '') || ' ' || COALESCE(kv.zip, '')
      ELSE
        COALESCE(kv.city, '') || ', ' || COALESCE(kv.state, '')
    END AS full_location
  FROM known_venues kv
  WHERE kv.id = venue_id
    AND kv.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE;

-- Insert some initial Des Moines area venues
INSERT INTO known_venues (name, aliases, address, city, state, zip, latitude, longitude, phone, email, website, venue_type, capacity) VALUES
  ('Vibrant Music Hall', ARRAY['Vibrant', 'VMH', 'Vibrant Hall'], '2938 Grand Prairie Pkwy', 'Waukee', 'IA', '50263', 41.5917, -93.8869, '515.895.4980', 'info@vibrantmusichall.com', 'https://www.vibrantmusichall.com', 'music_hall', 2500),
  ('Wells Fargo Arena', ARRAY['Wells Fargo', 'The Well', 'WF Arena'], '730 3rd St', 'Des Moines', 'IA', '50309', 41.5908, -93.6208, '515.564.8000', NULL, 'https://www.iowaeventscenter.com', 'arena', 16980),
  ('Hoyt Sherman Place', ARRAY['Hoyt Sherman', 'HSP'], '1501 Woodland Ave', 'Des Moines', 'IA', '50309', 41.5847, -93.6433, '515.244.0507', 'info@hoytsherman.org', 'https://www.hoytsherman.org', 'theater', 1200),
  ('Civic Center of Greater Des Moines', ARRAY['Civic Center', 'Des Moines Civic Center', 'DMCC'], '221 Walnut St', 'Des Moines', 'IA', '50309', 41.5869, -93.6285, '515.246.2300', NULL, 'https://www.desmoinesperformingarts.org', 'theater', 2744),
  ('Val Air Ballroom', ARRAY['Val Air', 'ValAir'], '301 Ashworth Rd', 'West Des Moines', 'IA', '50265', 41.5722, -93.7494, '515.223.6152', NULL, 'https://www.valairballroom.com', 'music_hall', 2000),
  ('Wooly''s', ARRAY['Woolys', 'Wooly''s Des Moines'], '504 E Locust St', 'Des Moines', 'IA', '50309', 41.5908, -93.6097, '515.244.0550', NULL, 'https://www.woolysdm.com', 'music_hall', 650),
  ('Iowa State Fairgrounds', ARRAY['State Fair', 'Iowa State Fair', 'Fairgrounds'], '3000 E Grand Ave', 'Des Moines', 'IA', '50317', 41.5928, -93.5658, '515.262.3111', 'info@iowastatefair.org', 'https://www.iowastatefair.org', 'fairgrounds', NULL),
  ('Principal Park', ARRAY['Principal', 'Iowa Cubs Stadium', 'Cubs Stadium'], '1 Line Dr', 'Des Moines', 'IA', '50309', 41.5811, -93.6233, '515.243.6111', NULL, 'https://www.milb.com/iowa', 'stadium', 11500),
  ('Lauridsen Amphitheater', ARRAY['Lauridsen', 'Water Works Amphitheater', 'Waterworks'], '2251 George Flagg Pkwy', 'Des Moines', 'IA', '50321', 41.5589, -93.6456, NULL, NULL, 'https://www.dsmwaterworks.com', 'amphitheater', 5000),
  ('Horizon Events Center', ARRAY['Horizon', 'Horizon Center', 'HEC'], '2100 NW 100th St', 'Clive', 'IA', '50325', 41.6189, -93.7936, '515.727.8600', NULL, 'https://www.horizoneventscenter.com', 'convention_center', 10000),
  ('Downtown Farmers'' Market', ARRAY['Farmers Market', 'DSM Farmers Market', 'Des Moines Farmers Market'], 'Court Avenue District', 'Des Moines', 'IA', '50309', 41.5869, -93.6194, NULL, NULL, 'https://www.desmoinesfarmersmarket.com', 'market', NULL),
  ('Pappajohn Sculpture Park', ARRAY['Pappajohn', 'Sculpture Park', 'John and Mary Pappajohn Sculpture Park'], '1330 Grand Ave', 'Des Moines', 'IA', '50309', 41.5867, -93.6350, '515.277.4405', NULL, 'https://www.desmoinesartcenter.org', 'park', NULL),
  ('Science Center of Iowa', ARRAY['Science Center', 'SCI', 'Iowa Science Center'], '401 W Martin Luther King Jr Pkwy', 'Des Moines', 'IA', '50309', 41.5856, -93.6308, '515.274.6868', NULL, 'https://www.sciowa.org', 'museum', NULL),
  ('Blank Park Zoo', ARRAY['Blank Park', 'Des Moines Zoo', 'The Zoo'], '7401 SW 9th St', 'Des Moines', 'IA', '50315', 41.5378, -93.6297, '515.285.4722', NULL, 'https://www.blankparkzoo.com', 'zoo', NULL),
  ('Greater Des Moines Botanical Garden', ARRAY['Botanical Garden', 'Botanical Gardens', 'DSM Botanical Garden'], '909 Robert D Ray Dr', 'Des Moines', 'IA', '50309', 41.5917, -93.6156, '515.323.6290', NULL, 'https://www.dmbotanicalgarden.com', 'garden', NULL)
ON CONFLICT (name) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE known_venues IS 'Known venues for auto-populating event location data. Reduces AI token usage and ensures consistent venue information.';
COMMENT ON COLUMN known_venues.aliases IS 'Array of alternative names for venue matching (case-insensitive)';
COMMENT ON FUNCTION find_matching_venue IS 'Finds a venue by exact name, alias, or partial match. Returns venue UUID or NULL.';
