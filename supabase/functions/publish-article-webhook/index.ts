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
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

/**
 * Webhook signature (WEB-BE-009).
 *
 * When ARTICLE_WEBHOOK_SECRET is set, every outbound delivery carries an
 * `X-Webhook-Signature: sha256=<hex>` header. The value is an HMAC-SHA256, in
 * lowercase hex, computed over the EXACT UTF-8 bytes of the JSON request body
 * (the same string we POST — do not re-serialize before verifying).
 *
 * Receivers verify by recomputing HMAC-SHA256(secret, rawBody) and comparing
 * (constant-time) against the hex after `sha256=`. Node example:
 *   const expected = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
 *   const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
 *
 * The header is ADDITIVE — receivers that ignore it keep working, and if the
 * secret is unset we log a warning and send unsigned rather than break them.
 */
async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True for transient failures worth retrying: network error, 429, or 5xx. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    // WEB-QA-001 / WEB-BE-032. This read `ssrfResult.safe` and `.reason`.
    // validateURLForSSRF returns { valid, error, url } and has never returned
    // either of those names, so `.safe` was always undefined, `!undefined` was
    // always true, and this DEPLOYED function rejected every webhook URL with
    // the message "Invalid webhook URL: undefined". Fail-closed, so not an SSRF
    // hole - but it means article publishing through this endpoint has never
    // worked. Every other caller of validateURLForSSRF in this repo reads
    // `.valid`; only this one did not, and nothing type-checked it.
    //
    // The options now match test-article-webhook's, which is the sibling that
    // got this right: https only, private IPs blocked. That is a tightening on
    // paper and a loosening in practice, since the previous behaviour was to
    // reject everything.
    const ssrfResult = validateURLForSSRF(webhookUrl, {
      allowedProtocols: ['https:'],
      blockPrivateIPs: true,
    });
    if (!ssrfResult.valid) {
      return new Response(
        JSON.stringify({ error: `Invalid webhook URL: ${ssrfResult.error}` }),
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

    // Serialize once so the signature covers the EXACT bytes we transmit.
    const rawBody = JSON.stringify(webhookPayload);

    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Sign the payload when a shared secret is configured (WEB-BE-009).
    // Falls back gracefully to unsigned delivery so existing receivers keep working.
    const webhookSecret = Deno.env.get('ARTICLE_WEBHOOK_SECRET');
    if (webhookSecret) {
      const signature = await signPayload(webhookSecret, rawBody);
      webhookHeaders['X-Webhook-Signature'] = `sha256=${signature}`;
    } else {
      console.warn('ARTICLE_WEBHOOK_SECRET not set — sending webhook without signature');
    }

    // Deliver with a hard timeout and bounded retry with exponential backoff.
    // Retry only transient failures (network error / 429 / 5xx); never 4xx.
    const maxAttempts = 3;
    const backoffMs = [500, 1000, 2000];
    let webhookResponse: Response | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let transient = false;
      try {
        webhookResponse = await fetchWithTimeout(webhookUrl, {
          method: 'POST',
          headers: webhookHeaders,
          body: rawBody,
        });

        if (webhookResponse.ok) {
          lastError = undefined;
          break;
        }

        // Permanent 4xx: don't retry — fail immediately.
        if (!isTransientStatus(webhookResponse.status)) {
          console.error('Webhook delivery failed (permanent):', webhookResponse.status);
          throw new Error('Webhook delivery failed');
        }

        // Transient status (429 / 5xx) — eligible for retry.
        transient = true;
        lastError = new Error(`Webhook delivery failed with status ${webhookResponse.status}`);
        console.warn(`Webhook delivery attempt ${attempt}/${maxAttempts} failed with status ${webhookResponse.status}`);
      } catch (err) {
        // A thrown permanent-failure error must propagate, not be retried.
        if (err instanceof Error && err.message === 'Webhook delivery failed') throw err;
        // Network error / timeout — transient.
        transient = true;
        lastError = err;
        console.warn(`Webhook delivery attempt ${attempt}/${maxAttempts} errored:`, err);
      }

      if (transient && attempt < maxAttempts) {
        await sleep(backoffMs[attempt - 1]);
      }
    }

    if (!webhookResponse || !webhookResponse.ok) {
      console.error('Webhook delivery failed after retries:', lastError);
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
