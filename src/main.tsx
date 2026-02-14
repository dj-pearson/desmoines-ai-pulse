import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";

import App from "./App";
import "./index.css";
import { initializeOnInteraction } from "./lib/lazyInit";

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
    throw new Error("Root element not found");
  }

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
