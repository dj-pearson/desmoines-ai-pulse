import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useGamification } from "./useGamification";
import { useSubscription } from "./useSubscription";
import { STALE_TIME } from "@/lib/queryConfig";

export function useFavorites() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { awardPoints } = useGamification();
  const { canPerformAction, getRemainingQuota, isPremium, limits } = useSubscription();

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
    // User-specific data: keep fresh (the longer global content default would
    // be wrong here). Mutations also invalidate this key, forcing an immediate
    // refetch on the user's own add/remove regardless of staleTime.
    staleTime: STALE_TIME.USER,
  });

  const favoritesQueryKey = ["favorites", user?.id];

  // Add favorite with optimistic update
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
    onMutate: async (eventId: string) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      const previous = queryClient.getQueryData<string[]>(favoritesQueryKey);
      queryClient.setQueryData<string[]>(favoritesQueryKey, old => [...(old || []), eventId]);
      return { previous };
    },
    onError: (_error, _eventId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoritesQueryKey, context.previous);
      }
      toast({
        title: "Error",
        description: "Failed to add to favorites",
        variant: "destructive",
      });
    },
    onSuccess: (eventId) => {
      awardPoints("favorite_event", 10, "event", eventId);
      toast({
        title: "Added to Favorites",
        description: "Event saved to your favorites",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
  });

  // Remove favorite with optimistic update
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
    onMutate: async (eventId: string) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      const previous = queryClient.getQueryData<string[]>(favoritesQueryKey);
      queryClient.setQueryData<string[]>(favoritesQueryKey, old => (old || []).filter(id => id !== eventId));
      return { previous };
    },
    onError: (_error, _eventId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoritesQueryKey, context.previous);
      }
      toast({
        title: "Error",
        description: "Failed to remove from favorites",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Removed from Favorites",
        description: "Event removed from your favorites",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
  });

  // Check if user can add more favorites
  const canAddFavorite = (): boolean => {
    return canPerformAction("favorite", favoritedEvents.length);
  };

  // Get remaining favorites quota
  const remainingFavorites = getRemainingQuota("favorite", favoritedEvents.length);

  // Toggle favorite
  const toggleFavorite = (eventId: string): { success: boolean; needsUpgrade: boolean } => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to save favorites",
        variant: "destructive",
      });
      return { success: false, needsUpgrade: false };
    }

    const isFavorited = favoritedEvents.includes(eventId);

    // If removing, always allow
    if (isFavorited) {
      removeFavoriteMutation.mutate(eventId);
      return { success: true, needsUpgrade: false };
    }

    // If adding, check limits. On the cap, return needsUpgrade so the caller
    // can present the contextual unlimited-favorites paywall (WEB-FEAT-001);
    // the modal is now the single messaging surface (no redundant toast here).
    if (!canAddFavorite()) {
      return { success: false, needsUpgrade: true };
    }

    addFavoriteMutation.mutate(eventId);
    return { success: true, needsUpgrade: false };
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
    // Subscription-aware fields
    canAddFavorite: canAddFavorite(),
    remainingFavorites,
    isPremium,
    favoritesLimit: limits.favorites,
  };
}
