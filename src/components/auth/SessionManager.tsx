import { lazy, Suspense } from 'react';
import { useAuthFlags } from '@/contexts/AuthContext';
import { lazyOrNothing } from '@/lib/lazyOrNothing';

// WEB-PERF-061. SessionManager is mounted at the app root, and it
// used to call useSessionTimeout for every visitor with `enabled` false for all
// but admins. That put the hook (and use-toast, which it imports) in the
// render-blocking entry chunk for the anonymous majority it does nothing for.
// The hook now lives behind this lazy boundary and is fetched only once the
// admin check has resolved true.
const AdminSessionTimeout = lazy(
  lazyOrNothing(() => import('./AdminSessionTimeout').then((m) => ({ default: m.AdminSessionTimeout }))),
);

/**
 * Session Manager Component
 *
 * Handles session timeout monitoring and warning display.
 * Should be placed inside AuthProvider to access auth context.
 */
export function SessionManager() {
  // WEB-AUTH-007. THE IDLE POLICY IS FOR ADMINS ONLY.
  //
  // This mounted for everyone: 30 minutes of inactivity and an 8-hour cap, on
  // an events site. Someone browsing restaurants over lunch, leaving the tab,
  // and coming back after a meeting was signed out. An admin session is
  // different: it can edit content, approve creatives and read other people's
  // data, and it is usually on a shared or office machine. That is the session
  // the 30-minute idle timeout was written for. Everyone else keeps Supabase's
  // own refresh-token lifetime.
  const { isAdmin, isAdminLoading } = useAuthFlags();

  // Not `isAdmin` alone: while the admin check is in flight isAdmin is false,
  // and mounting on the transition would start the clock at an arbitrary
  // point after load rather than at sign-in.
  if (!isAdmin || isAdminLoading) return null;

  return (
    <Suspense fallback={null}>
      <AdminSessionTimeout />
    </Suspense>
  );
}
