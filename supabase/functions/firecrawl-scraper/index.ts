import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ScrapRequest {
  url: string;
  category: string;
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

    const { url, category }: ScrapRequest = await req.json();

    if (!url || !category) {
      return new Response(
        JSON.stringify({ error: "URL and category are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`🚀 Starting Firecrawl scrape of ${url} for ${category}`);

    // Use Firecrawl to get JavaScript-rendered content
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown', 'html'],
        waitFor: 5000, // Wait 5 seconds for JavaScript to load
        timeout: 30000, // 30 second timeout
      }),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error(`❌ Firecrawl API error: ${firecrawlResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Firecrawl API error: ${firecrawlResponse.status}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const firecrawlData = await firecrawlResponse.json();
    const content = firecrawlData.data?.markdown || firecrawlData.data?.html || '';
    
    console.log(`📄 Firecrawl returned ${content.length} characters of content`);
    console.log(`📝 Content preview: ${content.substring(0, 500)}...`);

    if (!content || content.length < 100) {
      console.error(`❌ No usable content returned from Firecrawl`);
      return new Response(
        JSON.stringify({ error: "No content returned from Firecrawl" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract events using Claude AI
    const claudeApiKey = Deno.env.get('CLAUDE_API');
    
    if (!claudeApiKey) {
      console.error(`❌ Claude API key not found`);
      return new Response(
        JSON.stringify({ error: "Claude API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const eventPrompt = `Extract all events from this website content from ${url}.

WEBSITE CONTENT:
${content.substring(0, 20000)} 

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
    "source_url": "${url}"
  }
]

Return empty array [] if no events found. Focus on upcoming events only.`;

    console.log(`🤖 Sending ${content.length} characters to Claude AI`);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8000,
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
      console.error(`❌ Claude API error: ${claudeResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeResponse.status}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content?.[0]?.text?.trim();

    console.log(`🔍 Claude response length: ${responseText?.length || 0}`);
    console.log(`🔍 Claude response preview: ${responseText?.substring(0, 1000) || 'No text'}...`);

    if (!responseText) {
      console.error(`❌ No response text from Claude API`);
      return new Response(
        JSON.stringify({ error: "No response from Claude API" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse Claude's response
    let extractedEvents = [];
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
        console.error(`❌ No JSON array found in Claude response. Full response: ${responseText}`);
        return new Response(
          JSON.stringify({ error: "Could not parse events from Claude response" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      extractedEvents = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(extractedEvents)) {
        console.error(`❌ Parsed data is not an array: ${typeof extractedEvents}`);
        extractedEvents = [];
      }
      
      console.log(`🤖 AI extracted ${extractedEvents.length} events from ${url}`);
      
    } catch (parseError) {
      console.error(`❌ Could not parse AI response JSON:`, parseError);
      console.error(`❌ JSON string that failed to parse: ${responseText.substring(0, 2000)}`);
      extractedEvents = [];
    }

    // Filter future events (including today)
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0); // Set to start of today
    const futureEvents = extractedEvents.filter(event => {
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

    console.log(`🕒 After filtering past events: ${futureEvents.length} items (removed ${extractedEvents.length - futureEvents.length} past events)`);

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
      totalFound: extractedEvents.length,
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