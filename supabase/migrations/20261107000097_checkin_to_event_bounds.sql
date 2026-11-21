-- WEB-SEC-055: narrow what a forged check-in can earn.
--
-- WHAT WAS WRONG. Since WEB-SEC-053, checkin_to_event() is the only way to get
-- event_checkins.is_verified = true. But it took p_latitude / p_longitude as
-- given, with no range check, no rate limit and no check that the event is
-- happening, so one script could check in to every event in the city, past and
-- future, with each venue's own coordinates and come away "verified" at all of
-- them. A client-reported GPS fix can never be proven genuine; this only
-- bounds what a made-up one buys.
--
-- WHAT CHANGES, all inside the function body:
--   1. Coordinates must be real numbers in range: latitude in [-90, 90],
--      longitude in [-180, 180]. NULL and NaN fail too (NaN sorts above every
--      number in Postgres, so the BETWEEN rejects it). Raises
--      'Invalid coordinates' (SQLSTATE 22023) instead of storing junk.
--      It runs before the distance is computed, and that order matters: the
--      WEB-SEC-053 clamp LEAST(1.0, GREATEST(-1.0, x)) turns a NaN into 1.0,
--      so acos() gave 0 and p_latitude = 'NaN' was VERIFIED at 0 m from any
--      venue (reproduced on Postgres 16 against 20261107000090). NULL went
--      the other way, clamped to -1.0 and stored as 20,015 km.
--   2. Rate limit: at most 10 check-ins per user per rolling hour, counted as
--      rows in event_checkins whose created_at is within the hour, excluding
--      the event being checked in to (re-checking in to the same event is an
--      upsert that refreshes created_at, so it does not grow the count).
--      Raises 'Too many check-ins, try again later' (SQLSTATE 54000). A
--      per-user transaction advisory lock serialises the count and the insert,
--      so parallel calls cannot all read 9.
--   3. Time window: a check-in is only VERIFIED from 2 hours before the event
--      starts until 2 hours after it ends. Start is
--      COALESCE(event_start_utc, date); end is end_date, or start + 6 hours
--      when end_date is NULL (the frontend estimates 3 hours for schema
--      output; 6 is generous on purpose, a late arrival at a long show should
--      not be refused). When time_tbd is true the start time is a placeholder,
--      so the window is start - 12h to start + 36h, which covers the whole
--      local day whatever hour the placeholder carries. Outside the window the
--      check-in is still recorded, with distance measured, but is_verified is
--      false - the same outcome as being 600m away, so callers see no new
--      error for this case.
--
-- BACKWARD COMPATIBILITY. Signature, grants and return shape are unchanged.
-- Callers enumerated on 2026-11-07: none. No reference to checkin_to_event
-- under src/, ios/, android/ or supabase/functions/ (only the generated
-- types). The two new errors therefore reach no shipped client; the earliest
-- one that adds a check-in button must handle them.
--
-- Keeps the WEB-SEC-053 guard handshake (app.event_checkin on before the
-- insert, off after) and the clamped acos() argument.

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
  v_start TIMESTAMPTZ;
  v_window_open TIMESTAMPTZ;
  v_window_close TIMESTAMPTZ;
  v_recent INTEGER;
  v_distance_meters INTEGER;
  v_is_verified BOOLEAN;
  v_checkin_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR NOT (p_latitude BETWEEN -90 AND 90)
     OR NOT (p_longitude BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023';
  END IF;

  SELECT latitude, longitude, date, event_start_utc, end_date, time_tbd
  INTO v_event
  FROM public.events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('checkin_to_event:' || v_user_id::text));

  SELECT count(*) INTO v_recent
  FROM public.event_checkins
  WHERE user_id = v_user_id
    AND event_id <> p_event_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'Too many check-ins, try again later' USING ERRCODE = '54000';
  END IF;

  v_start := COALESCE(v_event.event_start_utc, v_event.date);
  IF COALESCE(v_event.time_tbd, false) THEN
    v_window_open := v_start - INTERVAL '12 hours';
    v_window_close := v_start + INTERVAL '36 hours';
  ELSE
    v_window_open := v_start - INTERVAL '2 hours';
    v_window_close := COALESCE(v_event.end_date, v_start + INTERVAL '6 hours') + INTERVAL '2 hours';
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

    -- Within 500m (0.3 miles) of the venue, while the event is on.
    v_is_verified := v_distance_meters <= 500
      AND v_start IS NOT NULL
      AND NOW() BETWEEN v_window_open AND v_window_close;
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
