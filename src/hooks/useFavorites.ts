import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useGamification } from "./useGamification";

export function useFavorites() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { awardPoints } = useGamification();

  // Fetch user's favorited events
  const { data: favoritedEvents = [], isLoading } = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("user_event_interactions")
        .select("event_id")
        .eq("user_id", user.id)
        .eq("interaction_type", "favorite");

      if (error) throw error;
      return data.map(item => item.event_id);
    },
    enabled: !!user,
  });

  // Add favorite
  const addFavoriteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error("Must be logged in");

      const { error } = await supabase
        .from("user_event_interactions")
        .insert({
          user_id: user.id,
          event_id: eventId,
          interaction_type: "favorite",
        });

      if (error) throw error;
      return eventId;
    },
    onSuccess: (eventId) => {
      queryClient.invalidateQueries({ queryKey: ["favorites", user?.id] });

      // Award XP for favoriting
      awardPoints("favorite_event", 10, "event", eventId);

      toast({
        title: "Added to Favorites ❤️",
        description: "Event saved to your favorites • +10 XP earned!",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to add to favorites",
        variant: "destructive",
      });
      console.error("Add favorite error:", error);
    },
  });

  // Remove favorite
  const removeFavoriteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error("Must be logged in");

      const { error } = await supabase
        .from("user_event_interactions")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .eq("interaction_type", "favorite");

      if (error) throw error;
      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites", user?.id] });
      toast({
        title: "Removed from Favorites",
        description: "Event removed from your favorites",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to remove from favorites",
        variant: "destructive",
      });
      console.error("Remove favorite error:", error);
    },
  });

  // Toggle favorite
  const toggleFavorite = (eventId: string) => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to save favorites",
        variant: "destructive",
      });
      return;
    }

    const isFavorited = favoritedEvents.includes(eventId);
    if (isFavorited) {
      removeFavoriteMutation.mutate(eventId);
    } else {
      addFavoriteMutation.mutate(eventId);
    }
  };

  // Check if an event is favorited
  const isFavorited = (eventId: string) => {
    return favoritedEvents.includes(eventId);
  };

  return {
    favoritedEvents,
    isLoading,
    toggleFavorite,
    isFavorited,
    isToggling: addFavoriteMutation.isPending || removeFavoriteMutation.isPending,
  };
}
