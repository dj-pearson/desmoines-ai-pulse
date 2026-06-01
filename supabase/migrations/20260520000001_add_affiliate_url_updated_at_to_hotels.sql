-- ADMIN-HOTEL-003: dedicated tracking column for the last time a hotel's
-- affiliate URL was regenerated. Lets the admin HotelManager show a
-- "Last regen" column that is accurate without inferring from updated_at
-- (which also changes for any other edit).

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS affiliate_url_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hotels.affiliate_url_updated_at
  IS 'Set by generate-hotel-affiliate-urls when the affiliate_url is written; surfaced as a "Last regen" column in the admin Hotel manager.';
