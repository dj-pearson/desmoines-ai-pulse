import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger-source, x-endpoint",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface ScrapingJob {
  id: string;
  name: string;
  status: string;
  config: {
    url: string;
    selectors: {
      title: string;
      description: string;
      date: string;
      location: string;
      price?: string;
      category?: string;
    };
    schedule: string;
    isActive: boolean;
  };
  last_run?: string;
  events_found?: number;
}

interface ScrapedEvent {
  title: string;
  original_description: string;
  date: Date;
  location: string;
  venue: string;
  category: string;
  price: string;
  source_url: string;
  is_featured: boolean;
  enhanced_description?: string;
  is_enhanced?: boolean;
  fingerprint?: string;
}

interface ExistingEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  source_url: string;
  fingerprint?: string;
}

// Generate a unique fingerprint for an event to detect duplicates
function generateEventFingerprint(event: {
  title: string;
  date: Date;
  venue: string;
  source_url: string;
}): string {
  // Normalize the data for consistent comparison
  const normalizedTitle = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove special chars and spaces
    .substring(0, 50); // Limit length

  const normalizedVenue = event.venue
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 30);

  const dateString = event.date.toISOString().split("T")[0]; // YYYY-MM-DD format
  const domain = event.source_url.replace(/^https?:\/\//, "").split("/")[0];

  return `${normalizedTitle}_${dateString}_${normalizedVenue}_${domain}`;
}

// Check if an event is likely a duplicate based on multiple criteria
function isDuplicateEvent(
  newEvent: ScrapedEvent,
  existingEvents: ExistingEvent[]
): { isDuplicate: boolean; reason?: string; existingEvent?: ExistingEvent } {
  for (const existing of existingEvents) {
    // 1. Exact fingerprint match (most reliable)
    if (
      newEvent.fingerprint &&
      existing.fingerprint &&
      newEvent.fingerprint === existing.fingerprint
    ) {
      return {
        isDuplicate: true,
        reason: "exact_fingerprint_match",
        existingEvent: existing,
      };
    }

    // 2. Same source URL, same date, similar title
    if (existing.source_url === newEvent.source_url) {
      const existingDate = new Date(existing.date);
      const sameDate =
        existingDate.toDateString() === newEvent.date.toDateString();

      if (sameDate) {
        // Calculate title similarity (simple approach)
        const titleSimilarity = calculateTitleSimilarity(
          newEvent.title,
          existing.title
        );

        if (titleSimilarity > 0.8) {
          // 80% similar
          return {
            isDuplicate: true,
            reason: "same_source_date_similar_title",
            existingEvent: existing,
          };
        }
      }
    }

    // 3. Same title, same venue, date within 1 day (for recurring events)
    const titleMatch =
      newEvent.title.toLowerCase().trim() ===
      existing.title.toLowerCase().trim();
    const venueMatch =
      newEvent.venue.toLowerCase().trim() ===
      existing.venue.toLowerCase().trim();

    if (titleMatch && venueMatch) {
      const existingDate = new Date(existing.date);
      const timeDiff = Math.abs(
        newEvent.date.getTime() - existingDate.getTime()
      );
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // If same title/venue and within 24 hours, likely duplicate
      if (hoursDiff < 24) {
        return {
          isDuplicate: true,
          reason: "same_title_venue_within_24h",
          existingEvent: existing,
        };
      }
    }
  }

  return { isDuplicate: false };
}

// Simple title similarity calculation using character overlap
function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm1 = normalize(title1);
  const norm2 = normalize(title2);

  if (norm1.length === 0 || norm2.length === 0) return 0;

  // Simple character overlap ratio
  const minLength = Math.min(norm1.length, norm2.length);
  const maxLength = Math.max(norm1.length, norm2.length);

  let matches = 0;
  for (let i = 0; i < minLength; i++) {
    if (norm1[i] === norm2[i]) matches++;
  }

  return matches / maxLength;
}

// Check if we should skip scraping a job based on recent scraping history
function shouldSkipJobScraping(
  job: ScrapingJob,
  isAdminDashboard = false
): {
  skip: boolean;
  reason?: string;
} {
  // If triggered from admin dashboard, allow more frequent scraping
  if (isAdminDashboard) {
    if (!job.last_run) {
      return { skip: false }; // Never scraped before
    }

    const lastRun = new Date(job.last_run);
    const now = new Date();
    const minutesSinceLastRun =
      (now.getTime() - lastRun.getTime()) / (1000 * 60);

    // For admin dashboard, only skip if scraped within last 30 seconds
    if (minutesSinceLastRun < 0.5) {
      return {
        skip: true,
        reason: `Too recent - last scraped ${minutesSinceLastRun.toFixed(
          1
        )} minutes ago`,
      };
    }

    return { skip: false };
  }

  if (!job.last_run) {
    return { skip: false }; // Never scraped before
  }

  const lastRun = new Date(job.last_run);
  const now = new Date();
  const hoursSinceLastRun =
    (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

  // Skip if scraped within last 15 minutes and found events (reduced from 2 hours)
  if (hoursSinceLastRun < 0.25 && (job.events_found || 0) > 0) {
    return {
      skip: true,
      reason: `Recently scraped ${hoursSinceLastRun.toFixed(1)}h ago with ${
        job.events_found
      } events found`,
    };
  }

  // Skip if scraped within last 5 minutes regardless of results (reduced from 30 minutes)
  if (hoursSinceLastRun < 0.083) {
    return {
      skip: true,
      reason: `Too recent - last scraped ${(hoursSinceLastRun * 60).toFixed(
        0
      )} minutes ago`,
    };
  }

  return { skip: false };
}

// Simple HTML parser for extracting text content from HTML strings
function extractTextFromHTML(html: string): string {
  // Remove script and style elements
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove HTML tags
  html = html.replace(/<[^>]*>/g, " ");

  // Decode HTML entities
  html = html.replace(/&nbsp;/g, " ");
  html = html.replace(/&amp;/g, "&");
  html = html.replace(/&lt;/g, "<");
  html = html.replace(/&gt;/g, ">");
  html = html.replace(/&quot;/g, '"');
  html = html.replace(/&#39;/g, "'");

  // Clean up whitespace
  html = html.replace(/\s+/g, " ").trim();

  return html;
}

// Basic CSS selector matching for simple selectors
function querySelectorText(html: string, selector: string): string {
  try {
    // Handle multiple selectors separated by comma
    const selectors = selector.split(",").map((s) => s.trim());

    for (const sel of selectors) {
      // Simple class selector (.class-name)
      if (sel.startsWith(".")) {
        const className = sel.substring(1);
        const classRegex = new RegExp(
          `class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)(?=<\/[^>]*>)`,
          "i"
        );
        const match = html.match(classRegex);
        if (match && match[1]) {
          return extractTextFromHTML(match[1]);
        }
      }

      // Simple tag selector (h1, h2, etc.)
      if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(sel)) {
        const tagRegex = new RegExp(
          `<${sel}[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)(?=<\/${sel}>)`,
          "i"
        );
        const match = html.match(tagRegex);
        if (match && match[1]) {
          return extractTextFromHTML(match[1]);
        }
      }

      // Time element with datetime attribute
      if (sel.includes("time[datetime]")) {
        const timeRegex =
          /<time[^>]*datetime="([^"]*)"[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)<\/time>/i;
        const match = html.match(timeRegex);
        if (match && match[2]) {
          return extractTextFromHTML(match[2]);
        }
      }
    }

    return "";
  } catch (error) {
    console.error("Error parsing selector:", selector, error);
    return "";
  }
}

// Use Firecrawl to scrape events for a job
async function scrapeJobWithFirecrawl(
  job: ScrapingJob,
  supabase: any
): Promise<{ success: boolean; eventsFound: number; errors: string[] }> {
  try {
    console.log(
      `🚀 Starting Firecrawl scrape for job: ${job.name} - ${job.config.url}`
    );

    // Call the firecrawl-scraper function
    const { data, error } = await supabase.functions.invoke(
      "firecrawl-scraper",
      {
        body: {
          url: job.config.url,
          category: job.config.category || "General",
          maxPages: job.config.maxPages || 3,
        },
      }
    );

    if (error) {
      console.error(`❌ Firecrawl error for ${job.name}:`, error);
      return {
        success: false,
        eventsFound: 0,
        errors: [error.message || "Firecrawl error"],
      };
    }

    if (data?.success) {
      console.log(
        `✅ Firecrawl completed for ${job.name}: ${data.inserted} new, ${data.updated} updated`
      );
      return {
        success: true,
        eventsFound: data.inserted + data.updated,
        errors: data.errors > 0 ? [`${data.errors} processing errors`] : [],
      };
    } else {
      return {
        success: false,
        eventsFound: 0,
        errors: [data?.error || "Unknown error"],
      };
    }
  } catch (error) {
    console.error(`❌ Error scraping job ${job.name}:`, error);
    return { success: false, eventsFound: 0, errors: [error.message] };
  }
}

// Enhanced AI-powered event extraction from website HTML (fallback)
async function extractMultipleEventsWithAI(
  html: string,
  job: ScrapingJob,
  claudeApiKey?: string
): Promise<ScrapedEvent[]> {
  if (!claudeApiKey) {
    console.log("No Claude API key available for AI event extraction");
    return [];
  }

  try {
    console.log(`🤖 Using AI fallback extraction for ${job.name}`);

    // Extract relevant sections that might contain event data
    const relevantHtml = extractRelevantHTMLSnippets(html);

    const prompt = `Extract all individual events from this HTML content from ${job.config.url}.

IMPORTANT TIMEZONE INSTRUCTIONS:
- All events are in Des Moines, Iowa (Central Time Zone)
- Convert all times to Central Time (CDT in summer, CST in winter)
- If no specific time is mentioned, assume 7:00 PM Central Time for evening events
- For all-day events, use 12:00 PM Central Time
- Include both date AND time in your response when possible

HTML CONTENT:
${relevantHtml}

Please analyze this HTML and extract ALL individual events you can find. For each event, provide:
- title: The event name/title
- description: Brief description or details
- date: Date in YYYY-MM-DD format (Central Time)
- time: Time in format like "7:00 PM" (Central Time) - default to "7:00 PM" if not specified
- location: Venue or location
- price: Ticket price or cost (if mentioned)
- category: Type of event (sports, music, entertainment, etc.)

Format your response as a JSON array of events:
[
  {
    "title": "Event Title",
    "description": "Event description",
    "date": "2025-07-30",
    "time": "7:00 PM",
    "location": "venue/location", 
    "price": "price if found, 'See website' if not",
    "category": "event category"
  }
]

TIMEZONE CONVERSION EXAMPLES:
- "July 30, 2025 at 8 PM" → date: "2025-07-30", time: "8:00 PM"
- "Wed, Jul 30" → date: "2025-07-30", time: "7:00 PM" (default)
- "7/30/25 7:30pm" → date: "2025-07-30", time: "7:30 PM"

Only include actual events, not navigation items, headers, or generic text. If no events are found, return an empty array [].`;

    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-0",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (claudeResponse.ok) {
      const claudeData = await claudeResponse.json();
      const responseText = claudeData.content?.[0]?.text?.trim();

      if (responseText) {
        try {
          // Extract JSON from the response
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const extractedEvents = JSON.parse(jsonMatch[0]);
            console.log(
              `🤖 AI extracted ${extractedEvents.length} events from ${job.name}`
            );

            // Convert to ScrapedEvent objects
            const scrapedEvents: ScrapedEvent[] = [];
            const now = new Date();

            for (const event of extractedEvents) {
              if (!event.title || event.title.trim().length === 0) continue;

              // Enhanced date/time parsing with timezone awareness
              let eventDate: Date;
              if (event.date && event.date !== "null") {
                // Parse the date
                eventDate = new Date(event.date);
                if (isNaN(eventDate.getTime())) {
                  // If date parsing fails, use a future date
                  eventDate = new Date();
                  eventDate.setDate(eventDate.getDate() + 7);
                }

                // Add time if provided, otherwise default to 7:00 PM
                if (event.time && event.time !== "null") {
                  eventDate = addTimeToDateEnhanced(eventDate, event.time);
                } else {
                  eventDate.setHours(19, 0, 0, 0); // 7:00 PM default
                }

                // Convert to proper Central Time timezone
                eventDate = convertToCentralTimeEnhanced(eventDate);
              } else {
                // Default to one week from now at 7:00 PM CDT
                eventDate = new Date();
                eventDate.setDate(eventDate.getDate() + 7);
                eventDate.setHours(19, 0, 0, 0); // 7:00 PM
                eventDate = convertToCentralTimeEnhanced(eventDate);
              }

              const scrapedEvent: ScrapedEvent = {
                title: event.title.substring(0, 200),
                original_description: (
                  event.description || `Event from ${job.name}`
                ).substring(0, 500),
                date: eventDate,
                event_start_local: eventDate ? eventDate.toISOString().replace('Z', '') : null,
                event_timezone: "America/Chicago",
                event_start_utc: eventDate,
                location: (event.location || "Des Moines, IA").substring(
                  0,
                  100
                ),
                venue: (event.location || "Des Moines, IA").substring(0, 100),
                category: (event.category || "General").substring(0, 50),
                price: (event.price || "See website").substring(0, 50),
                source_url: job.config.url,
                is_featured: Math.random() > 0.8, // 20% chance of being featured
              };

              console.log(
                `🕐 AI Event: ${
                  scrapedEvent.title
                } scheduled for ${scrapedEvent.date.toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })} CDT`
              );

              scrapedEvents.push(scrapedEvent);
            }

            return scrapedEvents;
          }
        } catch (parseError) {
          console.log(`⚠️ Could not parse AI response JSON:`, parseError);
        }
      }
    } else {
      console.log(`⚠️ Claude API error: ${claudeResponse.status}`);
    }
  } catch (error) {
    console.error(`❌ Error in AI event extraction:`, error);
  }

  return [];
}
function extractEventData(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
  source_url: string;
} {
  const url = job.config.url.toLowerCase();

  // Site-specific extraction logic
  if (url.includes("catchdesmoines.com")) {
    return extractCatchDesMoinesEvent(html, job);
  } else if (url.includes("iowacubs.com") || url.includes("milb.com/iowa")) {
    return extractIowaCubsEvent(html, job);
  } else if (url.includes("iowa.gleague.nba.com")) {
    return extractIowaWolvesEvent(html, job);
  } else if (url.includes("iowawild.com")) {
    return extractIowaWildEvent(html, job);
  } else if (url.includes("theiowabarnstormers.com")) {
    return extractIowaBarnstormersEvent(html, job);
  } else if (url.includes("iowaeventscenter.com")) {
    return extractIowaEventsCenterEvent(html, job);
  } else if (url.includes("vibrantmusichall.com")) {
    return extractVibrantMusicHallEvent(html, job);
  } else {
    return extractGenericEvent(html, job);
  }
}

function extractCatchDesMoinesEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
  source_url: string;
} {
  console.log(`🔍 Catch Des Moines HTML preview: ${html.substring(0, 500)}...`);

  // Try multiple approaches for finding event titles
  let title =
    querySelectorText(html, ".event-title") ||
    querySelectorText(html, ".title") ||
    querySelectorText(html, "h1") ||
    querySelectorText(html, "h2") ||
    querySelectorText(html, ".card-title") ||
    querySelectorText(html, "[data-title]") ||
    querySelectorText(html, ".event-name");

  console.log(`🔍 Catch Des Moines found title: "${title}"`);

  // If no title found, try to extract from page title or meta tags
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = extractTextFromHTML(titleMatch[1]);
      // Clean up title (remove site name)
      title = title.replace(/\s*-\s*Catch Des Moines.*$/i, "").trim();
    }
  }

  // Try multiple approaches for descriptions
  const description =
    querySelectorText(html, ".event-description") ||
    querySelectorText(html, ".description") ||
    querySelectorText(html, ".summary") ||
    querySelectorText(html, ".excerpt") ||
    querySelectorText(html, ".content") ||
    querySelectorText(html, "p");

  console.log(
    `🔍 Catch Des Moines found description: "${description?.substring(
      0,
      100
    )}..."`
  );

  const location =
    querySelectorText(html, ".event-location") ||
    querySelectorText(html, ".location") ||
    querySelectorText(html, ".venue") ||
    querySelectorText(html, ".address") ||
    "Des Moines, IA";

  const price =
    querySelectorText(html, ".price") ||
    querySelectorText(html, ".cost") ||
    querySelectorText(html, ".admission") ||
    querySelectorText(html, ".ticket-price") ||
    "See website";

  const category =
    querySelectorText(html, ".category") ||
    querySelectorText(html, ".event-type") ||
    querySelectorText(html, ".tag") ||
    "Community Event";

  // Enhanced date extraction with multiple approaches
  const date =
    extractValidDate(html, ".event-date") ||
    extractValidDate(html, ".date") ||
    extractValidDate(html, "time") ||
    extractValidDate(html, "[datetime]") ||
    extractValidDate(html, ".when");

  console.log(`🔍 Catch Des Moines found date: ${date}`);

  // Extract external event URL from "Visit Website" button
  let externalUrl = "";
  
  // Enhanced regex to match the specific HTML structure with action-item class and Visit Website text
  const visitWebsitePatterns = [
    // Pattern 1: Exact match for the provided structure
    /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*action-item[^"']*["'][^>]*>.*?Visit Website.*?<\/a>/is,
    // Pattern 2: Reverse order (class before href)
    /<a[^>]*class=["'][^"']*action-item[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>.*?Visit Website.*?<\/a>/is,
    // Pattern 3: More flexible matching
    /<a[^>]*class=["']action-item["'][^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?Visit Website[\s\S]*?<\/a>/i,
    // Pattern 4: Original pattern as fallback
    /<a[^>]*class=["']action-item["'][^>]*href=["']([^"']+)["'][^>]*>\s*Visit Website\s*<\/a>/i
  ];
  
  console.log(`🔍 Looking for Visit Website button in HTML...`);
  
  for (const pattern of visitWebsitePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      externalUrl = match[1];
      console.log(`✅ Found Visit Website URL: ${externalUrl}`);
      break;
    }
  }
  
  // If relative URL, prepend domain
  if (externalUrl && externalUrl.startsWith("/")) {
    try {
      const urlObj = new URL(job.config.url);
      externalUrl = urlObj.origin + externalUrl;
      console.log(`🔗 Converted relative URL to absolute: ${externalUrl}`);
    } catch (e) {
      console.log(`⚠️ Error converting relative URL: ${e}`);
    }
  }
  
  // Fallback to original catchdesmoines URL if no external URL found
  if (!externalUrl) {
    externalUrl = job.config.url;
    console.log(`📌 Using fallback URL: ${externalUrl}`);
  }

  return {
    title: title || "Community Event",
    description:
      description ||
      `Event in Des Moines area. Visit ${job.config.url} for more details.`,
    location,
    price,
    category,
    date,
    source_url: externalUrl,
  };
}

function extractIowaCubsEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  // Look for game matchups like "Cubs vs Team"
  let title = querySelectorText(
    html,
    "h1, h2, .game-title, .matchup, .event-title"
  );

  // Try to find opponent team names
  const opponent = querySelectorText(html, ".opponent, .vs, .visiting-team");
  if (opponent && !title.toLowerCase().includes("vs")) {
    title = `Iowa Cubs vs ${opponent}`;
  }

  if (!title || title.toLowerCase().includes("event from")) {
    title = "Iowa Cubs Baseball Game";
  }

  const description =
    querySelectorText(html, job.config.selectors.description) ||
    `Professional baseball game featuring the Iowa Cubs at Principal Park.`;

  const date = extractValidDate(html, job.config.selectors.date);

  return {
    title,
    description,
    location: "Principal Park",
    price: querySelectorText(html, ".price, .ticket-price") || "$12-$35",
    category: "Sports",
    date,
  };
}

function extractIowaWolvesEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
  source_url: string;
} {
  let title = querySelectorText(html, "h1, h2, .game-title, .matchup");

  const opponent = querySelectorText(html, ".opponent, .vs, .visiting-team");
  if (opponent && !title.toLowerCase().includes("vs")) {
    title = `Iowa Wolves vs ${opponent}`;
  }

  if (!title || title.toLowerCase().includes("event from")) {
    title = "Iowa Wolves Basketball Game";
  }

  // Validate that this is during basketball season (October - April)
  const date = extractValidDate(html, job.config.selectors.date);
  if (date) {
    const month = date.getMonth() + 1; // 1-12
    if (month >= 5 && month <= 9) {
      console.log(
        `⚠️ Invalid date for basketball: ${date.toDateString()} (off-season)`
      );
      return {
        title: "",
        description: "",
        location: "",
        price: "",
        category: "",
        date: null,
        source_url: job.config.url,
      };
    }
  }

  return {
    title,
    description: `G-League basketball game featuring the Iowa Wolves.`,
    location: "Wells Fargo Arena",
    price: querySelectorText(html, ".price, .ticket-price") || "$15-$25",
    category: "Sports",
    date,
    source_url: job.config.url,
  };
}

function extractIowaWildEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  let title = querySelectorText(html, "h1, h2, .game-title, .matchup");

  const opponent = querySelectorText(html, ".opponent, .vs, .visiting-team");
  if (opponent && !title.toLowerCase().includes("vs")) {
    title = `Iowa Wild vs ${opponent}`;
  }

  if (!title || title.toLowerCase().includes("event from")) {
    title = "Iowa Wild Hockey Game";
  }

  // Validate hockey season (October - April)
  const date = extractValidDate(html, job.config.selectors.date);
  if (date) {
    const month = date.getMonth() + 1;
    if (month >= 5 && month <= 9) {
      console.log(
        `⚠️ Invalid date for hockey: ${date.toDateString()} (off-season)`
      );
      return {
        title: "",
        description: "",
        location: "",
        price: "",
        category: "",
        date: null,
      };
    }
  }

  return {
    title,
    description: `Professional hockey game featuring the Iowa Wild.`,
    location: "Wells Fargo Arena",
    price: querySelectorText(html, ".price, .ticket-price") || "$18-$30",
    category: "Sports",
    date,
  };
}

function extractIowaBarnstormersEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  let title = querySelectorText(html, "h1, h2, .game-title, .matchup");

  const opponent = querySelectorText(html, ".opponent, .vs, .visiting-team");
  if (opponent && !title.toLowerCase().includes("vs")) {
    title = `Iowa Barnstormers vs ${opponent}`;
  }

  if (!title || title.toLowerCase().includes("event from")) {
    title = "Iowa Barnstormers Arena Football";
  }

  return {
    title,
    description: `Arena football game featuring the Iowa Barnstormers.`,
    location: "Wells Fargo Arena",
    price: querySelectorText(html, ".price, .ticket-price") || "$20-$40",
    category: "Sports",
    date: extractValidDate(html, job.config.selectors.date),
  };
}

function extractIowaEventsCenterEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  const title =
    querySelectorText(html, "h1, h2, .event-title, .show-title") ||
    "Iowa Events Center Show";

  return {
    title,
    description:
      querySelectorText(html, job.config.selectors.description) ||
      `Event at Iowa Events Center. Visit ${job.config.url} for details.`,
    location: "Iowa Events Center",
    price: querySelectorText(html, ".price, .ticket-price") || "See website",
    category: "Entertainment",
    date: extractValidDate(html, job.config.selectors.date),
  };
}

function extractVibrantMusicHallEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  const title =
    querySelectorText(
      html,
      "h1, h2, .artist-name, .show-title, .event-title"
    ) || "Concert at Vibrant Music Hall";

  return {
    title,
    description:
      querySelectorText(html, job.config.selectors.description) ||
      `Live music performance at Vibrant Music Hall.`,
    location: "Vibrant Music Hall",
    price: querySelectorText(html, ".price, .ticket-price") || "See website",
    category: "Music",
    date: extractValidDate(html, job.config.selectors.date),
  };
}

function extractGenericEvent(
  html: string,
  job: ScrapingJob
): {
  title: string;
  description: string;
  location: string;
  price: string;
  category: string;
  date: Date | null;
} {
  const title =
    querySelectorText(html, job.config.selectors.title) ||
    querySelectorText(html, "h1, h2, .title") ||
    "Community Event";

  const description =
    querySelectorText(html, job.config.selectors.description) ||
    `Event scraped from ${job.config.url}`;

  const location =
    querySelectorText(html, job.config.selectors.location) || "Des Moines, IA";
  const price =
    querySelectorText(html, job.config.selectors.price || "") || "See website";
  const category =
    querySelectorText(html, job.config.selectors.category || "") || "General";

  return {
    title,
    description,
    location,
    price,
    category,
    date: extractValidDate(html, job.config.selectors.date),
  };
}

// Enhanced date extraction and validation
function extractValidDate(html: string, dateSelector: string): Date | null {
  console.log(
    `� Attempting to extract date/time with timezone awareness: "${dateSelector}"`
  );

  // Step 1: Extract date text
  let dateText = querySelectorText(html, dateSelector);
  let timeText = "";

  // Step 2: Also look for time information nearby or in the same element
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/gi,
    /(\d{1,2}\s*(?:AM|PM|am|pm))/gi,
    /(?:at|@)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /doors?\s*(?:at|open|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /show\s*(?:at|starts|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/gi,
  ];

  // Try to find time in the HTML around the date area
  const htmlSection = dateText
    ? html.substring(
        Math.max(0, html.indexOf(dateText) - 500),
        html.indexOf(dateText) + 500
      )
    : html;

  for (const pattern of timePatterns) {
    const timeMatch = htmlSection.match(pattern);
    if (timeMatch) {
      timeText = timeMatch[1] || timeMatch[0];
      console.log(`🕐 Found time text: "${timeText}"`);
      break;
    }
  }

  // Step 3: If no date text found, try fallback patterns
  if (!dateText) {
    console.log(`🔍 Primary selector failed, trying fallback patterns...`);

    const datePatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];

    for (const pattern of datePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches.slice(0, 3)) {
          const testDate = new Date(match);
          if (
            !isNaN(testDate.getTime()) &&
            testDate > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          ) {
            dateText = match;
            console.log(`🔍 Found date via pattern matching: "${dateText}"`);
            break;
          }
        }
        if (dateText) break;
      }
    }
  }

  if (!dateText) {
    console.log(`🔍 No date text found`);
    return null;
  }

  console.log(`🔍 Raw date text: "${dateText}", time text: "${timeText}"`);

  // Step 4: Parse the date with enhanced logic
  let parsedDate = parseFlexibleDateEnhanced(dateText);
  if (!parsedDate) {
    console.log(`⚠️ Could not parse date: "${dateText}"`);
    return null;
  }

  // Step 5: Add time information if found
  if (timeText) {
    parsedDate = addTimeToDateEnhanced(parsedDate, timeText);
  } else {
    // Default to 7:00 PM CDT if no time specified (common for evening events)
    parsedDate.setHours(19, 0, 0, 0); // 7:00 PM
    console.log(`🕐 No time found, defaulting to 7:00 PM`);
  }

  // Step 6: Convert to CDT/CST timezone-aware format
  const finalDate = convertToCentralTimeEnhanced(parsedDate);

  console.log(
    `✅ Final date: ${finalDate.toISOString()} (displays as ${finalDate.toLocaleString(
      "en-US",
      { timeZone: "America/Chicago" }
    )})`
  );

  return finalDate;
}

// Enhanced helper functions for timezone-aware date processing
function parseFlexibleDateEnhanced(dateText: string): Date | null {
  const cleanDateText = dateText.trim();

  // Try parsing the date directly first
  let parsedDate = new Date(cleanDateText);

  // If invalid, try specific patterns
  if (isNaN(parsedDate.getTime())) {
    const datePatterns = [
      /(\w{3,9}\s+\d{1,2},?\s+\d{4})/i, // "January 15, 2025"
      /(\d{4}-\d{2}-\d{2})/, // "2025-01-15"
      /(\d{1,2}\/\d{1,2}\/\d{4})/, // "1/15/2025"
      /(\d{1,2}-\d{1,2}-\d{4})/, // "1-15-2025"
    ];

    for (const pattern of datePatterns) {
      const match = cleanDateText.match(pattern);
      if (match) {
        parsedDate = new Date(match[1]);
        if (!isNaN(parsedDate.getTime())) {
          break;
        }
      }
    }
  }

  // Validate and fix year if needed
  if (!isNaN(parsedDate.getTime())) {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const threeYearsFromNow = new Date(
      now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000
    );

    // If year is too old, try current or next year
    if (parsedDate.getFullYear() < 2020) {
      const currentYearDate = new Date(parsedDate);
      currentYearDate.setFullYear(now.getFullYear());

      // If that's in the past, try next year
      if (currentYearDate < now) {
        currentYearDate.setFullYear(now.getFullYear() + 1);
      }

      if (
        currentYearDate >= sixMonthsAgo &&
        currentYearDate <= threeYearsFromNow
      ) {
        return currentYearDate;
      }
    }

    if (parsedDate >= sixMonthsAgo && parsedDate <= threeYearsFromNow) {
      return parsedDate;
    }
  }

  return null;
}

function addTimeToDateEnhanced(date: Date, timeStr: string): Date {
  const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);

  if (!timeMatch) {
    return date; // Return original date if time parsing fails
  }

  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2] || "0");
  const ampm = timeMatch[3]?.toUpperCase();

  // Convert to 24-hour format
  if (ampm === "PM" && hours < 12) {
    hours += 12;
  } else if (ampm === "AM" && hours === 12) {
    hours = 0;
  }

  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);

  console.log(
    `🕐 Combined date/time: ${combined.toLocaleString("en-US", {
      timeZone: "America/Chicago",
    })}`
  );

  return combined;
}

function convertToCentralTimeEnhanced(localDate: Date): Date {
  // Create a date in Central timezone
  const centralTime = new Date(
    localDate.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );

  // Calculate the difference between local time and central time
  const localTime = new Date(
    localDate.toLocaleString("en-US", { timeZone: "UTC" })
  );

  // Get the timezone offset for America/Chicago
  // CDT is UTC-5, CST is UTC-6
  const isDST = isDaylightSavingTime(localDate);
  const centralOffset = isDST ? -5 : -6; // Hours offset from UTC

  // Create the final date by adjusting for Central timezone
  const utcTime = new Date(
    localDate.getTime() - centralOffset * 60 * 60 * 1000
  );

  return utcTime;
}

function isDaylightSavingTime(date: Date): boolean {
  // DST in US typically runs from 2nd Sunday in March to 1st Sunday in November
  const year = date.getFullYear();

  // Find 2nd Sunday in March
  const march = new Date(year, 2, 1); // March 1st
  const firstMarchSunday = new Date(
    march.getTime() + (7 - march.getDay()) * 24 * 60 * 60 * 1000
  );
  const secondMarchSunday = new Date(
    firstMarchSunday.getTime() + 7 * 24 * 60 * 60 * 1000
  );

  // Find 1st Sunday in November
  const november = new Date(year, 10, 1); // November 1st
  const firstNovemberSunday = new Date(
    november.getTime() + (7 - november.getDay()) * 24 * 60 * 60 * 1000
  );

  return date >= secondMarchSunday && date < firstNovemberSunday;
}

async function scrapeWebsite(
  job: ScrapingJob,
  existingEvents: ExistingEvent[],
  claudeApiKey?: string
): Promise<{
  events: ScrapedEvent[];
  newEventsCount: number;
  duplicatesSkipped: number;
}> {
  const events: ScrapedEvent[] = [];
  let duplicatesSkipped = 0;

  try {
    console.log(`🔍 Scraping ${job.name} from ${job.config.url}`);

    const response = await fetch(job.config.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(
        `❌ Failed to fetch ${job.config.url}: ${response.status} ${response.statusText}`
      );
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    const html = await response.text();
    console.log(`✅ Fetched HTML from ${job.name}, length: ${html.length}`);

    // Try AI-powered extraction first if Claude API is available
    if (claudeApiKey) {
      console.log(`🤖 Attempting AI-powered event extraction for ${job.name}`);
      const aiExtractedEvents = await extractMultipleEventsWithAI(
        html,
        job,
        claudeApiKey
      );

      if (aiExtractedEvents.length > 0) {
        console.log(
          `🤖 AI found ${aiExtractedEvents.length} events from ${job.name}`
        );

        // Process AI-extracted events for duplicates
        for (const event of aiExtractedEvents) {
          event.fingerprint = generateEventFingerprint(event);
          const duplicateCheck = isDuplicateEvent(event, existingEvents);

          if (duplicateCheck.isDuplicate) {
            console.log(
              `⚠️ Skipping duplicate event: ${event.title} (Reason: ${duplicateCheck.reason})`
            );
            duplicatesSkipped++;
          } else {
            events.push(event);
            console.log(`✅ New AI event: ${event.title} from ${job.name}`);
          }
        }

        return {
          events,
          newEventsCount: events.length,
          duplicatesSkipped,
        };
      } else {
        console.log(
          `🤖 AI extraction found no events, falling back to legacy method`
        );
      }
    }
    const eventData = extractEventData(html, job);

    console.log(`🔍 Extracted event data:`, {
      title: eventData.title,
      date: eventData.date?.toISOString(),
      location: eventData.location,
      description: eventData.description?.substring(0, 100) + "...",
    });

    // Skip if no valid title, but allow events without dates temporarily for debugging
    if (!eventData.title) {
      console.log(
        `⚠️ Skipping invalid event from ${job.name}: title="${eventData.title}"`
      );
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    // If no date found, use a default future date to allow the event through for now
    if (!eventData.date) {
      console.log(
        `⚠️ No date found for event "${eventData.title}", using default date`
      );
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7); // One week from now
      eventData.date = defaultDate;
    }

    // Skip generic titles - but allow sports schedules
    const genericTitles = [
      "event from",
      "community event",
      "see website",
      "upcoming events",
      "shows",
      "events",
    ];

    // Allow "schedule" for sports sites but enhance the title
    if (
      eventData.title.toLowerCase() === "schedule" &&
      (job.config.url.includes("cubs") ||
        job.config.url.includes("wild") ||
        job.config.url.includes("wolves") ||
        job.config.url.includes("barnstormers"))
    ) {
      // For sports schedules, create a more specific title based on the site
      if (job.config.url.includes("cubs")) {
        eventData.title = "Iowa Cubs Baseball Games";
      } else if (job.config.url.includes("wild")) {
        eventData.title = "Iowa Wild Hockey Games";
      } else if (job.config.url.includes("wolves")) {
        eventData.title = "Iowa Wolves Basketball Games";
      } else if (job.config.url.includes("barnstormers")) {
        eventData.title = "Iowa Barnstormers Arena Football Games";
      }
      console.log(`🔧 Enhanced generic schedule title to: ${eventData.title}`);
    } else if (
      genericTitles.some((generic) =>
        eventData.title.toLowerCase().includes(generic)
      )
    ) {
      console.log(`⚠️ Skipping generic event title: ${eventData.title}`);
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    const event: ScrapedEvent = {
      title: eventData.title.substring(0, 200),
      original_description: eventData.description.substring(0, 500),
      date: eventData.date,
      location: eventData.location.substring(0, 100),
      venue: eventData.location.substring(0, 100),
      category: eventData.category.substring(0, 50),
      price: eventData.price.substring(0, 50),
      source_url: eventData.source_url || job.config.url,
      is_featured: Math.random() > 0.7,
    };

    // Generate fingerprint for duplicate detection
    event.fingerprint = generateEventFingerprint(event);

    // Check if this event is a duplicate
    const duplicateCheck = isDuplicateEvent(event, existingEvents);

    if (duplicateCheck.isDuplicate) {
      console.log(
        `⚠️ Skipping duplicate event: ${event.title} (Reason: ${duplicateCheck.reason})`
      );
      duplicatesSkipped++;
    } else {
      events.push(event);
      console.log(`✅ New event: ${event.title} from ${job.name}`);
    }
  } catch (error) {
    console.error(`❌ Error scraping ${job.name}:`, error);
  }

  return {
    events,
    newEventsCount: events.length,
    duplicatesSkipped,
  };
}

// Analyze website structure and suggest better selectors using AI
async function analyzeWebsiteStructure(
  url: string,
  claudeApiKey?: string
): Promise<{
  success: boolean;
  analysis?: {
    suggestedSelectors: {
      title: string[];
      description: string[];
      date: string[];
      location: string[];
      price: string[];
      category: string[];
    };
    htmlStructureAnalysis: string;
    recommendations: string;
  };
  error?: string;
}> {
  try {
    console.log(`🔍 Analyzing website structure for: ${url}`);

    // Fetch the website HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch website: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    console.log(`✅ Fetched HTML for analysis, length: ${html.length}`);

    // Extract relevant HTML snippets that might contain event data
    const htmlAnalysisSnippet = extractRelevantHTMLSnippets(html);

    // Use AI to analyze the structure and suggest selectors
    const aiAnalysis = await getAIStructureAnalysis(
      url,
      htmlAnalysisSnippet,
      claudeApiKey
    );

    if (!aiAnalysis) {
      return {
        success: false,
        error: "AI analysis failed or no API keys available",
      };
    }

    return {
      success: true,
      analysis: aiAnalysis,
    };
  } catch (error) {
    console.error(`❌ Error analyzing website structure:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Extract relevant HTML snippets for AI analysis
function extractRelevantHTMLSnippets(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract potential event-related sections
  const eventKeywords = [
    "event",
    "show",
    "concert",
    "game",
    "match",
    "schedule",
    "calendar",
    "date",
    "time",
    "venue",
    "location",
    "price",
    "ticket",
    "admission",
    "title",
    "name",
    "description",
    "details",
    "artist",
    "performer",
  ];

  // Find sections that likely contain event information
  const relevantSections: string[] = [];

  // Look for divs, articles, sections with event-related classes or content
  const sectionRegex =
    /<(div|article|section|header|main)[^>]*(?:class|id)="[^"]*(?:event|show|concert|game|schedule|calendar)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while (
    (match = sectionRegex.exec(cleanHtml)) !== null &&
    relevantSections.length < 3
  ) {
    relevantSections.push(match[0].substring(0, 1000)); // Limit length
  }

  // If no specific event sections found, look for common structural patterns
  if (relevantSections.length === 0) {
    // Look for date patterns and surrounding context
    const datePatterns = [
      /(<[^>]*>.*?\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}[^<]*<\/[^>]*>)/gi,
      /(<[^>]*>.*?\b\d{1,2}\/\d{1,2}\/\d{4}[^<]*<\/[^>]*>)/gi,
      /(<[^>]*>.*?\b\d{4}-\d{2}-\d{2}[^<]*<\/[^>]*>)/gi,
    ];

    for (const pattern of datePatterns) {
      let dateMatch;
      while (
        (dateMatch = pattern.exec(cleanHtml)) !== null &&
        relevantSections.length < 2
      ) {
        // Get surrounding context (500 chars before and after)
        const start = Math.max(0, dateMatch.index - 500);
        const end = Math.min(
          cleanHtml.length,
          dateMatch.index + dateMatch[0].length + 500
        );
        relevantSections.push(cleanHtml.substring(start, end));
      }
    }
  }

  // If still no sections, get first few structural elements
  if (relevantSections.length === 0) {
    const structuralRegex =
      /<(h1|h2|h3|div|article|section)[^>]*>[\s\S]*?<\/\1>/gi;
    let structMatch;
    while (
      (structMatch = structuralRegex.exec(cleanHtml)) !== null &&
      relevantSections.length < 5
    ) {
      if (structMatch[0].length < 2000) {
        // Only include reasonably sized elements
        relevantSections.push(structMatch[0]);
      }
    }
  }

  return relevantSections
    .join("\n\n--- SECTION BREAK ---\n\n")
    .substring(0, 4000);
}

// Get AI analysis of website structure
async function getAIStructureAnalysis(
  url: string,
  htmlSnippet: string,
  claudeApiKey?: string
): Promise<{
  suggestedSelectors: {
    title: string[];
    description: string[];
    date: string[];
    location: string[];
    price: string[];
    category: string[];
  };
  htmlStructureAnalysis: string;
  recommendations: string;
} | null> {
  const prompt = `Analyze this HTML structure from ${url} and provide CSS selector recommendations for scraping event information.

HTML SNIPPET:
${htmlSnippet}

Please analyze this HTML and provide:

1. SUGGESTED CSS SELECTORS for each field (provide 2-3 options for each):
   - Event titles
   - Event descriptions  
   - Event dates/times
   - Event locations/venues
   - Event prices
   - Event categories/types

2. HTML STRUCTURE ANALYSIS: Brief explanation of the page structure

3. RECOMMENDATIONS: Best practices for scraping this specific site

Format your response as JSON:
{
  "suggestedSelectors": {
    "title": ["selector1", "selector2", "selector3"],
    "description": ["selector1", "selector2"],
    "date": ["selector1", "selector2", "selector3"],
    "location": ["selector1", "selector2"],
    "price": ["selector1", "selector2"],
    "category": ["selector1", "selector2"]
  },
  "htmlStructureAnalysis": "Brief analysis of the HTML structure...",
  "recommendations": "Specific recommendations for scraping this site..."
}`;

  // Try Claude first
  if (claudeApiKey) {
    try {
      console.log(`🔍 Using Claude for website structure analysis`);

      const claudeResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": claudeApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-0",
            max_tokens: 1000,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        }
      );

      console.log(`🔍 Claude response status: ${claudeResponse.status}`);

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        console.log(`🔍 Claude response data:`, claudeData);
        const analysisText = claudeData.content?.[0]?.text?.trim();

        if (analysisText) {
          console.log(`🔍 Claude analysis text length: ${analysisText.length}`);
          try {
            // Try to parse JSON from the response
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const analysis = JSON.parse(jsonMatch[0]);
              console.log(`✅ Claude provided structure analysis`);
              return analysis;
            } else {
              console.log(`⚠️ No JSON found in Claude response`);
            }
          } catch (parseError) {
            console.log(`⚠️ Could not parse Claude JSON response:`, parseError);
          }
        } else {
          console.log(`⚠️ No analysis text found in Claude response`);
        }
      } else {
        const errorText = await claudeResponse.text();
        console.error(
          `❌ Claude API error: ${claudeResponse.status} - ${errorText}`
        );
      }
    } catch (error) {
      console.error("Claude API error:", error);
    }
  } else {
    console.log(`⚠️ No Claude API key available`);
  }

  console.log(`❌ Claude API failed or unavailable, returning null`);
  return null;
}

async function enhanceEventWithAI(
  event: ScrapedEvent,
  claudeApiKey?: string
): Promise<ScrapedEvent> {
  // Try Claude API
  if (claudeApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with Claude API`);

      const claudeResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": claudeApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-0", // Updated to latest Claude Sonnet model
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `Enhance this event description to be more engaging and informative. Keep it under 150 words and maintain all key details:

Event: ${event.title}
Description: ${event.original_description}
Location: ${event.location}
Category: ${event.category}

Enhanced description:`,
              },
            ],
          }),
        }
      );

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        const enhancedDescription = claudeData.content?.[0]?.text?.trim();

        if (enhancedDescription) {
          console.log(`✅ Claude API enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      }
    } catch (error) {
      console.error("Claude API error:", error);
    }
  }

  // If Claude fails, use original
  console.log(`Using original description for: ${event.title}`);
  return {
    ...event,
    enhanced_description: event.original_description,
    is_enhanced: false,
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const isAnalyzeRequest = req.headers.get("x-endpoint") === "analyze";
    const isUpdateRequest = req.headers.get("x-endpoint") === "update";

    console.log(
      `🔍 Request details: method=${
        req.method
      }, pathname=${pathname}, x-endpoint=${req.headers.get(
        "x-endpoint"
      )}, isAnalyzeRequest=${isAnalyzeRequest}, isUpdateRequest=${isUpdateRequest}`
    );

    // Handle website analysis endpoint
    if (isAnalyzeRequest && req.method === "POST") {
      console.log("Starting website structure analysis...");

      let requestBody;
      try {
        requestBody = await req.json();
        console.log(`🔍 Request body:`, requestBody);
      } catch (parseError) {
        console.error(`❌ Failed to parse request body:`, parseError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid JSON in request body",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const { websiteUrl } = requestBody;
      console.log(`🔍 Extracted websiteUrl: "${websiteUrl}"`);

      if (!websiteUrl) {
        console.log(`❌ No websiteUrl provided in request body`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Website URL is required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const claudeApiKey = Deno.env.get("CLAUDE_API");

      console.log(
        `🔑 API Keys availability - Claude: ${
          claudeApiKey ? "Available" : "Missing"
        }`
      );

      // Check if we have Claude API key
      if (!claudeApiKey) {
        console.error(
          "❌ No Claude API key found. Please configure CLAUDE_API environment variable."
        );
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Claude API key not configured. Please set CLAUDE_API environment variable in your Supabase project settings.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      const analysisResult = await analyzeWebsiteStructure(
        websiteUrl,
        claudeApiKey
      );

      return new Response(JSON.stringify(analysisResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: analysisResult.success ? 200 : 400,
      });
    }

    // Handle scraping job selector update endpoint
    if (isUpdateRequest && req.method === "POST") {
      console.log("Starting scraping job selector update...");

      let requestBody;
      try {
        requestBody = await req.json();
        console.log(`🔍 Update request body:`, requestBody);
      } catch (parseError) {
        console.error(`❌ Failed to parse update request body:`, parseError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid JSON in request body",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const { jobId, selectors } = requestBody;

      if (!jobId || !selectors) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Job ID and selectors are required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      // Initialize Supabase client for update
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      try {
        // Fetch current job to merge selectors
        const { data: currentJob, error: fetchError } = await supabase
          .from("scraping_jobs")
          .select("config")
          .eq("id", jobId)
          .single();

        if (fetchError) {
          console.error("Error fetching current job:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to fetch current job configuration",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            }
          );
        }

        // Merge new selectors with existing config
        const updatedConfig = {
          ...currentJob.config,
          selectors: {
            ...currentJob.config.selectors,
            ...selectors,
          },
        };

        // Update the job with new selectors
        const { data: updatedJob, error: updateError } = await supabase
          .from("scraping_jobs")
          .update({ config: updatedConfig })
          .eq("id", jobId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating job selectors:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to update job selectors",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            }
          );
        }

        console.log(`✅ Successfully updated selectors for job ${jobId}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Selectors updated successfully",
            updatedJob,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (error) {
        console.error("Error in selector update:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Internal server error during selector update",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }

    // Handle main scraping endpoint (existing functionality)
    console.log("Starting event scraping process...");

    // Parse request body to check for specific jobId
    let requestBody: any = {};
    try {
      if (req.method === "POST") {
        const text = await req.text();
        if (text) {
          requestBody = JSON.parse(text);
        }
      }
    } catch (parseError) {
      console.log("No valid JSON body found, proceeding with all jobs");
    }

    const { jobId } = requestBody;
    console.log(
      `Specific jobId requested: ${jobId || "none (will process all jobs)"}`
    );

    // Check for authorization header or specific trigger
    const authHeader = req.headers.get("authorization");
    const triggerSource = req.headers.get("x-trigger-source");

    // Only allow calls from:
    // 1. Authenticated requests with valid Supabase JWT
    // 2. Requests with our custom trigger header
    // 3. Requests from our frontend domain
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");

    const isValidTrigger =
      authHeader?.includes("Bearer") || // Supabase auth
      triggerSource === "admin-dashboard" || // Our frontend
      origin?.includes("desmoinesinsider.com") ||
      origin?.includes("localhost") ||
      referer?.includes("desmoinesinsider.com") ||
      referer?.includes("localhost");

    if (!isValidTrigger) {
      console.log(
        `🚫 Unauthorized scraping attempt from ${origin || "unknown"}`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unauthorized - scraping can only be triggered from admin dashboard",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log(
      `✅ Authorized scraping request from ${
        origin || triggerSource || "authenticated source"
      }`
    );

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const claudeApiKey = Deno.env.get("CLAUDE_API");

    // Fetch existing events from the last 60 days for duplicate checking
    console.log("Fetching existing events for duplicate detection...");
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const { data: existingEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, venue, source_url")
      .gte("date", sixtyDaysAgo.toISOString())
      .order("date", { ascending: false });

    if (eventsError) {
      console.error("Error fetching existing events:", eventsError);
      throw eventsError;
    }

    const existingEventsWithFingerprints: ExistingEvent[] = (
      existingEvents || []
    ).map((event) => ({
      ...event,
      fingerprint: generateEventFingerprint({
        title: event.title,
        date: new Date(event.date),
        venue: event.venue,
        source_url: event.source_url,
      }),
    }));

    console.log(
      `Found ${existingEventsWithFingerprints.length} existing events for duplicate checking`
    );

    // Fetch active scraping jobs from database
    console.log("Fetching scraping jobs from database...");

    let jobsQuery = supabase
      .from("scraping_jobs")
      .select("*")
      .eq("status", "idle");

    // If specific jobId is requested, filter for that job only
    if (jobId) {
      console.log(`Filtering for specific job: ${jobId}`);
      jobsQuery = jobsQuery.eq("id", jobId);
    } else {
      console.log("No specific jobId, will fetch all active jobs");
      jobsQuery = jobsQuery.limit(10); // Limit only when processing all jobs
    }

    const { data: scrapingJobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      console.error("Error fetching scraping jobs:", jobsError);
      throw jobsError;
    }

    if (!scrapingJobs || scrapingJobs.length === 0) {
      const message = jobId
        ? `No scraping job found with ID: ${jobId}`
        : "No active scraping jobs found";
      console.log(message);
      return new Response(
        JSON.stringify({
          success: true,
          message,
          events_processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Found ${scrapingJobs.length} total scraping jobs`);

    // Filter jobs based on recent scraping history
    const jobsToProcess: any[] = [];
    const skippedJobs: { name: string; reason: string }[] = [];

    // Detect admin dashboard trigger more broadly
    const isAdminDashboard =
      triggerSource === "admin-dashboard" ||
      origin?.includes("desmoinesinsider.com") ||
      origin?.includes("localhost") ||
      referer?.includes("desmoinesinsider.com") ||
      referer?.includes("localhost");

    console.log(
      `🔍 Admin Dashboard Detection: triggerSource="${triggerSource}", origin="${origin}", referer="${referer}", isAdminDashboard=${isAdminDashboard}`
    );

    for (const jobRow of scrapingJobs) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
        last_run: jobRow.last_run,
        events_found: jobRow.events_found,
      };

      const skipCheck = shouldSkipJobScraping(job, isAdminDashboard);
      if (skipCheck.skip) {
        console.log(`⏭️ Skipping ${job.name}: ${skipCheck.reason}`);
        skippedJobs.push({ name: job.name, reason: skipCheck.reason! });
      } else if (job.config?.isActive && job.config?.url) {
        jobsToProcess.push(jobRow);
      }
    }

    console.log(
      `Processing ${jobsToProcess.length} jobs, skipped ${skippedJobs.length} jobs`
    );

    // Scrape events from filtered jobs using Firecrawl
    let totalEventsFound = 0;
    let totalErrors = 0;
    const jobResults = [];

    for (const jobRow of jobsToProcess) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
      };

      console.log(`🎯 Processing job: ${job.name} - ${job.config.url}`);

      // Use Firecrawl for scraping
      const scrapeResult = await scrapeJobWithFirecrawl(job, supabase);

      totalEventsFound += scrapeResult.eventsFound;
      totalErrors += scrapeResult.errors.length;

      jobResults.push({
        jobName: job.name,
        url: job.config.url,
        eventsFound: scrapeResult.eventsFound,
        success: scrapeResult.success,
        errors: scrapeResult.errors,
      });

      // Update job status
      await supabase
        .from("scraping_jobs")
        .update({
          last_run: new Date().toISOString(),
          events_found: scrapeResult.eventsFound,
        })
        .eq("id", job.id);

      console.log(
        `✅ Completed ${job.name}: ${scrapeResult.eventsFound} events found`
      );
    }

    console.log(
      `Processed ${jobsToProcess.length} jobs, found ${totalEventsFound} total events`
    );

    // Return comprehensive results
    return new Response(
      JSON.stringify({
        success: true,
        message: `Scraping completed: ${totalEventsFound} events found across ${jobsToProcess.length} jobs`,
        jobs_processed: jobsToProcess.length,
        jobs_skipped: skippedJobs.length,
        total_events_found: totalEventsFound,
        total_errors: totalErrors,
        skipped_jobs: skippedJobs,
        job_results: jobResults,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw insertError;
    }

    console.log(`Successfully processed ${insertedEvents?.length || 0} events`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully scraped and processed ${enhancedEvents.length} new events`,
        events_processed: enhancedEvents.length,
        events_enhanced: enhancedCount,
        duplicates_skipped: totalDuplicatesSkipped,
        jobs_processed: jobsToProcess.length,
        jobs_skipped: skippedJobs.length,
        skipped_jobs: skippedJobs,
        claude_available: !!claudeApiKey,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in scrape-events function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
