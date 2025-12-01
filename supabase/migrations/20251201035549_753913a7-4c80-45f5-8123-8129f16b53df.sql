INSERT INTO ai_configuration (setting_key, setting_value, description)
VALUES ('max_tokens_lightweight', '1000', 'Maximum tokens for lightweight model responses (SEO, NLP parsing)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;