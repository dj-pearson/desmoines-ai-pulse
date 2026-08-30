import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { readGuestFavorites, clearGuestFavorites } from "@/hooks/useGuestFavorites";

const log = createLogger("guestFavoriteMigration");

/**
 * Migrate any guest favorites into the signed-in user's server favorites
 * (WEB-FEAT-006). Idempotent + deduped: a unique-violation (already favorited)
 * counts as success. Clears the local copy when done. Returns the number of
 * favorites now on the account from the guest set.
 */
export async function migrateGuestFavorites(): Promise<number> {
  const items = readGuestFavorites();
  if (items.length === 0) return 0;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  let migrated = 0;
  for (const item of items) {
    try {
      let error: { code?: string } | null = null;
      if (item.contentType === "event") {
        ({ error } = await supabase
          .from("user_event_interactions")
          .insert({ user_id: user.id, event_id: item.contentId, interaction_type: "favorite" }));
      } else {
        const table = `user_${item.contentType}_interactions`;
        const idCol = `${item.contentType}_id`;
        ({ error } = await supabase
          .from(table as never)
          .insert({ user_id: user.id, [idCol]: item.contentId, interaction_type: "favorite" } as never));
      }
      // 23505 = unique_violation → already favorited, treat as migrated.
      if (!error || error.code === "23505") migrated++;
    } catch (e) {
      log.debug("migrate", "item failed", { item, error: String(e) });
    }
  }

  clearGuestFavorites();
  log.info("migrate", "Migrated guest favorites", { migrated, total: items.length });
  return migrated;
}
