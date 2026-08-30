import { useGuestFavoriteMigration } from "@/hooks/useGuestFavoriteMigration";

/**
 * Headless component: migrates guest favorites to the user's account on
 * sign-in. Mount once inside AuthProvider. (WEB-FEAT-006)
 */
export function GuestFavoriteMigrator() {
  useGuestFavoriteMigration();
  return null;
}
