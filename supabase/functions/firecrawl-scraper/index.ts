import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import { scrapeUrl, scrapeUrls } from "../_shared/scraper.ts";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

// Marker time for events without specific times (7:31:58 PM Central)
const NO_TIME_MARKER = "19:31:58";

// Domains to exclude from Visit Website URLs
const EXCLUDED_DOMAINS = [
  "catchdesmoines.com",
  "simpleview",
  "facebook.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "vimeo.com",
  "google.com",
  "googleapis.com",
  "cloudflare",
  "doubleclick",
  "mailto:",
  "tel:",
  "#",
];

/**
 * Check if a URL is a valid CatchDesMoines event detail page URL
 * Valid: /event/event-name/12345/
 * Invalid: /events/ (list page), /events/?filter=... (filtered list)
 */
function isValidEventDetailUrl(url: string): boolean {
  if (!url) return false;

  // Must contain /event/ (singular) not just /events/ (plural/list)
  // Pattern: /event/slug/id/ where id is numeric
  const eventDetailPattern = /\/event\/[^\/]+\/\d+\/?$/i;

  // Also accept pattern without trailing ID: /event/slug/
  const eventSlugPattern = /\/event\/[^\/]+\/?$/i;

  return eventDetailPattern.test(url) || eventSlugPattern.test(url);
}

/**
 * Extract event detail URLs from HTML content as a fallback
 * when Claude doesn't properly extract detail_url
 *
 * Returns a Map with TWO types of keys for flexible matching:
 * 1. Normalized title (lowercase, alphanumeric only)
 * 2. URL slug (extracted from the event URL path)
 */
function extractEventDetailUrlsFromHtml(html: string): Map<string, string> {
  const eventUrls = new Map<string, string>();

  // Simple pattern: find all /event/slug/id/ URLs in the HTML
  // This is more reliable than trying to extract titles
  const urlPattern = /href=["']([^"']*\/event\/([^\/]+)\/(\d+)\/?["'])/gi;

  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    const fullUrl = match[1]?.replace(/["']$/, '').trim();
    const slug = match[2];
    const eventId = match[3];

    if (!fullUrl || !slug || !eventId) continue;
    if (!isValidEventDetailUrl(fullUrl)) continue;

    // Normalize the slug for matching (remove special chars, decode URL encoding)
    const normalizedSlug = decodeURIComponent(slug)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (normalizedSlug.length > 2) {
      // Store with slug as key (primary matching method)
      eventUrls.set(`slug:${normalizedSlug}`, fullUrl);
      // Also store the event ID for direct matching
      eventUrls.set(`id:${eventId}`, fullUrl);
      console.log(`📌 Found event URL from HTML: slug="${slug}" id=${eventId} -> ${fullUrl}`);
    }
  }

  console.log(`📊 Extracted ${eventUrls.size / 2} unique event URLs from HTML`);
  return eventUrls;
}

/**
 * Find the best matching event detail URL for a given event title
 */
function findEventDetailUrl(
  eventTitle: string,
  eventUrlsFromHtml: Map<string, string>,
  allRawHtml: string
): string | null {
  if (!eventTitle) return null;

  // Normalize the event title for matching
  const normalizedTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Method 1: Try to match by URL slug similarity
  // Event titles often match their URL slugs closely
  for (const [key, url] of eventUrlsFromHtml) {
    if (!key.startsWith('slug:')) continue;
    const slug = key.replace('slug:', '');

    // Check if slug contains most of the title words or vice versa
    const titleWords = normalizedTitle.match(/.{3,}/g) || [];
    const slugWords = slug.match(/.{3,}/g) || [];

    // Calculate overlap
    let matchingChars = 0;
    for (let i = 0; i < Math.min(normalizedTitle.length, slug.length); i++) {
      if (normalizedTitle[i] === slug[i]) matchingChars++;
    }

    // If first 10+ characters match, likely the same event
    if (matchingChars >= 10 || (matchingChars >= 5 && matchingChars >= normalizedTitle.length * 0.5)) {
      console.log(`✅ Matched by slug similarity: "${eventTitle}" -> ${url} (${matchingChars} chars match)`);
      return url;
    }

    // Check if the slug is a significant substring of the title or vice versa
    if (slug.length > 8 && normalizedTitle.includes(slug.substring(0, 8))) {
      console.log(`✅ Matched by slug substring: "${eventTitle}" -> ${url}`);
      return url;
    }
    if (normalizedTitle.length > 8 && slug.includes(normalizedTitle.substring(0, 8))) {
      console.log(`✅ Matched by title substring: "${eventTitle}" -> ${url}`);
      return url;
    }
  }

  // Method 2: Search for the event title directly in the HTML and find nearby URLs
  // Create a regex that searches for the title near an event URL
  const escapedTitle = eventTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nearbyPattern = new RegExp(
    `href=["']([^"']*\\/event\\/[^"']+)["'][^>]*>[^<]*${escapedTitle.substring(0, 20)}`,
    'i'
  );
  const nearbyMatch = allRawHtml.match(nearbyPattern);
  if (nearbyMatch && isValidEventDetailUrl(nearbyMatch[1])) {
    console.log(`✅ Found URL near title in HTML: "${eventTitle}" -> ${nearbyMatch[1]}`);
    return nearbyMatch[1];
  }

  console.log(`⚠️ No matching URL found for: "${eventTitle}"`);
  return null;
}

/**
 * Extract the "Visit Website" URL from a CatchDesMoines event detail page
 * This is the ACTUAL external URL where users can find more info about the event
 */
async function extractVisitWebsiteUrl(eventDetailUrl: string): Promise<string | null> {
  try {
    console.log(`🔗 Fetching event detail page: ${eventDetailUrl}`);

    const result = await scrapeUrl(eventDetailUrl, {
      waitTime: 3000,
      timeout: 15000,
    });

    if (!result.success || !result.html) {
      console.log(`❌ Failed to fetch event detail: ${result.error}`);
      return null;
    }

    const html = result.html;
    console.log(`✅ Fetched ${html.length} chars from event detail page`);

    // Check if URL is excluded
    const isExcluded = (url: string) =>
      EXCLUDED_DOMAINS.some(d => url.toLowerCase().includes(d.toLowerCase()));

    // Multiple regex patterns to find the Visit Website link
    // Pattern matches: <a href="URL" ... class="action-item" ...>...<i>...</i>Visit Website...</a>
    const patterns = [
      // Pattern 1: action-item class with Visit Website text (handles icon and whitespace)
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*action-item[^"']*["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,
      // Pattern 2: Reverse order (class before href)
      /<a[^>]*class=["'][^"']*action-item[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,
      // Pattern 3: Any link with Visit Website text
      /<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,
      // Pattern 4: Target blank with external link
      /<a[^>]*href=["']([^"']+)["'][^>]*target=["']_blank["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,
    ];

    for (const pattern of patterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let url = match[1]?.trim();
        if (!url) continue;

        // Normalize URL
        if (url.startsWith("//")) {
          url = `https:${url}`;
        } else if (url.startsWith("/")) {
          url = `https://www.catchdesmoines.com${url}`;
        }

        // Must be http/https
        if (!url.startsWith("http")) continue;

        // Skip excluded domains
        if (isExcluded(url)) {
          console.log(`⏭️ Skipping excluded URL: ${url}`);
          continue;
        }

        console.log(`✅ Found Visit Website URL: ${url}`);
        return url;
      }
    }

    // Fallback: Check for linkUrl in embedded JSON
    const linkUrlMatch = html.match(/["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    if (linkUrlMatch) {
      const url = linkUrlMatch[1].trim();
      if (!isExcluded(url)) {
        console.log(`✅ Found linkUrl in JSON: ${url}`);
        return url;
      }
    }

    console.log(`⚠️ No Visit Website URL found for: ${eventDetailUrl}`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting Visit Website URL: ${error.message}`);
    return null;
  }
}

interface ScrapRequest {
  url: string;
  category: string;
  maxPages?: number; // Optional parameter for pagination
  scraperBackend?: 'browserless' | 'puppeteer' | 'playwright' | 'firecrawl' | 'fetch'; // Allow backend override
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, category, maxPages = 3, scraperBackend }: ScrapRequest = await req.json();

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🚀 Starting scrape of ${url} for ${category} (max ${maxPages} pages) using ${scraperBackend || 'default backend'}`);

    // Generate URLs for pagination if it's a Catch Des Moines events page
    const urlsToScrape = [];
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes('catchdesmoines.com') && urlObj.pathname.includes('/events')) {
      // Generate paginated URLs for Catch Des Moines
      for (let page = 0; page < maxPages; page++) {
        const pageUrl = new URL(url);
        if (page > 0) {
          pageUrl.searchParams.set('skip', (page * 12).toString());
          pageUrl.searchParams.set('bounds', 'false');
          pageUrl.searchParams.set('view', 'grid');
          pageUrl.searchParams.set('sort', 'date');
        }
        urlsToScrape.push(pageUrl.toString());
      }
    } else {
      // For other sites, just scrape the single URL
      urlsToScrape.push(url);
    }

    console.log(`📄 Will scrape ${urlsToScrape.length} pages`);

    let allExtractedItems = [];
    let totalContentLength = 0;

    // Scrape URLs using universal scraper (supports Puppeteer/Playwright/Firecrawl)
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
      const prompts = {
        events: `You are an expert at extracting event information from websites, especially from CatchDesMoines.com and other Des Moines area event sites. Your task is to find EVERY SINGLE EVENT mentioned in this content from ${currentUrl}.

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
- Common Des Moines venues: Wells Fargo Arena, Civic Center, etc.
- County fairgrounds, high schools, parks
- If unclear → use "Des Moines, IA" as location

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

    // CRITICAL: For CatchDesMoines events, fetch each event's detail page to get the REAL source URL
    // The "Visit Website" URL is the external link to the actual event organizer's site
    if (category === 'events' && url.includes('catchdesmoines.com') && filteredItems.length > 0) {
      console.log(`🔗 Fetching Visit Website URLs for ${filteredItems.length} CatchDesMoines events...`);

      // Build a map of event URLs extracted directly from the HTML content
      // This is more reliable than Claude's extraction
      let eventUrlsFromHtml = new Map<string, string>();

      // Combine all raw HTML from scrape results for fallback URL extraction
      const allRawHtml = scrapeResults
        .filter(r => r.success && r.html)
        .map(r => r.html)
        .join('\n');

      if (allRawHtml.length > 0) {
        console.log(`📄 Extracting event URLs from ${allRawHtml.length} chars of raw HTML...`);
        eventUrlsFromHtml = extractEventDetailUrlsFromHtml(allRawHtml);
        console.log(`📌 Found ${eventUrlsFromHtml.size} event detail URLs from HTML`);
      }

      for (let i = 0; i < filteredItems.length; i++) {
        const item = filteredItems[i];
        const eventTitle = item.title || '';

        // Try to build the event detail URL from multiple sources
        let eventDetailUrl: string | null = null;

        // Source 1: Check if Claude extracted a valid detail_url
        if (item.detail_url) {
          let candidateUrl = item.detail_url;
          if (candidateUrl.startsWith('/')) {
            candidateUrl = `https://www.catchdesmoines.com${candidateUrl}`;
          }
          if (isValidEventDetailUrl(candidateUrl)) {
            eventDetailUrl = candidateUrl;
            console.log(`✅ Claude provided valid detail_url: ${eventDetailUrl}`);
          } else {
            console.log(`⚠️ Claude's detail_url is invalid (list page?): ${item.detail_url}`);
          }
        }

        // Source 2: Fallback - use smart matching to find URL from HTML
        if (!eventDetailUrl && eventTitle) {
          const foundUrl = findEventDetailUrl(eventTitle, eventUrlsFromHtml, allRawHtml);
          if (foundUrl) {
            eventDetailUrl = foundUrl.startsWith('http') ? foundUrl : `https://www.catchdesmoines.com${foundUrl}`;
          }
        }

        // Now fetch the Visit Website URL from the event detail page
        if (eventDetailUrl && isValidEventDetailUrl(eventDetailUrl)) {
          console.log(`📄 [${i + 1}/${filteredItems.length}] Fetching Visit Website for: ${eventTitle}`);

          // Fetch the Visit Website URL from the event detail page
          const visitWebsiteUrl = await extractVisitWebsiteUrl(eventDetailUrl);

          if (visitWebsiteUrl) {
            // Use the Visit Website URL as the source_url (the REAL event URL)
            filteredItems[i].source_url = visitWebsiteUrl;
            console.log(`✅ Set source_url to external site: ${visitWebsiteUrl}`);
          } else {
            // Fallback to the event detail page URL (still better than the list page)
            filteredItems[i].source_url = eventDetailUrl;
            console.log(`⚠️ No Visit Website found, using detail page: ${eventDetailUrl}`);
          }

          // Rate limit: wait between requests to avoid overwhelming the server
          if (i < filteredItems.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          console.log(`⚠️ [${i + 1}/${filteredItems.length}] Could not find valid detail URL for: ${eventTitle}`);
          // Keep whatever source_url Claude may have extracted, or it will default to the list page URL
        }
      }

      console.log(`✅ Finished fetching Visit Website URLs`);
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
            
            switch (category) {
              case 'events':
                const parsedEventDateTime = item.date ? parseEventDateTime(item.date) : null;
                
                // Skip events where we can't parse the date properly
                if (!parsedEventDateTime?.event_start_utc) {
                  console.warn(`⚠️ Skipping event with unparseable date: ${item.title} - ${item.date}`);
                  continue; // Skip this item
                }
                
                transformedData = {
                  title: item.title?.substring(0, 200) || "Untitled Event",
                  original_description: item.description?.substring(0, 500) || "",
                  enhanced_description: item.description?.substring(0, 500) || "",
                  date: parsedEventDateTime.event_start_utc.toISOString(),
                  event_start_local: parsedEventDateTime.event_start_local,
                  event_timezone: parsedEventDateTime.event_timezone,
                  event_start_utc: parsedEventDateTime.event_start_utc,
                  location: item.location?.substring(0, 100) || "Des Moines, IA",
                  venue: item.venue?.substring(0, 100) || item.location?.substring(0, 100) || "TBD",
                  category: item.category?.substring(0, 50) || "General",
                  price: item.price?.substring(0, 50) || "See website",
                  source_url: item.source_url || url,
                  is_enhanced: false,
                  updated_at: new Date().toISOString(),
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
              console.log(`⚠️ Duplicate found: ${transformedData.title || transformedData.name}`);
              // Could implement update logic here if needed
            } else {
              // Insert new item
              if (category === 'events') {
                transformedData.is_featured = Math.random() > 0.8;
                transformedData.created_at = new Date().toISOString();
              }

              const { error: insertError } = await supabase
                .from(tableName)
                .insert([transformedData]);

              if (insertError) {
                console.error(`❌ Error inserting ${category} item:`, insertError);
                errors.push(insertError);
              } else {
                insertedCount++;
                console.log(`✅ Inserted new ${category}: ${transformedData.title || transformedData.name}`);
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
      futureEvents: filteredItems.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errors.length,
      url: url
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