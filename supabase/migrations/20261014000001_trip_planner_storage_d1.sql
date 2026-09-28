-- Trip Planner storage, D1: re-create it, hardened (IOS-DD-TRIP-PLANNER-02).
--
-- WHY THIS EXISTS. 20251126000001 is in the production ledger but produced
-- none of its trip objects: the 2026-08-24 snapshot (scripts/db-snapshot.json)
-- has no trip_plans, trip_plan_items, get_trip_itinerary or
-- generate_trip_share_code. Its CREATE POLICY and CREATE TRIGGER statements
-- are not idempotent, so it cannot simply be re-run. This file re-creates the
-- same tables and fixes what that migration got wrong:
--
--   * get_trip_itinerary was SECURITY DEFINER with only
--     `WHERE trip_plan_id = p_trip_id`, no search_path and no REVOKE: anyone
--     with a trip id (anon included) read the whole itinerary. It is now
--     SECURITY INVOKER, so RLS decides, and anon cannot execute it.
--   * It built 'category', a.category; attractions has `type`, not `category`,
--     so every call that reached an attraction row errored. Now a.type.
--   * The trip_plans SELECT policy was `auth.uid() = user_id OR is_public`
--     with no TO clause, so anon could list every public plan with its
--     preferences. There is no public read path now; sharing is text-only on
--     iOS and a public share page is future work (TP-25).
--   * Share codes came from md5(random()). Now 80 bits from gen_random_bytes,
--     and only the service role can mint one.
--   * UPDATE was unrestricted, so a client could rewrite ai_generated,
--     created_at or user_id. A guard trigger pins those for non-service calls.
--
-- New: reorder_trip_items (one-statement reorder, ownership through RLS),
-- trip_plan_generations (a usage ledger the owner cannot delete from, so
-- deleting a plan no longer refunds the monthly allowance), and
-- get_trip_planner_usage (this Central-time month's count for the caller).
-- Plus nullable tips / packing_list columns so a reopened trip keeps them.
--
-- COMPATIBILITY. Tightening is safe under CLAUDE.md's rules here because none
-- of these objects exist in production, so no shipped client reads them.
-- Everything is idempotent; re-running this file is a no-op.
--
-- APPLY ORDER (docs/ios-deep-dive/09-trip-planner.md):
--   1. supabase db push (this file)
--   2. supabase functions deploy generate-itinerary
--   3. npm run check-schema:probe  - trip_plans and trip_plan_items must be present
--   4. node scripts/check-mobile-schema-usage.mjs --write  - drops them from
--      .github/mobile-schema-baseline.json
--   5. flip the web AI_PLANNER_AVAILABLE flag (src/lib/tripPlannerStatus.ts)
-- iOS needs no new binary: TripPlannerService probes trip_plans on launch of
-- the planner and un-pauses itself once step 1 is live.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================
-- 1. Tables (verbatim from 20251126000001, plus tips / packing_list)
-- ============================================

CREATE TABLE IF NOT EXISTS public.trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  preferences JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'in_progress', 'completed', 'archived')),
  is_public BOOLEAN DEFAULT false,
  share_code TEXT UNIQUE,
  ai_generated BOOLEAN DEFAULT false,
  total_estimated_cost TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trip_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_plan_id UUID NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('event', 'restaurant', 'attraction', 'custom', 'transport', 'break')),
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  attraction_id UUID REFERENCES public.attractions(id) ON DELETE SET NULL,
  custom_title TEXT,
  custom_description TEXT,
  custom_location TEXT,
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER,
  notes TEXT,
  estimated_cost TEXT,
  booking_url TEXT,
  is_confirmed BOOLEAN DEFAULT false,
  ai_suggested BOOLEAN DEFAULT false,
  ai_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.trip_plans
  ADD COLUMN IF NOT EXISTS tips jsonb NULL,
  ADD COLUMN IF NOT EXISTS packing_list jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_trip_plans_user_id ON public.trip_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_plans_dates ON public.trip_plans(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_trip_plans_status ON public.trip_plans(status);
CREATE INDEX IF NOT EXISTS idx_trip_plans_share_code ON public.trip_plans(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_trip_id ON public.trip_plan_items(trip_plan_id);
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_day_order ON public.trip_plan_items(trip_plan_id, day_number, order_index);

ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_items ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Owner-only RLS
-- ============================================

DROP POLICY IF EXISTS "Users can view own trip plans" ON public.trip_plans;
DROP POLICY IF EXISTS "Users can create own trip plans" ON public.trip_plans;
DROP POLICY IF EXISTS "Users can update own trip plans" ON public.trip_plans;
DROP POLICY IF EXISTS "Users can delete own trip plans" ON public.trip_plans;
DROP POLICY IF EXISTS "Users can view trip plan items" ON public.trip_plan_items;
DROP POLICY IF EXISTS "Users can manage own trip plan items" ON public.trip_plan_items;

CREATE POLICY "Users can view own trip plans"
ON public.trip_plans FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own trip plans"
ON public.trip_plans FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trip plans"
ON public.trip_plans FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trip plans"
ON public.trip_plans FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view trip plan items"
ON public.trip_plan_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
      AND tp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage own trip plan items"
ON public.trip_plan_items FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
      AND tp.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
      AND tp.user_id = auth.uid()
  )
);

-- ============================================
-- 3. Triggers: immutable columns, updated_at
-- ============================================

-- user_id, ai_generated, created_at and share_code are set once, by
-- generate-itinerary (service role). An owner may edit the title or dates,
-- not move the plan to another account or relabel it as hand-made.
CREATE OR REPLACE FUNCTION public.trip_plans_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.ai_generated IS DISTINCT FROM OLD.ai_generated
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.share_code IS DISTINCT FROM OLD.share_code THEN
    RAISE EXCEPTION 'user_id, ai_generated, created_at and share_code cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_plans_guard_immutable ON public.trip_plans;
CREATE TRIGGER trip_plans_guard_immutable
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW
EXECUTE FUNCTION public.trip_plans_guard_immutable();

CREATE OR REPLACE FUNCTION public.update_trip_plans_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_trip_plans_timestamp ON public.trip_plans;
CREATE TRIGGER update_trip_plans_timestamp
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_trip_plans_timestamp();

CREATE OR REPLACE FUNCTION public.update_trip_plan_items_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_trip_plan_items_timestamp ON public.trip_plan_items;
CREATE TRIGGER update_trip_plan_items_timestamp
BEFORE UPDATE ON public.trip_plan_items
FOR EACH ROW
EXECUTE FUNCTION public.update_trip_plan_items_timestamp();

-- ============================================
-- 4. Share code: 80 random bits, service role only
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_trip_share_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := lower(encode(extensions.gen_random_bytes(10), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.trip_plans WHERE share_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_trip_share_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_trip_share_code() TO service_role;

-- ============================================
-- 5. get_trip_itinerary: INVOKER, a.type, coordinates, restaurant slug
-- ============================================

CREATE OR REPLACE FUNCTION public.get_trip_itinerary(p_trip_id uuid)
RETURNS TABLE (
  item_id UUID,
  day_number INTEGER,
  order_index INTEGER,
  item_type TEXT,
  title TEXT,
  description TEXT,
  location TEXT,
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER,
  notes TEXT,
  estimated_cost TEXT,
  booking_url TEXT,
  is_confirmed BOOLEAN,
  ai_suggested BOOLEAN,
  ai_reason TEXT,
  content_details JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tpi.id AS item_id,
    tpi.day_number,
    tpi.order_index,
    tpi.item_type,
    COALESCE(e.title, r.name, a.name, tpi.custom_title) AS title,
    COALESCE(e.enhanced_description, e.original_description, r.description, a.description, tpi.custom_description) AS description,
    COALESCE(e.location, r.location, a.location, tpi.custom_location) AS location,
    tpi.start_time,
    tpi.end_time,
    tpi.duration_minutes,
    tpi.notes,
    tpi.estimated_cost,
    tpi.booking_url,
    tpi.is_confirmed,
    tpi.ai_suggested,
    tpi.ai_reason,
    CASE
      WHEN tpi.event_id IS NOT NULL THEN
        jsonb_build_object(
          'type', 'event',
          'id', e.id,
          'title', e.title,
          'date', e.date,
          'venue', e.venue,
          'category', e.category,
          'price', e.price,
          'image_url', e.image_url,
          'latitude', e.latitude,
          'longitude', e.longitude
        )
      WHEN tpi.restaurant_id IS NOT NULL THEN
        jsonb_build_object(
          'type', 'restaurant',
          'id', r.id,
          'name', r.name,
          'slug', r.slug,
          'cuisine', r.cuisine,
          'price_range', r.price_range,
          'rating', r.rating,
          'image_url', r.image_url,
          'latitude', r.latitude,
          'longitude', r.longitude
        )
      WHEN tpi.attraction_id IS NOT NULL THEN
        jsonb_build_object(
          'type', 'attraction',
          'id', a.id,
          'name', a.name,
          'category', a.type,
          'image_url', a.image_url,
          'latitude', a.latitude,
          'longitude', a.longitude
        )
      ELSE NULL
    END AS content_details
  FROM public.trip_plan_items tpi
  LEFT JOIN public.events e ON tpi.event_id = e.id
  LEFT JOIN public.restaurants r ON tpi.restaurant_id = r.id
  LEFT JOIN public.attractions a ON tpi.attraction_id = a.id
  WHERE tpi.trip_plan_id = p_trip_id
  ORDER BY tpi.day_number, tpi.order_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trip_itinerary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_itinerary(uuid) TO authenticated, service_role;

-- ============================================
-- 6. reorder_trip_items: one statement, ownership through RLS
-- ============================================

-- The iOS client used to upsert {id, order_index}, which Postgres rejects:
-- the proposed insert row lacks the NOT NULL trip_plan_id / day_number /
-- item_type, and that is checked before conflict arbitration. Every id must
-- belong to p_trip_id's p_day and be visible under RLS, or nothing changes.
CREATE OR REPLACE FUNCTION public.reorder_trip_items(p_trip_id uuid, p_day int, p_item_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.trip_plan_items t
     SET order_index = o.ord - 1
    FROM unnest(p_item_ids) WITH ORDINALITY AS o(id, ord)
   WHERE t.id = o.id
     AND t.trip_plan_id = p_trip_id
     AND t.day_number = p_day;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated IS DISTINCT FROM coalesce(cardinality(p_item_ids), 0) THEN
    RAISE EXCEPTION 'reorder_trip_items: % of % stops matched', v_updated, coalesce(cardinality(p_item_ids), 0)
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_trip_items(uuid, int, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_trip_items(uuid, int, uuid[]) TO authenticated;

-- ============================================
-- 7. Generation ledger (service role writes, nobody else touches)
-- ============================================

CREATE TABLE IF NOT EXISTS public.trip_plan_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_plan_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_plan_generations_user_created
  ON public.trip_plan_generations (user_id, created_at);

ALTER TABLE public.trip_plan_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_plan_generations FROM anon, authenticated;

-- ============================================
-- 8. This month's usage for the caller (Central-time month)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_trip_planner_usage()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.trip_plan_generations
   WHERE user_id = auth.uid()
     AND created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago');
$$;

REVOKE EXECUTE ON FUNCTION public.get_trip_planner_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_planner_usage() TO authenticated;
