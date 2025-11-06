import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate and Fix Event Source URLs
 *
 * Problem: Many events have source_url pointing to aggregator sites
 * (catchdesmoines.com, eventbrite.com) instead of the actual event/ticket page.
 *
 * Solution: Scrape the aggregator page to find the real event URL
 * (StubHub, Ticketmaster, official venue site, etc.)
 *
 * Runs weekly via cron to maintain accurate event links.
 */

// Aggregator domains that should be replaced with actual event URLs
const AGGREGATOR_DOMAINS = [
  'catchdesmoines.com',
  'eventbrite.com',
  'meetup.com',
  'facebook.com/events'
];

// Ticket platform domains (these are the actual destinations we want)
const TICKET_PLATFORMS = [
  'ticketmaster.com',
  'stubhub.com',
  'tickets.com',
  'axs.com',
  'seatgeek.com',
  'eventbrite.com/e/',  // Direct event pages are OK
  'universe.com',
  'etix.com',
  'livenation.com'
];

/**
 * Check if URL is an aggregator that should be replaced
 */
function isAggregatorUrl(url: string): boolean {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    return AGGREGATOR_DOMAINS.some(agg => domain.includes(agg));
  } catch {
    return false;
  }
}

/**
 * Check if URL is a direct ticket platform (good URL)
 */
function isTicketPlatform(url: string): boolean {
  try {
    const urlLower = url.toLowerCase();
    return TICKET_PLATFORMS.some(platform => urlLower.includes(platform));
  } catch {
    return false;
  }
}

/**
 * Extract actual event URL from aggregator page HTML
 */
async function findActualEventUrl(event: any): Promise<string | null> {
  try {
    console.log(`🔍 Analyzing ${event.title} - ${event.source_url}`);

    // Fetch the aggregator page
    const response = await fetch(event.source_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.log(`⚠️ Failed to fetch ${event.source_url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Pattern 1: Look for ticket/buy buttons with external URLs
    const ticketPatterns = [
      // Direct href to ticket platforms
      /href=["']([^"']*(?:ticketmaster|stubhub|tickets\.com|axs\.com|seatgeek|livenation)[^"']*)["']/gi,
      // Buy ticket buttons with specific classes
      /<a[^>]*class=["'][^"']*(?:buy-ticket|get-ticket|purchase|ticket-link)[^"']*["'][^>]*href=["']([^"']+)["']/gi,
      // action-item class (Catch Des Moines specific)
      /<a[^>]*class=["'][^"']*action-item[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>.*?(?:Visit Website|Buy Tickets|Get Tickets)/is,
    ];

    for (const pattern of ticketPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const foundUrl = match[1];
        if (foundUrl && isTicketPlatform(foundUrl)) {
          console.log(`✅ Found ticket URL: ${foundUrl}`);
          return foundUrl;
        }
      }
    }

    // Pattern 2: Look for official event website links (not social media)
    const websitePatterns = [
      /<a[^>]*href=["']([^"']+)["'][^>]*>.*?(?:Official Website|Event Website|Visit Website)/is,
      /<a[^>]*class=["'][^"']*(?:website|official|external)[^"']*["'][^>]*href=["']([^"']+)["']/gi,
    ];

    for (const pattern of websitePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const foundUrl = match[1];
        // Exclude social media and aggregator sites
        if (!foundUrl.includes('facebook.com') &&
            !foundUrl.includes('twitter.com') &&
            !foundUrl.includes('instagram.com') &&
            !isAggregatorUrl(foundUrl)) {
          console.log(`✅ Found official website: ${foundUrl}`);
          return foundUrl;
        }
      }
    }

    console.log(`⚠️ No better URL found for ${event.title}`);
    return null;

  } catch (error) {
    console.error(`❌ Error analyzing ${event.title}:`, error.message);
    return null;
  }
}

/**
 * Use Claude AI as fallback to find the best URL
 */
async function findUrlWithAI(event: any, html: string, claudeApiKey: string): Promise<string | null> {
  try {
    console.log(`🤖 Using AI to find better URL for ${event.title}`);

    const prompt = `Find the primary ticket purchase URL or official event website from this HTML snippet.

Event: ${event.title}
Date: ${event.date}
Current URL: ${event.source_url}

HTML snippet:
${html.substring(0, 8000)}

Instructions:
1. Look for ticket purchase links (StubHub, Ticketmaster, Tickets.com, AXS, etc.)
2. If no ticket link, find the official event website (NOT social media)
3. Return ONLY the URL, nothing else
4. If no good URL found, return "NONE"

URL:`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      console.log(`⚠️ Claude API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const url = data.content?.[0]?.text?.trim();

    if (url && url !== 'NONE' && !url.includes('facebook.com')) {
      console.log(`✅ AI found URL: ${url}`);
      return url;
    }

    return null;

  } catch (error) {
    console.error(`❌ AI analysis error:`, error.message);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const claudeApiKey = Deno.env.get('CLAUDE_API');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🚀 Starting source URL validation...');

    // Parse request body for configuration
    const body = await req.json().catch(() => ({}));
    const {
      limit = 50,  // Process 50 events at a time
      useAI = !!claudeApiKey,  // Use AI if API key available
    } = body;

    // Find events with aggregator URLs that are happening in the future
    const { data: eventsToFix, error: fetchError } = await supabase
      .from('events')
      .select('id, title, date, source_url, venue')
      .gte('date', new Date().toISOString())
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    if (!eventsToFix || eventsToFix.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No events to process',
        checked: 0,
        updated: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Filter to only aggregator URLs
    const aggregatorEvents = eventsToFix.filter(e => isAggregatorUrl(e.source_url));
    console.log(`📊 Found ${aggregatorEvents.length} events with aggregator URLs out of ${eventsToFix.length} total`);

    const updates: Array<{ id: string; title: string; oldUrl: string; newUrl: string }> = [];
    const errors: Array<{ id: string; title: string; error: string }> = [];

    // Process each event
    for (const event of aggregatorEvents) {
      try {
        // Try to find actual event URL
        let actualUrl = await findActualEventUrl(event);

        // Fallback to AI if enabled and no URL found
        if (!actualUrl && useAI && claudeApiKey) {
          const response = await fetch(event.source_url);
          if (response.ok) {
            const html = await response.text();
            actualUrl = await findUrlWithAI(event, html, claudeApiKey);
          }
        }

        if (actualUrl && actualUrl !== event.source_url) {
          updates.push({
            id: event.id,
            title: event.title,
            oldUrl: event.source_url,
            newUrl: actualUrl
          });
        }

        // Rate limiting - wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error processing ${event.title}:`, error.message);
        errors.push({
          id: event.id,
          title: event.title,
          error: error.message
        });
      }
    }

    // Batch update events with better URLs
    let updatedCount = 0;
    for (const update of updates) {
      try {
        const { error: updateError } = await supabase
          .from('events')
          .update({ source_url: update.newUrl })
          .eq('id', update.id);

        if (updateError) {
          errors.push({
            id: update.id,
            title: update.title,
            error: updateError.message
          });
        } else {
          updatedCount++;
          console.log(`✅ Updated ${update.title}: ${update.oldUrl} → ${update.newUrl}`);
        }
      } catch (error) {
        console.error(`❌ Failed to update ${update.title}:`, error.message);
      }
    }

    const response = {
      success: true,
      message: `URL validation completed: ${updatedCount} events updated`,
      checked: aggregatorEvents.length,
      updated: updatedCount,
      errors: errors.length,
      updates: updates.map(u => ({
        title: u.title,
        oldUrl: u.oldUrl,
        newUrl: u.newUrl
      })),
      errorDetails: errors.length > 0 ? errors : undefined
    };

    console.log('📊 Final results:', JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ URL validation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
