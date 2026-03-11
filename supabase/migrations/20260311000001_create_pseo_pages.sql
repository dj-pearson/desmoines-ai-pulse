-- pSEO 2.0 Pages Table
-- Stores AI-generated programmatic SEO page content

CREATE TABLE IF NOT EXISTS pseo_pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  page_type_id TEXT NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]',
  seo JSONB NOT NULL DEFAULT '{}',
  sections JSONB NOT NULL DEFAULT '[]',
  related_pages JSONB NOT NULL DEFAULT '[]',
  structured_data JSONB NOT NULL DEFAULT '{}',
  generation_meta JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT false,
  quality_score NUMERIC(3,2) DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_pseo_pages_slug ON pseo_pages(slug);
CREATE INDEX IF NOT EXISTS idx_pseo_pages_page_type ON pseo_pages(page_type_id);
CREATE INDEX IF NOT EXISTS idx_pseo_pages_published ON pseo_pages(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_pseo_pages_dimensions ON pseo_pages USING GIN(dimensions);
CREATE INDEX IF NOT EXISTS idx_pseo_pages_quality ON pseo_pages(quality_score DESC) WHERE is_published = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pseo_pages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pseo_pages_updated_at
  BEFORE UPDATE ON pseo_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_pseo_pages_updated_at();

-- Auto-set published_at when is_published changes to true
CREATE OR REPLACE FUNCTION set_pseo_pages_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.published_at IS NULL) THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pseo_pages_published_at
  BEFORE UPDATE ON pseo_pages
  FOR EACH ROW
  EXECUTE FUNCTION set_pseo_pages_published_at();

-- Row Level Security
ALTER TABLE pseo_pages ENABLE ROW LEVEL SECURITY;

-- Public read access for published pages
CREATE POLICY "Public can read published pseo pages"
  ON pseo_pages FOR SELECT
  USING (is_published = true);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to pseo pages"
  ON pseo_pages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Increment view count function
CREATE OR REPLACE FUNCTION increment_pseo_page_views(page_slug TEXT)
RETURNS void AS $$
BEGIN
  UPDATE pseo_pages
  SET view_count = view_count + 1
  WHERE slug = page_slug;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
