-- WEB-LEGAL-015. Every foreign key to auth.users gets an ON DELETE action, so
-- account deletion is never stopped by one.
--
-- delete-user-account purges the user's tables, their files and their Stripe
-- customer, then calls auth.admin.deleteUser, which is a DELETE on auth.users.
-- 46 columns referenced auth.users with no ON DELETE clause (NO ACTION), so
-- that DELETE raised 23503 for any user one of them pointed at, AFTER the
-- purge: a live login with no profile behind it, and a 500 "Failed to delete
-- authentication record" on web, iOS and Android alike. The common case was
-- contact_submissions.user_id, set for anyone who used the contact form signed
-- in. The other was deal_redemptions: ON DELETE SET NULL, but its CHECK wants a
-- user_id or a session_hash and a signed-in claim has no session_hash, so the
-- SET NULL broke the CHECK (23514).
--
-- THE RULE, per column:
--   CASCADE   when the row is the user's own data: their activity, their
--             preferences, their location. It goes with the account. Most of
--             these are already in PURGE_TABLES; the FK makes deleteUser agree.
--   SET NULL  when the column records who did something to a record that is
--             not theirs (created_by, updated_by, resolved_by, blocked_by ...)
--             or links a record kept on purpose (RETAINED_TABLES). The record
--             stays and the link to the deleted account goes. A NOT NULL on
--             such a column is dropped, since SET NULL into it would fail.
--
-- Backward compatibility: no column is dropped or renamed. Each change is a FK
-- swap (drop and re-add under the same name, NOT VALID then VALIDATE, inside
-- this migration's transaction) or a dropped NOT NULL, both loosening. The
-- deal_redemptions CHECK is replaced by a looser one that every existing row
-- satisfies.
--
-- One FK here is not to auth.users: article_comments.parent_comment_id, which
-- blocked the cascade of a comment someone else had replied to. The test below
-- follows CASCADE chains for exactly that shape.
--
-- The swap finds the constraint in pg_constraint rather than by name, because
-- a table created outside these migrations may carry a different name. A table
-- or column that does not exist in this database is skipped. A FK to auth.users
-- that the list below does not name (one created outside the migrations) gets
-- SET NULL from the sweep at the end, which keeps its rows.
--
-- supabase/functions/_tests/user-fk-on-delete.test.ts replays every migration,
-- fails on any FK into a deleted row that still has NO ACTION or RESTRICT, and
-- runs this file in PGlite against a user who owns a row in every such table.

CREATE OR REPLACE FUNCTION pg_temp.set_user_fk_action(p_table text, p_column text, p_action text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rel regclass := to_regclass(format('public.%I', p_table));
  v_attnum smallint;
  v_notnull boolean;
  r record;
BEGIN
  IF p_action NOT IN ('CASCADE', 'SET NULL') THEN
    RAISE EXCEPTION 'set_user_fk_action: % is not CASCADE or SET NULL', p_action;
  END IF;
  IF v_rel IS NULL THEN
    RETURN;
  END IF;
  SELECT a.attnum, a.attnotnull INTO v_attnum, v_notnull
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
      AND c.confdeltype IN ('a', 'r')
  LOOP
    IF p_action = 'SET NULL' AND v_notnull THEN
      EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', v_rel, p_column);
      v_notnull := false;
    END IF;
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s (%I) ON UPDATE %s ON DELETE %s%s NOT VALID',
      v_rel, r.conname, r.conname, p_column, r.ref_table, r.ref_column, r.on_update, p_action, r.deferral
    );
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', v_rel, r.conname);
  END LOOP;
END;
$fn$;

-- ------------------------------------------------- the user's own data: CASCADE
-- Activity, preferences and personalization. All but geofence_events are in
-- PURGE_TABLES already; this makes the auth delete agree with the purge.
SELECT pg_temp.set_user_fk_action('article_comments', 'user_id', 'CASCADE');
SELECT pg_temp.set_user_fk_action('brewery_trail_checkins', 'user_id', 'CASCADE');
SELECT pg_temp.set_user_fk_action('experiment_assignments', 'user_id', 'CASCADE');
SELECT pg_temp.set_user_fk_action('user_interactions_enhanced', 'user_id', 'CASCADE');
SELECT pg_temp.set_user_fk_action('user_journeys', 'user_id', 'CASCADE');
-- These two CHECK (user_id IS NOT NULL OR session_id IS NOT NULL), so SET NULL
-- would fail on a signed-in row as well as being the wrong answer.
SELECT pg_temp.set_user_fk_action('personalized_recommendations', 'user_id', 'CASCADE');
SELECT pg_temp.set_user_fk_action('user_preference_profiles', 'user_id', 'CASCADE');
-- Where the user's device was, with coordinates and a timestamp. That is
-- personal data with no basis to keep once the account is gone.
SELECT pg_temp.set_user_fk_action('geofence_events', 'user_id', 'CASCADE');

-- A reply by someone else to a comment that just cascaded away. The reply is
-- the other user's content, so it stays, as a top-level comment.
SELECT pg_temp.set_user_fk_action('article_comments', 'parent_comment_id', 'SET NULL');

-- ------------------------------------- records kept on purpose: SET NULL
-- RETAINED_TABLES in _shared/userDataTables.ts, each with its stated basis.
-- The record stays; it stops pointing at a deleted account.
SELECT pg_temp.set_user_fk_action('contact_submissions', 'user_id', 'SET NULL');
SELECT pg_temp.set_user_fk_action('contact_submissions', 'assigned_to', 'SET NULL');
SELECT pg_temp.set_user_fk_action('failed_login_attempts', 'user_id', 'SET NULL');
SELECT pg_temp.set_user_fk_action('system_events', 'user_id', 'SET NULL');
SELECT pg_temp.set_user_fk_action('system_events', 'resolved_by', 'SET NULL');

-- ------------------------------------ who did it, on a record not theirs: SET NULL
-- Admin and editor attribution. Deleting the editor must not delete the deal,
-- the article, the venue or the blocklist entry they touched.
SELECT pg_temp.set_user_fk_action('accessibility_reports', 'resolved_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('ad_rate_card', 'updated_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('ai_configuration', 'updated_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('ai_models', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('articles', 'author_id', 'SET NULL');
SELECT pg_temp.set_user_fk_action('auto_approval_rules', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('blocked_ips', 'blocked_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('content_queue', 'submitted_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('content_queue', 'reviewed_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('deals', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('geofence_regions', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('gsc_properties', 'added_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('hotel_blacklist', 'blocked_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('import_jobs', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('known_venues', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('restaurant_blacklist', 'blocked_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('scraping_jobs', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('security_settings', 'updated_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_alert_rules', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_alerts', 'assigned_to', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_alerts', 'acknowledged_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_alerts', 'resolved_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_audit_history', 'triggered_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_competitor_analysis', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_content_optimization', 'optimized_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_duplicate_content', 'resolved_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_fixes_applied', 'applied_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_keywords', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_monitoring_schedules', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_performance_budget', 'created_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('seo_settings', 'updated_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('user_submitted_events', 'admin_reviewed_by', 'SET NULL');
SELECT pg_temp.set_user_fk_action('whitelisted_ips', 'added_by', 'SET NULL');

-- ------------------------------------------------------------ deal_redemptions
-- The FK stays SET NULL: WEB-SEC-033 kept the row so a deleted account does
-- not lower a deal's count, and increment_deal_redemption recounts the rows.
-- What changes is the CHECK, which now also accepts a row whose account was
-- erased. A trigger stamps subject_erased_at when user_id goes NULL, which is
-- what the FK's SET NULL does, so the row still says why it names no one.
ALTER TABLE public.deal_redemptions ADD COLUMN IF NOT EXISTS subject_erased_at timestamptz;

COMMENT ON COLUMN public.deal_redemptions.subject_erased_at IS
  'When the account that made this claim was deleted. Set by a trigger when user_id goes NULL; the row is kept so the deal''s count does not drop. WEB-LEGAL-015.';

CREATE OR REPLACE FUNCTION public.deal_redemptions_mark_erased()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.subject_erased_at := coalesce(NEW.subject_erased_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deal_redemptions_mark_erased ON public.deal_redemptions;
CREATE TRIGGER deal_redemptions_mark_erased
  BEFORE UPDATE OF user_id ON public.deal_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.deal_redemptions_mark_erased();

ALTER TABLE public.deal_redemptions
  DROP CONSTRAINT IF EXISTS deal_redemptions_subject_present,
  ADD CONSTRAINT deal_redemptions_subject_present
    CHECK (user_id IS NOT NULL OR session_hash IS NOT NULL OR subject_erased_at IS NOT NULL);

-- ---------------------------------------------------------------- the sweep
-- A FK to auth.users or profiles that still blocks a delete was created outside
-- these migrations. SET NULL keeps its rows, which is the choice that loses
-- nothing; the WARNING names it in the migration output so it can be
-- classified properly.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT cl.relname, a.attname
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')
      AND c.confrelid IN (SELECT x FROM (VALUES (to_regclass('auth.users')), (to_regclass('public.profiles'))) v(x) WHERE x IS NOT NULL)
  LOOP
    RAISE WARNING 'WEB-LEGAL-015: %.% referenced a user with no ON DELETE action; set to SET NULL', r.relname, r.attname;
    PERFORM pg_temp.set_user_fk_action(r.relname, r.attname, 'SET NULL');
  END LOOP;
END;
$$;

DROP FUNCTION pg_temp.set_user_fk_action(text, text, text);
