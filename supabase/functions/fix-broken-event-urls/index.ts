import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

async function searchGoogleForEvent(eventTitle: string, location: string, apiKey: string): Promise<string | null> {
  try {
    // Try multiple search strategies
    const searchQueries = [
      `"${eventTitle}" Des Moines Iowa tickets`,
      `"${eventTitle}" ${location} event`,
      `${eventTitle.replace(/[^\w\s]/g, '')} Des Moines`,
      `${eventTitle} Iowa event tickets`
    ];
    
    console.log(`Searching for event: ${eventTitle} in ${location}`);
    
    for (const searchQuery of searchQueries) {
      console.log(`Trying search query: ${searchQuery}`);
      
      // Use Google Custom Search with CSE ID for general web search
      const cseId = "017576662512468239146:omuauf_lfve"; // General web search CSE
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQuery)}&num=5`;
      
      const response = await fetch(searchUrl);
      
      if (!response.ok) {
        console.error(`API error for query "${searchQuery}": ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Error details: ${errorText}`);
        continue; // Try next query
      }
      
      const data = await response.json();
      console.log(`Search results for "${searchQuery}": ${data.items?.length || 0} items`);
      
      if (data.items && data.items.length > 0) {
        // Look for the most relevant result
        for (const item of data.items) {
          const link = item.link;
          console.log(`Evaluating result: ${link}`);
          
          // Skip social media and unwanted domains
          if (link.includes('facebook.com') || 
              link.includes('twitter.com') || 
              link.includes('x.com') ||
              link.includes('youtube.com') ||
              link.includes('instagram.com') ||
              link.includes('catchdesmoines.com') ||
              link.includes('extranet.simpleviewcrm.com') ||
              link.includes('simpleviewcrm.com') ||
              link.includes('google.com')) {
            console.log(`Skipping unwanted domain: ${link}`);
            continue;
          }
          
          // Prefer official venue websites or event pages
          if (link.includes('eventbrite.com') || 
              link.includes('tickets.') ||
              link.includes('events.') ||
              link.includes('ticketmaster.com') ||
              link.includes('.org') ||
              item.title.toLowerCase().includes('ticket') ||
              item.title.toLowerCase().includes('event')) {
            console.log(`Found priority result: ${link}`);
            return link;
          }
          
          // Return first valid external link
          console.log(`Found valid result: ${link}`);
          return link;
        }
      } else {
        console.log(`No results found for query: ${searchQuery}`);
      }
    }
    
    console.log(`No suitable URL found for event: ${eventTitle}`);
    return null;
  } catch (error) {
    console.error('Error searching for event:', eventTitle, error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('user_role')
      .eq('user_id', user.id)
      .single();

    if (!profile || !['admin', 'root_admin', 'moderator'].includes(profile.user_role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      // Try both API keys - prioritize the custom search API
      const googleCustomSearchKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_API');
      const googleSearchKey = Deno.env.get('GOOGLE_SEARCH_API');
      const googleMapsKey = Deno.env.get('GOOGLE_MAPS_KEY');
      
      const apiKey = googleCustomSearchKey || googleSearchKey || googleMapsKey;
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'No Google API key available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get events with broken URLs - only future events
      const { data: brokenEvents, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, title, source_url, location, date')
        .or(`source_url.ilike.%extranet.simpleviewcrm.com%,source_url.ilike.%x.com/share%,source_url.ilike.%youtube.com/@catchdesmoines%,source_url.ilike.%facebook.com/sharer%,source_url.ilike.%twitter.com/intent%`)
        .gte('date', new Date().toISOString()) // Only future events
        .order('date', { ascending: true })
        .limit(20);

      if (fetchError) {
        throw new Error(`Failed to fetch broken events: ${fetchError.message}`);
      }

      if (!brokenEvents || brokenEvents.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0, 
            fixed: 0,
            message: 'No broken URLs found' 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const result = {
        success: true,
        processed: brokenEvents.length,
        fixed: 0,
        errors: [] as Array<{ eventId: string; error: string }>,
        updates: [] as Array<{ eventId: string; title: string; oldUrl: string; newUrl: string }>
      };

      console.log(`Processing ${brokenEvents.length} events with broken URLs...`);

      // Process each broken event
      for (const event of brokenEvents) {
        try {
          const correctUrl = await searchGoogleForEvent(event.title, event.location || '', apiKey);
          
          if (correctUrl) {
            // Update the event with the correct URL
            const { error: updateError } = await supabaseClient
              .from('events')
              .update({ source_url: correctUrl })
              .eq('id', event.id);

            if (updateError) {
              result.errors.push({
                eventId: event.id,
                error: `Failed to update: ${updateError.message}`
              });
            } else {
              result.fixed++;
              result.updates.push({
                eventId: event.id,
                title: event.title,
                oldUrl: event.source_url,
                newUrl: correctUrl
              });
              console.log(`Fixed event ${event.id}: ${event.title} -> ${correctUrl}`);
            }
          } else {
            result.errors.push({
              eventId: event.id,
              error: 'No suitable replacement URL found'
            });
          }

          // Add delay between API calls to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          result.errors.push({
            eventId: event.id,
            error: `Processing failed: ${error.message}`
          });
        }
      }

      return new Response(
        JSON.stringify(result),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});