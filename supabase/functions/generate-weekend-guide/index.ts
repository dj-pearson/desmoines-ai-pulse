import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { applyWeekendGuideFilters, formatGuideEventDate, nextWeekendWindow } from "./window.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-point',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // No caller check existed, and this one SPENDS MONEY: it runs as service_role
  // and calls Claude through _shared/aiConfig. verify_jwt does not help -
  // it defaults to true, and true only means "a valid Supabase JWT", which the
  // publishable anon key is.
  //
  // Both callers keep working: pg_cron (20260823000008:56) sends
  // Bearer <service_role_key>, and the UI is WeekendGuideManager inside
  // AdminTools, behind <ProtectedRoute requireAdmin> (App.tsx:454) - its
  // functions.invoke sends the admin JWT, which the helper checks server-side.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const claudeApiKey = getAnthropicApiKey();

    if (!claudeApiKey) {
      throw new Error('Claude API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting weekend guide generation...');

    // The coming Friday-Sunday in Central time, with runs that are still on.
    // WEB-FEAT-089: this used to send UTC bare dates, which covered Thursday
    // evening through Saturday evening and skipped Sunday entirely.
    const weekend = nextWeekendWindow();

    console.log('Fetching events from', weekend.start, 'to', weekend.end);

    const { data: events, error: eventsError } = await applyWeekendGuideFilters(
      supabase.from('events').select('*'),
      weekend,
    ).order('date', { ascending: true });

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    console.log(`Found ${events?.length || 0} weekend events`);

    if (!events || events.length === 0) {
      console.log('No weekend events found, creating minimal guide');
      
      // Create a minimal guide if no events
      const { error: insertError } = await supabase
        .from('weekend_guides')
        .upsert({
          week_start: weekend.friday,
          content: "No specific events found for this weekend, but Des Moines always has something happening! Check out the farmers markets, local restaurants, and outdoor activities.",
          events_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        throw new Error(`Failed to save minimal guide: ${insertError.message}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Minimal weekend guide created',
          eventsFound: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare events data for Claude
    const eventsData = events.map(event => ({
      title: event.title,
      description: event.enhanced_description || event.original_description,
      date: event.date,
      when: formatGuideEventDate(event, weekend),
      venue: event.venue,
      location: event.location,
      category: event.category,
      price: event.price,
      source_url: event.source_url
    }));

    // Create Claude prompt
    const prompt = `You are a local Des Moines expert writing a weekend guide. Here are the events happening this upcoming weekend (Friday-Sunday):

${eventsData.map((event, index) => 
  `${index + 1}. ${event.title}
   When: ${event.when}
   Venue: ${event.venue || event.location}
   Category: ${event.category}
   Price: ${event.price || 'Not specified'}
   Description: ${event.description}
   ${event.source_url ? `More info: ${event.source_url}` : ''}
`).join('\n')}

Please write an engaging weekend guide for Des Moines that:
1. Has an enthusiastic, local tone
2. Groups events by day (Friday, Saturday, Sunday)
3. Highlights the best 6-8 events for the weekend
4. Explains why each recommended event is special and worth attending
5. Includes practical details like timing and locations
6. Adds local context and recommendations for each day
7. Keeps it around 800-1000 words
8. Uses an inviting, conversational style like a local friend giving recommendations

Structure it with clear day sections and make it sound exciting and informative!`;

    console.log('Sending request to Claude API...');

    // Call Claude API using centralized config
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
    const requestBody = await buildClaudeRequest(
      [{ role: 'user', content: prompt }],
      { 
        supabaseUrl, 
        supabaseKey: supabaseServiceKey,
        useCreativeTemp: false
      }
    );

    const claudeResponse = await fetchWithTimeout(config.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    }, 60_000);

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const extracted = extractClaudeText(claudeData);
    if (!extracted.ok) {
      console.error("Claude response not usable:", extracted.reason, extracted.detail);
      throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
    }
    const generatedContent = extracted.text;

    console.log('Generated content length:', generatedContent.length);

    // Save to database
    const { error: insertError } = await supabase
      .from('weekend_guides')
      .upsert({
        week_start: weekend.friday,
        content: generatedContent,
        events_count: events.length,
        events_featured: eventsData.slice(0, 8), // Store top 8 events
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      throw new Error(`Failed to save weekend guide: ${insertError.message}`);
    }

    console.log('Weekend guide generated and saved successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Weekend guide generated successfully',
        eventsFound: events.length,
        contentLength: generatedContent.length,
        weekStart: weekend.friday
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating weekend guide:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});