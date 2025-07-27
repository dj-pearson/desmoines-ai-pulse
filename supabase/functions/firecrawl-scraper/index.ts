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

    let allExtractedEvents = [];
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

      const eventPrompt = `Extract all events from this website content from ${currentUrl}.

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
    "source_url": "${currentUrl}"
  }
]

Return empty array [] if no events found. Focus on upcoming events only.`;

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
              content: eventPrompt,
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
      let pageEvents = [];
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
        
        pageEvents = JSON.parse(jsonMatch[0]);
        
        if (!Array.isArray(pageEvents)) {
          console.error(`❌ Parsed data is not an array for ${currentUrl}: ${typeof pageEvents}`);
          pageEvents = [];
        }
        
        console.log(`🤖 AI extracted ${pageEvents.length} events from ${currentUrl}`);
        allExtractedEvents.push(...pageEvents);
        
      } catch (parseError) {
        console.error(`❌ Could not parse AI response JSON for ${currentUrl}:`, parseError);
        continue; // Skip this page
      }
    }

    console.log(`🎯 Total events extracted from all pages: ${allExtractedEvents.length}`);

    // Filter future events (including today)
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Set to start of today
    const futureEvents = allExtractedEvents.filter(event => {
      if (!event.date) return true; // Keep events without dates
      
      try {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0); // Set to start of event day
        return eventDate >= currentDate; // Include today and future dates
      } catch (error) {
        console.log(`⚠️ Could not parse date: ${event.date}`);
        return true; // Keep events with unparseable dates
      }
    });

    console.log(`🕒 After filtering past events: ${futureEvents.length} items (removed ${allExtractedEvents.length - futureEvents.length} past events)`);

    // Insert into database
    let insertedCount = 0;
    const errors = [];

    if (futureEvents.length > 0) {
      // Process in batches to avoid rate limiting
      const batchSize = 10;
      for (let i = 0; i < futureEvents.length; i += batchSize) {
        const batch = futureEvents.slice(i, i + batchSize);

        try {
          // Transform data for database schema
          const transformedBatch = batch.map((item) => ({
            title: item.title?.substring(0, 200) || "Untitled Event",
            original_description: item.description?.substring(0, 500) || "",
            enhanced_description: item.description?.substring(0, 500) || "",
            date: item.date
              ? new Date(item.date).toISOString()
              : new Date().toISOString(),
            location: item.location?.substring(0, 100) || "Des Moines, IA",
            venue: item.venue?.substring(0, 100) || item.location?.substring(0, 100) || "TBD",
            category: item.category?.substring(0, 50) || "General",
            price: item.price?.substring(0, 50) || "See website",
            source_url: item.source_url || url,
            is_enhanced: false,
            is_featured: Math.random() > 0.8, // 20% chance of being featured
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          const { data, error } = await supabase
            .from('events')
            .insert(transformedBatch)
            .select();

          if (error) {
            console.error(`❌ Error inserting batch:`, error);
            errors.push(error);
          } else {
            insertedCount += data.length;
            console.log(`✅ Inserted ${data.length} events`);
          }
        } catch (error) {
          console.error(`❌ Error processing batch:`, error);
          errors.push(error);
        }
      }
    }

    const result = {
      success: true,
      totalFound: allExtractedEvents.length,
      futureEvents: futureEvents.length,
      inserted: insertedCount,
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