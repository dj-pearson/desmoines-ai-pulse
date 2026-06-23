-- WEB-FEAT-003: Saved searches + event alerts + nightly digest
-- Extends the existing saved_searches table (additive) so a list-page search can
-- be saved with alerts, adds a tier-limited create RPC (server-side Insider 10 /
-- VIP unlimited enforcement), a per-user alerts opt-out, and the nightly cron.

-- ---------------------------------------------------------------------------
-- 1. Additive columns on saved_searches. Existing advanced-search saves default
--    to search_type='advanced' and are untouched by the alerts pipeline.
-- ---------------------------------------------------------------------------
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS alerts_enabled  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS search_type     TEXT NOT NULL DEFAULT 'advanced';

-- Index the rows the nightly job scans (event-list saves with alerts on).
CREATE INDEX IF NOT EXISTS idx_saved_searches_active_alerts
  ON public.saved_searches (search_type, alerts_enabled)
  WHERE alerts_enabled = true AND search_type = 'event_list';

-- ---------------------------------------------------------------------------
-- 2. Per-user alert opt-out on the existing email-preferences table (additive,
--    default true so opting into a saved-search alert keeps working).
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_email_preferences
  ADD COLUMN IF NOT EXISTS event_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 3. Tier-limited create RPC. Free = 0 (client shows the paywall), Insider = 10,
--    VIP = unlimited. SECURITY DEFINER so it can read subscriptions; still scoped
--    to the caller via auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_event_saved_search(
  p_name    TEXT,
  p_filters JSONB
)
RETURNS public.saved_searches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_tier   TEXT;
  v_limit  INTEGER;
  v_count  INTEGER;
  v_row    public.saved_searches;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Highest active/trialing tier (vip > insider > free).
  SELECT sp.name INTO v_tier
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = v_user
    AND us.status IN ('active', 'trialing')
  ORDER BY CASE sp.name WHEN 'vip' THEN 2 WHEN 'insider' THEN 1 ELSE 0 END DESC
  LIMIT 1;
  v_tier := COALESCE(v_tier, 'free');

  v_limit := CASE v_tier
    WHEN 'vip' THEN 2147483647
    WHEN 'insider' THEN 10
    ELSE 0
  END;

  SELECT COUNT(*) INTO v_count
  FROM public.saved_searches
  WHERE user_id = v_user AND search_type = 'event_list';

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'saved_search_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.saved_searches (user_id, name, filters, search_type, alerts_enabled, use_count)
  VALUES (v_user, COALESCE(NULLIF(trim(p_name), ''), 'My saved search'), p_filters, 'event_list', true, 1)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_saved_search(TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Schedule the nightly alert digest (07:00 UTC ≈ 1–2 AM Central, after the
--    day's ingestion). Calls the saved-search-alerts edge function.
-- ---------------------------------------------------------------------------
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron';
    ELSE
      RAISE NOTICE 'pg_cron unavailable; skipping saved-search-alerts schedule';
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'saved-search-alerts-nightly') THEN
    PERFORM cron.unschedule('saved-search-alerts-nightly');
  END IF;

  PERFORM cron.schedule(
    'saved-search-alerts-nightly',
    '0 7 * * *',
    $$
    SELECT net.http_post(
      url := 'https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/saved-search-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('source', 'cron')::text
    ) as request_id;
    $$
  );

  RAISE NOTICE 'Cron job "saved-search-alerts-nightly" scheduled (07:00 UTC daily)';
END
$cron$;
