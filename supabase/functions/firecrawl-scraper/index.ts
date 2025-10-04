import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import {
  getAIConfig,
  buildClaudeRequest,
  getClaudeHeaders,
} from "../_shared/aiConfig.ts";

// Marker time for events without specific times (7:31:58 PM Central)
const NO_TIME_MARKER = "19:31:58";

interface ScrapRequest {
  url: string;
  category: string;
  maxPages?: number; // New optional parameter for pagination
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Performance and safety limits
const MAX_ITEMS_PER_PAGE = 8;
const MAX_TOTAL_ITEMS = 16;
const MAX_RUN_MS = 55000; // 55s to stay under edge function limit

// Enhanced time parsing for events with Central Time handling
interface ParsedDateTime {
  event_start_local: string;
  event_timezone: string;
  event_start_utc: Date;
}

// Extract the "Visit Website" URL from a CatchDesMoines event detail page
async function extractCatchDesMoinesVisitWebsiteUrl(
  eventUrl: string,
  firecrawlApiKey: string
): Promise<string | null> {
  try {
    console.log(`🔍 Extracting Visit Website URL from: ${eventUrl}`);

    // Use Firecrawl to get JavaScript-rendered content
    const firecrawlResponse = await fetch(
      "https://api.firecrawl.dev/v1/scrape",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: eventUrl,
          formats: ["html"],
          waitFor: 1500,
          timeout: 10000,
        }),
      }
    );

    if (!firecrawlResponse.ok) {
      console.error(`❌ Firecrawl error: ${firecrawlResponse.status}`);
      return null;
    }

    const firecrawlData = await firecrawlResponse.json();
    const html = firecrawlData.data?.html || "";

    if (!html || html.length < 100) {
      console.log(`⚠️ No HTML content received from Firecrawl`);
      return null;
    }

    // FOOLPROOF STRATEGY: Surgical extraction targeting ONLY the bottom-actions div
    // This is the ONLY place where the real "Visit Website" link lives

    // Step 1: Find the bottom-actions div
    const bottomActionsPattern =
      /<div[^>]*class=["'][^"']*bottom-actions[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
    const bottomMatch = html.match(bottomActionsPattern);

    if (!bottomMatch) {
      console.log(`⚠️ No bottom-actions div found on page`);
      return null;
    }

    const bottomActionsHtml = bottomMatch[1];
    console.log(
      `📦 Found bottom-actions div (${bottomActionsHtml.length} chars)`
    );

    // Step 2: Comprehensive exclusion list for false positives
    const isInvalidUrl = (url: string): boolean => {
      const excludePatterns = [
        "catchdesmoines.com",
        "mailto:",
        // Video/media embeds and players
        "vimeo.com/api",
        "vimeo.com/player",
        "player.vimeo.com",
        "youtube.com/embed",
        "youtube.com/player",
        "youtu.be/player",
        // Social media (catchdesmoines official only)
        "facebook.com/catchdesmoines",
        "fb.com/catchdesmoines",
        "twitter.com/catchdesmoines",
        "x.com/catchdesmoines",
        "instagram.com/catchdesmoines",
        "linkedin.com/company/catchdesmoines",
        // Maps and embeds
        "google.com/maps/embed",
        "maps.google.com/embed",
        // CMS and tracking
        "simpleviewcrm.com",
        "simpleviewinc.com",
        "googletagmanager.com",
        "google-analytics.com",
        // File types that aren't websites
        "/api/",
        "/player.js",
        "/embed.js",
        ".js?",
        ".js#",
        ".js$",
        ".css",
        ".json",
      ];

      const lowerUrl = url.toLowerCase();
      return excludePatterns.some((pattern) =>
        lowerUrl.includes(pattern.toLowerCase())
      );
    };

    // Step 3: Extract ALL links from bottom-actions div with their full HTML context
    const allLinksPattern = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
    const allLinks = [...bottomActionsHtml.matchAll(allLinksPattern)];

    console.log(`🔗 Found ${allLinks.length} total links in bottom-actions`);

    // Step 4: PRIORITY PASS - Look for exact "Visit Website" link with action-item class
    for (const linkMatch of allLinks) {
      const attributes = linkMatch[1];
      const linkText = linkMatch[2];

      // Check for action-item class
      const hasActionItem = /class=["'][^"']*action-item[^"']*["']/i.test(
        attributes
      );

      // Check for EXACT "Visit Website" text (not just "visit" or "website")
      const hasExactVisitWebsite = /Visit\s+Website/i.test(linkText);

      if (hasActionItem && hasExactVisitWebsite) {
        // Extract href
        const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);

        if (hrefMatch && hrefMatch[1]) {
          const url = hrefMatch[1].trim();

          if (url.startsWith("http") && !isInvalidUrl(url)) {
            console.log(`✅ FOUND PRIORITY: Visit Website link = ${url}`);
            return url;
          } else if (isInvalidUrl(url)) {
            console.log(
              `⏭️ Skipped excluded URL in Visit Website link: ${url}`
            );
          }
        }
      }
    }

    // Step 5: FALLBACK PASS - Look for any valid external link in bottom-actions
    console.log(`⚠️ No "Visit Website" link found, trying fallback...`);

    for (const linkMatch of allLinks) {
      const attributes = linkMatch[1];
      const hrefMatch = attributes.match(/href=["']([^"']+)["']/i);

      if (hrefMatch && hrefMatch[1]) {
        const url = hrefMatch[1].trim();

        if (url.startsWith("http") && !isInvalidUrl(url)) {
          console.log(`✅ FALLBACK: Found external link = ${url}`);
          return url;
        }
      }
    }

    console.log(`❌ No valid external URL found in bottom-actions div`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting URL:`, error);
    return null;
  }
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
      const month = (fallbackDate.getMonth() + 1).toString().padStart(2, "0");
      const day = fallbackDate.getDate().toString().padStart(2, "0");
      const hours = fallbackDate.getHours().toString().padStart(2, "0");
      const minutes = fallbackDate.getMinutes().toString().padStart(2, "0");
      const seconds = fallbackDate.getSeconds().toString().padStart(2, "0");
      centralTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // Convert Central Time to UTC
    const localDate = parseISO(centralTimeString);
    const utcDate = fromZonedTime(localDate, eventTimeZone);

    console.log(
      `🕐 Parsed: ${dateStr} -> Central: ${centralTimeString} -> UTC: ${utcDate.toISOString()}`
    );

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

    const { url, category, maxPages = 1 }: ScrapRequest = await req.json();

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `🚀 Starting Firecrawl scrape of ${url} for ${category} (max ${maxPages} pages)`
    );
    const startTime = Date.now();

    // Generate URLs for pagination if it's a Catch Des Moines events page
    const urlsToScrape = [];
    const urlObj = new URL(url);

    if (
      urlObj.hostname.includes("catchdesmoines.com") &&
      urlObj.pathname.includes("/events")
    ) {
      // Generate paginated URLs for Catch Des Moines
      for (let page = 0; page < maxPages; page++) {
        const pageUrl = new URL(url);
        if (page > 0) {
          pageUrl.searchParams.set("skip", (page * 12).toString());
          pageUrl.searchParams.set("bounds", "false");
          pageUrl.searchParams.set("view", "grid");
          pageUrl.searchParams.set("sort", "date");
        }
        urlsToScrape.push(pageUrl.toString());
      }
    } else {
      // For other sites, just scrape the single URL
      urlsToScrape.push(url);
    }

    console.log(
      `📄 Will scrape ${urlsToScrape.length} pages: ${urlsToScrape.join(", ")}`
    );

    let allExtractedItems = [];
    let totalContentLength = 0;

    // Process each URL for pagination support
    for (const currentUrl of urlsToScrape) {
      if (Date.now() - startTime > MAX_RUN_MS) {
        console.warn(
          "⏱️ Time budget exceeded before scraping next page; stopping pagination."
        );
        break;
      }
      console.log(`🌐 Scraping page: ${currentUrl}`);

      // Use Firecrawl to get JavaScript-rendered content
      const firecrawlResponse = await fetch(
        "https://api.firecrawl.dev/v1/scrape",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: currentUrl,
            formats: ["markdown", "html"],
            waitFor: 2000, // Faster to reduce overall runtime
            timeout: 12000, // Lower timeout to avoid long hangs
          }),
        }
      );

      if (!firecrawlResponse.ok) {
        const errorText = await firecrawlResponse.text();
        console.error(
          `❌ Firecrawl API error for ${currentUrl}: ${firecrawlResponse.status} - ${errorText}`
        );
        continue; // Skip this page and continue with others
      }

      const firecrawlData = await firecrawlResponse.json();
      const content =
        firecrawlData.data?.markdown || firecrawlData.data?.html || "";

      console.log(
        `📄 Firecrawl returned ${content.length} characters from ${currentUrl}`
      );
      totalContentLength += content.length;

      if (!content || content.length < 100) {
        console.error(`❌ No usable content returned from ${currentUrl}`);
        continue; // Skip this page
      }

      // Extract events using Claude AI for this page
      const claudeApiKey = Deno.env.get("CLAUDE_API");

      if (!claudeApiKey) {
        console.error(`❌ Claude API key not found`);
        break; // Exit loop if no API key
      }

      // Generate category-specific prompts
      const prompts = {
        events: `You are an expert at extracting event information from websites, especially from CatchDesMoines.com and other Des Moines area event sites. Your task is to find EVERY SINGLE EVENT mentioned in this content from ${currentUrl}.

CURRENT DATE: July 30, 2025
WEBSITE CONTENT:
${content.substring(0, 12000)}

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

🎯 PRIORITY URL EXTRACTION:
For CatchDesMoines event list pages, you need to extract BOTH:
1. **Event detail page URL** - The individual event page on catchdesmoines.com (e.g., /event/concert-name/12345/)
2. **Visit Website URL** (if visible in the list) - External venue/event website links

Look for these patterns:
- Event detail URLs: href="/event/event-name/NUMBER/" or href="https://www.catchdesmoines.com/event/..."
- Visit Website links: <a href="https://external-venue.com" class="action-item">Visit Website</a>
- External URLs that are NOT catchdesmoines.com URLs
- Venue-specific website links (paintingwithatwist.com, etc.)

**IMPORTANT**: If you only see the event detail URL but not the "Visit Website" URL, still include the detail_url field - we'll fetch it separately.

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
- source_url: Venue-specific URL if available, otherwise page URL

CRITICAL SUCCESS FACTORS:
✅ Extract events even with incomplete info
✅ Use logical defaults for missing details
✅ Convert all date formats consistently to Central Time
✅ Include recurring events as separate entries
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
    "source_url": "https://specific-venue-website.com",
    "detail_url": "/event/event-name/12345/" // IMPORTANT: Include individual event detail URL if found
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY event mentioned in the content. Return empty array [] ONLY if literally no events are found anywhere in the content.`,

        restaurants: `You are an expert at extracting restaurant information from websites like Eater.com, Des Moines Register, and restaurant listing sites. Your task is to find EVERY SINGLE RESTAURANT mentioned in this content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 12000)}

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
${content.substring(0, 12000)}

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
${content.substring(0, 12000)}

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
${content.substring(0, 12000)}

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
${content.substring(0, 12000)}

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

Return empty array [] if no competitive content found.`,
      };

      const selectedPrompt =
        prompts[category as keyof typeof prompts] || prompts.events;

      console.log(
        `🤖 Sending ${content.length} characters to Claude AI for ${currentUrl}`
      );

      const config = await getAIConfig(supabaseUrl, supabaseKey);
      const headers = await getClaudeHeaders(
        claudeApiKey,
        supabaseUrl,
        supabaseKey
      );
      const requestBody = await buildClaudeRequest(
        [{ role: "user", content: selectedPrompt }],
        {
          supabaseUrl,
          supabaseKey,
          useLargeTokens: true,
          customTemperature: 0.1,
        }
      );

      const claudeResponse = await fetch(config.api_endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error(
          `❌ Claude API error for ${currentUrl}: ${claudeResponse.status} - ${errorText}`
        );
        continue; // Skip this page
      }

      const claudeData = await claudeResponse.json();
      const responseText = claudeData.content?.[0]?.text?.trim();

      console.log(
        `🔍 Claude response length for ${currentUrl}: ${
          responseText?.length || 0
        }`
      );

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
          jsonMatch =
            responseText.match(/```json\s*(\[[\s\S]*?\])\s*```/) ||
            responseText.match(/```\s*(\[[\s\S]*?\])\s*```/);
          if (jsonMatch) jsonMatch[0] = jsonMatch[1];
        }

        if (!jsonMatch) {
          console.error(
            `❌ No JSON array found in Claude response for ${currentUrl}`
          );
          continue; // Skip this page
        }

        pageItems = JSON.parse(jsonMatch[0]);

        if (!Array.isArray(pageItems)) {
          console.error(
            `❌ Parsed data is not an array for ${currentUrl}: ${typeof pageItems}`
          );
          pageItems = [];
        }

        console.log(
          `🤖 AI extracted ${pageItems.length} ${category} items from ${currentUrl}`
        );
        allExtractedItems.push(...pageItems);
      } catch (parseError) {
        console.error(
          `❌ Could not parse AI response JSON for ${currentUrl}:`,
          parseError
        );
        continue; // Skip this page
      }
    }

    console.log(
      `🎯 Total ${category} extracted from all pages: ${allExtractedItems.length}`
    );

    // For events category, filter out past events
    let filteredItems = allExtractedItems;
    if (category === "events") {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      filteredItems = allExtractedItems.filter((item) => {
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

    console.log(
      `🕒 After filtering: ${filteredItems.length} items (removed ${
        allExtractedItems.length - filteredItems.length
      } items)`
    );

    // Cap total items to avoid timeouts
    if (filteredItems.length > MAX_TOTAL_ITEMS) {
      console.log(
        `⚠️ Limiting items to ${MAX_TOTAL_ITEMS} to meet time budget (from ${filteredItems.length})`
      );
      filteredItems = filteredItems.slice(0, MAX_TOTAL_ITEMS);
    }

    // For CatchDesMoines events, try to extract "Visit Website" URLs from detail pages
    if (category === "events" && url.includes("catchdesmoines.com")) {
      console.log(
        `🔗 Processing ${filteredItems.length} events to extract Visit Website URLs (with rate limiting)...`
      );

      const processCount = Math.min(MAX_ITEMS_PER_PAGE, filteredItems.length);
      const itemsToProcess = filteredItems.slice(0, processCount);
      const remainingItems = filteredItems.slice(processCount);

      // Process events sequentially with rate limiting to avoid 429 errors
      const updatedItems = [];
      for (let i = 0; i < itemsToProcess.length; i++) {
        if (Date.now() - startTime > MAX_RUN_MS) {
          console.warn(
            "⏱️ Time budget exceeded while extracting Visit Website URLs; stopping early."
          );
          break;
        }
        const item = itemsToProcess[i];
        let finalSourceUrl = item.source_url || url;

        // Check if we have a detail_url to fetch
        let eventDetailUrl = null;
        if (item.detail_url) {
          // Make it absolute if it's relative
          if (item.detail_url.startsWith("/")) {
            eventDetailUrl = `https://www.catchdesmoines.com${item.detail_url}`;
          } else if (item.detail_url.includes("catchdesmoines.com")) {
            eventDetailUrl = item.detail_url;
          }
        }

        // If we have an event detail URL, extract the "Visit Website" link
        if (eventDetailUrl) {
          try {
            const visitWebsiteUrl = await extractCatchDesMoinesVisitWebsiteUrl(
              eventDetailUrl,
              firecrawlApiKey
            );
            if (visitWebsiteUrl) {
              finalSourceUrl = visitWebsiteUrl;
              console.log(
                `✅ [${i + 1}/${
                  itemsToProcess.length
                }] Extracted Visit Website URL for "${
                  item.title
                }": ${visitWebsiteUrl}`
              );
            } else {
              // Fallback to event detail URL if no Visit Website link found
              finalSourceUrl = eventDetailUrl;
              console.log(
                `⚠️ [${i + 1}/${
                  itemsToProcess.length
                }] No Visit Website found for "${
                  item.title
                }", using detail URL: ${eventDetailUrl}`
              );
            }
          } catch (error) {
            console.error(
              `❌ [${i + 1}/${
                itemsToProcess.length
              }] Error extracting Visit Website URL for "${item.title}":`,
              error
            );
          }

          // Rate limiting: Wait 500ms between requests to avoid 429 errors
          if (i < itemsToProcess.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        updatedItems.push({
          ...item,
          source_url: finalSourceUrl,
        });
      }

      // Keep unprocessed items without changing their source_url
      filteredItems = [...updatedItems, ...remainingItems];

      console.log(
        `✅ Completed URL extraction for ${filteredItems.length} events`
      );
    }

    // Get appropriate table name and process items
    const tableMapping = {
      events: "events",
      restaurants: "restaurants",
      playgrounds: "playgrounds",
      restaurant_openings: "restaurant_openings",
      attractions: "attractions",
      competitor_analysis: "competitor_content",
    };

    const tableName =
      tableMapping[category as keyof typeof tableMapping] || "events";
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];

    if (filteredItems.length > 0) {
      console.log(
        `💾 Starting database insertion for ${filteredItems.length} items...`
      );
      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < filteredItems.length; i += batchSize) {
        if (Date.now() - startTime > MAX_RUN_MS) {
          console.warn(
            "⏱️ Time budget exceeded during DB insertion; stopping early."
          );
          break;
        }
        const batch = filteredItems.slice(i, i + batchSize);
        console.log(
          `📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            filteredItems.length / batchSize
          )} (items ${i + 1}-${Math.min(i + batchSize, filteredItems.length)})`
        );

        for (const item of batch) {
          if (Date.now() - startTime > MAX_RUN_MS) {
            console.warn("⏱️ Time budget exceeded within batch; exiting.");
            break;
          }
          try {
            // Transform data based on category
            let transformedData: any = {};

            switch (category) {
              case "events":
                const parsedEventDateTime = item.date
                  ? parseEventDateTime(item.date)
                  : null;

                // Skip events where we can't parse the date properly
                if (!parsedEventDateTime?.event_start_utc) {
                  console.warn(
                    `⚠️ Skipping event with unparseable date: ${item.title} - ${item.date}`
                  );
                  continue; // Skip this item
                }

                transformedData = {
                  title: item.title?.substring(0, 200) || "Untitled Event",
                  original_description:
                    item.description?.substring(0, 500) || "",
                  enhanced_description:
                    item.description?.substring(0, 500) || "",
                  date: parsedEventDateTime.event_start_utc.toISOString(),
                  event_start_local: parsedEventDateTime.event_start_local,
                  event_timezone: parsedEventDateTime.event_timezone,
                  event_start_utc: parsedEventDateTime.event_start_utc,
                  location:
                    item.location?.substring(0, 100) || "Des Moines, IA",
                  venue:
                    item.venue?.substring(0, 100) ||
                    item.location?.substring(0, 100) ||
                    "TBD",
                  category: item.category?.substring(0, 50) || "General",
                  price: item.price?.substring(0, 50) || "See website",
                  source_url: item.source_url || url,
                  is_enhanced: false,
                  updated_at: new Date().toISOString(),
                };
                break;

              case "restaurants":
                transformedData = {
                  name: item.name?.substring(0, 200) || "Unnamed Restaurant",
                  cuisine: item.cuisine?.substring(0, 100) || "American",
                  location:
                    item.location?.substring(0, 200) || "Des Moines, IA",
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

              case "playgrounds":
                transformedData = {
                  name: item.name?.substring(0, 200) || "Playground",
                  location:
                    item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  age_range: item.age_range?.substring(0, 50) || "All ages",
                  amenities: Array.isArray(item.amenities)
                    ? item.amenities.slice(0, 10)
                    : [],
                  rating: item.rating || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;

              case "attractions":
                transformedData = {
                  name: item.name?.substring(0, 200) || "Attraction",
                  type: item.type?.substring(0, 100) || "General",
                  location:
                    item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  rating: item.rating || null,
                  website: item.website?.substring(0, 200) || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;

              case "competitor_analysis":
                // Find the competitor_id based on the URL
                const { data: competitors } = await supabase
                  .from("competitors")
                  .select("id")
                  .eq("website_url", url)
                  .single();

                transformedData = {
                  competitor_id: competitors?.id || null,
                  title: item.title?.substring(0, 200) || "Untitled Content",
                  description: item.description?.substring(0, 1000) || "",
                  url: item.url?.substring(0, 500) || url,
                  content_type:
                    item.content_type?.substring(0, 100) || "General",
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
            if (category === "events") {
              const { data, error } = await supabase
                .from(tableName)
                .select("*")
                .eq("title", transformedData.title)
                .eq("venue", transformedData.venue);
              existingItems = data || [];
            } else if (category === "competitor_analysis") {
              const { data, error } = await supabase
                .from(tableName)
                .select("*")
                .eq("title", transformedData.title)
                .eq("competitor_id", transformedData.competitor_id);
              existingItems = data || [];
            } else {
              const { data, error } = await supabase
                .from(tableName)
                .select("*")
                .eq("name", transformedData.name);
              existingItems = data || [];
            }

            if (existingItems.length > 0) {
              console.log(
                `⚠️ Duplicate found: ${
                  transformedData.title || transformedData.name
                }`
              );
              // Could implement update logic here if needed
            } else {
              // Insert new item
              if (category === "events") {
                transformedData.is_featured = Math.random() > 0.8;
                transformedData.created_at = new Date().toISOString();
              }

              const { error: insertError } = await supabase
                .from(tableName)
                .insert([transformedData]);

              if (insertError) {
                console.error(
                  `❌ Error inserting ${category} item:`,
                  insertError
                );
                errors.push(insertError);
              } else {
                insertedCount++;
                console.log(
                  `✅ Inserted new ${category}: ${
                    transformedData.title || transformedData.name
                  }`
                );
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
      url: url,
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
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
