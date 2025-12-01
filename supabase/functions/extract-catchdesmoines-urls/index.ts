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
}

/**
 * Parse event date/time string and convert from Central Time to UTC
 * Uses proper timezone offset detection for CST/CDT
 */
function parseEventDateTime(dateStr: string, timeStr?: string): Date | null {
  try {
    console.log("Parsing datetime:", { dateStr, timeStr });

    // Parse date components
    const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) {
      console.error("Invalid date format:", dateStr);
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
    const isDST =
      (monthNum > 3 && monthNum < 11) ||
      (monthNum === 3 && dayNum >= 8) ||
      (monthNum === 11 && dayNum < 7);

    const offset = isDST ? "-05:00" : "-06:00";

    // Build ISO string with Central timezone
    const isoWithTimezone = `${year}-${month}-${day}T${String(hours).padStart(
      2,
      "0"
    )}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}${offset}`;

    console.log("Built ISO string:", isoWithTimezone);

    // Parse to Date (browser will convert to UTC internally)
    const date = new Date(isoWithTimezone);

    if (isNaN(date.getTime())) {
      console.error("Invalid date result:", isoWithTimezone);
      return null;
    }

    console.log("Parsed to UTC:", date.toISOString());
    return date;
  } catch (error) {
    console.error("Error parsing datetime:", error);
    return null;
  }
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

interface ExtractedEventData {
  visitUrl: string | null;
  dateStr: string | null;
  timeStr: string | null;
}

/**
 * Extract Visit Website URL using the same logic as firecrawl-scraper
 * Uses the shared scraper module for JS-rendered content
 */
async function extractVisitWebsiteUrl(
  eventUrl: string
): Promise<ExtractedEventData> {
  try {
    console.log("🔗 Processing URL with scrapeUrl:", eventUrl);

    // Use the shared scraper (supports Browserless/Firecrawl for JS rendering)
    const result = await scrapeUrl(eventUrl, {
      waitTime: 3000,
      timeout: 15000,
    });

    if (!result.success || !result.html) {
      console.log(`❌ Failed to fetch page: ${result.error}`);
      return { visitUrl: null, dateStr: null, timeStr: null };
    }

    const html = result.html;
    console.log(`✅ Scraped ${html.length} chars from page`);

    // Extract date/time information
    let dateStr: string | null = null;
    let timeStr: string | null = null;

    const datePatterns = [
      /<time[^>]*datetime=["']([^"']+)["']/i,
      /<meta[^>]*property=["']event:start_date["'][^>]*content=["']([^"']+)["']/i,
      /<span[^>]*class=["'][^"']*date[^"']*["'][^>]*>([^<]+)</i,
      /Date:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/,
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        dateStr = match[1];
        console.log("📅 Found date:", dateStr);
        break;
      }
    }

    const timePatterns = [
      /<time[^>]*>([^<]*\d{1,2}:\d{2}[^<]*)<\/time>/i,
      /Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      /(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
    ];

    for (const pattern of timePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        timeStr = match[1];
        console.log("🕐 Found time:", timeStr);
        break;
      }
    }

    // Check if URL is excluded
    const isExcluded = (url: string) =>
      EXCLUDED_DOMAINS.some(d => url.toLowerCase().includes(d.toLowerCase()));

    // Multiple regex patterns to find the Visit Website link - SAME AS firecrawl-scraper
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
        return { visitUrl: url, dateStr, timeStr };
      }
    }

    // Fallback: Check for linkUrl in embedded JSON
    const linkUrlMatch = html.match(/["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    if (linkUrlMatch) {
      const url = linkUrlMatch[1].trim();
      if (!isExcluded(url)) {
        console.log(`✅ Found linkUrl in JSON: ${url}`);
        return { visitUrl: url, dateStr, timeStr };
      }
    }

    console.log(`⚠️ No Visit Website URL found for: ${eventUrl}`);
    return { visitUrl: null, dateStr, timeStr };
  } catch (error) {
    console.error("❌ Error extracting URL from", eventUrl, ":", error);
    return { visitUrl: null, dateStr: null, timeStr: null };
  }
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

      // Get total count of catchdesmoines URLs for randomization
      const { count: totalCount, error: countError } = await supabaseClient
        .from("events")
        .select("id", { count: "exact", head: true })
        .ilike("source_url", "%catchdesmoines.com%");

      if (countError) {
        throw new Error(`Failed to count events: ${countError.message}`);
      }

      const totalEvents = totalCount || 0;
      console.log(`📊 Total catchdesmoines events in pool: ${totalEvents}`);

      // Generate random offset to get different events each time
      const maxOffset = Math.max(0, totalEvents - batchSize);
      const randomOffset = Math.floor(Math.random() * (maxOffset + 1));
      console.log(`🎲 Using random offset: ${randomOffset} of max ${maxOffset}`);

      // Get random batch of events with catchdesmoines.com URLs
      const { data: events, error: fetchError } = await supabaseClient
        .from("events")
        .select("id, title, source_url")
        .ilike("source_url", "%catchdesmoines.com%")
        .order('created_at', { ascending: false }) // Newest first to prioritize recent imports
        .range(randomOffset, randomOffset + batchSize - 1);

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
            message: "No events with catchdesmoines.com URLs found",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const result: ExtractResponse = {
        success: true,
        processed: events.length,
        errors: [],
        updated: [],
      };

      console.log(
        `Processing ${events.length} events with catchdesmoines.com URLs... ${
          dryRun ? "(DRY RUN - no database changes)" : ""
        }`
      );

      // Process each event
      for (const event of events) {
        try {
          const extractedData = await extractVisitWebsiteUrl(event.source_url);

          if (extractedData.visitUrl) {
            // Prepare update data - replace source_url with extracted external URL
            const updateData: any = { source_url: extractedData.visitUrl };

            // If we extracted datetime info, parse and update event_start_utc
            if (extractedData.dateStr) {
              const parsedDate = parseEventDateTime(
                extractedData.dateStr,
                extractedData.timeStr || undefined
              );
              if (parsedDate) {
                updateData.event_start_utc = parsedDate.toISOString();
                console.log(
                  `📅 Parsed event datetime for ${
                    event.id
                  }: ${parsedDate.toISOString()}`
                );
              } else {
                console.warn(
                  `⚠️ Failed to parse datetime for event ${event.id}: ${extractedData.dateStr} ${extractedData.timeStr}`
                );
              }
            }

            if (dryRun) {
              // Dry run mode - don't update database, just report what would be changed
              result.updated.push({
                eventId: event.id,
                oldUrl: event.source_url,
                newUrl: extractedData.visitUrl,
              });
              console.log(
                `🔍 [DRY RUN] Would update event "${event.title}": ${
                  event.source_url
                } -> ${extractedData.visitUrl}${
                  updateData.event_start_utc
                    ? ` (datetime: ${updateData.event_start_utc})`
                    : ""
                }`
              );
            } else {
              // Real mode - update the event with the new URL and potentially datetime
              const { error: updateError } = await supabaseClient
                .from("events")
                .update(updateData)
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
                  `✅ Updated event "${event.title}": ${event.source_url} -> ${
                    extractedData.visitUrl
                  }${
                    updateData.event_start_utc
                      ? ` (datetime: ${updateData.event_start_utc})`
                      : ""
                  }`
                );
              }
            }
          } else {
            result.errors.push({
              eventId: event.id,
              error: "No external URL found on page",
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
      // Return count of remaining catchdesmoines URLs
      const { count, error: countError } = await supabaseClient
        .from("events")
        .select("id", { count: "exact", head: true })
        .ilike("source_url", "%catchdesmoines.com%");

      if (countError) {
        throw new Error(`Failed to count events: ${countError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          remaining: count || 0,
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
