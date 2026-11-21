-- XPLAT-013: saved articles move to content_favorites (one table, not three).
--
-- iOS wrote article saves to user_article_interactions, which no migration
-- creates and production does not have, so every one fell back to
-- UserDefaults and stayed on that handset. Web already generalised favourites
-- into content_favorites (WEB-UX-010) and iOS moved restaurants and
-- attractions there (IOS-DD-SAVED-03); this lets articles follow instead of
-- inventing a fourth table.
--
-- 1. content_type also accepts 'article'. The new CHECK is a strict superset
--    of the old one, so every value an old client sends is still accepted.
--    scripts/check-migration-safety.mjs flags any ADD CONSTRAINT ... CHECK and
--    cannot tell a superset from a tightening: this one needs the
--    migration-override label, and the reviewer can compare the two lists.
-- 2. Articles stay outside the favourites cap. iOS has always kept editorial
--    saves free (FavoritesService: "saving editorial content is always free"),
--    so an article insert is not checked and an article row is not counted
--    against the 3 events/places a free plan allows. Both changes only let
--    more through.
--
-- Nothing writes 'article' until the iOS build that ships with this. A build
-- that reaches users before this is applied gets 23514 on an article insert
-- and keeps the save on the device, as it does today.

ALTER TABLE public.content_favorites
  DROP CONSTRAINT IF EXISTS content_favorites_content_type_check;
ALTER TABLE public.content_favorites
  ADD CONSTRAINT content_favorites_content_type_check
  CHECK (content_type IN ('restaurant', 'attraction', 'hotel', 'playground', 'article'));

-- 20261009000001's body, with article rows left out of the count.
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
    (SELECT count(*) FROM public.content_favorites
      WHERE user_id = v_uid AND content_type <> 'article')
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

-- An article insert is not checked at all, so a free user at 3 of 3 can still
-- save a guide.
DROP TRIGGER IF EXISTS trg_content_favorites_limit ON public.content_favorites;
CREATE TRIGGER trg_content_favorites_limit
  BEFORE INSERT ON public.content_favorites
  FOR EACH ROW
  WHEN (NEW.content_type <> 'article')
  EXECUTE FUNCTION public.enforce_favorites_limit();

COMMENT ON TABLE public.content_favorites IS
  'Per-user saved restaurants/attractions/hotels/playgrounds/articles. Event favorites remain in user_event_interactions. Articles are not counted against the favorites cap.';
