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
  const createSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const generateContentUrl = (contentType: string, content: any): string => {
    const baseUrl = "https://desmoinesinsider.com";
    if (contentType === "event") {
      const slug = createSlug(content.title);
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
      // Get recent posts to avoid repetition
      const { data: recentPosts } = await supabase
        .from("social_media_posts")
        .select("content_id, content_type, subject_type")
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        ) // Last 30 days
        .order("created_at", { ascending: false })
        .limit(20);

      const recentContentIds = recentPosts?.map((p) => p.content_id) || [];

      // Choose content to feature
      let selectedContent: any = null;
      let contentUrl = "";

      if (contentType === "event") {
        // Get upcoming events not recently featured
        let eventsQuery = supabase
          .from("events")
          .select("*")
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true })
          .limit(10);

        // Only filter by recent content if there are any
        if (recentContentIds.length > 0) {
          eventsQuery = eventsQuery.not(
            "id",
            "in",
            `(${recentContentIds.map((id) => `'${id}'`).join(",")})`
          );
        }

        const { data: events, error: eventsError } = await eventsQuery;

        if (eventsError) {
          console.error("Error fetching events:", eventsError);
        }

        if (events && events.length > 0) {
          selectedContent = events[Math.floor(Math.random() * events.length)];
          contentUrl = generateContentUrl("event", selectedContent);
        }
      } else if (contentType === "restaurant") {
        // Get restaurants or restaurant openings not recently featured
        let restaurantsQuery = supabase
          .from("restaurants")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

        // Only filter by recent content if there are any
        if (recentContentIds.length > 0) {
          restaurantsQuery = restaurantsQuery.not(
            "id",
            "in",
            `(${recentContentIds.map((id) => `'${id}'`).join(",")})`
          );
        }

        const { data: restaurants, error: restaurantsError } =
          await restaurantsQuery;

        if (restaurantsError) {
          console.error("Error fetching restaurants:", restaurantsError);
        }

        if (restaurants && restaurants.length > 0) {
          selectedContent =
            restaurants[Math.floor(Math.random() * restaurants.length)];
          contentUrl = generateContentUrl("restaurant", selectedContent);
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
            selectedContent =
              allEvents[Math.floor(Math.random() * allEvents.length)];
            contentUrl = generateContentUrl("event", selectedContent);
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
