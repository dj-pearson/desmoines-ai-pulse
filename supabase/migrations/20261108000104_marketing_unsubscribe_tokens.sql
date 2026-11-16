-- WEB-ADS-035 slice 2: a one-click marketing unsubscribe for account holders
-- who have no newsletter row.
--
-- sendNurtureEmail (slice 1) looks up newsletter_subscribers.unsubscribe_token
-- by address, so a newsletter subscriber's onboarding, win-back and digest
-- mail carries a working one-click link. A member who never joined the
-- newsletter has no such token: their footer links to /profile?tab=settings
-- behind a sign-in and the List-Unsubscribe header is mailto only. Creating a
-- newsletter row to get a token would sign them up to the newsletter without
-- the double opt-in, so they get a token of their own, keyed by user.
--
-- Its own table, not a profiles column: profiles is readable by other users
-- for public display, and anyone who could read a token could unsubscribe
-- that member. RLS is on with no policy, so only SECURITY DEFINER functions
-- and the service role see the rows.
--
--   ensure_marketing_unsubscribe_token(user_id)  service_role only. Returns the
--     member's token, creating it on first use. Senders call this; nothing is
--     backfilled for members who are never mailed.
--   marketing_unsubscribe_by_token(token)  anon + authenticated, for the
--     email-unsubscribe edge function (anon key) and the /unsubscribe page.
--     Writes the 'unsubscribe' row to email_suppressions, the same row
--     newsletter_unsubscribe_by_token writes and sendEmail applies to every
--     marketing send. ON CONFLICT DO NOTHING keeps an existing bounce,
--     complaint or manual row as it is. A newsletter row for the same address
--     is marked unsubscribed too, so /admin does not show them as active.
--     Same return shape as newsletter_unsubscribe_by_token.
--
-- Additive only: a new table and two new functions. Re-subscribing through
-- the newsletter's double opt-in lifts the 'unsubscribe' row
-- (20261108000037), as it does for a newsletter unsubscribe.

CREATE TABLE IF NOT EXISTS public.marketing_unsubscribe_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE
             DEFAULT encode(extensions.gen_random_bytes(24), 'hex')
             CHECK (token ~ '^[0-9a-f]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.marketing_unsubscribe_tokens IS
  'WEB-ADS-035: per-account one-click marketing unsubscribe token for members with no newsletter row. No RLS policy on purpose: read through the SECURITY DEFINER functions only.';

ALTER TABLE public.marketing_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_unsubscribe_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_unsubscribe_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_marketing_unsubscribe_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.marketing_unsubscribe_tokens (user_id)
  SELECT u.id FROM auth.users u WHERE u.id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;

  SELECT t.token INTO v_token
  FROM public.marketing_unsubscribe_tokens t
  WHERE t.user_id = p_user_id;

  RETURN v_token;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_marketing_unsubscribe_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_marketing_unsubscribe_token(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.marketing_unsubscribe_by_token(p_token text)
RETURNS TABLE(success boolean, already_unsubscribed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email text;
  v_already boolean;
BEGIN
  -- Same shape check as newsletter_unsubscribe_by_token: 48 lowercase hex.
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM public.marketing_unsubscribe_tokens t
  JOIN auth.users u ON u.id = t.user_id
  WHERE t.token = p_token;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  -- Any existing row already stops marketing mail to this address.
  SELECT EXISTS (
    SELECT 1 FROM public.email_suppressions s WHERE s.email = v_email
  ) INTO v_already;

  INSERT INTO public.email_suppressions (email, reason, source)
  VALUES (v_email, 'unsubscribe', 'account_unsubscribe_token')
  ON CONFLICT (email) DO NOTHING;

  UPDATE public.newsletter_subscribers
  SET status = 'unsubscribed',
      unsubscribed_at = now(),
      updated_at = now()
  WHERE lower(email) = v_email
    AND status IN ('active', 'pending');

  RETURN QUERY SELECT true, v_already;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.marketing_unsubscribe_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketing_unsubscribe_by_token(text) TO anon, authenticated, service_role;
