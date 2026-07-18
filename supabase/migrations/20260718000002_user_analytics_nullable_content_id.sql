-- WEB-QA-013: allow page-view rows in user_analytics.
--
-- PROBLEM
-- usePageTracking records a page view by inserting into public.user_analytics
-- with `content_id` set to the pathname (e.g. '/'). `content_id` is a NOT NULL
-- uuid, so every insert failed with 22P02 ("invalid input syntax for type uuid")
-- and NO PAGE VIEW HAS EVER BEEN RECORDED. The failure was invisible in
-- production because the hook only logs the error under import.meta.env.DEV.
--
-- Setting content_id to NULL instead is not sufficient on its own: the column is
-- NOT NULL, so that fails with 23502 rather than 22P02.
--
-- WHY THIS COLUMN, RATHER THAN A NEW TABLE
-- user_analytics already carries everything a page view needs — event_type,
-- page_url, referrer, user_agent, device_type, session_id, user_id — and is
-- already the destination the code targets. The only thing that does not apply
-- to a page view is `content_id`, because a page is not a content row.
-- traffic_metrics is not an alternative: it stores provider-aggregated daily
-- totals (pageviews, sessions, bounce_rate), not individual views.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md)
-- Dropping NOT NULL is a LOOSENING, which is safe in a single release:
--   * Existing writers (web and every shipped mobile binary) always send a
--     content_id for content interactions, so nothing they do starts failing.
--   * Existing readers may now encounter NULL content_id on page_view rows.
--     Any consumer that assumes non-null must filter on
--     `content_type <> 'page'` or `content_id IS NOT NULL`.
--   * No column, table or RPC is removed or renamed; no shape changes.
--
-- The reverse (re-adding NOT NULL) would be the destructive direction and would
-- require the multi-release deprecation flow.

ALTER TABLE public.user_analytics
  ALTER COLUMN content_id DROP NOT NULL;

COMMENT ON COLUMN public.user_analytics.content_id IS
  'FK-style id of the content row this interaction targets. NULL for rows where '
  'the interaction is not against a content item — notably event_type = ''page_view'', '
  'where the location is carried by page_url instead (WEB-QA-013).';
