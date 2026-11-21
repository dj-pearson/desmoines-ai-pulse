-- WEB-ADS-048: a verified owner can set weekly hours, say the place has closed
-- or reopened, and upload a photo, and every owner edit is recorded with its
-- before and after values.
--
-- Before this the owner whitelist was description, website, phone, image_url
-- and menu_url. Hours were deferred until hours_json existed; it does now. The
-- image was any https link the browser accepted, and the only history was
-- restaurant_changes (WEB-BE-075), which keeps description and hours_json as
-- {"changed": true} and does not cover attractions or venues.
--
-- Additive only:
--   restaurant_lockable_fields()  two more names: hours_json, business_status.
--                                 bulk-update-restaurants drops any key the
--                                 row's map names, so an owner's hours and an
--                                 owner's open/closed answer survive the Places
--                                 refresh. hours_checked_at is never locked, so
--                                 the refresh still records that it asked.
--   restaurant_closure_reviews    reason CHECK widened by one value,
--                                 'owner_report' (latest CHECK: 20261121000120).
--   listing_owner_edits           new table: one row per owner write, full old
--                                 and new values. Admins read all; an owner
--                                 reads their own. Written only by the two
--                                 functions below.
--   owner_hours_json(jsonb)       validates an owner's weekly periods and
--                                 builds the stored hours object.
--   owner_photo_is_stored(text, uuid)
--                                 true only for a public URL of an object the
--                                 caller uploaded to the media bucket under
--                                 <uid>/listing-photos/, typed jpeg/png/webp,
--                                 5 MB or less.
--   update_claimed_listing        redefined from 20261121000070 with the same
--                                 signature, return type and refusals. Adds
--                                 hours_json to the restaurant list, refuses a
--                                 new image_url that is not an uploaded photo,
--                                 and writes listing_owner_edits.
--   report_owner_listing_status   new: temporarily_closed, closed_permanently,
--                                 reopened.
--   resolve_closure_review        redefined from 20261121000030 with the same
--                                 signature: an open owner_report keeps the
--                                 hold, and dismissing the last one clears the
--                                 'owner_closed' hold.
--
-- No paid-placement or rating column is added to any owner list: is_featured,
-- is_sponsored, sponsored_until, rating, popularity_score, status and
-- promotion_hold_reason stay out, and an unknown key is still refused by name.
-- The mobile apps do not call any of these functions.

-- ---------------------------------------------------------------------------
-- Lockable fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restaurant_lockable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['description', 'website', 'phone', 'image_url', 'menu_url', 'cuisine', 'location', 'rating',
               'hours_json', 'business_status']::text[];
$$;

-- ---------------------------------------------------------------------------
-- Closure queue: the owner's own report
-- ---------------------------------------------------------------------------

ALTER TABLE public.restaurant_closure_reviews DROP CONSTRAINT IF EXISTS restaurant_closure_reviews_reason_check;
ALTER TABLE public.restaurant_closure_reviews ADD CONSTRAINT restaurant_closure_reviews_reason_check
  CHECK (reason IN ('place_not_found', 'no_place_match', 'visitor_report', 'opening_unconfirmed', 'owner_report'));

-- ---------------------------------------------------------------------------
-- Owner edit history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.listing_owner_edits (
  id bigserial PRIMARY KEY,
  listing_type text NOT NULL,
  listing_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_owner_edits_listing_recent
  ON public.listing_owner_edits (listing_type, listing_id, created_at DESC);

ALTER TABLE public.listing_owner_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and the owner read owner edits" ON public.listing_owner_edits;
CREATE POLICY "Admins and the owner read owner edits"
  ON public.listing_owner_edits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
-- No write policy: rows come only from the SECURITY DEFINER functions below.

COMMENT ON TABLE public.listing_owner_edits IS
  'WEB-ADS-048: every write a verified owner makes to a listing, with the old and new value of each field it touched.';

-- ---------------------------------------------------------------------------
-- Owner hours
-- ---------------------------------------------------------------------------

-- Input: {"periods": [{"open": {"day", "hour", "minute"}, "close": {...}}, ...]}
-- in the Places shape (day 0 = Sunday). Every period needs a close; it closes
-- later the same day or, for a late night, on the next day, at most 24 hours
-- after it opened. Periods may not overlap. 1 to 28 periods.
--
-- Output: the stored shape (_shared/placeHours.ts) with source 'owner', the
-- periods sorted, and weekdayDescriptions built here from them, Monday first
-- as Google writes them, so the text a visitor reads cannot disagree with the
-- periods "open now" is computed from. setAt replaces fetchedAt on purpose:
-- fetchedAt is read as "when Google was last asked" (the restaurant page's
-- provenance line, and the promotion check's fallback), and an owner's save
-- is not a Google check.
CREATE OR REPLACE FUNCTION public.owner_hours_json(p_hours jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_periods jsonb;
  v_p jsonb;
  v_pt jsonb;
  v_side text;
  v_rows jsonb := '[]'::jsonb;
  v_out jsonb;
  v_desc jsonb := '[]'::jsonb;
  v_day int;
  v_line text;
  v_start int;
  v_end int;
  v_od int; v_oh int; v_om int; v_cd int; v_ch int; v_cm int;
  v_prev_end int;
  v_first_start int;
  r record;
  v_names constant text[] := ARRAY['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
BEGIN
  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'object' OR jsonb_typeof(p_hours -> 'periods') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'hours must be an object with a periods list' USING ERRCODE = '22023';
  END IF;
  v_periods := p_hours -> 'periods';
  IF jsonb_array_length(v_periods) = 0 THEN
    RAISE EXCEPTION 'add at least one opening time, or report the place closed instead' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_periods) > 28 THEN
    RAISE EXCEPTION 'at most four opening times a day' USING ERRCODE = '22023';
  END IF;

  FOR v_p IN SELECT value FROM jsonb_array_elements(v_periods) LOOP
    FOREACH v_side IN ARRAY ARRAY['open', 'close'] LOOP
      v_pt := v_p -> v_side;
      IF v_pt IS NULL OR jsonb_typeof(v_pt) <> 'object'
         OR jsonb_typeof(v_pt -> 'day') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_pt -> 'hour') IS DISTINCT FROM 'number'
         OR jsonb_typeof(coalesce(v_pt -> 'minute', '0'::jsonb)) <> 'number' THEN
        RAISE EXCEPTION 'every opening time needs an open and a close time' USING ERRCODE = '22023';
      END IF;
      IF (v_pt ->> 'day')::numeric NOT IN (0, 1, 2, 3, 4, 5, 6)
         OR (v_pt ->> 'hour')::numeric <> trunc((v_pt ->> 'hour')::numeric)
         OR (v_pt ->> 'hour')::numeric NOT BETWEEN 0 AND 23
         OR coalesce((v_pt ->> 'minute')::numeric, 0) <> trunc(coalesce((v_pt ->> 'minute')::numeric, 0))
         OR coalesce((v_pt ->> 'minute')::numeric, 0) NOT BETWEEN 0 AND 59 THEN
        RAISE EXCEPTION 'an opening time is not a real day and time' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_od := (v_p #>> '{open,day}')::int;
    v_oh := (v_p #>> '{open,hour}')::int;
    v_om := coalesce((v_p #>> '{open,minute}')::int, 0);
    v_cd := (v_p #>> '{close,day}')::int;
    v_ch := (v_p #>> '{close,hour}')::int;
    v_cm := coalesce((v_p #>> '{close,minute}')::int, 0);

    -- Minutes from Sunday 00:00. A late night runs past the day's end.
    v_start := v_od * 1440 + v_oh * 60 + v_om;
    IF v_cd = v_od AND v_ch * 60 + v_cm > v_oh * 60 + v_om THEN
      v_end := v_od * 1440 + v_ch * 60 + v_cm;
    ELSIF v_cd = (v_od + 1) % 7 AND v_ch * 60 + v_cm <= v_oh * 60 + v_om THEN
      v_end := v_start + (1440 - (v_oh * 60 + v_om)) + v_ch * 60 + v_cm;
    ELSE
      RAISE EXCEPTION 'a closing time must come after its opening time, at most a day later' USING ERRCODE = '22023';
    END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'od', v_od, 'oh', v_oh, 'om', v_om, 'cd', v_cd, 'ch', v_ch, 'cm', v_cm, 's', v_start, 'e', v_end));
  END LOOP;

  -- Overlap, on a week that wraps from Saturday night into Sunday.
  FOR r IN SELECT (x ->> 's')::int AS s, (x ->> 'e')::int AS e
             FROM jsonb_array_elements(v_rows) x ORDER BY 1 LOOP
    IF v_prev_end IS NOT NULL AND r.s < v_prev_end THEN
      RAISE EXCEPTION 'two opening times overlap' USING ERRCODE = '22023';
    END IF;
    IF v_first_start IS NULL THEN v_first_start := r.s; END IF;
    v_prev_end := r.e;
  END LOOP;
  IF v_prev_end - 10080 > v_first_start THEN
    RAISE EXCEPTION 'two opening times overlap' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'open', jsonb_build_object('day', (x ->> 'od')::int, 'hour', (x ->> 'oh')::int, 'minute', (x ->> 'om')::int),
           'close', jsonb_build_object('day', (x ->> 'cd')::int, 'hour', (x ->> 'ch')::int, 'minute', (x ->> 'cm')::int)
         ) ORDER BY (x ->> 's')::int)
    INTO v_out
    FROM jsonb_array_elements(v_rows) x;

  FOREACH v_day IN ARRAY ARRAY[1, 2, 3, 4, 5, 6, 0] LOOP
    SELECT string_agg(
             to_char(make_timestamp(2000, 1, 1, (x ->> 'oh')::int, (x ->> 'om')::int, 0), 'FMHH12:MI AM') || ' - ' ||
             to_char(make_timestamp(2000, 1, 1, (x ->> 'ch')::int, (x ->> 'cm')::int, 0), 'FMHH12:MI AM'),
             ', ' ORDER BY (x ->> 's')::int)
      INTO v_line
      FROM jsonb_array_elements(v_rows) x
     WHERE (x ->> 'od')::int = v_day;
    v_desc := v_desc || to_jsonb(v_names[v_day + 1] || ': ' || coalesce(v_line, 'Closed'));
  END LOOP;

  RETURN jsonb_build_object(
    'version', 1,
    'timeZone', 'America/Chicago',
    'periods', v_out,
    'weekdayDescriptions', v_desc,
    'source', 'owner',
    'setAt', to_jsonb(now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_hours_json(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_hours_json(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Owner photos
-- ---------------------------------------------------------------------------

-- The media bucket is public, admits jpeg/png/webp/avif/gif up to 10 MB, and
-- lets a signed-in user write only under their own id (20261101000003). The
-- owner form uploads to <uid>/listing-photos/<listing id>/<time>.<ext> and
-- checks type and size first; this repeats both checks against what storage
-- actually holds, so a hand-made call cannot point a listing at somebody
-- else's file, at a file that was never uploaded, or at an outside host.
CREATE OR REPLACE FUNCTION public.owner_photo_is_stored(p_url text, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text;
BEGIN
  IF p_url IS NULL OR p_user IS NULL THEN
    RETURN false;
  END IF;
  v_path := substring(p_url FROM '^https://[^/?#]+/storage/v1/object/public/media/([^?#]+)$');
  IF v_path IS NULL OR position('..' IN v_path) > 0 OR position('%' IN v_path) > 0 THEN
    RETURN false;
  END IF;
  IF split_part(v_path, '/', 1) <> p_user::text OR split_part(v_path, '/', 2) <> 'listing-photos' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = 'media'
       AND o.name = v_path
       AND lower(coalesce(o.metadata ->> 'mimetype', '')) IN ('image/jpeg', 'image/png', 'image/webp')
       AND coalesce((o.metadata ->> 'size')::bigint, 0) BETWEEN 1 AND 5242880
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_photo_is_stored(text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_claimed_listing
-- ---------------------------------------------------------------------------

-- From 20261121000070. Same signature, return type, verified-claim check and
-- "not an owner-editable field" refusal. Changes:
--   restaurants also take hours_json, rebuilt by owner_hours_json (so the
--   stored object is never the caller's own JSON) and locked like any other
--   field. hours_json = null clears the owner's hours AND their lock, so the
--   next Places refresh fills them from Google again.
--   a non-null image_url must pass owner_photo_is_stored.
--   writing owner hours over Google's keeps the last Google check: when
--   hours_checked_at is empty it takes the old hours' fetchedAt.
--   one listing_owner_edits row per successful write.
CREATE OR REPLACE FUNCTION public.update_claimed_listing(
  p_listing_type text,
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowed text[];
  v_key text;
  v_sets text[] := '{}';
  v_table text;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_locks jsonb := '{}'::jsonb;
  v_unlock text[] := '{}';
  v_lock jsonb := jsonb_build_object('by', 'owner', 'at', to_jsonb(now()));
  v_before jsonb;
  v_after jsonb;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'update_claimed_listing: sign in first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_claims
     WHERE listing_type = p_listing_type
       AND listing_id = p_listing_id
       AND user_id = v_user
       AND status = 'verified'
  ) THEN
    RAISE EXCEPTION 'update_claimed_listing: you have not verified this listing';
  END IF;

  IF p_listing_type = 'restaurant' THEN
    v_table := 'public.restaurants';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url', 'menu_url', 'hours_json'];
  ELSIF p_listing_type = 'attraction' THEN
    v_table := 'public.attractions';
    v_allowed := ARRAY['description', 'website', 'phone', 'image_url'];
  ELSIF p_listing_type = 'venue' THEN
    v_table := 'public.known_venues';
    v_allowed := ARRAY['website', 'phone'];
  ELSE
    RAISE EXCEPTION 'update_claimed_listing: % is not a listing type', p_listing_type;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    -- REFUSE rather than ignore. Silently dropping a field an owner filled in
    -- is how somebody spends ten minutes correcting their hours and never finds
    -- out the form threw them away.
    IF NOT (v_key = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'update_claimed_listing: % is not an owner-editable field on a %', v_key, p_listing_type;
    END IF;

    IF v_key = 'hours_json' THEN
      IF jsonb_typeof(v_patch -> 'hours_json') = 'null' THEN
        v_unlock := v_unlock || 'hours_json'::text;
        v_sets := v_sets || 'hours_json = NULL'::text;
        CONTINUE;
      END IF;
      v_patch := jsonb_set(v_patch, '{hours_json}', public.owner_hours_json(v_patch -> 'hours_json'));
      v_sets := v_sets || 'hours_json = ($1 -> ''hours_json'')'::text;
      -- An empty hours_checked_at falls back to the old hours' fetchedAt in
      -- every reader; keep that check now that fetchedAt is going away.
      v_sets := v_sets || $s$hours_checked_at = coalesce(hours_checked_at, CASE WHEN hours_json ->> 'fetchedAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (hours_json ->> 'fetchedAt')::timestamptz END)$s$::text;
      v_locks := v_locks || jsonb_build_object(v_key, v_lock);
      CONTINUE;
    END IF;

    IF v_key = 'image_url' AND jsonb_typeof(v_patch -> 'image_url') <> 'null'
       AND NOT public.owner_photo_is_stored(v_patch ->> 'image_url', v_user) THEN
      RAISE EXCEPTION 'update_claimed_listing: upload the photo from your account instead of linking to one';
    END IF;

    -- quote_ident on the key, and the VALUE goes through a parameter below.
    v_sets := v_sets || format('%I = ($1 ->> %L)', v_key, v_key);
    IF v_key = ANY(public.restaurant_lockable_fields()) THEN
      v_locks := v_locks || jsonb_build_object(v_key, v_lock);
    END IF;
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN false;
  END IF;

  -- WEB-BE-069. Only restaurants carry locked_fields; attractions and venues
  -- have no enrichment that overwrites owner edits.
  IF p_listing_type = 'restaurant' AND (v_locks <> '{}'::jsonb OR array_length(v_unlock, 1) IS NOT NULL) THEN
    v_sets := v_sets || 'locked_fields = nullif((coalesce(locked_fields, ''{}''::jsonb) || $3) - $4, ''{}''::jsonb)'::text;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id = $1', v_table) INTO v_before USING p_listing_id;

  EXECUTE format(
    'UPDATE %s SET %s, updated_at = now() WHERE id = $2',
    v_table,
    array_to_string(v_sets, ', ')
  ) USING v_patch, p_listing_id, v_locks, v_unlock;

  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id = $1', v_table) INTO v_after USING p_listing_id;

  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    v_old := v_old || jsonb_build_object(v_key, coalesce(v_before -> v_key, 'null'::jsonb));
    v_new := v_new || jsonb_build_object(v_key, coalesce(v_after -> v_key, 'null'::jsonb));
  END LOOP;

  INSERT INTO public.listing_owner_edits (listing_type, listing_id, user_id, action, old_values, new_values)
  VALUES (p_listing_type, p_listing_id, v_user, 'edit', v_old, v_new);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_claimed_listing(text, uuid, jsonb) IS
  'Owner edits to a claimed listing, restricted to a fixed column list (WEB-ADS-009 AC4). Restaurants also take structured hours; a photo must be one the owner uploaded; every write is recorded in listing_owner_edits (WEB-ADS-048). A restaurant edit locks each field it set against Google enrichment (WEB-BE-069).';

-- ---------------------------------------------------------------------------
-- report_owner_listing_status
-- ---------------------------------------------------------------------------

-- A verified restaurant owner says what state the place is in.
--   temporarily_closed  business_status = CLOSED_TEMPORARILY, locked, so the
--                       listing is labelled and leaves promotion
--                       (isRestaurantPromotable needs OPERATIONAL) and the
--                       Places refresh does not undo it.
--   closed_permanently  an owner_report finding in the closure queue and
--                       promotion_hold_reason = 'owner_closed' at once. The
--                       listing is not closed here: an admin approves it in
--                       the queue, as for every other closure finding, so a
--                       mistaken tap or a hijacked account cannot take a
--                       listing down on its own.
--   reopened            business_status = OPERATIONAL, locked; any open
--                       owner_report is withdrawn and the 'owner_closed'
--                       hold lifted. Refused when the listing is already
--                       marked closed for good (status = 'closed'): that was
--                       a person's decision and goes back through us.
CREATE OR REPLACE FUNCTION public.report_owner_listing_status(
  p_listing_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_lock jsonb := jsonb_build_object('business_status', jsonb_build_object('by', 'owner', 'at', to_jsonb(now())));
  v_row record;
  v_after record;
  v_result text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'report_owner_listing_status: sign in first';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('temporarily_closed', 'closed_permanently', 'reopened') THEN
    RAISE EXCEPTION 'report_owner_listing_status: % is not a status you can report', coalesce(p_status, 'nothing')
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_claims
     WHERE listing_type = 'restaurant'
       AND listing_id = p_listing_id
       AND user_id = v_user
       AND status = 'verified'
  ) THEN
    RAISE EXCEPTION 'report_owner_listing_status: you have not verified this listing';
  END IF;

  SELECT status, business_status, promotion_hold_reason INTO v_row
    FROM public.restaurants WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_owner_listing_status: this listing no longer exists' USING ERRCODE = '22023';
  END IF;

  IF p_status IN ('temporarily_closed', 'reopened') AND v_row.status = 'closed' THEN
    RAISE EXCEPTION 'report_owner_listing_status: this listing is marked closed for good. Email us to reopen it'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'temporarily_closed' THEN
    UPDATE public.restaurants
       SET business_status = 'CLOSED_TEMPORARILY',
           locked_fields = coalesce(locked_fields, '{}'::jsonb) || v_lock,
           updated_at = now()
     WHERE id = p_listing_id;
    v_result := 'temporarily_closed';
  ELSIF p_status = 'closed_permanently' THEN
    INSERT INTO public.restaurant_closure_reviews (restaurant_id, reason, source, details)
    VALUES (p_listing_id, 'owner_report', 'owner',
            jsonb_strip_nulls(jsonb_build_object('kind', 'closed_permanently', 'note', v_note)))
    ON CONFLICT DO NOTHING;
    UPDATE public.restaurants SET promotion_hold_reason = 'owner_closed'
     WHERE id = p_listing_id AND promotion_hold_reason IS NULL;
    v_result := 'queued';
  ELSE
    UPDATE public.restaurants
       SET business_status = 'OPERATIONAL',
           locked_fields = coalesce(locked_fields, '{}'::jsonb) || v_lock,
           promotion_hold_reason = CASE WHEN promotion_hold_reason = 'owner_closed' THEN NULL ELSE promotion_hold_reason END,
           updated_at = now()
     WHERE id = p_listing_id;
    UPDATE public.restaurant_closure_reviews
       SET resolved_at = now(), resolved_by = v_user,
           resolution = 'withdrawn: the owner says it reopened'
     WHERE restaurant_id = p_listing_id AND reason = 'owner_report' AND resolved_at IS NULL;
    v_result := 'reopened';
  END IF;

  SELECT business_status, promotion_hold_reason INTO v_after FROM public.restaurants WHERE id = p_listing_id;

  INSERT INTO public.listing_owner_edits (listing_type, listing_id, user_id, action, old_values, new_values)
  VALUES (
    'restaurant', p_listing_id, v_user, 'status:' || p_status,
    jsonb_build_object('business_status', v_row.business_status, 'promotion_hold_reason', v_row.promotion_hold_reason),
    jsonb_strip_nulls(jsonb_build_object('business_status', v_after.business_status,
                                         'promotion_hold_reason', v_after.promotion_hold_reason,
                                         'note', v_note))
  );

  RETURN jsonb_build_object('result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.report_owner_listing_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_owner_listing_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- resolve_closure_review
-- ---------------------------------------------------------------------------

-- From 20261121000030, same signature and decisions. The dismiss branch now
-- counts an open owner_report as a reason to keep the hold, and clears the
-- 'owner_closed' hold with the others.
CREATE OR REPLACE FUNCTION public.resolve_closure_review(p_review_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.restaurant_closure_reviews%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_still_hold boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'dismiss') THEN
    RAISE EXCEPTION 'Decision must be approve or dismiss' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_review FROM public.restaurant_closure_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown review' USING ERRCODE = '22023';
  END IF;
  IF v_review.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already resolved' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approve' THEN
    UPDATE public.restaurants SET status = 'closed' WHERE id = v_review.restaurant_id;
    UPDATE public.restaurant_closure_reviews
       SET resolved_at = now(), resolved_by = auth.uid(),
           resolution = 'approved' || coalesce(': ' || v_note, '')
     WHERE restaurant_id = v_review.restaurant_id AND resolved_at IS NULL;
    RETURN jsonb_build_object('resolved', 'approved');
  END IF;

  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Say why the finding is dismissed' USING ERRCODE = '22023';
  END IF;
  UPDATE public.restaurant_closure_reviews
     SET resolved_at = now(), resolved_by = auth.uid(), resolution = 'dismissed: ' || v_note
   WHERE id = p_review_id;

  SELECT EXISTS (
           SELECT 1 FROM public.restaurant_closure_reviews
            WHERE restaurant_id = v_review.restaurant_id AND resolved_at IS NULL
              AND reason IN ('place_not_found', 'owner_report')
         )
      OR (SELECT count(*) FROM public.restaurant_closure_reviews
           WHERE restaurant_id = v_review.restaurant_id AND resolved_at IS NULL AND reason = 'visitor_report') >= 3
    INTO v_still_hold;
  IF NOT v_still_hold THEN
    UPDATE public.restaurants SET promotion_hold_reason = NULL
     WHERE id = v_review.restaurant_id AND promotion_hold_reason IN ('place_not_found', 'visitor_reports', 'owner_closed');
  END IF;
  RETURN jsonb_build_object('resolved', 'dismissed');
END
$$;

REVOKE ALL ON FUNCTION public.resolve_closure_review(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_closure_review(uuid, text, text) TO authenticated;
