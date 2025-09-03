import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

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
    const centralTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const hour = centralTime.getHours();
    const minute = centralTime.getMinutes();
    
    console.log(`Current Central Time: ${centralTime.toISOString()}, Hour: ${hour}, Minute: ${minute}`);
    
    if (contentType === "event") {
      // Event posts at 9:00 AM Central (allow 9:00-9:59 AM)
      return hour === 9;
    } else if (contentType === "restaurant") {
      // Restaurant posts at 6:00 PM Central (allow 6:00-6:59 PM)
      return hour === 18;
    }
    
    return false;
  };

  // Helper function to check if we already posted today
  const alreadyPostedToday = async (supabase: any, contentType: string): Promise<boolean> => {
    const today = new Date();
    const centralToday = new Date(today.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const startOfDay = new Date(centralToday);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(centralToday);
    endOfDay.setHours(23, 59, 59, 999);
    
    const { data: todayPosts } = await supabase
      .from("social_media_posts")
      .select("id")
      .eq("content_type", contentType)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString())
      .eq("status", "posted");
    
    const hasPosted = (todayPosts?.length || 0) > 0;
    console.log(`Already posted ${contentType} today: ${hasPosted} (found ${todayPosts?.length || 0} posts)`);
    return hasPosted;
  };

  // Helper function to check if we already generated today
  const alreadyGeneratedToday = async (supabase: any, contentType: string): Promise<boolean> => {
    const today = new Date();
    const centralToday = new Date(today.toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const startOfDay = new Date(centralToday);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(centralToday);
    endOfDay.setHours(23, 59, 59, 999);
    
    const { data: todayPosts } = await supabase
      .from("social_media_posts")
      .select("id")
      .eq("content_type", contentType)
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString())
      .in("status", ["generated", "posted"]);
    
    const hasGenerated = (todayPosts?.length || 0) > 0;
    console.log(`Already generated ${contentType} today: ${hasGenerated} (found ${todayPosts?.length || 0} posts)`);
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
    const { action, contentType, subjectType, postId, triggerSource } = requestBody;

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
      
      // Find pending posts that were generated today but not yet published
      const { data: pendingPosts, error: pendingError } = await supabase
        .from("social_media_posts")
        .select("*")
        .eq("status", "generated")
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

  // Generate short post
  const shortResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 300,
      messages: [{ role: "user", content: shortPrompt }],
    }),
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
  const longResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [{ role: "user", content: longPrompt }],
    }),
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
    status: autoPublish ? "posted" : "generated",
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
