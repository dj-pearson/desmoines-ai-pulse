-- Re-apply the AI Trip Planner schema (WEB-QA-018 ledger drift).
--
-- 20251126000001_add_ai_trip_planner_nlp_search.sql is recorded in
-- supabase_migrations.schema_migrations and produced NOTHING. Verified against
-- scripts/db-snapshot.json (captured 2026-08-24): trip_plans, trip_plan_items
-- and get_trip_itinerary are all absent, and so are the three columns the same
-- file adds to search_analytics (nlp_parsed, model_used, response_time_ms).
-- Nothing in that file landed, so it aborted at or before its first statement
-- or was never executed and only the ledger row was written. Either way
-- `supabase db push` will never run it again, which is why this is a new file
-- rather than an edit to the old one.
--
-- What it costs today:
--   * The Insider tier's headline feature is dead. Pricing.tsx sells "AI Trip
--     Planner (5 trips/month)" at $4.99/mo and "Unlimited AI Trip Planner" at
--     $12.99/mo. generate-itinerary probes trip_plans before spending a model
--     call and returns "Trip planning is temporarily unavailable" every time.
--   * nlp-search's analytics insert names nlp_parsed / model_used /
--     response_time_ms and is wrapped in .catch(console.warn), so every NLP
--     search silently fails to log. search_analytics has no NLP rows at all.
--
-- Everything here is additive (CREATE TABLE / INDEX / POLICY / FUNCTION /
-- TRIGGER, ADD COLUMN NULL), so it is safe in a single release under the
-- Backward Compatibility rules in CLAUDE.md. The DROP POLICY / DROP TRIGGER
-- statements exist only to make the file re-runnable; they drop nothing that
-- exists in production today.
--
-- One deliberate change from the original: get_trip_itinerary was SECURITY
-- DEFINER with no authorization check and no pinned search_path, so any caller
-- who knew a trip id could read a private itinerary straight through RLS. It is
-- SECURITY INVOKER here, which makes the trip_plan_items policies below the
-- authority. Nothing can depend on the old behavior because the function has
-- never existed in production.

-- ============================================
-- 1. AI configuration used by the NLP parser
-- ============================================

INSERT INTO public.ai_configuration (setting_key, setting_value, description) VALUES
  ('lightweight_model', '"claude-haiku-4-5-20251001"', 'Fast/cheap model for simple queries like NLP search parsing'),
  ('max_tokens_lightweight', '1000', 'Max tokens for lightweight operations (search parsing, quick responses)')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- 2. Trip planner tables
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

CREATE INDEX IF NOT EXISTS idx_trip_plans_user_id ON public.trip_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_plans_dates ON public.trip_plans(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_trip_plans_status ON public.trip_plans(status);
CREATE INDEX IF NOT EXISTS idx_trip_plans_share_code ON public.trip_plans(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_trip_id ON public.trip_plan_items(trip_plan_id);
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_day_order ON public.trip_plan_items(trip_plan_id, day_number, order_index);

ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own trip plans" ON public.trip_plans;
CREATE POLICY "Users can view own trip plans"
ON public.trip_plans FOR SELECT
USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can create own trip plans" ON public.trip_plans;
CREATE POLICY "Users can create own trip plans"
ON public.trip_plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own trip plans" ON public.trip_plans;
CREATE POLICY "Users can update own trip plans"
ON public.trip_plans FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own trip plans" ON public.trip_plans;
CREATE POLICY "Users can delete own trip plans"
ON public.trip_plans FOR DELETE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view trip plan items" ON public.trip_plan_items;
CREATE POLICY "Users can view trip plan items"
ON public.trip_plan_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
    AND (tp.user_id = auth.uid() OR tp.is_public = true)
  )
);

DROP POLICY IF EXISTS "Users can manage own trip plan items" ON public.trip_plan_items;
CREATE POLICY "Users can manage own trip plan items"
ON public.trip_plan_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
    AND tp.user_id = auth.uid()
  )
);

-- ============================================
-- 3. NLP search analytics columns
-- ============================================

ALTER TABLE public.search_analytics ADD COLUMN IF NOT EXISTS nlp_parsed JSONB;
ALTER TABLE public.search_analytics ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE public.search_analytics ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

-- ============================================
-- 4. Helper functions
-- ============================================

-- Share codes are generated here and enforced by the UNIQUE constraint on
-- trip_plans.share_code; this loop only avoids the round trip of a failed
-- insert. Invoker rights, so under RLS it sees the caller's own rows - the
-- constraint, not this count, is what guarantees uniqueness.
CREATE OR REPLACE FUNCTION public.generate_trip_share_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  code TEXT;
  exists_count INTEGER;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text), 1, 8));
    SELECT COUNT(*) INTO exists_count FROM public.trip_plans WHERE share_code = code;
    IF exists_count = 0 THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$function$;

-- SECURITY INVOKER on purpose: the trip_plan_items policies above decide who
-- can read an itinerary. See the header.
CREATE OR REPLACE FUNCTION public.get_trip_itinerary(p_trip_id UUID)
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
SET search_path TO 'public', 'pg_temp'
AS $function$
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
          'image_url', e.image_url
        )
      WHEN tpi.restaurant_id IS NOT NULL THEN
        jsonb_build_object(
          'type', 'restaurant',
          'id', r.id,
          'name', r.name,
          'cuisine', r.cuisine,
          'price_range', r.price_range,
          'rating', r.rating,
          'image_url', r.image_url
        )
      WHEN tpi.attraction_id IS NOT NULL THEN
        jsonb_build_object(
          'type', 'attraction',
          'id', a.id,
          'name', a.name,
          'category', a.category,
          'image_url', a.image_url
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
$function$;

-- ============================================
-- 5. updated_at triggers
-- ============================================

CREATE OR REPLACE FUNCTION public.update_trip_plans_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_trip_plans_timestamp ON public.trip_plans;
CREATE TRIGGER update_trip_plans_timestamp
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_trip_plans_timestamp();

CREATE OR REPLACE FUNCTION public.update_trip_plan_items_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_trip_plan_items_timestamp ON public.trip_plan_items;
CREATE TRIGGER update_trip_plan_items_timestamp
BEFORE UPDATE ON public.trip_plan_items
FOR EACH ROW
EXECUTE FUNCTION public.update_trip_plan_items_timestamp();

-- ============================================
-- 6. Documentation
-- ============================================

COMMENT ON TABLE public.trip_plans IS 'Stores user trip/itinerary plans with AI generation support';
COMMENT ON TABLE public.trip_plan_items IS 'Individual activities within a trip plan';
COMMENT ON COLUMN public.trip_plans.preferences IS 'JSON object containing user preferences for trip planning';
COMMENT ON COLUMN public.trip_plan_items.ai_reason IS 'AI explanation for why this item was suggested';
COMMENT ON COLUMN public.search_analytics.nlp_parsed IS 'JSON structure of NLP-parsed search intent';
