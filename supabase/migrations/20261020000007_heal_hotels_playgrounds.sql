-- WEB-BE-055: hotels and playgrounds join the nightly data-quality heal.
-- Additive only. The same two columns 20260612000005 gave events, restaurants
-- and attractions, so data-quality-heal can count attempts on these rows too
-- and stop retrying one that keeps failing to geocode.
--
-- Until this is applied, data-quality-heal records hotels and playgrounds in
-- tableErrors (42703 on heal_attempts) and still heals the other three tables.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hotels', 'playgrounds'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS needs_manual_verification BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS heal_attempts INTEGER NOT NULL DEFAULT 0',
      t
    );
  END LOOP;
END $$;
