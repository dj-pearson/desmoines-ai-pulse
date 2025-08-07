import { StrictMode } from "react";
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import App from './App.tsx';
import './index.css';

// Initialize query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Ensure DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

function initializeApp() {
  try {
    // Initialize basic performance features first
    import('./lib/performance').then(({ registerServiceWorker, addResourceHints, trackWebVitals }) => {
      addResourceHints();
      registerServiceWorker();
      trackWebVitals();
    });

    // Initialize error suppression
    import('./lib/errorSuppression').then(({ suppressSESWarnings, handleGitHubPagesRouting, initializeRuntimeErrorHandling }) => {
      suppressSESWarnings();
      handleGitHubPagesRouting();
      initializeRuntimeErrorHandling();
    });

    // Create and render React app
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      throw new Error("Root element not found");
    }

    const root = createRoot(rootElement);
    
    root.render(
      <StrictMode>
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
  } catch (error) {
    console.error('Failed to initialize app:', error);
    // Show a basic error message
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; font-family: system-ui;">
        <h1>Loading Error</h1>
        <p>The application failed to load. Please refresh the page.</p>
        <button onclick="location.reload()">Refresh</button>
      </div>
    `;
  }
}
