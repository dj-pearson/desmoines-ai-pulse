-- Non-core review WP6: a column for the Ticketmaster affiliate redirect.
--
-- scrape-ticketmaster-events overwrote events.source_url with an Impact
-- redirect (https://ticketmaster.evyy.net/c/...?u=<ticketmaster page>). That
-- threw away the real page, which the link checker, the dedupe sweep and the
-- JSON-LD offer all read, and left the detail page unable to tell an
-- affiliate link from a plain one. The scraper now writes the redirect here
-- and keeps source_url as the real page.
--
-- Additive only: a nullable column with no default (no table rewrite) and a
-- one-time copy. source_url is NOT rewritten here. Old mobile binaries read
-- source_url, and the web decodes a redirect left in it (eventTicketUrl), so
-- those rows keep working; the scraper restores the real page on its next
-- match (ticketmasterPatch).
--
-- Web reads this column through EVENT_DETAIL_COLUMNS, and useEventBySlug
-- retries without it on 42703, so deploying the web before this migration
-- does not blank the detail page.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS affiliate_url text NULL;

COMMENT ON COLUMN public.events.affiliate_url IS
  'Affiliate redirect for the ticket page (Ticketmaster via Impact). Shown as the outbound button with rel=sponsored and a disclosure. source_url stays the real page.';

UPDATE public.events
SET affiliate_url = source_url
WHERE affiliate_url IS NULL
  AND source_url LIKE 'https://ticketmaster.evyy.net/%';
