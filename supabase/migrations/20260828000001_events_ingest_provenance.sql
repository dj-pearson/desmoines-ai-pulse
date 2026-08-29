-- DMI-011 — record WHICH PRODUCER wrote each event row, and what rendered the
-- page it came from.
--
-- WHY. Until now `public.events` had exactly one writer, so "where did this row
-- come from" had one answer and needed no column. The hub's ingest run makes it
-- two, and a two-producer table with no provenance is the situation this repo
-- already records as an open operator decision for Daily OK's blog_posts: two
-- things writing to one table, and no way to tell afterwards which did what.
--
-- It also makes the cost claim falsifiable. DMI-018 has to report Browserless
-- renders avoided, and without `render_provider` on the row there is nothing to
-- check that against — a run that silently fell back to the paid chain would be
-- indistinguishable from one served free by Firecrawl keyless.
--
-- BOTH COLUMNS ARE NULLABLE AND THERE IS NO BACKFILL, DELIBERATELY. Every row
-- written before this migration has no provenance, and there is no honest value
-- to give it: stamping them all 'firecrawl-scraper' would be a guess written
-- into a database and indistinguishable from a measurement afterwards. NULL
-- means "written before provenance was recorded", which is true. The reporting
-- side must treat NULL as unknown rather than as a default producer.
--
-- NO DEFAULT for the same reason: a DEFAULT would silently stamp the existing
-- writer's name onto rows from a producer that forgot to send one.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS produced_by TEXT,
  ADD COLUMN IF NOT EXISTS render_provider TEXT;

COMMENT ON COLUMN public.events.produced_by IS
  'Which producer wrote this row: "firecrawl-scraper" (the cloud path) or "hub-ingest" (the local ADE Hub run). NULL means the row predates DMI-011 and its producer is unknown, not that it has no producer.';

COMMENT ON COLUMN public.events.render_provider IS
  'Which render provider served the page this event was extracted from - e.g. "firecrawl-keyless", "cloud", "server". NULL means unrecorded. This is what makes the DMI-018 saving falsifiable: a run that fell back to the paid chain must not look like one served free.';

-- Reading "how much of the table came from which producer" is the whole point,
-- and it is a small table, so one index on the producer is enough. No index on
-- render_provider: nothing filters by it, it is read per row.
CREATE INDEX IF NOT EXISTS idx_events_produced_by
  ON public.events (produced_by)
  WHERE produced_by IS NOT NULL;
