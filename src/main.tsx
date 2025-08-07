import { StrictMode } from "react";
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";
import App from './App.tsx';
import './index.css';
import { registerServiceWorker, addResourceHints, trackWebVitals } from "./lib/performance";
import { initializeErrorSuppression } from "./lib/errorSuppression";

// Initialize performance optimizations and error suppression
initializeErrorSuppression();
addResourceHints();
registerServiceWorker();
trackWebVitals();

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
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
