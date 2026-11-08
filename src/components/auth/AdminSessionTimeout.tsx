import { lazy, Suspense } from 'react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

// WEB-PERF-020 AC3: the warning is the whole Radix AlertDialog stack - dialog,
// focus-scope, dismissable-layer, presence, react-remove-scroll, aria-hidden -
// for a dialog that appears only after 25 minutes of inactivity.
//
// It is rendered ONLY while isWarning, not mounted-with-open=false, because a
// mounted component imports its library either way. To check this stayed fixed,
// grep the built entry chunk rather than trusting this comment:
//   grep -l react-remove-scroll dist/assets/index-*.js
const SessionTimeoutWarning = lazy(() =>
  import('./SessionTimeoutWarning').then((m) => ({ default: m.SessionTimeoutWarning })),
);

/**
 * The admin idle policy (WEB-AUTH-007): 30 minutes idle, 5 minutes of warning,
 * an 8-hour cap. SessionManager mounts this only once the admin check has
 * resolved true, so it is always enabled here; unmounting (sign-out, role
 * loss) clears the timers via the hook's own cleanup.
 *
 * It lives in its own module so useSessionTimeout and use-toast load only for
 * admins (WEB-PERF-061). Do not import it statically from eager
 * code; src/__tests__/entryChunkSignedInOnly.test.ts fails if anything does.
 */
export function AdminSessionTimeout() {
  const { isWarning, timeRemaining, resetTimer } = useSessionTimeout({
    idleTimeout: 30,
    warningTime: 5,
    maxSessionDuration: 8,
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
