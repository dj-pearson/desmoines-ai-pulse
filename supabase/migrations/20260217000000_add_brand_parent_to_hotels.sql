-- Add brand_parent column to hotels for affiliate program mapping
-- brand_parent identifies the parent hotel company for affiliate URL generation
-- e.g., "Hilton" for Hampton Inn, Hilton Garden Inn, Embassy Suites, etc.

ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS brand_parent TEXT;

-- Add index for filtering by brand
CREATE INDEX IF NOT EXISTS idx_hotels_brand_parent ON public.hotels(brand_parent);

COMMENT ON COLUMN public.hotels.brand_parent IS 'Parent hotel company (Hilton, Marriott, IHG, Hyatt, Choice, Wyndham, Best Western, Drury, Independent) used for affiliate link generation';
