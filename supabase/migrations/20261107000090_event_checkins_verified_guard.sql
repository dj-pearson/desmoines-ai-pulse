-- WEB-SEC-053: is_verified on event_checkins means the server measured it.
--
-- WHAT WAS WRONG. checkin_to_event() computes the distance from the caller's
-- GPS fix to the venue and sets is_verified when it is within 500m. But the
-- table also takes direct writes: the INSERT policy is only
-- WITH CHECK (auth.uid() = user_id), and docs/RLS_AUDIT.md lists a live
-- "Users can update their own checkins" UPDATE policy from 20250829222354. So
-- any signed-in user could skip the RPC and send
--
--     POST /rest/v1/event_checkins
--     { "event_id": "...", "user_id": "<self>", "is_verified": true,
--       "distance_from_venue_meters": 3 }
--
-- or PATCH an existing row the same way, and hold a "verified" check-in to an
-- event they never went to. No reader trusts is_verified yet (searched web,
-- iOS, Android, edge functions and SQL on 2026-11-07); this closes the hole
-- before anything that awards badges or points starts to.
--
-- THE GUARD follows guard_saved_search_calendar_token (20261102000003): a
-- BEFORE INSERT OR UPDATE trigger that, for anon/authenticated callers outside
-- checkin_to_event(), puts the four server-owned columns back:
--   INSERT  is_verified = false, distance / latitude / longitude = NULL
--   UPDATE  the OLD values, unless event_id changed, in which case the row is
--           unverified (a fix measured against one venue says nothing about
--           another)
-- It overwrites rather than raises, so a client that sends the whole row back
-- keeps working. checkin_to_event() opens the guard with a transaction-local
-- set_config, and PostgREST does not expose set_config, so a client cannot.
-- service_role and migrations (no JWT role) pass through untouched.
--
-- BACKWARD COMPATIBILITY. Writers enumerated on 2026-11-07:
--   web      src/hooks/useEventSocial.ts inserts { event_id, user_id } only;
--            the row it gets is the row it got before (is_verified defaults to
--            false, the other three default to NULL).
--   iOS      no reference to event_checkins or checkin_to_event under ios/.
--   Android  none under android/.
--   edge     _shared/userDataTables.ts (export/erasure) runs as service_role.
-- checkin_to_event() keeps its signature, grants and return shape. Its body
-- changes in two places: it opens the guard, and the acos() argument is
-- clamped to [-1, 1], because float rounding can push it to 1.0000001 for a
-- caller standing on the venue's own coordinates and acos() then raises
-- "input is out of range" - the one caller most entitled to a verified
-- check-in got an error instead.

CREATE OR REPLACE FUNCTION public.guard_event_checkin_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF current_setting('app.event_checkin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    NEW.is_verified := false;
    NEW.distance_from_venue_meters := NULL;
    NEW.checkin_latitude := NULL;
    NEW.checkin_longitude := NULL;
  ELSE
    NEW.is_verified := OLD.is_verified;
    NEW.distance_from_venue_meters := OLD.distance_from_venue_meters;
    NEW.checkin_latitude := OLD.checkin_latitude;
    NEW.checkin_longitude := OLD.checkin_longitude;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_event_checkin_verification ON public.event_checkins;
CREATE TRIGGER trg_guard_event_checkin_verification
  BEFORE INSERT OR UPDATE ON public.event_checkins
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_checkin_verification();

CREATE OR REPLACE FUNCTION public.checkin_to_event(
  p_event_id UUID,
  p_latitude REAL,
  p_longitude REAL,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_event RECORD;
  v_distance_meters INTEGER;
  v_is_verified BOOLEAN;
  v_checkin_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT latitude, longitude INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
    v_distance_meters := (
      6371000 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(p_latitude)) * cos(radians(v_event.latitude)) *
          cos(radians(v_event.longitude) - radians(p_longitude)) +
          sin(radians(p_latitude)) * sin(radians(v_event.latitude))
        ))
      )
    )::INTEGER;

    -- Within 500m (0.3 miles) of the venue.
    v_is_verified := v_distance_meters <= 500;
  ELSE
    v_distance_meters := NULL;
    v_is_verified := FALSE; -- Can't verify without venue coordinates
  END IF;

  PERFORM set_config('app.event_checkin', 'on', true);

  INSERT INTO public.event_checkins (
    event_id,
    user_id,
    checkin_latitude,
    checkin_longitude,
    distance_from_venue_meters,
    is_verified,
    checkin_message
  )
  VALUES (
    p_event_id,
    v_user_id,
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_is_verified,
    p_message
  )
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET
    checkin_latitude = EXCLUDED.checkin_latitude,
    checkin_longitude = EXCLUDED.checkin_longitude,
    distance_from_venue_meters = EXCLUDED.distance_from_venue_meters,
    is_verified = EXCLUDED.is_verified,
    checkin_message = EXCLUDED.checkin_message,
    created_at = NOW()
  RETURNING id INTO v_checkin_id;

  PERFORM set_config('app.event_checkin', 'off', true);

  INSERT INTO public.activity_feed (user_id, activity_type, event_id, metadata)
  VALUES (
    v_user_id,
    'event_checkin',
    p_event_id,
    jsonb_build_object('is_verified', v_is_verified)
  );

  RETURN jsonb_build_object(
    'checkin_id', v_checkin_id,
    'is_verified', v_is_verified,
    'distance_meters', v_distance_meters
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_to_event(UUID, REAL, REAL, TEXT) TO authenticated;
