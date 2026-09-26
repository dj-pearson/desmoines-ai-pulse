-- NON_CORE_REVIEW_2026-09 WP3 (business plan D15): a creative's link_url
-- must be an http(s) URL.
--
-- link_url is typed by the advertiser and rendered as an href in two places:
-- AdBanner (the public ad) and AdminCampaignDetail (the reviewer's screen).
-- A javascript: URL there runs in whoever clicks it, which on the admin page
-- is an admin session: stored XSS against the reviewer. Both renderers now
-- pass it through toSafeExternalUrl, and CreativeUploadForm refuses anything
-- else; this CHECK is the server half, for writes that skip the form.
--
-- NOT VALID: new and updated rows are checked, existing rows are not, so the
-- migration cannot fail on an old bad value and takes no long lock. Once
-- someone has looked at the result of
--   SELECT id, link_url FROM public.campaign_creatives
--    WHERE link_url IS NOT NULL AND link_url !~* '^https?://';
-- the constraint can be VALIDATEd in a later release.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md). This is a new CHECK, which
-- scripts/check-migration-safety.mjs flags, so the PR needs the
-- migration-override label. It rejects only values no shipped client should
-- send: the web form has required http(s) since before this release, and the
-- value is useless to every renderer otherwise. NULL stays allowed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'campaign_creatives_link_url_http'
       AND conrelid = 'public.campaign_creatives'::regclass
  ) THEN
    ALTER TABLE public.campaign_creatives
      ADD CONSTRAINT campaign_creatives_link_url_http
      CHECK (link_url IS NULL OR link_url ~* '^https?://') NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT campaign_creatives_link_url_http ON public.campaign_creatives IS
  'link_url must start with http:// or https:// (NON_CORE_REVIEW WP3, D15). NOT VALID: existing rows unchecked until validated.';
