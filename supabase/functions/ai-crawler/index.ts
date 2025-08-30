/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fromZonedTime, utcToZonedTime, format } from "https://esm.sh/date-fns-tz@2.0.0?deps=date-fns@2.30.0";
import { format as dateFnsFormat, parseISO } from "https://esm.sh/date-fns@2.30.0";

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
async function findApiEndpoints(html: string, baseUrl: string): Promise<string[]> {
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
        if (endpoint.startsWith('/')) {
          endpoint = new URL(endpoint, baseUrl).href;
        }
        if (endpoint.startsWith('http')) {
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

// Enhanced HTML content extraction with better patterns for CatchDesMoines
function extractRelevantContent(html: string): string {
  console.log(`🔍 Starting content extraction from ${html.length} character HTML`);
  
  // Simple approach: just clean HTML and limit size to avoid CPU timeout
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  
  // Limit to 15000 characters to avoid CPU timeout
  const finalContent = cleanHtml.substring(0, 15000);
  
  console.log(`📏 Final content length: ${finalContent.length} characters (reduced from ${html.length})`);
  return finalContent;
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
    events: `You are an expert at extracting event information from websites, especially from CatchDesMoines.com. Your task is to find EVERY SINGLE EVENT mentioned in this content from ${url}.

CURRENT DATE: July 26, 2025
WEBSITE CONTENT:
${relevantContent}

CRITICAL PARSING INSTRUCTIONS FOR CATCHDESMOINES.COM:

🎯 WHAT TO LOOK FOR:
- ANY text that mentions specific event names or titles
- Venue names that host events (fairgrounds, theaters, arenas, etc.)
- Date patterns (July 26, Jul 26th, 7/26, 2025, etc.)
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
    "price": "Price or See website"
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
    "website": "https://restaurant-website.com"
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
    "rating": 4.2
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

      // Try to find API endpoints first
      if (category === 'events') {
        const apiEndpoints = await findApiEndpoints(html, url);
        if (apiEndpoints.length > 0) {
          console.log(`🔍 Found potential API endpoints: ${apiEndpoints.join(', ')}`);
          
          // Try to fetch from API endpoints
          for (const endpoint of apiEndpoints.slice(0, 3)) { // Try first 3 endpoints
            try {
              const apiResponse = await fetch(endpoint, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Accept": "application/json, text/javascript, */*",
                },
              });
              
              if (apiResponse.ok) {
                const apiData = await apiResponse.text();
                if (apiData.length > 100) {
                  console.log(`✅ Got API data from ${endpoint}: ${apiData.length} chars`);
                  relevantContent = apiData + "\n\n--- ORIGINAL HTML ---\n\n" + relevantContent;
                  break;
                }
              }
            } catch (error) {
              console.log(`⚠️ API endpoint failed ${endpoint}:`, error.message);
            }
          }
        }
      }

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
            model: "claude-3-5-sonnet-20241022", // Use stable model
            max_tokens: 8000, // Increased for multiple events
            temperature: 0.1, // Lower temperature for more precise extraction
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
      
      console.log(`🔍 Claude API response status: ${claudeResponse.status}`);
      console.log(`🔍 Claude response structure check - content exists: ${!!claudeData.content}`);
      console.log(`🔍 Claude response text length: ${responseText?.length || 0}`);
      console.log(`🔍 Claude response preview: ${responseText?.substring(0, 1000) || 'No text'}...`);

      if (responseText) {
        try {
          // Extract JSON from the response - try multiple patterns
          let jsonMatch = responseText.match(/\[[\s\S]*\]/);
          
          if (!jsonMatch) {
            // Try to find JSON in code blocks
            jsonMatch = responseText.match(/```json\s*(\[[\s\S]*?\])\s*```/) ||
                       responseText.match(/```\s*(\[[\s\S]*?\])\s*```/);
            if (jsonMatch) jsonMatch[0] = jsonMatch[1];
          }
          
          if (!jsonMatch) {
            console.error(`❌ No JSON array found in Claude response. Full response: ${responseText}`);
            return [];
          }
          
          console.log(`🔍 Extracted JSON string: ${jsonMatch[0].substring(0, 500)}...`);
          
          const extractedData = JSON.parse(jsonMatch[0]);
          
          if (!Array.isArray(extractedData)) {
            console.error(`❌ Parsed data is not an array: ${typeof extractedData}`);
            return [];
          }
          
          console.log(`🤖 AI extracted ${extractedData.length} ${category} items from ${url}`);
          
          // Add source_url to each extracted item
          const itemsWithSource = extractedData.map(item => ({
            ...item,
            source_url: url
          }));
          
          // Log sample item for debugging
          if (itemsWithSource.length > 0) {
            console.log(`🔍 Sample extracted item: ${JSON.stringify(itemsWithSource[0])}`);
          }
          
          return itemsWithSource;
        } catch (parseError) {
          console.error(`❌ Could not parse AI response JSON:`, parseError);
          console.error(`❌ JSON string that failed to parse: ${responseText.substring(0, 2000)}`);
        }
      } else {
        console.error(`❌ No response text from Claude API`);
      }
    } else {
      const errorText = await claudeResponse.text();
      console.error(`❌ Claude API error: ${claudeResponse.status} - ${errorText}`);
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
 
  const eventTimeZone = "America/Chicago"; // Default to Central Time 
 
  try { 
    console.log(`🕐 Parsing date string: "${dateStr}"`);
    
    // Parse the date string as Central Time and convert to UTC
    // The AI provides dates like "2025-09-13 19:00:00" which should be interpreted as Central Time
    
    let centralTimeString: string;
    
    // Match YYYY-MM-DD HH:MM:SS format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      centralTimeString = dateStr;
    } 
    // Match YYYY-MM-DD format (default to 7:30 PM Central)
    else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      centralTimeString = `${dateStr} 19:30:00`;
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
      const month = (fallbackDate.getMonth() + 1).toString().padStart(2, '0');
      const day = fallbackDate.getDate().toString().padStart(2, '0');
      const hours = fallbackDate.getHours().toString().padStart(2, '0');
      const minutes = fallbackDate.getMinutes().toString().padStart(2, '0');
      const seconds = fallbackDate.getSeconds().toString().padStart(2, '0');
      centralTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    // Convert Central Time to UTC
    // parseISO treats the string as naive time, then fromZonedTime converts it assuming it's in Central Time
    const localDate = parseISO(centralTimeString);
    const utcDate = fromZonedTime(localDate, eventTimeZone);
    
    console.log(`🕐 Parsed: ${dateStr} -> Central: ${centralTimeString} -> UTC: ${utcDate.toISOString()}`);
 
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
  const nowInCentral = utcToZonedTime(new Date(), "America/Chicago"); 
 
  return events.filter((event) => { 
    if (!event.date) return true; // Keep events without dates 
 
    try { 
      const parsed = parseEventDateTime(event.date); 
      if (parsed && parsed.event_start_utc) { 
        // Compare the UTC timestamp of the event with the current UTC time 
        return parsed.event_start_utc.getTime() >= nowInCentral.getTime(); 
      } 
      return true; // Keep if parsing fails 
    } catch (error) { 
      console.log(`⚠️ Could not parse date for filtering: ${event.date}`, error); 
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
        key = `${item.title?.toLowerCase()?.trim()}|${item.venue?.toLowerCase()?.trim()}`;
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
            .ilike("title", item.title?.trim())
            .ilike("venue", item.venue?.trim());
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
          console.log(`🔍 Checking duplicate for restaurant opening: "${item.name?.trim()}" in table ${tableName} (exact match)`);
          break;
      }

      const { data: existing, error } = await query.limit(1);

      if (error) {
        console.error(`Error checking duplicate for ${item.title || item.name}:`, error);
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
      // Transform data for database schema
      const transformedBatch = batch.map((item) => {
        const baseItem = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_featured: Math.random() > 0.8, // 20% chance of being featured
        };

        switch (category) {
          case "events":
            const parsedEventDateTime = item.date ? parseEventDateTime(item.date) : null;
            
            // Skip events where we can't parse the date properly
            if (!parsedEventDateTime?.event_start_utc) {
              console.warn(`⚠️ Skipping event with unparseable date: ${item.title} - ${item.date}`);
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
              cuisine: item.cuisine?.substring(0, 100) || "American",
              location: item.location?.substring(0, 200) || "Des Moines, IA",
              description: item.description?.substring(0, 500) || "",
              phone: item.phone?.substring(0, 20) || null,
              website: item.website?.substring(0, 200) || null,
              price_range: item.price_range?.substring(0, 20) || null,
              rating: item.rating || null,
              opening_date: item.opening_date
                ? (parseEventDateTime(item.opening_date) || new Date(item.opening_date)).toISOString().split("T")[0]
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
      }).filter(item => item !== null); // Remove null items (events with bad dates)

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
          console.error(`❌ Restaurant openings batch that failed:`, JSON.stringify(transformedBatch, null, 2));
        }
        errors.push(error);
      } else {
        insertedCount += data.length;
        console.log(`✅ Inserted ${data.length} ${category} items`);
        if (category === "restaurant_openings" && data.length > 0) {
          console.log(`🍽️ Successfully inserted restaurant openings:`, data.map(d => d.name).join(', '));
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

    // For CatchDesMoines and similar sites, try multiple strategies
    const urlsToTry = category === 'events' ? [
      url,
      url.replace(/\/$/, '') + '/events/',
      url.replace(/\/$/, '') + '/calendar/',
      // Try common CatchDesMoines patterns
      'https://www.catchdesmoines.com/events/',
      'https://www.catchdesmoines.com/events/search/',
      'https://www.catchdesmoines.com/calendar/',
    ] : findBestEventUrl(url);
    
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
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
          },
        });

        if (response.ok) {
          const html = await response.text();

          // Enhanced scoring for CatchDesMoines-style content
          const eventKeywords = (html.match(/event|concert|show|game|performance|calendar|festival|fair|exhibition|theater|sports/gi) || []).length;
          const venueKeywords = (html.match(/arena|center|theatre|theater|park|fairground|stadium|auditorium|hall/gi) || []).length;
          const dateKeywords = (html.match(/2025|july|august|september|october|november|december|\d{1,2}\/\d{1,2}/gi) || []).length;
          const titleKeywords = (html.match(/warren|anastasia|senior games|painting|sale-a-bration|waitress|iowa artists|horse racing|biergarten/gi) || []).length;
          
          const totalScore = eventKeywords + (venueKeywords * 2) + (dateKeywords * 1.5) + (titleKeywords * 3);
          
          console.log(
            `📊 ${tryUrl}: Score ${totalScore} (events:${eventKeywords}, venues:${venueKeywords}, dates:${dateKeywords}, titles:${titleKeywords}) in ${html.length} chars`
          );

          if (totalScore > maxEventContent) {
            maxEventContent = totalScore;
            bestHtml = html;
            bestUrl = tryUrl;
            console.log(
              `✅ New best URL: ${tryUrl} (score: ${totalScore})`
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
    
    // Debug: Log a few sample items for restaurant_openings
    if (category === "restaurant_openings" && filteredItems.length > 0) {
      console.log(`🔍 Sample restaurant opening items:`, JSON.stringify(filteredItems.slice(0, 2), null, 2));
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
      console.log(`💾 Attempting to insert ${newItems.length} ${category} items`);
      const insertResult = await insertData(supabase, category, newItems);
      insertedCount = insertResult.insertedCount;
      insertErrors = insertResult.errors;
      
      if (category === "restaurant_openings") {
        console.log(`🍽️ Restaurant openings insertion result: ${insertedCount} inserted, ${insertErrors.length} errors`);
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
