/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
  date: string;
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

// Enhanced HTML content extraction
function extractRelevantContent(html: string): string {
  // Remove scripts, styles, and other non-content elements
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Try to extract main content areas, but be more inclusive
  const contentPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<section[^>]*>([\s\S]*?)<\/section>/gi,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*calendar[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*id="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<ul[^>]*class="[^"]*events?[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
  ];

  let relevantContent = "";
  for (const pattern of contentPatterns) {
    const matches = cleanHtml.match(pattern);
    if (matches) {
      relevantContent += matches.join("\n\n--- SECTION ---\n\n");
    }
  }

  // If no specific content areas found, extract more content but remove navigation/footer
  if (!relevantContent || relevantContent.length < 1000) {
    let fallbackContent = cleanHtml
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");

    relevantContent = fallbackContent.substring(0, 15000); // Increased limit
  }

  // Increase the limit significantly to capture more events
  return relevantContent.substring(0, 20000); // Increased for more events
}

// AI-powered content extraction using Claude
async function extractContentWithAI(
  html: string,
  category: string,
  url: string,
  claudeApiKey: string
): Promise<any[]> {
  const relevantContent = extractRelevantContent(html);

  const prompts = {
    events: `You are an expert at extracting event information from websites. Extract ALL individual events from this website content from ${url}.

CURRENT DATE: July 26, 2025
IMPORTANT: Only extract events that are TODAY or in the FUTURE. Skip any events from the past.

WEBSITE CONTENT:
${relevantContent}

CRITICAL INSTRUCTIONS:
1. FIND EVERY SINGLE EVENT - This is the most important requirement
2. Look for ALL events in lists, tables, calendars, schedules, grids
3. Extract events from repeating patterns like game schedules, concert lineups
4. Scan the ENTIRE content thoroughly - don't stop after finding one event
5. Include events even with partial information
6. ONLY include events from July 26, 2025 onwards (skip past events)

COMPREHENSIVE SEARCH PATTERNS:
- Sports schedules (games, matches, tournaments)
- Concert/music listings (shows, performances, artists)
- Event calendars and directories
- Show schedules and venue listings
- Festival and community event lists
- Recurring event series

For each FUTURE event found, extract:
- title: Event name/title
- description: Event details or description
- date: Event date (YYYY-MM-DD HH:MM:SS format, must be July 26, 2025 or later)
- location: Full address or location
- venue: Venue name
- category: Event type (Sports, Music, Entertainment, etc.)
- price: Ticket price or "See website"

EXTRACTION STRATEGY:
1. First scan for date patterns (2025 dates, month names, etc.)
2. Look for event titles near these dates
3. Extract ALL events in lists or grids
4. Check tables and structured data
5. Look for recurring patterns of event information

FORMAT AS JSON ARRAY with ALL events:
[
  {
    "title": "Event Title",
    "description": "Event description",
    "date": "2025-MM-DD HH:MM:SS",
    "location": "Full address",
    "venue": "Venue Name", 
    "category": "Event Category",
    "price": "Price or 'See website'"
  }
]

ABSOLUTELY CRITICAL: 
- Extract EVERY event you can find, not just one
- Skip events before July 26, 2025
- If you find 5+ events, include them ALL
- Return empty array [] only if NO future events exist`,

    restaurants: `Extract all restaurants from this website content from ${url}.

WEBSITE CONTENT:
${relevantContent}

Please analyze this content and extract ALL restaurants you can find. For each restaurant, provide:
- name: Restaurant name
- cuisine: Type of cuisine (Italian, American, Asian, etc.)
- location: Full address or location description
- rating: Numerical rating if available (1-5 scale)
- price_range: Price range ($, $$, $$$, $$$$, or specific ranges)
- description: Brief description of the restaurant
- phone: Phone number if available
- website: Website URL if available

Format as JSON array:
[
  {
    "name": "Restaurant Name",
    "cuisine": "Cuisine Type",
    "location": "Full address",
    "rating": 4.5,
    "price_range": "$$",
    "description": "Restaurant description",
    "phone": "Phone number",
    "website": "Website URL"
  }
]

Return empty array [] if no restaurants found.`,

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

    playgrounds: `Extract all playgrounds or play areas from this website content from ${url}.

WEBSITE CONTENT:
${relevantContent}

Please analyze this content and extract ALL playgrounds, play areas, or children's recreational facilities. For each playground, provide:
- name: Playground or park name
- location: Full address or location description
- description: Description of the playground features
- age_range: Age range for children (e.g., "2-12 years", "All ages")
- amenities: Array of amenities/features (swings, slides, climbing structures, etc.)
- rating: Numerical rating if available (1-5 scale)

Format as JSON array:
[
  {
    "name": "Playground Name",
    "location": "Full address",
    "description": "Playground description",
    "age_range": "Age range",
    "amenities": ["swings", "slides", "climbing structure"],
    "rating": 4.2
  }
]

Return empty array [] if no playgrounds found.`,

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
  };

  try {
    console.log(`🤖 Using Claude AI to extract ${category} data from ${url}`);
    console.log(
      `📄 Content length being sent to AI: ${relevantContent.length} characters`
    );
    console.log(`📝 Content preview: ${relevantContent.substring(0, 500)}...`);

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
          max_tokens: 6000, // Increased significantly for multiple events
          messages: [
            {
              role: "user",
              content: prompts[category as keyof typeof prompts],
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
            const extractedData = JSON.parse(jsonMatch[0]);
            console.log(
              `🤖 AI extracted ${extractedData.length} ${category} items from ${url}`
            );
            return extractedData;
          }
        } catch (parseError) {
          console.log(`⚠️ Could not parse AI response JSON:`, parseError);
        }
      }
    } else {
      console.log(`⚠️ Claude API error: ${claudeResponse.status}`);
    }
  } catch (error) {
    console.error(`❌ Error in AI content extraction:`, error);
  }

  return [];
}

// Filter out past events
function filterFutureEvents(events: any[]): any[] {
  const currentDate = new Date("2025-07-26"); // Current date

  return events.filter((event) => {
    if (!event.date) return true; // Keep events without dates

    try {
      const eventDate = new Date(event.date);
      return eventDate >= currentDate;
    } catch (error) {
      console.log(`⚠️ Could not parse date: ${event.date}`);
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
    category === "restaurant_openings" ? "restaurant_openings" : category;
  let duplicates = 0;
  const newItems = [];

  for (const item of items) {
    const fingerprint = generateFingerprint(item, category);

    let query;
    switch (category) {
      case "events":
        query = supabase
          .from(tableName)
          .select("id")
          .eq("title", item.title)
          .eq("venue", item.venue);
        if (item.date) {
          query = query.eq("date", item.date);
        }
        break;
      case "restaurants":
      case "restaurant_openings":
      case "playgrounds":
      case "attractions":
        query = supabase
          .from(tableName)
          .select("id")
          .eq("name", item.name)
          .ilike("location", `%${item.location.substring(0, 20)}%`);
        break;
    }

    const { data: existing } = await query.limit(1);

    if (existing && existing.length > 0) {
      console.log(`⚠️ Duplicate found: ${item.title || item.name}`);
      duplicates++;
    } else {
      newItems.push({ ...item, fingerprint });
    }
  }

  return { newItems, duplicates };
}

// Insert data into appropriate table
async function insertData(
  supabase: any,
  category: string,
  items: any[]
): Promise<{ success: boolean; insertedCount: number; errors: any[] }> {
  const tableName =
    category === "restaurant_openings" ? "restaurant_openings" : category;
  const errors = [];
  let insertedCount = 0;

  // Process items in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    try {
      // Transform data for database schema
      const transformedBatch = batch.map((item) => {
        const baseItem = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_featured: Math.random() > 0.8, // 20% chance of being featured
        };

        switch (category) {
          case "events":
            return {
              ...baseItem,
              title: item.title?.substring(0, 200) || "Untitled Event",
              original_description: item.description?.substring(0, 500) || "",
              enhanced_description: item.description?.substring(0, 500) || "",
              date: item.date
                ? new Date(item.date).toISOString()
                : new Date().toISOString(),
              location: item.location?.substring(0, 100) || "Des Moines, IA",
              venue:
                item.venue?.substring(0, 100) ||
                item.location?.substring(0, 100) ||
                "TBD",
              category: item.category?.substring(0, 50) || "General",
              price: item.price?.substring(0, 50) || "See website",
              source_url: item.source_url || "",
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
            };
          case "restaurant_openings":
            return {
              ...baseItem,
              name: item.name?.substring(0, 200) || "New Restaurant",
              description: item.description?.substring(0, 500) || "",
              location: item.location?.substring(0, 200) || "Des Moines, IA",
              cuisine: item.cuisine?.substring(0, 100) || "American",
              opening_date: item.opening_date
                ? new Date(item.opening_date).toISOString().split("T")[0]
                : null,
              status: item.status || "announced",
              source_url: item.source_url || "",
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
            };
          default:
            return item;
        }
      });

      const { data, error } = await supabase
        .from(tableName)
        .insert(transformedBatch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch:`, error);
        errors.push(error);
      } else {
        insertedCount += data.length;
        console.log(`✅ Inserted ${data.length} ${category} items`);
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

    // Initialize services
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API");

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

    // Try multiple URLs to find the best event page
    const urlsToTry = findBestEventUrl(url);
    console.log(`🔍 Will try these URLs: ${urlsToTry.join(", ")}`);

    let bestHtml = "";
    let bestUrl = url;
    let maxEventContent = 0;

    // Try each URL to find the one with the most event content
    for (const tryUrl of urlsToTry) {
      try {
        console.log(`📄 Trying URL: ${tryUrl}`);

        const response = await fetch(tryUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        });

        if (response.ok) {
          const html = await response.text();

          // Quick test for event-related content
          const eventContentTest = (
            html.match(/event|concert|show|game|performance|calendar/gi) || []
          ).length;
          console.log(
            `📊 ${tryUrl}: Found ${eventContentTest} event-related keywords in ${html.length} chars`
          );

          if (eventContentTest > maxEventContent) {
            maxEventContent = eventContentTest;
            bestHtml = html;
            bestUrl = tryUrl;
            console.log(
              `✅ New best URL: ${tryUrl} (${eventContentTest} keywords)`
            );
          }
        } else {
          console.log(`❌ Failed to fetch ${tryUrl}: ${response.status}`);
        }
      } catch (error) {
        console.log(`⚠️ Error fetching ${tryUrl}:`, error.message);
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
    const extractedItems = await extractContentWithAI(
      bestHtml,
      category,
      bestUrl,
      claudeApiKey
    );

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
      const insertResult = await insertData(supabase, category, newItems);
      insertedCount = insertResult.insertedCount;
      insertErrors = insertResult.errors;
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
