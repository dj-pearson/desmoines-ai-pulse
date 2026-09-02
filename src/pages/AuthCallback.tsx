import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { SecurityUtils } from "@/lib/securityUtils";
import { createLogger } from '@/lib/logger';
import { readAuthCallbackError } from "@/lib/authCallbackError";

const log = createLogger('AuthCallback');

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
        // WEB-AUTH-005. This read the QUERY STRING only. Supabase puts
        // implicit-flow and email-link failures in the URL FRAGMENT, which
        // never reaches a server and which useSearchParams does not expose --
        // so an expired confirmation link produced no error here either, and
        // the page fell through to polling for a session that would never
        // arrive, ending in the generic "taking longer than expected".
        const authError = readAuthCallbackError(window.location.search, window.location.hash);

        if (authError) {
          log.error('handleAuthCallback', 'Auth callback error', {
            code: authError.code,
            description: searchParams.get("error_description"),
          });
          setStatus("error");
          // Our wording, not Supabase's: "Email link is invalid or has expired"
          // is written for a developer and tells a person nothing to do next.
          setErrorMessage(authError.message);
          return;
        }

        log.debug('handleAuthCallback', 'Waiting for session');

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
              log.info('handleAuthCallback', 'Session established');
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
          log.error('handleAuthCallback', 'Session timeout');
          setStatus("error");
          setErrorMessage("Authentication is taking longer than expected. Please try again.");
        };

        await pollSession();
      } catch (error: any) {
        log.error('handleAuthCallback', 'Exception during auth callback', { error });
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
