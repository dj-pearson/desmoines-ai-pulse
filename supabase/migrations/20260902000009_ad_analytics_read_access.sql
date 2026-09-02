-- WEB-ADS-002: let an advertiser read their own ad numbers.
--
-- ad_impressions and ad_clicks have no policy of any kind in the migration
-- ledger. The browser's inserts were refused, which is the write half of this
-- story and is fixed by the track-ad-event edge function writing on the service
-- role. The read half is this file: useCampaignAnalytics SELECTs both tables
-- directly with the user's key, so rows the edge function now writes would
-- still not reach the dashboard that exists to show them.
--
-- ONLY PERMISSIVE POLICIES ARE ADDED, AND RLS IS NOT ENABLED HERE. That
-- combination is safe under either current state:
--   * if RLS is on, these grant exactly the reads the dashboard needs and
--     nothing else;
--   * if RLS is off, a permissive policy is inert and reads already work.
-- Turning row-level security ON here would not be safe: on a table where it is
-- currently off, that would deny every access that works today. That is the
-- same reasoning as 20260902000008 and it is deliberate in both.
--
-- Scope: a campaign's owner and admins. Not anon, and not other advertisers --
-- impressions carry session ids, user agents and page urls, which is behavioural
-- data about visitors rather than a public metric.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'ad_impressions'
       AND policyname = 'ad_impressions_owner_or_admin_select'
  ) THEN
    CREATE POLICY "ad_impressions_owner_or_admin_select"
      ON public.ad_impressions
      FOR SELECT
      TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.campaigns c
           WHERE c.id = ad_impressions.campaign_id
             AND c.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'ad_clicks'
       AND policyname = 'ad_clicks_owner_or_admin_select'
  ) THEN
    CREATE POLICY "ad_clicks_owner_or_admin_select"
      ON public.ad_clicks
      FOR SELECT
      TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.campaigns c
           WHERE c.id = ad_clicks.campaign_id
             AND c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.ad_impressions IS
'Ad impressions. WEB-ADS-002: written ONLY by the track-ad-event edge function on the service role -- the browser''s direct inserts were refused by RLS for the life of the table, which is why every advertiser dashboard read zero. Idempotent on client_event_id. Do not open this table to client writes: anyone could then inflate any advertiser''s numbers.';

COMMENT ON TABLE public.ad_clicks IS
'Ad clicks. WEB-ADS-002: written ONLY by the track-ad-event edge function on the service role. Idempotent on client_event_id.';
