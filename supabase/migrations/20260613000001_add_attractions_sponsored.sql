-- WEB-FEAT-005: Sponsored/featured listings inline in web browse lists.
--
-- events and restaurants already carry is_sponsored / sponsored_until; attractions
-- did not. Add them so attractions can be boosted in the browse list with the same
-- clearly-labeled "Sponsored" treatment as the other content types.
--
-- ADDITIVE + idempotent per CLAUDE.md backward-compatibility rules:
--   * is_sponsored defaults FALSE so existing rows are unaffected and older
--     iOS/Android binaries that read attractions see no behavior change.
--   * sponsored_until is nullable (no expiry = open-ended sponsorship).
-- No drops, no tightening, safe to ship in a single release.

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false;

ALTER TABLE public.attractions
  ADD COLUMN IF NOT EXISTS sponsored_until timestamptz;

COMMENT ON COLUMN public.attractions.is_sponsored IS
  'WEB-FEAT-005: advertiser-boosted listing. Shown with a "Sponsored" badge + amber ring in browse lists; never disguised.';
COMMENT ON COLUMN public.attractions.sponsored_until IS
  'WEB-FEAT-005: sponsorship expiry. When in the past the sponsored treatment is dropped automatically (no manual cleanup). NULL = open-ended.';

-- Partial index so the browse-list "actively sponsored first" lookup stays cheap
-- once sponsored attractions exist (the vast majority of rows are not sponsored).
CREATE INDEX IF NOT EXISTS attractions_sponsored_idx
  ON public.attractions (is_sponsored, sponsored_until)
  WHERE is_sponsored = true;
