import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SocialMediaPost {
  id: string;
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
  posted_at?: string;
  scheduled_for?: string;
  status: "draft" | "scheduled" | "posted" | "failed";
  ai_prompt_used: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface SocialMediaWebhook {
  id: string;
  name: string;
  platform: string;
  webhook_url: string;
  is_active: boolean;
  headers: any;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export function useSocialMediaManager() {
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [webhooks, setWebhooks] = useState<SocialMediaWebhook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const fetchPosts = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("social_media_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching posts:", error);
      toast({
        title: "Error",
        description: "Failed to fetch social media posts",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWebhooks = async () => {
    try {
      const { data, error } = await supabase
        .from("social_media_webhooks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWebhooks(data || []);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      toast({
        title: "Error",
        description: "Failed to fetch webhooks",
        variant: "destructive",
      });
    }
  };

  const generatePost = async (
    contentType: "event" | "restaurant",
    subjectType: string
  ) => {
    try {
      setIsGenerating(true);
      const { data, error } = await supabase.functions.invoke(
        "social-media-manager",
        {
          body: {
            action: "generate",
            contentType,
            subjectType,
          },
        }
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: `Generated social media posts for ${contentType}`,
      });

      await fetchPosts();
      return data;
    } catch (error) {
      console.error("Error generating post:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to generate social media post";
      toast({
        title: "Social Media Manager Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const debugContent = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "social-media-manager",
        {
          body: {
            action: "debug",
          },
        }
      );

      if (error) throw error;

      console.log("Debug info:", data);
      toast({
        title: "Debug Info",
        description: `Found ${data.debug.totalEvents} events and ${data.debug.totalRestaurants} restaurants`,
      });

      return data;
    } catch (error) {
      console.error("Error debugging content:", error);
      toast({
        title: "Debug Error",
        description: "Failed to fetch debug information",
        variant: "destructive",
      });
      throw error;
    }
  };

  const publishPost = async (postId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "social-media-manager",
        {
          body: {
            action: "publish",
            postId,
          },
        }
      );

      if (error) throw error;

      toast({
        title: "Success",
        description: "Post published successfully",
      });

      await fetchPosts();
      return data;
    } catch (error) {
      console.error("Error publishing post:", error);
      toast({
        title: "Error",
        description: "Failed to publish post",
        variant: "destructive",
      });
      throw error;
    }
  };

  const addWebhook = async (
    webhook: Omit<
      SocialMediaWebhook,
      "id" | "created_at" | "updated_at" | "created_by"
    >
  ) => {
    try {
      const { data, error } = await supabase
        .from("social_media_webhooks")
        .insert(webhook)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Webhook added successfully",
      });

      await fetchWebhooks();
      return data;
    } catch (error) {
      console.error("Error adding webhook:", error);
      toast({
        title: "Error",
        description: "Failed to add webhook",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateWebhook = async (
    id: string,
    updates: Partial<SocialMediaWebhook>
  ) => {
    try {
      const { data, error } = await supabase
        .from("social_media_webhooks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Webhook updated successfully",
      });

      await fetchWebhooks();
      return data;
    } catch (error) {
      console.error("Error updating webhook:", error);
      toast({
        title: "Error",
        description: "Failed to update webhook",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      const { error } = await supabase
        .from("social_media_webhooks")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Webhook deleted successfully",
      });

      await fetchWebhooks();
    } catch (error) {
      console.error("Error deleting webhook:", error);
      toast({
        title: "Error",
        description: "Failed to delete webhook",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deletePost = async (id: string) => {
    try {
      const { error } = await supabase
        .from("social_media_posts")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Post deleted successfully",
      });

      await fetchPosts();
    } catch (error) {
      console.error("Error deleting post:", error);
      toast({
        title: "Error",
        description: "Failed to delete post",
        variant: "destructive",
      });
      throw error;
    }
  };

  const testWebhook = async (webhookUrl: string, platform: string) => {
    try {
      // Create realistic test data that matches what real posts will look like
      const testData = {
        platform:
          platform === "twitter" ? "twitter_threads" : "facebook_linkedin",
        content:
          platform === "twitter"
            ? "🎉 Event of the Day: Des Moines Food Truck Festival! Join us downtown for amazing local cuisine, live music & family fun. Don't miss out! #DesMoines #FoodTruck #LocalEats 🍔🎵"
            : "🌟 Event of the Day: Des Moines Food Truck Festival 🌟\n\nJoin us this weekend in downtown Des Moines for an incredible celebration of local cuisine! Experience the best food trucks our city has to offer, enjoy live music from local artists, and bring the whole family for a day of fun.\n\nWhen: This Saturday, 11 AM - 8 PM\nWhere: Western Gateway Park\nFeaturing: 25+ local food trucks, live music, kids activities\n\nDon't miss this amazing opportunity to support local businesses and enjoy great food! See you there! 🍔🎵🎉\n\n#DesMoines #FoodTruck #LocalEats #CommunityEvent",
        title: "Des Moines Food Truck Festival",
        url: "https://desmoinesinsider.com/events/des-moines-food-truck-festival",
        subject_type: "event_of_the_day",
        content_type: "event",
        metadata: {
          content_data: {
            id: "test-event-123",
            title: "Des Moines Food Truck Festival",
            description:
              "Join us for an amazing day of local food trucks, live music, and family fun in downtown Des Moines.",
            location: "Western Gateway Park, Des Moines, IA",
            date: "2025-08-02T11:00:00.000Z",
            venue: "Western Gateway Park",
            enhanced_description:
              "Experience the best of Des Moines local cuisine with over 25 food trucks, live music performances, and family-friendly activities.",
          },
          generation_timestamp: new Date().toISOString(),
          test_webhook: true,
        },
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "DesMoines-AI-Pulse/1.0",
        },
        body: JSON.stringify(testData),
      });

      const result = {
        url: webhookUrl,
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
      };

      if (response.ok) {
        toast({
          title: "Webhook Test Successful",
          description: `Test data sent successfully to ${webhookUrl}`,
        });
      } else {
        toast({
          title: "Webhook Test Failed",
          description: `Failed to send test data: ${response.status} ${response.statusText}`,
          variant: "destructive",
        });
      }

      return result;
    } catch (error) {
      console.error("Error testing webhook:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to test webhook";
      toast({
        title: "Webhook Test Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchWebhooks();
  }, []);

  return {
    posts,
    webhooks,
    isLoading,
    isGenerating,
    generatePost,
    debugContent,
    publishPost,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    deletePost,
    refetch: () => {
      fetchPosts();
      fetchWebhooks();
    },
  };
}
