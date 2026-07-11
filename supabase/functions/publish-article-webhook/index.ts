/**
 * Publish Article Webhook Edge Function
 *
 * Generates social media descriptions for articles using Claude API,
 * then sends a webhook payload with article metadata.
 *
 * Security: Requires API key auth, SSRF protection on webhook URLs,
 * rate limited to 10 requests per 15 minutes.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireApiKey } from "../_shared/apiKeyAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { validateURLForSSRF } from "../_shared/validation.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Require API key authentication (SEC-020)
  const authResponse = requireApiKey(req, corsHeaders);
  if (authResponse) return authResponse;

  // Rate limiting: 10 requests per 15 minutes (SEC-020)
  const rateLimit = checkRateLimit(req, {
    max: 10,
    message: "Too many webhook requests. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const { articleId, webhookUrl } = await req.json();

    // Validate webhook URL against SSRF (SEC-020)
    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return new Response(
        JSON.stringify({ error: "webhookUrl is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ssrfResult = validateURLForSSRF(webhookUrl);
    if (!ssrfResult.safe) {
      return new Response(
        JSON.stringify({ error: `Invalid webhook URL: ${ssrfResult.reason}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get article data
    const { data: article, error: articleError } = await supabaseClient
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (articleError) throw articleError;

    console.log('Processing article for webhook:', article.title);

    // Get AI configuration
    const aiConfig = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const claudeApiKey = getAnthropicApiKey();

    if (!claudeApiKey) {
      throw new Error('Claude API key not configured');
    }

    // Generate social media descriptions using AI
    const prompt = `Based on this article, generate two social media descriptions:

Article Title: ${article.title}
Article Content: ${article.content}
Article Excerpt: ${article.excerpt || ''}
Keywords: ${article.seo_keywords?.join(', ') || ''}

Generate:
1. A short description (280 characters max) suitable for Twitter
2. A longer description (500 characters max) suitable for Facebook

Return ONLY a JSON object with this exact structure:
{
  "short_description": "your twitter description here",
  "long_description": "your facebook description here"
}`;

    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);

    const aiResponse = await fetch(aiConfig.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiConfig.default_model,
        max_tokens: aiConfig.max_tokens_standard,
        temperature: aiConfig.temperature_creative,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error('AI content generation failed');
    }

    const aiData = await aiResponse.json();
    const extracted = extractClaudeText(aiData);
    if (!extracted.ok) {
      console.error("Claude response not usable:", extracted.reason, extracted.detail);
      throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
    }
    const aiContent = extracted.text;

    // Parse AI response
    let descriptions;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        descriptions = JSON.parse(jsonMatch[0]);
      } else {
        descriptions = JSON.parse(aiContent);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      descriptions = {
        short_description: article.excerpt?.substring(0, 280) || article.title,
        long_description: article.excerpt || article.content.substring(0, 500)
      };
    }

    // Prepare webhook payload
    const articleUrl = `https://desmoinesinsider.com/articles/${article.slug}`;

    const webhookPayload = {
      article_id: article.id,
      article_title: article.title,
      article_url: articleUrl,
      short_description: descriptions.short_description,
      long_description: descriptions.long_description,
      excerpt: article.excerpt,
      category: article.category,
      tags: article.tags,
      seo_keywords: article.seo_keywords,
      featured_image_url: article.featured_image_url,
      published_at: article.published_at,
      author_id: article.author_id
    };

    console.log('Sending webhook to:', webhookUrl);

    // Send webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!webhookResponse.ok) {
      console.error('Webhook delivery failed:', webhookResponse.status);
      throw new Error('Webhook delivery failed');
    }

    console.log('Webhook delivered successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook delivered successfully',
        payload: webhookPayload
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in publish-article-webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
