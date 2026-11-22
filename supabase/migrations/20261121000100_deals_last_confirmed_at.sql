-- WEB-FEAT-104: deals.last_confirmed_at, when a deal was created or last
-- re-confirmed by an admin.
--
-- The public deal filter was start_date in the past and end_date null or in
-- the future, so a happy hour entered with no end date was advertised on
-- /deals, the restaurant page, the Happy hour now strip and the page's
-- makesOffer JSON-LD for as long as the row existed. The web client now hides
-- an open-ended deal whose last_confirmed_at is more than 90 days old
-- (src/lib/dealFreshness.ts) and DealManager lists those for re-confirmation.
--
-- Additive only. The column is added nullable with no default, so adding it
-- rewrites nothing; it is backfilled, and only then given DEFAULT now(), which
-- applies to new rows without touching existing ones. The public SELECT policy
-- is NOT tightened: the iOS and Android apps read deals and do not know the
-- rule, and tightening the policy in the same release would be a breaking
-- change for them (CLAUDE.md, Backward Compatibility).
--
-- Backfill choice: deals has no updated_at column, so the only evidence of
-- when a row was last looked at is created_at (start_date when created_at is
-- null; start_date is NOT NULL). A deal is treated as confirmed when it was
-- entered. An open-ended deal entered more than 90 days ago is therefore
-- hidden the day this ships, and appears in DealManager's "Needs re-confirm"
-- list; that is the point of the story, since nobody has looked at it since.
-- A deal with an end date is never hidden by this rule.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;

UPDATE public.deals
   SET last_confirmed_at = COALESCE(created_at, start_date)
 WHERE last_confirmed_at IS NULL;

ALTER TABLE public.deals ALTER COLUMN last_confirmed_at SET DEFAULT now();

-- The admin's re-confirm list and the public filter both read open-ended
-- deals by this column. The table is small; a plain index is fine here.
CREATE INDEX IF NOT EXISTS idx_deals_open_ended_confirmed
  ON public.deals (last_confirmed_at)
  WHERE end_date IS NULL;

COMMENT ON COLUMN public.deals.last_confirmed_at IS
  'WEB-FEAT-104: when the deal was created or last re-confirmed by an admin. An open-ended deal (end_date null) not confirmed for 90 days is hidden from public pages and JSON-LD by the web client.';
