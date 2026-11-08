import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSessionTimeout');

/**
 * Session Timeout Configuration
 */
interface SessionTimeoutConfig {
  /**
   * Idle timeout in minutes (default: 30 minutes)
   * User will be logged out after this period of inactivity
   */
  idleTimeout?: number;

  /**
   * Warning time in minutes before logout (default: 5 minutes)
   * Shows a warning dialog before auto-logout
   */
  warningTime?: number;

  /**
   * Maximum session duration in hours (default: 8 hours)
   * User will be logged out after this period regardless of activity
   */
  maxSessionDuration?: number;

  /**
   * Whether to enable idle timeout monitoring (default: true)
   */
  enabled?: boolean;

  /**
   * Accepted and ignored (WEB-QA-048). The policy used to be read from the
   * get_user_session_policy RPC, which production does not have; the values
   * above are the policy now. Kept on the type so existing callers compile.
   */
  useDatabasePolicy?: boolean;
}

/**
 * Session Timeout Hook
 *
 * Monitors user activity and automatically logs out inactive users
 *
 * Features:
 * - Tracks user activity (mouse, keyboard, touch, scroll)
 * - Warns user before auto-logout
 * - Enforces maximum session duration
 * - Graceful logout with cleanup
 * - Configurable timeouts
 *
 * @param config - Session timeout configuration
 *
 * @example
 * ```tsx
 * const { isWarning, timeRemaining, resetTimer } = useSessionTimeout({
 *   idleTimeout: 30,  // 30 minutes
 *   warningTime: 5,   // 5 minutes warning
 *   maxSessionDuration: 8,  // 8 hours max
 * });
 * ```
 */
export function useSessionTimeout(config: SessionTimeoutConfig = {}) {
  const {
    idleTimeout = 30,
    warningTime = 5,
    maxSessionDuration = 8,
    enabled = true,
  } = config;

  const { isAuthenticated, logout, getSessionExpiresAt, getSessionStartedAt } = useAuth();
  const { toast } = useToast();

  const [isWarning, setIsWarningState] = useState(false);
  // The activity handler reads the warning through this ref, not through
  // state. With isWarning in its dependency list, opening the warning gave the
  // handler a new identity, re-ran the effect that arms the timers, and that
  // effect's resetTimer() closed the warning and restarted the idle clock: an
  // idle admin was warned every 25 minutes and never signed out.
  const isWarningRef = useRef(false);
  const setIsWarning = useCallback((value: boolean) => {
    isWarningRef.current = value;
    setIsWarningState(value);
  }, []);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());

  // WEB-QA-048: no database policy read. useSessionTimeout called the
  // get_user_session_policy RPC on every admin page load; production has no
  // such function, so each call failed and the hook fell back to the config
  // values anyway. Those values are the policy.

  // The user_sessions poll (every 60 seconds, for every signed-in user) and
  // the revoke_session / revoke_all_other_sessions / update_session_with_timeout
  // mutations are gone (account plan WP5 item 8). None of those objects exist
  // in production (scripts/db-snapshot.json) and nothing rendered what they
  // returned. SecurityCheckup's "Sign out of other devices" is the real
  // control; a device list waits for deferred D11.

  /**
   * Clear all timers
   */
  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  /**
   * Force logout due to timeout
   */
  const handleTimeout = useCallback(async () => {
    clearAllTimers();
    setIsWarning(false);

    toast({
      title: 'Session Expired',
      description: 'You have been logged out due to inactivity.',
      variant: 'destructive',
    });

    // WEB-AUTH-007. LOCAL, not global. A timeout is not a security event on
    // the account, it is a stale tab: signing the person out of every device
    // they own because one desktop tab sat idle is a bug that looks like a
    // policy. A deliberate Log Out still revokes everything.
    await logout({ scope: 'local' });
  }, [clearAllTimers, toast, logout, setIsWarning]);

  /**
   * Show warning before logout
   */
  const showWarning = useCallback(() => {
    setIsWarning(true);
    const remainingMs = warningTime * 60 * 1000;
    setTimeRemaining(Math.floor(remainingMs / 1000));

    // Countdown for the dialog only. The idle timer set in resetTimer owns
    // the logout; calling handleTimeout from here as well signed out twice,
    // and from inside a state updater, which React may invoke more than once.
    countdownIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    toast({
      title: 'Session Expiring Soon',
      description: `You will be logged out in ${warningTime} minutes due to inactivity. Move your mouse or press any key to stay logged in.`,
      variant: 'default',
    });
  }, [warningTime, toast, setIsWarning]);

  /**
   * Reset the idle timer
   */
  const resetTimer = useCallback(() => {
    if (!enabled || !isAuthenticated) return;

    lastActivityRef.current = Date.now();

    // Clear existing timers
    clearAllTimers();
    setIsWarning(false);

    // WEB-AUTH-007. MEASURED FROM THE SESSION, NOT FROM PAGE LOAD.
    //
    // sessionStartRef was Date.now() at mount, which is page-load age and has
    // nothing to do with session age. A tab opened at 09:00 and reloaded at
    // 16:55 started its eight hours over at 16:55; a tab left open since 09:00
    // was logged out at 17:00 even when the session behind it was minutes old.
    // The cap measured the wrong thing in both directions.
    //
    // sessionStartedAt reads user.last_sign_in_at, which does NOT move on a
    // token refresh -- `iat` does, and using it would reset the cap every hour
    // and make an 8-hour maximum unreachable.
    //
    // NULL means the start cannot be told. The mount time is used only then,
    // and only because falling back to "no cap at all" would be a bigger
    // surprise than the behaviour that already shipped.
    const startedAt = getSessionStartedAt() ?? sessionStartRef.current;
    const sessionDuration = Date.now() - startedAt;
    const maxSessionMs = maxSessionDuration * 60 * 60 * 1000;

    if (sessionDuration >= maxSessionMs) {
      toast({
        title: 'Maximum Session Duration Reached',
        description: `You have been logged out after ${maxSessionDuration} hours. Please log in again.`,
        variant: 'destructive',
      });
      logout({ scope: 'local' });
      return;
    }

    // Set warning timer (idle timeout - warning time)
    const warningMs = (idleTimeout - warningTime) * 60 * 1000;
    warningTimerRef.current = setTimeout(showWarning, warningMs);

    // Set logout timer (idle timeout)
    const timeoutMs = idleTimeout * 60 * 1000;
    idleTimerRef.current = setTimeout(handleTimeout, timeoutMs);

    if (import.meta.env.DEV) {
      logger.info('resetTimer', 'Timer reset', {
        warningIn: `${idleTimeout - warningTime} minutes`,
        logoutIn: `${idleTimeout} minutes`,
      });
    }
  }, [
    enabled,
    isAuthenticated,
    getSessionStartedAt,
    idleTimeout,
    warningTime,
    maxSessionDuration,
    clearAllTimers,
    setIsWarning,
    showWarning,
    handleTimeout,
    toast,
    logout,
  ]);

  /**
   * Check for Supabase session expiry
   */
  const checkSessionExpiry = useCallback(() => {
    if (!isAuthenticated) return;

    const expiresAt = getSessionExpiresAt();
    if (!expiresAt) return;

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;

    // If session expires in less than 5 minutes, warn user
    if (timeUntilExpiry > 0 && timeUntilExpiry < 300) {
      toast({
        title: 'Session Expiring',
        description: 'Your session is about to expire. Any activity will refresh your session.',
        variant: 'default',
      });
    }
  }, [isAuthenticated, getSessionExpiresAt, toast]);

  /**
   * Handle user activity events
   */
  const handleUserActivity = useCallback(() => {
    if (isWarningRef.current) {
      // If warning is showing, any activity dismisses it
      setIsWarning(false);
      toast({
        title: 'Session Extended',
        description: 'Your session has been extended due to activity.',
      });
    }
    resetTimer();
  }, [resetTimer, toast, setIsWarning]);

  /**
   * Setup activity listeners
   */
  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      clearAllTimers();
      return;
    }

    // Initialize session start time
    sessionStartRef.current = Date.now();
    lastActivityRef.current = Date.now();

    // Start initial timer
    resetTimer();

    // Activity events to track
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    // Throttle activity handler to avoid excessive resets
    let throttleTimeout: NodeJS.Timeout | null = null;
    const throttledHandler = () => {
      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        handleUserActivity();
        throttleTimeout = null;
      }, 1000); // Throttle to once per second
    };

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, throttledHandler, { passive: true });
    });

    // Check session expiry every minute
    const expiryCheckInterval = setInterval(checkSessionExpiry, 60 * 1000);

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandler);
      });
      clearInterval(expiryCheckInterval);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      clearAllTimers();
    };
  }, [enabled, isAuthenticated, resetTimer, handleUserActivity, checkSessionExpiry, clearAllTimers]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return {
    /**
     * Whether a warning is currently showing
     */
    isWarning,

    /**
     * Time remaining in seconds before auto-logout
     */
    timeRemaining,

    /**
     * Manually reset the idle timer (extends session)
     */
    resetTimer,

    /**
     * Manually trigger logout
     */
    logout: handleTimeout,
  };
}
