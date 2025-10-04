import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseISO } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";

// Marker time for events without specific times (7:31:58 PM Central)
const NO_TIME_MARKER = "19:31:58";

interface ScrapRequest {
  url: string;
  category: string;
  maxPages?: number; // New optional parameter for pagination
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Enhanced time parsing for events with Central Time handling 
interface ParsedDateTime { 
  event_start_local: string; 
  event_timezone: string; 
  event_start_utc: Date; 
} 

function parseEventDateTime(dateStr: string): ParsedDateTime | null { 
  if (!dateStr) return null; 
 
  const eventTimeZone = "America/Chicago"; // Default to Central Time 
 
  try { 
    console.log(`🕐 Parsing date string: "${dateStr}"`);
    
    let centralTimeString: string;
    
    // Match YYYY-MM-DD HH:MM:SS format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      centralTimeString = dateStr;
    } 
    // Match YYYY-MM-DD format (use marker time to indicate no specific time)
    else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      centralTimeString = `${dateStr} ${NO_TIME_MARKER}`;
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
    console.log(`⚠️ Could not parse date: ${dateStr}`, error); 
  } 
 
  return null;
}

serve(async (req) => {
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

    const { url, category, maxPages = 3 }: ScrapRequest = await req.json();

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🚀 Starting Firecrawl scrape of ${url} for ${category} (max ${maxPages} pages)`);

    // Generate URLs for pagination if it's a Catch Des Moines events page
    const urlsToScrape = [];
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes('catchdesmoines.com') && urlObj.pathname.includes('/events')) {
      // Generate paginated URLs for Catch Des Moines
      for (let page = 0; page < maxPages; page++) {
        const pageUrl = new URL(url);
        if (page > 0) {
          pageUrl.searchParams.set('skip', (page * 12).toString());
          pageUrl.searchParams.set('bounds', 'false');
          pageUrl.searchParams.set('view', 'grid');
          pageUrl.searchParams.set('sort', 'date');
        }
        urlsToScrape.push(pageUrl.toString());
      }
    } else {
      // For other sites, just scrape the single URL
      urlsToScrape.push(url);
    }

    console.log(`📄 Will scrape ${urlsToScrape.length} pages: ${urlsToScrape.join(', ')}`);

    let allExtractedItems = [];
    let totalContentLength = 0;

    // Process each URL for pagination support
    for (const currentUrl of urlsToScrape) {
      console.log(`🌐 Scraping page: ${currentUrl}`);
      
      // Use Firecrawl to get JavaScript-rendered content
      const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: currentUrl,
          formats: ['markdown', 'html'],
          waitFor: 3000, // Reduced wait time for pagination
          timeout: 20000, // Reduced timeout for pagination
        }),
      });

      if (!firecrawlResponse.ok) {
        const errorText = await firecrawlResponse.text();
        console.error(`❌ Firecrawl API error for ${currentUrl}: ${firecrawlResponse.status} - ${errorText}`);
        continue; // Skip this page and continue with others
      }

      const firecrawlData = await firecrawlResponse.json();
      const content = firecrawlData.data?.markdown || firecrawlData.data?.html || '';
      
      console.log(`📄 Firecrawl returned ${content.length} characters from ${currentUrl}`);
      totalContentLength += content.length;

      if (!content || content.length < 100) {
        console.error(`❌ No usable content returned from ${currentUrl}`);
        continue; // Skip this page
      }

      // Extract events using Claude AI for this page
      const claudeApiKey = Deno.env.get('CLAUDE_API');
      
      if (!claudeApiKey) {
        console.error(`❌ Claude API key not found`);
        break; // Exit loop if no API key
      }

      // Generate category-specific prompts
      const prompts = {
        events: `You are an expert at extracting event information from websites, especially from CatchDesMoines.com and other Des Moines area event sites. Your task is to find EVERY SINGLE EVENT mentioned in this content from ${currentUrl}.

CURRENT DATE: July 30, 2025
WEBSITE CONTENT:
${content.substring(0, 15000)}

CRITICAL PARSING INSTRUCTIONS:

🎯 WHAT TO LOOK FOR:
- ANY text that mentions specific event names or titles
- Venue names that host events (fairgrounds, theaters, arenas, etc.)
- Date patterns (July 30, Jul 30th, 7/30, 2025, etc.)
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

🎯 PRIORITY URL EXTRACTION: Look specifically for "Visit Website" links or buttons that lead to external venue/event websites. These are usually found in:
- HTML like: <a href="https://external-venue.com" class="action-item">Visit Website</a>
- Links with text containing "Visit Website", "Official Website", "Venue Website"
- External URLs that are NOT catchdesmoines.com URLs
- Venue-specific website links (paintingwithatwist.com, etc.)

If you find a "Visit Website" or venue-specific URL, use that as the source_url instead of the catchdesmoines.com page URL.

🏢 VENUE EXTRACTION:
- Look for venue names near event titles
- Common Des Moines venues: Wells Fargo Arena, Civic Center, etc.
- County fairgrounds, high schools, parks
- If unclear → use "Des Moines, IA" as location

For EVERY event you find, extract:
- title: Exact event name from content
- date: YYYY-MM-DD HH:MM:SS (future dates only, in Central Time)
- location: City/state (default: "Des Moines, IA")
- venue: Specific venue name
- description: Any details about the event
- category: Music/Sports/Arts/Community/Entertainment/Festival
- price: If mentioned, or "See website"
- source_url: Venue-specific URL if available, otherwise page URL

CRITICAL SUCCESS FACTORS:
✅ Extract events even with incomplete info
✅ Use logical defaults for missing details
✅ Convert all date formats consistently to Central Time
✅ Include recurring events as separate entries
✅ Scan the ENTIRE content thoroughly

FORMAT AS JSON ARRAY ONLY - no other text:
[
  {
    "title": "Event Name",
    "date": "2025-MM-DD HH:MM:SS",
    "location": "Des Moines, IA", 
    "venue": "Venue Name",
    "description": "Event description",
    "category": "Concert",
    "price": "$25",
    "source_url": "https://specific-venue-website.com"
  }
]

🚨 ABSOLUTE REQUIREMENT: Extract EVERY event mentioned in the content. Return empty array [] ONLY if literally no events are found anywhere in the content.`,

        restaurants: `You are an expert at extracting restaurant information from websites like Eater.com, Des Moines Register, and restaurant listing sites. Your task is to find EVERY SINGLE RESTAURANT mentioned in this content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

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

For EVERY restaurant you find, extract:
- name: Exact restaurant name from content
- cuisine: Type of cuisine (Italian, American, Mexican, Asian Fusion, etc.)
- location: Address or area description (default: "Des Moines, IA")
- rating: Numerical rating 1-5 if mentioned, or null
- price_range: $, $$, $$$, or $$$$ based on content
- description: Key details about food, atmosphere, or specialties
- phone: Phone number if mentioned
- website: Website URL if mentioned

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

🚨 ABSOLUTE REQUIREMENT: Extract EVERY restaurant or food establishment mentioned in the content. Return empty array [] ONLY if literally no restaurants are found anywhere in the content.`,

        playgrounds: `You are an expert at extracting playground and children's recreation information from websites like visitdesmoines.com, Greater DSM, and family activity sites. Your task is to find EVERY SINGLE PLAYGROUND or children's recreational facility mentioned in this content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

CRITICAL PARSING INSTRUCTIONS FOR PLAYGROUND SITES:

🎯 WHAT TO LOOK FOR:
- Playground names (often park names or specific playground names)
- Children's recreation areas, splash pads, adventure playgrounds
- Parks with playground equipment mentioned
- Family-friendly recreational facilities
- Youth activity centers or outdoor play areas
- Age-specific play structures or facilities

For EVERY playground you find, extract:
- name: Exact playground or park name from content
- location: Address or area description (default: "Des Moines, IA")
- description: Key features, themes, or special attributes
- age_range: Target age group (e.g., "2-12 years", "All ages")
- amenities: Array of equipment and features
- rating: Numerical rating 1-5 if mentioned, or null

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

🚨 ABSOLUTE REQUIREMENT: Extract EVERY playground or children's recreational facility mentioned in the content. Return empty array [] ONLY if literally no playgrounds are found anywhere in the content.`,

        restaurant_openings: `Extract information about new restaurant openings from this website content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

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

        attractions: `Extract all attractions, tourist spots, or places of interest from this website content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)}

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

        competitor_analysis: `Analyze this competitor website content from ${currentUrl} and extract valuable content pieces for competitive analysis.

WEBSITE CONTENT:
${content.substring(0, 15000)}

Extract ALL content pieces that could be valuable for competitive analysis, including:
- Articles/blog posts about local attractions, events, or dining
- Event listings and promotional content
- Restaurant features or reviews
- Tourism-related content
- Community guides or recommendations
- Marketing campaigns or promotional materials

For each content piece, provide:
- title: Content title or headline
- description: Brief summary of the content
- url: Specific URL if different from page URL, otherwise use page URL
- content_type: Type of content (Article, Event Listing, Guide, Review, etc.)
- category: Content category (Tourism, Dining, Events, Attractions, etc.)
- publish_date: Publication date if available (YYYY-MM-DD format)
- engagement_indicators: Any social sharing numbers, comments, or engagement metrics found

Format as JSON array:
[
  {
    "title": "Content Title",
    "description": "Content description and key points",
    "url": "${currentUrl}",
    "content_type": "Article",
    "category": "Tourism",
    "publish_date": "2025-01-15",
    "engagement_indicators": {
      "likes": 25,
      "shares": 5,
      "comments": 3
    }
  }
]

Return empty array [] if no competitive content found.`
      };

      const selectedPrompt = prompts[category as keyof typeof prompts] || prompts.events;

      console.log(`🤖 Sending ${content.length} characters to Claude AI for ${currentUrl}`);

      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": claudeApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 6000,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: selectedPrompt,
            },
          ],
        }),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error(`❌ Claude API error for ${currentUrl}: ${claudeResponse.status} - ${errorText}`);
        continue; // Skip this page
      }

      const claudeData = await claudeResponse.json();
      const responseText = claudeData.content?.[0]?.text?.trim();

      console.log(`🔍 Claude response length for ${currentUrl}: ${responseText?.length || 0}`);

      if (!responseText) {
        console.error(`❌ No response text from Claude API for ${currentUrl}`);
        continue; // Skip this page
      }

      // Parse Claude's response
      let pageItems = [];
      try {
        // Extract JSON from the response
        let jsonMatch = responseText.match(/\[[\s\S]*\]/);
        
        if (!jsonMatch) {
          // Try to find JSON in code blocks
          jsonMatch = responseText.match(/```json\s*(\[[\s\S]*?\])\s*```/) ||
                     responseText.match(/```\s*(\[[\s\S]*?\])\s*```/);
          if (jsonMatch) jsonMatch[0] = jsonMatch[1];
        }
        
        if (!jsonMatch) {
          console.error(`❌ No JSON array found in Claude response for ${currentUrl}`);
          continue; // Skip this page
        }
        
        pageItems = JSON.parse(jsonMatch[0]);
        
        if (!Array.isArray(pageItems)) {
          console.error(`❌ Parsed data is not an array for ${currentUrl}: ${typeof pageItems}`);
          pageItems = [];
        }
        
        console.log(`🤖 AI extracted ${pageItems.length} ${category} items from ${currentUrl}`);
        allExtractedItems.push(...pageItems);
        
      } catch (parseError) {
        console.error(`❌ Could not parse AI response JSON for ${currentUrl}:`, parseError);
        continue; // Skip this page
      }
    }

    console.log(`🎯 Total ${category} extracted from all pages: ${allExtractedItems.length}`);

    // For events category, filter out past events
    let filteredItems = allExtractedItems;
    if (category === 'events') {
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      filteredItems = allExtractedItems.filter(item => {
        if (!item.date) return true;
        try {
          const itemDate = new Date(item.date);
          itemDate.setHours(0, 0, 0, 0);
          return itemDate >= currentDate;
        } catch (error) {
          console.log(`⚠️ Could not parse date: ${item.date}`);
          return true;
        }
      });
    }

    console.log(`🕒 After filtering: ${filteredItems.length} items (removed ${allExtractedItems.length - filteredItems.length} items)`);

    // Get appropriate table name and process items
    const tableMapping = {
      events: 'events',
      restaurants: 'restaurants', 
      playgrounds: 'playgrounds',
      restaurant_openings: 'restaurant_openings',
      attractions: 'attractions',
      competitor_analysis: 'competitor_content'
    };

    const tableName = tableMapping[category as keyof typeof tableMapping] || 'events';
    let insertedCount = 0;
    let updatedCount = 0;
    const errors = [];

    if (filteredItems.length > 0) {
      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < filteredItems.length; i += batchSize) {
        const batch = filteredItems.slice(i, i + batchSize);

        for (const item of batch) {
          try {
            // Transform data based on category
            let transformedData: any = {};
            
            switch (category) {
              case 'events':
                const parsedEventDateTime = item.date ? parseEventDateTime(item.date) : null;
                
                // Skip events where we can't parse the date properly
                if (!parsedEventDateTime?.event_start_utc) {
                  console.warn(`⚠️ Skipping event with unparseable date: ${item.title} - ${item.date}`);
                  continue; // Skip this item
                }
                
                transformedData = {
                  title: item.title?.substring(0, 200) || "Untitled Event",
                  original_description: item.description?.substring(0, 500) || "",
                  enhanced_description: item.description?.substring(0, 500) || "",
                  date: parsedEventDateTime.event_start_utc.toISOString(),
                  event_start_local: parsedEventDateTime.event_start_local,
                  event_timezone: parsedEventDateTime.event_timezone,
                  event_start_utc: parsedEventDateTime.event_start_utc,
                  location: item.location?.substring(0, 100) || "Des Moines, IA",
                  venue: item.venue?.substring(0, 100) || item.location?.substring(0, 100) || "TBD",
                  category: item.category?.substring(0, 50) || "General",
                  price: item.price?.substring(0, 50) || "See website",
                  source_url: item.source_url || url,
                  is_enhanced: false,
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'restaurants':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Unnamed Restaurant",
                  cuisine: item.cuisine?.substring(0, 100) || "American",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  rating: item.rating || null,
                  price_range: item.price_range?.substring(0, 20) || "$$",
                  description: item.description?.substring(0, 500) || "",
                  phone: item.phone?.substring(0, 20) || null,
                  website: item.website?.substring(0, 200) || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'playgrounds':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Playground",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  age_range: item.age_range?.substring(0, 50) || "All ages",
                  amenities: Array.isArray(item.amenities) ? item.amenities.slice(0, 10) : [],
                  rating: item.rating || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'attractions':
                transformedData = {
                  name: item.name?.substring(0, 200) || "Attraction",
                  type: item.type?.substring(0, 100) || "General",
                  location: item.location?.substring(0, 200) || "Des Moines, IA",
                  description: item.description?.substring(0, 500) || "",
                  rating: item.rating || null,
                  website: item.website?.substring(0, 200) || null,
                  is_featured: Math.random() > 0.8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                break;
                
              case 'competitor_analysis':
                // Find the competitor_id based on the URL
                const { data: competitors } = await supabase
                  .from('competitors')
                  .select('id')
                  .eq('website_url', url)
                  .single();
                
                transformedData = {
                  competitor_id: competitors?.id || null,
                  title: item.title?.substring(0, 200) || "Untitled Content",
                  description: item.description?.substring(0, 1000) || "",
                  url: item.url?.substring(0, 500) || url,
                  content_type: item.content_type?.substring(0, 100) || "General",
                  category: item.category?.substring(0, 100) || "General",
                  content_score: Math.floor(Math.random() * 10) + 1,
                  engagement_metrics: item.engagement_indicators || {},
                  scraped_at: new Date().toISOString(),
                };
                break;
                
              default:
                continue; // Skip unknown categories
            }

            // Check for duplicates
            let existingItems = [];
            if (category === 'events') {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('title', transformedData.title)
                .eq('venue', transformedData.venue);
              existingItems = data || [];
            } else if (category === 'competitor_analysis') {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('title', transformedData.title)
                .eq('competitor_id', transformedData.competitor_id);
              existingItems = data || [];
            } else {
              const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('name', transformedData.name);
              existingItems = data || [];
            }

            if (existingItems.length > 0) {
              console.log(`⚠️ Duplicate found: ${transformedData.title || transformedData.name}`);
              // Could implement update logic here if needed
            } else {
              // Insert new item
              if (category === 'events') {
                transformedData.is_featured = Math.random() > 0.8;
                transformedData.created_at = new Date().toISOString();
              }

              const { error: insertError } = await supabase
                .from(tableName)
                .insert([transformedData]);

              if (insertError) {
                console.error(`❌ Error inserting ${category} item:`, insertError);
                errors.push(insertError);
              } else {
                insertedCount++;
                console.log(`✅ Inserted new ${category}: ${transformedData.title || transformedData.name}`);
              }
            }
          } catch (error) {
            console.error(`❌ Error processing ${category} item:`, error);
            errors.push(error);
          }
        }
      }
    }

    const result = {
      success: true,
      totalFound: allExtractedItems.length,
      futureEvents: filteredItems.length,
      inserted: insertedCount,
      updated: updatedCount,
      errors: errors.length,
      url: url
    };

    console.log(`✅ Scrape completed: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(`❌ Error in Firecrawl scraper:`, error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});