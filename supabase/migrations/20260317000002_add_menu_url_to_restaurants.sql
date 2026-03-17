-- Add menu scraping configuration columns to restaurants
-- menu_url: Custom URL to use for menu scraping (overrides website-based URL pattern discovery)
-- menu_scrape_enabled: Allow opting individual restaurants out of automated scraping

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS menu_url TEXT,
  ADD COLUMN IF NOT EXISTS menu_scrape_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN restaurants.menu_url IS
  'Custom URL to fetch menu from during scraping. When set, this URL is tried first (and exclusively) instead of pattern-guessing from the website field. Persists across all future scrape runs.';

COMMENT ON COLUMN restaurants.menu_scrape_enabled IS
  'Set to false to exclude this restaurant from all automated menu scraping (batch and individual).';

-- Index for batch scrape queries that filter by scrape_enabled + no current menu
CREATE INDEX IF NOT EXISTS idx_restaurants_menu_scrape
  ON restaurants(menu_scrape_enabled, id)
  WHERE menu_scrape_enabled = true;
