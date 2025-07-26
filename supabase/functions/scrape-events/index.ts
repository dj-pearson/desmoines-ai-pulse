import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
function shouldSkipJobScraping(job: ScrapingJob): {
  skip: boolean;
  reason?: string;
} {
  if (!job.last_run) {
    return { skip: false }; // Never scraped before
  }

  const lastRun = new Date(job.last_run);
  const now = new Date();
  const hoursSinceLastRun =
    (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

  // Skip if scraped within last 2 hours and found events
  if (hoursSinceLastRun < 2 && (job.events_found || 0) > 0) {
    return {
      skip: true,
      reason: `Recently scraped ${hoursSinceLastRun.toFixed(1)}h ago with ${
        job.events_found
      } events found`,
    };
  }

  // Skip if scraped within last 30 minutes regardless of results
  if (hoursSinceLastRun < 0.5) {
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

// Enhanced event extraction with site-specific logic
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
} {
  // Look for event title in h1, h2, or title tags
  let title = querySelectorText(html, "h1, h2, .event-title, .title");

  // If no title found, try to extract from page title or meta tags
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = extractTextFromHTML(titleMatch[1]);
      // Clean up title (remove site name)
      title = title.replace(/\s*-\s*Catch Des Moines.*$/i, "").trim();
    }
  }

  const description =
    querySelectorText(html, job.config.selectors.description) ||
    querySelectorText(html, ".event-description, .description, p");

  const location =
    querySelectorText(html, job.config.selectors.location) ||
    querySelectorText(html, ".event-location, .location, .venue") ||
    "Des Moines, IA";

  const price =
    querySelectorText(html, job.config.selectors.price || "") ||
    querySelectorText(html, ".price, .cost, .admission") ||
    "See website";

  const category =
    querySelectorText(html, job.config.selectors.category || "") ||
    "Community Event";

  // Enhanced date extraction
  const date = extractValidDate(html, job.config.selectors.date);

  return {
    title: title || "Community Event",
    description:
      description ||
      `Event in Des Moines area. Visit ${job.config.url} for more details.`,
    location,
    price,
    category,
    date,
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
  const dateText = querySelectorText(html, dateSelector);

  if (!dateText) {
    return null;
  }

  // Try multiple date parsing approaches
  const cleanDateText = dateText.trim();

  // Try parsing the date
  let parsedDate = new Date(cleanDateText);

  // If invalid, try common date formats
  if (isNaN(parsedDate.getTime())) {
    // Try extracting date patterns like "Jan 15, 2025" or "2025-01-15"
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

  // Validate the date is reasonable (not in the past more than a few days, not too far in future)
  if (!isNaN(parsedDate.getTime())) {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const twoYearsFromNow = new Date(
      now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000
    );

    if (parsedDate >= threeDaysAgo && parsedDate <= twoYearsFromNow) {
      return parsedDate;
    } else {
      console.log(`⚠️ Date out of valid range: ${parsedDate.toDateString()}`);
    }
  }

  return null;
}

async function scrapeWebsite(
  job: ScrapingJob,
  existingEvents: ExistingEvent[]
): Promise<{
  events: ScrapedEvent[];
  newEventsCount: number;
  duplicatesSkipped: number;
}> {
  const events: ScrapedEvent[] = [];
  let duplicatesSkipped = 0;

  try {
    console.log(`Scraping ${job.name} from ${job.config.url}`);

    const response = await fetch(job.config.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${job.config.url}: ${response.status}`);
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    const html = await response.text();
    console.log(`Fetched HTML from ${job.name}, length: ${html.length}`);

    // Extract event data using enhanced logic
    const eventData = extractEventData(html, job);

    // Skip if no valid title or date
    if (!eventData.title || !eventData.date) {
      console.log(
        `⚠️ Skipping invalid event from ${job.name}: title="${eventData.title}", date=${eventData.date}`
      );
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    // Skip generic titles
    const genericTitles = ["event from", "community event", "see website"];
    if (
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
      source_url: job.config.url,
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
    console.error(`Error scraping ${job.name}:`, error);
  }

  return {
    events,
    newEventsCount: events.length,
    duplicatesSkipped,
  };
}

async function enhanceEventWithAI(
  event: ScrapedEvent,
  openaiApiKey: string,
  claudeApiKey?: string
): Promise<ScrapedEvent> {
  // Try Claude API first
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
            model: "claude-3-haiku-20240307",
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

  // Fallback to OpenAI
  if (openaiApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with OpenAI API`);

      const openaiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
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
            max_tokens: 200,
            temperature: 0.7,
          }),
        }
      );

      if (openaiResponse.ok) {
        const openaiData = await openaiResponse.json();
        const enhancedDescription =
          openaiData.choices?.[0]?.message?.content?.trim();

        if (enhancedDescription) {
          console.log(`✅ OpenAI enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      } else {
        const errorData = await openaiResponse.json();
        console.error("OpenAI API error:", errorData);
      }
    } catch (error) {
      console.error("OpenAI API error:", error);
    }
  }

  // If both fail, use original
  console.log(`Using original description for: ${event.title}`);
  return {
    ...event,
    enhanced_description: event.original_description,
    is_enhanced: false,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting event scraping process...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const openaiApiKey = Deno.env.get("OPENAI_API");
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
    const { data: scrapingJobs, error: jobsError } = await supabase
      .from("scraping_jobs")
      .select("*")
      .eq("status", "idle")
      .limit(10); // Increase limit since we're optimizing

    if (jobsError) {
      console.error("Error fetching scraping jobs:", jobsError);
      throw jobsError;
    }

    if (!scrapingJobs || scrapingJobs.length === 0) {
      console.log("No active scraping jobs found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active scraping jobs found",
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

    for (const jobRow of scrapingJobs) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
        last_run: jobRow.last_run,
        events_found: jobRow.events_found,
      };

      const skipCheck = shouldSkipJobScraping(job);
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

    // Scrape events from filtered jobs
    const allScrapedEvents: ScrapedEvent[] = [];
    let totalDuplicatesSkipped = 0;

    for (const jobRow of jobsToProcess) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
      };

      const scrapeResult = await scrapeWebsite(
        job,
        existingEventsWithFingerprints
      );
      allScrapedEvents.push(...scrapeResult.events);
      totalDuplicatesSkipped += scrapeResult.duplicatesSkipped;

      // Update job status
      await supabase
        .from("scraping_jobs")
        .update({
          last_run: new Date().toISOString(),
          events_found: scrapeResult.newEventsCount,
        })
        .eq("id", job.id);
    }

    console.log(
      `Scraped ${allScrapedEvents.length} new events, skipped ${totalDuplicatesSkipped} duplicates`
    );

    if (allScrapedEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `No new events found. Skipped ${totalDuplicatesSkipped} duplicates and ${skippedJobs.length} recently scraped jobs.`,
          events_processed: 0,
          duplicates_skipped: totalDuplicatesSkipped,
          jobs_skipped: skippedJobs.length,
          skipped_jobs: skippedJobs,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Process events with AI enhancement
    console.log("Processing events with AI enhancement...");
    const enhancedEvents: ScrapedEvent[] = [];
    let enhancedCount = 0;

    for (const event of allScrapedEvents) {
      if (openaiApiKey || claudeApiKey) {
        const enhancedEvent = await enhanceEventWithAI(
          event,
          openaiApiKey,
          claudeApiKey
        );
        enhancedEvents.push(enhancedEvent);
        if (enhancedEvent.is_enhanced) enhancedCount++;
        console.log(
          `Processed event: ${event.title} (enhanced: ${enhancedEvent.is_enhanced})`
        );
      } else {
        console.log("No AI API key available, using original descriptions");
        enhancedEvents.push({
          ...event,
          enhanced_description: event.original_description,
          is_enhanced: false,
        });
      }
    }

    // Insert enhanced events into database
    console.log("Inserting events into database...");

    const eventsToInsert = enhancedEvents.map((event) => ({
      title: event.title,
      original_description: event.original_description,
      enhanced_description: event.enhanced_description,
      date: event.date.toISOString(),
      location: event.location,
      venue: event.venue,
      category: event.category,
      price: event.price,
      source_url: event.source_url,
      is_enhanced: event.is_enhanced,
      is_featured: event.is_featured,
    }));

    const { data: insertedEvents, error: insertError } = await supabase
      .from("events")
      .upsert(eventsToInsert, {
        onConflict: "title,venue",
        ignoreDuplicates: false,
      })
      .select();

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
        openai_available: !!openaiApiKey,
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
