import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useGamification } from "./useGamification";
import { useSubscription } from "./useSubscription";
import { useSavedCount } from "./useSavedCount";
import { isPlanLimitError, planLimitMessage } from "@/lib/planLimitError";

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
    onError: (error, _eventId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoritesQueryKey, context.previous);
      }
      // WEB-FEAT-017: the cap is now enforced by a trigger, so a bypassed or
      // stale client check comes back here rather than being silently allowed.
      // "Failed to add to favorites" would be a lie about a refusal we chose.
      if (isPlanLimitError(error)) {
        toast({
          title: "Favorite limit reached",
          description: planLimitMessage(error, "Upgrade to Insider for unlimited favorites."),
        });
        return;
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
      queryClient.invalidateQueries({ queryKey: ["saved-count"] });
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
      queryClient.invalidateQueries({ queryKey: ["saved-count"] });
    },
  });

  // The server caps events and places together (enforce_favorites_limit
  // counts user_event_interactions + content_favorites), so the client has to
  // count the same way or "N left" is wrong for anyone with a saved place.
  // Until the total loads, this hook's own list is a lower bound.
  const savedCount = useSavedCount();
  const totalSaved = Math.max(savedCount.count ?? 0, favoritedEvents.length);

  // Check if user can add more favorites
  const canAddFavorite = (): boolean => {
    return canPerformAction("favorite", totalSaved);
  };

  // Get remaining favorites quota
  const remainingFavorites = getRemainingQuota("favorite", totalSaved);

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

    // If adding, check limits. The caller (FavoriteButton) presents the
    // contextual paywall modal (WEB-FEAT-001) on needsUpgrade — no destructive
    // toast here to avoid double messaging.
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
