import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

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
    const { data: eventsToEnhance, error: fetchError } = await supabase
      .from('events')
      .select('id, title, original_description, enhanced_description, location, venue, category, date, source_url')
      .gte('date', new Date().toISOString()) // Only future events
      .is('ai_writeup', null) // Only events without AI writeup
      .order('date', { ascending: true })
      .limit(batchSize);

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

    // Build comprehensive prompt for all events in one API call
    const bulkPrompt = `You are an expert local SEO content writer specializing in Des Moines, Iowa events. Your task is to create AI-enhanced local SEO writeups for ${eventsToEnhance.length} events.

CURRENT DATE: ${new Date().toLocaleDateString('en-US', { 
  timeZone: 'America/Chicago',
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})}

LOCATION CONTEXT: Des Moines, Iowa and surrounding metro area (West Des Moines, Ankeny, Johnston, Urbandale, etc.)

LOCAL SEO REQUIREMENTS:
✅ Include "Des Moines" or specific neighborhood/suburb names
✅ Reference local landmarks, venues, or attractions when relevant
✅ Use geo-specific keywords naturally (Iowa, Central Iowa, Greater DSM)
✅ Mention accessibility via local streets/highways when possible
✅ Include seasonal/weather context for outdoor events
✅ Connect to local culture, food scene, or community aspects
✅ Write for both local residents and visitors to Des Moines

AI SEARCH OPTIMIZATION:
✅ Answer potential questions users might ask (What to expect? Cost? Duration?)
✅ Include practical details (parking, family-friendly, accessibility)
✅ Use conversational, helpful tone
✅ Provide context that helps AI assistants recommend the event

CONTENT GUIDELINES:
- Length: 200-300 words per event
- Tone: Friendly, informative, locally-aware
- Focus: Unique selling points, local connections, practical details
- Avoid: Generic descriptions, overly promotional language

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
For each event, create a compelling local SEO writeup that:
1. Starts with the event name and key details
2. Explains what makes this event special in the Des Moines context
3. Provides practical information for attendees
4. Includes relevant local connections or recommendations
5. Ends with a call-to-action encouraging attendance

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
    
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": claudeApiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: bulkPrompt
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const aiResponseText = claudeData.content[0].text;

    console.log('📝 Received response from Claude, parsing results...');

    // Parse the JSON response from Claude
    let parsedResults;
    try {
      parsedResults = JSON.parse(aiResponseText);
    } catch (parseError) {
      console.error('Error parsing Claude response:', parseError);
      console.log('Raw Claude response:', aiResponseText);
      throw new Error('Failed to parse AI response as JSON');
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
      claudeModel: "claude-3-5-sonnet-20241022"
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