-- IOS-DD-GUIDES-14: anonymous deal claims no longer move the public count,
-- and a deal outside its date window cannot be claimed.
--
-- 20260902000013 bucketed anonymous claims by a salted hash of
-- cf-connecting-ip / x-forwarded-for and user-agent. Every one of those is a
-- header the caller sets whenever the edge in front of PostgREST does not
-- overwrite it (a self-hosted Kong does not strip x-forwarded-for, and nobody
-- controls user-agent but the client), so rotating a header per request
-- produced a new bucket and a new row each time: the redemption_count on every
-- deal card was still loopable from the anon key. The existence check also
-- ignored the date window, so expired and not-yet-started deals could be
-- claimed.
--
-- Now:
--   * the deal must exist and be inside its window (the same predicate as the
--     public SELECT policy in 20260228000001), else NULL, as for an unknown id;
--   * an anonymous caller records nothing and gets the current count back;
--   * a signed-in caller inserts (deal_id, user_id) ON CONFLICT DO NOTHING and
--     the count is recomputed, exactly as before.
--
-- Same name, same parameter name (deal_id, sent by name from iOS and
-- Android), same return type, same grants. Existing anonymous rows are left
-- in place: deleting them would change a number already on screen, which is
-- a content change a security migration should not make.

CREATE OR REPLACE FUNCTION public.increment_deal_redemption(deal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = increment_deal_redemption.deal_id
      AND d.start_date <= now()
      AND (d.end_date IS NULL OR d.end_date >= now())
  ) THEN
    RETURN NULL;
  END IF;

  IF v_user IS NULL THEN
    SELECT count(*) INTO v_count
    FROM public.deal_redemptions r
    WHERE r.deal_id = increment_deal_redemption.deal_id;
    RETURN v_count;
  END IF;

  INSERT INTO public.deal_redemptions (deal_id, user_id, session_hash)
  VALUES (increment_deal_redemption.deal_id, v_user, NULL)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_count
  FROM public.deal_redemptions r
  WHERE r.deal_id = increment_deal_redemption.deal_id;

  UPDATE public.deals
     SET redemption_count = v_count
   WHERE id = increment_deal_redemption.deal_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_deal_redemption(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.increment_deal_redemption(uuid) IS
  'Records one claim per signed-in account for a deal inside its date window and '
  'returns the derived count. Anonymous calls record nothing. WEB-SEC-033, IOS-DD-GUIDES-14.';
