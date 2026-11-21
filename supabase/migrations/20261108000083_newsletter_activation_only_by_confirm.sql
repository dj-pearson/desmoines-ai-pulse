-- WEB-ADS-030: only the double opt-in confirm may put a newsletter reader on
-- the list.
--
-- newsletter_subscribers_admin_update (20261005000003) lets an admin UPDATE
-- any column of any row through PostgREST. WEB-ADS-029 removed the admin
-- page's Re-subscribe button, which wrote status = 'active' on pending and
-- unsubscribed rows, but the policy still accepts that write from any admin
-- session. send-newsletter-campaign and the digest mail every 'active' row,
-- so an activation done that way mails an address that never clicked the
-- confirm link: no consent_records row is written, and the row's
-- confirm_token stays live.
--
-- The guard is a BEFORE INSERT OR UPDATE trigger, not a narrower policy. A
-- policy WITH CHECK sees only the new row, so it cannot tell "already active,
-- editing something else" from "pending, now active". The trigger can.
--
-- WHO IS STOPPED. The trigger function is SECURITY INVOKER, so current_user
-- is the role that ran the statement. PostgREST runs browser requests as
-- 'anon' or 'authenticated', and only those two are refused. Everything that
-- legitimately activates a row runs as someone else:
--   * newsletter_confirm_by_token is SECURITY DEFINER, so inside it
--     current_user is the function's owner. Its UPDATE passes, and it is the
--     path that writes the consent record and spends the token.
--   * edge functions use the service role ('service_role').
--   * migrations and the SQL editor run as 'postgres'.
--
-- WHAT ADMINS KEEP. Any change that does not end in a fresh 'active':
-- active -> unsubscribed, any status -> bounced, edits to a row that is
-- already active. Reactivating a bounced or unsubscribed address from the
-- browser is refused too; the reader signs up again and confirms, which also
-- lifts their unsubscribe suppression (WEB-ADS-022). A bounce has its own
-- email_suppressions row that a status flip would not lift anyway.
--
-- CLIENTS. No shipped client relies on this write: iOS and Android never
-- touch newsletter_subscribers, and the only web caller was the admin
-- Re-subscribe button WEB-ADS-029 removed. The admin page's remaining write
-- (bulk unsubscribe, scoped to status = 'active') is unaffected.
--
-- Re-running is a no-op: CREATE OR REPLACE and DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.newsletter_subscribers_guard_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
     AND current_user IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'newsletter_subscribers: a reader becomes active only by confirming the emailed link'
      USING ERRCODE = '42501',
            HINT = 'Ask the reader to sign up again; newsletter_confirm_by_token activates the row and records consent.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.newsletter_subscribers_guard_activation() FROM PUBLIC;

COMMENT ON FUNCTION public.newsletter_subscribers_guard_activation IS
  'WEB-ADS-030: refuses a move to status active from anon/authenticated sessions, so only newsletter_confirm_by_token (SECURITY DEFINER) or the service role can activate a newsletter reader.';

DROP TRIGGER IF EXISTS newsletter_subscribers_guard_activation ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_subscribers_guard_activation
  BEFORE INSERT OR UPDATE ON public.newsletter_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.newsletter_subscribers_guard_activation();
