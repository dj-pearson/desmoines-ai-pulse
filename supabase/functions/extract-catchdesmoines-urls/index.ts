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

/**
 * Parse event date/time string and convert from Central Time to UTC
 * Uses proper timezone offset detection for CST/CDT
 */
function parseEventDateTime(dateStr: string, timeStr?: string): Date | null {
  try {
    console.log('Parsing datetime:', { dateStr, timeStr });
    
    // Parse date components
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) {
      console.error('Invalid date format:', dateStr);
      return null;
    }
    
    const [, year, month, day] = dateMatch;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    
    // Parse time if provided
    if (timeStr) {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timeMatch) {
        hours = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      }
    }
    
    // Determine Central Time offset (CST = -06:00, CDT = -05:00)
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    
    // Rough DST check: March 2nd Sunday through November 1st Sunday
    const isDST = (monthNum > 3 && monthNum < 11) || 
                  (monthNum === 3 && dayNum >= 8) || 
                  (monthNum === 11 && dayNum < 7);
    
    const offset = isDST ? '-05:00' : '-06:00';
    
    // Build ISO string with Central timezone
    const isoWithTimezone = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${offset}`;
    
    console.log('Built ISO string:', isoWithTimezone);
    
    // Parse to Date (browser will convert to UTC internally)
    const date = new Date(isoWithTimezone);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date result:', isoWithTimezone);
      return null;
    }
    
    console.log('Parsed to UTC:', date.toISOString());
    return date;
    
  } catch (error) {
    console.error('Error parsing datetime:', error);
    return null;
  }
}

interface ExtractedEventData {
  visitUrl: string | null;
  dateStr: string | null;
  timeStr: string | null;
}

async function extractVisitWebsiteUrl(eventUrl: string): Promise<ExtractedEventData> {
  try {
    console.log('Processing URL:', eventUrl);
    
    // Use fetch with user agent to simulate browser request
    const response = await fetch(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(12000) // 12 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Extract date/time information
    let dateStr: string | null = null;
    let timeStr: string | null = null;
    
    // Look for date patterns in the HTML
    const datePatterns = [
      /<time[^>]*datetime=["']([^"']+)["']/i,
      /<meta[^>]*property=["']event:start_date["'][^>]*content=["']([^"']+)["']/i,
      /<span[^>]*class=["'][^"']*date[^"']*["'][^>]*>([^<]+)</i,
      /Date:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/
    ];
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        dateStr = match[1];
        console.log('Found date:', dateStr);
        break;
      }
    }
    
    // Look for time patterns
    const timePatterns = [
      /<time[^>]*>([^<]*\d{1,2}:\d{2}[^<]*)<\/time>/i,
      /Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      /(\d{1,2}:\d{2}\s*(?:AM|PM))/i
    ];
    
    for (const pattern of timePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        timeStr = match[1];
        console.log('Found time:', timeStr);
        break;
      }
    }
    
    // PROVEN LOGIC FROM AI CRAWLER - Multi-strategy URL extraction
    
    // Strategy 1: Look for "Visit Website" or similar buttons/links
    const visitPatterns = [
      /<a[^>]*class=["'][^"']*visit[^"']*["'][^>]*href=["']([^"']+)["']/gi,
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*visit[^"']*["']/gi,
      /<a[^>]*>.*?visit\s+website.*?<\/a>/gi,
    ];
    
    for (const pattern of visitPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const hrefMatch = match.match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http') && !hrefMatch[1].includes('catchdesmoines.com')) {
            console.log('Found via visit website pattern:', hrefMatch[1]);
            return { visitUrl: hrefMatch[1], dateStr, timeStr };
          }
        }
      }
    }
    
    // Strategy 2: CSS Class Patterns - external links
    const classPatterns = [
      /<a[^>]*class=["'][^"']*btn-external[^"']*["'][^>]*href=["']([^"']+)["']/gi,
      /<a[^>]*class=["'][^"']*external-link[^"']*["'][^>]*href=["']([^"']+)["']/gi,
      /<a[^>]*class=["'][^"']*external[^"']*["'][^>]*href=["']([^"']+)["']/gi,
    ];
    
    for (const pattern of classPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const hrefMatch = match.match(/href=["']([^"']+)["']/i);
          if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http') && !hrefMatch[1].includes('catchdesmoines.com')) {
            console.log('Found via class pattern:', hrefMatch[1]);
            return { visitUrl: hrefMatch[1], dateStr, timeStr };
          }
        }
      }
    }
    
    // Strategy 3: Data attributes
    const dataPatterns = [
      /<a[^>]*data-external-url=["']([^"']+)["']/gi,
      /<a[^>]*data-event-url=["']([^"']+)["']/gi,
      /<a[^>]*data-url=["']([^"']+)["']/gi,
    ];
    
    for (const pattern of dataPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        for (const match of matches) {
          const urlMatch = match.match(/data-[^=]+-url=["']([^"']+)["']/i);
          if (urlMatch && urlMatch[1] && urlMatch[1].startsWith('http') && !urlMatch[1].includes('catchdesmoines.com')) {
            console.log('Found via data attribute:', urlMatch[1]);
            return { visitUrl: urlMatch[1], dateStr, timeStr };
          }
        }
      }
    }
    
    // Strategy 4: Event actions section
    const eventActionsPattern = /<div[^>]*class=["'][^"']*event-actions[^"']*["'][^>]*>[\s\S]{0,2000}?<\/div>/gi;
    const eventActionsMatches = html.match(eventActionsPattern);
    if (eventActionsMatches) {
      for (const section of eventActionsMatches) {
        const linkMatches = section.match(/<a[^>]*href=["']([^"']+)["']/gi);
        if (linkMatches) {
          for (const linkMatch of linkMatches) {
            const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
            if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http') && !hrefMatch[1].includes('catchdesmoines.com')) {
              const url = hrefMatch[1];
              // Exclude social media
              if (!url.includes('facebook.com') && !url.includes('twitter.com') && !url.includes('x.com') && !url.includes('instagram.com')) {
                console.log('Found via event-actions:', url);
                return { visitUrl: url, dateStr, timeStr };
              }
            }
          }
        }
      }
    }
    
    // Strategy 5: Universal fallback with strict exclusions
    const excludeDomains = [
      'catchdesmoines.com', 
      'facebook.com', 
      'twitter.com', 
      'x.com', 
      'instagram.com', 
      'youtube.com', 
      'tiktok.com', 
      'linkedin.com', 
      'pinterest.com',
      'google.com', 
      'maps.google.com',
      'simpleviewcrm.com', 
      'extranet.simpleview',
      'mailto:',
      'tel:',
      '#'
    ];
    
    const allLinkMatches = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);
    if (allLinkMatches) {
      // First pass: look for links with "website", "official", "tickets", etc. in text or class
      for (const linkMatch of allLinkMatches) {
        const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http')) {
          const linkUrl = hrefMatch[1];
          const shouldExclude = excludeDomains.some(domain => linkUrl.includes(domain));
          
          if (!shouldExclude) {
            const linkElement = linkMatch.toLowerCase();
            if (linkElement.includes('visit') || 
                linkElement.includes('website') || 
                linkElement.includes('official') ||
                linkElement.includes('tickets') ||
                linkElement.includes('register') ||
                linkElement.includes('more info')) {
              console.log('Found via keyword match:', linkUrl);
              return { visitUrl: linkUrl, dateStr, timeStr };
            }
          }
        }
      }
      
      // Second pass: first non-excluded external link
      for (const linkMatch of allLinkMatches) {
        const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1] && hrefMatch[1].startsWith('http')) {
          const linkUrl = hrefMatch[1];
          const shouldExclude = excludeDomains.some(domain => linkUrl.includes(domain));
          
          if (!shouldExclude) {
            console.log('Found via fallback:', linkUrl);
            return { visitUrl: linkUrl, dateStr, timeStr };
          }
        }
      }
    }

    console.log('No suitable external URL found for:', eventUrl);
    return { visitUrl: null, dateStr, timeStr };
    
  } catch (error) {
    console.error('Error extracting URL from', eventUrl, ':', error);
    return { visitUrl: null, dateStr: null, timeStr: null };
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
      const body = await req.json().catch(() => ({}));
      const batchSize = Math.min(Math.max(body.batchSize || 20, 1), 50); // Min 1, max 50, default 20
      
      console.log(`Processing batch of ${batchSize} events`);
      
      // Get events with catchdesmoines.com URLs
      const { data: events, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, title, source_url')
        .ilike('source_url', '%catchdesmoines.com%')
        .limit(batchSize);

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
          const extractedData = await extractVisitWebsiteUrl(event.source_url);
          
          if (extractedData.visitUrl) {
            // Prepare update data
            const updateData: any = { source_url: extractedData.visitUrl };
            
            // If we extracted datetime info, parse and update event_start_utc
            if (extractedData.dateStr) {
              const parsedDate = parseEventDateTime(extractedData.dateStr, extractedData.timeStr || undefined);
              if (parsedDate) {
                updateData.event_start_utc = parsedDate.toISOString();
                console.log(`Parsed event datetime for ${event.id}: ${parsedDate.toISOString()}`);
              } else {
                console.warn(`Failed to parse datetime for event ${event.id}: ${extractedData.dateStr} ${extractedData.timeStr}`);
              }
            }
            
            // Update the event with the new URL and potentially datetime
            const { error: updateError } = await supabaseClient
              .from('events')
              .update(updateData)
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
                newUrl: extractedData.visitUrl
              });
              console.log(`Updated event ${event.id}: ${event.source_url} -> ${extractedData.visitUrl}${updateData.event_start_utc ? ` (datetime: ${updateData.event_start_utc})` : ''}`);
            }
          } else {
            result.errors.push({
              eventId: event.id,
              error: 'No external URL found on page'
            });
          }

          // Add small delay between requests to be respectful
          await new Promise(resolve => setTimeout(resolve, 800));

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
    
    if (req.method === 'GET') {
      // Return count of remaining catchdesmoines URLs
      const { count, error: countError } = await supabaseClient
        .from('events')
        .select('id', { count: 'exact', head: true })
        .ilike('source_url', '%catchdesmoines.com%');
      
      if (countError) {
        throw new Error(`Failed to count events: ${countError.message}`);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          remaining: count || 0 
        }),
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