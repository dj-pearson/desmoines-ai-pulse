import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAIConfig, getClaudeHeaders } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { model, testPrompt } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Resolve model: request param or default from AI configuration
    let effectiveModel = model as string | undefined;
    if (!effectiveModel) {
      const cfg = await getAIConfig(supabaseUrl, supabaseKey);
      effectiveModel = cfg.default_model;
    }

    if (!effectiveModel) {
      throw new Error('No model specified and default_model is not configured');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') || Deno.env.get('CLAUDE_API');
    
    // Determine which API to use based on model prefix
    let response;
    let generatedText = '';

    if (effectiveModel.startsWith('google/') || effectiveModel.startsWith('openai/')) {
      // Use Lovable AI Gateway
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY not configured');
      }

      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: 'system', content: 'You are a helpful assistant for testing AI model connectivity.' },
            { role: 'user', content: testPrompt || 'Respond with a brief test message to confirm the model is working.' }
          ],
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      generatedText = data.choices?.[0]?.message?.content || '';

    } else if (effectiveModel.startsWith('claude')) {
      // Use Anthropic API directly
      const claudeKey = CLAUDE_API_KEY;
      if (!claudeKey) {
        throw new Error('Claude API key not configured (expected CLAUDE_API_KEY or CLAUDE_API)');
      }

      const headers = await getClaudeHeaders(claudeKey, supabaseUrl, supabaseKey);

      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: 150,
          messages: [
            { role: 'user', content: testPrompt || 'Respond with a brief test message to confirm the model is working.' }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      generatedText = data.content?.[0]?.text || '';
    } else {
      throw new Error(`Unsupported model prefix: ${effectiveModel}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        model: effectiveModel,
        generatedText: generatedText,
        message: 'Model test successful',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing AI model:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});