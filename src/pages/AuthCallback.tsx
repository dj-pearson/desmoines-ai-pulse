import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { SecurityUtils } from "@/lib/securityUtils";
import { createLogger } from "@/lib/logger";

const log = createLogger("AuthCallback");

/**
 * AuthCallback Component
 *
 * Handles OAuth redirects and email verification callbacks.
 * This page is shown briefly while the auth session is being established.
 *
 * Flow:
 * 1. OAuth provider redirects here with tokens in URL hash
 * 2. Supabase JS client automatically extracts and processes the tokens
 * 3. We wait for the session to be established
 * 4. Redirect to the intended destination or home
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentTitle("Authenticating");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for error in URL params (OAuth errors)
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          log.error("OAuth error", { action: "handleAuthCallback", metadata: { error, errorDescription } });
          setStatus("error");
          setErrorMessage(errorDescription || error || "Authentication failed");
          return;
        }

        log.debug("Waiting for session", { action: "handleAuthCallback" });

        // Don't manually exchange code - Supabase client handles this automatically via onAuthStateChange
        // Just wait for the session to be established
        let attempts = 0;
        const maxAttempts = 10; // 5 seconds total (10 * 500ms)

        const checkSession = async (): Promise<boolean> => {
          const { data: { session } } = await supabase.auth.getSession();
          return !!session;
        };

        // Poll for session
        const pollSession = async () => {
          while (attempts < maxAttempts) {
            const hasSession = await checkSession();
            
            if (hasSession) {
              log.debug("Session established", { action: "pollSession" });
              setStatus("success");

              // Validate redirect URL to prevent open redirect attacks
              const redirectTo = SecurityUtils.getSafeRedirectUrl(searchParams.get("redirect"), "/");
              setTimeout(() => {
                navigate(redirectTo, { replace: true });
              }, 500);
              return;
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // Timeout - no session found
          log.error("Session timeout", { action: "pollSession" });
          setStatus("error");
          setErrorMessage("Authentication is taking longer than expected. Please try again.");
        };

        await pollSession();
      } catch (error: any) {
        log.error("Exception during auth callback", { action: "handleAuthCallback", metadata: { error } });
        setStatus("error");
        setErrorMessage(error.message || "An unexpected error occurred");
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Completing sign in...</h2>
            <p className="text-muted-foreground">
              Please wait while we verify your credentials.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in successful!</h2>
            <p className="text-muted-foreground">
              Redirecting you now...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Authentication Failed</h2>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            <button
              onClick={() => navigate("/auth")}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
