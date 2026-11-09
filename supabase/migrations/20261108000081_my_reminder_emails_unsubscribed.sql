-- WEB-FEAT-065: let a signed-in reader find out that their event reminders
-- will not be emailed because they left the newsletter.
--
-- Owner decision on WEB-FEAT-063: reminders stay category 'marketing', so
-- _shared/email.ts drops them for an address with an 'unsubscribe' row in
-- email_suppressions (written by newsletter_unsubscribe_by_token,
-- 20261002000002). Nothing told the reader: the switch on the event page said
-- "Reminder enabled" and the mail never came.
--
-- email_suppressions is admin-read only (20261002000001), because it is a list
-- of other people's addresses. This function answers one yes/no about the
-- caller's OWN address, taken from auth.users for auth.uid() rather than from
-- an argument, so it cannot be used to ask about anyone else. It takes no
-- arguments on purpose. Anon gets no grant; a call with no session answers
-- false.
--
-- Only reason = 'unsubscribe' counts. That is the one block the reader can
-- lift themselves (confirming a newsletter signup removes it,
-- 20261108000037), so it is the one the page can offer a way out of. A bounce,
-- complaint or manual block also stops reminders, but no button on the page
-- would fix it, and saying "you bounced" to the signed-in owner is a separate
-- decision.
--
-- The address match is lower(btrim(...)), the same normalisation the
-- suppression CHECK and email.ts normalizeEmail() use, against auth.users.email,
-- the address get_pending_reminders sends to (20261108000040).
--
-- New function only; nothing existing changes.

create or replace function public.my_reminder_emails_unsubscribed()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.email::text INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.email_suppressions s
    WHERE s.email = lower(btrim(v_email))
      AND s.reason = 'unsubscribe'
  );
END;
$function$;

revoke all on function public.my_reminder_emails_unsubscribed() from public;
revoke all on function public.my_reminder_emails_unsubscribed() from anon;
grant execute on function public.my_reminder_emails_unsubscribed() to authenticated;

comment on function public.my_reminder_emails_unsubscribed() is
  'WEB-FEAT-065: true when the CALLER''s own address has an unsubscribe row in email_suppressions, so event reminders (category marketing) will not be emailed. No arguments; reads auth.uid().';
