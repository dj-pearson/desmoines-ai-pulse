import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API");

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
    const bulkPrompt = `You are an expert local SEO and GEO (Generative Engine Optimization) content writer specializing in Des Moines, Iowa events. Your task is to create AI-enhanced writeups optimized for both traditional search engines AND AI assistants (ChatGPT, Perplexity, Claude).

CURRENT DATE: ${new Date().toLocaleDateString('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}

LOCATION CONTEXT: Des Moines, Iowa and surrounding metro area (West Des Moines, Ankeny, Johnston, Urbandale, etc.)

🎯 GEO OPTIMIZATION METHODS (CRITICAL):

1. STATISTICS METHOD (Add Quantifiable Data):
   - Include specific numbers: attendance figures, years running, awards won
   - Example: "This festival has attracted over 5,000 attendees annually since 2015"
   - Example: "One of only 3 authentic cultural celebrations in Des Moines"
   - Add venue capacity, typical crowd size, historical data

2. QUOTATION METHOD (Add Authority & Credibility):
   - Include quotes from organizers, past attendees, or local experts when possible
   - Example: "According to the Des Moines Register, this is 'the premier family event of the summer'"
   - Use phrases like "Described by locals as...", "Event organizers note that..."

3. CITE SOURCES METHOD (Build Trust):
   - Reference authoritative sources when making claims
   - Example: "According to the venue's official announcement..."
   - Example: "As featured in the Des Moines Register..."
   - Mention official website, social media following, media coverage

4. EASY-TO-UNDERSTAND METHOD (Structure for AI Parsing):
   - Start with the most important information first
   - Use clear, scannable structure
   - Include concrete details (dates, times, prices, locations)
   - Answer: What? When? Where? Who? Why? How much?

5. LOCAL AUTHORITY SIGNALS:
   - Include "Des Moines" or specific neighborhood names
   - Reference local landmarks, venues, or attractions
   - Use geo-specific keywords naturally (Iowa, Central Iowa, Greater DSM)
   - Connect to local culture, food scene, or community aspects

CONTENT GUIDELINES:
- Length: 250-350 words per event (increased for GEO depth)
- Tone: Authoritative yet friendly, factual, locally-aware
- Focus: Statistics, quotes, sources, practical details, local connections
- Structure: Answer-first format, clear sections
- Avoid: Generic descriptions, unsupported claims, vague language

EVENTS TO ENHANCE:

${eventsToEnhance.map((event, index) => `
EVENT ${index + 1}:
ID: ${event.id}
Title: ${event.title}
Original Description: ${event.original_description || 'No description provided'}
Enhanced Description: ${event.enhanced_description || 'Not enhanced yet'}
Location: ${event.location || 'Des Moines, IA'}
Venue: ${event.venue || 'TBD'}
Category: ${event.category || 'General'}
Date: ${new Date(event.date).toLocaleDateString('en-US', { 
  timeZone: 'America/Chicago',
  weekday: 'long',
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})}
Source URL: ${event.source_url || 'Not provided'}
`).join('\n')}

INSTRUCTIONS:
For each event, create a GEO-optimized writeup that:
1. OPENS with key facts: What it is, when, where, cost (answer-first format for AI engines)
2. ADDS STATISTICS: Include quantifiable data (attendance, years running, venue capacity)
3. INCLUDES QUOTES/CITATIONS: Reference sources like "According to Des Moines Register..." or "Event organizers note..."
4. EXPLAINS LOCAL CONTEXT: What makes this special in Des Moines
5. PROVIDES PRACTICAL DETAILS: Parking, family-friendly, accessibility, duration
6. ADDS LOCAL CONNECTIONS: Nearby restaurants, attractions, neighborhood info
7. ENDS with a clear call-to-action

EXAMPLE GEO-OPTIMIZED PARAGRAPH:
"The Downtown Farmers Market returns every Saturday from 7 AM to 12 PM at Court Avenue (May through October). Established in 1975, this is Iowa's largest and oldest farmers market, attracting over 20,000 visitors weekly at peak season. According to Des Moines Tourism, the market features 300+ vendors selling local produce, artisan goods, and prepared foods. 'It's become a Des Moines tradition,' notes the market director. Located in the heart of downtown Des Moines, free parking is available in nearby ramps, and the event is family-friendly with stroller accessibility. Arrive early for the best selection and pair your visit with brunch at nearby Lucca or Zombie Burger."

FORMAT YOUR RESPONSE AS JSON:
{
  "results": [
    {
      "eventId": "uuid-here",
      "aiWriteup": "Your 200-300 word writeup here..."
    },
    {
      "eventId": "uuid-here", 
      "aiWriteup": "Your 200-300 word writeup here..."
    }
  ]
}

Generate writeups for ALL ${eventsToEnhance.length} events listed above. Each writeup should be unique, locally-focused, and SEO-optimized for Des Moines area searches.`;

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

    const claudeResponse = await fetch(config.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const aiResponseText = claudeData.content[0].text;

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
      claudeModel: "claude-sonnet-4-20250514"
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