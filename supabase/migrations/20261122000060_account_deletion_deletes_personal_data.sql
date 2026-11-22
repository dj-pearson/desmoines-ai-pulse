-- WEB-LEGAL-015 follow-up. Owner decision 2026-11-22: "delete should delete".
-- When a user deletes their account, rows that are their personal data are
-- deleted, not kept with the link to them blanked.
--
-- 20261122000030 gave every FK to auth.users an ON DELETE action so the auth
-- delete could never be blocked. Where a row was kept on purpose it chose SET
-- NULL, and that left the deleted person's own words and contact details in
-- place under a NULL user_id: contact_submissions kept their name, email,
-- phone and message; failed_login_attempts their email and IP; invoices their
-- name, email and billing address; crm_contacts their whole CRM record;
-- referrals the address they were invited at. This migration turns each of
-- those links into ON DELETE CASCADE.
--
-- THE RULE, per column, as it now stands:
--   CASCADE   the row is about the user: what they wrote, what was sent to
--             them, what was recorded about them. It goes with the account.
--   SET NULL  the column records which staff member did something to a record
--             that is not theirs (created_by, resolved_by, assigned_to ...),
--             or links to another row (a parent comment, a merged ticket).
--             What remains holds nothing about the deleted person.
-- Kept with a link blanked, on purpose and listed in RETAINED_TABLES:
-- consent_records (proof of consent; it holds a hash of the address, not the
-- address). supabase/functions/_tests/user-fk-on-delete.test.ts names every
-- SET NULL that remains and the reason for each.
--
-- deal_redemptions: the claim row now goes with the account too (it was kept
-- with subject_erased_at). The count is derived: increment_deal_redemption
-- recounts the rows on the next signed-in claim, so a deal's shown count drops
-- by the deleted user's claims then, and the anonymous read of the count drops
-- at once. subject_erased_at, its trigger and the loosened CHECK stay (no
-- column is dropped); with CASCADE the trigger no longer fires.
--
-- Backward compatibility: no column is dropped or renamed. Each change swaps a
-- FK's ON DELETE action in place (same name, NOT VALID then VALIDATE). A table
-- or column that does not exist in this database is skipped, as in
-- 20261122000030. Re-running is a no-op.

CREATE OR REPLACE FUNCTION pg_temp.change_fk_action(p_table text, p_column text, p_action text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rel regclass := to_regclass(format('public.%I', p_table));
  v_code "char";
  v_attnum smallint;
  r record;
BEGIN
  IF p_action = 'CASCADE' THEN
    v_code := 'c';
  ELSIF p_action = 'SET NULL' THEN
    v_code := 'n';
  ELSE
    RAISE EXCEPTION 'change_fk_action: % is not CASCADE or SET NULL', p_action;
  END IF;
  IF v_rel IS NULL THEN
    RETURN;
  END IF;
  SELECT a.attnum INTO v_attnum
  FROM pg_attribute a
  WHERE a.attrelid = v_rel AND a.attname = p_column AND NOT a.attisdropped;
  IF v_attnum IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.conname,
           c.confrelid::regclass AS ref_table,
           ra.attname AS ref_column,
           CASE c.confupdtype
             WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
             WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
             ELSE 'NO ACTION'
           END AS on_update,
           CASE WHEN c.condeferrable AND c.condeferred THEN ' DEFERRABLE INITIALLY DEFERRED'
                WHEN c.condeferrable THEN ' DEFERRABLE'
                ELSE ''
           END AS deferral
    FROM pg_constraint c
    JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
    WHERE c.conrelid = v_rel
      AND c.contype = 'f'
      AND c.conkey = ARRAY[v_attnum]
      AND c.confdeltype <> v_code
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s (%I) ON UPDATE %s ON DELETE %s%s NOT VALID',
      v_rel, r.conname, r.conname, p_column, r.ref_table, r.ref_column, r.on_update, p_action, r.deferral
    );
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', v_rel, r.conname);
  END LOOP;
END;
$fn$;

-- ------------------------------------------- what the user wrote or sent
-- The contact form: name, email, phone, subject and message. Staff replies to
-- it (feedback_replies) already cascade from the submission.
SELECT pg_temp.change_fk_action('contact_submissions', 'user_id', 'CASCADE');
-- A staff member's own comments on the review queue are text they wrote.
SELECT pg_temp.change_fk_action('content_queue_comments', 'user_id', 'CASCADE');
-- A staff writer's byline: display name, email, bio, photo. The articles stay
-- (they are the site's), without the byline.
SELECT pg_temp.change_fk_action('author_profiles', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('articles', 'author_profile_id', 'SET NULL');

-- ------------------------------------------- what was recorded about them
-- Sign-in failures against this account: the address typed and the IP.
SELECT pg_temp.change_fk_action('failed_login_attempts', 'user_id', 'CASCADE');
-- Operational events the user's own actions raised; message and metadata are
-- free text that can carry their details. resolved_by stays SET NULL.
SELECT pg_temp.change_fk_action('system_events', 'user_id', 'CASCADE');
-- Which deals they claimed.
SELECT pg_temp.change_fk_action('deal_redemptions', 'user_id', 'CASCADE');
-- The CRM record for this person: name, email, phone, address, notes. Its
-- activities, messages, notes, deals and segment rows already cascade from
-- the contact. A staff task about the contact goes too; it names them.
SELECT pg_temp.change_fk_action('crm_contacts', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('crm_contacts', 'profile_id', 'CASCADE');
SELECT pg_temp.change_fk_action('crm_tasks', 'contact_id', 'CASCADE');
-- Where they were invited: the row holds the address the invite went to. The
-- referrer loses this one referral from their history.
SELECT pg_temp.change_fk_action('referrals', 'referred_user_id', 'CASCADE');

-- ------------------------------------------- what was sent to them
SELECT pg_temp.change_fk_action('campaign_notifications', 'recipient_user_id', 'CASCADE');
-- Already deleted by address in delete-user-account (_shared/addressKeyedData.ts);
-- the FK now agrees.
SELECT pg_temp.change_fk_action('email_log', 'user_id', 'CASCADE');

-- ------------------------------------------- what they bought
-- Invoices carry the customer's name, email and billing address; payments and
-- usage_events are their purchase and metered-use history. Stripe (or Apple /
-- Google for store purchases) keeps its own billing records.
SELECT pg_temp.change_fk_action('invoices', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('payments', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('usage_events', 'user_id', 'CASCADE');

-- ------------------------------------------- already purged; the FK now agrees
-- delete-user-account deletes these by user_id (PURGE_TABLES) before the auth
-- delete. CASCADE makes the database say the same, so a failed purge of one
-- table no longer leaves its rows behind under a NULL user_id.
SELECT pg_temp.change_fk_action('media_assets', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('search_analytics', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('surprise_pick_outcomes', 'user_id', 'CASCADE');
SELECT pg_temp.change_fk_action('support_tickets', 'user_id', 'CASCADE');

DROP FUNCTION pg_temp.change_fk_action(text, text, text);
