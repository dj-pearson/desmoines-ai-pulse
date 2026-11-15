-- AOS-PROSPECT-009 slice 1: a signed-out, one-click opt-out for B2B outreach.
--
-- outreach-sequencer and agent-outreach render the marketing footer with
-- preferencesPath '/unsubscribe' and no token, so a prospect who clicks the
-- opt-out lands on "This unsubscribe link is invalid or has expired", and the
-- List-Unsubscribe header is mailto only. A prospect has no account, so the
-- signed-in preferences page is no answer, and the newsletter token does not
-- apply (they never joined the newsletter).
--
-- So each crm_leads row gets a token of its own. Its own table, not a
-- crm_leads column: crm_leads is readable by sales staff through RLS, and a
-- token in hand unsubscribes that prospect. RLS is on with no policy, so only
-- SECURITY DEFINER functions and the service role see the rows.
--
--   ensure_outreach_unsubscribe_token(lead_id)  service_role only. Returns the
--     lead's token, minting it on first use. The sequencer calls this before a
--     send (slice 2); nothing is backfilled for leads never mailed.
--   outreach_unsubscribe_by_token(token)  anon + authenticated, for the
--     email-unsubscribe edge function (anon key) and the /unsubscribe page.
--     Writes an outreach_suppression row for the lead's address, which
--     outreach-sequencer's suppressed() checks before every step, and sets
--     outreach_stopped on every lead with that address, which drops them from
--     the sequencer's work list. Same return shape as
--     newsletter_unsubscribe_by_token.
--
-- It deliberately does NOT write email_suppressions. That row stops every
-- marketing send, including a newsletter the same person opted into on their
-- own; the outreach footer offers to stop outreach, and that is what it does.
--
-- Additive only: a new table and two new functions.

CREATE TABLE IF NOT EXISTS public.outreach_unsubscribe_tokens (
  lead_id    uuid PRIMARY KEY REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE
             DEFAULT encode(extensions.gen_random_bytes(24), 'hex')
             CHECK (token ~ '^[0-9a-f]{48}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outreach_unsubscribe_tokens IS
  'AOS-PROSPECT-009: per-lead one-click outreach opt-out token. No RLS policy on purpose: read through the SECURITY DEFINER functions only.';

ALTER TABLE public.outreach_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outreach_unsubscribe_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.outreach_unsubscribe_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_outreach_unsubscribe_token(p_lead_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token text;
BEGIN
  IF p_lead_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.outreach_unsubscribe_tokens (lead_id)
  SELECT l.id FROM public.crm_leads l WHERE l.id = p_lead_id
  ON CONFLICT (lead_id) DO NOTHING;

  SELECT t.token INTO v_token
  FROM public.outreach_unsubscribe_tokens t
  WHERE t.lead_id = p_lead_id;

  RETURN v_token;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_outreach_unsubscribe_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_outreach_unsubscribe_token(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.outreach_unsubscribe_by_token(p_token text)
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

  SELECT lower(trim(l.contact_email)) INTO v_email
  FROM public.outreach_unsubscribe_tokens t
  JOIN public.crm_leads l ON l.id = t.lead_id
  WHERE t.token = p_token;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  -- The sequencer matches suppression by exact email (or domain), and stores
  -- contact_email as entered, so compare lowercased here and store lowercased.
  SELECT EXISTS (
    SELECT 1 FROM public.outreach_suppression s WHERE lower(s.email) = v_email
  ) INTO v_already;

  IF NOT v_already THEN
    INSERT INTO public.outreach_suppression (email, reason)
    VALUES (v_email, 'unsubscribe_link');
  END IF;

  UPDATE public.crm_leads
  SET outreach_stopped = true,
      updated_at = now()
  WHERE lower(trim(contact_email)) = v_email
    AND outreach_stopped = false;

  RETURN QUERY SELECT true, v_already;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.outreach_unsubscribe_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outreach_unsubscribe_by_token(text) TO anon, authenticated, service_role;
