-- IOS-DD-SAVED-06 -- close the gaps in the favorites cap (WEB-FEAT-017).
--
-- 20260918000001 put enforce_favorites_limit() on content_favorites and
-- user_event_interactions. Four ways past it remained:
--   1. No lock. Two concurrent inserts both counted 2 of 3 and both landed.
--   2. Duplicate event rows counted twice, so the cap could fire early for a
--      user whose old binary had double-inserted; count(DISTINCT event_id)
--      counts what the user sees.
--   3. BEFORE INSERT only. An UPDATE that turns a 'view' row into a
--      'favorite' (or moves a favorite to another user_id) was never counted.
--   4. user_restaurant_interactions has no trigger at all. It exists in
--      production (scripts/db-snapshot.json) although no migration creates it,
--      and iOS wrote restaurant favorites there until this release.
--
-- WHY THIS TIGHTENS NO SHIPPED CLIENT (CLAUDE.md backward compatibility):
--   - The advisory lock only serialises one user's concurrent inserts.
--   - DISTINCT loosens the count.
--   - Nothing in web, iOS or Android issues UPDATE on either interaction table
--     (grep for .update( against them finds none), so the UPDATE triggers fire
--     only for direct API calls, which is what the cap exists to stop.
--   - The legacy restaurant trigger is the same change 20260918000001 made for
--     the other two tables: every shipped client self-caps before inserting,
--     and old iOS binaries caught every insert error on that table and saved
--     locally instead. From this release iOS writes content_favorites.
--   - Legacy restaurant rows that also exist in content_favorites (the new iOS
--     build copies them over) are not counted twice.
--
-- Rows already over a cap are untouched: no backfill, no deletion.
--
-- RLS NOT VERIFIED HERE (IOS-DD-SAVED-07): no migration creates
-- user_event_interactions' or user_restaurant_interactions' policies, so
-- whether they are own-row only cannot be read from this repo. Check with
--   select * from pg_policies where tablename in
--     ('user_event_interactions', 'user_restaurant_interactions');
-- before relying on them. SECURITY DEFINER below reads across RLS, so the
-- count is right either way.

CREATE OR REPLACE FUNCTION public.enforce_favorites_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- ::text::uuid works whether the column is uuid or text.
  v_uid   uuid := NEW.user_id::text::uuid;
  v_limit integer;
  v_count bigint;
  v_legacy bigint;
BEGIN
  v_limit := public.entitled_plan_limit(v_uid, 'favorites');
  IF v_limit < 0 THEN
    RETURN NEW;
  END IF;

  -- One user's favorite writes queue behind each other until commit, so two
  -- concurrent inserts cannot both read the same count.
  PERFORM pg_advisory_xact_lock(hashtextextended('favorites:' || v_uid::text, 0));

  SELECT
    (SELECT count(*) FROM public.content_favorites WHERE user_id = v_uid)
    -- user_id is uuid here (20251110000004 compares it to a uuid), so the
    -- plain comparison keeps the user_id index; a ::text cast would scan
    -- every view and click row on each favorite insert.
    + (SELECT count(DISTINCT event_id) FROM public.user_event_interactions
        WHERE user_id = v_uid AND interaction_type = 'favorite')
  INTO v_count;

  -- Legacy restaurant favorites count only on inserts into that table, so
  -- the two newer tables keep their existing behaviour whether or not the
  -- legacy table exists. EXECUTE because no migration creates the table and
  -- plpgsql would otherwise resolve it when the function first runs.
  IF TG_TABLE_NAME = 'user_restaurant_interactions' THEN
    EXECUTE $q$
      SELECT count(DISTINCT uri.restaurant_id::text)
      FROM public.user_restaurant_interactions uri
      WHERE uri.user_id::text = $1::text
        AND uri.interaction_type = 'favorite'
        AND NOT EXISTS (
          SELECT 1 FROM public.content_favorites cf
          WHERE cf.user_id = $1
            AND cf.content_type = 'restaurant'
            AND cf.content_id::text = uri.restaurant_id::text
        )
    $q$
    INTO v_legacy
    USING v_uid;
    v_count := v_count + COALESCE(v_legacy, 0);
  END IF;

  IF v_count >= v_limit THEN
    -- Same typed refusal as 20260918000001; the clients key off the hint.
    RAISE EXCEPTION 'Your plan allows % saved favorites.', v_limit
      USING ERRCODE = 'PT402',
            DETAIL = 'favorites',
            HINT = 'upgrade_required';
  END IF;

  RETURN NEW;
END;
$$;

-- An UPDATE that makes a row a favorite, or moves a favorite to another user.
DROP TRIGGER IF EXISTS trg_event_favorites_limit_upd ON public.user_event_interactions;
CREATE TRIGGER trg_event_favorites_limit_upd
  BEFORE UPDATE OF interaction_type, user_id ON public.user_event_interactions
  FOR EACH ROW
  WHEN (NEW.interaction_type = 'favorite'
        AND (OLD.interaction_type IS DISTINCT FROM 'favorite'
             OR NEW.user_id IS DISTINCT FROM OLD.user_id))
  EXECUTE FUNCTION public.enforce_favorites_limit();

-- content_favorites had the same gap: an UPDATE moving a row to another
-- user_id was never counted. RLS already stops a client doing this to
-- someone else; the trigger covers service-role and definer paths too.
DROP TRIGGER IF EXISTS trg_content_favorites_limit_upd ON public.content_favorites;
CREATE TRIGGER trg_content_favorites_limit_upd
  BEFORE UPDATE OF user_id ON public.content_favorites
  FOR EACH ROW
  WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id)
  EXECUTE FUNCTION public.enforce_favorites_limit();

-- The legacy restaurant table, only where it exists.
DO $$
BEGIN
  IF to_regclass('public.user_restaurant_interactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_restaurant_favorites_limit ON public.user_restaurant_interactions';
    EXECUTE $t$
      CREATE TRIGGER trg_restaurant_favorites_limit
        BEFORE INSERT ON public.user_restaurant_interactions
        FOR EACH ROW
        WHEN (NEW.interaction_type = 'favorite')
        EXECUTE FUNCTION public.enforce_favorites_limit()
    $t$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_restaurant_favorites_limit_upd ON public.user_restaurant_interactions';
    EXECUTE $t$
      CREATE TRIGGER trg_restaurant_favorites_limit_upd
        BEFORE UPDATE OF interaction_type, user_id ON public.user_restaurant_interactions
        FOR EACH ROW
        WHEN (NEW.interaction_type = 'favorite'
              AND (OLD.interaction_type IS DISTINCT FROM 'favorite'
                   OR NEW.user_id IS DISTINCT FROM OLD.user_id))
        EXECUTE FUNCTION public.enforce_favorites_limit()
    $t$;
  END IF;
END;
$$;
