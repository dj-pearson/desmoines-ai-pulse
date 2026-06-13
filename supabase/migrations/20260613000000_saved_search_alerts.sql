-- WEB-FEAT-003: Saved searches + alerts with automated nightly digest.
--
-- The `saved_searches` table (id, user_id, name, filters JSONB, use_count,
-- last_used, timestamps) and its owner-only RLS already exist (migration
-- 20250819002500) and are already consumed cross-platform (iOS PARITY-008
-- stores {query, tab, alerts_enabled} inside `filters`). This migration is
-- purely additive:
--   1. a server-side per-tier creation limit (enforced for BOTH web and the
--      native apps via a BEFORE INSERT trigger), and
--   2. a `last_alerted_at` watermark + a partial index that the nightly
--      digest job (saved-search-alerts edge function) uses to email new-event
--      matches.
--
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded
-- DO blocks) and additive — no drops, no column renames — per the CLAUDE.md
-- backward-compatibility rules.

-- ---------------------------------------------------------------------------
-- 1. Per-search digest watermark (server-managed; the apps never write it).
-- ---------------------------------------------------------------------------
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMP WITH TIME ZONE;

-- Partial index so the nightly job scans only alert-enabled searches.
CREATE INDEX IF NOT EXISTS idx_saved_searches_alerts_enabled
  ON public.saved_searches ((filters->>'alerts_enabled'))
  WHERE (filters->>'alerts_enabled') = 'true';

-- ---------------------------------------------------------------------------
-- 2. Server-side per-tier saved-search limit.
--
-- Limits live in subscription_plans.limits->>'saved_searches'
-- (free=0, insider=10, vip=-1/unlimited). The trigger resolves the caller's
-- entitled limit and rejects an INSERT that would exceed it, so the cap holds
-- regardless of which client (web/iOS/Android) issues the insert. Service-role
-- / internal writes (no JWT → auth.uid() IS NULL) bypass the cap. Existing
-- rows are never affected (the trigger fires only on INSERT).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_saved_search_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_count INT;
  v_unlimited BOOLEAN;
BEGIN
  -- Service-role / internal writes (no end-user JWT) are trusted and bypass.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Any entitled plan granting unlimited (-1) short-circuits the check.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = NEW.user_id
      AND us.status IN ('active', 'trialing', 'past_due')
      AND (sp.limits->>'saved_searches')::int = -1
  ) INTO v_unlimited;

  IF v_unlimited THEN
    RETURN NEW;
  END IF;

  -- Otherwise the cap is the highest positive limit across the user's entitled
  -- plans, falling back to the free-tier limit when they have no subscription.
  SELECT COALESCE(
    MAX((sp.limits->>'saved_searches')::int),
    (SELECT (limits->>'saved_searches')::int
       FROM public.subscription_plans WHERE name = 'free')
  )
  INTO v_limit
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = NEW.user_id
    AND us.status IN ('active', 'trialing', 'past_due')
    AND (sp.limits->>'saved_searches')::int >= 0;

  v_limit := COALESCE(v_limit, 0);

  SELECT COUNT(*) INTO v_count
  FROM public.saved_searches
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'saved_search_limit_reached: % of % saved searches used', v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_saved_search_limit_trigger ON public.saved_searches;
CREATE TRIGGER enforce_saved_search_limit_trigger
  BEFORE INSERT ON public.saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_saved_search_limit();

-- ---------------------------------------------------------------------------
-- 3. Schedule the nightly digest (13:00 UTC ≈ 8:00am Central) — WEB-AUTO-001
--    jobRunner records the run; the edge function does the matching + sending.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('saved-search-alerts-nightly')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'saved-search-alerts-nightly');

    PERFORM cron.schedule(
      'saved-search-alerts-nightly',
      '0 13 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/saved-search-alerts',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
          'Content-Type', 'application/json',
          'x-trigger-source', 'cron'
        )
      ) as request_id;
      $cron$
    );
  END IF;
END $$;
