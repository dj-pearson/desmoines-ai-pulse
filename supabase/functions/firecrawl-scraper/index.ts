import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        events: `Extract all events from this website content from ${currentUrl}.

WEBSITE CONTENT:
${content.substring(0, 15000)} 

Please analyze this content and extract ALL events, concerts, shows, festivals, or activities. For each event, provide:
- title: Event title/name
- date: Event date (convert to YYYY-MM-DD format if possible)
- location: Venue or location name
- venue: Specific venue name if different from location
- description: Event description
- category: Type of event (Concert, Festival, Sports, etc.)
- price: Ticket price or "Free" if no cost mentioned
- source_url: Extract the specific event URL or venue website URL if available, otherwise use the page URL

IMPORTANT: Look for individual event URLs, "Visit Website" links, venue websites, or specific event pages in the content. Use these specific URLs instead of the general page URL when possible.

Format as JSON array ONLY - no other text:
[
  {
    "title": "Event Name",
    "date": "2025-07-30",
    "location": "Des Moines, IA", 
    "venue": "Venue Name",
    "description": "Event description",
    "category": "Concert",
    "price": "$25",
    "source_url": "https://specific-event-or-venue-url.com"
  }
]

Return empty array [] if no events found. Focus on upcoming events only.`,

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

Return empty array [] if no attractions found.`
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
      attractions: 'attractions'
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
                transformedData = {
                  title: item.title?.substring(0, 200) || "Untitled Event",
                  original_description: item.description?.substring(0, 500) || "",
                  enhanced_description: item.description?.substring(0, 500) || "",
                  date: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
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