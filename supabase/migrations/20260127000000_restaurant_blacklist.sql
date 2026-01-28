-- Restaurant Blacklist Table
-- Stores places that should be excluded from search results
-- Use cases:
-- 1. Not actually a restaurant (grocery stores, gas stations, etc.)
-- 2. Already added to database (alternative exclusion)
-- 3. Duplicate/spam entries
-- 4. Out of scope (not in Des Moines area)

CREATE TABLE IF NOT EXISTS restaurant_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification (at least one should be filled)
  google_place_id TEXT,
  restaurant_name TEXT NOT NULL,

  -- Reason for blacklisting
  reason TEXT NOT NULL,
  reason_category TEXT NOT NULL CHECK (reason_category IN (
    'not_restaurant',    -- Not actually a restaurant (grocery, gas station, etc.)
    'chain',             -- Fast food chain (can extend the hardcoded list)
    'duplicate',         -- Duplicate entry
    'out_of_scope',      -- Not in the Des Moines area
    'closed_permanent',  -- Permanently closed
    'spam',              -- Spam/fake listing
    'added_to_db',       -- Already added to our database
    'other'              -- Other reason (specify in reason field)
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
  CONSTRAINT blacklist_has_identifier CHECK (
    google_place_id IS NOT NULL OR restaurant_name IS NOT NULL
  )
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_blacklist_google_place_id
  ON restaurant_blacklist(google_place_id)
  WHERE google_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blacklist_name_lower
  ON restaurant_blacklist(LOWER(restaurant_name));

CREATE INDEX IF NOT EXISTS idx_blacklist_expires
  ON restaurant_blacklist(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blacklist_category
  ON restaurant_blacklist(reason_category);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_blacklist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blacklist_updated_at ON restaurant_blacklist;
CREATE TRIGGER blacklist_updated_at
  BEFORE UPDATE ON restaurant_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION update_blacklist_updated_at();

-- RLS Policies
ALTER TABLE restaurant_blacklist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read blacklist (needed for search filtering)
CREATE POLICY "Public read access for blacklist"
  ON restaurant_blacklist
  FOR SELECT
  USING (true);

-- Only admins can insert (uses existing is_admin() function)
CREATE POLICY "Admins can insert blacklist"
  ON restaurant_blacklist
  FOR INSERT
  WITH CHECK (is_admin());

-- Only admins can update
CREATE POLICY "Admins can update blacklist"
  ON restaurant_blacklist
  FOR UPDATE
  USING (is_admin());

-- Only admins can delete
CREATE POLICY "Admins can delete blacklist"
  ON restaurant_blacklist
  FOR DELETE
  USING (is_admin());

-- Add comment to table
COMMENT ON TABLE restaurant_blacklist IS
  'Stores places that should be excluded from restaurant search results';
