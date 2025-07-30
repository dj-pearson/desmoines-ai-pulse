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
  platform_type: "twitter_threads" | "facebook_linkedin";
  post_content: string;
  post_title?: string;
  content_url?: string;
  webhook_urls: string[];
  ai_prompt_used: string;
  metadata: any;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Helper function to create URL-friendly slugs
  // UUID validation helper
  const isValidUUID = (uuid: string): boolean => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  const createSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const createEventSlug = (title: string, date: string): string => {
    const titleSlug = createSlug(title);

    // Parse the date and convert to Central Time for consistent slug generation
    const eventDate = new Date(date);
    // Create date in Central Time (America/Chicago)
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API");

    if (!claudeApiKey) {
      throw new Error("Claude API key not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const requestBody = await req.json();
    const { action, contentType, subjectType, postId } = requestBody;

    console.log(
      "Social Media Manager - Action:",
      action,
      "ContentType:",
      contentType,
      "SubjectType:",
      subjectType
    );

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

    if (action === "generate") {
      // Get recent posts to avoid repetition - check both short term (7 days) and longer term (90 days)
      const { data: recentPosts } = await supabase
        .from("social_media_posts")
        .select("content_id, content_type, subject_type, created_at")
        .gte(
          "created_at",
          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        ) // Last 90 days for broader diversity
        .order("created_at", { ascending: false })
        .limit(50); // Increased limit to track more recent posts

      const recentContentIds =
        recentPosts
          ?.map((p) => p.content_id)
          .filter((id) => id && isValidUUID(id)) || [];

      // Get content posted in last 7 days for stricter filtering
      const recentWeekPosts =
        recentPosts?.filter(
          (post) =>
            new Date(post.created_at) >
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ) || [];
      const recentWeekContentIds = recentWeekPosts
        .map((p) => p.content_id)
        .filter((id) => id && isValidUUID(id));

      // Count how many times each content item has been posted (only valid UUIDs)
      const contentPostCounts =
        recentPosts?.reduce((acc, post) => {
          if (post.content_id && isValidUUID(post.content_id)) {
            acc[post.content_id] = (acc[post.content_id] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>) || {};

      // Additional safety check: prevent excessive repetition of same content
      const checkExcessiveRepetition = (contentId: string): boolean => {
        const recentPostsForContent =
          recentPosts?.filter(
            (post) =>
              post.content_id === contentId &&
              new Date(post.created_at) >
                new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) // Last 2 weeks
          ) || [];

        return recentPostsForContent.length >= 3; // Block if posted 3+ times in 2 weeks
      };

      // Choose content to feature
      let selectedContent: Record<string, unknown> | null = null;
      let contentUrl = "";

      if (contentType === "event") {
        // Get upcoming events with enhanced diversity selection
        const eventsQuery = supabase
          .from("events")
          .select("*")
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true })
          .limit(50); // Increased from 10 to 50 for better diversity

        const { data: allEvents, error: eventsError } = await eventsQuery;

        if (eventsError) {
          console.error("Error fetching events:", eventsError);
        }

        if (allEvents && allEvents.length > 0) {
          // Filter out events posted in the last week (stricter filtering)
          let availableEvents = allEvents.filter(
            (event) =>
              !recentWeekContentIds.includes(event.id) &&
              !checkExcessiveRepetition(event.id)
          );

          // If no events available after strict filtering, use broader filtering
          if (availableEvents.length === 0) {
            availableEvents = allEvents.filter(
              (event) =>
                (!recentContentIds.includes(event.id) ||
                  (contentPostCounts[event.id] || 0) < 2) &&
                !checkExcessiveRepetition(event.id) // Always block excessive repetition
            );
          }

          // If still no events, use all events but prioritize least posted (still block excessive repetition)
          if (availableEvents.length === 0) {
            availableEvents = allEvents
              .filter((event) => !checkExcessiveRepetition(event.id))
              .sort(
                (a, b) =>
                  (contentPostCounts[a.id] || 0) -
                  (contentPostCounts[b.id] || 0)
              );
          }

          // Additional check to ensure we only post about future events (Central Time)
          const futureEvents = availableEvents.filter((event) => {
            const eventDate = new Date(event.date);
            // Get current time in Central Time
            const nowCentral = new Date(
              new Date().toLocaleString("en-US", {
                timeZone: "America/Chicago",
              })
            );
            // Convert event date to Central Time for comparison
            const eventCentral = new Date(
              eventDate.toLocaleString("en-US", { timeZone: "America/Chicago" })
            );
            return eventCentral > nowCentral;
          });

          if (futureEvents.length > 0) {
            // Weighted random selection - prefer events that haven't been posted recently
            const weights = futureEvents.map((event) => {
              const postCount = contentPostCounts[event.id] || 0;
              const daysSinceLastPost = recentPosts?.find(
                (p) => p.content_id === event.id
              )
                ? Math.floor(
                    (Date.now() -
                      new Date(
                        recentPosts.find((p) => p.content_id === event.id)
                          ?.created_at || 0
                      ).getTime()) /
                      (24 * 60 * 60 * 1000)
                  )
                : 90;

              // Higher weight for less posted content and older posts
              return Math.max(1, 90 - postCount * 10 + daysSinceLastPost);
            });

            const totalWeight = weights.reduce(
              (sum, weight) => sum + weight,
              0
            );
            let randomValue = Math.random() * totalWeight;

            for (let i = 0; i < futureEvents.length; i++) {
              randomValue -= weights[i];
              if (randomValue <= 0) {
                selectedContent = futureEvents[i];
                break;
              }
            }

            if (selectedContent) {
              contentUrl = generateContentUrl("event", selectedContent);
              console.log(
                `Selected event: ${selectedContent.title} (ID: ${
                  selectedContent.id
                }, Post count: ${contentPostCounts[selectedContent.id] || 0})`
              );
            }
          } else {
            console.log("No future events available for posting");
          }
        }
      } else if (contentType === "restaurant") {
        // Get restaurants with enhanced diversity selection
        const restaurantsQuery = supabase
          .from("restaurants")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50); // Increased for better diversity

        const { data: allRestaurants, error: restaurantsError } =
          await restaurantsQuery;

        if (restaurantsError) {
          console.error("Error fetching restaurants:", restaurantsError);
        }

        if (allRestaurants && allRestaurants.length > 0) {
          // Filter out restaurants posted in the last week (stricter filtering)
          let availableRestaurants = allRestaurants.filter(
            (restaurant) =>
              !recentWeekContentIds.includes(restaurant.id) &&
              !checkExcessiveRepetition(restaurant.id)
          );

          // If no restaurants available after strict filtering, use broader filtering
          if (availableRestaurants.length === 0) {
            availableRestaurants = allRestaurants.filter(
              (restaurant) =>
                (!recentContentIds.includes(restaurant.id) ||
                  (contentPostCounts[restaurant.id] || 0) < 2) &&
                !checkExcessiveRepetition(restaurant.id) // Always block excessive repetition
            );
          }

          // If still no restaurants, use all restaurants but prioritize least posted (still block excessive repetition)
          if (availableRestaurants.length === 0) {
            availableRestaurants = allRestaurants
              .filter((restaurant) => !checkExcessiveRepetition(restaurant.id))
              .sort(
                (a, b) =>
                  (contentPostCounts[a.id] || 0) -
                  (contentPostCounts[b.id] || 0)
              );
          }

          // Weighted random selection for restaurants too
          const weights = availableRestaurants.map((restaurant) => {
            const postCount = contentPostCounts[restaurant.id] || 0;
            const daysSinceLastPost = recentPosts?.find(
              (p) => p.content_id === restaurant.id
            )
              ? Math.floor(
                  (Date.now() -
                    new Date(
                      recentPosts.find((p) => p.content_id === restaurant.id)
                        ?.created_at || 0
                    ).getTime()) /
                    (24 * 60 * 60 * 1000)
                )
              : 90;

            // Higher weight for less posted content and older posts
            return Math.max(1, 90 - postCount * 10 + daysSinceLastPost);
          });

          const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
          let randomValue = Math.random() * totalWeight;

          for (let i = 0; i < availableRestaurants.length; i++) {
            randomValue -= weights[i];
            if (randomValue <= 0) {
              selectedContent = availableRestaurants[i];
              break;
            }
          }

          if (selectedContent) {
            contentUrl = generateContentUrl("restaurant", selectedContent);
            console.log(
              `Selected restaurant: ${selectedContent.name} (ID: ${
                selectedContent.id
              }, Post count: ${contentPostCounts[selectedContent.id] || 0})`
            );
          }
        }
      }

      if (!selectedContent) {
        // If no content found, try without the recent filter as fallback
        console.log(
          "No content found with recent filter, trying without filter..."
        );

        if (contentType === "event") {
          const { data: allEvents } = await supabase
            .from("events")
            .select("*")
            .gte("date", new Date().toISOString())
            .order("date", { ascending: true })
            .limit(5);

          if (allEvents && allEvents.length > 0) {
            // Additional check to ensure we only post about future events (Central Time)
            const futureEvents = allEvents.filter((event) => {
              const eventDate = new Date(event.date);
              // Get current time in Central Time
              const nowCentral = new Date(
                new Date().toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })
              );
              // Convert event date to Central Time for comparison
              const eventCentral = new Date(
                eventDate.toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                })
              );
              return eventCentral > nowCentral;
            });

            if (futureEvents.length > 0) {
              selectedContent =
                futureEvents[Math.floor(Math.random() * futureEvents.length)];
              contentUrl = generateContentUrl("event", selectedContent);
            } else {
              console.log("No future events available for posting (fallback)");
            }
          }
        } else if (contentType === "restaurant") {
          const { data: allRestaurants } = await supabase
            .from("restaurants")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(5);

          if (allRestaurants && allRestaurants.length > 0) {
            selectedContent =
              allRestaurants[Math.floor(Math.random() * allRestaurants.length)];
            contentUrl = generateContentUrl("restaurant", selectedContent);
          }
        }
      }

      if (!selectedContent) {
        // Log debug info about what we're looking for
        console.log("Debug info:");
        console.log("- Content type:", contentType);
        console.log("- Recent content IDs:", recentContentIds);

        // Check if we have any content at all
        const { data: eventCount } = await supabase
          .from("events")
          .select("id", { count: "exact" });
        const { data: restaurantCount } = await supabase
          .from("restaurants")
          .select("id", { count: "exact" });

        console.log("- Total events in database:", eventCount?.length || 0);
        console.log(
          "- Total restaurants in database:",
          restaurantCount?.length || 0
        );

        throw new Error(
          `No suitable ${contentType} content found for posting. Please check if you have ${contentType}s in your database.`
        );
      }

      // Generate both versions using Claude
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
${
  contentType === "restaurant"
    ? `Cuisine: ${selectedContent.cuisine || ""}`
    : ""
}

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
${
  contentType === "restaurant"
    ? `Cuisine: ${selectedContent.cuisine || ""}`
    : ""
}

Make it detailed and engaging for Facebook/LinkedIn. Include compelling details, storytelling elements, and a strong call to action.`;

      // Generate short post
      const shortResponse = await fetch(
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
            max_tokens: 300,
            messages: [
              {
                role: "user",
                content: shortPrompt,
              },
            ],
          }),
        }
      );

      const shortData = await shortResponse.json();
      const shortContent = shortData.content[0].text;

      // Generate long post
      const longResponse = await fetch(
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
            max_tokens: 500,
            messages: [
              {
                role: "user",
                content: longPrompt,
              },
            ],
          }),
        }
      );

      const longData = await longResponse.json();
      const longContent = longData.content[0].text;

      // Get active webhooks
      const { data: webhooks } = await supabase
        .from("social_media_webhooks")
        .select("*")
        .eq("is_active", true);

      const webhookUrls = webhooks?.map((w) => w.webhook_url) || [];

      // Get optimal posting time
      const { data: nextPostTime } = await supabase.rpc(
        "get_next_optimal_posting_time"
      );

      // Create a single combined post entry for the database
      const combinedPost = {
        content_type: contentType,
        content_id: selectedContent.id,
        subject_type: subjectType,
        platform_type: "combined", // New type to indicate it contains both formats
        post_content: JSON.stringify({
          twitter_threads: shortContent,
          facebook_linkedin: longContent,
        }),
        post_title: selectedContent.title || selectedContent.name,
        content_url: contentUrl,
        webhook_urls: webhookUrls,
        ai_prompt_used: `Short: ${shortPrompt}\n\nLong: ${longPrompt}`,
        scheduled_for: nextPostTime,
        metadata: {
          content_data: selectedContent,
          generation_timestamp: new Date().toISOString(),
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

      console.log("Generated and saved combined social media post:", savedPost);

      return new Response(
        JSON.stringify({
          success: true,
          post: savedPost,
          selectedContent,
          nextPostTime,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else if (action === "publish") {
      if (!postId) {
        throw new Error("Post ID is required for publish action");
      }

      // Get the post
      const { data: post, error: postError } = await supabase
        .from("social_media_posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (postError || !post) {
        throw new Error("Post not found");
      }

      // Send to webhooks
      const webhookPromises = (post.webhook_urls as string[]).map(
        async (webhookUrl) => {
          try {
            // Parse the post content if it's a combined format
            let webhookPayload;

            if (post.platform_type === "combined") {
              // New combined format - send both versions
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
              // Legacy format - single content
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

      // Update post status
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
