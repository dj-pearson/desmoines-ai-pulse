-- The last content a scraped page produced, so an unchanged page skips the model.
--
-- firecrawl-scraper renders a page and sends it to Claude on every run, whether
-- or not a byte of it changed since the last one. The scraping-jobs-runner cron
-- dispatches every 30 minutes, so a venue calendar that changes weekly was
-- paying for the same extraction dozens of times over.
--
-- The scraper now hashes the extraction window (the slice the prompt would
-- carry) and skips the model call when the hash matches the last run that
-- WROTE CLEANLY. A run with any write error does not record its hash, so the
-- next run retries the extraction instead of trusting a partial write. A page
-- is re-extracted at least every REEXTRACT_AFTER_HOURS regardless (see the
-- function), so an image heal or a source_url upgrade is never more than a day
-- behind.
--
-- Written only by the service role. No policies: RLS on with none means no
-- client can read or write it, which is what a cache of third-party pages wants.

CREATE TABLE IF NOT EXISTS public.scrape_page_fingerprints (
  url               text PRIMARY KEY,
  content_hash      text NOT NULL,
  items_found       integer NOT NULL DEFAULT 0,
  -- When the hash last CHANGED (or was first recorded), and when the model last
  -- actually ran on this page. The second is what bounds staleness.
  content_changed_at timestamptz NOT NULL DEFAULT now(),
  last_extracted_at  timestamptz NOT NULL DEFAULT now(),
  -- How many runs in a row were answered from this row. An operator reading
  -- this table can see which sources are costing nothing.
  consecutive_skips integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scrape_page_fingerprints ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.scrape_page_fingerprints IS
'firecrawl-scraper change detection: the hash of the last extraction window per page URL that produced a clean write. A match skips the Claude call. Service role only.';
