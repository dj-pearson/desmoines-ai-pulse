import { lazy, Suspense } from "react";
import { useAuthFlags } from "@/contexts/AuthContext";
import { lazyOrNothing } from "@/lib/lazyOrNothing";

// WEB-PERF-061. The migration only has work to do for a signed-in
// user (its first line returns when there is no user), but mounting the hook
// here statically put it and its imports in the entry chunk for every visitor.
const GuestFavoriteMigrationRunner = lazy(
  lazyOrNothing(() =>
    import("@/components/GuestFavoriteMigrationRunner").then((m) => ({
      default: m.GuestFavoriteMigrationRunner,
    })),
  ),
);

/**
 * Headless component: migrates guest favorites to the user's account on
 * sign-in. Mount once inside AuthProvider. (WEB-FEAT-006)
 *
 * A failed chunk renders nothing: the guest favorites stay in safeStorage and
 * migrate on the next page load.
 */
export function GuestFavoriteMigrator() {
  const { isAuthenticated } = useAuthFlags();
  if (!isAuthenticated) return null;

  return (
    <Suspense fallback={null}>
      <GuestFavoriteMigrationRunner />
    </Suspense>
  );
}
