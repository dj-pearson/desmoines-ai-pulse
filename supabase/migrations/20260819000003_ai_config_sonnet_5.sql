-- ============================================================================
-- Move the AI configuration default to Claude Sonnet 5
-- ============================================================================
-- public.ai_configuration.default_model drives every edge function that calls
-- getAIConfig() (_shared/aiConfig.ts) - 29 of them. It was last set by
-- 20251130000001_update_ai_config_claude_45.sql to claude-sonnet-4-5-20250929.
--
-- The hardcoded model strings that bypassed that config were the source of the
-- API denial reports: batch-enhance-events, validate-source-urls,
-- restaurant-opening-scraper, moderate-content, triage-event-submission and
-- analyze-competitor each named a retired model id directly
-- (claude-sonnet-4-20250514, claude-3-5-sonnet-20241022,
-- claude-3-haiku-20240307). Those are fixed in code in the same change. This
-- migration moves the config-driven majority to the same model so the two
-- paths do not diverge again.
--
-- Model ids are used exactly as published, with no date suffix.
--
-- lightweight_model moves too. It existed to route cheap work (NLP parsing, SEO
-- snippets) to Haiku, and collapsing it onto the same model as default_model
-- gives up that saving. It is deliberate: one model id across the platform is
-- the requested state. To restore a cheap tier later, set lightweight_model
-- back to a current Haiku id - the calling code already reads the two keys
-- separately, so nothing else has to change.
-- ============================================================================

INSERT INTO public.ai_configuration (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'default_model',
    '"claude-sonnet-5"'::jsonb,
    'Default AI model for content extraction and generation (Claude Sonnet 5)',
    NOW(),
    NOW()
)
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description   = EXCLUDED.description,
    updated_at    = NOW();

INSERT INTO public.ai_configuration (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'lightweight_model',
    '"claude-sonnet-5"'::jsonb,
    'Model for quick queries and NLP parsing. Same id as default_model for now; set a Haiku id here to restore a cheap tier.',
    NOW(),
    NOW()
)
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description   = EXCLUDED.description,
    updated_at    = NOW();

DO $$
DECLARE
  v_default text;
BEGIN
  SELECT setting_value #>> '{}' INTO v_default
  FROM public.ai_configuration WHERE setting_key = 'default_model';
  RAISE NOTICE 'ai_configuration.default_model is now %', v_default;
END
$$;
