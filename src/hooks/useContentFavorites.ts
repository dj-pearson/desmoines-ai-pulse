import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

/**
 * Generic favorites for non-event content (restaurants / attractions /
 * playgrounds), mirroring the events-only `useFavorites` but backed by the
 * parallel `user_{type}_interactions` tables the iOS app already uses.
 *
 * Pass `null` as the content type to disable the hook entirely (so callers like
 * FavoriteButton can call it unconditionally for the events path without
 * violating the rules of hooks). The tables aren't in the generated Supabase
 * types yet, so we cast `as any` — matching FavoritesView.tsx.
 */
export type FavoriteContentType = "restaurant" | "attraction" | "playground";

const TABLE: Record<FavoriteContentType, string> = {
  restaurant: "user_restaurant_interactions",
  attraction: "user_attraction_interactions",
  playground: "user_playground_interactions",
};

const ID_COL: Record<FavoriteContentType, string> = {
  restaurant: "restaurant_id",
  attraction: "attraction_id",
  playground: "playground_id",
};

export function useContentFavorites(contentType: FavoriteContentType | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!user && !!contentType;
  const queryKey = ["content-favorites", contentType, user?.id];

  const { data: favoritedIds = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user || !contentType) return [] as string[];
      const idCol = ID_COL[contentType];
      const { data, error } = await supabase
        .from(TABLE[contentType] as any)
        .select(idCol)
        .eq("user_id", user.id)
        .eq("interaction_type", "favorite");
      // The table may not exist in every environment — degrade to "none saved".
      if (error) return [] as string[];
      return ((data as any[]) || []).map((r) => r[idCol] as string);
    },
    enabled,
  });

  const addMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user || !contentType) throw new Error("Must be logged in");
      const { error } = await supabase.from(TABLE[contentType] as any).insert({
        user_id: user.id,
        [ID_COL[contentType]]: id,
        interaction_type: "favorite",
      } as any);
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey);
      queryClient.setQueryData<string[]>(queryKey, (old) => [...(old || []), id]);
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast.error("Couldn't save — please try again");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user || !contentType) throw new Error("Must be logged in");
      const { error } = await supabase
        .from(TABLE[contentType] as any)
        .delete()
        .eq("user_id", user.id)
        .eq(ID_COL[contentType], id)
        .eq("interaction_type", "favorite");
      if (error) throw error;
      return id;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey);
      queryClient.setQueryData<string[]>(queryKey, (old) => (old || []).filter((x) => x !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast.error("Couldn't remove — please try again");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const isFavorited = (id: string) => favoritedIds.includes(id);

  const toggleFavorite = (id: string): { success: boolean } => {
    if (!user) {
      toast.error("Please log in to save favorites");
      return { success: false };
    }
    if (!contentType) return { success: false };
    if (favoritedIds.includes(id)) removeMutation.mutate(id);
    else addMutation.mutate(id);
    return { success: true };
  };

  return {
    favoritedIds,
    isLoading,
    isFavorited,
    toggleFavorite,
    isToggling: addMutation.isPending || removeMutation.isPending,
  };
}
