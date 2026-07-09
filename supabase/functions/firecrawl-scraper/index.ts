/**
 * SECURITY: verify_jwt = false
 * Reason: Background data ingestion job that crawls external sources without user session context
 * Alternative measures: URL validation against allowlist, domain exclusion list prevents scraping restricted sites
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO, format as dateFnsFormat } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import { scrapeUrl, scrapeUrls } from "../_shared/scraper.ts";
import { getAIConfig, buildClaudeRequest, buildLightweightClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";
import { validateURLForSSRF } from "../_shared/validation.ts";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { tryDomainAdapter } from "../_shared/domain-adapters/index.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { fetchAndStoreImage, CONTENT_TYPE_MAP } from "../_shared/imageStorage.ts";

// Marker time for events without specific times (7:31:58 PM Central)
const NO_TIME_MARKER = "19:31:58";

// Sports schedule domains - use domain-specific prompt and ticket URL handling
const SPORTS_SCHEDULE_DOMAINS = [
  "milb.com/iowa",
  "iowawild.com",
  "theiowabarnstormers.com",
  "iowa.gleague.nba.com",
];

function isSportsScheduleDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return SPORTS_SCHEDULE_DOMAINS.some((d) => lower.includes(d));
}

interface ScrapRequest {
  url: string;
  category: string;
  maxPages?: number; // Optional parameter for pagination
  scraperBackend?: 'browserless' | 'puppeteer' | 'playwright' | 'firecrawl' | 'fetch'; // Allow backend override
  // Batching parameters for processing events in smaller chunks
  batchSize?: number; // Max events to process per request (default: 5)
  skipEvents?: number; // Number of events to skip (for pagination through large result sets)
  skipVisitWebsite?: boolean; // Skip fetching Visit Website URLs (faster, uses catchdesmoines URLs)
}

// Default batch size - keep small to avoid timeouts
const DEFAULT_BATCH_SIZE = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Known venue data interface
interface KnownVenueData {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

// Cache for known venues to avoid repeated DB queries
let knownVenuesCache: KnownVenueData[] | null = null;
let venuesCacheLoadedAt: number = 0;
const VENUES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all known venues into memory cache for fast matching
 */
async function loadKnownVenuesCache(): Promise<KnownVenueData[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (knownVenuesCache && (now - venuesCacheLoadedAt) < VENUES_CACHE_TTL) {
    return knownVenuesCache;
  }

  console.log('🏢 Loading known venues cache...');

  const { data, error } = await supabase
    .from('known_venues')
    .select('id, name, aliases, address, city, state, zip, latitude, longitude, phone, email, website')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Error loading known venues:', error);
    return [];
  }

  knownVenuesCache = data || [];
  venuesCacheLoadedAt = now;

  console.log(`✅ Loaded ${knownVenuesCache.length} known venues into cache`);
  return knownVenuesCache;
}

/**
 * Find a matching known venue by name or alias
 * Returns venue data if found, null otherwise
 */
async function findMatchingKnownVenue(venueName: string): Promise<KnownVenueData | null> {
  if (!venueName || venueName.trim().length === 0) {
    return null;
  }

  const venues = await loadKnownVenuesCache();
  const searchText = venueName.toLowerCase().trim();

  // First, try exact name match
  for (const venue of venues) {
    if (venue.name.toLowerCase() === searchText) {
      console.log(`🎯 Exact venue match: "${venueName}" -> "${venue.name}"`);
      return venue;
    }
  }

  // Then, try alias match
  for (const venue of venues) {
    const venueData = venue as any;
    if (venueData.aliases && Array.isArray(venueData.aliases)) {
      for (const alias of venueData.aliases) {
        if (alias.toLowerCase() === searchText) {
          console.log(`🎯 Alias match: "${venueName}" -> "${venue.name}" (via alias "${alias}")`);
          return venue;
        }
      }
    }
  }

  // Try partial match on name (venue name contains search or vice versa)
  for (const venue of venues) {
    const venueLower = venue.name.toLowerCase();
    if (venueLower.includes(searchText) || searchText.includes(venueLower)) {
      // Only match if significant overlap (avoid matching "The" in everything)
      if (searchText.length >= 5 || venueLower.length >= 5) {
        console.log(`🎯 Partial venue match: "${venueName}" -> "${venue.name}"`);
        return venue;
      }
    }
  }

  // Try partial match on aliases
  for (const venue of venues) {
    const venueData = venue as any;
    if (venueData.aliases && Array.isArray(venueData.aliases)) {
      for (const alias of venueData.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower.includes(searchText) || searchText.includes(aliasLower)) {
          if (searchText.length >= 5 || aliasLower.length >= 5) {
            console.log(`🎯 Partial alias match: "${venueName}" -> "${venue.name}" (via alias "${alias}")`);
            return venue;
          }
        }
      }
    }
  }

  return null;
}

// Enhanced time parsing for events with Central Time handling 
interface ParsedDateTime { 
  event_start_local: string; 
  event_timezone: string; 
  event_start_utc: Date; 
} 

function parseEventDateTime(dateStr: string): ParsedDateTime | null { 
  if (!dateStr) return null; 
 
  const eventTimeZone = "America/Chicago"; // Default to Central Time 
 
  try { 
    console.log(`🕐 Parsing date string: "${dateStr}"`);
    
    let centralTimeString: string;
    
    // Match YYYY-MM-DD HH:MM:SS format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      centralTimeString = dateStr;
    } 
    // Match YYYY-MM-DD format (use marker time to indicate no specific time)
    else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      centralTimeString = `${dateStr} ${NO_TIME_MARKER}`;
    }
    // Fallback: try to parse and reformat
    else {
      const fallbackDate = new Date(dateStr);
      if (isNaN(fallbackDate.getTime())) {
        console.log(`⚠️ Could not parse date: ${dateStr}`);
        return null;
      }
      // Assume the parsed date is in Central Time
      const year = fallbackDate.getFullYear();
      const month = (fallbackDate.getMonth() + 1).toString().padStart(2, '0');
      const day = fallbackDate.getDate().toString().padStart(2, '0');
      const hours = fallbackDate.getHours().toString().padStart(2, '0');
      const minutes = fallbackDate.getMinutes().toString().padStart(2, '0');
      const seconds = fallbackDate.getSeconds().toString().padStart(2, '0');
      centralTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    // Convert Central Time to UTC
    const localDate = parseISO(centralTimeString);
    const utcDate = fromZonedTime(localDate, eventTimeZone);
    
    console.log(`🕐 Parsed: ${dateStr} -> Central: ${centralTimeString} -> UTC: ${utcDate.toISOString()}`);
 
    if (!isNaN(utcDate.getTime())) { 
      return { 
        event_start_local: centralTimeString, 
        event_timezone: eventTimeZone, 
        event_start_utc: utcDate, 
      }; 
    } 
  } catch (error) { 
    console.log(`⚠️ Could not parse date: ${dateStr}`, error); 
  } 
 
  return null;
}

/**
 * Generate SEO content for an event using the lightweight AI model (Haiku)
 * This generates seo_title, seo_description, seo_keywords, seo_h1, and GEO content
 */
async function generateEventSEO(
  eventId: string,
  event: { title: string; venue?: string; location?: string; date?: string; category?: string },
  supabaseClient: any,
  claudeApiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> {
  try {
    console.log(`🔍 Generating SEO content for event: ${event.title}`);

    const prompt = `Generate comprehensive SEO and GEO optimization content for this Des Moines event. Return ONLY a JSON object with these exact fields:

{
  "title": "SEO title (under 60 chars, include event name + Des Moines + date)",
  "description": "Meta description (150-155 chars, compelling with local keywords)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "h1": "H1 tag matching primary search intent",
  "summary": "2-3 sentence GEO summary for AI engines, location-focused",
  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4"],
  "faq": [
    {"question": "When is ${event.title}?", "answer": "Answer with date and time"},
    {"question": "Where is ${event.title} located?", "answer": "Answer with venue and Des Moines"},
    {"question": "What type of event is ${event.title}?", "answer": "Answer with category"}
  ]
}

Event Details:
- Title: ${event.title}
- Venue: ${event.venue || 'N/A'}
- Location: ${event.location || 'Des Moines, IA'}
- Date: ${event.date || 'N/A'}
- Category: ${event.category || 'General'}

Focus on Des Moines local SEO and GEO optimization for AI search engines.`;

    const config = await getAIConfig(supabaseUrl, supabaseKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
    // Use lightweight model (Haiku) for SEO - fast and cost-effective
    const requestBody = await buildLightweightClaudeRequest(
      [{ role: 'user', content: prompt }],
      {
        supabaseUrl,
        supabaseKey,
        customMaxTokens: 1000,
        customTemperature: 0.1
      }
    );

    const claudeResponse = await fetch(config.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!claudeResponse.ok) {
      console.error(`❌ SEO generation API error: ${claudeResponse.status}`);
      return false;
    }

    const claudeData = await claudeResponse.json();
    const generatedContent = claudeData.content?.[0]?.text;

    if (!generatedContent) {
      console.error(`❌ No SEO content generated for: ${event.title}`);
      return false;
    }

    // Parse the JSON response
    let seoData;
    try {
      const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      seoData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`❌ Failed to parse SEO response for: ${event.title}`, parseError);
      return false;
    }

    // Update the event with SEO content
    const { error: updateError } = await supabaseClient
      .from('events')
      .update({
        seo_title: seoData.title,
        seo_description: seoData.description,
        seo_keywords: seoData.keywords,
        seo_h1: seoData.h1,
        geo_summary: seoData.summary,
        geo_key_facts: seoData.keyFacts,
        geo_faq: seoData.faq,
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId);

    if (updateError) {
      console.error(`❌ Failed to save SEO content for: ${event.title}`, updateError);
      return false;
    }

    console.log(`✅ SEO content generated for: ${event.title}`);
    return true;
  } catch (error) {
    console.error(`❌ Error generating SEO for event: ${event.title}`, error);
    return false;
  }
}

// Sports schedule AI prompt - for Iowa Cubs, Iowa Wild, Iowa Barnstormers, Iowa Wolves
function getSportsSchedulePrompt(url: string, content: string): string {
  const now = new Date();
  const currentDate = dateFnsFormat(now, "MMMM d, yyyy");

  let teamName = "Des Moines Sports Team";
  let venue = "Des Moines, IA";
  let defaultTicketBase = "";

  const lower = url.toLowerCase();
  if (lower.includes("milb.com/iowa")) {
    teamName = "Iowa Cubs";
    venue = "Principal Park";
    defaultTicketBase = "https://www.milb.com/iowa/tickets";
  } else if (lower.includes("iowawild.com")) {
    teamName = "Iowa Wild";
    venue = "Wells Fargo Arena";
    defaultTicketBase = "https://www.iowawild.com/tickets";
  } else if (lower.includes("theiowabarnstormers.com")) {
    teamName = "Iowa Barnstormers";
    venue = "Wells Fargo Arena";
    defaultTicketBase = "https://theiowabarnstormers.com/tickets";
  } else if (lower.includes("iowa.gleague.nba.com")) {
    teamName = "Iowa Wolves";
    venue = "Wells Fargo Arena";
    defaultTicketBase = "https://iowa.gleague.nba.com/tickets";
  }

  return `You are an expert at extracting SPORTS GAME SCHEDULES from team websites. Extract EVERY game/event from this content from ${url}.

CURRENT DATE: ${currentDate}
WEBSITE CONTENT:
${content.substring(0, 25000)}

🎯 SPORTS SCHEDULE EXTRACTION - WHAT TO LOOK FOR:
- Game matchups: "vs [Opponent]", "at [Opponent]", "@ [Opponent]"
- Date patterns: "Fri, Mar 6", "Sat, Oct 11 6:00PM", "Mar 21 5:00 PM CDT"
- Home vs Away: "Home" / "VS" = home game, "Away" / "AT" / "@" = away game
- **CRITICAL**: Extract ONLY HOME games (games at ${venue}) - skip away games
- "Buy Tickets" links, "BUYTIX", ticket buttons - use as source_url
- Opponent team names (Storm Chasers, Griffins, Thunderbirds, Blizzard, etc.)
- Tables, schedule grids, game cards, list items with dates

📅 DATE CONVERSION (Central Time - Des Moines, Iowa):
- All times are Central (CT/CDT)
- "6:00PM" → "19:00:00", "7:00 PM" → "19:00:00", "5:05PM" → "17:05:00"
- "Fri, Mar 6 6:05PM" → "2026-03-06 18:05:00"
- No time? Default to 19:00:00 (7:00 PM)
- SKIP past dates (before ${currentDate})

🔗 TICKET/SOURCE URL (CRITICAL):
- Look for "Buy Tickets", "BUYTIX", "tickets" links - use the href as source_url
- Pattern: <a href="...">Buy Tickets</a> or similar
- If per-game ticket link found, use it. Else use: ${defaultTicketBase}
- source_url MUST be a full https:// URL

For EVERY HOME GAME you find, extract:
- title: "${teamName} vs [Opponent]" (e.g., "Iowa Cubs vs Storm Chasers")
- description: Brief description (e.g., "Triple-A baseball at Principal Park")
- date: YYYY-MM-DD HH:MM:SS (future dates only, Central Time)
- location: "Des Moines, IA"
- venue: "${venue}"
- category: "Sports"
- price: "See website" or price if shown
- source_url: Ticket purchase URL (Buy Tickets link or ${defaultTicketBase})

FORMAT AS JSON ARRAY ONLY - no other text:
[
  {
    "title": "${teamName} vs Opponent Name",
    "description": "Game description",
    "date": "2026-MM-DD HH:MM:SS",
    "location": "Des Moines, IA",
    "venue": "${venue}",
    "category": "Sports",
    "price": "See website",
    "source_url": "https://...ticket-url..."
  }
]

🚨 Extract EVERY home game. Return [] ONLY if no games found. Include source_url (ticket link) for each event.`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  // Rate limiting: 10 requests per 15 minutes (SEC-022), persistent across cold starts
  const rateLimit = await checkRateLimitPersistent(req, { endpoint: 'firecrawl-scraper', max: 10, message: 'Scraper rate limit exceeded.' });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      url,
      category,
      maxPages = 3,
      scraperBackend,
      batchSize = DEFAULT_BATCH_SIZE,
      skipEvents = 0,
      skipVisitWebsite = false
    }: ScrapRequest = await req.json();

    console.log(`📦 Batch settings: size=${batchSize}, skip=${skipEvents}, skipVisitWebsite=${skipVisitWebsite}`);

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // SSRF validation: prevent requests to private/internal addresses
    const ssrfCheck = validateURLForSSRF(url);
    if (!ssrfCheck.valid) {
      return new Response(
        JSON.stringify({ error: `URL rejected: ${ssrfCheck.error}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🚀 Starting scrape of ${url} for ${category} (max ${maxPages} pages) using ${scraperBackend || 'default backend'}`);

    // Try a domain-specific API adapter first (e.g. statsapi.mlb.com for Iowa
    // Cubs, SeatGeek Platform API). If it returns items, skip scrape + Claude.
    const adapterResult = await tryDomainAdapter(url, category);

    // The adapter (when matched) hands back items directly; otherwise we
    // fall through to scraping the single URL the user supplied.
    const urlsToScrape: string[] = adapterResult ? [] : [url];

    console.log(`📄 Will scrape ${urlsToScrape.length} pages`);

    const allExtractedItems: any[] = adapterResult ? [...adapterResult.items] : [];
    let totalContentLength = 0;

    if (adapterResult) {
      console.log(`🎯 Using ${adapterResult.adapter} adapter — bypassing scrape + Claude (${adapterResult.items.length} items)`);
    }

    // Scrape URLs using universal scraper (supports Puppeteer/Playwright/Firecrawl)
    // When the adapter handled it, urlsToScrape is empty and this is a no-op.
    const scrapeResults = await scrapeUrls(urlsToScrape, {
      backend: scraperBackend,
      waitTime: 5000,
      timeout: 30000,
    }, 2); // Scrape 2 URLs at a time

    // Process each result
    for (let i = 0; i < scrapeResults.length; i++) {
      const result = scrapeResults[i];
      const currentUrl = urlsToScrape[i];
      
      console.log(`🌐 Processing: ${currentUrl}`);
      
      if (!result.success) {
        console.error(`❌ Scraping error for ${currentUrl}: ${result.error}`);
        continue;
      }

      const content = result.markdown || result.text || result.html || '';
      
      console.log(`📄 ${result.backend} returned ${content.length} characters (took ${result.duration}ms)`);
      totalContentLength += content.length;

      if (!content || content.length < 100) {
        console.error(`❌ No usable content returned from ${currentUrl}`);
        continue;
      }

      // Extract events using Claude AI for this page
      const claudeApiKey = Deno.env.get('CLAUDE_API');
      
      if (!claudeApiKey) {
        console.error(`❌ Claude API key not found`);
        break; // Exit loop if no API key
      }

      // Generate category-specific prompts
      // Use sports schedule prompt for Iowa Cubs, Iowa Wild, Iowa Barnstormers, Iowa Wolves
      const prompts = {
        events: isSportsScheduleDomain(currentUrl)
          ? getSportsSchedulePrompt(currentUrl, content)
          : `You are an expert at extracting event information from websites, especially from CatchDesMoines.com and other Des Moines area event sites. Your task is to find EVERY SINGLE EVENT mentioned in this content from ${currentUrl}.

CURRENT DATE: July 30, 2025
WEBSITE CONTENT:
${content.substring(0, 15000)}

CRITICAL PARSING INSTRUCTIONS:

🎯 WHAT TO LOOK FOR:
- ANY text that mentions specific event names or titles
- Venue names that host events (fairgrounds, theaters, arenas, etc.)
- Date patterns (July 30, Jul 30th, 7/30, 2025, etc.)
- Event categories (concerts, festivals, sports, shows, fairs, etc.)
- HTML structures: <article class="slide">, event cards, lists, grids

🔍 SPECIFIC EVENT PATTERNS:
- Look for proper nouns that sound like event names
- Geographic venues (Warren County, Indianola, Des Moines locations)
- Entertainment venues (theaters, halls, stadiums)
- Event types (fair, festival, concert, show, game, exhibition)
- Time indicators (daily, weekly, through August, etc.)

💡 EXTRACTION EXAMPLES:
- "Warren County Fair" → title: "Warren County Fair"
- "Anastasia the Musical" → title: "Anastasia the Musical" 
- "National Senior Games" → title: "National Senior Games"
- "Iowa Artists Sale-A-Bration" → title: "Iowa Artists Sale-A-Bration"
- "Live Horse Racing" → title: "Live Horse Racing"

📅 DATE CONVERSION (CRITICAL TIMEZONE HANDLING):
- All events are in Des Moines, Iowa (Central Time Zone) 
- Convert ALL times to Central Time (CDT in summer -5 UTC, CST in winter -6 UTC)
- Current date reference: July 30, 2025

EXAMPLES:
- "Jul 30th" → "2025-07-30 19:00:00" (7:00 PM Central Time default)
- "August 1st" → "2025-08-01 19:00:00" 
- "7:30 PM" → "2025-MM-DD 19:30:00" (keep Central Time)
- "8 AM" → "2025-MM-DD 08:00:00" (morning events)
- "Through July 28" → create events until that date
- No specific time? → default to 7:00 PM Central (19:00:00)
- All-day events → use 12:00 PM Central (12:00:00)
- Past dates (before July 30, 2025) → SKIP these events

⚠️ TIMEZONE CRITICAL: Store times in Central Time format (not UTC). The system will handle UTC conversion automatically.

🔗 IMPORTANT - EVENT DETAIL URLs:
On listing pages, the "Visit Website" link is NOT shown - it's only on individual event detail pages.
Your job is to extract the detail_url (link to the event's detail page) so we can fetch the actual source URL.

Look for anchor tags that link to event detail pages:
- Pattern: /event/event-slug/event-id/
- Example: <a href="/event/chef-georges-steak-bar-classics/53924/">Event Title</a>

🏢 VENUE EXTRACTION:
- Look for venue names near event titles
- Just extract the venue NAME - we have a database of known venues with full addresses
- Common Des Moines venues: Wells Fargo Arena, Civic Center, Hoyt Sherman, Val Air, etc.
- County fairgrounds, high schools, parks
- If unclear → use "Des Moines, IA" as location
- DO NOT spend tokens on addresses/coordinates - we'll look these up automatically

For EVERY event you find, extract:
- title: Exact event name from content
- date: YYYY-MM-DD HH:MM:SS (future dates only, in Central Time)
- location: City/state (default: "Des Moines, IA")
- venue: Specific venue name
- description: Any details about the event
- category: Music/Sports/Arts/Community/Entertainment/Festival
- price: If mentioned, or "See website"
- detail_url: The link to the individual event page (e.g., "/event/event-name/12345/" for CatchDesMoines)

🔗 CRITICAL - EXTRACTING detail_url:
When crawling event listing pages, look for links to individual event detail pages.
For CatchDesMoines.com, these links usually follow the pattern: /event/event-slug/event-id/
Example: /event/chef-georges-steak-bar-classics/53924/
This URL is REQUIRED for fetching the actual "Visit Website" URL from the detail page.

CRITICAL SUCCESS FACTORS:
✅ Extract events even with incomplete info
✅ Use logical defaults for missing details
✅ Convert all date formats consistently to Central Time
✅ Include recurring events as separate entries
✅ ALWAYS extract the detail_url for each event
✅ Scan the ENTIRE content thoroughly

FORMAT AS JSON ARRAY ONLY - no other text:
[
  {
    "title": "Event Name",
    "date": "2025-MM-DD HH:MM:SS",
    "location": "Des Moines, IA",
    "venue": "Venue Name",
    "description": "Event description",
    "category": "Concert",
    "price": "$25",
    "detail_url": "/event/event-name/12345/"
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY event mentioned in the content. The detail_url is CRITICAL - always include it. Return empty array [] ONLY if literally no events are found anywhere in the content.`,

        restaurants: `You are an expert at extracting restaurant information from websites like Eater.com, Des Moines Register, and restaurant listing sites. Your task is to find EVERY SINGLE RESTAURANT mentioned in this content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

CRITICAL PARSING INSTRUCTIONS FOR RESTAURANT SITES:

🎯 WHAT TO LOOK FOR:
- Restaurant names (often in headers, links, or bold text)
- Food establishment mentions (cafes, bistros, breweries, bakeries, etc.)
- Article structures with restaurant reviews or lists
- Address information or neighborhood mentions
- Menu items or cuisine descriptions
- Chef or owner names associated with restaurants

🔍 SPECIFIC RESTAURANT PATTERNS:
- Look for proper nouns that sound like restaurant names
- Food-related business names (ending in Kitchen, Grill, Bistro, etc.)
- Geographic location indicators (downtown, West Des Moines, etc.)
- Price indicators ($, $$, $$$, "affordable", "upscale")
- Cuisine type mentions (Italian, Mexican, farm-to-table, etc.)
- Restaurant review language ("must-try", "best", "favorite")

For EVERY restaurant you find, extract:
- name: Exact restaurant name from content
- cuisine: Type of cuisine (Italian, American, Mexican, Asian Fusion, etc.)
- location: Address or area description (default: "Des Moines, IA")
- rating: Numerical rating 1-5 if mentioned, or null
- price_range: $, $$, $$$, or $$$$ based on content
- description: Key details about food, atmosphere, or specialties
- phone: Phone number if mentioned
- website: Website URL if mentioned

FORMAT AS JSON ARRAY:
[
  {
    "name": "Restaurant Name",
    "cuisine": "Cuisine Type",
    "location": "Des Moines, IA",
    "rating": 4.5,
    "price_range": "$$",
    "description": "Restaurant description and specialties",
    "phone": "515-xxx-xxxx",
    "website": "https://restaurant-website.com"
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY restaurant or food establishment mentioned in the content. Return empty array [] ONLY if literally no restaurants are found anywhere in the content.`,

        playgrounds: `You are an expert at extracting playground and children's recreation information from websites like visitdesmoines.com, Greater DSM, and family activity sites. Your task is to find EVERY SINGLE PLAYGROUND or children's recreational facility mentioned in this content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

CRITICAL PARSING INSTRUCTIONS FOR PLAYGROUND SITES:

🎯 WHAT TO LOOK FOR:
- Playground names (often park names or specific playground names)
- Children's recreation areas, splash pads, adventure playgrounds
- Parks with playground equipment mentioned
- Family-friendly recreational facilities
- Youth activity centers or outdoor play areas
- Age-specific play structures or facilities

For EVERY playground you find, extract:
- name: Exact playground or park name from content
- location: Address or area description (default: "Des Moines, IA")
- description: Key features, themes, or special attributes
- age_range: Target age group (e.g., "2-12 years", "All ages")
- amenities: Array of equipment and features
- rating: Numerical rating 1-5 if mentioned, or null

FORMAT AS JSON ARRAY:
[
  {
    "name": "Playground Name",
    "location": "Des Moines, IA",
    "description": "Playground features and description",
    "age_range": "2-12 years",
    "amenities": ["swings", "slides", "climbing structure", "splash pad"],
    "rating": 4.2
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY playground or children's recreational facility mentioned in the content. Return empty array [] ONLY if literally no playgrounds are found anywhere in the content.`,

        restaurant_openings: `Extract information about new restaurant openings from this website content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

Please analyze this content and extract information about NEW restaurant openings, upcoming restaurants, or recently opened restaurants. For each opening, provide:
- name: Restaurant name
- description: Description of the restaurant concept
- location: Location where it will open/opened
- cuisine: Type of cuisine
- opening_date: Opening date (format as YYYY-MM-DD, or null if not specified)
- status: 'opening_soon', 'newly_opened', or 'announced'

Format as JSON array:
[
  {
    "name": "Restaurant Name",
    "description": "Restaurant concept description",
    "location": "Location",
    "cuisine": "Cuisine Type",
    "opening_date": "2025-MM-DD",
    "status": "opening_soon"
  }
]

Return empty array [] if no restaurant openings found.`,

        attractions: `Extract all attractions, tourist spots, or places of interest from this website content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

Please analyze this content and extract ALL attractions, tourist destinations, or points of interest. For each attraction, provide:
- name: Attraction name
- type: Type of attraction (Museum, Park, Historic Site, Entertainment, etc.)
- location: Full address or location description
- description: Description of the attraction
- rating: Numerical rating if available (1-5 scale)
- website: Website URL if available

Format as JSON array:
[
  {
    "name": "Attraction Name",
    "type": "Attraction Type",
    "location": "Full address",
    "description": "Attraction description",
    "rating": 4.3,
    "website": "Website URL"
  }
]

Return empty array [] if no attractions found.`,

        competitor_analysis: `Analyze this competitor website content from ${currentUrl} and extract valuable content pieces for competitive analysis.

WEBSITE CONTENT:
${content.substring(0, 15000)}

Extract ALL content pieces that could be valuable for competitive analysis, including:
- Articles/blog posts about local attractions, events, or dining
- Event listings and promotional content
- Restaurant features or reviews
- Tourism-related content
- Community guides or recommendations
- Marketing campaigns or promotional materials

For each content piece, provide:
- title: Content title or headline
- description: Brief summary of the content
- url: Specific URL if different from page URL, otherwise use page URL
- content_type: Type of content (Article, Event Listing, Guide, Review, etc.)
- category: Content category (Tourism, Dining, Events, Attractions, etc.)
- publish_date: Publication date if available (YYYY-MM-DD format)
- engagement_indicators: Any social sharing numbers, comments, or engagement metrics found

Format as JSON array:
[
  {
    "title": "Content Title",
    "description": "Content description and key points",
    "url": "${currentUrl}",
    "content_type": "Article",
    "category": "Tourism",
    "publish_date": "2025-01-15",
    "engagement_indicators": {
      "likes": 25,
      "shares": 5,
      "comments": 3
    }
  }
]

Return empty array [] if no competitive content found.`
      };

      const selectedPrompt = prompts[category as keyof typeof prompts] || prompts.events;

      console.log(`🤖 Sending ${content.length} characters to Claude AI for ${currentUrl}`);

      // Use centralized AI configuration
      const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);
      const claudeHeaders = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
      const claudeRequestBody = await buildClaudeRequest(
        [{ role: "user", content: selectedPrompt }],
        {
          supabaseUrl,
          supabaseKey,
          customMaxTokens: 6000,
          customTemperature: 0.1,
        }
      );

      const claudeResponse = await fetch(aiConfig.api_endpoint, {
        method: "POST",
        headers: claudeHeaders,
        body: JSON.stringify(claudeRequestBody),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error(`❌ Claude API error for ${currentUrl}: ${claudeResponse.status} - ${errorText}`);
        continue; // Skip this page
      }

      const claudeData = await claudeResponse.json();
      const responseText = claudeData.content?.[0]?.text?.trim();

      console.log(`🔍 Claude response length for ${currentUrl}: ${responseText?.length || 0}`);

      if (!responseText) {
        console.error(`❌ No response text from Claude API for ${currentUrl}`);
        continue; // Skip this page
      }

      // Parse Claude's response
      let pageItems = [];
      try {
        // Extract JSON from the response
        let jsonMatch = responseText.match(/\[[\s\S]*\]/);
        
        if (!jsonMatch) {
          // Try to find JSON in code blocks
          jsonMatch = responseText.match(/```json\s*(\[[\s\S]*?\])\s*```/) ||
                     responseText.match(/```\s*(\[[\s\S]*?\])\s*```/);
          if (jsonMatch) jsonMatch[0] = jsonMatch[1];
        }
        
        if (!jsonMatch) {
          console.error(`❌ No JSON array found in Claude response for ${currentUrl}`);
          continue; // Skip this page
        }
        
        pageItems = JSON.parse(jsonMatch[0]);
        
        if (!Array.isArray(pageItems)) {
          console.error(`❌ Parsed data is not an array for ${currentUrl}: ${typeof pageItems}`);
          pageItems = [];
        }
        
        console.log(`🤖 AI extracted ${pageItems.length} ${category} items from ${currentUrl}`);
        allExtractedItems.push(...pageItems);
        
      } catch (parseError) {
        console.error(`❌ Could not parse AI response JSON for ${currentUrl}:`, parseError);
        continue; // Skip this page
      }
    }

    console.log(`🎯 Total ${category} extracted from all pages: ${allExtractedItems.length}`);

    // For events category, filter out past events
    let filteredItems = allExtractedItems;
    if (category === 'events') {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      filteredItems = allExtractedItems.filter(item => {
        if (!item.date) return true;
        try {
          const itemDate = new Date(item.date);
          itemDate.setHours(0, 0, 0, 0);
          return itemDate >= currentDate;
        } catch (error) {
          console.log(`⚠️ Could not parse date: ${item.date}`);
          return true;
        }
      });
    }

    console.log(`🕒 After filtering: ${filteredItems.length} items (removed ${allExtractedItems.length - filteredItems.length} items)`);

    // Track batch processing info for response
    const batchInfo = {
      totalEvents: filteredItems.length,
      processedStart: 0,
      processedEnd: 0,
      remainingEvents: 0,
      visitWebsiteExtracted: 0,
      skippedVisitWebsite: skipVisitWebsite,
    };

    // For sports schedule events: ensure source_url (ticket link) is set
    if (category === 'events' && isSportsScheduleDomain(url) && filteredItems.length > 0) {
      const lower = url.toLowerCase();
      const defaultTicketUrl =
        lower.includes("milb.com/iowa") ? "https://www.milb.com/iowa/tickets" :
        lower.includes("iowawild.com") ? "https://www.iowawild.com/tickets" :
        lower.includes("theiowabarnstormers.com") ? "https://theiowabarnstormers.com/tickets" :
        lower.includes("iowa.gleague.nba.com") ? "https://iowa.gleague.nba.com/tickets" : url;

      for (let i = 0; i < filteredItems.length; i++) {
        const item = filteredItems[i];
        if (!item.source_url || !item.source_url.startsWith("http")) {
          item.source_url = item.ticket_url?.startsWith("http") ? item.ticket_url : defaultTicketUrl;
        }
      }
      console.log(`🏟️ Sports schedule: Set source_url (ticket links) for ${filteredItems.length} events`);
    }

    // Get appropriate table name and process items
    const tableMapping = {
      events: 'events',
      restaurants: 'restaurants', 
      playgrounds: 'playgrounds',
      restaurant_openings: 'restaurant_openings',
      attractions: 'attractions',
      competitor_analysis: 'competitor_content'
    };

    const tableName = tableMapping[category as keyof typeof tableMapping] || 'events';
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];

    if (filteredItems.length > 0) {
      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < filteredItems.length; i += batchSize) {
        const batch = filteredItems.slice(i, i + batchSize);

        for (const item of batch) {
          try {
            // Transform data based on category
            let transformedData: any = {};
            // Hoisted out of the switch so the post-insert SEO block can read it.
            let knownVenue: KnownVenueData | null = null;

            switch (category) {
              case 'events':
                const parsedEventDateTime = item.date ? parseEventDateTime(item.date) : null;

                // Skip events where we can't parse the date properly
                if (!parsedEventDateTime?.event_start_utc) {
                  console.warn(`⚠️ Skipping event with unparseable date: ${item.title} - ${item.date}`);
                  continue; // Skip this item
                }

                // Check for known venue match to auto-populate address, coordinates, etc.
                const venueText = item.venue || item.location || '';
                knownVenue = await findMatchingKnownVenue(venueText);

                // Build location string from known venue or use AI-extracted data
                let eventLocation = item.location?.substring(0, 100) || "Des Moines, IA";
                let eventVenue = item.venue?.substring(0, 100) || item.location?.substring(0, 100) || "TBD";
                let eventLatitude = null;
                let eventLongitude = null;

                if (knownVenue) {
                  console.log(`🏢 Using known venue data for: ${knownVenue.name}`);

                  // Use canonical venue name
                  eventVenue = knownVenue.name;

                  // Build full address from known venue
                  if (knownVenue.address) {
                    eventLocation = [
                      knownVenue.address,
                      knownVenue.city || 'Des Moines',
                      knownVenue.state || 'IA',
                      knownVenue.zip
                    ].filter(Boolean).join(', ');
                  } else if (knownVenue.city) {
                    eventLocation = `${knownVenue.city}, ${knownVenue.state || 'IA'}`;
                  }

                  // Use coordinates from known venue
                  eventLatitude = knownVenue.latitude;
                  eventLongitude = knownVenue.longitude;
                }

                transformedData = {
                  title: item.title?.substring(0, 200) || "Untitled Event",
                  original_description: item.description?.substring(0, 500) || "",
                  enhanced_description: item.description?.substring(0, 500) || "",
                  date: parsedEventDateTime.event_start_utc.toISOString(),
                  event_start_local: parsedEventDateTime.event_start_local,
                  event_timezone: parsedEventDateTime.event_timezone,
                  event_start_utc: parsedEventDateTime.event_start_utc,
                  location: eventLocation,
                  venue: eventVenue,
                  category: item.category?.substring(0, 50) || "General",
                  price: item.price?.substring(0, 50) || "See website",
                  source_url: item.source_url || url,
                  is_enhanced: false,
                  updated_at: new Date().toISOString(),
                  // Add coordinates if we have them from known venue
                  ...(eventLatitude !== null && { latitude: eventLatitude }),
                  ...(eventLongitude !== null && { longitude: eventLongitude }),
                };
                break;
                
              case 'restaurants':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Unnamed Restaurant",
                  cuisine: item.cuisine?.substring(0, 100) || "American",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  rating: item.rating || null,
                  price_range: item.price_range?.substring(0, 20) || "$$",
                  description: item.description?.substring(0, 500) || "",
                  phone: item.phone?.substring(0, 20) || null,
                  website: item.website?.substring(0, 200) || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'playgrounds':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Playground",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  age_range: item.age_range?.substring(0, 50) || "All ages",
                  amenities: Array.isArray(item.amenities) ? item.amenities.slice(0, 10) : [],
                  rating: item.rating || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'attractions':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Attraction",
                  type: item.type?.substring(0, 100) || "General",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  rating: item.rating || null,
                  website: item.website?.substring(0, 200) || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'competitor_analysis':
                // Find the competitor_id based on the URL
                const { data: competitors } = await supabase
                  .from('competitors')
                  .select('id')
                  .eq('website_url', url)
                  .single();
                
                transformedData = {
                  competitor_id: competitors?.id || null,
                  title: item.title?.substring(0, 200) || "Untitled Content",
                  description: item.description?.substring(0, 1000) || "",
                  url: item.url?.substring(0, 500) || url,
                  content_type: item.content_type?.substring(0, 100) || "General",
                  category: item.category?.substring(0, 100) || "General",
                  content_score: Math.floor(Math.random() * 10) + 1,
                  engagement_metrics: item.engagement_indicators || {},
                  scraped_at: new Date().toISOString(),
                };
                break;
                
              default:
                continue; // Skip unknown categories
            }

            // Check for duplicates
            let existingItems = [];
            if (category === 'events') {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('title', transformedData.title)
                .eq('venue', transformedData.venue);
              existingItems = data || [];
            } else if (category === 'competitor_analysis') {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('title', transformedData.title)
                .eq('competitor_id', transformedData.competitor_id);
              existingItems = data || [];
            } else {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('name', transformedData.name);
              existingItems = data || [];
            }

            if (existingItems.length > 0) {
              const existingItem = existingItems[0];

              // For events: Update source_url if we have a better one (external URL replacing catchdesmoines)
              if (category === 'events' && transformedData.source_url) {
                const oldUrl = existingItem.source_url || '';
                const newUrl = transformedData.source_url || '';

                // Skip if URLs are identical - no update needed
                if (oldUrl === newUrl) {
                  console.log(`⏭️ Duplicate found (same URL): ${transformedData.title}`);
                  continue;
                }

                // Only update if:
                // 1. Old URL is a catchdesmoines list page (/events/) and new is a detail page
                // 2. Old URL contains catchdesmoines.com and new is external
                const oldIsCatchDesMoines = oldUrl.includes('catchdesmoines.com');
                const oldIsListPage = oldUrl.includes('/events/') || oldUrl.includes('/events?');
                const newIsDetailPage = newUrl.includes('/event/') && !newUrl.includes('/events/');
                const newIsExternal = newUrl && !newUrl.includes('catchdesmoines.com');

                if ((oldIsListPage && newIsDetailPage) || (oldIsCatchDesMoines && newIsExternal)) {
                  console.log(`🔄 Updating source_url for: ${transformedData.title}`);
                  console.log(`   Old: ${oldUrl}`);
                  console.log(`   New: ${newUrl}`);

                  const { error: updateError } = await supabase
                    .from(tableName)
                    .update({
                      source_url: newUrl,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', existingItem.id);

                  if (updateError) {
                    console.error(`❌ Error updating source_url:`, updateError);
                    errors.push(updateError);
                  } else {
                    updatedCount++;
                    console.log(`✅ Updated source_url for: ${transformedData.title}`);
                  }
                } else {
                  console.log(`⚠️ Duplicate found (no update needed): ${transformedData.title}`);
                }
              } else {
                console.log(`⚠️ Duplicate found: ${transformedData.title || transformedData.name}`);
              }
            } else {
              // Insert new item
              if (category === 'events') {
                transformedData.is_featured = Math.random() > 0.8;
                transformedData.created_at = new Date().toISOString();
              }

              // Persist the image the domain adapter already fetched (seatgeek /
              // catchdesmoines / eventbrite / hyveetix all return item.image_url).
              // Route it through the shared SSRF/dimension-guarded fetchAndStoreImage
              // path (same as ai-crawler) so the remote image is validated and copied
              // into Storage rather than hot-linked blindly. Only touch image_url when
              // the adapter actually provided one — adapters that return image_url:null
              // (barnstormers, milb, sports-schedule) keep the prior behavior. A
              // fetch/validation failure leaves image_url NULL, so the row still inserts.
              if (item.image_url && CONTENT_TYPE_MAP[category]) {
                // Pre-assign the row id so the stored media_asset is keyed to this record.
                const contentId = crypto.randomUUID();
                transformedData.id = contentId;
                transformedData.image_url = await fetchAndStoreImage(
                  supabase,
                  item.image_url,
                  category,
                  contentId,
                );
              }

              // For events, get the inserted ID for SEO generation
              const { data: insertedData, error: insertError } = await supabase
                .from(tableName)
                .insert([transformedData])
                .select('id');

              if (insertError) {
                console.error(`❌ Error inserting ${category} item:`, insertError);
                errors.push(insertError);
              } else {
                insertedCount++;
                console.log(`✅ Inserted new ${category}: ${transformedData.title || transformedData.name}`);

                // Generate SEO content for newly inserted events using lightweight AI (Haiku)
                if (category === 'events' && insertedData?.[0]?.id) {
                  const claudeApiKey = Deno.env.get('CLAUDE_API');
                  if (claudeApiKey) {
                    // Include known venue info for better SEO
                    const seoVenueInfo = knownVenue
                      ? `${knownVenue.name} at ${knownVenue.address || ''}, ${knownVenue.city || 'Des Moines'}, ${knownVenue.state || 'IA'}`
                      : transformedData.venue;

                    // Run SEO generation asynchronously (don't wait, don't block)
                    generateEventSEO(
                      insertedData[0].id,
                      {
                        title: transformedData.title,
                        venue: seoVenueInfo,
                        location: transformedData.location,
                        date: transformedData.event_start_local,
                        category: transformedData.category
                      },
                      supabase,
                      claudeApiKey,
                      supabaseUrl,
                      supabaseKey
                    ).catch(err => console.error(`SEO generation failed: ${err.message}`));
                  }
                }
              }
            }
          } catch (error) {
            console.error(`❌ Error processing ${category} item:`, error);
            errors.push(error);
          }
        }
      }
    }

    const result = {
      success: true,
      totalFound: allExtractedItems.length,
      futureEvents: batchInfo.totalEvents,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errors.length,
      url: url,
      // Batch processing info
      batch: {
        size: batchSize,
        processedStart: batchInfo.processedStart,
        processedEnd: batchInfo.processedEnd,
        processedCount: batchInfo.processedEnd - batchInfo.processedStart,
        remainingEvents: batchInfo.remainingEvents,
        visitWebsiteExtracted: batchInfo.visitWebsiteExtracted,
        skippedVisitWebsite: batchInfo.skippedVisitWebsite,
        // Helper for next batch call
        nextSkipEvents: batchInfo.remainingEvents > 0 ? batchInfo.processedEnd : null,
      }
    };

    console.log(`✅ Scrape completed: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Error in Firecrawl scraper:`, error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});