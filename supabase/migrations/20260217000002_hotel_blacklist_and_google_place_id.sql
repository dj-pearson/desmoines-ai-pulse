-- Hotel Blacklist Table
-- Stores places that should be excluded from hotel search results
-- Mirrors the restaurant_blacklist pattern

CREATE TABLE IF NOT EXISTS hotel_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification (at least one should be filled)
  google_place_id TEXT,
  hotel_name TEXT NOT NULL,

  -- Reason for blacklisting
  reason TEXT NOT NULL,
  reason_category TEXT NOT NULL CHECK (reason_category IN (
    'not_hotel',           -- Not actually a hotel (office building, apartments, etc.)
    'duplicate',           -- Duplicate entry
    'out_of_scope',        -- Not in the Des Moines area
    'closed_permanent',    -- Permanently closed
    'spam',                -- Spam/fake listing
    'already_added',       -- Already added to our database
    'low_quality',         -- Too low quality / not suitable
    'other'                -- Other reason (specify in reason field)
  )),

  -- Metadata
  formatted_address TEXT,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  blocked_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ, -- NULL for permanent blocks

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT hotel_blacklist_has_identifier CHECK (
    google_place_id IS NOT NULL OR hotel_name IS NOT NULL
  )
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_hotel_blacklist_google_place_id
  ON hotel_blacklist(google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_blacklist_name_lower
  ON hotel_blacklist(LOWER(hotel_name));

CREATE INDEX IF NOT EXISTS idx_hotel_blacklist_expires
  ON hotel_blacklist(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_blacklist_category
  ON hotel_blacklist(reason_category);

-- Trigger for updated_at (reuse existing function)
DROP TRIGGER IF EXISTS hotel_blacklist_updated_at ON hotel_blacklist;
CREATE TRIGGER hotel_blacklist_updated_at
  BEFORE UPDATE ON hotel_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE hotel_blacklist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read blacklist (needed for search filtering)
CREATE POLICY "Public read access for hotel_blacklist"
  ON hotel_blacklist
  FOR SELECT
  USING (true);

-- Authenticated users can manage (admin enforced at app level)
CREATE POLICY "Authenticated users can insert hotel_blacklist"
  ON hotel_blacklist
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update hotel_blacklist"
  ON hotel_blacklist
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete hotel_blacklist"
  ON hotel_blacklist
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- Also add google_place_id to hotels table for dedup
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS google_place_id TEXT;
CREATE INDEX IF NOT EXISTS idx_hotels_google_place_id ON public.hotels(google_place_id)
  WHERE google_place_id IS NOT NULL;

COMMENT ON TABLE hotel_blacklist IS
  'Stores places that should be excluded from hotel discovery search results';
