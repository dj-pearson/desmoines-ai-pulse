import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
 * Active Session Info
 */
interface ActiveSession {
  id: string;
  session_id: string;
  last_activity: string;
  idle_timeout_at: string | null;
  expires_at: string | null;
  device_info: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  remember_me: boolean;
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

  const { isAuthenticated, logout, getSessionExpiresAt, user } = useAuth();
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
        console.error('Error fetching session policy:', err);
        return null;
      }
    },
    enabled: !!user && useDatabasePolicy,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch active sessions
  const { data: activeSessions, refetch: refetchSessions } = useQuery<ActiveSession[]>({
    queryKey: ['user-sessions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('last_activity', { ascending: false });
      if (error) {
        console.error('Error fetching sessions:', error);
        return [];
      }
      return data as ActiveSession[];
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Update session activity mutation
  const updateActivityMutation = useMutation({
    mutationFn: async (rememberMe: boolean = false) => {
      if (!user) throw new Error('Not authenticated');
      const session = await supabase.auth.getSession();
      const sessionId = session.data.session?.access_token?.substring(0, 32) || 'unknown';
      const { data, error } = await supabase
        .rpc('update_session_with_timeout', {
          p_user_id: user.id,
          p_session_id: sessionId,
          p_remember_me: rememberMe,
          p_ip_address: null,
          p_user_agent: navigator.userAgent,
        });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      lastActivityRef.current = Date.now();
      refetchSessions();
    },
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .rpc('revoke_session', { p_session_id: sessionId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refetchSessions(),
  });

  // Revoke all other sessions mutation
  const revokeOtherSessionsMutation = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const currentSessionId = session.data.session?.access_token?.substring(0, 32) || 'unknown';
      const { data, error } = await supabase
        .rpc('revoke_all_other_sessions', { p_current_session_id: currentSessionId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refetchSessions(),
  });

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

    await logout();
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

    // Check if max session duration exceeded
    const sessionDuration = Date.now() - sessionStartRef.current;
    const maxSessionMs = maxSessionDuration * 60 * 60 * 1000;

    if (sessionDuration >= maxSessionMs) {
      toast({
        title: 'Maximum Session Duration Reached',
        description: `You have been logged out after ${maxSessionDuration} hours. Please log in again.`,
        variant: 'destructive',
      });
      logout();
      return;
    }

    // Set warning timer (idle timeout - warning time)
    const warningMs = (idleTimeout - warningTime) * 60 * 1000;
    warningTimerRef.current = setTimeout(showWarning, warningMs);

    // Set logout timer (idle timeout)
    const timeoutMs = idleTimeout * 60 * 1000;
    idleTimerRef.current = setTimeout(handleTimeout, timeoutMs);

    if (import.meta.env.DEV) {
      console.log('[SessionTimeout] Timer reset:', {
        warningIn: `${idleTimeout - warningTime} minutes`,
        logoutIn: `${idleTimeout} minutes`,
      });
    }
  }, [
    enabled,
    isAuthenticated,
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

    /**
     * List of active sessions for the current user
     */
    activeSessions: activeSessions || [],

    /**
     * Revoke a specific session by ID
     */
    revokeSession: revokeSessionMutation.mutateAsync,

    /**
     * Revoke all sessions except the current one
     */
    revokeAllOtherSessions: revokeOtherSessionsMutation.mutateAsync,

    /**
     * Update session activity (extends timeout)
     */
    updateSessionActivity: () => updateActivityMutation.mutate(false),

    /**
     * Whether session management operations are in progress
     */
    isSessionLoading: updateActivityMutation.isPending ||
      revokeSessionMutation.isPending ||
      revokeOtherSessionsMutation.isPending,
  };
}
