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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EventForEnhancement {
  id: string;
  title: string;
  original_description?: string;
  enhanced_description?: string;
  location?: string;
  venue?: string;
  category?: string;
  date: string;
  source_url?: string;
}

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
    const { batchSize = 10, triggerSource = "manual" } = await req.json();
    
    console.log(`🚀 Starting bulk event enhancement - Batch size: ${batchSize}, Trigger: ${triggerSource}`);

    // Get events that need AI enhancement (no ai_writeup yet)
    // Use random offset to rotate through different batches instead of always starting with the same events
    const { data: totalCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('date', new Date().toISOString())
      .is('ai_writeup', null);
    
    const availableCount = totalCount?.length || 0;
    console.log(`📊 Total events needing enhancement: ${availableCount}`);
    
    // Calculate a rotating offset based on time to avoid always processing the same events
    const hourOfDay = new Date().getHours();
    const rotationSeed = Math.floor(hourOfDay / 2); // Changes every 2 hours
    const randomOffset = availableCount > batchSize 
      ? Math.floor((rotationSeed * 37) % Math.max(1, availableCount - batchSize)) 
      : 0;
    
    console.log(`🔄 Using offset ${randomOffset} to rotate through events (seed: ${rotationSeed})`);
    
    const { data: eventsToEnhance, error: fetchError } = await supabase
      .from('events')
      .select('id, title, original_description, enhanced_description, location, venue, category, date, source_url')
      .gte('date', new Date().toISOString()) // Only future events
      .is('ai_writeup', null) // Only events without AI writeup
      .order('date', { ascending: true })
      .range(randomOffset, randomOffset + batchSize - 1);

    if (fetchError) {
      console.error('Error fetching events:', fetchError);
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

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
    }, 60_000);

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
    const promptUsed = `Bulk enhancement for ${eventsToEnhance.length} events - Generated on ${new Date().toISOString()}`;

    for (const result of parsedResults.results) {
      try {
        const { data: updateData, error: updateError } = await supabase
          .from('events')
          .update({
            ai_writeup: result.aiWriteup,
            writeup_generated_at: new Date().toISOString(),
            writeup_prompt_used: promptUsed
          })
          .eq('id', result.eventId)
          .select('id, title');

        if (updateError) {
          console.error(`Error updating event ${result.eventId}:`, updateError);
          results.push({
            eventId: result.eventId,
            title: 'Unknown',
            aiWriteup: '',
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`✅ Updated event: ${updateData[0]?.title}`);
          results.push({
            eventId: result.eventId,
            title: updateData[0]?.title || 'Updated',
            aiWriteup: result.aiWriteup,
            success: true
          });
        }
      } catch (error) {
        console.error(`Error processing event ${result.eventId}:`, error);
        results.push({
          eventId: result.eventId,
          title: 'Unknown',
          aiWriteup: '',
          success: false,
          error: error.message
        });
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
      // a model this function does not use - and would keep reporting it after
      // an ai_config change. Report what was actually sent.
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