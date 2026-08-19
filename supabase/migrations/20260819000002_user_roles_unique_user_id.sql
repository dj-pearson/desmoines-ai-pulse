-- ============================================================================
-- WEB-BE-032: one role row per user (dedupe, then UNIQUE(user_id))
-- ============================================================================
-- public.user_roles has had NO uniqueness on user_id since the baseline
-- (20250100000000_baseline_tables.sql:44-50). Nothing enforced one row per
-- user, and five separate readers assume exactly that:
--
--   src/contexts/AuthContext.tsx                    the web app's isAdmin flag
--   supabase/functions/moderate-content/index.ts    moderation authorization
--   supabase/functions/triage-event-submission/     submission authorization
--   supabase/functions/_shared/apiKeyAuth.ts        isAdminUserId
--   supabase/functions/assign-role/index.ts         UPDATE-vs-INSERT decision
--
-- All five called .maybeSingle() with no .limit(1). PostgREST returns PGRST116
-- ("multiple rows returned") the moment a user has two rows, every one of those
-- reads discarded its error, and each then resolved the user to 'user'. So a
-- single duplicate row demoted an admin everywhere at once, silently.
--
-- HOW A DUPLICATE GOT CREATED: assign-role read `existing` to choose UPDATE vs
-- INSERT and discarded that read's error. A failed read looked like "no row" and
-- took the INSERT path. One transient error was enough, and it was
-- self-perpetuating - the duplicate then broke the very read that would have
-- prevented the next one.
--
-- The readers are fixed in the same change (.limit(1) plus captured errors), so
-- this migration is the structural half rather than the only defence. Both are
-- wanted: .limit(1) makes a duplicate harmless, this makes it impossible.
--
-- SAFETY: dedupe FIRST, in the same migration, or the constraint fails to apply
-- wherever a duplicate already exists. Keeps the newest row per user, which
-- matches how assign-role's resolveRole already picks a winner
-- (ORDER BY created_at DESC LIMIT 1), so no user's effective role changes.
-- Idempotent: re-running finds nothing to delete and skips the existing
-- constraint.
--
-- BACKWARD COMPAT: this tightens a constraint, which CLAUDE.md flags. It is safe
-- here because it changes no shape any client reads - user_roles rows keep the
-- same columns and the same values, and the only rows removed are ones that
-- were already unreachable behind ORDER BY ... LIMIT 1. What it forbids is a
-- state that already breaks five readers.
-- ============================================================================

-- 1. Report what is about to be removed, so the apply log is evidence rather
--    than a silent delete.
DO $$
DECLARE
  dupe_users bigint;
  dupe_rows  bigint;
BEGIN
  SELECT count(*), coalesce(sum(n - 1), 0)
    INTO dupe_users, dupe_rows
  FROM (
    SELECT user_id, count(*) AS n
    FROM public.user_roles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
  ) d;

  IF dupe_users > 0 THEN
    RAISE NOTICE 'WEB-BE-032: % user(s) hold duplicate user_roles rows; removing % superseded row(s).',
      dupe_users, dupe_rows;
  ELSE
    RAISE NOTICE 'WEB-BE-032: no duplicate user_roles rows found.';
  END IF;
END
$$;

-- 2. Keep the newest row per user; delete the superseded ones.
--    created_at can be NULL on baseline rows, so id is the tiebreaker.
DELETE FROM public.user_roles u
WHERE u.user_id IS NOT NULL
  AND u.id <> (
    SELECT keep.id
    FROM public.user_roles keep
    WHERE keep.user_id = u.user_id
    ORDER BY keep.created_at DESC NULLS LAST, keep.id DESC
    LIMIT 1
  );

-- 3. One role row per user, from here on.
DO $$ BEGIN
  ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table THEN NULL;   -- constraint already present
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON CONSTRAINT user_roles_user_id_key ON public.user_roles IS
  'One role row per user (WEB-BE-032). Five readers resolve a role with maybeSingle(); a second row made all five return PGRST116 and silently demote the user.';
