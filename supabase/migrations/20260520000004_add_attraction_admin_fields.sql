-- ADMIN-ATTRACTION-001: bring attractions up to parity with hotels by adding
-- the admin curation fields (address, hours, accessibility flags, soft-delete)
-- and the standard SEO + GEO columns.

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS hours_summary TEXT,
  ADD COLUMN IF NOT EXISTS hours JSONB,
  ADD COLUMN IF NOT EXISTS is_indoor BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_kid_friendly BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS seo_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS seo_h1 TEXT,
  ADD COLUMN IF NOT EXISTS geo_summary TEXT,
  ADD COLUMN IF NOT EXISTS geo_key_facts TEXT[],
  ADD COLUMN IF NOT EXISTS geo_faq JSONB;

COMMENT ON COLUMN public.attractions.hours IS 'Per-day open/close hours as JSONB: { mon: {open,close}, tue: {open,close}, … }';
COMMENT ON COLUMN public.attractions.is_active IS 'Soft-delete flag; admins set to false to hide from public list while preserving the row + analytics.';
COMMENT ON COLUMN public.attractions.accessibility_notes IS 'Free-form notes for wheelchair access, parking, sensory considerations, etc.';
