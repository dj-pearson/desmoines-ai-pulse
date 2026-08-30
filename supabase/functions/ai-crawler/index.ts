/**
 * SECURITY: verify_jwt = false
 * Reason: Admin data processing function invoked by internal tools, not by end-user browser sessions
 * Alternative measures: Service role key required for database writes, Claude API key validated before AI processing
 * Risk level: HIGH
 */
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// Central Time conversion lives in _shared/centralTime.ts (Intl-based) rather
// than date-fns-tz. The previous import pulled `fromZonedTime` from
// date-fns-tz@2, which does not export it (that name arrived in v3) — so it was
// silently `undefined`, which is why this file hand-rolled a DST guess instead.
import { format as dateFnsFormat } from "https://esm.sh/date-fns@2.30.0";
import {
  CENTRAL_TZ,
  centralOffsetString,
} from "../_shared/centralTime.ts";
import { resolveListingUrls } from "../_shared/eventSourceProfiles.ts";
import {
  DEFAULT_CONTENT_BUDGET,
  prepareContentForExtraction,
  SPORTS_CONTENT_BUDGET,
} from "../_shared/htmlContentWindow.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey } from "../_shared/aiConfig.ts";
import { scrapeUrl, scrapeUrls } from "../_shared/scraper.ts";
import { fetchAndStoreImage as _fetchAndStoreImageShared } from "../_shared/imageStorage.ts";
import { resolveEventImage } from "../_shared/venueImage.ts";
import { tryDomainAdapter } from "../_shared/domain-adapters/index.ts";
import { extractEventsFromJsonLd } from "../_shared/jsonLdEvents.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { isHostAllowed } from "../_shared/fetchGuard.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { recordAnthropicUsage } from "../_shared/providerUsage.ts";
import { sanitizeLikeInput } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface CrawlRequest {
  url: string;
  category:
    | "events"
    | "restaurants"
    | "playgrounds"
    | "restaurant_openings"
    | "attractions";
}

interface EventData {
  title: string;
  description: string;
  location: string;
  venue: string;
  category: string;
  price: string;
}

interface RestaurantData {
  name: string;
  cuisine: string;
  location: string;
  rating?: number;
  price_range: string;
  description: string;
  phone?: string;
  website?: string;
}

interface RestaurantOpeningData {
  name: string;
  description: string;
  location: string;
  cuisine: string;
  opening_date: string;
  status: "opening_soon" | "newly_opened" | "announced";
}

interface PlaygroundData {
  name: string;
  location: string;
  description: string;
  age_range: string;
  amenities: string[];
  rating?: number;
}

interface AttractionData {
  name: string;
  type: string;
  location: string;
  description: string;
  rating?: number;
  website?: string;
}

// Sports schedule domains - use domain-specific URL strategy (never add CatchDesMoines)
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

// Domain-specific URLs for sports schedules - ONLY use the team's own domain,
// never CatchDesMoines. resolveListingUrls() is host-scoped to the matched
// profile, so it can only ever return URLs on the team's own site — and it
// recovers the cases the raw seeded URL gets wrong, notably the Iowa Wolves
// "?month=3" pin that limited the crawl to a single month of the season.
function getSportsScheduleUrls(originalUrl: string): string[] {
  return resolveListingUrls(originalUrl);
}

// Preprocess URL to try to find better event-specific pages
function findBestEventUrl(originalUrl: string): string[] {
  const baseUrl = originalUrl.replace(/\/$/, ""); // Remove trailing slash

  // List of potential event page paths to try
  const eventPaths = [
    originalUrl, // Original URL first
    `${baseUrl}/events`,
    `${baseUrl}/calendar`,
    `${baseUrl}/shows`,
    `${baseUrl}/concerts`,
    `${baseUrl}/schedule`,
    `${baseUrl}/upcoming`,
    `${baseUrl}/events/upcoming`,
    `${baseUrl}/shows/upcoming`,
  ];

  // Remove duplicates and return unique URLs
  return [...new Set(eventPaths)];
}

// Try to find API endpoints or JSON data in the page
async function findApiEndpoints(
  html: string,
  baseUrl: string
): Promise<string[]> {
  const apiEndpoints = [];

  // Look for common API patterns in script tags
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const script of scriptMatches) {
    // Look for API endpoints in script content
    const apiPatterns = [
      /["']([^"']*\/api\/[^"']*events?[^"']*?)["']/gi,
      /["']([^"']*\/events?\.json[^"']*?)["']/gi,
      /["']([^"']*\/calendar[^"']*\.json[^"']*?)["']/gi,
      /fetch\s*\(\s*["']([^"']*events?[^"']*?)["']/gi,
      /ajax\s*\(\s*["']([^"']*events?[^"']*?)["']/gi,
    ];

    for (const pattern of apiPatterns) {
      let match;
      while ((match = pattern.exec(script)) !== null) {
        let endpoint = match[1];
        if (endpoint.startsWith("/")) {
          endpoint = new URL(endpoint, baseUrl).href;
        }
        if (endpoint.startsWith("http")) {
          apiEndpoints.push(endpoint);
        }
      }
    }
  }

  // Look for data attributes or inline JSON
  const dataMatches = [
    ...html.matchAll(/data-events=["']([^"']+)["']/gi),
    ...html.matchAll(/data-calendar=["']([^"']+)["']/gi),
    ...html.matchAll(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/gi),
    ...html.matchAll(/var\s+events\s*=\s*(\[.*?\]);/gi),
  ];

  return [...new Set(apiEndpoints)];
}

// Extract the "Visit Website" URL from a CatchDesMoines event page
async function extractCatchDesMoinesVisitWebsiteUrl(
  eventUrl: string
): Promise<string | null> {
  try {
    console.log(`🔍 Extracting Visit Website URL from: ${eventUrl}`);

    // Use universal scraper for better JavaScript rendering
    const scrapeResult = await scrapeUrl(eventUrl, {
      waitTime: 5000,
      timeout: 15000,
    });

    if (!scrapeResult.success || !scrapeResult.html) {
      console.error(`❌ Failed to scrape: ${scrapeResult.error}`);
      return null;
    }

    const html = scrapeResult.html;
    console.log(`✅ Scraped ${html.length} chars using ${scrapeResult.backend} (took ${scrapeResult.duration}ms)`);

    // Define excluded domains
    const excludeDomains = [
      "catchdesmoines.com",
      "simpleview.com",
      "simpleviewinc.com",
      "assets.simpleviewinc.com",
      "simpleviewcrm.com",
      "simpleviewcms.com",
      "extranet.simpleview",
      "vimeo.com/api",
      "vimeo.com/player",
      "player.vimeo.com",
      "youtube.com/embed",
      "youtube.com/player",
      "youtube.com/watch",
      "facebook.com",
      "twitter.com",
      "instagram.com",
      "google.com",
      "maps.google.com",
      "cloudflare.com",
      "googleapis.com",
      "gstatic.com",
      "googletagmanager.com",
      "doubleclick.net",
      "mailto:",
      "tel:",
      "#",
    ];

    const isExcluded = (url: string) =>
      excludeDomains.some((d) => url.toLowerCase().includes(d.toLowerCase()));

    // Use DOMParser from deno_dom to properly parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    if (!doc) {
      console.error("❌ Failed to parse HTML");
      return null;
    }

    console.log("✅ Successfully parsed HTML document");

    // Helper function to check if text matches "visit website"
    const isVisitWebsiteText = (text: string): boolean => {
      const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
      return (
        normalized.includes('visit website') ||
        normalized.includes('visit web site') ||
        (normalized.includes('visit') && normalized.includes('website'))
      );
    };

    // Helper function to validate and normalize URL
    const validateAndNormalizeUrl = (href: string | null, strategy: string): string | null => {
      if (!href) {
        console.log(`  [${strategy}] ⏭️ Skipped: no href attribute`);
        return null;
      }

      let normalizedUrl = href.trim();
      if (normalizedUrl.startsWith("//")) {
        normalizedUrl = `https:${normalizedUrl}`;
      } else if (normalizedUrl.startsWith("/")) {
        const baseUrl = new URL(eventUrl);
        normalizedUrl = `${baseUrl.origin}${normalizedUrl}`;
      }

      if (!normalizedUrl.match(/^https?:\/\//i)) {
        console.log(`  [${strategy}] ⏭️ Skipped: not an http(s) URL: ${normalizedUrl}`);
        return null;
      }

      if (isExcluded(normalizedUrl)) {
        console.log(`  [${strategy}] ⏭️ Skipped: excluded domain: ${normalizedUrl}`);
        return null;
      }

      return normalizedUrl;
    };

    // Strategy 1: Direct anchor text match
    const allAnchors = doc.querySelectorAll("a") as NodeListOf<HTMLAnchorElement>;
    console.log(`📊 [Strategy 1] Found ${allAnchors.length} total anchor tags on page`);

    let foundCount = 0;
    for (const anchor of allAnchors) {
      const href = anchor.getAttribute("href");
      const textContent = anchor.textContent || "";
      
      if (isVisitWebsiteText(textContent)) {
        foundCount++;
        console.log(`🔗 [Strategy 1] Found potential "Visit Website" link #${foundCount}: href="${href}", text="${textContent.trim()}"`);
        
        const normalizedUrl = validateAndNormalizeUrl(href, "Strategy 1");
        if (normalizedUrl) {
          console.log(`  ✅ [Strategy 1] Found valid URL: ${normalizedUrl}`);
          return normalizedUrl;
        }
      }
    }

    console.log(`[Strategy 1] Checked ${foundCount} matches out of ${allAnchors.length} anchors`);

    // Strategy 2: Check buttons
    console.log(`📊 [Strategy 2] Searching for buttons with "visit website" text...`);
    const allButtons = doc.querySelectorAll("button, .button, .btn");
    console.log(`Found ${allButtons.length} button elements`);
    
    for (const button of allButtons) {
      const buttonText = button.textContent || "";
      if (isVisitWebsiteText(buttonText)) {
        console.log(`🔘 [Strategy 2] Found button: "${buttonText.trim()}"`);
        
        const innerAnchor = button.querySelector("a");
        if (innerAnchor) {
          const href = innerAnchor.getAttribute("href");
          const normalizedUrl = validateAndNormalizeUrl(href, "Strategy 2");
          if (normalizedUrl) {
            console.log(`  ✅ [Strategy 2] Found URL in button: ${normalizedUrl}`);
            return normalizedUrl;
          }
        }
      }
    }

    // Strategy 3: Look for common class patterns
    console.log(`📊 [Strategy 3] Searching for links with common classes...`);
    const classSelectors = [
      'a[class*="visit"]',
      'a[class*="website"]',
      'a[class*="external"]',
      '.visit-website a',
      '.event-website a'
    ];
    
    for (const selector of classSelectors) {
      const links = doc.querySelectorAll(selector);
      if (links.length > 0) {
        console.log(`[Strategy 3] Found ${links.length} links matching: ${selector}`);
        for (const link of links) {
          const href = link.getAttribute("href");
          const normalizedUrl = validateAndNormalizeUrl(href, `Strategy 3`);
          if (normalizedUrl) {
            console.log(`  ✅ [Strategy 3] Found URL: ${normalizedUrl}`);
            return normalizedUrl;
          }
        }
      }
    }

    console.log(`⚠️ No valid "Visit Website" link found after trying all strategies`);
    
    // Fallback: Check for linkUrl in JSON embedded in the page
    const linkUrlMatch = html.match(
      /["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/i
    );
    if (linkUrlMatch) {
      const url = linkUrlMatch[1].trim();
      if (!isExcluded(url)) {
        console.log("✅ Found linkUrl in JSON:", url);
        return url;
      }
    }

    console.log(`⚠️ No suitable external URL found for: ${eventUrl}`);
    return null;
  } catch (error) {
    console.error(`❌ Error extracting URL from ${eventUrl}:`, error);
    return null;
  }
}

/**
 * Reduce a page to the chunk most likely to contain its event list.
 *
 * Delegates to _shared/htmlContentWindow.ts, which replaced the old
 * `cleanHtml.substring(0, maxChars)` — that kept the FIRST 15k characters, i.e.
 * <head>, the cookie banner, the nav and the hero, while the event list started
 * past them. See that module's header for the full rationale.
 */
function extractRelevantContent(html: string, url?: string): string {
  // Sports schedules list many short rows, so they get the larger budget.
  const budget = url && isSportsScheduleDomain(url)
    ? SPORTS_CONTENT_BUDGET
    : DEFAULT_CONTENT_BUDGET;
  return prepareContentForExtraction(html, { budget, label: url });
}

// Sports schedule AI prompt - for Iowa Cubs, Iowa Wild, Iowa Barnstormers, Iowa Wolves
function getSportsSchedulePrompt(url: string, relevantContent: string): string {
  const now = new Date();
  const currentDate = dateFnsFormat(now, "MMMM d, yyyy");
  const currentYear = now.getFullYear();

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
${relevantContent}

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
- image_url: null (omit unless team/venue image found)

FORMAT AS JSON ARRAY:
[
  {
    "title": "${teamName} vs Opponent Name",
    "description": "Game description",
    "date": "2026-MM-DD HH:MM:SS",
    "location": "Des Moines, IA",
    "venue": "${venue}",
    "category": "Sports",
    "price": "See website",
    "source_url": "https://...ticket-url...",
    "image_url": null
  }
]

🚨 Extract EVERY home game. Return [] ONLY if no games found. Include source_url (ticket link) for each event.`;
}

/**
 * If the page's scripts reference an event JSON endpoint, fetch it and prepend
 * the payload to the content Claude sees. Raw JSON is far easier to extract from
 * than rendered markup, so this is worth the extra request when it works.
 *
 * Only same-origin endpoints are followed, and only endpoints on an allowlisted
 * host: `findApiEndpoints` scrapes URLs out of arbitrary page JavaScript, so
 * fetching them unchecked would let a target page steer the function at any host
 * it likes — the exact SSRF the isHostAllowed gate on the entry point exists to
 * prevent.
 */
async function augmentWithApiData(
  html: string,
  url: string,
  relevantContent: string
): Promise<string> {
  const apiEndpoints = await findApiEndpoints(html, url);
  if (apiEndpoints.length === 0) return relevantContent;

  let pageHost: string;
  try {
    pageHost = new URL(url).hostname.toLowerCase();
  } catch {
    return relevantContent;
  }

  const sameOrigin = apiEndpoints.filter((endpoint) => {
    try {
      const host = new URL(endpoint).hostname.toLowerCase();
      return host === pageHost && isHostAllowed(endpoint).allowed;
    } catch {
      return false;
    }
  });

  if (sameOrigin.length === 0) return relevantContent;
  console.log(`🔍 Found candidate event API endpoint(s): ${sameOrigin.join(", ")}`);

  for (const endpoint of sameOrigin.slice(0, 3)) {
    try {
      const apiResponse = await fetchWithTimeout(endpoint, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json, text/javascript, */*",
        },
      });

      if (!apiResponse.ok) continue;
      const apiData = await apiResponse.text();
      if (apiData.length <= 100) continue;

      console.log(`✅ Got API data from ${endpoint}: ${apiData.length} chars`);
      // Cap the payload so a large feed can't crowd the HTML out of the budget.
      return (
        apiData.substring(0, 12000) +
        "\n\n--- ORIGINAL HTML ---\n\n" +
        relevantContent
      );
    } catch (error) {
      console.log(`⚠️ API endpoint failed ${endpoint}:`, error.message);
    }
  }

  return relevantContent;
}

// AI-powered content extraction using Claude
async function extractContentWithAI(
  html: string,
  category: string,
  url: string,
  claudeApiKey: string
): Promise<any[]> {
  let relevantContent = extractRelevantContent(html, url);

  // Prepend any JSON an in-page event API exposes.
  //
  // This block used to sit INSIDE the try below, after `prompts` had already
  // been built — and it assigned to a `const`. Both halves were broken: the
  // assignment threw a TypeError (ES modules are strict mode) which the outer
  // catch swallowed into an empty result, so any page whose scripts referenced
  // an /api/...events endpoint reported "no events found" no matter what was on
  // it; and even without the throw, reassigning after the prompt string was
  // interpolated could never have changed what Claude saw. Hoisting it here
  // makes the augmentation actually reach the prompt.
  if (category === "events") {
    relevantContent = await augmentWithApiData(html, url, relevantContent);
  }

  // Live current date in Central Time. Previously frozen at "July 26/30, 2025",
  // which caused Claude to stamp bare month/day dates in the past so the
  // downstream future-filter dropped them. See firecrawl-scraper for the same fix.
  const nowCentralStr = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const currentYearStr = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
  });

  const prompts = {
    events: isSportsScheduleDomain(url)
      ? getSportsSchedulePrompt(url, relevantContent)
      : `You are an expert at extracting event information from Des Moines area event websites (event calendars, venue sites, festival pages, ticketing sites, and community listings). Your task is to find EVERY SINGLE EVENT mentioned in this content from ${url}.

CURRENT DATE: ${nowCentralStr}
WEBSITE CONTENT:
${relevantContent}

CRITICAL PARSING INSTRUCTIONS:

🎯 WHAT TO LOOK FOR:
- ANY text that mentions specific event names or titles
- Venue names that host events (fairgrounds, theaters, arenas, etc.)
- Date patterns (July 26, Jul 26th, 7/26, 2025, etc.)
- Event categories (concerts, festivals, sports, shows, fairs, etc.)
- HTML structures: <article class="slide">, event cards, lists, grids
- **IMPORTANT**: Look for individual event detail page URLs (e.g., /event/event-name/12345/)

🔍 SPECIFIC EVENT PATTERNS:
- Look for proper nouns that sound like event names
- Geographic venues (Warren County, Indianola, Des Moines locations)
- Entertainment venues (theaters, halls, stadiums)
- Event types (fair, festival, concert, show, game, exhibition)
- Time indicators (daily, weekly, through August, etc.)
- **Event detail URLs**: Links in format like "/event/chef-georges-steak-bar-classics/53924/"

💡 EXTRACTION EXAMPLES:
- "Warren County Fair" → title: "Warren County Fair"
- "Anastasia the Musical" → title: "Anastasia the Musical" 
- "National Senior Games" → title: "National Senior Games"
- "Iowa Artists Sale-A-Bration" → title: "Iowa Artists Sale-A-Bration"
- "Live Horse Racing" → title: "Live Horse Racing"

📅 DATE CONVERSION (CRITICAL TIMEZONE HANDLING):
- All events are in Des Moines, Iowa (Central Time Zone)
- Convert ALL times to Central Time (CDT in summer -5 UTC, CST in winter -6 UTC)
- Current date reference: ${nowCentralStr}
- YEAR INFERENCE: When a date has no explicit year, choose the NEXT upcoming
  occurrence relative to the current date. If the month/day is still ahead this
  year, use ${currentYearStr}; if it has already passed this year, use the
  following year. NEVER default to a past year.

EXAMPLES (current year is ${currentYearStr}):
- "Aug 15th" → "${currentYearStr}-08-15 19:00:00" (7:00 PM Central Time default, if still upcoming)
- "7:30 PM" → "${currentYearStr}-MM-DD 19:30:00" (keep Central Time)
- "8 AM" → "${currentYearStr}-MM-DD 08:00:00" (morning events)
- "Through Aug 28" → create events until that date
- No specific time? → default to 7:00 PM Central (19:00:00)
- All-day events → use 12:00 PM Central (12:00:00)
- Past dates (before ${nowCentralStr}) → SKIP these events

⚠️ TIMEZONE CRITICAL: Store times in Central Time format (not UTC). The system will handle UTC conversion automatically.

🏢 VENUE EXTRACTION:
- Look for venue names near event titles
- Common Des Moines venues: Wells Fargo Arena, Civic Center, etc.
- County fairgrounds, high schools, parks
- If unclear → use "Des Moines, IA" as location

For EVERY event you find, extract:
- title: Exact event name from content
- description: Any details about the event
- date: YYYY-MM-DD HH:MM:SS (future dates only, in Central Time)
- location: City/state (default: "Des Moines, IA")
- venue: Specific venue name
- category: Music/Sports/Arts/Community/Entertainment/Festival
- price: If mentioned, or "See website"

🖼️ IMAGE EXTRACTION (CRITICAL):
- Look for the primary hero/featured image for each event
- Check og:image meta tags: <meta property="og:image" content="URL">
- Check the first prominent <img> tag near the event title
- Look for data attributes with image URLs (data-image, data-src, data-bg)
- Look for background-image CSS inline styles on event cards
- Use ABSOLUTE URLs only (starting with https://)
- If multiple images found, prefer the largest/highest-quality one
- Skip tiny icons, logos, ads, or tracking pixels
- Skip images from CDNs that clearly belong to the aggregator site (e.g. simpleviewinc.com)
- If no suitable image found, omit the field or use null

CRITICAL SUCCESS FACTORS:
✅ Extract events even with incomplete info
✅ Use logical defaults for missing details
✅ Convert all date formats consistently
✅ Include recurring events as separate entries
✅ Scan the ENTIRE content thoroughly

FORMAT AS JSON ARRAY:
[
  {
    "title": "Event Name",
    "description": "Event details",
    "date": "2025-MM-DD HH:MM:SS",
    "location": "Des Moines, IA",
    "venue": "Venue Name",
    "category": "Event Type",
    "price": "Price or See website",
    "image_url": "https://example.com/path/to/event-image.jpg",
    "detail_url": "/event/event-name/12345/" // IMPORTANT: Include if you find individual event detail page URLs
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY event mentioned in the content. If you see references to 10+ events, include ALL of them. Return empty array [] ONLY if literally no events are found anywhere in the content.`,

    restaurants: `You are an expert at extracting restaurant information from websites like Eater.com, Des Moines Register, and restaurant listing sites. Your task is to find EVERY SINGLE RESTAURANT mentioned in this content from ${url}.

WEBSITE CONTENT:
${relevantContent}

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

💡 EXTRACTION EXAMPLES FROM COMMON PATTERNS:
- "Fong's Pizza" → name: "Fong's Pizza", cuisine: "Pizza/Asian Fusion"
- "Centro" → name: "Centro", cuisine: "Italian"
- "Proof Restaurant" → name: "Proof Restaurant", cuisine: "American"
- "Zombie Burger" → name: "Zombie Burger", cuisine: "Burgers"
- "Alba Restaurant" → name: "Alba Restaurant", cuisine: "Contemporary"

🏢 LOCATION EXTRACTION:
- Look for Des Moines area neighborhoods (East Village, Beaverdale, etc.)
- Street addresses when mentioned
- Area descriptions ("downtown", "west side", etc.)
- Default to "Des Moines, IA" if unclear

📊 RATING & PRICE EXTRACTION:
- Look for star ratings, numeric scores, or review language
- Extract price indicators: $ (under $15), $$ ($15-30), $$$ ($30-50), $$$$ (over $50)
- Convert descriptive pricing ("affordable", "moderate", "expensive")

📝 DESCRIPTION EXTRACTION:
- Pull menu highlights, specialties, or signature dishes
- Include atmosphere descriptions ("casual", "upscale", "family-friendly")
- Note any unique features or awards mentioned

For EVERY restaurant you find, extract:
- name: Exact restaurant name from content
- cuisine: Type of cuisine (Italian, American, Mexican, Asian Fusion, etc.)
- location: Address or area description (default: "Des Moines, IA")
- rating: Numerical rating 1-5 if mentioned, or null
- price_range: $, $$, $$$, or $$$$ based on content
- description: Key details about food, atmosphere, or specialties
- phone: Phone number if mentioned
- website: Website URL if mentioned

🖼️ IMAGE EXTRACTION (IMPORTANT):
- Look for the primary photo for each restaurant
- Check og:image meta tags: <meta property="og:image" content="URL">
- Check the first prominent <img> tag near the restaurant name
- Look for data attributes with image URLs (data-image, data-src, data-bg)
- Use ABSOLUTE URLs only (starting with https://)
- Skip logos, icons, generic placeholder images, or ad images
- If no suitable image found, omit the field or use null

CRITICAL SUCCESS FACTORS:
✅ Extract restaurants even with incomplete info
✅ Use logical defaults for missing details
✅ Look for both obvious restaurant names and food establishments
✅ Include breweries, cafes, bakeries, and food trucks
✅ Scan the ENTIRE content thoroughly for any food-related businesses

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
    "website": "https://restaurant-website.com",
    "image_url": "https://example.com/path/to/restaurant-photo.jpg"
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY restaurant or food establishment mentioned in the content. If you see references to 10+ restaurants in a "best restaurants" list, include ALL of them. Return empty array [] ONLY if literally no restaurants are found anywhere in the content.`,

    restaurant_openings: `Extract information about new restaurant openings from this website content from ${url}.

WEBSITE CONTENT:
${relevantContent}

Please analyze this content and extract information about NEW restaurant openings, upcoming restaurants, or recently opened restaurants. For each opening, provide:
- name: Restaurant name
- description: Description of the restaurant concept
- location: Location where it will open/opened
- cuisine: Type of cuisine
- opening_date: Opening date (format as YYYY-MM-DD, or null if not specified)
- status: 'opening_soon', 'newly_opened', or 'announced'
- image_url: Primary photo of the restaurant or concept render (absolute https:// URL from og:image or prominent img tag, or null if not found)

Format as JSON array:
[
  {
    "name": "Restaurant Name",
    "description": "Restaurant concept description",
    "location": "Location",
    "cuisine": "Cuisine Type",
    "opening_date": "2025-MM-DD",
    "status": "opening_soon",
    "image_url": "https://example.com/path/to/photo.jpg"
  }
]

Return empty array [] if no restaurant openings found.`,

    playgrounds: `You are an expert at extracting playground and children's recreation information from websites like visitdesmoines.com, Greater DSM, and family activity sites. Your task is to find EVERY SINGLE PLAYGROUND or children's recreational facility mentioned in this content from ${url}.

WEBSITE CONTENT:
${relevantContent}

CRITICAL PARSING INSTRUCTIONS FOR PLAYGROUND SITES:

🎯 WHAT TO LOOK FOR:
- Playground names (often park names or specific playground names)
- Children's recreation areas, splash pads, adventure playgrounds
- Parks with playground equipment mentioned
- Family-friendly recreational facilities
- Youth activity centers or outdoor play areas
- Age-specific play structures or facilities

🔍 SPECIFIC PLAYGROUND PATTERNS:
- Look for proper nouns ending in "Park", "Playground", "Recreation Area"
- Equipment mentions (swings, slides, climbing structures, zip lines)
- Age-related language ("toddler", "kids", "children", "families")
- Safety features (fenced, rubberized surfaces, shade structures)
- Accessibility features (wheelchair accessible, inclusive design)
- Special features (water play, sensory elements, themed playgrounds)

💡 EXTRACTION EXAMPLES FROM COMMON PATTERNS:
- "Gray's Lake Park Playground" → name: "Gray's Lake Park Playground"
- "Walnut Woods State Park" → name: "Walnut Woods State Park Recreation Area"
- "Copper Creek Lake Beach Playground" → name: "Copper Creek Lake Beach Playground"
- "Jester Park Adventure Playground" → name: "Jester Park Adventure Playground"
- "Union Park Community Center" → name: "Union Park Community Center Playground"

🏢 LOCATION EXTRACTION:
- Look for Des Moines area locations (West Des Moines, Ankeny, etc.)
- Street addresses when mentioned (specific park addresses)
- Neighborhood or area descriptions ("north side", "downtown area")
- Cross streets or nearby landmarks for reference
- Default to "Des Moines, IA" if area unclear

🎪 AMENITIES EXTRACTION:
- Standard equipment: swings, slides, monkey bars, see-saws
- Modern features: zip lines, climbing walls, balance beams
- Special areas: toddler sections, sensory play, splash zones
- Safety features: fencing, shade structures, soft surfaces
- Accessibility: ramps, inclusive equipment, wide pathways
- Additional: picnic areas, restrooms, parking

👶 AGE RANGE EXTRACTION:
- Look for specific age mentions ("2-5 years", "school age", "toddlers")
- Convert descriptive terms: "toddler" → "2-5 years", "school age" → "5-12 years"
- Multiple age areas: "2-12 years" for mixed equipment
- Default to "All ages" if not specified

📝 DESCRIPTION EXTRACTION:
- Highlight unique or special features
- Include size references ("large", "small", "expansive")
- Note themes or special designs (pirate ship, castle, nature-themed)
- Mention nearby amenities (trails, lakes, sports facilities)
- Include accessibility or safety features

For EVERY playground you find, extract:
- name: Exact playground or park name from content
- location: Address or area description (default: "Des Moines, IA")
- description: Key features, themes, or special attributes
- age_range: Target age group (e.g., "2-12 years", "All ages")
- amenities: Array of equipment and features
- rating: Numerical rating 1-5 if mentioned, or null

🖼️ IMAGE EXTRACTION (IMPORTANT):
- Look for the primary photo for each playground
- Check og:image meta tags: <meta property="og:image" content="URL">
- Check the first prominent <img> tag near the playground name
- Use ABSOLUTE URLs only (starting with https://)
- Skip logos, icons, or generic placeholder images
- If no suitable image found, omit the field or use null

CRITICAL SUCCESS FACTORS:
✅ Extract playgrounds even with incomplete info
✅ Use logical defaults for missing details
✅ Look for both obvious playground names and recreational facilities
✅ Include splash pads, adventure courses, and nature play areas
✅ Scan the ENTIRE content thoroughly for any child-friendly recreational spaces

FORMAT AS JSON ARRAY:
[
  {
    "name": "Playground Name",
    "location": "Des Moines, IA",
    "description": "Playground features and description",
    "age_range": "2-12 years",
    "amenities": ["swings", "slides", "climbing structure", "splash pad"],
    "rating": 4.2,
    "image_url": "https://example.com/path/to/playground-photo.jpg"
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY playground or children's recreational facility mentioned in the content. If you see references to 10+ playgrounds in a "best playgrounds" list, include ALL of them. Return empty array [] ONLY if literally no playgrounds are found anywhere in the content.`,

    attractions: `Extract all attractions, tourist spots, or places of interest from this website content from ${url}.

WEBSITE CONTENT:
${relevantContent}

Please analyze this content and extract ALL attractions, tourist destinations, or points of interest. For each attraction, provide:
- name: Attraction name
- type: Type of attraction (Museum, Park, Historic Site, Entertainment, etc.)
- location: Full address or location description
- description: Description of the attraction
- rating: Numerical rating if available (1-5 scale)
- website: Website URL if available
- image_url: Primary photo of the attraction (absolute https:// URL from og:image or prominent img tag near the attraction name, or null if not found)

Format as JSON array:
[
  {
    "name": "Attraction Name",
    "type": "Attraction Type",
    "location": "Full address",
    "description": "Attraction description",
    "rating": 4.3,
    "website": "Website URL",
    "image_url": "https://example.com/path/to/attraction-photo.jpg"
  }
]

Return empty array [] if no attractions found.`,
  };

  try {
    console.log(`🤖 Using Claude AI to extract ${category} data from ${url}`);
    console.log(
      `📄 Content length being sent to AI: ${relevantContent.length} characters`
    );
    console.log(`📝 Content preview: ${relevantContent.substring(0, 500)}...`);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      const config = await getAIConfig(supabaseUrl, supabaseKey);
      const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
      const requestBody = await buildClaudeRequest(
        [{ role: "user", content: prompts[category as keyof typeof prompts] }],
        { 
          supabaseUrl, 
          supabaseKey,
          useLargeTokens: true,
          customTemperature: 0.1
        }
      );

      const claudeResponse = await fetchWithTimeout(config.api_endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      }, 60_000);

    if (claudeResponse.ok) {
      const claudeData = await claudeResponse.json();

      // AOS-MANAGE-005: a crawl calls this once per source per category, so it
      // is the largest non-agent Anthropic spender in the project and until now
      // recorded none of it. Recorded here, on the success path only - the
      // failure branch below never parses a body and has no usage to read.
      await recordAnthropicUsage(createClient(supabaseUrl, supabaseKey), {
        source: "ai-crawler",
        model: String(requestBody.model ?? config.default_model),
        usage: claudeData?.usage ?? {},
        extra: { category, url },
      });

      const responseText = claudeData.content?.[0]?.text?.trim();

      console.log(`🔍 Claude API response status: ${claudeResponse.status}`);
      console.log(
        `🔍 Claude response structure check - content exists: ${!!claudeData.content}`
      );
      console.log(
        `🔍 Claude response text length: ${responseText?.length || 0}`
      );
      console.log(
        `🔍 Claude response preview: ${
          responseText?.substring(0, 1000) || "No text"
        }...`
      );

      if (responseText) {
        try {
          // Extract JSON from the response - try multiple patterns
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
              `❌ No JSON array found in Claude response. Full response: ${responseText}`
            );
            return [];
          }

          console.log(
            `🔍 Extracted JSON string: ${jsonMatch[0].substring(0, 500)}...`
          );

          const extractedData = JSON.parse(jsonMatch[0]);

          if (!Array.isArray(extractedData)) {
            console.error(
              `❌ Parsed data is not an array: ${typeof extractedData}`
            );
            return [];
          }

          console.log(
            `🤖 AI extracted ${extractedData.length} ${category} items from ${url}`
          );

           // Add source_url to each extracted item
           const itemsWithSource = await Promise.all(
             extractedData.map(async (item) => {
               let actualSourceUrl = url;

               // Sports schedules: use AI-extracted source_url (ticket link) when present
               if (category === "events" && isSportsScheduleDomain(url)) {
                 if (item.source_url && item.source_url.startsWith("http")) {
                   actualSourceUrl = item.source_url;
                 } else if (item.ticket_url && item.ticket_url.startsWith("http")) {
                   actualSourceUrl = item.ticket_url;
                 } else {
                   const lower = url.toLowerCase();
                   if (lower.includes("milb.com/iowa")) actualSourceUrl = "https://www.milb.com/iowa/tickets";
                   else if (lower.includes("iowawild.com")) actualSourceUrl = "https://www.iowawild.com/tickets";
                   else if (lower.includes("theiowabarnstormers.com")) actualSourceUrl = "https://theiowabarnstormers.com/tickets";
                   else if (lower.includes("iowa.gleague.nba.com")) actualSourceUrl = "https://iowa.gleague.nba.com/tickets";
                 }
               }
               // CatchDesMoines events: try to extract the "Visit Website" link
               else if (category === "events" && url.includes("catchdesmoines.com")) {
                 try {
                   let eventDetailUrl = null;
                   
                   // Check if we have a detail_url from the AI extraction
                   if (item.detail_url) {
                     // If it's a relative URL, make it absolute
                     if (item.detail_url.startsWith('/')) {
                       eventDetailUrl = `https://www.catchdesmoines.com${item.detail_url}`;
                     } else if (item.detail_url.includes('catchdesmoines.com')) {
                       eventDetailUrl = item.detail_url;
                     }
                   }
                   // If the URL we're crawling is already an event detail page, use it
                   else if (url.includes('catchdesmoines.com/event/')) {
                     eventDetailUrl = url;
                   }
                   
                   // If we have an event detail URL, extract the "Visit Website" link from it
                   if (eventDetailUrl) {
                     console.log(`🔗 Fetching event detail page: ${eventDetailUrl}`);
                     const visitWebsiteUrl = await extractCatchDesMoinesVisitWebsiteUrl(eventDetailUrl);
                     if (visitWebsiteUrl) {
                       actualSourceUrl = visitWebsiteUrl;
                       console.log(`✅ Extracted Visit Website URL: ${visitWebsiteUrl}`);
                     } else {
                       console.log(`⚠️ No Visit Website URL found, using event detail URL: ${eventDetailUrl}`);
                       actualSourceUrl = eventDetailUrl; // Use the event detail URL if we can't find Visit Website
                     }
                   } else {
                     console.log(`⚠️ No event detail URL available, using list page URL`);
                   }
                 } catch (error) {
                   console.error(
                     `❌ Error extracting Visit Website URL: ${error.message}`
                   );
                 }
               }

               return {
                 ...item,
                 source_url: actualSourceUrl,
               };
             })
           );

          // Log sample item for debugging
          if (itemsWithSource.length > 0) {
            console.log(
              `🔍 Sample extracted item: ${JSON.stringify(itemsWithSource[0])}`
            );
          }

          return itemsWithSource;
        } catch (parseError) {
          console.error(`❌ Could not parse AI response JSON:`, parseError);
          console.error(
            `❌ JSON string that failed to parse: ${responseText.substring(
              0,
              2000
            )}`
          );
        }
      } else {
        console.error(`❌ No response text from Claude API`);
      }
    } else {
      const errorText = await claudeResponse.text();
      console.error(
        `❌ Claude API error: ${claudeResponse.status} - ${errorText}`
      );
    }
  } catch (error) {
    console.error(`❌ Error in AI content extraction:`, error);
  }

  return [];
}

interface ParsedDateTime {
  event_start_local: string;
  event_timezone: string;
  event_start_utc: Date;
}


// Enhanced time parsing for AI-extracted events
function parseEventDateTime(dateStr: string): ParsedDateTime | null {
  if (!dateStr) return null;

  const eventTimeZone = CENTRAL_TZ; // Des Moines events are always Central

  try {
    console.log(`🕐 Parsing date string: "${dateStr}"`);

    // Parse the date string as Central Time and convert to UTC
    // The AI provides dates like "2025-10-04 19:00:00" which should be interpreted as Central Time

    let year: number, month: number, day: number, hours: number, minutes: number, seconds: number;

    // Match YYYY-MM-DD HH:MM:SS format
    const datetimeMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (datetimeMatch) {
      [, year, month, day, hours, minutes, seconds] = datetimeMatch.map(Number);
    }
    // Match YYYY-MM-DD format (default to 7:30 PM Central)
    else {
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateMatch) {
        [, year, month, day] = dateMatch.map(Number);
        hours = 19;
        minutes = 30;
        seconds = 0;
      } else {
        // Fallback: try to parse with Date constructor
        const fallbackDate = new Date(dateStr);
        if (isNaN(fallbackDate.getTime())) {
          console.log(`⚠️ Could not parse date: ${dateStr}`);
          return null;
        }
        year = fallbackDate.getFullYear();
        month = fallbackDate.getMonth() + 1;
        day = fallbackDate.getDate();
        hours = fallbackDate.getHours() || 19;
        minutes = fallbackDate.getMinutes() || 30;
        seconds = fallbackDate.getSeconds() || 0;
      }
    }

    // Create a proper date object representing this time in Central timezone
    const centralTimeString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // Convert the Central wall-clock time to the correct UTC instant.
    //
    // This used to guess the offset with `month >= 2 && month <= 10` (i.e. treat
    // all of March through all of November as CDT), which is wrong at both ends
    // of DST: US DST starts the 2nd Sunday of March and ends the 1st Sunday of
    // November, so early-March and most-of-November events were stamped an hour
    // off — enough to show a 7:00 PM show as 8:00 PM. centralOffsetHours() asks
    // the runtime's IANA tz database for the real offset on that date instead.
    const offsetStr = centralOffsetString(year, month, day, hours, minutes);

    // Create ISO string with timezone
    const isoWithTimezone = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${offsetStr}`;
    const utcDate = new Date(isoWithTimezone);

    console.log(
      `🕐 Parsed: ${dateStr} -> Central: ${centralTimeString} (offset: ${offsetStr}) -> UTC: ${utcDate.toISOString()}`
    );

    if (!isNaN(utcDate.getTime())) {
      return {
        event_start_local: centralTimeString,
        event_timezone: eventTimeZone,
        event_start_utc: utcDate,
      };
    }
  } catch (error) {
    console.log(`⚠️ Could not parse AI date: ${dateStr}`, error);
  }

  return null;
}

// Filter out past events with enhanced date handling
function filterFutureEvents(events: any[]): any[] {
  // Compare against the true current instant. This used to compare an event's
  // real UTC timestamp against `utcToZonedTime(new Date(), 'America/Chicago')`,
  // which returns a Date SHIFTED back by the Central offset — so the cutoff sat
  // 5-6 hours in the past and events that had already started were still
  // ingested as "upcoming". event_start_utc is a genuine UTC instant, so the
  // correct comparison is against Date.now().
  //
  // A small grace window is kept deliberately: an event that started within the
  // last two hours is usually still worth showing (doors open early, a 3-hour
  // festival day is still running), and the previous accidental 5-6 hour skew
  // means dropping to an exact cutoff would silently remove rows the site has
  // been surfacing.
  const IN_PROGRESS_GRACE_MS = 2 * 60 * 60 * 1000;
  const cutoff = Date.now() - IN_PROGRESS_GRACE_MS;

  return events.filter((event) => {
    if (!event.date) return true; // Keep events without dates

    try {
      const parsed = parseEventDateTime(event.date);
      if (parsed && parsed.event_start_utc) {
        return parsed.event_start_utc.getTime() >= cutoff;
      }
      return true; // Keep if parsing fails
    } catch (error) {
      console.log(
        `⚠️ Could not parse date for filtering: ${event.date}`,
        error
      );
      return true; // Keep events with unparseable dates
    }
  });
}

// Generate fingerprint for duplicate detection
function generateFingerprint(data: any, category: string): string {
  let key = "";

  switch (category) {
    case "events":
      key = `${data.title}_${data.date}_${data.venue}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      break;
    case "restaurants":
    case "restaurant_openings":
      key = `${data.name}_${data.location}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      break;
    case "playgrounds":
    case "attractions":
      key = `${data.name}_${data.location}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      break;
  }

  return key.substring(0, 100);
}

// Check for duplicates in database
async function checkForDuplicates(
  supabase: any,
  category: string,
  items: any[]
): Promise<{ newItems: any[]; duplicates: number }> {
  const tableName =
    category === "restaurant_openings" ? "restaurants" : category;
  let duplicates = 0;
  const newItems = [];

  // First remove duplicates within the batch itself
  const seen = new Set();
  const uniqueItems = [];

  for (const item of items) {
    let key;
    switch (category) {
      case "events":
        key = `${item.title?.toLowerCase()?.trim()}|${item.venue
          ?.toLowerCase()
          ?.trim()}`;
        break;
      default:
        key = item.name?.toLowerCase()?.trim();
    }

    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    } else {
      duplicates++;
      console.log(`⚠️ Batch duplicate removed: ${item.title || item.name}`);
    }
  }

  // Then check against database
  for (const item of uniqueItems) {
    const fingerprint = generateFingerprint(item, category);

    try {
      let query;
      switch (category) {
        case "events":
          // Use case-insensitive matching for events
          query = supabase
            .from(tableName)
            .select("id")
            // sanitizeLikeInput, because a SCRAPED title is a LIKE PATTERN here.
            // One stored title already carries a literal percent ("Monday Pop Up
            // Hours and 10% Bourbon..."), and in an ilike that percent is a
            // wildcard - so this duplicate check can match a row that is not a
            // duplicate. It GATES THE INSERT, so a false match silently drops a
            // real event, which is the same shape as the firecrawl duplicate
            // check fixed earlier in this story.
            //
            // Safe for names only since sanitizeLikeInput stopped stripping
            // apostrophes: before that it would have turned "Chef George's" into
            // "Chef Georges" and MISSED the real duplicate instead.
            .ilike("title", sanitizeLikeInput(item.title?.trim() ?? ""))
            .ilike("venue", sanitizeLikeInput(item.venue?.trim() ?? ""));
          break;
        case "restaurants":
        case "playgrounds":
        case "attractions":
          query = supabase
            .from(tableName)
            .select("id")
            .ilike("name", item.name?.trim());
          break;
        case "restaurant_openings":
          // For restaurant openings, use exact name match to avoid false duplicates
          query = supabase
            .from(tableName)
            .select("id")
            .eq("name", item.name?.trim());

          // Debug for restaurant_openings
          console.log(
            `🔍 Checking duplicate for restaurant opening: "${item.name?.trim()}" in table ${tableName} (exact match)`
          );
          break;
      }

      const { data: existing, error } = await query.limit(1);

      if (error) {
        console.error(
          `Error checking duplicate for ${item.title || item.name}:`,
          error
        );
        // On error, still add the item
        newItems.push({ ...item, fingerprint });
      } else if (existing && existing.length > 0) {
        console.log(`⚠️ Database duplicate found: ${item.title || item.name}`);
        duplicates++;
      } else {
        newItems.push({ ...item, fingerprint });
      }
    } catch (error) {
      console.error(`Error processing item ${item.title || item.name}:`, error);
      // On error, still add the item to avoid losing data
      newItems.push({ ...item, fingerprint });
    }
  }

  return { newItems, duplicates };
}

// Delegate to the shared imageStorage utility
function fetchAndStoreImage(
  supabase: any,
  sourceImageUrl: string,
  category: string,
  contentId: string
): Promise<string | null> {
  return _fetchAndStoreImageShared(supabase, sourceImageUrl, category, contentId);
}

// Insert data into appropriate table
async function insertData(
  supabase: any,
  category: string,
  items: any[]
): Promise<{ success: boolean; insertedCount: number; errors: any[] }> {
  const tableName =
    category === "restaurant_openings" ? "restaurants" : category;
  const errors = [];
  let insertedCount = 0;

  // Process items in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    try {
      // Pre-assign UUIDs and fetch images concurrently for this batch
      const batchWithIds = batch.map((item) => ({
        ...item,
        _assignedId: crypto.randomUUID(),
      }));

      // A single-venue source (Hoyt Sherman, Wooly's, Vibrant, the Wells Fargo
      // Arena teams, Principal Park...) reuses the SAME venue image for every
      // event, so there is nothing to gain by downloading and storing a
      // near-duplicate per event. resolveEventImage returns skipFetch for those
      // and fetchAndStoreImage is never called: no egress, no storage object, no
      // media_assets row. Aggregators - Catch Des Moines, SeatGeek, Eventbrite -
      // have no declared venue and keep the per-event path unchanged.
      const imageResults = await Promise.all(
        batchWithIds.map(async (item) => {
          const resolved = await resolveEventImage(supabase, {
            sourceUrl: item.source_url || "",
            scrapedImageUrl: item.image_url,
          });
          if (resolved.skipFetch) {
            console.log(`\u{1F3DB}\uFE0F Venue image for ${resolved.venueName}: skipped per-event fetch`);
            return resolved.imageUrl;
          }
          if (!resolved.imageUrl) return null;
          return fetchAndStoreImage(supabase, resolved.imageUrl, category, item._assignedId);
        })
      );

      // Transform data for database schema
      const transformedBatch = batchWithIds
        .map((item, idx) => {
          const resolvedImageUrl = imageResults[idx];
          const baseItem = {
            id: item._assignedId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_featured: Math.random() > 0.8, // 20% chance of being featured
          };

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
                return null; // This will be filtered out
              }

              return {
                ...baseItem,
                title: item.title?.substring(0, 200) || "Untitled Event",
                original_description: item.description?.substring(0, 500) || "",
                enhanced_description: item.description?.substring(0, 500) || "",
                date: parsedEventDateTime.event_start_utc.toISOString(),
                event_start_local: parsedEventDateTime.event_start_local,
                event_timezone: parsedEventDateTime.event_timezone,
                event_start_utc: parsedEventDateTime.event_start_utc,
                location: item.location?.substring(0, 100) || "Des Moines, IA",
                venue:
                  item.venue?.substring(0, 100) ||
                  item.location?.substring(0, 100) ||
                  "TBD",
                category: item.category?.substring(0, 50) || "General",
                price: item.price?.substring(0, 50) || "See website",
                source_url: item.source_url || "",
                image_url: resolvedImageUrl || null,
                is_enhanced: false,
              };
            case "restaurants":
              return {
                ...baseItem,
                name: item.name?.substring(0, 200) || "Unnamed Restaurant",
                cuisine: item.cuisine?.substring(0, 100) || "American",
                location: item.location?.substring(0, 200) || "Des Moines, IA",
                rating: item.rating || null,
                price_range: item.price_range?.substring(0, 20) || "$$",
                description: item.description?.substring(0, 500) || "",
                phone: item.phone?.substring(0, 20) || null,
                website: item.website?.substring(0, 200) || null,
                image_url: resolvedImageUrl || null,
              };
            case "restaurant_openings":
              return {
                ...baseItem,
                name: item.name?.substring(0, 200) || "New Restaurant",
                cuisine: item.cuisine?.substring(0, 100) || "American",
                location: item.location?.substring(0, 200) || "Des Moines, IA",
                description: item.description?.substring(0, 500) || "",
                phone: item.phone?.substring(0, 20) || null,
                website: item.website?.substring(0, 200) || null,
                price_range: item.price_range?.substring(0, 20) || null,
                rating: item.rating || null,
                // WEB-BE-032: this called .toISOString() on whichever branch
                // won, and parseEventDateTime returns ParsedDateTime | null -
                // an object of { event_start_local, event_timezone,
                // event_start_utc }, not a Date. So the SUCCESS path threw
                // "toISOString is not a function" and only an unparseable date
                // reached the working fallback. Inverted, in a deployed
                // function, on the restaurant-opening ingest path. Nothing
                // type-checked supabase/functions until 2026-08-27.
                opening_date: item.opening_date
                  ? (
                      parseEventDateTime(item.opening_date)?.event_start_utc ??
                      new Date(item.opening_date)
                    )
                      .toISOString()
                      .split("T")[0]
                  : null,
                status: item.status || "announced",
                source_url: item.source_url || "",
                image_url: resolvedImageUrl || null,
              };
            case "playgrounds":
              return {
                ...baseItem,
                name: item.name?.substring(0, 200) || "Playground",
                location: item.location?.substring(0, 200) || "Des Moines, IA",
                description: item.description?.substring(0, 500) || "",
                age_range: item.age_range?.substring(0, 50) || "All ages",
                amenities: Array.isArray(item.amenities)
                  ? item.amenities.slice(0, 10)
                  : [],
                rating: item.rating || null,
                image_url: resolvedImageUrl || null,
              };
            case "attractions":
              return {
                ...baseItem,
                name: item.name?.substring(0, 200) || "Attraction",
                type: item.type?.substring(0, 100) || "General",
                location: item.location?.substring(0, 200) || "Des Moines, IA",
                description: item.description?.substring(0, 500) || "",
                rating: item.rating || null,
                website: item.website?.substring(0, 200) || null,
                image_url: resolvedImageUrl || null,
              };
            default: {
              // Strip internal _assignedId before returning
              const { _assignedId: _id, ...rest } = item;
              return { ...baseItem, ...rest };
            }
          }
        })
        .filter((item) => item !== null); // Remove null items (events with bad dates)

      // Skip empty batches
      if (transformedBatch.length === 0) {
        console.log(`⚠️ Skipping empty batch (all items had invalid dates)`);
        continue;
      }

      const { data, error } = await supabase
        .from(tableName)
        .insert(transformedBatch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch:`, error);
        if (category === "restaurant_openings") {
          console.error(
            `❌ Restaurant openings batch that failed:`,
            JSON.stringify(transformedBatch, null, 2)
          );
        }
        errors.push(error);
      } else {
        insertedCount += data.length;
        console.log(`✅ Inserted ${data.length} ${category} items`);
        if (category === "restaurant_openings" && data.length > 0) {
          console.log(
            `🍽️ Successfully inserted restaurant openings:`,
            data.map((d) => d.name).join(", ")
          );
        }
      }
    } catch (error) {
      console.error(`❌ Error processing batch:`, error);
      errors.push(error);
    }
  }

  return {
    success: errors.length === 0,
    insertedCount,
    errors,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // AUTH: admin JWT, EDGE_FUNCTION_API_KEY, or service-role key only.
  // Rejected callers get a 401/403 before any scrape or Claude work runs.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, category }: CrawlRequest = await req.json();

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validCategories = [
      "events",
      "restaurants",
      "playgrounds",
      "restaurant_openings",
      "attractions",
    ];
    if (!validCategories.includes(category)) {
      return new Response(
        JSON.stringify({
          error: `Invalid category. Must be one of: ${validCategories.join(
            ", "
          )}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // SSRF / cost-proxy guard: the target host must be on the crawler
    // allowlist (configurable via CRAWLER_DOMAIN_ALLOWLIST / CRAWLER_ALLOW_ALL).
    const hostCheck = isHostAllowed(url);
    if (!hostCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "URL not permitted", reason: hostCheck.reason }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize services
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = getAnthropicApiKey();

    if (!claudeApiKey) {
      return new Response(
        JSON.stringify({ error: "Claude API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🚀 Starting AI crawl of ${url} for ${category}`);

    // Try a domain-specific API adapter first (e.g. statsapi.mlb.com for Iowa
    // Cubs, SeatGeek Platform API). If it returns items, skip scrape+Claude.
    const adapterResult = await tryDomainAdapter(url, category);
    let extractedItems: any[];

    if (adapterResult) {
      console.log(
        `🎯 Using ${adapterResult.adapter} adapter — bypassing scrape + Claude (${adapterResult.items.length} items)`
      );
      extractedItems = adapterResult.items;
    } else {
    // Build the candidate URL list. CRITICAL: for a general events request we
    // only ever try pages on the TARGET's OWN domain (the URL itself plus its
    // conventional /events/ and /calendar/ paths). We used to append
    // catchdesmoines.com URLs here and then keep the highest-"scoring" page —
    // but a dense catchdesmoines listing reliably out-scored a smaller local
    // site, so the target site's content was discarded and it looked like the
    // site "had no events." Never substitute a different domain for the one the
    // caller asked to scrape.
    const sameDomainEventUrls = (base: string): string[] => {
      // A profiled source declares exactly which listing URLs carry its
      // calendar, so use those first. That matters most where the seeded URL
      // sits ABOVE the calendar (Wooly's /first-fleet-venues/woolys) or
      // narrows it (Iowa Wolves ?month=3) — the blind path-guessing below
      // cannot recover either case.
      const urls = resolveListingUrls(base);

      try {
        const u = new URL(base);
        // Only add path variants when the caller pointed at the site root /
        // a shallow path — don't mangle an already-specific event/calendar URL.
        const path = u.pathname.replace(/\/$/, "");
        const isShallow = path === "" || path.split("/").filter(Boolean).length <= 1;
        if (isShallow) {
          const root = `${u.protocol}//${u.host}`;
          for (const p of ["/events/", "/calendar/", "/events/list/", "/shows/"]) {
            const candidate = root + p;
            if (!urls.includes(candidate)) urls.push(candidate);
          }
        }
      } catch {
        // Malformed URL — just try it as-is.
      }
      return urls;
    };

    const urlsToTry =
      category === "events" && isSportsScheduleDomain(url)
        ? getSportsScheduleUrls(url)
        : category === "events"
          ? sameDomainEventUrls(url)
          : findBestEventUrl(url);

    console.log(`🔍 Will try these URLs: ${urlsToTry.join(", ")}`);

    let bestHtml = "";
    let bestUrl = url;
    let maxEventContent = 0;

    // Use universal scraper to fetch URLs with JavaScript rendering
    console.log(`📄 Scraping ${urlsToTry.length} URLs with Puppeteer/Playwright...`);
    const scrapeResults = await scrapeUrls(urlsToTry, {
      waitTime: 5000,
      timeout: 30000,
    }, 2); // Scrape 2 at a time

    // Try each result to find the one with the most event content
    for (let i = 0; i < scrapeResults.length; i++) {
      const result = scrapeResults[i];
      const tryUrl = urlsToTry[i];
      
      try {
        console.log(`📄 Processing result from: ${tryUrl}`);

        if (!result.success || !result.html) {
          console.log(`❌ Failed to scrape ${tryUrl}: ${result.error}`);
          continue;
        }

        const html = result.html;
        console.log(`✅ Got ${html.length} chars from ${tryUrl} using ${result.backend} (took ${result.duration}ms)`);

        // Sports schedule domains: use sports-specific scoring
        // Other sites: use CatchDesMoines-style scoring
        const isSports = isSportsScheduleDomain(tryUrl);
        const eventKeywords = (
          html.match(
            /event|concert|show|game|performance|calendar|festival|fair|exhibition|theater|sports/gi
          ) || []
        ).length;
        const venueKeywords = (
          html.match(
            /arena|center|theatre|theater|park|fairground|stadium|auditorium|hall|principal park|wells fargo|casey's center|vibrant arena/gi
          ) || []
        ).length;
        const dateKeywords = (
          html.match(
            /2025|2026|july|august|september|october|november|december|january|february|march|april|may|june|\d{1,2}\/\d{1,2}|mon|tue|wed|thu|fri|sat|sun/gi
          ) || []
        ).length;
        // Signals that a page is an event LISTING rather than a homepage. For
        // sports we look for schedule/ticket language; for general sites we look
        // for structured-data and calendar markup that generalizes across
        // platforms (WordPress "The Events Calendar", Squarespace, Eventbrite,
        // etc.) — NOT hardcoded catchdesmoines event names, which biased the
        // scorer toward that one site.
        const titleKeywords = isSports
          ? (
              html.match(
                /iowa cubs|iowa wild|iowa wolves|barnstormers|vs\.?|storm chasers|mud hens|griffins|thunderbirds|icehogs|reign|admirals|moose|marlies|roadrunners|checkers|stars|blizzard|steamwheelers|buy tickets|tickets|promotions/gi
              ) || []
            ).length
          : (
              html.match(
                /"@type"\s*:\s*"[a-z]*event"|tribe-events|tribe_events|event-card|eventitem|event-item|event-list|events-list|fc-event|calendar-event|data-event|itemtype="[^"]*schema.org\/[a-z]*event"|buy tickets|get tickets|add to calendar/gi
              ) || []
            ).length;

        const totalScore =
          eventKeywords +
          venueKeywords * 2 +
          dateKeywords * 1.5 +
          titleKeywords * (isSports ? 3 : 3);

        console.log(
          `📊 ${tryUrl}: Score ${totalScore} (events:${eventKeywords}, venues:${venueKeywords}, dates:${dateKeywords}, titles:${titleKeywords}${isSports ? " [sports]" : ""}) in ${html.length} chars`
        );

        if (totalScore > maxEventContent) {
          maxEventContent = totalScore;
          bestHtml = html;
          bestUrl = tryUrl;
          console.log(`✅ New best URL: ${tryUrl} (score: ${totalScore})`);
        }
      } catch (error) {
        console.log(`⚠️ Error processing ${tryUrl}:`, error.message);
      }
    }

    if (!bestHtml) {
      return new Response(
        JSON.stringify({
          error: `Failed to fetch website content from any URL`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `✅ Using content from: ${bestUrl} (${bestHtml.length} characters, ${maxEventContent} event keywords)`
    );

    // Extract content using AI
    extractedItems = await extractContentWithAI(
      bestHtml,
      category,
      bestUrl,
      claudeApiKey
    );

    // Structured-data pre-pass: merge in any schema.org/Event JSON-LD embedded in
    // the page. This is the most reliable, site-agnostic event signal and covers
    // sites the free-text LLM pass under-extracts (Eventbrite, "The Events
    // Calendar", Squarespace, etc.). Items share the AI item shape, so the
    // downstream filter/dedupe/insert pipeline handles them unchanged.
    if (category === "events") {
      try {
        const jsonLdEvents = extractEventsFromJsonLd(bestHtml, bestUrl);
        if (jsonLdEvents.length > 0) {
          console.log(
            `🧩 JSON-LD structured data yielded ${jsonLdEvents.length} events from ${bestUrl}`
          );
          extractedItems = [...extractedItems, ...jsonLdEvents];
        }
      } catch (jsonLdError) {
        console.error(`⚠️ JSON-LD extraction failed for ${bestUrl}:`, jsonLdError);
      }
    }
    } // end of else branch for non-adapter path

    // Filter out past events for events category
    const filteredItems =
      category === "events"
        ? filterFutureEvents(extractedItems)
        : extractedItems;

    console.log(
      `🕒 After filtering past events: ${filteredItems.length} items (removed ${
        extractedItems.length - filteredItems.length
      } past events)`
    );

    if (filteredItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `No ${category} found on the website`,
          results: {
            totalFound: 0,
            newItems: 0,
            duplicates: 0,
            inserted: 0,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🤖 AI extracted ${filteredItems.length} ${category} items`);

    // Debug: Log a few sample items for restaurant_openings
    if (category === "restaurant_openings" && filteredItems.length > 0) {
      console.log(
        `🔍 Sample restaurant opening items:`,
        JSON.stringify(filteredItems.slice(0, 2), null, 2)
      );
    }

    // Check for duplicates
    const { newItems, duplicates } = await checkForDuplicates(
      supabase,
      category,
      filteredItems
    );

    console.log(
      `📊 Found ${newItems.length} new items, ${duplicates} duplicates`
    );

    let insertedCount = 0;
    let insertErrors: any[] = [];

    // Insert new items
    if (newItems.length > 0) {
      console.log(
        `💾 Attempting to insert ${newItems.length} ${category} items`
      );
      const insertResult = await insertData(supabase, category, newItems);
      insertedCount = insertResult.insertedCount;
      insertErrors = insertResult.errors;

      if (category === "restaurant_openings") {
        console.log(
          `🍽️ Restaurant openings insertion result: ${insertedCount} inserted, ${insertErrors.length} errors`
        );
        if (insertErrors.length > 0) {
          console.log(`❌ Restaurant opening insertion errors:`, insertErrors);
        }
      }
    } else {
      console.log(`⏭️ No new items to insert for ${category}`);
    }

    const response_data = {
      success: true,
      message: `Successfully crawled ${url} for ${category}`,
      results: {
        totalFound: filteredItems.length,
        newItems: newItems.length,
        duplicates: duplicates,
        inserted: insertedCount,
        errors: insertErrors.length,
      },
      items: filteredItems.slice(0, 5), // Return first 5 items as preview
    };

    console.log(`✅ Crawl completed:`, response_data.results);

    return new Response(JSON.stringify(response_data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Error in AI crawler:", error);
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
