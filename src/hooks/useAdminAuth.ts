import { useMemo } from "react";
import { useAuthFlags, useAuthState } from "@/contexts/AuthContext";
import {
  hasAdminAccess as roleHasAdminAccess,
  isRootAdmin as roleIsRootAdmin,
  type UserRole,
} from "@/lib/roles";
import { User } from "@supabase/supabase-js";

export type { UserRole };

interface AdminAuthState {
  user: User | null;
  userRole: UserRole;
  isLoading: boolean;
  hasAdminAccess: boolean;
  isRootAdmin: boolean;
}

/**
 * The admin nav's view of the current user. DERIVED, not re-queried
 * (WEB-AUTH-010).
 *
 * WHAT THIS USED TO DO AND WHY IT WAS WRONG. It ran its own query against
 * user_roles with `.order('created_at', { ascending: false }).limit(1)`, which
 * returns the NEWEST role row rather than the strongest - so an admin later
 * granted a moderator row resolved as a moderator and lost the nav. Meanwhile
 * AuthContext resolved the same question with `.maybeSingle()`, which errors
 * when a user holds two rows, and ProtectedRoute's requireAdmin read THAT. The
 * two could and did disagree, and the visible symptom was a moderator being
 * shown admin links that led to an Access Denied page.
 *
 * There is one resolver now, in AuthContext, ranked by precedence
 * (src/lib/roles.ts). This hook reads it. That also removes a duplicate round
 * of role queries on every sign-in and every tab focus - the thing WEB-UX-008
 * had to work around here with a ref.
 *
 * THE OAUTH SYNC FALLBACK MOVED WITH THE QUERY, it was not dropped. This hook
 * called `sync_oauth_user_role` when no role row matched and AuthContext never
 * did - which is a second way the two disagreed, because a Google sign-in
 * creates a NEW auth user id and the role rows are keyed to the password
 * account. So an OAuth admin got the nav from here and Access Denied from the
 * guard. The RPC now runs inside the single resolver, in the same position.
 */
export function useAdminAuth(): AdminAuthState {
  const { userRole, isLoading, isAdminLoading } = useAuthFlags();
  const { user } = useAuthState();

  return useMemo(
    () => ({
      user,
      userRole,
      // Both, because a resolved session with an unresolved role is still a
      // question the nav must not answer yet - rendering "no access" during
      // the check is what made the admin nav flicker on every reload.
      isLoading: isLoading || isAdminLoading,
      hasAdminAccess: roleHasAdminAccess(userRole),
      isRootAdmin: roleIsRootAdmin(userRole),
    }),
    [user, userRole, isLoading, isAdminLoading],
  );
}
