import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Generates or retrieves a persistent session ID for analytics tracking.
 * Stored in sessionStorage so it persists across page navigations
 * but resets when the browser tab is closed.
 */
function getSessionId(): string {
  const key = 'analytics_session_id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    // Fallback for private browsing or storage errors
    return crypto.randomUUID();
  }
}

/**
 * Detects device type from the user agent string.
 */
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Sends a page view event to the user_analytics table in Supabase.
 * Fire-and-forget — errors are logged in dev but never block the UI.
 */
async function recordPageView(params: {
  pathname: string;
  sessionId: string;
  userId: string | null;
}): Promise<void> {
  const { pathname, sessionId, userId } = params;

  const { error } = await supabase.from('user_analytics').insert({
    event_type: 'page_view',
    content_id: pathname,
    content_type: 'page',
    page_url: window.location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
    device_type: getDeviceType(),
    session_id: sessionId,
    user_id: userId || null,
  });

  if (error && import.meta.env.DEV) {
    console.error('[usePageTracking] Failed to record page view:', error.message);
  }
}

/**
 * Hook that automatically tracks page views on route changes.
 *
 * - Sends real page view data to the `user_analytics` Supabase table
 * - Tracks session ID, device type, referrer, user agent, and authenticated user
 * - Respects the browser's Do Not Track preference
 * - Debounces rapid route changes (e.g., redirects) with a 300ms delay
 * - Fire-and-forget: never blocks rendering or throws
 *
 * Usage: Call once inside the Router context (e.g., in App.tsx).
 *
 * ```tsx
 * function AppRoutes() {
 *   usePageTracking();
 *   return <Routes>...</Routes>;
 * }
 * ```
 */
export function usePageTracking(): void {
  const location = useLocation();
  const { user } = useAuth();
  const sessionIdRef = useRef<string>(getSessionId());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Respect Do Not Track
    if (navigator.doNotTrack === '1') return;

    // Debounce rapid route changes (redirects, auth callbacks)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      recordPageView({
        pathname: location.pathname,
        sessionId: sessionIdRef.current,
        userId: user?.id ?? null,
      }).catch(() => {
        // Swallow — analytics must never crash the app
      });
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [location.pathname, user?.id]);
}
