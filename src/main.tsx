import { StrictMode } from "react";
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

  // Defer all non-critical features until after interaction
  initializeOnInteraction();
}

// Start as soon as DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp, { once: true });
} else {
  initializeApp();
}
