/**
 * SECURITY: verify_jwt = false
 * Reason: Background batch processing job that generates SEO content for listings without user session context
 * Alternative measures: Claude API key validation required for AI calls, database locking prevents concurrent processing conflicts
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { recordAnthropicUsage } from "../_shared/providerUsage.ts";
import { createEventSEOPrompt, createRestaurantSEOPrompt } from './prompts.ts';
import { claimSeoLock, normalizeContentType, releaseSeoLock, selectSeoCandidates, tableFor } from './selection.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIConfig, buildLightweightClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // API key or admin auth (SEC-029). This was requireApiKey alone, which only
  // accepts EDGE_FUNCTION_API_KEY, so the admin SEO tool (SEOTools.tsx), which
  // sends the admin's JWT, got a 401 on every click.
  const authResponse = await requireAdminOrApiKey(req, corsHeaders);
  if (authResponse) return authResponse;

  // Rate limit: 10 AI requests per 15 minutes per client
  const rateLimit = checkRateLimit(req, { max: 10, message: 'AI SEO content rate limit exceeded. Please try again later.' });
  if (!rateLimit.success) {
    return rateLimit.response!;
  }

  try {
    console.log('SEO generation request received');

    const { contentType: rawContentType, batchSize: rawBatchSize = 10 } = await req.json();
    const contentType = normalizeContentType(rawContentType);
    if (!contentType) {
      return new Response(
        JSON.stringify({ error: "contentType must be 'event' or 'restaurant'" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate batchSize bounds (SEC-029)
    const batchSize = Math.min(Math.max(Number(rawBatchSize) || 10, 1), 20);
    if (rawBatchSize !== undefined && (rawBatchSize < 1 || rawBatchSize > 20)) {
      return new Response(
        JSON.stringify({ error: 'batchSize must be between 1 and 20' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Parsed request body successfully:', { contentType, batchSize });
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    console.log('Supabase client created');

    const claudeApiKey = getAnthropicApiKey();
    if (!claudeApiKey) {
      console.error('CLAUDE_API environment variable not found');
      throw new Error('Claude API key not found');
    }

    console.log('Claude API key found, length:', claudeApiKey.length);
    console.log(`Starting SEO content generation for ${contentType}`);

    // Upcoming events (writeup first) or restaurants, skipping rows another
    // run holds. See ./selection.ts.
    let items;
    try {
      items = await selectSeoCandidates(supabaseClient, contentType, batchSize);
    } catch (fetchError) {
      console.error('Database fetch error:', fetchError);
      throw new Error('Failed to fetch items');
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No items need SEO content', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${items.length} items to process`);

    let processedCount = 0;
    const errors = [];

    for (const item of items) {
      try {
        // Claim the row; a lock older than 15 minutes is free (./selection.ts).
        if (!(await claimSeoLock(supabaseClient, contentType, item.id))) {
          console.log(`Item ${item.id} already being processed, skipping`);
          continue;
        }

        const prompt = contentType === 'event' 
          ? createEventSEOPrompt(item)
          : createRestaurantSEOPrompt(item);

        const config = await getAIConfig(supabaseUrl, supabaseKey);
        const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
        // Lightweight model (LIGHTWEIGHT_AI_MODEL, else DEFAULT_AI_MODEL) - high volume
        const requestBody = await buildLightweightClaudeRequest(
          [{ role: 'user', content: prompt }],
          {
            supabaseUrl,
            supabaseKey,
            customMaxTokens: 1000,
            customTemperature: 0.1
          }
        );

        const claudeResponse = await fetchWithTimeout(config.api_endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        }, 60_000);

        console.log('Claude API Response Status:', claudeResponse.status);

        if (!claudeResponse.ok) {
          throw new Error(`Claude API error: ${claudeResponse.status}`);
        }

        const claudeData = await claudeResponse.json();
        if (claudeData?.usage) {
          await recordAnthropicUsage(supabaseClient, {
            source: "generate-seo-content",
            model: String(claudeData.model ?? requestBody.model ?? "unknown"),
            usage: claudeData.usage,
            extra: { contentType },
          });
        }
        const extracted = extractClaudeText(claudeData);
        if (!extracted.ok) {
          console.error("Claude response not usable:", extracted.reason, extracted.detail);
          throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
        }
        const generatedContent = extracted.text;

        // Parse the structured response
        const seoData = parseClaudeResponse(generatedContent);

        // Update the database with final content
        const updateData = {
          seo_title: seoData.title,
          seo_description: seoData.description,
          seo_keywords: seoData.keywords,
          seo_h1: seoData.h1,
          geo_summary: seoData.summary,
          geo_key_facts: seoData.keyFacts,
          geo_faq: seoData.faq,
          seo_locked_at: null
        };

        const { error: updateError } = await supabaseClient
          .from(tableFor(contentType))
          .update(updateData)
          .eq('id', item.id);

        if (updateError) {
          throw new Error(`Database update error: ${updateError.message}`);
        }

        processedCount++;
        console.log(`Successfully processed ${contentType} ${item.id}`);

      } catch (error) {
        console.error(`Error processing ${contentType} ${item.id}:`, error);
        
        // Release the lock if processing failed. If this never runs (crash,
        // timeout), the lock goes stale after 15 minutes instead of forever.
        await releaseSeoLock(supabaseClient, contentType, item.id);

        errors.push(`${item.id}: ${error.message}`);
      }
    }

    console.log(`SEO generation completed. Processed: ${processedCount}/${items.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        total: items.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('SEO generation error:', error);
    return new Response(
      JSON.stringify({ error: 'SEO content generation failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function parseClaudeResponse(response: string): any {
  try {
    // Clean the response to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error parsing Claude response:', error);
    console.error('Raw response:', response);
    throw new Error('Failed to parse Claude response as JSON');
  }
}