import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createLogger } from "@/lib/logger";
import { STALE_TIME } from "@/lib/queryConfig";
import {
  favoritedListQueryKey,
  useContentFavorites,
  type FavoriteContentType,
} from "@/hooks/useContentFavorites";

const log = createLogger("useFavoritedRows");

/**
 * The rows behind one content type on the favorites screen (WEB-PERF-034).
 *
 * WHAT THIS REPLACES. FavoritesView carried four near-identical blocks, each
 * doing the SAME TWO STEPS IN SEQUENCE: read content_favorites for the ids,
 * then read the content table for the rows. Nine requests for a screen that
 * shows five lists - and the first step of each pair was already in the cache,
 * because useContentFavorites holds exactly that id set under
 * ["content-favorites", type, userId] and every FavoriteButton on the site
 * populates it. The hook's own docstring called this "different caches over the
 * same fact"; this is the half that was still refetching.
 *
 * Reading the ids from that query instead of re-issuing it takes the screen
 * from nine requests to five, and removes the sequencing: the id set is
 * already resolved when this mounts, so the row fetch starts immediately
 * instead of one round trip later.
 *
 * WHY THE IDS ARE IN THE KEY. Favouriting or unfavouriting changes the id set,
 * and the row list must follow. The key stays prefixed with
 * favoritedListQueryKey(type) + userId so the mutations' existing
 * invalidations - which match on that prefix - still reach it.
 *
 * WHY NOT AN EMBEDDED JOIN. content_favorites.content_id is polymorphic: it
 * points at whichever table content_type names, so there is no foreign key for
 * PostgREST to traverse and `restaurants:content_id(*)` fails with PGRST200.
 * AC2's one-round-trip version needs a view or an RPC, which needs a migration.
 */
export function useFavoritedRows<T>(
  contentType: FavoriteContentType,
  table: "restaurants" | "attractions" | "playgrounds" | "hotels",
  columns: string,
) {
  const { user } = useAuth();
  const { favoritedIds, isLoading: idsLoading } = useContentFavorites(contentType);

  const { data = [], isLoading: rowsLoading } = useQuery({
    queryKey: [favoritedListQueryKey(contentType), user?.id, favoritedIds],
    queryFn: async (): Promise<T[]> => {
      if (!user || favoritedIds.length === 0) return [];

      const { data: rows, error } = await supabase
        .from(table)
        .select(columns)
        .in("id", favoritedIds);

      if (error) {
        log.error("fetchRows", `Failed to load favorited ${table}`, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return [];
      }

      return (rows ?? []) as unknown as T[];
    },
    enabled: !!user && favoritedIds.length > 0,
    staleTime: STALE_TIME.USER,
  });

  return { data, isLoading: idsLoading || rowsLoading };
}
