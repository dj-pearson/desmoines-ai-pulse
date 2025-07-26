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

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get("OPENAI_API");
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    console.log("Processing events with AI enhancement...");

    const enhancedEvents = [];

    for (const event of mockScrapedEvents) {
      try {
        // Enhance event description using OpenAI
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
          console.error("OpenAI API error:", await openaiResponse.text());
          throw new Error("Failed to enhance event description");
        }

        const openaiData = await openaiResponse.json();
        const enhancedDescription =
          openaiData.choices[0]?.message?.content?.trim();

        enhancedEvents.push({
          ...event,
          enhanced_description:
            enhancedDescription || event.original_description,
          is_enhanced: !!enhancedDescription,
        });

        console.log(`Enhanced event: ${event.title}`);
      } catch (error) {
        console.error(`Failed to enhance event ${event.title}:`, error);
        // If enhancement fails, use original description
        enhancedEvents.push({
          ...event,
          enhanced_description: event.original_description,
          is_enhanced: false,
        });
      }
    }

    // Insert enhanced events into database
    console.log("Inserting events into database...");

    const { data: insertedEvents, error: insertError } = await supabase
      .from("events")
      .upsert(enhancedEvents, {
        onConflict: "title,date",
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
        message: `Successfully scraped and enhanced ${enhancedEvents.length} events`,
        events_processed: enhancedEvents.length,
        events_enhanced: enhancedEvents.filter((e) => e.is_enhanced).length,
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
