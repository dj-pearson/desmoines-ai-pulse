-- WEB-AUTO-003: self-healing data-quality flags (additive).
-- needs_manual_verification: set when a row repeatedly fails auto-heal so the
-- nightly job stops retrying it forever and the admin can review.
-- heal_attempts: per-row geocode/heal attempt counter.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'restaurants', 'attractions'] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS needs_manual_verification BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS heal_attempts INTEGER NOT NULL DEFAULT 0',
      t
    );
  END LOOP;
END $$;

COMMENT ON COLUMN public.events.needs_manual_verification IS
  'WEB-AUTO-003: row repeatedly failed automated data-quality heal; needs a human.';
