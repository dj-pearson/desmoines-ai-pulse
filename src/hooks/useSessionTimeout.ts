import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSessionTimeout');

/**
 * Database-backed Session Policy
 */
interface SessionPolicy {
  id: string;
  role_name: string;
  idle_timeout_minutes: number;
  absolute_timeout_hours: number;
  warning_before_expiry_minutes: number;
  require_mfa_reauth: boolean;
  allow_remember_me: boolean;
  remember_me_days: number;
  is_active: boolean;
}

/**
 * Session Timeout Configuration
 */
interface SessionTimeoutConfig {
  /**
   * Idle timeout in minutes (default: 30 minutes, or from database policy)
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
   * Whether to use database-backed session policies (default: true)
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
    idleTimeout: configIdleTimeout = 30,
    warningTime: configWarningTime = 5,
    maxSessionDuration: configMaxSessionDuration = 8,
    enabled = true,
    useDatabasePolicy = true,
  } = config;

  const { isAuthenticated, logout, getSessionExpiresAt, getSessionStartedAt, user } = useAuth();
  const { toast } = useToast();

  const [isWarning, setIsWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());

  // Fetch session policy from database
  const { data: sessionPolicy } = useQuery<SessionPolicy | null>({
    queryKey: ['session-policy', user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        const { data, error } = await supabase
          .rpc('get_user_session_policy', { p_user_id: user.id });
        if (error) throw error;
        return data as SessionPolicy | null;
      } catch (err) {
        logger.error('sessionPolicy', 'Error fetching session policy', { error: err });
        return null;
      }
    },
    // WP5 item 8: `enabled` gates the read too. SessionManager enables this
    // hook for admins only, but the query ran for every signed-in visitor
    // regardless, against an RPC production doesn't have.
    enabled: enabled && !!user && useDatabasePolicy,
    staleTime: 5 * 60 * 1000,
  });

  // The user_sessions poll (every 60 seconds, for every signed-in user) and
  // the revoke_session / revoke_all_other_sessions / update_session_with_timeout
  // mutations are gone (account plan WP5 item 8). None of those objects exist
  // in production (scripts/db-snapshot.json) and nothing rendered what they
  // returned. SecurityCheckup's "Sign out of other devices" is the real
  // control; a device list waits for deferred D11.

  // Use database policy values if available, otherwise fall back to config
  const idleTimeout = useDatabasePolicy && sessionPolicy?.idle_timeout_minutes
    ? sessionPolicy.idle_timeout_minutes
    : configIdleTimeout;
  const warningTime = useDatabasePolicy && sessionPolicy?.warning_before_expiry_minutes
    ? sessionPolicy.warning_before_expiry_minutes
    : configWarningTime;
  const maxSessionDuration = useDatabasePolicy && sessionPolicy?.absolute_timeout_hours
    ? sessionPolicy.absolute_timeout_hours
    : configMaxSessionDuration;

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
  }, [clearAllTimers, toast, logout]);

  /**
   * Show warning before logout
   */
  const showWarning = useCallback(() => {
    setIsWarning(true);
    const remainingMs = warningTime * 60 * 1000;
    setTimeRemaining(Math.floor(remainingMs / 1000));

    // Start countdown
    countdownIntervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    toast({
      title: 'Session Expiring Soon',
      description: `You will be logged out in ${warningTime} minutes due to inactivity. Move your mouse or press any key to stay logged in.`,
      variant: 'default',
    });
  }, [warningTime, toast, handleTimeout]);

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
    if (isWarning) {
      // If warning is showing, any activity dismisses it
      setIsWarning(false);
      toast({
        title: 'Session Extended',
        description: 'Your session has been extended due to activity.',
      });
    }
    resetTimer();
  }, [isWarning, resetTimer, toast]);

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

    /**
     * Session policy from database (if using database policies)
     */
    sessionPolicy,
  };
}
