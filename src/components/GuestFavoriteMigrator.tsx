import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  clearGuestFavorites,
  getGuestFavorites,
  setMigratedFavoritesNotice,
} from "@/lib/guestFavorites";
import { trackGuestFavoriteEvent } from "@/lib/guestFavoritesAnalytics";
import { createLogger } from "@/lib/logger";

const log = createLogger("GuestFavoriteMigrator");

/**
 * Migrates guest favorites into the signed-in user's server favorites on login
 * /signup (WEB-FEAT-006). Idempotent and deduped: only inserts the event
 * favorites the account doesn't already have, then clears the local copy and
 * records a one-shot notice the dashboard acknowledges. Mounted once near the
 * app root; renders nothing. On any failure the guest copy is KEPT so the next
 * session can retry.
 */
export function GuestFavoriteMigrator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Guards against re-running for the same user (the effect re-fires on every
  // user-object identity change, e.g. token refresh).
  const migratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (migratedForUserRef.current === user.id) return;

    const guestIds = getGuestFavorites();
    if (guestIds.length === 0) {
      migratedForUserRef.current = user.id;
      return;
    }

    // Optimistically mark as handled so a re-render doesn't launch a second
    // migration; reset on failure so a later session can retry.
    migratedForUserRef.current = user.id;
    let cancelled = false;

    (async () => {
      try {
        // Deduped: find which of the guest favorites already exist server-side.
        const { data: existing, error: fetchErr } = await supabase
          .from("user_event_interactions")
          .select("event_id")
          .eq("user_id", user.id)
          .eq("interaction_type", "favorite")
          .in("event_id", guestIds);

        if (fetchErr) throw fetchErr;

        const existingIds = new Set((existing || []).map((row) => row.event_id));
        const toInsert = guestIds.filter((id) => !existingIds.has(id));

        if (toInsert.length > 0) {
          const { error: insertErr } = await supabase
            .from("user_event_interactions")
            .insert(
              toInsert.map((event_id) => ({
                user_id: user.id,
                event_id,
                interaction_type: "favorite",
              })),
            );
          if (insertErr) throw insertErr;
        }

        if (cancelled) return;

        clearGuestFavorites();
        setMigratedFavoritesNotice(guestIds.length);
        trackGuestFavoriteEvent("migrated", { count: guestIds.length });
        queryClient.invalidateQueries({ queryKey: ["favorites", user.id] });
        log.info("migrate", "Migrated guest favorites", {
          moved: guestIds.length,
          inserted: toInsert.length,
        });
      } catch (error) {
        // Keep the local copy and allow a retry on the next mount/session.
        migratedForUserRef.current = null;
        log.warn("migrate", "Guest favorite migration failed", { error: String(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queryClient]);

  return null;
}

export default GuestFavoriteMigrator;
