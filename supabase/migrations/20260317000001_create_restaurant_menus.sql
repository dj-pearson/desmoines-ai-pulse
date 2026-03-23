-- Restaurant Menu Storage with Versioning
-- Stores structured menu data extracted from websites, images, or manual entry
-- Designed for lightweight text storage (~1KB per restaurant vs ~1MB for images)

-- Menu versions table: tracks each snapshot of a restaurant's menu
CREATE TABLE IF NOT EXISTS restaurant_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL DEFAULT 'scraped' CHECK (source_type IN ('scraped', 'uploaded_image', 'uploaded_pdf', 'manual', 'api')),
  source_url TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text TEXT, -- original unstructured text before parsing
  notes TEXT, -- admin notes about this version
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, version)
);

-- Menu items table: structured menu data with section grouping
CREATE TABLE IF NOT EXISTS restaurant_menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_id UUID NOT NULL REFERENCES restaurant_menus(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL DEFAULT 'Main Menu', -- e.g., Appetizers, Entrees, Desserts, Drinks
  section_sort_order INTEGER NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL,
  item_description TEXT,
  price TEXT, -- stored as text to handle "Market Price", "$12-15", etc.
  price_numeric NUMERIC(8,2), -- parsed numeric for filtering/sorting
  dietary_tags TEXT[] DEFAULT '{}', -- vegan, vegetarian, gluten-free, dairy-free, etc.
  is_popular BOOLEAN DEFAULT false, -- flagged as popular/recommended
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_restaurant_menus_restaurant_id ON restaurant_menus(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_menus_is_current ON restaurant_menus(restaurant_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id ON restaurant_menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_dietary ON restaurant_menu_items USING GIN(dietary_tags);
CREATE INDEX IF NOT EXISTS idx_menu_items_price ON restaurant_menu_items(price_numeric) WHERE price_numeric IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_section ON restaurant_menu_items(menu_id, section_sort_order, sort_order);

-- Trigger: auto-update updated_at on restaurant_menus
DROP TRIGGER IF EXISTS update_restaurant_menus_updated_at ON restaurant_menus;
CREATE TRIGGER update_restaurant_menus_updated_at
  BEFORE UPDATE ON restaurant_menus
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: when a new menu is marked as current, unmark previous versions
CREATE OR REPLACE FUNCTION unmark_previous_menu_versions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE restaurant_menus
    SET is_current = false, updated_at = now()
    WHERE restaurant_id = NEW.restaurant_id
      AND id != NEW.id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_unmark_previous_menu_versions ON restaurant_menus;
CREATE TRIGGER trigger_unmark_previous_menu_versions
  AFTER INSERT OR UPDATE OF is_current ON restaurant_menus
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION unmark_previous_menu_versions();

-- Auto-increment version number per restaurant
CREATE OR REPLACE FUNCTION set_menu_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version = 1 THEN
    SELECT COALESCE(MAX(version), 0) + 1
    INTO NEW.version
    FROM restaurant_menus
    WHERE restaurant_id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_menu_version ON restaurant_menus;
CREATE TRIGGER trigger_set_menu_version
  BEFORE INSERT ON restaurant_menus
  FOR EACH ROW
  EXECUTE FUNCTION set_menu_version();

-- RLS policies
ALTER TABLE restaurant_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_items ENABLE ROW LEVEL SECURITY;

-- Public read access
DROP POLICY IF EXISTS "Public read access on restaurant_menus" ON restaurant_menus;
CREATE POLICY "Public read access on restaurant_menus"
  ON restaurant_menus FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read access on restaurant_menu_items" ON restaurant_menu_items;
CREATE POLICY "Public read access on restaurant_menu_items"
  ON restaurant_menu_items FOR SELECT USING (true);

-- Authenticated users can insert (for manual/upload submissions)
DROP POLICY IF EXISTS "Authenticated users can insert menus" ON restaurant_menus;
CREATE POLICY "Authenticated users can insert menus"
  ON restaurant_menus FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert menu items" ON restaurant_menu_items;
CREATE POLICY "Authenticated users can insert menu items"
  ON restaurant_menu_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Admin update/delete
DROP POLICY IF EXISTS "Admins can update menus" ON restaurant_menus;
CREATE POLICY "Admins can update menus"
  ON restaurant_menus FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "Admins can delete menus" ON restaurant_menus;
CREATE POLICY "Admins can delete menus"
  ON restaurant_menus FOR DELETE
  USING (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "Admins can update menu items" ON restaurant_menu_items;
CREATE POLICY "Admins can update menu items"
  ON restaurant_menu_items FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'admin');

DROP POLICY IF EXISTS "Admins can delete menu items" ON restaurant_menu_items;
CREATE POLICY "Admins can delete menu items"
  ON restaurant_menu_items FOR DELETE
  USING (auth.jwt() ->> 'role' = 'admin');

-- Helper: Search menu items across all restaurants
CREATE OR REPLACE FUNCTION search_menu_items(
  search_query TEXT,
  max_price NUMERIC DEFAULT NULL,
  dietary_filter TEXT[] DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  item_id UUID,
  restaurant_id UUID,
  restaurant_name TEXT,
  restaurant_slug TEXT,
  section_name TEXT,
  item_name TEXT,
  item_description TEXT,
  price TEXT,
  price_numeric NUMERIC,
  dietary_tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mi.id AS item_id,
    rm.restaurant_id,
    r.name AS restaurant_name,
    r.slug AS restaurant_slug,
    mi.section_name,
    mi.item_name,
    mi.item_description,
    mi.price,
    mi.price_numeric,
    mi.dietary_tags
  FROM restaurant_menu_items mi
  JOIN restaurant_menus rm ON mi.menu_id = rm.id AND rm.is_current = true
  JOIN restaurants r ON rm.restaurant_id = r.id
  WHERE
    (search_query IS NULL OR
     mi.item_name ILIKE '%' || search_query || '%' OR
     mi.item_description ILIKE '%' || search_query || '%' OR
     mi.section_name ILIKE '%' || search_query || '%')
    AND (max_price IS NULL OR mi.price_numeric <= max_price)
    AND (dietary_filter IS NULL OR mi.dietary_tags && dietary_filter)
  ORDER BY
    CASE WHEN mi.item_name ILIKE '%' || search_query || '%' THEN 0 ELSE 1 END,
    r.popularity_score DESC NULLS LAST,
    mi.price_numeric ASC NULLS LAST
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
