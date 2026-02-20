import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface RouteErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * A route-level error boundary that contains failures to a single page.
 *
 * Unlike the global ErrorBoundary which replaces the entire viewport,
 * this component renders an inline error card within the page layout.
 * Navigation (header, bottom nav) remains functional so users can
 * navigate away without a full page reload.
 */
class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
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
      console.error('[RouteErrorBoundary]', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href,
      });
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

function RouteErrorFallback({ error, resetError }: { error?: Error; resetError: () => void }) {
  const navigate = useNavigate();

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
              onClick={() => {
                resetError();
                navigate(-1);
              }}
              variant="outline"
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button onClick={resetError} className="flex-1">
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
