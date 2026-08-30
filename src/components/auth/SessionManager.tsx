import { lazy, Suspense } from 'react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

// WEB-PERF-020 AC3: SessionManager is mounted at the app root, so a static
// import of the warning put the whole Radix AlertDialog stack - dialog,
// focus-scope, dismissable-layer, presence, react-remove-scroll, aria-hidden -
// into the render-blocking entry chunk for a dialog that appears only after 25
// minutes of inactivity, and only for a signed-in user. Every other consumer of
// ui/alert-dialog is an admin screen behind a lazy route.
//
// It is rendered ONLY while isWarning, not mounted-with-open=false, because a
// mounted component imports its library either way. To check this stayed fixed,
// grep the built entry chunk rather than trusting this comment:
//   grep -l react-remove-scroll dist/assets/index-*.js
const SessionTimeoutWarning = lazy(() =>
  import('./SessionTimeoutWarning').then((m) => ({ default: m.SessionTimeoutWarning })),
);

/**
 * Session Manager Component
 *
 * Handles session timeout monitoring and warning display
 * Should be placed inside AuthProvider to access auth context
 */
export function SessionManager() {
  const { isWarning, timeRemaining, resetTimer } = useSessionTimeout({
    idleTimeout: 30,  // 30 minutes of inactivity
    warningTime: 5,   // 5 minutes warning before logout
    maxSessionDuration: 8,  // 8 hours maximum session
    enabled: true,
  });

  if (!isWarning) return null;

  return (
    // No fallback: the chunk resolves in well under the five minutes the
    // countdown runs for, and a spinner over the page would be worse than the
    // dialog arriving a frame late.
    <Suspense fallback={null}>
      <SessionTimeoutWarning
        open
        timeRemaining={timeRemaining}
        onStayLoggedIn={resetTimer}
      />
    </Suspense>
  );
}
