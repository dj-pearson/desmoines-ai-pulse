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
  openaiApiKey: string,
  claudeApiKey?: string
): Promise<any> {
  const enhancementPrompt = `Enhance this event description to be more engaging and informative while keeping it concise (max 150 words). Original description: "${event.original_description}"`;

  // Try Claude API first if available (it's more reliable and has higher limits)
  if (claudeApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with Claude API`);

      const claudeResponse = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "anthropic-version": "2023-06-01",
            "x-api-key": claudeApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `You are a helpful assistant that enhances event descriptions for a Des Moines events website. Make descriptions engaging, informative, and locally relevant. ${enhancementPrompt}`,
              },
            ],
          }),
        }
      );

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        const enhancedDescription = claudeData.content[0]?.text?.trim();

        if (enhancedDescription) {
          console.log(`✅ Claude API enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      } else {
        const errorText = await claudeResponse.text();
        console.log(`Claude API error for ${event.title}: ${errorText}`);
      }
    } catch (error) {
      console.error(`Claude API failed for event ${event.title}:`, error);
    }
  }

  // Fallback to OpenAI if Claude fails or isn't available
  if (openaiApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with OpenAI API`);

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

      if (openaiResponse.ok) {
        const openaiData = await openaiResponse.json();
        const enhancedDescription =
          openaiData.choices[0]?.message?.content?.trim();

        if (enhancedDescription) {
          console.log(`✅ OpenAI enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      } else {
        const errorText = await openaiResponse.text();
        console.log(`OpenAI API error for ${event.title}: ${errorText}`);

        // Check if it's a quota error
        if (
          openaiResponse.status === 429 ||
          errorText.includes("insufficient_quota")
        ) {
          console.log(
            `OpenAI quota exceeded for event ${event.title}, using original description`
          );
        }
      }
    } catch (error) {
      console.error(`OpenAI API failed for event ${event.title}:`, error);
    }
  }

  // If both APIs fail, use original description
  console.log(
    `No AI enhancement available for ${event.title}, using original description`
  );
  return {
    ...event,
    enhanced_description: event.original_description,
    is_enhanced: false,
  };
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
    const claudeApiKey = Deno.env.get("CLAUDE_API"); // Assuming CLAUDE_API is also available

    console.log("Processing events with AI enhancement...");

    const enhancedEvents = [];
    let enhancedCount = 0;

    for (const event of mockScrapedEvents) {
      if (openaiApiKey || claudeApiKey) {
        // Only attempt AI if at least one API key is available
        const enhancedEvent = await enhanceEventWithAI(
          event,
          openaiApiKey,
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
