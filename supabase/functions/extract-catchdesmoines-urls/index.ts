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
    
    // Strategy 1: Look for exact "Visit Website" links
    let visitMatch = html.match(/<a[^>]*>(?:[^<]*visit\s+website[^<]*)<\/a>/gi);
    if (visitMatch) {
      for (const match of visitMatch) {
        const hrefMatch = match.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && !hrefMatch[1].includes('catchdesmoines.com')) {
          console.log('Found via exact Visit Website match:', hrefMatch[1]);
          return hrefMatch[1];
        }
      }
    }

    // Strategy 2: Look for links with "website" in text content
    const websiteLinks = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*website[^<]*<\/a>/gi);
    if (websiteLinks) {
      for (const link of websiteLinks) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && 
            !hrefMatch[1].includes('catchdesmoines.com') && 
            !hrefMatch[1].startsWith('mailto:') &&
            hrefMatch[1].startsWith('http')) {
          console.log('Found via website text match:', hrefMatch[1]);
          return hrefMatch[1];
        }
      }
    }

    // Strategy 3: Look for external links (not catchdesmoines.com)
    const allLinks = html.match(/<a[^>]*href=["']([^"']+)["']/gi);
    const externalLinks: string[] = [];
    
    if (allLinks) {
      for (const link of allLinks) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) {
          const url = hrefMatch[1];
          if (url.startsWith('http') && 
              !url.includes('catchdesmoines.com') && 
              !url.startsWith('mailto:') && 
              !url.startsWith('tel:')) {
            
            // Check if link text contains relevant keywords
            const linkText = link.replace(/<[^>]*>/g, '').toLowerCase();
            if (linkText.includes('visit') || 
                linkText.includes('website') || 
                linkText.includes('more info') || 
                linkText.includes('details') || 
                linkText.includes('tickets')) {
              console.log('Found via external link with relevant text:', url);
              return url;
            }
            externalLinks.push(url);
          }
        }
      }
    }

    // If no prioritized link found, return first external link
    if (externalLinks.length > 0) {
      console.log('Found via first external link:', externalLinks[0]);
      return externalLinks[0];
    }

    // Strategy 4: Look for onclick handlers with URLs
    const onclickMatches = html.match(/onclick=["'][^"']*https?:\/\/[^"'\s]+[^"']*["']/gi);
    if (onclickMatches) {
      for (const onclick of onclickMatches) {
        const urlMatch = onclick.match(/https?:\/\/[^\s'"]+/);
        if (urlMatch && !urlMatch[0].includes('catchdesmoines.com')) {
          console.log('Found via onclick handler:', urlMatch[0]);
          return urlMatch[0];
        }
      }
    }

    console.log('No external URL found for:', eventUrl);
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