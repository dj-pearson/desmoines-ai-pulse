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

    // For admin dashboard, only skip if scraped within last 2 minutes
    if (minutesSinceLastRun < 2) {
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
  console.log(`🔍 Attempting to extract date with selector: "${dateSelector}"`);

  let dateText = querySelectorText(html, dateSelector);

  // If primary selector fails, try common date patterns in the HTML
  if (!dateText) {
    console.log(`🔍 Primary selector failed, trying fallback patterns...`);

    // Try to find any date-like text in the HTML
    const datePatterns = [
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b\d{1,2}-\d{1,2}-\d{4}\b/g,
    ];

    for (const pattern of datePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first reasonable looking date
        dateText = matches[0];
        console.log(`🔍 Found date via pattern matching: "${dateText}"`);
        break;
      }
    }
  }

  if (!dateText) {
    console.log(`🔍 No date text found`);
    return null;
  }

  console.log(`🔍 Raw date text: "${dateText}"`);

  // Try multiple date parsing approaches
  const cleanDateText = dateText.trim();

  // Try parsing the date
  let parsedDate = new Date(cleanDateText);

  // If invalid, try common date formats
  if (isNaN(parsedDate.getTime())) {
    console.log(`🔍 Initial parsing failed, trying specific patterns...`);

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
        console.log(
          `🔍 Trying pattern "${pattern}" with "${match[1]}" -> ${parsedDate}`
        );
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

    console.log(
      `🔍 Date validation: ${parsedDate.toDateString()}, range: ${threeDaysAgo.toDateString()} to ${twoYearsFromNow.toDateString()}`
    );

    if (parsedDate >= threeDaysAgo && parsedDate <= twoYearsFromNow) {
      console.log(`✅ Valid date found: ${parsedDate.toDateString()}`);
      return parsedDate;
    } else {
      console.log(`⚠️ Date out of valid range: ${parsedDate.toDateString()}`);
    }
  } else {
    console.log(`⚠️ Could not parse date: "${cleanDateText}"`);
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

    // Extract event data using enhanced logic
    const eventData = extractEventData(html, job);

    console.log(`🔍 Extracted event data:`, {
      title: eventData.title,
      date: eventData.date?.toISOString(),
      location: eventData.location,
      description: eventData.description?.substring(0, 100) + "...",
    });

    // Skip if no valid title or date
    if (!eventData.title || !eventData.date) {
      console.log(
        `⚠️ Skipping invalid event from ${job.name}: title="${eventData.title}", date=${eventData.date}`
      );
      return { events, newEventsCount: 0, duplicatesSkipped };
    }

    // Skip generic titles
    const genericTitles = [
      "event from",
      "community event",
      "see website",
      "schedule",
      "upcoming events",
      "shows",
      "events",
    ];
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

Deno.serve(async (req) => {
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

      console.log(`🔑 API Keys availability - Claude: ${claudeApiKey ? 'Available' : 'Missing'}`);

      // Check if we have Claude API key
      if (!claudeApiKey) {
        console.error("❌ No Claude API key found. Please configure CLAUDE_API environment variable.");
        return new Response(JSON.stringify({
          success: false,
          error: "Claude API key not configured. Please set CLAUDE_API environment variable in your Supabase project settings."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
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
      if (claudeApiKey) {
        const enhancedEvent = await enhanceEventWithAI(
          event,
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
