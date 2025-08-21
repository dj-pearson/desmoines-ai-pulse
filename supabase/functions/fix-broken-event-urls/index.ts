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
    const searchQuery = `"${eventTitle}" ${location} site:(-catchdesmoines.com -facebook.com -twitter.com -x.com -youtube.com -instagram.com)`;
    
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=017576662512468239146:omuauf_lfve&q=${encodeURIComponent(searchQuery)}&num=3`;
    
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      // Look for the most relevant result
      for (const item of data.items) {
        const link = item.link;
        
        // Skip social media and unwanted domains
        if (link.includes('facebook.com') || 
            link.includes('twitter.com') || 
            link.includes('x.com') ||
            link.includes('youtube.com') ||
            link.includes('instagram.com') ||
            link.includes('catchdesmoines.com') ||
            link.includes('extranet.simpleviewcrm.com')) {
          continue;
        }
        
        // Prefer official venue websites or event pages
        if (link.includes('eventbrite.com') || 
            link.includes('tickets.') ||
            link.includes('events.') ||
            item.title.toLowerCase().includes('ticket') ||
            item.title.toLowerCase().includes('event')) {
          return link;
        }
        
        // Return first valid external link
        return link;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching for event:', error);
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
      // Try both API keys
      const googleSearchKey = Deno.env.get('GOOGLE_SEARCH_API');
      const googleMapsKey = Deno.env.get('GOOGLE_MAPS_KEY');
      
      const apiKey = googleSearchKey || googleMapsKey;
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'No Google API key available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get events with broken URLs
      const { data: brokenEvents, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, title, source_url, location')
        .or(`source_url.ilike.%extranet.simpleviewcrm.com%,source_url.ilike.%x.com/share%,source_url.ilike.%youtube.com/@catchdesmoines%,source_url.ilike.%facebook.com/sharer%,source_url.ilike.%twitter.com/intent%`)
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