import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob, type JobContext } from "../_shared/jobRunner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SocialMediaPost {
  content_type: "event" | "restaurant" | "general";
  content_id?: string;
  subject_type:
    | "event_of_the_day"
    | "restaurant_of_the_day"
    | "weekly_highlight"
    | "special_announcement";
  platform_type: "twitter_threads" | "facebook_linkedin" | "combined";
  post_content: string;
  post_title?: string;
  content_url?: string;
  webhook_urls: string[];
  ai_prompt_used: string;
  metadata: any;
}

// Helper functions
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const createSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const createEventSlug = (title: string, date: string): string => {
  const titleSlug = createSlug(title);
  const eventDate = new Date(date);
  const centralDate = new Date(
    eventDate.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  const year = centralDate.getFullYear();
  const month = String(centralDate.getMonth() + 1).padStart(2, "0");
  const day = String(centralDate.getDate()).padStart(2, "0");
  return `${titleSlug}-${year}-${month}-${day}`;
};

const generateContentUrl = (contentType: string, content: any): string => {
  const baseUrl = "https://desmoinesinsider.com";
  if (contentType === "event") {
    const slug = createEventSlug(content.title, content.date);
    return `${baseUrl}/events/${slug}`;
  } else if (contentType === "restaurant") {
    const slug = content.slug || createSlug(content.name);
    return `${baseUrl}/restaurants/${slug}`;
  }
  return baseUrl;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper function to check if we should post now based on time
  const shouldPostNow = (contentType: string): boolean => {
    const now = new Date();
    // Use Intl.DateTimeFormat for more reliable timezone conversion
    const centralTimeString = now.toLocaleString("en-US", { 
      timeZone: "America/Chicago",
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Parse the formatted string to get reliable Central Time
    const [datePart, timePart] = centralTimeString.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');
    
    const centralHour = parseInt(hour, 10);
    const centralMinute = parseInt(minute, 10);
    
    console.log(`Current UTC: ${now.toISOString()}`);
    console.log(`Current Central Time String: ${centralTimeString}`);
    console.log(`Parsed Central Hour: ${centralHour}, Minute: ${centralMinute}`);
    
    if (contentType === "event") {
      // Event posts at 9:00 AM Central (allow 9:00-9:59 AM)
      console.log(`Event check: Current hour ${centralHour} === 9? ${centralHour === 9}`);
      return centralHour === 9;
    } else if (contentType === "restaurant") {
      // Restaurant posts at 6:00 PM Central (allow 6:00-6:59 PM)
      console.log(`Restaurant check: Current hour ${centralHour} === 18? ${centralHour === 18}`);
      return centralHour === 18;
    }
    
    return false;
  };

  // Helper function to check if we already posted today
  const alreadyPostedToday = async (supabase: any, contentType: string): Promise<boolean> => {
    // Get current Central Time date
    const now = new Date();
    const centralTimeString = now.toLocaleString("en-US", { 
      timeZone: "America/Chicago",
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [month, day, year] = centralTimeString.split('/');
    
    // Create start and end of Central Time day in UTC
    const centralDate = new Date(`${year}-${month}-${day}T00:00:00`);
    const centralStartUTC = new Date(centralDate.getTime() + (6 * 60 * 60 * 1000)); // Central is UTC-6 in summer
    const centralEndUTC = new Date(centralStartUTC.getTime() + (24 * 60 * 60 * 1000) - 1);
    
    console.log(`Checking for posts between ${centralStartUTC.toISOString()} and ${centralEndUTC.toISOString()}`);
    
    const { data: todayPosts } = await supabase
      .from("social_media_posts")
      .select("id, created_at")
      .eq("content_type", contentType)
      .gte("created_at", centralStartUTC.toISOString())
      .lte("created_at", centralEndUTC.toISOString())
      .eq("status", "posted");
    
    const hasPosted = (todayPosts?.length || 0) > 0;
    console.log(`Already posted ${contentType} today: ${hasPosted} (found ${todayPosts?.length || 0} posts)`);
    if (todayPosts && todayPosts.length > 0) {
      console.log("Today's posts:", todayPosts.map(p => p.created_at));
    }
    return hasPosted;
  };

  // Helper function to check if we already generated today
  const alreadyGeneratedToday = async (supabase: any, contentType: string): Promise<boolean> => {
    // Get current Central Time date
    const now = new Date();
    const centralTimeString = now.toLocaleString("en-US", { 
      timeZone: "America/Chicago",
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [month, day, year] = centralTimeString.split('/');
    
    // Create start and end of Central Time day in UTC
    const centralDate = new Date(`${year}-${month}-${day}T00:00:00`);
    const centralStartUTC = new Date(centralDate.getTime() + (6 * 60 * 60 * 1000)); // Central is UTC-6 in summer
    const centralEndUTC = new Date(centralStartUTC.getTime() + (24 * 60 * 60 * 1000) - 1);
    
    console.log(`Checking for generated posts between ${centralStartUTC.toISOString()} and ${centralEndUTC.toISOString()}`);
    
    const { data: todayPosts } = await supabase
      .from("social_media_posts")
      .select("id, created_at, status")
      .eq("content_type", contentType)
      .gte("created_at", centralStartUTC.toISOString())
      .lte("created_at", centralEndUTC.toISOString())
      .in("status", ["draft", "posted"]);
    
    const hasGenerated = (todayPosts?.length || 0) > 0;
    console.log(`Already generated ${contentType} today: ${hasGenerated} (found ${todayPosts?.length || 0} posts)`);
    if (todayPosts && todayPosts.length > 0) {
      console.log("Today's generated posts:", todayPosts.map(p => `${p.created_at} (${p.status})`));
    }
    return hasGenerated;
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API");

    if (!claudeApiKey) {
      throw new Error("Claude API key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const requestBody = await req.json();
    const { action, contentType, subjectType, postId, triggerSource, manual } = requestBody;

    // WEB-AUTO-012: daily auto-post — the single cron-driven path that picks the
    // highest-signal upcoming event + a featured restaurant (no-repeat 30 days),
    // generates copy, and publishes via the configured webhooks. Admin/service
    // gated; wrapped in the WEB-AUTO-001 jobRunner. The Job Health "Re-run"
    // button invokes this fn with { manual: true } (no action) — treat that as
    // the safe default so a manual re-run does the daily post.
    if (action === "daily_auto_post" || (manual === true && !action)) {
      const authFail = await requireAdminOrApiKey(req, corsHeaders);
      if (authFail) return authFail;

      const jobResult = await runJob(
        "social-auto-post",
        (ctx) => runDailyAutoPost(supabase, claudeApiKey, ctx),
      );

      return new Response(
        JSON.stringify({
          success: jobResult.ok,
          automated: true,
          daily_auto_post: true,
          status: jobResult.status,
          result: jobResult.result,
          error: jobResult.error,
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      "Social Media Manager - Action:",
      action,
      "ContentType:",
      contentType,
      "SubjectType:",
      subjectType,
      "TriggerSource:",
      triggerSource
    );

    // Handle automated CRON triggers for generation only
    if (action === "automated_generation_only" || (action === "automated_check" && triggerSource === "cron")) {
      console.log("Processing automated generation from CRON system");
      
      const results = [];
      
      // Check if we should generate events (9 AM Central)
      if (shouldPostNow("event")) {
        console.log("Time check passed for events, checking if already generated today");
        const alreadyGeneratedEvent = await alreadyGeneratedToday(supabase, "event");
        
        if (!alreadyGeneratedEvent) {
          console.log("Generating event post (without publishing)");
          try {
            const eventResult = await generateAndPublishPost(supabase, claudeApiKey, "event", "event_of_the_day", false); // false = don't auto-publish
            results.push({ type: "event", success: true, result: eventResult });
          } catch (error) {
            console.error("Failed to generate event post:", error);
            results.push({ type: "event", success: false, error: error.message });
          }
        } else {
          console.log("Event already generated today, skipping");
          results.push({ type: "event", success: true, message: "Already generated today" });
        }
      }
      
      // Check if we should generate restaurants (6 PM Central)
      if (shouldPostNow("restaurant")) {
        console.log("Time check passed for restaurants, checking if already generated today");
        const alreadyGeneratedRestaurant = await alreadyGeneratedToday(supabase, "restaurant");
        
        if (!alreadyGeneratedRestaurant) {
          console.log("Generating restaurant post (without publishing)");
          try {
            const restaurantResult = await generateAndPublishPost(supabase, claudeApiKey, "restaurant", "restaurant_of_the_day", false); // false = don't auto-publish
            results.push({ type: "restaurant", success: true, result: restaurantResult });
          } catch (error) {
            console.error("Failed to generate restaurant post:", error);
            results.push({ type: "restaurant", success: false, error: error.message });
          }
        } else {
          console.log("Restaurant already generated today, skipping");
          results.push({ type: "restaurant", success: true, message: "Already generated today" });
        }
      }
      
      if (results.length === 0) {
        console.log("No posts needed for generation at this time");
        results.push({ message: "No posts scheduled for generation at current time" });
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          automated: true,
          generation_only: true,
          results,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle automated webhook publishing
    if (action === "publish_pending_posts") {
      console.log("Processing automated webhook publishing from CRON system");
      
      const results = [];
      
      // Find pending posts that were drafted today but not yet published
      const { data: pendingPosts, error: pendingError } = await supabase
        .from("social_media_posts")
        .select("*")
        .eq("status", "draft")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: true });
      
      if (pendingError) {
        console.error("Error fetching pending posts:", pendingError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to fetch pending posts: " + pendingError.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      console.log(`Found ${pendingPosts?.length || 0} pending posts to publish`);
      
      if (pendingPosts && pendingPosts.length > 0) {
        for (const post of pendingPosts) {
          try {
            console.log(`Publishing post ${post.id} via webhooks`);
            
            const webhookPromises = (post.webhook_urls as string[]).map(
              async (webhookUrl) => {
                try {
                  let webhookPayload;
      
                  if (post.platform_type === "combined") {
                    const contentFormats = JSON.parse(post.post_content as string);
                    webhookPayload = {
                      content_formats: {
                        twitter_threads: {
                          content: contentFormats.twitter_threads,
                          platforms: ["twitter", "threads"],
                        },
                        facebook_linkedin: {
                          content: contentFormats.facebook_linkedin,
                          platforms: ["facebook", "linkedin"],
                        },
                      },
                      title: post.post_title,
                      url: post.content_url,
                      subject_type: post.subject_type,
                      content_type: post.content_type,
                      metadata: post.metadata,
                    };
                  } else {
                    webhookPayload = {
                      platform: post.platform_type,
                      content: post.post_content,
                      title: post.post_title,
                      url: post.content_url,
                      subject_type: post.subject_type,
                      content_type: post.content_type,
                      metadata: post.metadata,
                    };
                  }
      
                  const response = await fetch(webhookUrl, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(webhookPayload),
                  });
      
                  return {
                    url: webhookUrl,
                    success: response.ok,
                    status: response.status,
                  };
                } catch (error) {
                  return {
                    url: webhookUrl,
                    success: false,
                    error: error.message,
                  };
                }
              }
            );
      
            const webhookResults = await Promise.all(webhookPromises);
            
            // Update post status to published
            const { error: updateError } = await supabase
              .from("social_media_posts")
              .update({
                status: "posted",
                posted_at: new Date().toISOString(),
                metadata: {
                  ...post.metadata,
                  webhook_results: webhookResults,
                },
              })
              .eq("id", post.id);
            
            if (updateError) {
              console.error(`Failed to update post ${post.id}:`, updateError);
              results.push({ 
                postId: post.id, 
                success: false, 
                error: updateError.message 
              });
            } else {
              console.log(`Successfully published post ${post.id}`);
              results.push({ 
                postId: post.id, 
                success: true, 
                webhookResults 
              });
            }
          } catch (error) {
            console.error(`Error publishing post ${post.id}:`, error);
            results.push({ 
              postId: post.id, 
              success: false, 
              error: error.message 
            });
          }
        }
      } else {
        results.push({ message: "No pending posts found to publish" });
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          automated: true,
          publishing_only: true,
          results,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "debug") {
      // Debug endpoint to check available content
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id, title, name, date")
        .gte("date", new Date().toISOString())
        .order("date", { ascending: true })
        .limit(5);

      const { data: allEvents, error: allEventsError } = await supabase
        .from("events")
        .select("id", { count: "exact" });

      const { data: restaurants, error: restaurantsError } = await supabase
        .from("restaurants")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: allRestaurants, error: allRestaurantsError } =
        await supabase.from("restaurants").select("id", { count: "exact" });

      return new Response(
        JSON.stringify({
          success: true,
          debug: {
            upcomingEvents: events?.length || 0,
            totalEvents: allEvents?.length || 0,
            recentRestaurants: restaurants?.length || 0,
            totalRestaurants: allRestaurants?.length || 0,
            sampleUpcomingEvents: events || [],
            sampleRecentRestaurants: restaurants || [],
            errors: {
              events: eventsError?.message,
              restaurants: restaurantsError?.message,
            },
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (action === "generate" || action === "generate_and_publish") {
      const autoPublish = action === "generate_and_publish";
      
      const result = await generateAndPublishPost(supabase, claudeApiKey, contentType, subjectType, autoPublish);
      
      return new Response(
        JSON.stringify({
          success: true,
          generated: true,
          published: autoPublish,
          ...result,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "publish") {
      if (!postId) {
        throw new Error("Post ID is required for publish action");
      }

      const { data: post, error: postError } = await supabase
        .from("social_media_posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (postError || !post) {
        throw new Error("Post not found");
      }

      const webhookPromises = (post.webhook_urls as string[]).map(
        async (webhookUrl) => {
          try {
            let webhookPayload;

            if (post.platform_type === "combined") {
              const contentFormats = JSON.parse(post.post_content as string);
              webhookPayload = {
                content_formats: {
                  twitter_threads: {
                    content: contentFormats.twitter_threads,
                    platforms: ["twitter", "threads"],
                  },
                  facebook_linkedin: {
                    content: contentFormats.facebook_linkedin,
                    platforms: ["facebook", "linkedin"],
                  },
                },
                title: post.post_title,
                url: post.content_url,
                subject_type: post.subject_type,
                content_type: post.content_type,
                metadata: post.metadata,
              };
            } else {
              webhookPayload = {
                platform: post.platform_type,
                content: post.post_content,
                title: post.post_title,
                url: post.content_url,
                subject_type: post.subject_type,
                content_type: post.content_type,
                metadata: post.metadata,
              };
            }

            const response = await fetch(webhookUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(webhookPayload),
            });

            return {
              url: webhookUrl,
              success: response.ok,
              status: response.status,
            };
          } catch (error) {
            return {
              url: webhookUrl,
              success: false,
              error: error.message,
            };
          }
        }
      );

      const webhookResults = await Promise.all(webhookPromises);

      const { error: updateError } = await supabase
        .from("social_media_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          metadata: {
            ...post.metadata,
            webhook_results: webhookResults,
          },
        })
        .eq("id", postId);

      if (updateError) {
        throw updateError;
      }

      console.log("Post published successfully:", postId, webhookResults);

      return new Response(
        JSON.stringify({
          success: true,
          webhookResults,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    throw new Error("Invalid action");
  } catch (error) {
    console.error("Social Media Manager Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper function to generate and publish posts
async function generateAndPublishPost(
  supabase: any,
  claudeApiKey: string,
  contentType: string,
  subjectType: string,
  autoPublish: boolean = true
) {
  console.log(`Starting generation for ${contentType} with auto-publish: ${autoPublish}`);
  
  // Get recent posts to avoid repetition
  const { data: recentPosts } = await supabase
    .from("social_media_posts")
    .select("content_id, content_type, subject_type, created_at")
    .gte(
      "created_at",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    ) // Last 7 days for diversity
    .order("created_at", { ascending: false })
    .limit(50);

  const recentContentIds = recentPosts?.map((p) => p.content_id).filter((id) => id) || [];
  console.log(`Found ${recentContentIds.length} recent content IDs to avoid`);

  // Choose content to feature
  let selectedContent: Record<string, unknown> | null = null;
  let contentUrl = "";

  if (contentType === "event") {
    const { data: allEvents } = await supabase
      .from("events")
      .select("*")
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true })
      .limit(50);

    if (allEvents && allEvents.length > 0) {
      // Filter out recently posted events
      let availableEvents = allEvents.filter(
        (event) => !recentContentIds.includes(event.id)
      );

      // If no events available after filtering, use all events
      if (availableEvents.length === 0) {
        availableEvents = allEvents;
      }

      // Filter for future events in Central Time
      const futureEvents = availableEvents.filter((event) => {
        const eventDate = new Date(event.date);
        const nowCentral = new Date(
          new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
        );
        const eventCentral = new Date(
          eventDate.toLocaleString("en-US", { timeZone: "America/Chicago" })
        );
        return eventCentral > nowCentral;
      });

      if (futureEvents.length > 0) {
        selectedContent = futureEvents[Math.floor(Math.random() * futureEvents.length)];
        contentUrl = generateContentUrl("event", selectedContent);
        console.log(`Selected event: ${selectedContent.title} (ID: ${selectedContent.id})`);
      }
    }
  } else if (contentType === "restaurant") {
    const { data: allRestaurants } = await supabase
      .from("restaurants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (allRestaurants && allRestaurants.length > 0) {
      // Filter out recently posted restaurants
      let availableRestaurants = allRestaurants.filter(
        (restaurant) => !recentContentIds.includes(restaurant.id)
      );

      // If no restaurants available after filtering, use all restaurants
      if (availableRestaurants.length === 0) {
        availableRestaurants = allRestaurants;
      }

      if (availableRestaurants.length > 0) {
        selectedContent = availableRestaurants[Math.floor(Math.random() * availableRestaurants.length)];
        contentUrl = generateContentUrl("restaurant", selectedContent);
        console.log(`Selected restaurant: ${selectedContent.name} (ID: ${selectedContent.id})`);
      }
    }
  }

  if (!selectedContent) {
    throw new Error(`No suitable ${contentType} content found for automated posting.`);
  }

  // Generate AI content
  const shortPrompt = `Create a compelling social media post (under 200 characters) for ${subjectType.replace(
    "_",
    " "
  )} featuring this ${contentType}:

Title: ${selectedContent.title || selectedContent.name}
Description: ${
    selectedContent.description ||
    selectedContent.enhanced_description ||
    selectedContent.original_description ||
    ""
  }
Location: ${selectedContent.location || ""}
${contentType === "event" ? `Date: ${selectedContent.date}` : ""}
${contentType === "event" ? `Venue: ${selectedContent.venue || ""}` : ""}
${contentType === "restaurant" ? `Cuisine: ${selectedContent.cuisine || ""}` : ""}

Make it engaging, use relevant hashtags, and keep it under 200 characters for Twitter/Threads. Include a call to action.`;

  const longPrompt = `Create a detailed social media post (200-500 characters) for ${subjectType.replace(
    "_",
    " "
  )} featuring this ${contentType}:

Title: ${selectedContent.title || selectedContent.name}
Description: ${
    selectedContent.description ||
    selectedContent.enhanced_description ||
    selectedContent.original_description ||
    ""
  }
Location: ${selectedContent.location || ""}
${contentType === "event" ? `Date: ${selectedContent.date}` : ""}
${contentType === "event" ? `Venue: ${selectedContent.venue || ""}` : ""}
${contentType === "restaurant" ? `Cuisine: ${selectedContent.cuisine || ""}` : ""}

Make it detailed and engaging for Facebook/LinkedIn. Include compelling details, storytelling elements, and a strong call to action.`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Generate short post
  const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
  const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
  const shortRequestBody = await buildClaudeRequest(
    [{ role: "user", content: shortPrompt }],
    { 
      supabaseUrl, 
      supabaseKey: supabaseServiceKey,
      customMaxTokens: 300
    }
  );

  const shortResponse = await fetch(config.api_endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(shortRequestBody)
  });

  if (!shortResponse.ok) {
    const errorData = await shortResponse.json();
    throw new Error(`Claude API error for short content: ${errorData.error?.message || shortResponse.statusText}`);
  }

  const shortData = await shortResponse.json();
  if (!shortData.content || !shortData.content[0] || !shortData.content[0].text) {
    throw new Error("Invalid response format from Claude API for short content");
  }
  const shortContent = shortData.content[0].text;

  // Generate long post
  const longRequestBody = await buildClaudeRequest(
    [{ role: "user", content: longPrompt }],
    { 
      supabaseUrl, 
      supabaseKey: supabaseServiceKey,
      customMaxTokens: 500
    }
  );

  const longResponse = await fetch(config.api_endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(longRequestBody)
  });

  if (!longResponse.ok) {
    const errorData = await longResponse.json();
    throw new Error(`Claude API error for long content: ${errorData.error?.message || longResponse.statusText}`);
  }

  const longData = await longResponse.json();
  if (!longData.content || !longData.content[0] || !longData.content[0].text) {
    throw new Error("Invalid response format from Claude API for long content");
  }
  const longContent = longData.content[0].text;

  // Get active webhooks
  const { data: webhooks } = await supabase
    .from("social_media_webhooks")
    .select("*")
    .eq("is_active", true);

  const webhookUrls = webhooks?.map((w) => w.webhook_url) || [];
  console.log(`Found ${webhookUrls.length} active webhooks`);

  // Create combined post entry
  const combinedPost = {
    content_type: contentType,
    content_id: selectedContent.id,
    subject_type: subjectType,
    platform_type: "combined",
    post_content: JSON.stringify({
      twitter_threads: shortContent,
      facebook_linkedin: longContent,
    }),
    post_title: selectedContent.title || selectedContent.name,
    content_url: contentUrl,
    webhook_urls: webhookUrls,
    ai_prompt_used: `Short: ${shortPrompt}\n\nLong: ${longPrompt}`,
    status: autoPublish ? "posted" : "draft",
    posted_at: autoPublish ? new Date().toISOString() : null,
    metadata: {
      content_data: selectedContent,
      generation_timestamp: new Date().toISOString(),
      automated_generation: true,
      auto_publish: autoPublish,
      webhook_triggered: autoPublish,
      post_formats: {
        twitter_threads: {
          content: shortContent,
          prompt: shortPrompt,
        },
        facebook_linkedin: {
          content: longContent,
          prompt: longPrompt,
        },
      },
    },
  };

  const { data: savedPost, error } = await supabase
    .from("social_media_posts")
    .insert([combinedPost])
    .select()
    .single();

  if (error) {
    throw error;
  }

  // If autoPublish is enabled, send to webhooks immediately
  let webhookResults = [];
  if (autoPublish && webhookUrls.length > 0) {
    console.log(`Sending to ${webhookUrls.length} webhooks`);
    
    const webhookPromises = webhookUrls.map(async (webhookUrl) => {
      try {
        const contentFormats = JSON.parse(savedPost.post_content as string);
        const webhookPayload = {
          content_formats: {
            twitter_threads: {
              content: contentFormats.twitter_threads,
              platforms: ["twitter", "threads"],
            },
            facebook_linkedin: {
              content: contentFormats.facebook_linkedin,
              platforms: ["facebook", "linkedin"],
            },
          },
          title: savedPost.post_title,
          url: savedPost.content_url,
          subject_type: savedPost.subject_type,
          content_type: savedPost.content_type,
          metadata: savedPost.metadata,
        };

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });

        return {
          url: webhookUrl,
          success: response.ok,
          status: response.status,
        };
      } catch (error) {
        return {
          url: webhookUrl,
          success: false,
          error: error.message,
        };
      }
    });

    webhookResults = await Promise.all(webhookPromises);

    // Update post with webhook results
    await supabase
      .from("social_media_posts")
      .update({
        metadata: {
          ...savedPost.metadata,
          webhook_results: webhookResults,
        },
      })
      .eq("id", savedPost.id);
      
    console.log(`Webhook results:`, webhookResults);
  }

  console.log(`${autoPublish ? 'Generated and published' : 'Generated'} social media post:`, savedPost.id);

  return {
    post: savedPost,
    selectedContent,
    webhook_results: webhookResults,
  };
}

// ===========================================================================
// WEB-AUTO-012 — daily auto-post pipeline
// ===========================================================================

/**
 * Format a timestamp as a human-readable Central-Time (America/Chicago) label
 * for inclusion in social copy. This is the Deno-side equivalent of the web
 * app's date-fns-tz formatInTimeZone (edge functions can't import src/, and
 * Intl.DateTimeFormat is the robust built-in for IANA-zone formatting).
 */
function formatCentralDate(src: string | null | undefined): string {
  if (!src) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(src));
  } catch {
    return "";
  }
}

/** Higher = more newsworthy. Prefers featured/enhanced events with imagery,
 * and gives sooner events a small recency boost. */
function eventSignal(e: Record<string, any>): number {
  let s = 0;
  if (e.is_featured) s += 100;
  if (e.is_enhanced) s += 20;
  if (e.image_url) s += 15;
  const desc = e.enhanced_description || e.original_description || e.geo_summary || "";
  if (typeof desc === "string" && desc.length > 120) s += 10;
  const days = (new Date(e.event_start_utc || e.date).getTime() - Date.now()) / 86400000;
  if (days >= 0 && days <= 14) s += Math.max(0, 14 - days);
  return s;
}

/** Higher = more featured/better-rated restaurant. */
function restaurantSignal(r: Record<string, any>): number {
  let s = 0;
  if (r.is_featured) s += 100;
  if (typeof r.rating === "number") s += r.rating * 5;
  if (r.image_url) s += 10;
  return s;
}

/** Pick the highest-signal item of the given type not in the no-repeat set. */
async function selectHighestSignalContent(
  supabase: any,
  contentType: string,
  recentIds: Set<string>,
): Promise<Record<string, any> | null> {
  if (contentType === "event") {
    const { data } = await supabase
      .from("events")
      .select("*")
      .gte("date", new Date().toISOString())
      .neq("is_hidden", true)
      .neq("is_merged", true)
      .order("date", { ascending: true })
      .limit(100);
    const candidates = (data || []).filter((e: any) => !recentIds.has(e.id));
    if (candidates.length === 0) return null;
    candidates.sort((a: any, b: any) => eventSignal(b) - eventSignal(a));
    return candidates[0];
  }
  if (contentType === "restaurant") {
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .neq("is_merged", true)
      .limit(100);
    const candidates = (data || []).filter((r: any) => !recentIds.has(r.id));
    if (candidates.length === 0) return null;
    candidates.sort((a: any, b: any) => restaurantSignal(b) - restaurantSignal(a));
    return candidates[0];
  }
  return null;
}

/** POST the combined payload to each webhook, retrying a failed webhook once. */
async function publishToWebhooks(
  webhookUrls: string[],
  payload: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  const tryPost = async (url: string) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { url, success: r.ok, status: r.status };
    } catch (error) {
      return { url, success: false, error: (error as Error).message };
    }
  };
  const results: Array<Record<string, unknown>> = [];
  for (const url of webhookUrls) {
    let res = await tryPost(url);
    if (!res.success) {
      const retry = await tryPost(url);
      res = { ...retry, retried: true };
    }
    results.push(res);
  }
  return results;
}

/** Generate short (Twitter/Threads) + long (Facebook/LinkedIn) copy that
 * includes the canonical deep link and a Central-time date for events. */
async function generatePostCopy(
  claudeApiKey: string,
  contentType: string,
  subjectType: string,
  content: Record<string, any>,
  contentUrl: string,
  dateLabel: string,
): Promise<{ shortContent: string; longContent: string; shortPrompt: string; longPrompt: string }> {
  const title = content.title || content.name;
  const description =
    content.enhanced_description ||
    content.original_description ||
    content.description ||
    content.geo_summary ||
    "";
  const subjectLabel = subjectType.replace(/_/g, " ");
  const detailLines = [
    `Title: ${title}`,
    `Description: ${description}`,
    `Location: ${content.location || ""}`,
    contentType === "event" && dateLabel ? `When (Central Time): ${dateLabel}` : "",
    contentType === "event" ? `Venue: ${content.venue || ""}` : "",
    contentType === "restaurant" ? `Cuisine: ${content.cuisine || ""}` : "",
    `Link: ${contentUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const shortPrompt = `Create a compelling social media post (UNDER 240 characters total, including the link) for ${subjectLabel} featuring this ${contentType}:

${detailLines}

Make it engaging, add 1-2 relevant hashtags, include a call to action, and end with the link. Keep it under 240 characters for Twitter/Threads.`;

  const longPrompt = `Create a detailed social media post (200-500 characters) for ${subjectLabel} featuring this ${contentType}:

${detailLines}

Make it detailed and engaging for Facebook/LinkedIn with storytelling and a strong call to action. Include the link.`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
  const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);

  const callClaude = async (prompt: string, maxTokens: number): Promise<string> => {
    const body = await buildClaudeRequest([{ role: "user", content: prompt }], {
      supabaseUrl,
      supabaseKey: supabaseServiceKey,
      customMaxTokens: maxTokens,
    });
    const resp = await fetch(config.api_endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(`Claude API error: ${errorData.error?.message || resp.statusText}`);
    }
    const data = await resp.json();
    if (!data.content?.[0]?.text) {
      throw new Error("Invalid response format from Claude API");
    }
    return data.content[0].text.trim();
  };

  const shortContent = await callClaude(shortPrompt, 300);
  const longContent = await callClaude(longPrompt, 500);
  return { shortContent, longContent, shortPrompt, longPrompt };
}

/** Select, generate, publish, and record one subject (event or restaurant). */
async function postOneSubject(
  supabase: any,
  claudeApiKey: string,
  contentType: string,
  subjectType: string,
  webhookUrls: string[],
  activePlatforms: string[],
): Promise<Record<string, unknown> | null> {
  // 30-day no-repeat window: skip content already POSTED in the last 30 days.
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPosts } = await supabase
    .from("social_media_posts")
    .select("content_id")
    .eq("content_type", contentType)
    .eq("status", "posted")
    .gte("posted_at", since30);
  const recentIds = new Set(
    (recentPosts || []).map((p: any) => p.content_id).filter(Boolean),
  );

  const selected = await selectHighestSignalContent(supabase, contentType, recentIds);
  if (!selected) return null;

  const title = selected.title || selected.name;
  const contentUrl = generateContentUrl(contentType, selected);
  const dateLabel =
    contentType === "event" ? formatCentralDate(selected.event_start_utc || selected.date) : "";

  const { shortContent, longContent, shortPrompt, longPrompt } = await generatePostCopy(
    claudeApiKey,
    contentType,
    subjectType,
    selected,
    contentUrl,
    dateLabel,
  );

  const payload = {
    content_formats: {
      twitter_threads: { content: shortContent, platforms: ["twitter", "threads"] },
      facebook_linkedin: { content: longContent, platforms: ["facebook", "linkedin"] },
    },
    title,
    url: contentUrl,
    subject_type: subjectType,
    content_type: contentType,
    metadata: { content_data: selected, auto_post: true },
  };

  const webhookResults = webhookUrls.length
    ? await publishToWebhooks(webhookUrls, payload)
    : [];
  const anySuccess = webhookResults.some((r) => r.success);
  // No webhooks configured -> nothing to send: keep the generated copy as a
  // draft so an admin can wire a webhook and publish it. Otherwise the status
  // reflects whether at least one webhook accepted the post.
  const status = webhookUrls.length === 0 ? "draft" : anySuccess ? "posted" : "failed";
  const nowIso = new Date().toISOString();

  const { error: insertError } = await supabase.from("social_media_posts").insert([
    {
      content_type: contentType,
      content_id: selected.id,
      subject_type: subjectType,
      platform_type: "combined",
      post_content: JSON.stringify({
        twitter_threads: shortContent,
        facebook_linkedin: longContent,
      }),
      post_title: title,
      content_url: contentUrl,
      webhook_urls: webhookUrls,
      ai_prompt_used: `Short: ${shortPrompt}\n\nLong: ${longPrompt}`,
      status,
      posted_at: status === "posted" ? nowIso : null,
      last_attempt_at: nowIso,
      error_message:
        status === "failed"
          ? "All webhooks failed after one retry"
          : status === "draft"
            ? "No active webhooks configured"
            : null,
      metadata: {
        ...payload.metadata,
        automated_auto_post: true,
        generation_timestamp: nowIso,
        platforms: activePlatforms,
        webhook_results: webhookResults,
      },
    },
  ]);
  if (insertError) {
    console.error("Failed to record auto-post row:", insertError);
  }

  return {
    type: contentType,
    content_id: selected.id,
    title,
    url: contentUrl,
    status,
    platforms: activePlatforms,
    webhook_results: webhookResults,
  };
}

/** Daily auto-post orchestrator: pause check -> per-subject post -> metrics. */
async function runDailyAutoPost(
  supabase: any,
  claudeApiKey: string,
  ctx: JobContext,
): Promise<Record<string, unknown>> {
  // 1. Pause flags (admin-toggleable). settings = { paused, paused_platforms[] }.
  const { data: setting } = await supabase
    .from("system_settings")
    .select("settings")
    .eq("setting_type", "social_auto_post")
    .maybeSingle();
  const settings = (setting?.settings || {}) as Record<string, unknown>;
  const paused = settings.paused === true;
  const pausedPlatforms: string[] = Array.isArray(settings.paused_platforms)
    ? (settings.paused_platforms as string[])
    : [];

  if (paused) {
    ctx.meta({ paused: true });
    return { paused: true, posted: [] };
  }

  // 2. Active webhooks, excluding any paused platform.
  const { data: webhooks } = await supabase
    .from("social_media_webhooks")
    .select("webhook_url, platform")
    .eq("is_active", true);
  const usable = (webhooks || []).filter(
    (w: any) => !pausedPlatforms.includes(w.platform),
  );
  const webhookUrls = usable.map((w: any) => w.webhook_url);
  const activePlatforms = Array.from(new Set(usable.map((w: any) => w.platform)));

  // 3. Post the event of the day + the featured restaurant.
  const posted: Array<Record<string, unknown>> = [];
  let postedCount = 0;
  let failedCount = 0;

  for (const subject of [
    { contentType: "event", subjectType: "event_of_the_day" },
    { contentType: "restaurant", subjectType: "restaurant_of_the_day" },
  ]) {
    try {
      const outcome = await postOneSubject(
        supabase,
        claudeApiKey,
        subject.contentType,
        subject.subjectType,
        webhookUrls,
        activePlatforms,
      );
      if (!outcome) {
        posted.push({ type: subject.contentType, skipped: "no eligible content" });
        continue;
      }
      posted.push(outcome);
      if (outcome.status === "posted") postedCount++;
      else failedCount++;
    } catch (error) {
      failedCount++;
      posted.push({ type: subject.contentType, error: (error as Error).message });
    }
  }

  ctx.processed(postedCount);
  ctx.failed(failedCount);
  ctx.meta({ posted, activePlatforms, pausedPlatforms, paused: false });
  return { posted, postedCount, failedCount, activePlatforms, pausedPlatforms };
}
