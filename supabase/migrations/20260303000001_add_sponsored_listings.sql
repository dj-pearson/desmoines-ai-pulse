-- Add sponsored listing support to events and restaurants
-- Adds is_sponsored flag, sponsored_until timestamp, creates sponsored_listing_links
-- junction table, and extends the placement_type enum.

-- 1. Extend the placement_type enum with 'sponsored_listing'
ALTER TYPE placement_type ADD VALUE IF NOT EXISTS 'sponsored_listing';

-- 2. Add sponsorship columns to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsored_until TIMESTAMPTZ;

-- 3. Add sponsorship columns to restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsored_until TIMESTAMPTZ;

-- 4. Create sponsored_listing_links junction table
CREATE TABLE IF NOT EXISTS sponsored_listing_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('event', 'restaurant')),
  listing_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Index for fast lookups by listing
CREATE INDEX IF NOT EXISTS idx_sponsored_listing_links_listing
  ON sponsored_listing_links (listing_type, listing_id);

-- 6. Index for fast lookups by campaign
CREATE INDEX IF NOT EXISTS idx_sponsored_listing_links_campaign
  ON sponsored_listing_links (campaign_id);

-- 7. Enable RLS
ALTER TABLE sponsored_listing_links ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies
-- Authenticated users can read their own campaign's links
DO $$ BEGIN
  CREATE POLICY "Users can read own sponsored links" ON sponsored_listing_links FOR SELECT
    USING (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = sponsored_listing_links.campaign_id AND campaigns.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can read all
DO $$ BEGIN
  CREATE POLICY "Admins can read all sponsored links" ON sponsored_listing_links FOR SELECT
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authenticated users can insert links for their own campaigns
DO $$ BEGIN
  CREATE POLICY "Users can insert own sponsored links" ON sponsored_listing_links FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_id AND campaigns.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can do anything
DO $$ BEGIN
  CREATE POLICY "Admins full access to sponsored links" ON sponsored_listing_links FOR ALL
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Indexes on events and restaurants for sponsored queries
CREATE INDEX IF NOT EXISTS idx_events_is_sponsored
  ON events (is_sponsored) WHERE is_sponsored = true;

CREATE INDEX IF NOT EXISTS idx_restaurants_is_sponsored
  ON restaurants (is_sponsored) WHERE is_sponsored = true;
