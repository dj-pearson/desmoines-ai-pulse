-- Migration: 20251220200000_add_user_behavior_tracking.sql
-- Adds new columns to the 'public.profiles' table to store user behavior data for enhanced recommendations.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS browsing_history_events JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS browsing_history_restaurants JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS search_history JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS explicit_preferences JSONB DEFAULT '{}'::JSONB,
ADD COLUMN IF NOT EXISTS implicit_interest_scores JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.profiles.browsing_history_events IS 'Stores an array of event IDs, timestamps, and interaction types for user browsing behavior.';
COMMENT ON COLUMN public.profiles.browsing_history_restaurants IS 'Stores an array of restaurant IDs, timestamps, and interaction types for user browsing behavior.';
COMMENT ON COLUMN public.profiles.search_history IS 'Stores an array of search queries, timestamps, and results interacted with.';
COMMENT ON COLUMN public.profiles.explicit_preferences IS 'Stores user-explicitly selected preferences (e.g., favorite cuisines, event categories).';
COMMENT ON COLUMN public.profiles.implicit_interest_scores IS 'Stores AI-derived scores for user interests based on behavior.';

-- Optional: Add indexes for JSONB columns if specific keys are frequently queried
-- CREATE INDEX IF NOT EXISTS idx_profiles_explicit_preferences ON public.profiles USING GIN (explicit_preferences);
-- CREATE INDEX IF NOT EXISTS idx_profiles_implicit_interest_scores ON public.profiles USING GIN (implicit_interest_scores);