-- WEB-AUTO-007: AI article pipeline (topic -> draft -> quality gate -> auto-publish).
-- Additive only (CLAUDE.md): new nullable columns on articles + a pause toggle.

-- Provenance + quality columns so the admin can see which articles the pipeline
-- produced and how they scored. Nullable / default-false so old readers (web +
-- mobile) are unaffected.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS is_auto_published boolean NOT NULL DEFAULT false;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS quality_score integer;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS pipeline_reasons text[];

-- Single config flag so an admin can pause the pipeline without a code change.
-- Reuses the existing feature_flags table (20260221000000). enabled=true => runs.
INSERT INTO public.feature_flags (flag_key, enabled, description, target_tiers)
VALUES (
  'ai_article_pipeline_enabled',
  true,
  'When enabled, the daily AI article pipeline auto-generates, scores, and publishes a local SEO article (cap 1/day). Disable to pause.',
  ARRAY['admin']
)
ON CONFLICT (flag_key) DO NOTHING;
