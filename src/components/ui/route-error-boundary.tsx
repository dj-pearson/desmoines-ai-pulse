import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { createLogger } from "@/lib/logger";
import { captureHandledError } from "@/lib/errorHandler";
import { isChunkLoadError } from "@/lib/chunkLoadError";

const logger = createLogger('RouteErrorBoundary');

interface RouteErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
  /** The error clears when this changes. RouteErrorBoundary passes the pathname. */
  resetKey?: string;
}

/**
 * A route-level error boundary that contains failures to a single page.
 *
 * Unlike the global ErrorBoundary which replaces the entire viewport,
 * this component renders an inline error card within the page layout.
 * Navigation (header, bottom nav) remains functional so users can
 * navigate away without a full page reload.
 */
class RouteErrorBoundaryInner extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Skip browser extension errors
    if (error.message.includes('SES') || error.message.includes('lockdown')) {
      return;
    }

    if (import.meta.env.DEV) {
      logger.error('componentDidCatch', 'Route error boundary caught an error', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href,
      });
    }

    // This boundary sits inside the global ErrorBoundary and catches first, so
    // if it doesn't report, no page render error reaches Sentry at all. It
    // used to log in DEV only.
    captureHandledError(error, {
      component: 'RouteErrorBoundary',
      action: 'componentDidCatch',
      metadata: {
        componentStack: errorInfo.componentStack,
        url: window.location.href,
        chunkLoad: isChunkLoadError(error),
      },
    });
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    // Navigating away clears the error. Without this, every header and bottom
    // nav link kept showing the error card after one page crashed.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.resetError();
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return <RouteErrorFallback error={this.state.error} resetError={this.resetError} />;
    }
    return this.props.children;
  }
}

/**
 * Keyed on the pathname, so a route change clears a caught error.
 */
function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <RouteErrorBoundaryInner resetKey={pathname}>{children}</RouteErrorBoundaryInner>;
}

function RouteErrorFallback({ error, resetError }: { error?: Error; resetError: () => void }) {
  const navigate = useNavigate();
  const chunkError = isChunkLoadError(error);

  return (
    <div
      className="flex items-center justify-center p-6 min-h-[50vh]"
      role="alert"
      aria-live="assertive"
    >
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">This page encountered an error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center text-sm">
            Something went wrong loading this page. You can try again or navigate to a different page.
          </p>

          {error && import.meta.env.DEV && (
            <details className="bg-muted p-3 rounded text-sm">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs break-all">{error.message}</pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button
              // The route change resets the boundary. Resetting first would
              // re-render the crashing page before the navigation lands.
              onClick={() => navigate(-1)}
              variant="outline"
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button
              onClick={chunkError ? () => window.location.reload() : resetError}
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export { RouteErrorBoundary };
