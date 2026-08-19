import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";
import {
  initSentry,
  getSentryDsn,
  captureException as sentryCaptureException,
  captureMessage as sentryCaptureMessage,
} from "@/lib/sentry";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { initErrorTracking } from "@/lib/errorHandler";
import '@/lib/env'; // Validate environment variables at startup
import { initAnalyticsConsent } from "@/lib/analyticsConsent";

import App from "./App";
import "./index.css";
import { initializeOnInteraction } from "./lib/lazyInit";
import { GC_TIME, STALE_TIME, shouldRetry, retryDelay } from "@/lib/queryConfig";

// Initialize Sentry before anything else (only when DSN is configured)
initSentry();

// Apply the stored cookie choice to Google Consent Mode and, only if analytics
// was granted, allow gtag.js to load at all (WEB-LEGAL-001). Runs early so the
// grant is applied before any page-view work; denial needs no action because
// index.html already defaults every non-essential category to denied.
initAnalyticsConsent();

// Wire Sentry into the centralized error handler (matches initSentry's DSN
// resolution so the bridge activates whenever Sentry itself does).
if (getSentryDsn()) {
  initErrorTracking({
    captureException(error, context) {
      sentryCaptureException(error, {
        tags: { component: context.component, action: context.action },
        extra: context.metadata,
      });
    },
    captureMessage(message, level) {
      sentryCaptureMessage(message, level as 'info' | 'warning' | 'error');
    },
  });
}

// ──────────────────────────────────────────────────────────────
// Mobile error overlay – shows runtime errors visually on the
// device when running inside Capacitor.  On the web this is a
// no-op because uncaught errors already appear in DevTools.
// ──────────────────────────────────────────────────────────────
const isCapacitor = !!(window as any).Capacitor;

// Tag the body so CSS can target mobile app vs web
if (isCapacitor) {
  document.documentElement.classList.add('capacitor-app');
  document.body.classList.add('capacitor-app');
}

// ──────────────────────────────────────────────────────────────
// Global link interceptor for Capacitor
//
// In the native WKWebView / Android WebView, <a target="_blank">
// links do NOT open in the system browser by default – they
// either silently fail or navigate inside the WebView.
//
// This handler catches every click on an <a> element that points
// to an external URL and routes it through the Capacitor Browser
// plugin so it opens properly in Safari / Chrome.
// ──────────────────────────────────────────────────────────────
if (isCapacitor) {
  // ---- Intercept <a target="_blank"> clicks ----
  document.addEventListener('click', (e) => {
    // Walk up from the event target to find the nearest <a>
    const anchor = (e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';

    // Only intercept external URLs (http/https) and target="_blank"
    const isExternal = /^https?:\/\//i.test(href);
    const isBlank = anchor.getAttribute('target') === '_blank';

    // Also intercept any absolute URL not on the app's own origin
    const isOffOrigin = isExternal && !href.startsWith(window.location.origin);

    if (isExternal && (isBlank || isOffOrigin)) {
      e.preventDefault();
      e.stopPropagation();

      const cap = (window as any).Capacitor;
      if (cap?.Plugins?.Browser) {
        cap.Plugins.Browser.open({ url: href });
      }
    }
  }, true); // Use capture phase to catch before React handlers

  // ---- Override window.open so all code paths use the Browser plugin ----
  const _originalOpen = window.open.bind(window);
  (window as any).open = (url?: string | URL, target?: string, features?: string) => {
    const href = String(url || '');
    const isExternal = /^https?:\/\//i.test(href);

    if (isExternal) {
      const cap = (window as any).Capacitor;
      if (cap?.Plugins?.Browser) {
        cap.Plugins.Browser.open({ url: href });
        return null; // Browser plugin handles it
      }
    }

    // Fallback to original for non-external or if plugin unavailable
    return _originalOpen(url, target, features);
  };
}

function showErrorOverlay(message: string, source?: string) {
  // Always show on Capacitor; on web, only in dev mode
  if (!isCapacitor && import.meta.env.PROD) return;

  let overlay = document.getElementById('__error_overlay__');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '__error_overlay__';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);
      color:#ff6b6b;font:14px/1.6 monospace;padding:24px 16px;
      overflow:auto;-webkit-overflow-scrolling:touch;
      padding-top:env(safe-area-inset-top, 24px);
    `;
    document.body.appendChild(overlay);
  }
  overlay.innerHTML += `
    <div style="margin-bottom:16px;border-bottom:1px solid #333;padding-bottom:12px">
      <strong style="color:#ff4444;font-size:16px">Runtime Error</strong>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:8px 0 0;color:#ffa0a0">${
        String(message).replace(/</g, '&lt;')
      }</pre>
      ${source ? `<span style="color:#888;font-size:12px">${String(source).replace(/</g, '&lt;')}</span>` : ''}
    </div>
  `;
}

// Catch synchronous errors (upgrades the early handler from index.html)
window.onerror = (msg, src, line, col, err) => {
  showErrorOverlay(
    err?.stack || String(msg),
    src ? `${src}:${line}:${col}` : undefined,
  );
};

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  showErrorOverlay(
    reason?.stack || reason?.message || String(reason),
    'Unhandled Promise Rejection',
  );
});

// Surface any errors that were caught by the early handler in index.html
// before this module loaded.
if (Array.isArray((window as any).__earlyErrors) && (window as any).__earlyErrors.length > 0) {
  for (const earlyErr of (window as any).__earlyErrors) {
    showErrorOverlay(
      earlyErr.err?.stack || earlyErr.err?.message || String(earlyErr.msg),
      earlyErr.src ? `${earlyErr.src}:${earlyErr.line}` : 'Early startup error',
    );
  }
}

// Query client tuned per data class (WEB-PERF-006). Defaults are the safe
// floor for queries that don't override; per-hook staleTime (see
// @/lib/queryConfig STALE_TIME) does the per-data-class tuning. Long gcTime
// keeps inactive lists cached so back-navigation renders instantly.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient network/5xx with backoff; never retry 401/403/404.
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: false,
      staleTime: STALE_TIME.SHORT,
      gcTime: GC_TIME,
      // Use "always" so queries fire even if Capacitor's Network plugin
      // hasn't reported online status yet. "online" can silently block
      // all queries until a network status event arrives.
      networkMode: "always",
    },
  },
});

// Hide the Capacitor splash screen once the app is ready.
// Uses the global Capacitor bridge (injected by the native shell) so
// there is zero import overhead and no build-time resolution issues.
function hideSplashScreen() {
  const cap = (window as any).Capacitor;
  if (!cap?.Plugins?.SplashScreen) return;
  try {
    cap.Plugins.SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // Plugin not available – ignore
  }
}

// Fast initial render for optimal TTI
function initializeApp() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    showErrorOverlay("Root element '#root' not found in DOM");
    return;
  }

  try {
    const root = createRoot(rootElement);

    // Render immediately - this is the critical path
    root.render(
      <StrictMode>
        {/* WEB-PERF-020: the app's own boundary, not Sentry.ErrorBoundary.
            That component could only come from a statically imported SDK, which
            is exactly what put 123 KB gz of error reporting on the critical
            path. This one reports through handleError -> the Sentry bridge
            above, so React errors still reach Sentry once it loads. */}
        <ErrorBoundary>
          <ThemeProvider defaultTheme="system" storageKey="dmi-theme">
            <HelmetProvider>
              <QueryClientProvider client={queryClient}>
                <App />
              </QueryClientProvider>
            </HelmetProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (err: any) {
    // Catch errors thrown synchronously during render setup
    showErrorOverlay(
      err?.stack || err?.message || 'Unknown error during app initialization',
      'initializeApp()',
    );
  }

  // Hide splash screen now that the app has rendered.
  // Use a short delay to ensure the first paint has actually
  // been committed — hiding the splash before content is visible
  // shows a brief white flash.
  setTimeout(hideSplashScreen, 50);

  // Defer all non-critical features until after interaction
  initializeOnInteraction();

  // Real-user web-vitals reporting (WEB-PERF-007) — load web-vitals on idle so
  // it never blocks rendering and stays off the critical path.
  const startVitals = () => import("@/lib/webVitals").then((m) => m.initWebVitals());
  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(startVitals);
  } else {
    setTimeout(startVitals, 2000);
  }
}

// Start as soon as DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
