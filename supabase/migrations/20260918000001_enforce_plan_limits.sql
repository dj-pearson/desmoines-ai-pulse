-- WEB-FEAT-017 -- plan limits enforced where they cannot be bypassed.
--
-- Favorites (3 on free), saved searches (0 on free) and alerts (0 on free) were
-- checked in the browser only: useFavorites and SaveSearchButton call
-- canPerformAction/hasFeature, and RLS on content_favorites, saved_searches and
-- user_event_interactions is own-row with no count at all. Anyone with the anon
-- key and a session could POST past every cap, and _shared/entitlements.ts --
-- the server-side resolver that exists for exactly this -- is imported by 7 of
-- 163 edge functions and by none of these write paths.
--
-- NOT A TIGHTENING FOR ANY SHIPPED CLIENT, which is what makes this safe in one
-- release under CLAUDE.md's backward-compatibility rules. All three clients
-- already refuse to exceed the cap on their own:
--   web      src/hooks/useFavorites.ts, src/components/SaveSearchButton.tsx
--   iOS      FavoritesService.swift -- guard limit > 0, throws .limitReached
--   Android  FavoritesRepositoryImpl.kt -- throws FavoritesException.LimitReached
-- A binary that respects the cap never reaches these triggers. What reaches them
-- is a direct API call, which is the thing this story exists to stop. Rows that
-- already exceed a cap are untouched: BEFORE INSERT only, no backfill, no
-- deletion.

-- ---------------------------------------------------------------------------
-- The entitled limit for a user, mirroring resolveEntitledTier()
-- ---------------------------------------------------------------------------
-- SQL rather than plpgsql so it stays inlinable and STABLE. SECURITY DEFINER
-- because a caller can read only their own user_subscriptions row under RLS,
-- and a trigger that cannot see the subscription would read every paying user
-- as free -- the loudest possible way to break the product.
--
-- The grace window matches _shared/entitlements.ts GRACE_PERIOD_DAYS and
-- src/hooks/useSubscription.ts. Three copies of 14 is a real liability; the
-- Deno test in _tests/plan-limit-triggers.test.ts asserts they agree.
CREATE OR REPLACE FUNCTION public.entitled_plan_limit(p_user_id uuid, p_limit_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH entitled AS (
    SELECT (sp.limits ->> p_limit_key)::integer AS lim
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id
      AND sp.limits ? p_limit_key
      AND (
        us.status IN ('active', 'trialing')
        OR (
          us.status = 'past_due'
          AND us.current_period_end IS NOT NULL
          AND now() <= us.current_period_end + interval '14 days'
        )
      )
  )
  SELECT COALESCE(
    -- -1 is unlimited, so it has to beat any finite number rather than lose to
    -- max(). A user holding web=insider (favorites -1) and ios=free must get -1.
    (SELECT CASE WHEN bool_or(lim = -1) THEN -1 ELSE max(lim) END
       FROM entitled WHERE lim IS NOT NULL),
    -- No entitled row: the free plan's own limit, read from the same table the
    -- UI reads so there is no second copy of the number.
    (SELECT (limits ->> p_limit_key)::integer
       FROM public.subscription_plans WHERE name = 'free' LIMIT 1),
    0
  );
$$;

COMMENT ON FUNCTION public.entitled_plan_limit(uuid, text) IS
  'WEB-FEAT-017: highest plan limit the user is entitled to for a limits key; -1 = unlimited. Mirrors _shared/entitlements.ts resolveEntitledTier.';

REVOKE ALL ON FUNCTION public.entitled_plan_limit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entitled_plan_limit(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Favorites: one cap across both favorite tables
-- ---------------------------------------------------------------------------
-- Event favorites live in user_event_interactions (interaction_type='favorite')
-- and everything else in content_favorites, so counting either one alone leaves
-- the cap at double its advertised value. Both triggers count both tables.
CREATE OR REPLACE FUNCTION public.enforce_favorites_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_count bigint;
BEGIN
  v_limit := public.entitled_plan_limit(NEW.user_id, 'favorites');
  IF v_limit < 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    (SELECT count(*) FROM public.content_favorites WHERE user_id = NEW.user_id)
    + (SELECT count(*) FROM public.user_event_interactions
        WHERE user_id = NEW.user_id AND interaction_type = 'favorite')
  INTO v_count;

  IF v_count >= v_limit THEN
    -- PT402 is PostgREST's "raise with an HTTP status" convention: the request
    -- comes back as 402 Payment Required rather than a 500. The hint is the
    -- part the clients key off, because it survives whatever a proxy does to
    -- the status.
    RAISE EXCEPTION 'Your plan allows % saved favorites.', v_limit
      USING ERRCODE = 'PT402',
            DETAIL = 'favorites',
            HINT = 'upgrade_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_favorites_limit ON public.content_favorites;
CREATE TRIGGER trg_content_favorites_limit
  BEFORE INSERT ON public.content_favorites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_favorites_limit();

DROP TRIGGER IF EXISTS trg_event_favorites_limit ON public.user_event_interactions;
CREATE TRIGGER trg_event_favorites_limit
  BEFORE INSERT ON public.user_event_interactions
  FOR EACH ROW
  -- Only favorites are capped. Views, clicks and the rest of the interaction
  -- types are analytics and must keep flowing.
  WHEN (NEW.interaction_type = 'favorite')
  EXECUTE FUNCTION public.enforce_favorites_limit();

-- ---------------------------------------------------------------------------
-- Saved searches
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_saved_searches_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_count bigint;
BEGIN
  v_limit := public.entitled_plan_limit(NEW.user_id, 'saved_searches');
  IF v_limit < 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.saved_searches
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Saved searches are an Insider feature.'
      USING ERRCODE = 'PT402',
            DETAIL = 'saved_searches',
            HINT = 'upgrade_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_searches_limit ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_limit
  BEFORE INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_saved_searches_limit();
