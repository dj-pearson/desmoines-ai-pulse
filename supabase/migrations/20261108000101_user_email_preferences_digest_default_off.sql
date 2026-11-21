-- WEB-FEAT-077: user_email_preferences.weekly_digest_enabled defaults to false.
--
-- 20251110000005 created the column as BOOLEAN DEFAULT true, and
-- get_weekly_digest_recipients mails every row with the flag set. So any
-- insert that names only some columns subscribes the user to the weekly
-- digest without asking. That is how the saved-search alerts switch opted
-- pre-October accounts in (WEB-FEAT-076). The writers known today all name the
-- column (handle_new_user, disable_event_alerts_by_token, useSavedSearchAlerts,
-- useEmailPreferences, the iOS EmailPreferencesService upsert), so this
-- changes nothing they do. It is the backstop for the next writer that forgets.
--
-- Default change only: existing rows keep their value, and every client that
-- reads the column reads it the same way. No row is rewritten, no constraint
-- tightens, and nothing reads "no default" differently from "default true".
-- Rows the old alerts switch already created with the digest on are an owner
-- decision, not this migration's. To size them (read-only):
--
--   SELECT count(*)
--   FROM public.user_email_preferences p
--   WHERE p.weekly_digest_enabled = true
--     AND p.created_at < timestamptz '2026-10-04'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.consent_records c
--       WHERE c.user_id = p.user_id
--         AND c.consent_type = 'marketing_email'
--         AND c.granted = true
--     );

ALTER TABLE public.user_email_preferences
  ALTER COLUMN weekly_digest_enabled SET DEFAULT false;
