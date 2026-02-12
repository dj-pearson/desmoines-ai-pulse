import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from '@/lib/logger';

const log = createLogger('useSessionManager');

/**
 * Session Manager Hook
 *
 * Provides proactive session management including:
 * - Automatic token refresh before expiry
 * - Session activity monitoring
 * - Session timeout warnings
 * - Graceful error recovery
 */

interface SessionManagerOptions {
  /** Minutes before token expiry to trigger refresh (default: 5) */
  refreshThresholdMinutes?: number;
  /** Minutes of inactivity before session warning (default: 25) */
  inactivityWarningMinutes?: number;
  /** Callback when session is about to expire */
  onSessionWarning?: () => void;
  /** Callback when session has been refreshed */
  onSessionRefreshed?: () => void;
  /** Callback when session refresh fails */
  onSessionError?: (error: Error) => void;
}

interface SessionManagerReturn {
  /** Manually trigger session refresh */
  refreshSession: () => Promise<boolean>;
  /** Get time until session expires (in seconds) */
  getTimeUntilExpiry: () => number | null;
  /** Check if session is valid */
  isSessionValid: () => boolean;
  /** Reset activity timer (call on user interaction) */
  resetActivityTimer: () => void;
}

export function useSessionManager(options: SessionManagerOptions = {}): SessionManagerReturn {
  const {
    refreshThresholdMinutes = 5,
    inactivityWarningMinutes = 25,
    onSessionWarning,
    onSessionRefreshed,
    onSessionError,
  } = options;

  const { session, isAuthenticated } = useAuth();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isRefreshingRef = useRef<boolean>(false);

  /**
   * Calculate time until token expiry in seconds
   */
  const getTimeUntilExpiry = useCallback((): number | null => {
    if (!session?.expires_at) return null;

    const expiresAt = session.expires_at * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = Math.floor((expiresAt - now) / 1000);

    return Math.max(0, timeUntilExpiry);
  }, [session]);

  /**
   * Check if the current session is valid
   */
  const isSessionValid = useCallback((): boolean => {
    if (!session || !isAuthenticated) return false;

    const timeUntilExpiry = getTimeUntilExpiry();
    return timeUntilExpiry !== null && timeUntilExpiry > 0;
  }, [session, isAuthenticated, getTimeUntilExpiry]);

  /**
   * Refresh the session token
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) {
      return false;
    }

    isRefreshingRef.current = true;

    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        log.error("Refresh failed", { action: 'refreshSession', metadata: { message: error.message } });
        onSessionError?.(new Error(error.message));
        return false;
      }

      if (data.session) {
        log.debug("Session refreshed successfully", { action: 'refreshSession' });
        onSessionRefreshed?.();
        return true;
      }

      return false;
    } catch (error) {
      log.error("Refresh exception", { action: 'refreshSession', metadata: { error } });
      onSessionError?.(error instanceof Error ? error : new Error("Unknown error"));
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [onSessionRefreshed, onSessionError]);

  /**
   * Reset the activity timer
   */
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Schedule proactive token refresh
   */
  const scheduleRefresh = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    const timeUntilExpiry = getTimeUntilExpiry();
    if (timeUntilExpiry === null) return;

    // Calculate when to refresh (threshold minutes before expiry)
    const refreshThresholdSeconds = refreshThresholdMinutes * 60;
    const timeUntilRefresh = timeUntilExpiry - refreshThresholdSeconds;

    if (timeUntilRefresh <= 0) {
      // Token is about to expire or already expired, refresh immediately
      refreshSession();
    } else {
      // Schedule refresh
      log.debug(`Scheduling refresh in ${Math.floor(timeUntilRefresh / 60)} minutes`, { action: 'scheduleRefresh' });

      refreshTimeoutRef.current = setTimeout(() => {
        refreshSession();
      }, timeUntilRefresh * 1000);
    }
  }, [getTimeUntilExpiry, refreshThresholdMinutes, refreshSession]);

  /**
   * Monitor user activity for session warnings
   */
  const setupActivityMonitor = useCallback(() => {
    // Clear existing timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = null;
    }

    if (!isAuthenticated || !onSessionWarning) return;

    const warningTimeMs = inactivityWarningMinutes * 60 * 1000;

    const checkActivity = () => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;

      if (timeSinceActivity >= warningTimeMs) {
        onSessionWarning();
      } else {
        // Schedule next check
        const timeUntilWarning = warningTimeMs - timeSinceActivity;
        activityTimeoutRef.current = setTimeout(checkActivity, timeUntilWarning);
      }
    };

    // Start monitoring
    activityTimeoutRef.current = setTimeout(checkActivity, warningTimeMs);
  }, [isAuthenticated, inactivityWarningMinutes, onSessionWarning]);

  /**
   * Track user activity
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    const handleActivity = () => {
      resetActivityTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, resetActivityTimer]);

  /**
   * Setup session monitoring when authenticated
   */
  useEffect(() => {
    if (!isAuthenticated || !session) {
      // Clear timeouts when logged out
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }
      return;
    }

    // Schedule proactive refresh
    scheduleRefresh();

    // Setup activity monitoring
    setupActivityMonitor();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, session, scheduleRefresh, setupActivityMonitor]);

  /**
   * Handle visibility change - refresh session when tab becomes visible
   */
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if session needs refresh when tab becomes visible
        const timeUntilExpiry = getTimeUntilExpiry();
        if (timeUntilExpiry !== null && timeUntilExpiry < refreshThresholdMinutes * 60) {
          refreshSession();
        }
        resetActivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, getTimeUntilExpiry, refreshThresholdMinutes, refreshSession, resetActivityTimer]);

  return {
    refreshSession,
    getTimeUntilExpiry,
    isSessionValid,
    resetActivityTimer,
  };
}
