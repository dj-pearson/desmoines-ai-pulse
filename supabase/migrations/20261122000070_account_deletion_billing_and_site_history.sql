-- WEB-LEGAL-015, second follow-up. Owner decisions 2026-11-22.
--
-- 1. ad_impressions: a deleted user's impressions stay, because advertisers
--    are billed on the count, but nothing in them identifies the viewer any
--    more. user_id, ip_address, user_agent, browser and referrer_url are set
--    to NULL. session_id is NOT NULL and counted as unique_viewers by
--    aggregate_daily_ad_analytics, so it is replaced, not blanked: every
--    session id of the leaving user maps to md5(session_id || txid), the same
--    value for the same session within this one delete, so the distinct count
--    is unchanged and the stored value no longer matches the id in the
--    browser or anywhere else. Kept: campaign_id, creative_id, placement_type,
--    page_url, device_type (desktop/mobile/tablet), date, timestamp,
--    client_event_id.
--
--    WHY A BEFORE DELETE TRIGGER ON auth.users, not a step in
--    delete-user-account: the table was created outside the migration ledger,
--    so this repo cannot see whether ad_impressions.user_id has a FK to
--    auth.users at all, or with which action. A trigger on ad_impressions
--    fired by an ON DELETE SET NULL would do nothing if there is no FK, and a
--    CASCADE would delete the billed rows. Running before the auth row goes
--    covers all three cases (with a CASCADE FK the trigger has already moved
--    the rows off the user, so nothing cascades), and it covers every way an
--    account is deleted: the edge function, the Supabase dashboard, a script.
--    The cost: a trigger on auth.users that raises blocks the delete for the
--    whole site, so it swallows errors with a WARNING (the same rule as
--    sync_profile_email_from_auth, 20260926000004). A failure leaves those
--    columns in place and shows only in the Postgres log.
--
--    ad_clicks needs nothing: it has no user, IP, browser or session column
--    (campaign_id, creative_id, impression_id, date, timestamp,
--    client_event_id), and its impression_id points at a row this keeps.
--
-- 2. Search Console and analytics history (analytics_properties,
--    traffic_metrics, search_performance, keyword_rankings,
--    site_health_metrics, analytics_sync_jobs) is the site's, not the
--    personal data of the admin who connected it. Each table's user_id has
--    been ON DELETE CASCADE since 20251107000000, so deleting that admin's
--    account deleted the site's history. It becomes SET NULL, and the
--    NOT NULL on user_id is dropped so the SET NULL can land. None of the six
--    has a column holding the admin's name or email (checked against
--    20251107000000 and src/integrations/supabase/types.ts); user_id is the
--    only link to the person. The OAuth credentials themselves
--    (user_oauth_tokens, gsc_oauth_credentials) still go with the account.
--    RLS on all six is auth.uid() = user_id, so a row left with a NULL
--    user_id is readable on the service role only.
--
-- 3. Contact-form messages sent while signed out from the account's address:
--    delete_signed_out_contact_submissions(p_email) deletes the rows with no
--    user_id whose email matches lower(btrim(email)) = lower(btrim(p_email)).
--    delete-user-account calls it before the auth user is removed. Executable
--    by service_role only: anyone else could delete other people's messages
--    by naming their address.
--
-- Backward compatibility: no column dropped or renamed. Dropping a NOT NULL
-- loosens. The FK swap keeps each constraint's name (NOT VALID then
-- VALIDATE). A missing table is skipped. Re-running is a no-op.

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

-- ------------------------------------------- 1. ad_impressions

CREATE OR REPLACE FUNCTION public.erase_ad_impression_viewer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('public.ad_impressions') IS NULL THEN
    RETURN OLD;
  END IF;
  UPDATE public.ad_impressions
     SET user_id = NULL,
         ip_address = NULL,
         user_agent = NULL,
         browser = NULL,
         referrer_url = NULL,
         -- uuid-shaped so it fits a uuid or a text column.
         session_id = md5(session_id::text || ':' || txid_current()::text)::uuid
   WHERE user_id = OLD.id;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'erase_ad_impression_viewer: could not clear ad_impressions for %: % (%)', OLD.id, SQLERRM, SQLSTATE;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.erase_ad_impression_viewer() IS
'WEB-LEGAL-015. Before an auth.users row is deleted, keeps that user''s ad_impressions (advertisers are billed on the count) and clears what identifies the viewer: user_id, ip_address, user_agent, browser, referrer_url; session_id is replaced by a per-delete hash so unique_viewers still counts. Swallows errors: a trigger on auth.users that raises blocks every account deletion.';

REVOKE ALL ON FUNCTION public.erase_ad_impression_viewer() FROM PUBLIC;

DROP TRIGGER IF EXISTS erase_ad_impression_viewer_before_user_delete ON auth.users;
CREATE TRIGGER erase_ad_impression_viewer_before_user_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.erase_ad_impression_viewer();

-- If production has a FK here, make it SET NULL, so the rows stay even if the
-- trigger is ever dropped. No FK, nothing to do.
SELECT pg_temp.change_fk_action('ad_impressions', 'user_id', 'SET NULL');

-- ------------------------------------------- 2. Search Console and analytics history

ALTER TABLE IF EXISTS public.analytics_properties ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.traffic_metrics ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.search_performance ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.keyword_rankings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.site_health_metrics ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE IF EXISTS public.analytics_sync_jobs ALTER COLUMN user_id DROP NOT NULL;

SELECT pg_temp.change_fk_action('analytics_properties', 'user_id', 'SET NULL');
SELECT pg_temp.change_fk_action('traffic_metrics', 'user_id', 'SET NULL');
SELECT pg_temp.change_fk_action('search_performance', 'user_id', 'SET NULL');
SELECT pg_temp.change_fk_action('keyword_rankings', 'user_id', 'SET NULL');
SELECT pg_temp.change_fk_action('site_health_metrics', 'user_id', 'SET NULL');
SELECT pg_temp.change_fk_action('analytics_sync_jobs', 'user_id', 'SET NULL');

-- ------------------------------------------- 3. signed-out contact messages

CREATE OR REPLACE FUNCTION public.delete_signed_out_contact_submissions(p_email text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  -- A blank address would match every message sent with a blank email.
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN 0;
  END IF;
  DELETE FROM public.contact_submissions
   WHERE user_id IS NULL
     AND lower(btrim(email)) = lower(btrim(p_email));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.delete_signed_out_contact_submissions(text) IS
'WEB-LEGAL-015. Deletes contact-form messages sent while signed out (user_id IS NULL) from this address, compared case-insensitively. Called by delete-user-account before the auth user is removed. service_role only.';

REVOKE ALL ON FUNCTION public.delete_signed_out_contact_submissions(text) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.delete_signed_out_contact_submissions(text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.delete_signed_out_contact_submissions(text) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.delete_signed_out_contact_submissions(text) TO service_role;
  END IF;
END $$;

DROP FUNCTION pg_temp.change_fk_action(text, text, text);
