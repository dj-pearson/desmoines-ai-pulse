import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthState } from "@/hooks/useAuth";
import { readGuestFavorites } from "@/hooks/useGuestFavorites";
import { migrateGuestFavorites } from "@/lib/guestFavoriteMigration";
import { trackConversion } from "@/lib/conversionTracking";

/**
 * On sign-in, migrate any guest favorites to the user's account and acknowledge
 * it (WEB-FEAT-006). Render once near the app root, inside AuthProvider +
 * QueryClientProvider. Renders nothing.
 */
export function GuestFavoriteMigrator() {
  const { user } = useAuthState();
  const queryClient = useQueryClient();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;

    // Only act on a transition INTO a signed-in state with pending guest saves.
    if (userId && prevUserId.current !== userId && readGuestFavorites().length > 0) {
      trackConversion("signup_from_wall");
      void migrateGuestFavorites().then((migrated) => {
        if (migrated > 0) {
          queryClient.invalidateQueries({ queryKey: ["favorites"] });
          queryClient.invalidateQueries({ queryKey: ["content-favorites"] });
          toast.success(
            `We saved your ${migrated} favorite${migrated === 1 ? "" : "s"} to your account`,
          );
        }
      });
    }

    prevUserId.current = userId;
  }, [user?.id, queryClient]);

  return null;
}
