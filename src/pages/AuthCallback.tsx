import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

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
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for error in URL params (OAuth errors)
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          console.error("[AuthCallback] OAuth error:", error, errorDescription);
          setStatus("error");
          setErrorMessage(errorDescription || error || "Authentication failed");
          return;
        }

        // Check for auth code in URL (PKCE flow)
        const code = searchParams.get("code");

        if (code) {
          console.log("[AuthCallback] Processing auth code...");

          // Exchange code for session
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error("[AuthCallback] Code exchange error:", exchangeError);
            setStatus("error");
            setErrorMessage(exchangeError.message);
            return;
          }

          if (data.session) {
            console.log("[AuthCallback] Session established successfully");
            setStatus("success");

            // Get redirect destination
            const redirectTo = searchParams.get("redirect") || "/";

            // Small delay to show success state
            setTimeout(() => {
              navigate(redirectTo, { replace: true });
            }, 500);
            return;
          }
        }

        // If no code, check if session already exists (hash-based flow)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("[AuthCallback] Session check error:", sessionError);
          setStatus("error");
          setErrorMessage(sessionError.message);
          return;
        }

        if (session) {
          console.log("[AuthCallback] Session found");
          setStatus("success");

          const redirectTo = searchParams.get("redirect") || "/";
          setTimeout(() => {
            navigate(redirectTo, { replace: true });
          }, 500);
        } else {
          // No session and no code - something went wrong
          console.error("[AuthCallback] No session or code found");
          setStatus("error");
          setErrorMessage("Authentication failed. Please try again.");
        }
      } catch (error: any) {
        console.error("[AuthCallback] Exception:", error);
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
