-- WEB-FEAT-102: visitors can report that a restaurant has closed, and admins
-- decide on every closure finding in one queue.
--
-- The only signal that a listing was dead came from a comment on a social
-- post. Additive only: two functions and one column on
-- restaurant_closure_reviews (20261121000010).
--
-- report_restaurant_closed(p_restaurant_id, p_note)  anon + authenticated
--   Inserts a visitor_report finding. Never changes the listing. Validated:
--   the restaurant must exist and not be merged; the note is trimmed and
--   capped at 500 characters. Rate limited per caller bucket (salted hash of
--   the client IP and user agent, the shape increment_deal_redemption uses):
--   one report per restaurant per day, five reports an hour across all
--   restaurants. Over the limit raises 54000 with a readable message.
--   Three or more OPEN visitor reports on one restaurant set
--   promotion_hold_reason = 'visitor_reports' (only when no other hold is
--   set), which takes it out of the nightly post and the digest
--   (isRestaurantPromotable) until an admin resolves the reports.
--
-- resolve_closure_review(p_review_id, p_decision, p_note)  admins only
--   'approve': status = 'closed' on the listing (the WEB-BE-065 trigger
--   records the admin as status_changed_by) and every open finding on that
--   restaurant resolved as approved.
--   'dismiss': this finding resolved as dismissed with the note as the
--   reason (required). If nothing left open still justifies a hold, the
--   hold is cleared.
--   Both record resolved_by = auth.uid() and resolved_at = now().
--
-- No anon write policy is added to restaurant_closure_reviews; the only way
-- in for a visitor is the function.

ALTER TABLE public.restaurant_closure_reviews ADD COLUMN IF NOT EXISTS reporter_hash text;

CREATE INDEX IF NOT EXISTS restaurant_closure_reviews_reporter_recent
  ON public.restaurant_closure_reviews (reporter_hash, created_at DESC)
  WHERE reporter_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_closure_report_salt (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  salt text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
);
INSERT INTO public.restaurant_closure_report_salt (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.restaurant_closure_report_salt ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function reads it.

CREATE OR REPLACE FUNCTION public.report_restaurant_closed(p_restaurant_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_salt text;
  v_hash text;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_open integer;
BEGIN
  IF p_restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id AND r.is_merged IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Unknown restaurant' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;
  SELECT salt INTO v_salt FROM public.restaurant_closure_report_salt WHERE id;
  v_hash := encode(
    extensions.digest(
      coalesce(v_salt, '') || '|' ||
      coalesce(v_headers ->> 'cf-connecting-ip', v_headers ->> 'x-forwarded-for', '') || '|' ||
      coalesce(v_headers ->> 'user-agent', '') || '|' ||
      coalesce(auth.uid()::text, ''),
      'sha256'
    ),
    'hex'
  );

  IF EXISTS (
    SELECT 1 FROM public.restaurant_closure_reviews
     WHERE reporter_hash = v_hash AND restaurant_id = p_restaurant_id
       AND created_at > now() - interval '1 day'
  ) THEN
    RAISE EXCEPTION 'You already reported this restaurant today' USING ERRCODE = '54000';
  END IF;
  IF (
    SELECT count(*) FROM public.restaurant_closure_reviews
     WHERE reporter_hash = v_hash AND created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'Too many reports. Try again later' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.restaurant_closure_reviews (restaurant_id, reason, source, details, reporter_hash)
  VALUES (
    p_restaurant_id,
    'visitor_report',
    CASE WHEN auth.uid() IS NULL THEN 'visitor' ELSE 'member' END,
    jsonb_strip_nulls(jsonb_build_object('note', v_note)),
    v_hash
  );

  SELECT count(*) INTO v_open FROM public.restaurant_closure_reviews
   WHERE restaurant_id = p_restaurant_id AND reason = 'visitor_report' AND resolved_at IS NULL;
  IF v_open >= 3 THEN
    UPDATE public.restaurants SET promotion_hold_reason = 'visitor_reports'
     WHERE id = p_restaurant_id AND promotion_hold_reason IS NULL;
  END IF;

  RETURN jsonb_build_object('received', true);
END
$$;

REVOKE ALL ON FUNCTION public.report_restaurant_closed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_restaurant_closed(uuid, text) TO anon, authenticated;

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
            WHERE restaurant_id = v_review.restaurant_id AND resolved_at IS NULL AND reason = 'place_not_found'
         )
      OR (SELECT count(*) FROM public.restaurant_closure_reviews
           WHERE restaurant_id = v_review.restaurant_id AND resolved_at IS NULL AND reason = 'visitor_report') >= 3
    INTO v_still_hold;
  IF NOT v_still_hold THEN
    UPDATE public.restaurants SET promotion_hold_reason = NULL
     WHERE id = v_review.restaurant_id AND promotion_hold_reason IN ('place_not_found', 'visitor_reports');
  END IF;
  RETURN jsonb_build_object('resolved', 'dismissed');
END
$$;

REVOKE ALL ON FUNCTION public.resolve_closure_review(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_closure_review(uuid, text, text) TO authenticated;
