-- iOS deep dive, events group, item E16 (IOS-DD-EVENTS-16): a review cannot
-- publish itself.
--
-- WHY. user_ratings.moderation_status is NOT NULL DEFAULT 'approved'
-- (20260612000019). The web sends 'pending' when a review has text
-- (src/hooks/useRatings.ts, WEB-AUTO-009) and moderate-content promotes or
-- rejects it. The iOS client never sent the column, so every iOS review took
-- the default and was public the moment it was written. The iOS client now
-- sends it, but a client choosing its own moderation state is the bug: any
-- caller holding the anon key can upsert moderation_status = 'approved', and
-- an author could edit an approved review into anything and keep it approved.
--
-- WHAT. A BEFORE INSERT OR UPDATE trigger decides the state for non-privileged
-- writers:
--   * text on insert, or text changed on update  -> 'pending'
--   * any other update                           -> the old state (no
--                                                    self-approval, no
--                                                    un-rejection)
--   * insert without text                        -> 'approved' (a bare star
--                                                    rating has nothing to
--                                                    moderate, as the web does)
-- service_role (moderate-content writes the verdict as service_role), admins
-- (is_admin(), 20260822000007) and sessions with no JWT at all (migrations,
-- psql as the owner) pass through untouched.
--
-- is_verified is in types.ts but no migration in this ledger creates it. When
-- the column exists, a second trigger keeps non-privileged writers from
-- setting it: false on insert, unchanged on update.
--
-- ADDITIVE. No column, policy or function signature changes; the web already
-- sends exactly what this enforces, so no shipped client sees a difference
-- beyond its own review waiting for moderation. Tightening the RLS SELECT
-- policy to hide non-approved rows server-side is deferred one release per
-- CLAUDE.md (Backward Compatibility): older iOS binaries do not filter, and
-- the new binary and the web filter client-side meanwhile.

CREATE OR REPLACE FUNCTION public.user_ratings_moderation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.review_text IS NOT NULL
     AND btrim(NEW.review_text) <> ''
     AND (TG_OP = 'INSERT' OR NEW.review_text IS DISTINCT FROM OLD.review_text) THEN
    NEW.moderation_status := 'pending';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.moderation_status := OLD.moderation_status;
  ELSE
    NEW.moderation_status := 'approved';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.user_ratings_moderation_guard() IS
  'IOS-DD-EVENTS-16: non-privileged writers cannot choose a review''s moderation_status. '
  'Text on insert or a text change -> pending; other updates keep the old state; '
  'an insert without text -> approved. service_role, admins and no-JWT sessions pass through.';

DO $$
BEGIN
  IF to_regclass('public.user_ratings') IS NULL THEN
    RAISE NOTICE 'user_ratings does not exist; moderation guard trigger not created';
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS user_ratings_moderation_guard ON public.user_ratings;
  CREATE TRIGGER user_ratings_moderation_guard
    BEFORE INSERT OR UPDATE ON public.user_ratings
    FOR EACH ROW
    EXECUTE FUNCTION public.user_ratings_moderation_guard();

  -- is_verified, only where the column exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_ratings'
      AND column_name = 'is_verified'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.user_ratings_verified_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
      BEGIN
        IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.is_admin() THEN
          RETURN NEW;
        END IF;
        NEW.is_verified := CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_verified ELSE false END;
        RETURN NEW;
      END;
      $body$
    $fn$;

    DROP TRIGGER IF EXISTS user_ratings_verified_guard ON public.user_ratings;
    CREATE TRIGGER user_ratings_verified_guard
      BEFORE INSERT OR UPDATE ON public.user_ratings
      FOR EACH ROW
      EXECUTE FUNCTION public.user_ratings_verified_guard();
  END IF;
END;
$$;
