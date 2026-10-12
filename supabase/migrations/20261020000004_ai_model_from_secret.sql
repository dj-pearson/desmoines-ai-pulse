-- The Claude model now comes from the DEFAULT_AI_MODEL / LIGHTWEIGHT_AI_MODEL
-- edge-function secrets (supabase/functions/_shared/aiModel.ts), not from the
-- database.
--
-- ai_configuration: the default_model and lightweight_model rows are no longer
-- read by any edge function. They stay (the admin screen lists them and the
-- rest of the table is still read for tokens, temperatures, endpoint and API
-- version); only their description changes, so nobody edits a value expecting
-- it to move production. setting_value is left alone.
--
-- ai_model_configurations: read by no code at all (no edge function, no app
-- query). Rows for retired models are marked inactive with a reason so the
-- table stops presenting them as usable. No row is deleted.
--
-- Additive and idempotent: re-running changes nothing further. Each block is a
-- no-op when its table or columns are absent.
DO $$
BEGIN
  IF to_regclass('public.ai_configuration') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_configuration' AND column_name = 'description'
     ) THEN
    UPDATE public.ai_configuration
       SET description = 'Superseded: edge functions use the DEFAULT_AI_MODEL secret. This value is not read.'
     WHERE setting_key = 'default_model'
       AND description IS DISTINCT FROM 'Superseded: edge functions use the DEFAULT_AI_MODEL secret. This value is not read.';

    UPDATE public.ai_configuration
       SET description = 'Superseded: edge functions use the LIGHTWEIGHT_AI_MODEL secret (falling back to DEFAULT_AI_MODEL). This value is not read.'
     WHERE setting_key = 'lightweight_model'
       AND description IS DISTINCT FROM 'Superseded: edge functions use the LIGHTWEIGHT_AI_MODEL secret (falling back to DEFAULT_AI_MODEL). This value is not read.';
  END IF;

  IF to_regclass('public.ai_model_configurations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_model_configurations' AND column_name = 'deprecation_reason'
     ) THEN
    UPDATE public.ai_model_configurations
       SET is_active = false,
           deprecation_reason = 'Retired by Anthropic; requests fail. Edge functions use the DEFAULT_AI_MODEL / LIGHTWEIGHT_AI_MODEL secrets.'
     WHERE model_name IN (
             'claude-3-haiku-20240307',
             'claude-3-5-haiku-20241022',
             'claude-3-5-sonnet-20241022',
             'claude-sonnet-4-20250514'
           )
       AND (is_active IS DISTINCT FROM false OR deprecation_reason IS NULL);
  END IF;
END
$$;
