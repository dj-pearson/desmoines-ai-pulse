-- ADMIN-HOTEL-002: bring hotels in line with events/restaurants by adding the
-- standard SEO + GEO columns. These are required by the new HotelEditDialog
-- and let the public hotel pages render structured data + meta tags the same
-- way other content verticals do.

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS seo_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS seo_h1 TEXT,
  ADD COLUMN IF NOT EXISTS geo_summary TEXT,
  ADD COLUMN IF NOT EXISTS geo_key_facts TEXT[],
  ADD COLUMN IF NOT EXISTS geo_faq JSONB;

COMMENT ON COLUMN public.hotels.seo_title IS 'Meta title (≤60 chars recommended)';
COMMENT ON COLUMN public.hotels.seo_description IS 'Meta description (≤160 chars recommended)';
COMMENT ON COLUMN public.hotels.seo_keywords IS 'Meta keywords as an array of strings';
COMMENT ON COLUMN public.hotels.seo_h1 IS 'Optional override for the page H1; defaults to hotels.name';
COMMENT ON COLUMN public.hotels.geo_summary IS 'AI-discoverable plain-language summary of the hotel';
COMMENT ON COLUMN public.hotels.geo_key_facts IS 'Bulleted key facts for AI scraping (location, parking, amenities)';
COMMENT ON COLUMN public.hotels.geo_faq IS 'FAQ entries as JSON array of {question, answer} objects';
