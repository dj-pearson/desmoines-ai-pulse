import { StrictMode } from "react";
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";
import App from './App.tsx';
import './index.css';
import { registerServiceWorker, addResourceHints, trackWebVitals } from "./lib/performance";
import { suppressSESWarnings, handleGitHubPagesRouting, initializeRuntimeErrorHandling } from "./lib/errorSuppression";

// Initialize error suppression and performance optimizations
suppressSESWarnings();
addResourceHints();
registerServiceWorker();
trackWebVitals();

// Handle GitHub Pages routing after DOM is ready but before React renders
handleGitHubPagesRouting();

const queryClient = new QueryClient();

// Add runtime error handling after React root is created
const root = createRoot(document.getElementById("root")!);

// Initialize runtime error handling now that React is set up
initializeRuntimeErrorHandling();

root.render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="dmi-theme">
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HelmetProvider>
    </ThemeProvider>
  </StrictMode>,
);
