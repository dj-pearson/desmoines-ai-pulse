/**
 * SECURITY: verify_jwt = false
 * Reason: Background data enrichment job that extracts URLs from external sources without user session context
 * Alternative measures: URL format validation on all extracted links, domain exclusion list prevents following restricted domains
 * Risk level: LOW
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scrapeUrl } from "../_shared/scraper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractResponse {
  success: boolean;
  processed: number;
  errors: Array<{ eventId: string; error: string }>;
  updated: Array<{ eventId: string; oldUrl: string; newUrl: string }>;
  skipped: Array<{ eventId: string; reason: string }>;
}

// Domains to exclude from Visit Website URLs - matches firecrawl-scraper
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
 * Valid: /event/event-name/12345/ (must have numeric ID)
 * Invalid: /events/ (list page), /event/event-name/ (missing ID)
 *
 * Same logic as firecrawl-scraper for consistency
 */
function isValidEventDetailUrl(url: string): boolean {
  if (!url) return false;

  // Must contain /event/ (singular) not just /events/ (plural/list)
  // Pattern: /event/slug/id/ where id is numeric - ID IS REQUIRED
  // Without the numeric ID, CatchDesMoines shows a different page without "Visit Website"
  const eventDetailPattern = /\/event\/[^\/]+\/\d+\/?$/i;

  return eventDetailPattern.test(url);
}

/**
 * Check if a URL is a CatchDesMoines list page (not a detail page)
 */
function isListPageUrl(url: string): boolean {
  if (!url) return false;

  // List pages contain /events/ (plural) with query params
  // Or /events without a specific event slug and ID
  const listPagePatterns = [
    /\/events\/?(\?|$)/i,  // /events/ or /events?...
    /\/events\/\?/i,       // /events/?...
  ];

  return listPagePatterns.some(pattern => pattern.test(url));
}

/**
 * Extract event detail URLs from HTML content
 * Used when we have a list page and need to find detail page URLs
 *
 * Returns a Map with TWO types of keys for flexible matching:
 * 1. Normalized title (lowercase, alphanumeric only)
 * 2. URL slug (extracted from the event URL path)
 *
 * Same logic as firecrawl-scraper
 */
function extractEventDetailUrlsFromHtml(html: string): Map<string, string> {
  const eventUrls = new Map<string, string>();

  // Pattern to find all /event/slug/id/ URLs in the HTML
  const urlPattern = /href=["']([^"']*\/event\/([^\/]+)\/(\d+)\/?["'])/gi;

  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    const fullUrl = match[1]?.replace(/["']$/, '').trim();
    const slug = match[2];
    const eventId = match[3];

    if (!fullUrl || !slug || !eventId) continue;

    // Make sure the extracted URL is valid
    const cleanUrl = fullUrl.startsWith('/')
      ? `https://www.catchdesmoines.com${fullUrl}`
      : fullUrl;

    if (!isValidEventDetailUrl(cleanUrl)) continue;

    // Normalize the slug for matching (remove special chars, decode URL encoding)
    const normalizedSlug = decodeURIComponent(slug)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (normalizedSlug.length > 2) {
      // Store with slug as key (primary matching method)
      eventUrls.set(`slug:${normalizedSlug}`, cleanUrl);
      // Also store the event ID for direct matching
      eventUrls.set(`id:${eventId}`, cleanUrl);
      console.log(`📌 Found event URL from HTML: slug="${slug}" id=${eventId} -> ${cleanUrl}`);
    }
  }

  console.log(`📊 Extracted ${eventUrls.size / 2} unique event URLs from HTML`);
  return eventUrls;
}

/**
 * Find the best matching event detail URL for a given event title
 * Same logic as firecrawl-scraper
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

    // Calculate overlap - character by character comparison
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
  if (nearbyMatch && nearbyMatch[1]) {
    const candidateUrl = nearbyMatch[1].startsWith('/')
      ? `https://www.catchdesmoines.com${nearbyMatch[1]}`
      : nearbyMatch[1];
    if (isValidEventDetailUrl(candidateUrl)) {
      console.log(`✅ Found URL near title in HTML: "${eventTitle}" -> ${candidateUrl}`);
      return candidateUrl;
    }
  }

  console.log(`⚠️ No matching URL found for: "${eventTitle}"`);
  return null;
}

interface ExtractedEventData {
  visitUrl: string | null;
  detailPageUrl: string | null;
}

/**
 * Extract Visit Website URL from a CatchDesMoines event detail page
 * Uses the same logic as firecrawl-scraper for consistency
 */
async function extractVisitWebsiteFromDetailPage(
  detailPageUrl: string
): Promise<string | null> {
  try {
    console.log(`🔗 Fetching event detail page: ${detailPageUrl}`);

    // Use longer wait time and wait for action items to load
    // CatchDesMoines uses dynamic JS rendering for the "Visit Website" button
    const result = await scrapeUrl(detailPageUrl, {
      waitTime: 5000,  // Wait 5 seconds for dynamic content
      timeout: 30000,  // 30 second total timeout
      waitForSelector: '.action-item, .detail-actions, .event-actions', // Wait for action buttons
    });

    if (!result.success || !result.html) {
      console.log(`❌ Failed to fetch page: ${result.error}`);
      return null;
    }

    const html = result.html;
    console.log(`✅ Scraped ${html.length} chars from detail page`);

    // Check if URL is excluded
    const isExcluded = (url: string) =>
      EXCLUDED_DOMAINS.some(d => url.toLowerCase().includes(d.toLowerCase()));

    // Debug: Log a sample of the HTML around "Website" text to understand structure
    const websiteTextIndex = html.indexOf('Website');
    if (websiteTextIndex > -1) {
      const contextStart = Math.max(0, websiteTextIndex - 200);
      const contextEnd = Math.min(html.length, websiteTextIndex + 200);
      console.log(`🔍 DEBUG: HTML around "Website" text:\n${html.substring(contextStart, contextEnd)}`);
    } else {
      console.log(`🔍 DEBUG: No "Website" text found in HTML`);
    }

    // Also check for "website" lowercase
    const websiteLowerIndex = html.toLowerCase().indexOf('website');
    if (websiteLowerIndex > -1 && websiteLowerIndex !== websiteTextIndex) {
      const contextStart = Math.max(0, websiteLowerIndex - 200);
      const contextEnd = Math.min(html.length, websiteLowerIndex + 200);
      console.log(`🔍 DEBUG: HTML around "website" (lowercase):\n${html.substring(contextStart, contextEnd)}`);
    }

    // Multiple regex patterns to find the Visit Website link
    // The actual HTML structure is:
    // <a href="URL" target="_blank" class="action-item"><i ...></i>Visit Website</a>
    const patterns = [
      // Pattern 1: EXACT match for CatchDesMoines structure (href before class)
      // <a href="URL" target="_blank" class="action-item">...Visit Website...</a>
      /<a\s+href=["']([^"']+)["'][^>]*class=["']action-item["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,

      // Pattern 2: Class before href variant
      /<a\s+class=["']action-item["'][^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,

      // Pattern 3: Simple - any link with "Visit Website" text (most permissive)
      /<a\s[^>]*href=["']([^"']+)["'][^>]*>(?:[^<]*<[^>]*>)*[^<]*Visit\s*Website[^<]*(?:<[^>]*>[^<]*)*<\/a>/gi,

      // Pattern 4: href with target="_blank" (external links)
      /<a\s+href=["']([^"']+)["']\s+target=["']_blank["'][^>]*>[\s\S]*?Visit\s*Website[\s\S]*?<\/a>/gi,

      // Pattern 5: Look for action-item class and extract href (two-step approach)
      /<a[^>]+class=["'][^"']*action-item[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/gi,

      // Pattern 6: Reverse - href then action-item class
      /<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*action-item[^"']*["'][^>]*>/gi,
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
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
          console.log(`⏭️ Skipping excluded URL (pattern ${i + 1}): ${url}`);
          continue;
        }

        console.log(`✅ Found Visit Website URL (pattern ${i + 1}): ${url}`);
        return url;
      }
    }

    // Fallback 1: Look for any external URL in anchor tags on the page
    // Find all anchor hrefs and look for external ones
    const allLinksPattern = /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const externalUrls: string[] = [];
    let linkMatch;
    while ((linkMatch = allLinksPattern.exec(html)) !== null) {
      const url = linkMatch[1]?.trim();
      if (url && !isExcluded(url)) {
        externalUrls.push(url);
      }
    }

    // Priority domains for event-specific URLs (tickets, registration, etc.)
    const priorityDomains = [
      'eventbrite', 'ticketmaster', 'tickets', 'register', 'signup', 'rsvp',
      'axs.com', 'ticketfly', 'seetickets', 'stubhub', 'vivid', 'seatgeek',
      'etix', 'showclix', 'eventeny', 'universe.com', 'dice.fm', 'goelevent',
      'godrakebulldogs', 'iowaeventscenter', 'wellsfargoarena', 'prairimeadows'
    ];

    if (externalUrls.length > 0) {
      console.log(`🔍 DEBUG: Found ${externalUrls.length} external URLs on page:`);
      externalUrls.slice(0, 10).forEach((url, i) => {
        console.log(`   ${i + 1}. ${url}`);
      });

      // First priority: Look for event/ticket-specific URLs
      for (const url of externalUrls) {
        const urlLower = url.toLowerCase();
        if (priorityDomains.some(d => urlLower.includes(d))) {
          console.log(`✅ Found priority external URL: ${url}`);
          return url;
        }
      }
    } else {
      console.log(`🔍 DEBUG: No external URLs in anchor tags`);
    }

    // Fallback 2: Check for weburl/ticketUrl in embedded JSON
    // Note: weburl often contains venue website (like drake.edu), not event-specific URLs
    // So we prioritize ticketUrl, eventUrl, linkUrl first
    const weburlPatterns = [
      // High priority: Event-specific URL fields
      { pattern: /["']ticketUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'ticketUrl' },
      { pattern: /["']eventUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'eventUrl' },
      { pattern: /["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'linkUrl' },
      { pattern: /["']externalUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'externalUrl' },
      // Lower priority: General website fields (might be venue website, not event-specific)
      { pattern: /["']weburl["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'weburl' },
      { pattern: /["']web_url["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'web_url' },
      { pattern: /["']website_url["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi, name: 'website_url' },
    ];

    // Collect all JSON URLs
    const jsonUrls: { url: string; field: string }[] = [];
    for (const { pattern, name } of weburlPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1]?.trim();
        if (url && !isExcluded(url)) {
          jsonUrls.push({ url, field: name });
        }
      }
    }

    if (jsonUrls.length > 0) {
      console.log(`🔍 DEBUG: Found ${jsonUrls.length} URLs in JSON data:`);
      jsonUrls.slice(0, 5).forEach(({ url, field }, i) => {
        console.log(`   ${i + 1}. ${field}: ${url}`);
      });

      // First: Return high-priority fields (ticketUrl, eventUrl, linkUrl, externalUrl)
      for (const { url, field } of jsonUrls) {
        if (['ticketUrl', 'eventUrl', 'linkUrl', 'externalUrl'].includes(field)) {
          console.log(`✅ Found ${field} in JSON: ${url}`);
          return url;
        }
      }

      // Second: Return weburl if it looks event-specific (contains ticket, event, etc.)
      for (const { url, field } of jsonUrls) {
        const urlLower = url.toLowerCase();
        if (priorityDomains.some(d => urlLower.includes(d))) {
          console.log(`✅ Found priority ${field} in JSON: ${url}`);
          return url;
        }
      }

      // Last resort: Return the first weburl (might be venue website)
      // Only if there are NO external anchor URLs at all
      if (externalUrls.length === 0) {
        const firstUrl = jsonUrls[0];
        console.log(`✅ Using ${firstUrl.field} as fallback: ${firstUrl.url}`);
        return firstUrl.url;
      }
    }

    console.log(`⚠️ No Visit Website URL found on detail page: ${detailPageUrl}`);
    return null;
  } catch (error) {
    console.error("❌ Error extracting URL from detail page:", detailPageUrl, ":", error);
    return null;
  }
}

/**
 * Process an event URL - handles both detail pages and list pages
 * For list pages, attempts to find the detail page URL using the event title
 */
async function processEventUrl(
  eventSourceUrl: string,
  eventTitle: string
): Promise<ExtractedEventData> {
  console.log(`🔍 Processing event: "${eventTitle}"`);
  console.log(`   Source URL: ${eventSourceUrl}`);

  // Case 1: URL is already a valid detail page - extract Visit Website directly
  if (isValidEventDetailUrl(eventSourceUrl)) {
    console.log(`   ✅ URL is a valid detail page`);
    const visitUrl = await extractVisitWebsiteFromDetailPage(eventSourceUrl);
    return { visitUrl, detailPageUrl: eventSourceUrl };
  }

  // Case 2: URL is a list page - need to find the detail page first
  if (isListPageUrl(eventSourceUrl)) {
    console.log(`   📋 URL is a list page, searching for detail page...`);

    // Scrape the list page to find event detail URLs
    const result = await scrapeUrl(eventSourceUrl, {
      waitTime: 5000,  // Wait 5 seconds for dynamic content
      timeout: 30000,  // 30 second total timeout
    });

    if (!result.success || !result.html) {
      console.log(`   ❌ Failed to scrape list page: ${result.error}`);
      return { visitUrl: null, detailPageUrl: null };
    }

    const html = result.html;
    console.log(`   ✅ Scraped ${html.length} chars from list page`);

    // Extract event URLs from the list page
    const eventUrlsFromHtml = extractEventDetailUrlsFromHtml(html);

    // Try to find the detail page URL for this event
    const detailPageUrl = findEventDetailUrl(eventTitle, eventUrlsFromHtml, html);

    if (detailPageUrl) {
      console.log(`   ✅ Found detail page: ${detailPageUrl}`);
      // Now extract Visit Website from the detail page
      const visitUrl = await extractVisitWebsiteFromDetailPage(detailPageUrl);
      return { visitUrl, detailPageUrl };
    } else {
      console.log(`   ⚠️ Could not find detail page for event title`);
      return { visitUrl: null, detailPageUrl: null };
    }
  }

  // Case 3: Unknown URL format - try to extract anyway
  console.log(`   ❓ Unknown URL format, attempting extraction...`);
  const visitUrl = await extractVisitWebsiteFromDetailPage(eventSourceUrl);
  return { visitUrl, detailPageUrl: eventSourceUrl };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const batchSize = Math.min(Math.max(body.batchSize || 20, 1), 50); // Min 1, max 50, default 20
      const dryRun = body.dryRun === true; // Dry run mode - extract URLs but don't update DB

      console.log(
        `Processing batch of ${batchSize} events (dry run: ${dryRun})`
      );

      // Get current date for filtering future events only
      const now = new Date().toISOString();
      console.log(`📅 Filtering for events with date >= ${now}`);

      // Get all catchdesmoines URLs for future events
      // We fetch more than needed to allow filtering and randomization
      const { data: allEvents, error: fetchError } = await supabaseClient
        .from("events")
        .select("id, title, source_url, date")
        .ilike("source_url", "%catchdesmoines.com%")
        .gte("date", now) // Only future events
        .order('date', { ascending: true }); // Soonest events first

      if (fetchError) {
        throw new Error(`Failed to fetch events: ${fetchError.message}`);
      }

      if (!allEvents || allEvents.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            processed: 0,
            errors: [],
            updated: [],
            skipped: [],
            message: "No future events with catchdesmoines.com URLs found",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log(`📊 Found ${allEvents.length} future events with catchdesmoines URLs`);

      // Filter out list page URLs (can't extract Visit Website from list pages)
      // Valid detail pages have pattern: /event/slug/id/ (singular with numeric ID)
      // List pages are: /events/ or /events? (plural)
      const detailPageEvents = allEvents.filter(event => {
        const url = event.source_url?.toLowerCase() || '';

        // Must contain /event/ (singular) with a numeric ID segment
        // Pattern: /event/something/12345/
        const isDetailPage = /\/event\/[^\/]+\/\d+\/?(\?|$)/i.test(url);

        // Exclude pure list pages like /events/ or /events?
        const isListPage = /\/events\/?(\?|#|$)/i.test(url) && !isDetailPage;

        if (isListPage) {
          console.log(`⏭️ Skipping list page URL: ${event.source_url}`);
        }

        return isDetailPage;
      });

      console.log(`📊 After filtering: ${detailPageEvents.length} valid detail page events`);

      if (detailPageEvents.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            processed: 0,
            errors: [],
            updated: [],
            skipped: allEvents.map(e => ({ eventId: e.id, reason: "URL is a list page, not a detail page" })),
            message: "All catchdesmoines URLs are list pages (not detail pages with Visit Website links)",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Shuffle the events array for true randomization
      // Fisher-Yates shuffle algorithm
      const shuffledEvents = [...detailPageEvents];
      for (let i = shuffledEvents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledEvents[i], shuffledEvents[j]] = [shuffledEvents[j], shuffledEvents[i]];
      }

      // Take the first batchSize events from the shuffled array
      const events = shuffledEvents.slice(0, batchSize);
      console.log(`🎲 Randomly selected ${events.length} events from ${detailPageEvents.length} valid events`);

      const result: ExtractResponse = {
        success: true,
        processed: events.length,
        errors: [],
        updated: [],
        skipped: [],
      };

      console.log(
        `Processing ${events.length} events with catchdesmoines.com URLs... ${
          dryRun ? "(DRY RUN - no database changes)" : ""
        }`
      );

      // Process each event
      for (const event of events) {
        try {
          // Process the event URL (handles both detail and list pages)
          const extractedData = await processEventUrl(
            event.source_url,
            event.title || ""
          );

          if (extractedData.visitUrl) {
            // Successfully extracted an external Visit Website URL
            if (dryRun) {
              // Dry run mode - don't update database, just report what would be changed
              result.updated.push({
                eventId: event.id,
                oldUrl: event.source_url,
                newUrl: extractedData.visitUrl,
              });
              console.log(
                `🔍 [DRY RUN] Would update event "${event.title}": ${event.source_url} -> ${extractedData.visitUrl}`
              );
            } else {
              // Real mode - update the event with the new URL
              const { error: updateError } = await supabaseClient
                .from("events")
                .update({ source_url: extractedData.visitUrl })
                .eq("id", event.id);

              if (updateError) {
                result.errors.push({
                  eventId: event.id,
                  error: `Failed to update: ${updateError.message}`,
                });
              } else {
                result.updated.push({
                  eventId: event.id,
                  oldUrl: event.source_url,
                  newUrl: extractedData.visitUrl,
                });
                console.log(
                  `✅ Updated event "${event.title}": ${event.source_url} -> ${extractedData.visitUrl}`
                );
              }
            }
          } else if (extractedData.detailPageUrl && extractedData.detailPageUrl !== event.source_url) {
            // No external URL found, but we found a better CatchDesMoines detail page URL
            // Update to the detail page instead of keeping the list page
            if (dryRun) {
              result.updated.push({
                eventId: event.id,
                oldUrl: event.source_url,
                newUrl: extractedData.detailPageUrl,
              });
              console.log(
                `🔍 [DRY RUN] Would update to detail page "${event.title}": ${event.source_url} -> ${extractedData.detailPageUrl}`
              );
            } else {
              const { error: updateError } = await supabaseClient
                .from("events")
                .update({ source_url: extractedData.detailPageUrl })
                .eq("id", event.id);

              if (updateError) {
                result.errors.push({
                  eventId: event.id,
                  error: `Failed to update to detail page: ${updateError.message}`,
                });
              } else {
                result.updated.push({
                  eventId: event.id,
                  oldUrl: event.source_url,
                  newUrl: extractedData.detailPageUrl,
                });
                console.log(
                  `✅ Updated to detail page "${event.title}": ${event.source_url} -> ${extractedData.detailPageUrl}`
                );
              }
            }
          } else {
            // Could not find any better URL
            result.skipped.push({
              eventId: event.id,
              reason: "No external URL or detail page found",
            });
          }

          // Add small delay between requests to be respectful
          await new Promise((resolve) => setTimeout(resolve, 800));
        } catch (error) {
          result.errors.push({
            eventId: event.id,
            error: `Processing failed: ${error.message}`,
          });
        }
      }

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET") {
      const now = new Date().toISOString();

      // Get all catchdesmoines URLs for future events to provide detailed stats
      const { data: allEvents, error: fetchError } = await supabaseClient
        .from("events")
        .select("id, source_url")
        .ilike("source_url", "%catchdesmoines.com%")
        .gte("date", now);

      if (fetchError) {
        throw new Error(`Failed to fetch events: ${fetchError.message}`);
      }

      const futureEvents = allEvents || [];

      // Filter to count only valid detail page URLs
      const detailPageEvents = futureEvents.filter(event => {
        const url = event.source_url?.toLowerCase() || '';
        return /\/event\/[^\/]+\/\d+\/?(\?|$)/i.test(url);
      });

      // Count list page URLs
      const listPageEvents = futureEvents.filter(event => {
        const url = event.source_url?.toLowerCase() || '';
        const isDetailPage = /\/event\/[^\/]+\/\d+\/?(\?|$)/i.test(url);
        return /\/events\/?(\?|#|$)/i.test(url) && !isDetailPage;
      });

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            futureEventsTotal: futureEvents.length,
            validDetailPages: detailPageEvents.length,
            listPagesSkipped: listPageEvents.length,
            readyToProcess: detailPageEvents.length,
          },
          message: `${detailPageEvents.length} future events with valid detail page URLs ready for processing`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
