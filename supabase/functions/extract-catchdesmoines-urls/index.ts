import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractResponse {
  success: boolean;
  processed: number;
  errors: Array<{ eventId: string; error: string }>;
  updated: Array<{ eventId: string; oldUrl: string; newUrl: string }>;
}

async function extractVisitWebsiteUrl(eventUrl: string): Promise<string | null> {
  try {
    console.log('Processing URL:', eventUrl);
    
    // Use fetch with user agent to simulate browser request
    const response = await fetch(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Helper function to extract URLs using CSS-like selectors via regex
    const extractUrlByPattern = (pattern: RegExp): string | null => {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const hrefMatch = match.match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1] && 
              hrefMatch[1].startsWith('http') && 
              !hrefMatch[1].includes('catchdesmoines.com')) {
            return hrefMatch[1];
          }
        }
      }
      return null;
    };

    // Strategy 1: CSS Class Patterns - a.btn-external or a.external-link
    let url = extractUrlByPattern(/<a[^>]*class=["'][^"']*btn-external[^"']*["'][^>]*href=["']([^"']+)["']/gi);
    if (url) {
      console.log('Found via btn-external class:', url);
      return url;
    }

    url = extractUrlByPattern(/<a[^>]*class=["'][^"']*external-link[^"']*["'][^>]*href=["']([^"']+)["']/gi);
    if (url) {
      console.log('Found via external-link class:', url);
      return url;
    }

    url = extractUrlByPattern(/<a[^>]*class=["'][^"']*external[^"']*["'][^>]*href=["']([^"']+)["']/gi);
    if (url) {
      console.log('Found via external class:', url);
      return url;
    }

    // Strategy 2: Data Attributes - [data-external-url] or [data-event-url]
    url = extractUrlByPattern(/<a[^>]*data-external-url=["']([^"']+)["']/gi);
    if (url) {
      console.log('Found via data-external-url:', url);
      return url;
    }

    url = extractUrlByPattern(/<a[^>]*data-event-url=["']([^"']+)["']/gi);
    if (url) {
      console.log('Found via data-event-url:', url);
      return url;
    }

    // Strategy 3: Context-Specific - .event-actions a[href^='http']:not([href*='catchdesmoines.com'])
    const eventActionsPattern = /<div[^>]*class=["'][^"']*event-actions[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
    const eventActionsMatches = html.match(eventActionsPattern);
    if (eventActionsMatches) {
      for (const section of eventActionsMatches) {
        url = extractUrlByPattern(/<a[^>]*href=["']([^"']+)["']/gi);
        if (url && !url.includes('catchdesmoines.com') && 
            !url.includes('facebook.com') && 
            !url.includes('twitter.com') && 
            !url.includes('x.com') &&
            !url.includes('instagram.com')) {
          console.log('Found via event-actions section:', url);
          return url;
        }
      }
    }

    // Strategy 4: Universal Fallback with strict exclusions
    const excludeDomains = [
      'catchdesmoines.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 
      'youtube.com', 'tiktok.com', 'linkedin.com', 'google.com', 'maps.google.com',
      'simpleviewcrm.com', 'extranet.simpleview', 'eventbrite.com', 'ticketmaster.com'
    ];

    const allLinkMatches = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);
    if (allLinkMatches) {
      for (const linkMatch of allLinkMatches) {
        const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http')) {
          const linkUrl = hrefMatch[1];
          
          // Check if URL should be excluded
          const shouldExclude = excludeDomains.some(domain => linkUrl.includes(domain));
          
          if (!shouldExclude) {
            // Additional check for common website indicators in the link
            const linkElement = linkMatch.toLowerCase();
            if (linkElement.includes('visit') || 
                linkElement.includes('website') || 
                linkElement.includes('external') ||
                linkElement.includes('official')) {
              console.log('Found via universal fallback with indicators:', linkUrl);
              return linkUrl;
            }
          }
        }
      }

      // Last resort - first non-excluded external link
      for (const linkMatch of allLinkMatches) {
        const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http')) {
          const linkUrl = hrefMatch[1];
          const shouldExclude = excludeDomains.some(domain => linkUrl.includes(domain));
          
          if (!shouldExclude) {
            console.log('Found via last resort fallback:', linkUrl);
            return linkUrl;
          }
        }
      }
    }

    console.log('No suitable external URL found for:', eventUrl);
    return null;
    
  } catch (error) {
    console.error('Error extracting URL from', eventUrl, ':', error);
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
      // Get events with catchdesmoines.com URLs
      const { data: events, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, title, source_url')
        .ilike('source_url', '%catchdesmoines.com%')
        .limit(50); // Process in batches of 50

      if (fetchError) {
        throw new Error(`Failed to fetch events: ${fetchError.message}`);
      }

      if (!events || events.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            processed: 0, 
            errors: [], 
            updated: [],
            message: 'No events with catchdesmoines.com URLs found' 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const result: ExtractResponse = {
        success: true,
        processed: events.length,
        errors: [],
        updated: []
      };

      console.log(`Processing ${events.length} events with catchdesmoines.com URLs...`);

      // Process each event
      for (const event of events) {
        try {
          const extractedUrl = await extractVisitWebsiteUrl(event.source_url);
          
          if (extractedUrl) {
            // Update the event with the new URL
            const { error: updateError } = await supabaseClient
              .from('events')
              .update({ source_url: extractedUrl })
              .eq('id', event.id);

            if (updateError) {
              result.errors.push({
                eventId: event.id,
                error: `Failed to update: ${updateError.message}`
              });
            } else {
              result.updated.push({
                eventId: event.id,
                oldUrl: event.source_url,
                newUrl: extractedUrl
              });
              console.log(`Updated event ${event.id}: ${event.source_url} -> ${extractedUrl}`);
            }
          } else {
            result.errors.push({
              eventId: event.id,
              error: 'No external URL found on page'
            });
          }

          // Add small delay between requests to be respectful
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