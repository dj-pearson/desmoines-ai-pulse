import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getGuestFavorites,
  clearGuestFavorites,
  type GuestFavorite,
} from "@/lib/guestFavorites";
import { logFavoriteFunnelEvent } from "@/lib/favoriteAnalytics";
import { createLogger } from "@/lib/logger";

const log = createLogger("guestFavoriteMigration");

/**
 * On sign-in, migrate any guest favorites (safeStorage) into the user's server
 * favorites, then clear the local copy. Idempotent + deduped. (WEB-FEAT-006)
 *
 * Mount once near the app root (inside AuthProvider).
 */
export function useGuestFavoriteMigration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const migratedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (migratedForUser.current === user.id) return;

    const pending = getGuestFavorites();
    if (pending.length === 0) {
      migratedForUser.current = user.id;
      return;
    }
    migratedForUser.current = user.id;

    void (async () => {
      const events = pending.filter((f) => f.type === "event");
      const content = pending.filter((f) => f.type !== "event");

      try {
        if (events.length > 0) {
          // user_event_interactions has no guaranteed unique on
          // (user,event,type); insert individually and ignore conflicts.
          await Promise.all(
            events.map((f) =>
              supabase
                .from("user_event_interactions")
                .insert({
                  user_id: user.id,
                  event_id: f.id,
                  interaction_type: "favorite",
                })
                .then(({ error }) => {
                  if (error && !isDuplicate(error.message)) {
                    log.warn("migrate", "event favorite failed", {
                      error: error.message,
                    });
                  }
                })
            )
          );
        }

        if (content.length > 0) {
          // content_favorites has a unique (user, type, id) — ignore dupes.
          const rows = content.map((f: GuestFavorite) => ({
            user_id: user.id,
            content_type: f.type,
            content_id: f.id,
          }));
          const { error } = await supabase
            .from("content_favorites")
            .upsert(rows, {
              onConflict: "user_id,content_type,content_id",
              ignoreDuplicates: true,
            });
          if (error) {
            log.warn("migrate", "content favorites failed", {
              error: error.message,
            });
          }
        }

        clearGuestFavorites();

        // Refresh favorite views so the filled hearts/lists appear immediately.
        queryClient.invalidateQueries({ queryKey: ["favorites"] });
        queryClient.invalidateQueries({ queryKey: ["content-favorites"] });

        pending.forEach((f) =>
          logFavoriteFunnelEvent("signup_from_wall", f.type, f.id, user.id)
        );

        // Dashboard/welcome acknowledgement.
        toast.success(
          `We saved your ${pending.length} favorite${
            pending.length === 1 ? "" : "s"
          } to your account`,
          { id: "guest-fav-migrated" }
        );
      } catch (err) {
        log.error("migrate", "unexpected error", { error: String(err) });
      }
    })();
  }, [user, queryClient]);
}

function isDuplicate(message: string): boolean {
  return /duplicate key|already exists|unique/i.test(message);
}
