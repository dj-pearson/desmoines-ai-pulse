-- Migration: Add AI Trip Planner and NLP Search Features
-- This migration adds:
-- 1. Lightweight AI model configuration for fast/cheap NLP parsing
-- 2. Trip planner tables for itinerary storage
-- 3. NLP search history and analytics

-- ============================================
-- 1. ADD LIGHTWEIGHT MODEL CONFIGURATION
-- ============================================

-- Add lightweight model settings to ai_configuration
INSERT INTO public.ai_configuration (setting_key, setting_value, description) VALUES
('lightweight_model', '"claude-haiku-4-5-20251001"', 'Fast/cheap model for simple queries like NLP search parsing'),
('max_tokens_lightweight', '1000', 'Max tokens for lightweight operations (search parsing, quick responses)')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- 2. TRIP PLANNER TABLES
-- ============================================

-- Create trip_plans table to store user itineraries
CREATE TABLE IF NOT EXISTS public.trip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  preferences JSONB DEFAULT '{}'::jsonb,
  -- Preferences structure:
  -- {
  --   "interests": ["music", "food", "outdoors"],
  --   "budget": "moderate",
  --   "pace": "relaxed" | "moderate" | "packed",
  --   "accessibility_needs": ["wheelchair", "hearing"],
  --   "dietary_restrictions": ["vegan", "gluten-free"],
  --   "group_size": 2,
  --   "has_children": true,
  --   "child_ages": [5, 8]
  -- }
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'in_progress', 'completed', 'archived')),
  is_public BOOLEAN DEFAULT false,
  share_code TEXT UNIQUE,
  ai_generated BOOLEAN DEFAULT false,
  total_estimated_cost TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create trip_plan_items for individual activities in an itinerary
CREATE TABLE IF NOT EXISTS public.trip_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_plan_id UUID NOT NULL REFERENCES public.trip_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('event', 'restaurant', 'attraction', 'custom', 'transport', 'break')),
  -- Foreign keys to content (null for custom items)
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  attraction_id UUID REFERENCES public.attractions(id) ON DELETE SET NULL,
  -- Custom item details (for non-linked items)
  custom_title TEXT,
  custom_description TEXT,
  custom_location TEXT,
  -- Timing
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER,
  -- Additional details
  notes TEXT,
  estimated_cost TEXT,
  booking_url TEXT,
  is_confirmed BOOLEAN DEFAULT false,
  ai_suggested BOOLEAN DEFAULT false,
  ai_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_plans_user_id ON public.trip_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_plans_dates ON public.trip_plans(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_trip_plans_status ON public.trip_plans(status);
CREATE INDEX IF NOT EXISTS idx_trip_plans_share_code ON public.trip_plans(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_trip_id ON public.trip_plan_items(trip_plan_id);
CREATE INDEX IF NOT EXISTS idx_trip_plan_items_day_order ON public.trip_plan_items(trip_plan_id, day_number, order_index);

-- Enable RLS
ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plan_items ENABLE ROW LEVEL SECURITY;

-- Trip plans policies
CREATE POLICY "Users can view own trip plans"
ON public.trip_plans FOR SELECT
USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own trip plans"
ON public.trip_plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trip plans"
ON public.trip_plans FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trip plans"
ON public.trip_plans FOR DELETE
USING (auth.uid() = user_id);

-- Trip plan items policies (inherit from parent trip plan)
CREATE POLICY "Users can view trip plan items"
ON public.trip_plan_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_plans tp
    WHERE tp.id = trip_plan_id
    AND (tp.user_id = auth.uid() OR tp.is_public = true)
  )
);

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
-- 3. NLP SEARCH ANALYTICS
-- ============================================

-- Add NLP-specific fields to search_analytics if they don't exist
DO $$
BEGIN
  -- Add nlp_parsed column to track NLP-parsed queries
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'search_analytics' AND column_name = 'nlp_parsed'
  ) THEN
    ALTER TABLE public.search_analytics ADD COLUMN nlp_parsed JSONB;
  END IF;

  -- Add model_used column to track which AI model was used
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'search_analytics' AND column_name = 'model_used'
  ) THEN
    ALTER TABLE public.search_analytics ADD COLUMN model_used TEXT;
  END IF;

  -- Add response_time_ms column to track performance
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'search_analytics' AND column_name = 'response_time_ms'
  ) THEN
    ALTER TABLE public.search_analytics ADD COLUMN response_time_ms INTEGER;
  END IF;
END $$;

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function to generate a unique share code for trip plans
CREATE OR REPLACE FUNCTION generate_trip_share_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
  exists_count INTEGER;
BEGIN
  LOOP
    -- Generate a random 8-character alphanumeric code
    code := upper(substr(md5(random()::text), 1, 8));

    -- Check if it already exists
    SELECT COUNT(*) INTO exists_count FROM public.trip_plans WHERE share_code = code;

    IF exists_count = 0 THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get itinerary with full item details
CREATE OR REPLACE FUNCTION get_trip_itinerary(p_trip_id UUID)
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
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tpi.id as item_id,
    tpi.day_number,
    tpi.order_index,
    tpi.item_type,
    COALESCE(e.title, r.name, a.name, tpi.custom_title) as title,
    COALESCE(e.enhanced_description, e.original_description, r.description, a.description, tpi.custom_description) as description,
    COALESCE(e.location, r.location, a.location, tpi.custom_location) as location,
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
    END as content_details
  FROM public.trip_plan_items tpi
  LEFT JOIN public.events e ON tpi.event_id = e.id
  LEFT JOIN public.restaurants r ON tpi.restaurant_id = r.id
  LEFT JOIN public.attractions a ON tpi.attraction_id = a.id
  WHERE tpi.trip_plan_id = p_trip_id
  ORDER BY tpi.day_number, tpi.order_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. TRIGGERS
-- ============================================

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_trip_plans_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trip_plans_timestamp
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW
EXECUTE FUNCTION update_trip_plans_timestamp();

CREATE OR REPLACE FUNCTION update_trip_plan_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trip_plan_items_timestamp
BEFORE UPDATE ON public.trip_plan_items
FOR EACH ROW
EXECUTE FUNCTION update_trip_plan_items_timestamp();

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.trip_plans IS 'Stores user trip/itinerary plans with AI generation support';
COMMENT ON TABLE public.trip_plan_items IS 'Individual activities within a trip plan';
COMMENT ON COLUMN public.trip_plans.preferences IS 'JSON object containing user preferences for trip planning';
COMMENT ON COLUMN public.trip_plan_items.ai_reason IS 'AI explanation for why this item was suggested';
COMMENT ON COLUMN public.search_analytics.nlp_parsed IS 'JSON structure of NLP-parsed search intent';
