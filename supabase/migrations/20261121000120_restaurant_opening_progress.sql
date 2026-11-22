-- WEB-BE-073: move a restaurant from announced to open without a person.
--
-- restaurants.status announced / opening_soon was set by the openings
-- pipeline and cleared by nothing; scripts/check-stale-openings.ts went red
-- every night for rows a Google answer had already settled.
--
-- FORWARD ONLY, AUTOMATICALLY:
--   announced | opening_soon -> newly_opened
--       when Google reports OPERATIONAL and the row has hours (weekday
--       descriptions or periods), in the same statement that wrote them (the
--       Places refresh, an enrichment, an admin save). A statement that sets
--       status itself wins. newly_opened_at records when this was observed;
--       opening_date is NOT invented from it.
--   newly_opened -> open
--       NEWLY_OPENED_DAYS (60, owner decision 2026-11-21) after newly_opened_at,
--       or after opening_date for rows flagged before this migration. Undated
--       legacy newly_opened rows are left alone (src/lib/restaurantOpenings.ts
--       already makes no recency claim for them).
-- Nothing here ever moves status backwards or closes a place; closing stays
-- with WEB-BE-065 and the closure queue.
--
-- QUEUED, NOT FAILED: an announced / opening_soon row whose opening_date is
-- more than 7 days past and that Google does not confirm as OPERATIONAL is
-- queued in restaurant_closure_reviews as 'opening_unconfirmed' (one open
-- finding per row), instead of only failing the nightly workflow.
--
-- Additive: one column, a widened CHECK (one more allowed reason), a trigger,
-- a function and a nightly pg_cron job (pure SQL, no HTTP, no credentials).

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS newly_opened_at timestamptz;

ALTER TABLE public.restaurant_closure_reviews DROP CONSTRAINT IF EXISTS restaurant_closure_reviews_reason_check;
ALTER TABLE public.restaurant_closure_reviews ADD CONSTRAINT restaurant_closure_reviews_reason_check
  CHECK (reason IN ('place_not_found', 'no_place_match', 'visitor_report', 'opening_unconfirmed'));

CREATE OR REPLACE FUNCTION public.restaurant_has_hours(h jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT h IS NOT NULL AND (
    jsonb_array_length(coalesce(h -> 'weekdayDescriptions', '[]'::jsonb)) > 0
    OR jsonb_array_length(coalesce(h -> 'periods', '[]'::jsonb)) > 0
  )
$$;

CREATE OR REPLACE FUNCTION public.track_restaurant_opening_progress()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('announced', 'opening_soon')
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.business_status = 'OPERATIONAL'
     AND public.restaurant_has_hours(NEW.hours_json) THEN
    NEW.status := 'newly_opened';
    NEW.newly_opened_at := now();
    NEW.status_changed_at := now();
    NEW.status_changed_by := 'places';
  END IF;
  RETURN NEW;
END
$$;

-- Named to sort after trg_sync_restaurant_closed_flags (WEB-BE-065), which
-- records a statement's own status change; PostgreSQL fires same-event
-- triggers in name order, so this one's change is attributed to 'places'.
DROP TRIGGER IF EXISTS trg_track_opening_progress ON public.restaurants;
CREATE TRIGGER trg_track_opening_progress
  BEFORE UPDATE OF business_status, hours_json, status ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.track_restaurant_opening_progress();

CREATE OR REPLACE FUNCTION public.advance_restaurant_openings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open integer;
  v_queued integer;
BEGIN
  UPDATE public.restaurants
     SET status = 'open'
   WHERE status = 'newly_opened'
     AND is_merged IS NOT TRUE
     AND coalesce(newly_opened_at, opening_date::timestamptz) < now() - interval '60 days';
  GET DIAGNOSTICS v_open = ROW_COUNT;

  INSERT INTO public.restaurant_closure_reviews (restaurant_id, reason, source, details)
  SELECT r.id, 'opening_unconfirmed', 'advance_restaurant_openings',
         jsonb_build_object('opening_date', r.opening_date, 'business_status', r.business_status)
    FROM public.restaurants r
   WHERE r.status IN ('announced', 'opening_soon')
     AND r.is_merged IS NOT TRUE
     AND r.opening_date < current_date - 7
     AND r.business_status IS DISTINCT FROM 'OPERATIONAL'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  RETURN jsonb_build_object('newly_opened_to_open', v_open, 'queued_opening_unconfirmed', v_queued);
END
$$;

REVOKE ALL ON FUNCTION public.advance_restaurant_openings() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping restaurant-openings-advance schedule';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restaurant-openings-advance') THEN
    PERFORM cron.unschedule('restaurant-openings-advance');
  END IF;
  -- 10:47 UTC, after the hours refresh (09:41) has written the day's answers.
  PERFORM cron.schedule('restaurant-openings-advance', '47 10 * * *', 'SELECT public.advance_restaurant_openings()');
END
$$;
