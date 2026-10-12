/**
 * SECURITY: verify_jwt = false
 * Reason: Background batch processing job that enhances events in bulk without user session context
 * Alternative measures: Service role key required for database access, Claude API key validated, batch size limits enforced
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { buildEnhancePrompt } from "./prompt.ts";
import { stripAiLabels } from "../_shared/aiText.ts";
import { clampWriteupBatch, saveWriteup, selectEventsNeedingWriteup } from "./selection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnhancementResult {
  eventId: string;
  title: string;
  aiWriteup: string;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = getAnthropicApiKey();

    if (!claudeApiKey) {
      throw new Error("Claude API key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get request parameters
    const body = await req.json().catch(() => ({}));
    const batchSize = clampWriteupBatch(body.batchSize);
    const triggerSource = typeof body.triggerSource === "string" ? body.triggerSource : "manual";

    console.log(`🚀 Starting bulk event enhancement - Batch size: ${batchSize}, Trigger: ${triggerSource}`);

    // Upcoming events with no ai_writeup, soonest first (see ./selection.ts).
    const eventsToEnhance = await selectEventsNeedingWriteup(supabase, batchSize);

    if (!eventsToEnhance || eventsToEnhance.length === 0) {
      console.log('✅ No events found that need AI enhancement');
      return new Response(JSON.stringify({
        success: true,
        message: 'No events require enhancement at this time',
        eventsProcessed: 0,
        results: []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    console.log(`📋 Found ${eventsToEnhance.length} events needing enhancement`);

    // Build comprehensive prompt for all events in one API call with GEO optimization
    // WEB-BE-053. The prompt that used to sit here told the model, in
    // capitals, to ADD STATISTICS (attendance, years running, venue
    // capacity) and INCLUDE QUOTES/CITATIONS ("According to Des Moines
    // Register...") - while giving it five fields, none of which contains a
    // number, a year or a quote. Every one it produced was invented, and
    // attributed. It is a builder now so a test can read what it actually
    // asks for; see ./prompt.ts for what replaced it and why.
    const bulkPrompt = buildEnhancePrompt(eventsToEnhance);

    // Make Claude API call
    console.log('🤖 Sending bulk request to Claude API...');
    
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
    const requestBody = await buildClaudeRequest(
      [{ role: "user", content: bulkPrompt }],
      { 
        supabaseUrl, 
        supabaseKey: supabaseServiceKey,
        useLargeTokens: true,
        useCreativeTemp: true
      }
    );

    const claudeResponse = await fetchWithTimeout(config.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
      // Ten writeups of up to 250 words is several thousand output tokens; at
      // 60s a full batch on the default model timed out before it finished.
    }, 120_000);

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const extracted = extractClaudeText(claudeData);
    if (!extracted.ok) {
      console.error("Claude response not usable:", extracted.reason, extracted.detail);
      throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
    }
    const aiResponseText = extracted.text;

    console.log('📝 Received response from Claude, parsing results...');

    // Parse the JSON response from Claude with improved error handling
    let parsedResults;
    try {
      // Clean the response text to remove any potential control characters
      const cleanedResponse = aiResponseText.replace(/[\x00-\x1F\x7F]/g, '');
      
      // Try to extract JSON from the response if it's wrapped in markdown or other text
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : cleanedResponse;
      
      parsedResults = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError);
      console.log('Raw Claude response (first 1000 chars):', aiResponseText.substring(0, 1000));
      
      // Try to extract partial results if possible
      try {
        const partialMatch = aiResponseText.match(/"results"\s*:\s*\[([\s\S]*?)\]/);
        if (partialMatch) {
          parsedResults = { results: JSON.parse(`[${partialMatch[1]}]`) };
          console.log('Successfully extracted partial results');
        } else {
          throw new Error('Failed to parse AI response as JSON and could not extract partial results');
        }
      } catch (secondaryError) {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    if (!parsedResults.results || !Array.isArray(parsedResults.results)) {
      throw new Error('Invalid response format from AI');
    }

    console.log(`✨ Successfully parsed ${parsedResults.results.length} AI writeups`);

    // Update events with AI writeups
    const results: EnhancementResult[] = [];
    const promptUsed = `Bulk enhancement (${requestBody.model}) for ${eventsToEnhance.length} events - Generated on ${new Date().toISOString()}`;
    const batchIds = new Set(eventsToEnhance.map((e) => e.id));

    for (const result of parsedResults.results) {
      // SEO-057: no model label or wrapper field in the stored text.
      const writeup = typeof result.aiWriteup === 'string' ? stripAiLabels(result.aiWriteup) : result.aiWriteup;
      const saved = await saveWriteup(supabase, batchIds, result.eventId, writeup, promptUsed);
      if (saved.ok) {
        console.log(`✅ Updated event: ${saved.title}`);
        results.push({ eventId: result.eventId, title: saved.title, aiWriteup: writeup, success: true });
      } else {
        console.error(`Not saved for event ${result.eventId}: ${saved.error}`);
        results.push({ eventId: String(result.eventId), title: 'Unknown', aiWriteup: '', success: false, error: saved.error });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`🎯 Bulk enhancement completed: ${successCount} successes, ${failureCount} failures`);

    // Log the operation for monitoring
    if (triggerSource === 'cron') {
      await supabase
        .from('cron_logs')
        .insert({
          message: `✨ Bulk AI enhancement completed: ${successCount}/${eventsToEnhance.length} events enhanced`,
          created_at: new Date().toISOString()
        });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully enhanced ${successCount} of ${eventsToEnhance.length} events`,
      eventsProcessed: eventsToEnhance.length,
      successCount,
      failureCount,
      results,
      promptUsed,
      // WEB-BE-041. This was the literal "claude-sonnet-4-20250514" while the
      // call above went through buildClaudeRequest, so the audit field reported
      // a model this function does not use. Report what was actually sent,
      // which DEFAULT_AI_MODEL decides.
      claudeModel: requestBody.model
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (error) {
    console.error('Error in bulk-enhance-events function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Check function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});