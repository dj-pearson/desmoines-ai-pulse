-- WEB-SEC-076: unsubscribe_token and confirm_token on
-- newsletter_subscribers are no longer readable by anon or authenticated,
-- and this time the column privileges actually hold.
--
-- WHAT WAS WRONG. 20260413000002 and 20260918000002 ran
--
--     REVOKE SELECT (unsubscribe_token) ON public.newsletter_subscribers FROM anon;
--     REVOKE SELECT (confirm_token)     ON public.newsletter_subscribers FROM authenticated;
--
-- and their comments call it "do NOT expose ... via REST". Postgres checks the
-- table-level SELECT grant first, and anon and authenticated hold it (Supabase's
-- default privileges), so a column-level REVOKE under it changes nothing. RLS
-- is the only thing in the way today: anon has no SELECT policy, and
-- newsletter_subscribers_admin_select lets an admin session read
--
--     GET /rest/v1/newsletter_subscribers?select=email,unsubscribe_token,confirm_token
--
-- which is every reader's one-click unsubscribe token and every pending
-- reader's confirm link, for the whole list. Neither token is ever meant to
-- leave the server except inside an email the server sends.
--
-- THE FIX, as WEB-SEC-075 did for ad_rate_card.updated_by: revoke the
-- table-level SELECT from anon and authenticated, then grant SELECT back on
-- every column except the two tokens. Policies, UPDATE and the other grants are
-- untouched, so who can see which rows is exactly as before.
--
-- READERS enumerated on 2026-11-15:
--   web      NewsletterSubscribersManager (admin) names its columns in load()
--            and exportFilteredCsv() (id, email, first_name, source, status,
--            subscribed_at, unsubscribed_at, utm_*), all granted below. Its
--            bulk unsubscribe filters on id and status and returns id, all
--            granted; UPDATE stays a table-level grant. useNewsletterSubscription
--            and Footer go through the newsletter-subscribe edge function.
--   iOS      no reference under ios/.
--   Android  no reference under android/.
--   edge     newsletter-subscribe, send-weekly-digest, assemble-weekly-digest,
--            send-newsletter-campaign, dispatch-scheduled-newsletters,
--            agent-lifecycle, generate-proposal and ses-events use the service
--            role, which keeps the whole table. email-unsubscribe uses the anon
--            key but only calls the token RPCs.
--   SQL      newsletter_unsubscribe_by_token, newsletter_confirm_by_token,
--            marketing_unsubscribe_by_token, cancel_event_reminders_by_token and
--            disable_event_alerts_by_token are SECURITY DEFINER, so the column
--            grant does not reach them. The activation guard trigger reads only
--            NEW/OLD, which needs no column privilege.
--
-- TRAP FOR THE NEXT COLUMN: a column added to newsletter_subscribers after this
-- is NOT readable by anon or authenticated until it is added to the GRANT
-- below, and an admin query that names it gets 42501. Grant it in the same
-- migration (unless it is another secret).
--
-- Re-running is a no-op: REVOKE and GRANT are idempotent.

REVOKE SELECT ON public.newsletter_subscribers FROM anon, authenticated;

GRANT SELECT (
  id,
  email,
  first_name,
  source,
  status,
  preferences,
  subscribed_at,
  unsubscribed_at,
  ip_address,
  user_agent,
  utm_source,
  utm_medium,
  utm_campaign,
  created_at,
  updated_at,
  confirm_sent_at,
  confirmed_at
) ON public.newsletter_subscribers TO anon, authenticated;

COMMENT ON COLUMN public.newsletter_subscribers.unsubscribe_token IS
  'Secret: only ever placed in an email the server sends. Not granted to anon or authenticated (column privileges, 20261115000110); read it with the service role or a SECURITY DEFINER RPC.';
COMMENT ON COLUMN public.newsletter_subscribers.confirm_token IS
  'Secret: only ever placed in the confirmation email. Not granted to anon or authenticated (column privileges, 20261115000110); read it with the service role or a SECURITY DEFINER RPC.';

-- Guard: fail the migration rather than ship a grant that still exposes a
-- token (for example, if some other grant path re-adds table-level SELECT).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT role_name, col
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name,
         unnest(ARRAY['unsubscribe_token', 'confirm_token']) AS col
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.role_name)
       AND has_column_privilege(r.role_name, 'public.newsletter_subscribers', r.col, 'SELECT')
    THEN
      RAISE EXCEPTION 'newsletter_subscribers.%: % can still SELECT it after 20261115000110', r.col, r.role_name;
    END IF;
  END LOOP;
END;
$$;
