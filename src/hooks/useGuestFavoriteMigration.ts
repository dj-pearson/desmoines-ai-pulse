import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getGuestFavorites,
  clearGuestFavorites,
  stashedFavorite,
  type GuestFavorite,
} from "@/lib/guestFavorites";
import { takePendingAction } from "@/lib/authReturn";
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
    // The tap that hit the guest cap, held by FavoriteButton so it is not lost
    // to the sign-up detour. Taken once here: takePendingAction removes it.
    const stashedAction = takePendingAction("favorite");
    const stashed = stashedAction ? stashedFavorite(stashedAction.payload) : null;
    const extra =
      stashed && !pending.some((f) => f.type === stashed.type && f.id === stashed.id)
        ? stashed
        : null;

    if (pending.length === 0 && !extra) {
      migratedForUser.current = user.id;
      return;
    }
    migratedForUser.current = user.id;

    void (async () => {
      try {
        let saved = await migrateFavorites(user.id, pending);
        // Last, so if the plan limit refuses anything it is this one and not
        // an item the guest had already seen saved.
        if (extra) saved += await migrateFavorites(user.id, [extra]);

        clearGuestFavorites();

        // Refresh favorite views so the filled hearts/lists appear immediately.
        queryClient.invalidateQueries({ queryKey: ["favorites"] });
        queryClient.invalidateQueries({ queryKey: ["content-favorites"] });
        queryClient.invalidateQueries({ queryKey: ["saved-count"] });

        [...pending, ...(extra ? [extra] : [])].forEach((f) =>
          logFavoriteFunnelEvent("signup_from_wall", f.type, f.id, user.id)
        );
        if (saved === 0) return;

        // Dashboard/welcome acknowledgement.
        //
        // IMPORTED HERE RATHER THAN AT MODULE SCOPE (WEB-PERF-020). This hook
        // is mounted at the app root by GuestFavoriteMigrator, and a static
        // module-scope import of sonner made it the ONE path from App.tsx
        // into sonner - which put the whole sonner runtime back into the entry
        // chunk that App.tsx:407 says it is not in. Every return above this
        // point fires for the ordinary visitor: no user, already migrated, or
        // nothing pending. Only a signed-in user with guest favourites reaches
        // the toast, so only they pay for it.
        const { toast } = await import("sonner");
        toast.success(
          `We saved your ${saved} favorite${saved === 1 ? "" : "s"} to your account`,
          { id: "guest-fav-migrated" }
        );
      } catch (err) {
        log.error("migrate", "unexpected error", { error: String(err) });
      }
    })();
  }, [user, queryClient]);
}

/**
 * Insert guest favorites for the new account. Returns how many are now saved
 * (a duplicate counts: it was already there). A refusal - the plan limit
 * trigger included - is logged and not counted, so the toast never claims a
 * save the server declined.
 */
async function migrateFavorites(userId: string, items: GuestFavorite[]): Promise<number> {
  const events = items.filter((f) => f.type === "event");
  const content = items.filter((f) => f.type !== "event");
  let saved = 0;

  if (events.length > 0) {
    // user_event_interactions has no guaranteed unique on
    // (user,event,type); insert individually and ignore conflicts.
    const results = await Promise.all(
      events.map((f) =>
        supabase.from("user_event_interactions").insert({
          user_id: userId,
          event_id: f.id,
          interaction_type: "favorite",
        })
      )
    );
    for (const { error } of results) {
      if (!error || isDuplicate(error.message)) {
        saved += 1;
      } else {
        log.warn("migrate", "event favorite failed", { error: error.message });
      }
    }
  }

  if (content.length > 0) {
    // content_favorites has a unique (user, type, id) - ignore dupes.
    const rows = content.map((f) => ({
      user_id: userId,
      content_type: f.type,
      content_id: f.id,
    }));
    const { error } = await supabase.from("content_favorites").upsert(rows, {
      onConflict: "user_id,content_type,content_id",
      ignoreDuplicates: true,
    });
    if (error) {
      log.warn("migrate", "content favorites failed", { error: error.message });
    } else {
      saved += content.length;
    }
  }

  return saved;
}

function isDuplicate(message: string): boolean {
  return /duplicate key|already exists|unique/i.test(message);
}
