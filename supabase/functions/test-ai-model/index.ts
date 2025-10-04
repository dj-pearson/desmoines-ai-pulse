import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    
    if (!model) {
      throw new Error('Model parameter is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');
    
    // Determine which API to use based on model prefix
    let response;
    let generatedText = '';
    
    if (model.startsWith('google/') || model.startsWith('openai/')) {
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
          model: model,
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
      
    } else if (model.startsWith('claude-')) {
      // Use Anthropic API directly
      if (!CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY not configured');
      }
      
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
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
      throw new Error(`Unsupported model prefix: ${model}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        model: model,
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