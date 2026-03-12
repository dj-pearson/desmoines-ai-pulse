-- What's New in DSM - Scene updates feed (US-058)
-- Tracks new openings, closings, renovations, and other scene changes.

CREATE TABLE IF NOT EXISTS scene_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  update_type TEXT NOT NULL CHECK (update_type IN ('new_opening', 'closing', 'renovation', 'expansion', 'news')),
  entity_type TEXT DEFAULT NULL CHECK (entity_type IS NULL OR entity_type IN ('restaurant', 'attraction', 'venue', 'neighborhood')),
  entity_id UUID DEFAULT NULL,
  image_url TEXT DEFAULT NULL,
  source_url TEXT DEFAULT NULL,
  neighborhood TEXT DEFAULT NULL,
  is_published BOOLEAN DEFAULT true,
  publish_date TIMESTAMPTZ DEFAULT now(),
  author TEXT DEFAULT 'Des Moines Insider',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scene_updates ENABLE ROW LEVEL SECURITY;

-- Public read for published updates
DO $$ BEGIN
  CREATE POLICY "Public read published scene updates" ON scene_updates FOR SELECT USING (is_published = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin CRUD
DO $$ BEGIN
  CREATE POLICY "Admin insert scene updates" ON scene_updates FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin update scene updates" ON scene_updates FOR UPDATE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin delete scene updates" ON scene_updates FOR DELETE
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX idx_scene_updates_type ON scene_updates (update_type);
CREATE INDEX idx_scene_updates_publish_date ON scene_updates (publish_date DESC);
CREATE INDEX idx_scene_updates_neighborhood ON scene_updates (neighborhood);
CREATE INDEX idx_scene_updates_published ON scene_updates (is_published, publish_date DESC);

-- Auto-generate scene updates for new restaurants via trigger
CREATE OR REPLACE FUNCTION notify_new_restaurant()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO scene_updates (title, body, update_type, entity_type, entity_id, image_url, neighborhood)
  VALUES (
    'New Restaurant: ' || NEW.name,
    COALESCE(NEW.description, NEW.name || ' is now open in Des Moines.'),
    'new_opening',
    'restaurant',
    NEW.id,
    NEW.image_url,
    NEW.city
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_new_restaurant_scene_update ON restaurants;
CREATE TRIGGER trg_new_restaurant_scene_update
  AFTER INSERT ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_restaurant();
