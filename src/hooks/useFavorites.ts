import { useSyncExternalStore } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useGamification } from "./useGamification";
import { useSubscription } from "./useSubscription";
import { STALE_TIME } from "@/lib/queryConfig";
import {
  GUEST_FAVORITES_CAP,
  addGuestFavorite,
  getGuestFavorites,
  getGuestFavoritesSnapshot,
  isGuestFavorited,
  removeGuestFavorite,
  subscribeGuestFavorites,
} from "@/lib/guestFavorites";
import { trackGuestFavoriteEvent } from "@/lib/guestFavoritesAnalytics";

/** Result of a favorite toggle. `needsSignup` is the guest save-wall (WEB-FEAT-006). */
export interface ToggleFavoriteResult {
  success: boolean;
  needsUpgrade: boolean;
  needsSignup: boolean;
}

export function useFavorites() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { awardPoints } = useGamification();
  const { canPerformAction, getRemainingQuota, isPremium, limits } = useSubscription();

  // Guest (unauthenticated) favorites live in safeStorage and are surfaced via
  // an external store so they survive reloads and stay in sync across buttons.
  const guestFavoritedEvents = useSyncExternalStore(
    subscribeGuestFavorites,
    getGuestFavoritesSnapshot,
    getGuestFavoritesSnapshot,
  );
  const isGuest = !user;

  // Fetch the signed-in user's favorited events
  const { data: userFavoritedEvents = [], isLoading: isUserLoading } = useQuery({
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

  // Unified favorites list: signed-in → server; guest → local store.
  const favoritedEvents = isGuest ? guestFavoritedEvents : userFavoritedEvents;
  const isLoading = isGuest ? false : isUserLoading;

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

  // Check if the current visitor can add more favorites
  const canAddFavorite = (): boolean => {
    if (isGuest) return guestFavoritedEvents.length < GUEST_FAVORITES_CAP;
    return canPerformAction("favorite", userFavoritedEvents.length);
  };

  // Get remaining favorites quota (guests: capped at the guest allowance)
  const remainingFavorites = isGuest
    ? Math.max(0, GUEST_FAVORITES_CAP - guestFavoritedEvents.length)
    : getRemainingQuota("favorite", userFavoritedEvents.length);

  // Toggle favorite. Returns flags the caller uses to surface the right prompt:
  //   needsSignup → guest hit the save cap (WEB-FEAT-006 contextual signup)
  //   needsUpgrade → signed-in free user hit their cap (WEB-FEAT-001 paywall)
  const toggleFavorite = (eventId: string): ToggleFavoriteResult => {
    // Guest path: no auth wall up-front — save locally up to the cap.
    if (isGuest) {
      if (isGuestFavorited(eventId)) {
        removeGuestFavorite(eventId);
        return { success: true, needsUpgrade: false, needsSignup: false };
      }
      const { added, atCap } = addGuestFavorite(eventId);
      if (atCap) {
        trackGuestFavoriteEvent("wall_hit", { saved: GUEST_FAVORITES_CAP });
        return { success: false, needsUpgrade: false, needsSignup: true };
      }
      if (added) {
        trackGuestFavoriteEvent("guest_save", { count: getGuestFavorites().length });
      }
      return { success: true, needsUpgrade: false, needsSignup: false };
    }

    const alreadyFavorited = userFavoritedEvents.includes(eventId);

    // If removing, always allow
    if (alreadyFavorited) {
      removeFavoriteMutation.mutate(eventId);
      return { success: true, needsUpgrade: false, needsSignup: false };
    }

    // If adding, check limits. On the cap, return needsUpgrade so the caller
    // can present the contextual unlimited-favorites paywall (WEB-FEAT-001);
    // the modal is now the single messaging surface (no redundant toast here).
    if (!canAddFavorite()) {
      return { success: false, needsUpgrade: true, needsSignup: false };
    }

    addFavoriteMutation.mutate(eventId);
    return { success: true, needsUpgrade: false, needsSignup: false };
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
    favoritesLimit: isGuest ? GUEST_FAVORITES_CAP : limits.favorites,
    // Guest save-wall fields (WEB-FEAT-006)
    isGuest,
    guestCount: guestFavoritedEvents.length,
    guestCap: GUEST_FAVORITES_CAP,
  };
}
