import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";

import App from "./App";
import "./index.css";
import { initializeOnInteraction } from "./lib/lazyInit";

// ──────────────────────────────────────────────────────────────
// Mobile error overlay – shows runtime errors visually on the
// device when running inside Capacitor.  On the web this is a
// no-op because uncaught errors already appear in DevTools.
// ──────────────────────────────────────────────────────────────
const isCapacitor = !!(window as any).Capacitor;

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
      <strong style="color:#ff4444;font-size:16px">⚠ Runtime Error</strong>
      <pre style="white-space:pre-wrap;word-break:break-word;margin:8px 0 0;color:#ffa0a0">${
        String(message).replace(/</g, '&lt;')
      }</pre>
      ${source ? `<span style="color:#888;font-size:12px">${String(source).replace(/</g, '&lt;')}</span>` : ''}
    </div>
  `;
}

// Catch synchronous errors
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

// Optimized query client with minimal configuration for faster TTI
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      networkMode: "online",
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
        <ThemeProvider defaultTheme="system" storageKey="dmi-theme">
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </HelmetProvider>
        </ThemeProvider>
      </StrictMode>
    );
  } catch (err: any) {
    // Catch errors thrown synchronously during render setup
    showErrorOverlay(
      err?.stack || err?.message || 'Unknown error during app initialization',
      'initializeApp()',
    );
  }

  // Hide splash screen now that the app has rendered
  hideSplashScreen();

  // Defer all non-critical features until after interaction
  initializeOnInteraction();
}

// Start as soon as DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
