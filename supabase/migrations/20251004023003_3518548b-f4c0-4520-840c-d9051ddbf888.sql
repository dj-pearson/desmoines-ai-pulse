-- Create ai_models table to store available AI models
CREATE TABLE IF NOT EXISTS public.ai_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT,
  context_window INTEGER,
  max_output_tokens INTEGER,
  supports_vision BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- Admins can manage models
CREATE POLICY "Admins can manage AI models"
ON public.ai_models
FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

-- Anyone can view active models
CREATE POLICY "Anyone can view active AI models"
ON public.ai_models
FOR SELECT
USING (is_active = true);

-- Insert default models based on Claude documentation
INSERT INTO public.ai_models (model_id, model_name, provider, description, context_window, max_output_tokens, supports_vision, is_active) VALUES
  ('claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 'Anthropic', 'Our best model for complex agents and coding, with the highest intelligence across most tasks', 200000, 64000, true, true),
  ('claude-sonnet-4-20250514', 'Claude Sonnet 4', 'Anthropic', 'High-performance model with balanced performance', 200000, 64000, true, true),
  ('claude-3-7-sonnet-20250219', 'Claude Sonnet 3.7', 'Anthropic', 'High-performance model with early extended thinking', 200000, 64000, true, true),
  ('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'Anthropic', 'Exceptional model for specialized complex tasks requiring advanced reasoning', 200000, 32000, true, true),
  ('claude-opus-4-20250514', 'Claude Opus 4', 'Anthropic', 'Previous flagship model with very high intelligence', 200000, 32000, true, true),
  ('claude-3-5-haiku-20241022', 'Claude Haiku 3.5', 'Anthropic', 'Our fastest model with intelligence at blazing speeds', 200000, 8192, true, true),
  ('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'Google', 'Balanced choice: good on multimodal + reasoning', 1000000, 8192, true, true),
  ('google/gemini-2.5-pro', 'Gemini 2.5 Pro', 'Google', 'Top-tier Gemini model for complex reasoning', 2000000, 8192, true, true),
  ('google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'Google', 'Fastest Gemini model for simple workloads', 1000000, 8192, true, true),
  ('openai/gpt-5', 'GPT-5', 'OpenAI', 'Powerful all-rounder with excellent reasoning', 128000, 16384, true, true),
  ('openai/gpt-5-mini', 'GPT-5 Mini', 'OpenAI', 'Middle ground with strong performance at lower cost', 128000, 16384, true, true),
  ('openai/gpt-5-nano', 'GPT-5 Nano', 'OpenAI', 'Designed for speed and cost saving', 128000, 4096, true, true);

-- Create index for faster lookups
CREATE INDEX idx_ai_models_provider ON public.ai_models(provider);
CREATE INDEX idx_ai_models_active ON public.ai_models(is_active) WHERE is_active = true;