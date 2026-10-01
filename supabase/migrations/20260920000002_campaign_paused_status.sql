-- WEB-ADS-011 AC2: a campaign can be paused.
--
-- SPLIT FROM THE FUNCTIONS THAT USE IT, and that is the whole reason this file
-- is separate. ALTER TYPE ... ADD VALUE is allowed inside a transaction on
-- Postgres 12+, but the new label cannot be USED until that transaction
-- commits, and the Supabase CLI runs each migration file in one transaction.
-- Anything casting to 'paused' therefore has to live in a later file; the
-- functions are in 20260920000003.
--
-- ADDITIVE. A new enum value is on CLAUDE.md's always-safe list: older iOS and
-- Android binaries read campaigns.status and will simply not match 'paused' in
-- their switch, which is the correct outcome - a paused campaign is not one
-- they should be rendering as running.

ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'paused';

-- What pausing has to remember so resuming cannot give away days.
--
-- An advertiser paid for a number of days. Resuming by simply clearing the
-- pause would run the campaign to its original end_date and silently shorten
-- it; resuming by pushing end_date out by the wall-clock pause length is the
-- same arithmetic done the other way and is fine, but it needs the remaining
-- count at the moment of the pause to be right even if the row is edited in
-- between. Storing it is cheaper than reconstructing it.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS days_remaining_at_pause integer;

COMMENT ON COLUMN public.campaigns.days_remaining_at_pause IS
  'Days left on the campaign when it was paused (WEB-ADS-011). Resuming sets end_date to today plus this, so the advertiser gets the days they paid for and no more.';
