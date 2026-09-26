import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { useSubscription } from "./useSubscription";
import { useSavedCount } from "./useSavedCount";
import { isPlanLimitError, planLimitMessage } from "@/lib/planLimitError";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * Non-event content favorites (restaurants / attractions / hotels / playgrounds)
 * stored in the additive `content_favorites` table. Event favorites stay in
 * useFavorites() / user_event_interactions. (WEB-UX-010)
 *
 * Mirrors useFavorites: optimistic add/remove, owner-only via RLS, and the
 * subscription favorites limit, counted across events and every content type
 * because that is how enforce_favorites_limit counts it.
 */
export type FavoriteContentType =
  | "restaurant"
  | "attraction"
  | "hotel"
  | "playground";

/**
 * The query key FavoritesView uses for the hydrated list of one content type.
 *
 * FavoritesView reads ["favorited-restaurants", userId] and friends, while the
 * mutations below own ["content-favorites", type, userId]. Those are different
 * caches over the same fact, so invalidating only the second left the favorites
 * LIST showing an item the user had just removed until it went stale on its own
 * (WEB-PERF-006 AC4). Both are now invalidated together.
 *
 * Exported and used on BOTH sides on purpose. The mapping is a plural "s" today
 * and deriving it inline in two files is how they drift - the next content type
 * with an irregular plural would break the link silently, and a stale favorites
 * list looks like a failed unfavourite rather than a cache bug.
 */
export function favoritedListQueryKey(contentType: FavoriteContentType): string {
  return `favorited-${contentType}s`;
}

export function useContentFavorites(contentType: FavoriteContentType) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canPerformAction, getRemainingQuota, isPremium, limits } =
    useSubscription();

  const queryKey = ["content-favorites", contentType, user?.id];

  const { data: favoritedIds = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("content_favorites")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_type", contentType);
      if (error) throw error;
      return data.map((row) => row.content_id);
    },
    enabled: !!user,
    staleTime: STALE_TIME.USER,
  });

  const addMutation = useMutation({
    mutationFn: async (contentId: string) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase.from("content_favorites").insert({
        user_id: user.id,
        content_type: contentType,
        content_id: contentId,
      });
      if (error) throw error;
      return contentId;
    },
    onMutate: async (contentId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey);
      queryClient.setQueryData<string[]>(queryKey, (old) => [
        ...(old || []),
        contentId,
      ]);
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      // The trigger refused it: a stale count let the tap through. Say so
      // rather than calling a plan limit a failure.
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [favoritedListQueryKey(contentType)] });
      queryClient.invalidateQueries({ queryKey: ["saved-count"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (contentId: string) => {
      if (!user) throw new Error("Must be logged in");
      const { error } = await supabase
        .from("content_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("content_type", contentType)
        .eq("content_id", contentId);
      if (error) throw error;
      return contentId;
    },
    onMutate: async (contentId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey);
      queryClient.setQueryData<string[]>(queryKey, (old) =>
        (old || []).filter((id) => id !== contentId)
      );
      return { previous };
    },
    onError: (_e, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
      toast({
        title: "Error",
        description: "Failed to remove from favorites",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [favoritedListQueryKey(contentType)] });
      queryClient.invalidateQueries({ queryKey: ["saved-count"] });
    },
  });

  const isFavorited = (contentId: string) => favoritedIds.includes(contentId);

  // One cap across events and all place types, as the server counts it. This
  // hook's own list (one type) is the floor until the total loads.
  const savedCount = useSavedCount();
  const totalSaved = Math.max(savedCount.count ?? 0, favoritedIds.length);

  const canAddFavorite = () => canPerformAction("favorite", totalSaved);

  /** Toggle; returns whether an upgrade is needed when the free cap is hit. */
  const toggleFavorite = (
    contentId: string
  ): { success: boolean; needsUpgrade: boolean } => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to save favorites",
        variant: "destructive",
      });
      return { success: false, needsUpgrade: false };
    }

    if (isFavorited(contentId)) {
      removeMutation.mutate(contentId);
      return { success: true, needsUpgrade: false };
    }

    if (!canAddFavorite()) {
      // The caller (FavoriteButton) presents the contextual paywall modal
      // (WEB-FEAT-001) — no destructive toast here to avoid double messaging.
      return { success: false, needsUpgrade: true };
    }

    addMutation.mutate(contentId);
    return { success: true, needsUpgrade: false };
  };

  return {
    favoritedIds,
    isLoading,
    isFavorited,
    toggleFavorite,
    isToggling: addMutation.isPending || removeMutation.isPending,
    canAddFavorite: canAddFavorite(),
    remainingFavorites: getRemainingQuota("favorite", totalSaved),
    isPremium,
    favoritesLimit: limits.favorites,
  };
}
