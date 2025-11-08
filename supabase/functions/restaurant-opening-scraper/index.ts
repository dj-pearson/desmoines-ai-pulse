import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scrapeUrl } from "../_shared/scraper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const claudeApiKey = Deno.env.get('CLAUDE_API')!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface RestaurantOpening {
  name: string;
  description?: string;
  location?: string;
  cuisine?: string;
  opening_date?: string;
  opening_timeframe?: string;
  status: 'opening_soon' | 'newly_opened' | 'announced';
  source_url?: string;
  phone?: string;
  website?: string;
  price_range?: string;
}

interface ScraperSource {
  url: string;
  name: string;
  type: 'news' | 'blog' | 'directory';
}

// Default sources to scrape for restaurant openings
const DEFAULT_SOURCES: ScraperSource[] = [
  {
    url: 'https://www.desmoinesregister.com/search/?q=restaurant+opening',
    name: 'Des Moines Register - Restaurant Openings',
    type: 'news'
  },
  {
    url: 'https://www.catchdesmoines.com/restaurants/',
    name: 'Catch Des Moines - Restaurants',
    type: 'directory'
  },
  {
    url: 'https://dsm.eater.com/maps/best-new-restaurants-des-moines',
    name: 'Eater Des Moines - New Restaurants',
    type: 'blog'
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sources = DEFAULT_SOURCES } = await req.json().catch(() => ({}));
    
    console.log(`🚀 Starting restaurant opening scraper with ${sources.length} sources`);

    let totalRestaurantsFound = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const source of sources) {
      console.log(`🌐 Scraping source: ${source.name} (${source.url})`);

      try {
        // Use universal scraper (Puppeteer/Playwright/Firecrawl)
        const scrapeResult = await scrapeUrl(source.url, {
          waitTime: 5000,
          timeout: 30000,
        });

        if (!scrapeResult.success) {
          console.error(`❌ Scraping error for ${source.url}: ${scrapeResult.error}`);
          errors.push(`Failed to scrape ${source.name}: ${scrapeResult.error}`);
          continue;
        }

        const content = scrapeResult.markdown || scrapeResult.text || scrapeResult.html || '';
        
        console.log(`📄 ${scrapeResult.backend} returned ${content.length} characters from ${source.name} (took ${scrapeResult.duration}ms)`);

        if (!content || content.length < 100) {
          console.error(`❌ No usable content returned from ${source.url}`);
          errors.push(`No usable content from ${source.name}`);
          continue;
        }

        // Extract restaurant openings using Claude AI
        const claudePrompt = `You are an expert at extracting NEW restaurant opening information from websites. Analyze this content from ${source.url} and find EVERY new restaurant opening, upcoming restaurant, or recently opened restaurant.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

WEBSITE CONTENT:
${content.substring(0, 20000)}

CRITICAL PARSING INSTRUCTIONS:

🎯 WHAT TO LOOK FOR:
- Restaurants that are "opening soon" or "coming soon"
- Recently opened restaurants (within last 3-6 months)
- Announced restaurant projects
- Restaurant construction or renovation announcements
- New concepts from existing restaurant groups
- Franchise expansions
- Restaurant relocations or reopenings

🔍 SPECIFIC PATTERNS:
- Keywords: "opening", "coming soon", "now open", "grand opening", "announced", "plans to open"
- Temporal indicators: "spring 2025", "this summer", "Q2 2025", "late 2025"
- Construction language: "under construction", "renovating", "building out space"
- Ownership mentions: "chef X is opening", "restaurateur Y announces"

📅 DATE & STATUS EXTRACTION:
- If EXACT DATE is given (e.g., "June 15, 2025"): 
  * opening_date: "2025-06-15"
  * opening_timeframe: null
  * status: "opening_soon"

- If APPROXIMATE timeframe (e.g., "Summer 2025", "Q2 2025"):
  * opening_date: null
  * opening_timeframe: "Summer 2025" (or "Q2 2025", etc.)
  * status: "announced"

- If ALREADY OPENED recently (within 3 months):
  * opening_date: actual opening date if available
  * status: "newly_opened"

- If vague future reference ("later this year", "soon"):
  * opening_date: null
  * opening_timeframe: "2025" or "Coming Soon"
  * status: "announced"

🏢 REQUIRED INFORMATION:
For EVERY restaurant opening you find, extract:
- name: Restaurant name (REQUIRED)
- description: What makes this restaurant unique, concept, menu highlights
- location: Full address or area (e.g., "West Des Moines, IA", "Downtown Des Moines")
- cuisine: Type of cuisine (Italian, Mexican, American, Asian Fusion, etc.)
- opening_date: Exact date in YYYY-MM-DD format (if available)
- opening_timeframe: Approximate timeframe if exact date not available
- status: "opening_soon", "newly_opened", or "announced"
- source_url: Direct URL to article about this opening (if different from page URL)
- phone: Phone number if mentioned
- website: Restaurant website if mentioned
- price_range: $, $$, $$$, or $$$$ if indicated

VALIDATION RULES:
✅ Must have a restaurant name
✅ Must indicate it's NEW (opening, opening soon, recently opened, or announced)
✅ Prefer specific details over vague mentions
✅ Include both chain and independent restaurants
✅ Include food trucks or pop-ups if they're permanent locations

❌ EXCLUDE:
- Restaurants that have been open for years (unless major renovation/reopening)
- Temporary pop-ups or events
- Food festivals or one-time dining events
- Restaurants that have already closed

FORMAT AS JSON ARRAY ONLY - no other text:
[
  {
    "name": "Restaurant Name",
    "description": "Restaurant concept and menu highlights",
    "location": "Full address or area",
    "cuisine": "Cuisine Type",
    "opening_date": "2025-06-15",
    "opening_timeframe": null,
    "status": "opening_soon",
    "source_url": "${source.url}",
    "phone": "515-xxx-xxxx",
    "website": "https://restaurant-website.com",
    "price_range": "$$"
  }
]

🚨 REQUIREMENT: Extract EVERY new restaurant opening mentioned. Return [] ONLY if absolutely no openings are found.`;

        console.log(`🤖 Sending content to Claude AI for extraction...`);

        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': claudeApiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{
              role: 'user',
              content: claudePrompt
            }]
          }),
        });

        if (!claudeResponse.ok) {
          const errorText = await claudeResponse.text();
          console.error(`❌ Claude API error: ${claudeResponse.status} - ${errorText}`);
          errors.push(`Claude AI extraction failed for ${source.name}`);
          continue;
        }

        const claudeData = await claudeResponse.json();
        const extractedText = claudeData.content?.[0]?.text || '[]';
        
        console.log(`🤖 Claude response: ${extractedText.substring(0, 500)}...`);

        // Parse the extracted JSON
        let restaurants: RestaurantOpening[] = [];
        try {
          const jsonMatch = extractedText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            restaurants = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse Claude response as JSON:`, parseError);
          errors.push(`Failed to parse AI response for ${source.name}`);
          continue;
        }

        console.log(`✨ Extracted ${restaurants.length} restaurant openings from ${source.name}`);
        totalRestaurantsFound += restaurants.length;

        // Insert or update restaurants in database
        for (const restaurant of restaurants) {
          try {
            // Check if restaurant already exists (by name AND similar location)
            const { data: existingList } = await supabase
              .from('restaurants')
              .select('id, name, location, status, opening_date, opening_timeframe')
              .ilike('name', restaurant.name);

            // Find match only if BOTH name and location match (same restaurant in same location)
            // If name matches but location is different, treat as new location (allow it)
            let existing = null;
            if (existingList && existingList.length > 0) {
              // Extract city/area from locations for comparison
              const newLoc = (restaurant.location || '').toLowerCase();
              const newCity = newLoc.split(',')[0].trim(); // Get city/area part
              
              // Find restaurant with matching name AND location
              const locationMatch = existingList.find(r => {
                const existLoc = (r.location || '').toLowerCase();
                const existCity = existLoc.split(',')[0].trim();
                
                // Match if cities are the same or one contains the other
                return existCity === newCity || 
                       existCity.includes(newCity) || 
                       newCity.includes(existCity) ||
                       existLoc === newLoc;
              });
              
              // Only update if we found a location match (same restaurant in same city)
              // If no location match, it's a new location - allow as new entry
              existing = locationMatch || null;
            }

            if (existing) {
              // Define status hierarchy (lower number = earlier in lifecycle)
              const statusHierarchy: Record<string, number> = {
                'announced': 1,
                'opening_soon': 2,
                'newly_opened': 3,
                'open': 4,
              };

              const existingStatusLevel = statusHierarchy[existing.status] || 0;
              const newStatusLevel = statusHierarchy[restaurant.status] || 0;

              // Determine if we should update
              const shouldUpdate = 
                // Status is elevated (announced -> opening_soon -> newly_opened -> open)
                newStatusLevel > existingStatusLevel ||
                // Opening date changed (only update if new date exists and is different)
                (restaurant.opening_date && existing.opening_date !== restaurant.opening_date) ||
                // Opening timeframe changed
                (restaurant.opening_timeframe && existing.opening_timeframe !== restaurant.opening_timeframe) ||
                // New information added (description, website, etc.)
                (restaurant.description && !existing.description) ||
                (restaurant.website && !existing.website);

              if (shouldUpdate) {
                // Build update object with smart merging
                const updateData: any = {
                  updated_at: new Date().toISOString(),
                };

                // Update status if elevated or if current is null
                if (newStatusLevel > existingStatusLevel || !existing.status) {
                  updateData.status = restaurant.status;
                }

                // Update opening date if changed
                if (restaurant.opening_date && existing.opening_date !== restaurant.opening_date) {
                  updateData.opening_date = restaurant.opening_date;
                }

                // Update opening timeframe if changed
                if (restaurant.opening_timeframe && existing.opening_timeframe !== restaurant.opening_timeframe) {
                  updateData.opening_timeframe = restaurant.opening_timeframe;
                }

                // Add new information (don't overwrite existing)
                if (restaurant.description) updateData.description = restaurant.description;
                if (restaurant.cuisine) updateData.cuisine = restaurant.cuisine;
                if (restaurant.location) updateData.location = restaurant.location;
                if (restaurant.source_url) updateData.source_url = restaurant.source_url;
                if (restaurant.phone) updateData.phone = restaurant.phone;
                if (restaurant.website) updateData.website = restaurant.website;
                if (restaurant.price_range) updateData.price_range = restaurant.price_range;

                const { error: updateError } = await supabase
                  .from('restaurants')
                  .update(updateData)
                  .eq('id', existing.id);

                if (updateError) {
                  console.error(`❌ Error updating restaurant ${restaurant.name}:`, updateError);
                  errors.push(`Failed to update ${restaurant.name}: ${updateError.message}`);
                } else {
                  const changes = [];
                  if (updateData.status) changes.push(`status: ${existing.status} → ${restaurant.status}`);
                  if (updateData.opening_date) changes.push(`date: ${existing.opening_date || 'none'} → ${restaurant.opening_date}`);
                  console.log(`✅ Updated: ${restaurant.name} (${changes.join(', ')})`);
                  totalUpdated++;
                }
              } else {
                console.log(`⏭️ Skipped: ${restaurant.name} (no significant changes)`);
              }
            } else {
              // Insert new restaurant
              const { error: insertError } = await supabase
                .from('restaurants')
                .insert({
                  name: restaurant.name,
                  description: restaurant.description,
                  location: restaurant.location || 'Des Moines, IA',
                  cuisine: restaurant.cuisine,
                  opening_date: restaurant.opening_date,
                  opening_timeframe: restaurant.opening_timeframe,
                  status: restaurant.status,
                  source_url: restaurant.source_url || source.url,
                  phone: restaurant.phone,
                  website: restaurant.website,
                  price_range: restaurant.price_range,
                  is_featured: false,
                  rating: null,
                });

              if (insertError) {
                console.error(`❌ Error inserting restaurant ${restaurant.name}:`, insertError);
                errors.push(`Failed to insert ${restaurant.name}: ${insertError.message}`);
              } else {
                console.log(`✅ Inserted: ${restaurant.name} (${restaurant.status})`);
                totalInserted++;
              }
            }
          } catch (dbError) {
            console.error(`❌ Database error for ${restaurant.name}:`, dbError);
            errors.push(`Database error for ${restaurant.name}`);
          }
        }

      } catch (sourceError) {
        console.error(`❌ Error processing source ${source.name}:`, sourceError);
        errors.push(`Error processing ${source.name}: ${sourceError.message}`);
      }
    }

    console.log(`✅ Scraping complete: Found ${totalRestaurantsFound}, Inserted ${totalInserted}, Updated ${totalUpdated}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: totalRestaurantsFound,
        inserted: totalInserted,
        updated: totalUpdated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error(`❌ Error in restaurant opening scraper:`, error);
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
