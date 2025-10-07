-- Create AI configuration table to centralize AI settings across all modules
CREATE TABLE IF NOT EXISTS public.ai_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.ai_configuration ENABLE ROW LEVEL SECURITY;

-- Only admins can manage AI configuration
CREATE POLICY "Admins can manage AI configuration"
ON public.ai_configuration
FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Insert default configuration
INSERT INTO public.ai_configuration (setting_key, setting_value, description) VALUES
('default_model', '"claude-sonnet-4-20250514"', 'Default Claude AI model for all modules'),
('api_endpoint', '"https://api.anthropic.com/v1/messages"', 'Anthropic API endpoint'),
('max_tokens_standard', '2000', 'Default max tokens for standard operations'),
('max_tokens_large', '8000', 'Max tokens for large operations (articles, bulk processing)'),
('temperature_precise', '0.1', 'Temperature for precise extraction tasks'),
('temperature_creative', '0.7', 'Temperature for creative content generation'),
('anthropic_version', '"2023-06-01"', 'Anthropic API version header');

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_configuration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_configuration_timestamp
BEFORE UPDATE ON public.ai_configuration
FOR EACH ROW
EXECUTE FUNCTION update_ai_configuration_timestamp();