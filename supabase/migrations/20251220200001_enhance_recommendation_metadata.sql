-- Migration: 20251220200001_enhance_recommendation_metadata.sql
-- Adds new columns to the 'public.personalized_recommendations' table for richer metadata.

ALTER TABLE public.personalized_recommendations
ADD COLUMN IF NOT EXISTS source_algorithm TEXT,
ADD COLUMN IF NOT EXISTS model_version TEXT,
ADD COLUMN IF NOT EXISTS feedback_score INTEGER;

COMMENT ON COLUMN public.personalized_recommendations.source_algorithm IS 'Indicates the algorithm or method used to generate the recommendation (e.g., AI-hybrid, rule-based, trending).';
COMMENT ON COLUMN public.personalized_recommendations.model_version IS 'Stores the version of the AI model used to generate the recommendation, if applicable.';
COMMENT ON COLUMN public.personalized_recommendations.feedback_score IS 'Records user feedback on the recommendation (e.g., +1 for liked, -1 for disliked).';