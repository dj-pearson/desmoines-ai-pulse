-- Add SEO optimization columns to events table
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seo_h1 TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS geo_summary TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS geo_key_facts TEXT[];
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS geo_faq JSONB;

-- Add SEO optimization columns to restaurants table
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS seo_h1 TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS geo_summary TEXT;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS geo_key_facts TEXT[];
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS geo_faq JSONB;