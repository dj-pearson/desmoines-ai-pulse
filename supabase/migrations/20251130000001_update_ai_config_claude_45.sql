-- Update AI Configuration to Claude 4.5 Sonnet
-- This migration updates the default AI model to Claude 4.5 Sonnet (claude-sonnet-4-5-20250929)
-- which provides improved performance for event extraction and content generation.

-- Update the default_model setting if it exists
UPDATE ai_configuration
SET setting_value = 'claude-sonnet-4-5-20250929',
    updated_at = NOW()
WHERE setting_key = 'default_model';

-- Insert if not exists (in case the setting doesn't exist yet)
INSERT INTO ai_configuration (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'default_model',
    'claude-sonnet-4-5-20250929',
    'Default AI model for content extraction and generation (Claude 4.5 Sonnet)',
    NOW(),
    NOW()
)
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();

-- Ensure lightweight_model is set for faster operations
INSERT INTO ai_configuration (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'lightweight_model',
    'claude-haiku-4-5-20251001',
    'Lightweight AI model for quick queries and NLP search (Claude Haiku 4.5)',
    NOW(),
    NOW()
)
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    updated_at = NOW();

-- Log the update
DO $$
BEGIN
    RAISE NOTICE 'AI Configuration updated to use Claude 4.5 Sonnet as default model';
END $$;
