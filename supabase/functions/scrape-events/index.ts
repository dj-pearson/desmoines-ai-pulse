import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScrapingJob {
  id: string;
  name: string;
  status: string;
  config: {
    url: string;
    selectors: {
      title: string;
      description: string;
      date: string;
      location: string;
      price?: string;
      category?: string;
    };
    schedule: string;
    isActive: boolean;
  };
}

interface ScrapedEvent {
  title: string;
  original_description: string;
  date: Date;
  location: string;
  venue: string;
  category: string;
  price: string;
  source_url: string;
  is_featured: boolean;
  enhanced_description?: string;
  is_enhanced?: boolean;
}

// Simple HTML parser for extracting text content from HTML strings
function extractTextFromHTML(html: string): string {
  // Remove script and style elements
  html = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove HTML tags
  html = html.replace(/<[^>]*>/g, " ");

  // Decode HTML entities
  html = html.replace(/&nbsp;/g, " ");
  html = html.replace(/&amp;/g, "&");
  html = html.replace(/&lt;/g, "<");
  html = html.replace(/&gt;/g, ">");
  html = html.replace(/&quot;/g, '"');
  html = html.replace(/&#39;/g, "'");

  // Clean up whitespace
  html = html.replace(/\s+/g, " ").trim();

  return html;
}

// Basic CSS selector matching for simple selectors
function querySelectorText(html: string, selector: string): string {
  try {
    // Handle multiple selectors separated by comma
    const selectors = selector.split(",").map((s) => s.trim());

    for (const sel of selectors) {
      // Simple class selector (.class-name)
      if (sel.startsWith(".")) {
        const className = sel.substring(1);
        const classRegex = new RegExp(
          `class="[^"]*\\b${className}\\b[^"]*"[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)(?=<\/[^>]*>)`,
          "i"
        );
        const match = html.match(classRegex);
        if (match && match[1]) {
          return extractTextFromHTML(match[1]);
        }
      }

      // Simple tag selector (h1, h2, etc.)
      if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(sel)) {
        const tagRegex = new RegExp(
          `<${sel}[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)(?=<\/${sel}>)`,
          "i"
        );
        const match = html.match(tagRegex);
        if (match && match[1]) {
          return extractTextFromHTML(match[1]);
        }
      }

      // Time element with datetime attribute
      if (sel.includes("time[datetime]")) {
        const timeRegex =
          /<time[^>]*datetime="([^"]*)"[^>]*>([^<]*(?:<[^>]*>[^<]*)*?)<\/time>/i;
        const match = html.match(timeRegex);
        if (match && match[2]) {
          return extractTextFromHTML(match[2]);
        }
      }
    }

    return "";
  } catch (error) {
    console.error("Error parsing selector:", selector, error);
    return "";
  }
}

async function scrapeWebsite(job: ScrapingJob): Promise<ScrapedEvent[]> {
  const events: ScrapedEvent[] = [];

  try {
    console.log(`Scraping ${job.name} from ${job.config.url}`);

    const response = await fetch(job.config.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${job.config.url}: ${response.status}`);
      return events;
    }

    const html = await response.text();
    console.log(`Fetched HTML from ${job.name}, length: ${html.length}`);

    // For now, create one sample event per job
    // This is a simplified approach - in a real scraper, you'd parse multiple events
    const title =
      querySelectorText(html, job.config.selectors.title) ||
      `Event from ${job.name}`;
    const description =
      querySelectorText(html, job.config.selectors.description) ||
      `Event scraped from ${job.config.url}`;
    const location =
      querySelectorText(html, job.config.selectors.location) ||
      "Des Moines, IA";
    const price =
      querySelectorText(html, job.config.selectors.price || "") ||
      "See website";
    const category =
      querySelectorText(html, job.config.selectors.category || "") || "General";

    // Parse date or use a future date
    let eventDate = new Date(
      Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000
    ); // Random date in next 30 days
    const dateText = querySelectorText(html, job.config.selectors.date);
    if (dateText) {
      const parsedDate = new Date(dateText);
      if (!isNaN(parsedDate.getTime())) {
        eventDate = parsedDate;
      }
    }

    const event: ScrapedEvent = {
      title: title.substring(0, 200), // Limit title length
      original_description: description.substring(0, 500), // Limit description length
      date: eventDate,
      location: location.substring(0, 100),
      venue: location.substring(0, 100),
      category: category.substring(0, 50),
      price: price.substring(0, 50),
      source_url: job.config.url,
      is_featured: Math.random() > 0.7, // 30% chance of being featured
    };

    events.push(event);
    console.log(`Scraped event: ${event.title} from ${job.name}`);
  } catch (error) {
    console.error(`Error scraping ${job.name}:`, error);
  }

  return events;
}

async function enhanceEventWithAI(
  event: ScrapedEvent,
  openaiApiKey: string,
  claudeApiKey?: string
): Promise<ScrapedEvent> {
  // Try Claude API first
  if (claudeApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with Claude API`);

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
            model: "claude-3-haiku-20240307",
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `Enhance this event description to be more engaging and informative. Keep it under 150 words and maintain all key details:

Event: ${event.title}
Description: ${event.original_description}
Location: ${event.location}
Category: ${event.category}

Enhanced description:`,
              },
            ],
          }),
        }
      );

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        const enhancedDescription = claudeData.content?.[0]?.text?.trim();

        if (enhancedDescription) {
          console.log(`✅ Claude API enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      }
    } catch (error) {
      console.error("Claude API error:", error);
    }
  }

  // Fallback to OpenAI
  if (openaiApiKey) {
    try {
      console.log(`Attempting to enhance event ${event.title} with OpenAI API`);

      const openaiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "user",
                content: `Enhance this event description to be more engaging and informative. Keep it under 150 words and maintain all key details:

Event: ${event.title}
Description: ${event.original_description}
Location: ${event.location}
Category: ${event.category}

Enhanced description:`,
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
          openaiData.choices?.[0]?.message?.content?.trim();

        if (enhancedDescription) {
          console.log(`✅ OpenAI enhanced event: ${event.title}`);
          return {
            ...event,
            enhanced_description: enhancedDescription,
            is_enhanced: true,
          };
        }
      } else {
        const errorData = await openaiResponse.json();
        console.error("OpenAI API error:", errorData);
      }
    } catch (error) {
      console.error("OpenAI API error:", error);
    }
  }

  // If both fail, use original
  console.log(`Using original description for: ${event.title}`);
  return {
    ...event,
    enhanced_description: event.original_description,
    is_enhanced: false,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting event scraping process...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const openaiApiKey = Deno.env.get("OPENAI_API");
    const claudeApiKey = Deno.env.get("CLAUDE_API");

    // Fetch active scraping jobs from database
    console.log("Fetching scraping jobs from database...");
    const { data: scrapingJobs, error: jobsError } = await supabase
      .from("scraping_jobs")
      .select("*")
      .eq("status", "idle")
      .limit(5); // Limit to 5 jobs to avoid timeout

    if (jobsError) {
      console.error("Error fetching scraping jobs:", jobsError);
      throw jobsError;
    }

    if (!scrapingJobs || scrapingJobs.length === 0) {
      console.log("No active scraping jobs found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active scraping jobs found",
          events_processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Found ${scrapingJobs.length} active scraping jobs`);

    // Scrape events from all active jobs
    const allScrapedEvents: ScrapedEvent[] = [];

    for (const jobRow of scrapingJobs) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
      };

      if (job.config?.isActive && job.config?.url) {
        const scrapedEvents = await scrapeWebsite(job);
        allScrapedEvents.push(...scrapedEvents);

        // Update job status
        await supabase
          .from("scraping_jobs")
          .update({
            last_run: new Date().toISOString(),
            events_found: scrapedEvents.length,
          })
          .eq("id", job.id);
      }
    }

    console.log(`Scraped ${allScrapedEvents.length} events total`);

    if (allScrapedEvents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No events found from scraping",
          events_processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Process events with AI enhancement
    console.log("Processing events with AI enhancement...");
    const enhancedEvents: ScrapedEvent[] = [];
    let enhancedCount = 0;

    for (const event of allScrapedEvents) {
      if (openaiApiKey || claudeApiKey) {
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
        jobs_processed: scrapingJobs.length,
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
