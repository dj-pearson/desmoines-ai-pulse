import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Mock event scraping data - in a real implementation, this would scrape from actual sources
const mockScrapedEvents = [
  {
    title: "Des Moines Art Festival",
    original_description:
      "Annual art festival featuring local artists and live music in downtown Des Moines.",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    location: "Downtown Des Moines",
    venue: "Western Gateway Park",
    category: "Art",
    price: "Free admission",
    source_url: "https://desmoinesartsfestival.org",
    is_featured: true,
  },
  {
    title: "Iowa Cubs Baseball Game",
    original_description:
      "Triple-A baseball game featuring the Iowa Cubs vs. Nashville Sounds.",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    location: "Principal Park",
    venue: "Principal Park",
    category: "Sports",
    price: "$12-$35",
    source_url: "https://www.iowacubs.com",
    is_featured: true,
  },
  {
    title: "Farmers Market Saturday",
    original_description:
      "Weekly farmers market with local produce, crafts, and food vendors.",
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    location: "Downtown Des Moines",
    venue: "Court Avenue",
    category: "Food",
    price: "Free to browse",
    source_url: "https://www.desmoinesfarmersmarket.com",
    is_featured: false,
  },
];

async function enhanceEventWithAI(
  event: any,
  openaiApiKey: string
): Promise<any> {
  try {
    const enhancementPrompt = `Enhance this event description to be more engaging and informative while keeping it concise (max 150 words). Original description: "${event.original_description}"`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that enhances event descriptions for a Des Moines events website. Make descriptions engaging, informative, and locally relevant.",
            },
            {
              role: "user",
              content: enhancementPrompt,
            },
          ],
          max_tokens: 200,
          temperature: 0.7,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);

      // Check if it's a quota error
      if (
        openaiResponse.status === 429 ||
        errorText.includes("insufficient_quota")
      ) {
        console.log(
          `Quota exceeded for event ${event.title}, using original description`
        );
        return {
          ...event,
          enhanced_description: event.original_description,
          is_enhanced: false,
        };
      }

      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const enhancedDescription = openaiData.choices[0]?.message?.content?.trim();

    return {
      ...event,
      enhanced_description: enhancedDescription || event.original_description,
      is_enhanced: !!enhancedDescription,
    };
  } catch (error) {
    console.error(`Failed to enhance event ${event.title}:`, error);
    // If enhancement fails for any reason, use original description
    return {
      ...event,
      enhanced_description: event.original_description,
      is_enhanced: false,
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting event scraping process...");

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OpenAI API key (optional - if not available, skip AI enhancement)
    const openaiApiKey = Deno.env.get("OPENAI_API");

    console.log("Processing events with AI enhancement...");

    const enhancedEvents = [];
    let enhancedCount = 0;

    for (const event of mockScrapedEvents) {
      if (openaiApiKey) {
        const enhancedEvent = await enhanceEventWithAI(event, openaiApiKey);
        enhancedEvents.push(enhancedEvent);
        if (enhancedEvent.is_enhanced) enhancedCount++;
        console.log(
          `Processed event: ${event.title} (enhanced: ${enhancedEvent.is_enhanced})`
        );
      } else {
        console.log(
          "OpenAI API key not available, using original descriptions"
        );
        enhancedEvents.push({
          ...event,
          enhanced_description: event.original_description,
          is_enhanced: false,
        });
      }
    }

    // Insert enhanced events into database
    console.log("Inserting events into database...");

    // Format events for database insertion
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
        message: `Successfully scraped and processed ${enhancedEvents.length} events`,
        events_processed: enhancedEvents.length,
        events_enhanced: enhancedCount,
        openai_available: !!openaiApiKey,
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
