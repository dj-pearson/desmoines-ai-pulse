import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

interface ExtractedEventData {
  visitUrl: string | null;
  dateStr: string | null;
  timeStr: string | null;
}

async function extractVisitWebsiteUrl(
  eventUrl: string
): Promise<ExtractedEventData> {
  try {
    console.log("Processing URL:", eventUrl);

    // Use fetch with user agent to simulate browser request
    const response = await fetch(eventUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        Connection: "keep-alive",
      },
      signal: AbortSignal.timeout(12000), // 12 second timeout
    });

    if (!response.ok) {
      console.warn(
        `Non-2xx response for ${eventUrl}: ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

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
        console.log("Found date:", dateStr);
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
        console.log("Found time:", timeStr);
        break;
      }
    }

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
      "player.vimeo",
      "youtube.com/embed",
      "youtube.com/player",
      "youtube.com/watch",
      "youtu.be/player",
      "/player.js",
      "/embed.js",
      "/api/",
      ".js?",
      ".js#",
      ".js$",
      ".css",
      ".json",
      "cloudflare.com",
      "cdnjs.cloudflare.com",
      "static.cloudflareinsights.com",
      "unpkg.com",
      "jsdelivr.net",
      "cdn.jsdelivr.net",
      "bootstrapcdn.com",
      "stackpath.bootstrapcdn.com",
      "fontawesome.com",
      "kit.fontawesome.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "gstatic.com",
      "ajax.googleapis.com",
      "typekit.net",
      "use.typekit.net",
      "facebook.com",
      "fb.com",
      "twitter.com",
      "x.com",
      "instagram.com",
      "youtube.com",
      "youtu.be",
      "tiktok.com",
      "linkedin.com",
      "pinterest.com",
      "reddit.com",
      "snapchat.com",
      "whatsapp.com",
      "telegram.org",
      "discord.com",
      "googletagmanager.com",
      "google-analytics.com",
      "analytics.google.com",
      "doubleclick.net",
      "securepubads",
      "googlesyndication.com",
      "adservice.google.com",
      "googleadservices.com",
      "2mdn.net",
      "googleads.g.doubleclick.net",
      "pagead2.googlesyndication.com",
      "google.com",
      "maps.google.com",
      "goo.gl",
      "bit.ly",
      "ow.ly",
      "mailto:",
      "tel:",
      "#",
    ];

    const isExcluded = (url: string) =>
      excludeDomains.some((d) => url.toLowerCase().includes(d.toLowerCase()));

    // Use DOMParser to properly parse HTML (available in Deno)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    if (!doc) {
      console.error("Failed to parse HTML");
      return { visitUrl: null, dateStr, timeStr };
    }

    console.log("Successfully parsed HTML document");

    // Strategy: Find all anchor tags and check their text content for "Visit Website"
    const allAnchors = doc.querySelectorAll("a");
    console.log(`Found ${allAnchors.length} total anchor tags on page`);

    let foundCount = 0;
    for (const anchor of allAnchors) {
      const href = anchor.getAttribute("href");
      const textContent = anchor.textContent?.trim().toLowerCase() || "";
      
      // Check if this anchor contains "visit website" text
      if (textContent.includes("visit") && textContent.includes("website")) {
        foundCount++;
        console.log(`Found potential "Visit Website" link #${foundCount}: href="${href}", text="${textContent}"`);
        
        if (!href) {
          console.log("  ⏭️ Skipped: no href attribute");
          continue;
        }

        // Normalize URL
        let normalizedUrl = href.trim();
        if (normalizedUrl.startsWith("//")) {
          normalizedUrl = `https:${normalizedUrl}`;
        } else if (normalizedUrl.startsWith("/")) {
          // Relative URL - make absolute
          const baseUrl = new URL(eventUrl);
          normalizedUrl = `${baseUrl.origin}${normalizedUrl}`;
        }

        // Check if it's a valid external URL
        if (!normalizedUrl.match(/^https?:\/\//i)) {
          console.log(`  ⏭️ Skipped: not an http(s) URL: ${normalizedUrl}`);
          continue;
        }

        // Check if URL is excluded
        if (isExcluded(normalizedUrl)) {
          console.log(`  ⏭️ Skipped: excluded domain: ${normalizedUrl}`);
          continue;
        }

        console.log(`  ✅ Found valid "Visit Website" URL: ${normalizedUrl}`);
        return { visitUrl: normalizedUrl, dateStr, timeStr };
      }
    }

    console.log(`⚠️ No valid "Visit Website" link found (checked ${foundCount} potential matches out of ${allAnchors.length} total anchors)`);
    
    // Fallback: Check for linkUrl in JSON embedded in the page
    const linkUrlMatch = html.match(
      /["']linkUrl["']\s*:\s*["'](https?:\/\/[^"']+)["']/i
    );
    if (linkUrlMatch) {
      const url = linkUrlMatch[1].trim();
      if (!isExcluded(url)) {
        console.log("✅ Found linkUrl in JSON:", url);
        return { visitUrl: url, dateStr, timeStr };
      }
    }

    return { visitUrl: null, dateStr, timeStr };
  } catch (error) {
    console.error("Error extracting URL from", eventUrl, ":", error);
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
      console.log(`Total catchdesmoines events: ${totalEvents}`);

      // Generate random offset to get different events each time
      const maxOffset = Math.max(0, totalEvents - batchSize);
      const randomOffset = Math.floor(Math.random() * (maxOffset + 1));
      console.log(`Using random offset: ${randomOffset}`);

      // Get random batch of events with catchdesmoines.com URLs
      const { data: events, error: fetchError } = await supabaseClient
        .from("events")
        .select("id, title, source_url")
        .ilike("source_url", "%catchdesmoines.com%")
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
            // Prepare update data
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
                  `Parsed event datetime for ${
                    event.id
                  }: ${parsedDate.toISOString()}`
                );
              } else {
                console.warn(
                  `Failed to parse datetime for event ${event.id}: ${extractedData.dateStr} ${extractedData.timeStr}`
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
                `[DRY RUN] Would update event ${event.id}: ${
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
                  `Updated event ${event.id}: ${event.source_url} -> ${
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
