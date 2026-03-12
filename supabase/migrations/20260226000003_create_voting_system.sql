-- Des Best crowdsourced local voting system (US-041)
-- Enables community voting on "Best Of" categories for Des Moines.

-- Voting categories (e.g., Best Pizza, Best Coffee, Best Date Night)
CREATE TABLE IF NOT EXISTS voting_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'trophy',
  is_active BOOLEAN DEFAULT true,
  voting_start TIMESTAMPTZ DEFAULT now(),
  voting_end TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual votes with one-vote-per-category-per-user constraint
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES voting_categories(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('restaurant', 'event', 'attraction', 'custom')),
  entity_id UUID DEFAULT NULL,
  custom_entry TEXT DEFAULT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, user_id)
);

-- RLS policies
ALTER TABLE voting_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Voting categories: public read, admin write
DO $$ BEGIN
  CREATE POLICY "Public read voting categories" ON voting_categories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin insert voting categories" ON voting_categories FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin update voting categories" ON voting_categories FOR UPDATE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Votes: authenticated users can vote (one per category), public read for results
DO $$ BEGIN
  CREATE POLICY "Public read votes" ON votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can vote" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own votes" ON votes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_votes_category_id ON votes (category_id);
CREATE INDEX IF NOT EXISTS idx_votes_entity_id ON votes (entity_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes (user_id);
CREATE INDEX IF NOT EXISTS idx_voting_categories_slug ON voting_categories (slug);
CREATE INDEX IF NOT EXISTS idx_voting_categories_active ON voting_categories (is_active) WHERE is_active = true;

-- Seed initial categories
INSERT INTO voting_categories (name, slug, description, icon) VALUES
  ('Best Pizza', 'best-pizza', 'Vote for the best pizza in Des Moines', 'pizza'),
  ('Best Coffee Shop', 'best-coffee-shop', 'Vote for your favorite local coffee spot', 'coffee'),
  ('Best Happy Hour', 'best-happy-hour', 'Which spot has the best happy hour deals?', 'beer'),
  ('Best Brunch', 'best-brunch', 'The best brunch experience in DSM', 'egg'),
  ('Best Date Night Spot', 'best-date-night', 'Perfect place for a date night', 'heart'),
  ('Best Hidden Gem', 'best-hidden-gem', 'That place only locals know about', 'gem'),
  ('Best Food Truck', 'best-food-truck', 'The best food truck in the Des Moines area', 'truck'),
  ('Best Brewery', 'best-brewery', 'Vote for the best local brewery', 'beer'),
  ('Best Ice Cream', 'best-ice-cream', 'Best ice cream or frozen treats in DSM', 'icecream'),
  ('Best Live Music Venue', 'best-live-music', 'Where is the best live music experience?', 'music')
ON CONFLICT (slug) DO NOTHING;
