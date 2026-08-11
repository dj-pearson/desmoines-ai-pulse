import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { sessionStore } from '@/lib/safeStorage';
import { handleError } from '@/lib/errorHandler';
import { hasConsent } from '@/components/CookieConsentBanner';

/**
 * Generates or retrieves a persistent session ID for analytics tracking.
 * Stored in sessionStorage (via safeStorage) so it persists across page
 * navigations but resets when the browser tab is closed, and never throws
 * in private-browsing mode.
 */
function getSessionId(): string {
  const key = 'analytics_session_id';
  const existing = sessionStore.getString(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  sessionStore.setString(key, id);
  return id;
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
    // WEB-QA-013. Writing the pathname here failed with 22P02 (uuid), so this
    // was changed to null — which fails just as hard with 23502, because the
    // column is uuid NOT NULL. Measured against production 2026-08-11 with
    // analytics consent granted: the page_view insert returns
    //   400 {"code":"23502","message":"null value in column \"content_id\" ...
    //        violates not-null constraint"}
    // So page views are STILL being dropped, and the story's claim that the
    // code half was fixed was wrong — it only swapped one rejection for another.
    //
    // Minting a uuid works today and needs no migration. A page is not a content
    // row, so the value is a filler and the real identity is page_url below; but
    // a filler that persists the row beats a semantically-pure null that throws
    // it away. This matches useAnalytics.ts:229, which already mints one for
    // page views for exactly this reason, and the three writers fixed under
    // WEB-QA-026.
    //
    // If migration 20260718000002 (drop NOT NULL) ever lands, null becomes
    // available again — but there is no reason to keep discarding every page
    // view until it does.
    content_id: crypto.randomUUID(),
    content_type: 'page',
    page_url: window.location.href,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
    device_type: getDeviceType(),
    session_id: sessionId,
    user_id: userId || null,
  });

  if (error) {
    // Reported through handleError, not console.error behind an import.meta.env.DEV
    // guard. esbuild.drop strips console.* from production builds, so the guarded
    // version meant a rejected insert produced NO signal where it actually
    // mattered — which is how this stayed broken through two different failure
    // codes (WEB-QA-013, and the same pattern in WEB-QA-026).
    handleError(error, { component: 'usePageTracking', action: 'recordPageView' });
  }
}

/**
 * Hook that automatically tracks page views on route changes.
 *
 * - Sends real page view data to the `user_analytics` Supabase table
 * - Tracks session ID, device type, referrer, user agent, and authenticated user
 * - Only records when the user has granted the "analytics" cookie category
 *   (GDPR opt-in / CPRA opt-out); absence of consent is treated as denial
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

    // Enforce cookie consent — analytics are non-essential, so we only record
    // page views when the user has affirmatively granted the analytics category.
    // hasConsent() returns false when no record exists (opt-out by default) and
    // when GPC recorded a rejection, so this single check covers both.
    if (!hasConsent('analytics')) return;

    // Debounce rapid route changes (redirects, auth callbacks)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      recordPageView({
        pathname: location.pathname,
        sessionId: sessionIdRef.current,
        userId: user?.id ?? null,
      }).catch((error) => {
        // handleError logs without throwing, so analytics still never crash the app.
        handleError(error, { component: 'usePageTracking', action: 'recordPageView' });
      });
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [location.pathname, user?.id]);
}
