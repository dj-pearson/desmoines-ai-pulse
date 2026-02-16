import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scrapeUrl, getScraperConfig } from "../_shared/scraper.ts";

const AFFILIATE_BASE =
  "https://ticketmaster.evyy.net/c/6430290/264167/4272?u=";
const VIBRANT_URL = "https://www.vibrantmusichall.com/shows";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface ScrapedShow {
  name: string;
  ticketmasterUrl: string;
  affiliateUrl: string;
}

interface UpdateResult {
  showName: string;
  matchedEventId: string | null;
  matchedEventTitle: string | null;
  affiliateUrl: string;
  updated: boolean;
  reason: string;
}

/**
 * Strip tracking parameters from Ticketmaster URLs for cleaner affiliate links.
 */
function cleanTicketmasterUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      "_gl",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];
    trackingParams.forEach((param) => url.searchParams.delete(param));
    // Remove _ga* params (Google Analytics)
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("_ga")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Convert a Ticketmaster URL to an affiliate link.
 */
function toAffiliateLink(ticketmasterUrl: string): string {
  const cleanUrl = cleanTicketmasterUrl(ticketmasterUrl);
  return AFFILIATE_BASE + encodeURIComponent(cleanUrl);
}

/**
 * Decode common HTML entities.
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Try to extract event name from a Ticketmaster URL path as a fallback.
 * URL format: /event-name-city-state-mm-dd-yyyy/event/ID
 */
function extractNameFromTicketmasterUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
    // Remove trailing date pattern (mm-dd-yyyy)
    const withoutDate = firstSegment.replace(/-\d{2}-\d{2}-\d{4}$/, "");
    // Remove common city/state suffixes
    const withoutLocation = withoutDate.replace(
      /-(?:waukee|des-moines|ankeny|ames|urbandale|iowa|west-des-moines|johnston|clive|grimes|altoona|pleasant-hill)(?:-iowa)?$/gi,
      ""
    );
    // Also handle cases where location words are repeated
    const cleaned = withoutLocation.replace(
      /-(?:waukee|des-moines|ankeny|ames|urbandale|iowa|west-des-moines|johnston|clive|grimes|altoona|pleasant-hill)$/gi,
      ""
    );
    return cleaned
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

/**
 * Primary extraction: Use Browserless /function endpoint to run JavaScript
 * directly in the browser context for reliable DOM-based extraction.
 */
async function extractShowsWithBrowserlessFunction(): Promise<ScrapedShow[]> {
  const config = getScraperConfig();

  if (!config.browserlessApiKey) {
    throw new Error("Browserless API key not configured");
  }

  const browserlessUrl = `${config.browserlessUrl}/function?token=${config.browserlessApiKey}`;

  // JavaScript that runs in headless Chrome to extract event data from the DOM
  const code = `
    module.exports = async ({ page }) => {
      await page.goto('${VIBRANT_URL}', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await page.waitForTimeout(6000);

      try {
        await page.waitForSelector('a[href*="ticketmaster.com"]', { timeout: 10000 });
      } catch (e) {
        // Continue even if selector not found — we'll return empty
      }

      const events = await page.evaluate(() => {
        const results = [];
        const ticketLinks = document.querySelectorAll('a[href*="ticketmaster.com"]');

        for (const link of ticketLinks) {
          const href = link.href;
          if (!href) continue;

          let name = '';

          // Walk up the DOM to find the closest event container with a heading
          let el = link.parentElement;
          for (let depth = 0; depth < 15 && el; depth++) {
            const heading = el.querySelector('h1, h2, h3, h4, h5, h6');
            if (heading && heading.textContent.trim().length > 2) {
              name = heading.textContent.trim();
              break;
            }
            el = el.parentElement;
          }

          // Fallback: look for elements with heading-like classes
          if (!name) {
            el = link.parentElement;
            for (let depth = 0; depth < 15 && el; depth++) {
              const chakraHeading = el.querySelector('[class*="heading"], [class*="title"]');
              if (chakraHeading && chakraHeading.textContent.trim().length > 2) {
                name = chakraHeading.textContent.trim();
                break;
              }
              el = el.parentElement;
            }
          }

          if (href.includes('ticketmaster.com')) {
            results.push({ name: name || '', ticketmasterUrl: href });
          }
        }

        return results;
      });

      return events;
    };
  `;

  console.log("🚀 Using Browserless /function for direct DOM extraction...");

  const response = await fetch(browserlessUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Browserless /function error: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Browserless /function returned unexpected format");
  }

  console.log(`✅ Browserless /function extracted ${data.length} events`);

  const shows: ScrapedShow[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    if (!item.ticketmasterUrl || seen.has(item.ticketmasterUrl)) continue;
    seen.add(item.ticketmasterUrl);

    let name = item.name || "";
    // If no name was extracted from DOM, try extracting from the URL
    if (!name || name.length < 3) {
      name = extractNameFromTicketmasterUrl(item.ticketmasterUrl);
    }

    if (name.length >= 3) {
      shows.push({
        name,
        ticketmasterUrl: item.ticketmasterUrl,
        affiliateUrl: toAffiliateLink(item.ticketmasterUrl),
      });
    }
  }

  return shows;
}

/**
 * Intermediate extraction: Use Firecrawl API to get markdown, then parse
 * Ticketmaster links and event names from the markdown output.
 * Firecrawl handles JavaScript rendering and returns clean markdown.
 */
async function extractShowsWithFirecrawl(): Promise<{
  shows: ScrapedShow[];
  duration: number;
}> {
  console.log("🔥 Trying Firecrawl for markdown-based extraction...");

  const scrapeResult = await scrapeUrl(VIBRANT_URL, {
    backend: "firecrawl",
    waitTime: 8000,
    timeout: 30000,
  });

  if (!scrapeResult.success) {
    throw new Error(`Firecrawl scrape failed: ${scrapeResult.error}`);
  }

  const shows: ScrapedShow[] = [];
  const seen = new Set<string>();

  // Parse markdown if available (Firecrawl returns markdown)
  const content = scrapeResult.markdown || scrapeResult.text || scrapeResult.html || "";
  console.log(`🔥 Got ${content.length} chars from Firecrawl`);

  if (scrapeResult.markdown) {
    // In markdown, links look like [text](url) and headings like ## Heading
    // Find all Ticketmaster links in markdown
    const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/(?:www\.)?ticketmaster\.com\/[^)]+)\)/gi;
    let mdMatch;

    while ((mdMatch = mdLinkRegex.exec(content)) !== null) {
      const linkText = mdMatch[1].trim();
      const ticketmasterUrl = mdMatch[2];
      if (seen.has(ticketmasterUrl)) continue;

      const linkPosition = mdMatch.index;

      // Look back in the markdown for the nearest heading
      const contextBefore = content.substring(
        Math.max(0, linkPosition - 2000),
        linkPosition
      );

      let eventName = "";
      // Find last markdown heading (# or ## or ###)
      const mdHeadingRegex = /^#{1,6}\s+(.+)$/gm;
      let headingMatch;
      while ((headingMatch = mdHeadingRegex.exec(contextBefore)) !== null) {
        const text = headingMatch[1].trim();
        if (text.length > 2) {
          eventName = text;
        }
      }

      // If no heading found, use the link text if it's not "Buy Tickets" etc.
      if (
        !eventName &&
        linkText.length > 3 &&
        !/buy\s*tickets?/i.test(linkText) &&
        !/get\s*tickets?/i.test(linkText)
      ) {
        eventName = linkText;
      }

      // Final fallback: extract from URL
      if (!eventName) {
        eventName = extractNameFromTicketmasterUrl(ticketmasterUrl);
      }

      if (eventName.length >= 3) {
        seen.add(ticketmasterUrl);
        shows.push({
          name: eventName,
          ticketmasterUrl,
          affiliateUrl: toAffiliateLink(ticketmasterUrl),
        });
      }
    }
  }

  // If markdown parsing found nothing, fall back to HTML parsing
  if (shows.length === 0 && scrapeResult.html) {
    console.log("🔥 Markdown parsing found no shows, trying HTML from Firecrawl...");
    const htmlShows = parseShowsFromHTML(scrapeResult.html);
    shows.push(...htmlShows);
  }

  return { shows, duration: scrapeResult.duration };
}

/**
 * Parse shows from raw HTML string (shared logic for HTML-based extraction).
 */
function parseShowsFromHTML(html: string): ScrapedShow[] {
  const shows: ScrapedShow[] = [];
  const seen = new Set<string>();

  const linkRegex =
    /<a\s[^>]*href="(https?:\/\/(?:www\.)?ticketmaster\.com\/[^"]+)"[^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const ticketmasterUrl = decodeHTMLEntities(match[1]);
    if (seen.has(ticketmasterUrl)) continue;

    const linkPosition = match.index;
    const lookbackStart = Math.max(0, linkPosition - 3000);
    const contextBefore = html.substring(lookbackStart, linkPosition);

    let eventName = "";

    // Find the last heading element before this link
    const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let headingMatch;
    while ((headingMatch = headingRegex.exec(contextBefore)) !== null) {
      const text = decodeHTMLEntities(
        headingMatch[1].replace(/<[^>]+>/g, "")
      )
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 2) {
        eventName = text;
      }
    }

    // Fallback: look for Chakra heading classes
    if (!eventName) {
      const chakraRegex =
        /class="[^"]*(?:chakra-heading|chakra-text[^"]*(?:font-bold|fontWeight))[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
      while ((headingMatch = chakraRegex.exec(contextBefore)) !== null) {
        const text = decodeHTMLEntities(
          headingMatch[1].replace(/<[^>]+>/g, "")
        )
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 2) {
          eventName = text;
        }
      }
    }

    // Final fallback: extract name from Ticketmaster URL slug
    if (!eventName) {
      eventName = extractNameFromTicketmasterUrl(ticketmasterUrl);
    }

    if (eventName.length >= 3) {
      seen.add(ticketmasterUrl);
      shows.push({
        name: eventName,
        ticketmasterUrl,
        affiliateUrl: toAffiliateLink(ticketmasterUrl),
      });
    }
  }

  return shows;
}

/**
 * Fallback extraction: scrape HTML via Browserless/fetch and parse with regex.
 */
async function extractShowsFromHTML(): Promise<{
  shows: ScrapedShow[];
  backend: string;
  duration: number;
}> {
  console.log("📄 Falling back to HTML scrape + regex parsing...");

  // scrapeUrl automatically falls through: Browserless → Firecrawl → fetch
  let scrapeResult = await scrapeUrl(VIBRANT_URL, {
    backend: "browserless",
    waitTime: 8000,
    waitForSelector: 'a[href*="ticketmaster.com"]',
    timeout: 30000,
  });

  if (!scrapeResult.success || !scrapeResult.html) {
    console.log("⚠️ Browserless HTML scrape failed, trying fetch...");
    scrapeResult = await scrapeUrl(VIBRANT_URL, {
      backend: "fetch",
      timeout: 15000,
    });
  }

  if (!scrapeResult.success || !scrapeResult.html) {
    throw new Error(
      `Failed to scrape Vibrant Music Hall: ${scrapeResult.error}`
    );
  }

  const html = scrapeResult.html;
  console.log(`📄 Got ${html.length} chars of HTML via ${scrapeResult.backend}`);

  const shows = parseShowsFromHTML(html);

  return {
    shows,
    backend: scrapeResult.backend,
    duration: scrapeResult.duration,
  };
}

/**
 * Normalize a string for fuzzy comparison.
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate similarity between two strings using bigram Dice coefficient (0-1).
 */
function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeForComparison(str1);
  const norm2 = normalizeForComparison(str2);

  if (norm1 === norm2) return 1.0;
  if (norm1.length === 0 || norm2.length === 0) return 0;

  // Check containment (one name is a substring of the other)
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

  // Bigram Dice coefficient
  const bigrams = (s: string): Set<string> => {
    const bg = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bg.add(s.substring(i, i + 2));
    }
    return bg;
  };

  const bg1 = bigrams(norm1);
  const bg2 = bigrams(norm2);

  let intersection = 0;
  for (const b of bg1) {
    if (bg2.has(b)) intersection++;
  }

  return (2 * intersection) / (bg1.size + bg2.size);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🎵 Starting Vibrant Music Hall Ticketmaster scraper...");

    // Parse optional request body
    let dryRun = false;
    let minSimilarity = 0.6;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        dryRun = body.dry_run ?? false;
        minSimilarity = body.min_similarity ?? 0.6;
      } catch {
        // No body or invalid JSON, use defaults
      }
    }

    // Step 1: Extract shows from Vibrant Music Hall
    // Fallback chain: Browserless /function → Firecrawl markdown → HTML scrape + regex
    let shows: ScrapedShow[] = [];
    let scrapeMethod = "unknown";
    const errors: string[] = [];

    // Method 1: Browserless /function (direct DOM extraction — most reliable)
    try {
      shows = await extractShowsWithBrowserlessFunction();
      scrapeMethod = "browserless-function";
    } catch (funcError) {
      errors.push(`Browserless /function: ${funcError.message}`);
      console.log(`⚠️ ${errors[errors.length - 1]}`);
    }

    // Method 2: Firecrawl (markdown parsing — handles JS pages well)
    if (shows.length === 0) {
      try {
        const firecrawlResult = await extractShowsWithFirecrawl();
        shows = firecrawlResult.shows;
        scrapeMethod = "firecrawl-markdown";
      } catch (fcError) {
        errors.push(`Firecrawl: ${fcError.message}`);
        console.log(`⚠️ ${errors[errors.length - 1]}`);
      }
    }

    // Method 3: HTML scrape + regex (Browserless HTML → fetch fallback)
    if (shows.length === 0) {
      try {
        const htmlResult = await extractShowsFromHTML();
        shows = htmlResult.shows;
        scrapeMethod = `html-regex-${htmlResult.backend}`;
      } catch (htmlError) {
        errors.push(`HTML regex: ${htmlError.message}`);
        console.log(`⚠️ ${errors[errors.length - 1]}`);
      }
    }

    if (shows.length === 0 && errors.length > 0) {
      throw new Error(`All scraping methods failed: ${errors.join(" | ")}`);
    }

    console.log(
      `🎶 Found ${shows.length} shows with Ticketmaster links (via ${scrapeMethod})`
    );

    if (shows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No shows with Ticketmaster links found on the page",
          scrape_method: scrapeMethod,
          shows_found: 0,
          events_updated: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Connect to Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Step 3: Fetch events from the database for matching
    // Start with events at Vibrant Music Hall / Waukee
    const { data: venueEvents, error: venueError } = await supabase
      .from("events")
      .select("id, title, date, venue, location, source_url")
      .or(
        "venue.ilike.%vibrant%,venue.ilike.%music hall%,location.ilike.%waukee%,location.ilike.%vibrant%"
      )
      .order("date", { ascending: true });

    if (venueError) {
      console.error("Venue query error:", venueError);
    }

    // Also fetch broader upcoming events for title matching
    const { data: upcomingEvents, error: upcomingError } = await supabase
      .from("events")
      .select("id, title, date, venue, location, source_url")
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true })
      .limit(500);

    if (upcomingError) {
      console.error("Upcoming query error:", upcomingError);
    }

    // Merge both sets without duplicates
    const allDbEvents: Array<{
      id: string;
      title: string;
      date: string;
      venue: string | null;
      location: string | null;
      source_url: string | null;
    }> = [];
    const seenIds = new Set<string>();

    for (const event of venueEvents || []) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        allDbEvents.push(event);
      }
    }
    for (const event of upcomingEvents || []) {
      if (!seenIds.has(event.id)) {
        seenIds.add(event.id);
        allDbEvents.push(event);
      }
    }

    console.log(`📊 ${allDbEvents.length} events to match against`);

    // Step 4: Match shows to database events and update source_url
    const results: UpdateResult[] = [];
    let updatedCount = 0;

    for (const show of shows) {
      console.log(`\n🔍 Matching: "${show.name}"`);

      let bestMatch: {
        id: string;
        title: string;
        similarity: number;
      } | null = null;

      for (const dbEvent of allDbEvents) {
        const similarity = calculateSimilarity(show.name, dbEvent.title);

        if (
          similarity >= minSimilarity &&
          (!bestMatch || similarity > bestMatch.similarity)
        ) {
          bestMatch = {
            id: dbEvent.id,
            title: dbEvent.title,
            similarity,
          };
        }
      }

      if (bestMatch) {
        const similarityPct = (bestMatch.similarity * 100).toFixed(0);
        console.log(
          `✅ Matched "${show.name}" → "${bestMatch.title}" (${similarityPct}%)`
        );

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("events")
            .update({ source_url: show.affiliateUrl })
            .eq("id", bestMatch.id);

          if (updateError) {
            console.error(
              `❌ Update failed for ${bestMatch.id}:`,
              updateError
            );
            results.push({
              showName: show.name,
              matchedEventId: bestMatch.id,
              matchedEventTitle: bestMatch.title,
              affiliateUrl: show.affiliateUrl,
              updated: false,
              reason: `Update error: ${updateError.message}`,
            });
          } else {
            updatedCount++;
            results.push({
              showName: show.name,
              matchedEventId: bestMatch.id,
              matchedEventTitle: bestMatch.title,
              affiliateUrl: show.affiliateUrl,
              updated: true,
              reason: `Matched (${similarityPct}% similarity)`,
            });
          }
        } else {
          results.push({
            showName: show.name,
            matchedEventId: bestMatch.id,
            matchedEventTitle: bestMatch.title,
            affiliateUrl: show.affiliateUrl,
            updated: false,
            reason: `Dry run — would update (${similarityPct}% similarity)`,
          });
        }
      } else {
        console.log(`⚠️ No match for "${show.name}"`);
        results.push({
          showName: show.name,
          matchedEventId: null,
          matchedEventTitle: null,
          affiliateUrl: show.affiliateUrl,
          updated: false,
          reason: "No matching event found in database",
        });
      }
    }

    const response = {
      success: true,
      dry_run: dryRun,
      scrape_method: scrapeMethod,
      shows_found: shows.length,
      events_updated: updatedCount,
      events_not_matched: results.filter((r) => !r.matchedEventId).length,
      results,
    };

    console.log(
      `\n📊 Summary: ${shows.length} found, ${updatedCount} updated, ${
        results.filter((r) => !r.matchedEventId).length
      } unmatched`
    );

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Scraper error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
