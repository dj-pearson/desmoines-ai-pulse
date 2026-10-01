import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { CheckCircle, MailQuestion, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/hooks/use-toast";
import { useTurnstile } from "@/hooks/useTurnstile";
import { supabase } from "@/integrations/supabase/client";
import { readAuthCallbackError, looksConfirmed, LINK_EXPIRY_COPY } from "@/lib/authCallbackError";
import { peekAuthNext, takeAuthNext } from "@/lib/authReturn";
import { getSafeRedirectUrl } from "@/lib/redirectSafety";
import { interestLabel } from "@/lib/interests";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";

/**
 * /auth/verified: the end of an email confirmation.
 *
 * THREE STATES, AND ONLY ONE OF THEM CELEBRATES (account plan WP2 item 5).
 * WEB-AUTH-005 fixed the error branch; the third state is the one that still
 * lied. A bookmark, a typed URL or a history reopen has no error and no
 * confirmation either, and it used to get "Email Verified!" and a countdown.
 *
 * No auto-redirect. The ten-second countdown moved people off a page they were
 * still reading (WCAG 2.2.1), and it went to '/' rather than the page they
 * signed up from.
 */
export default function AuthVerified() {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Both halves of the URL: Supabase puts PKCE failures in the query string
  // and implicit-flow and email-link failures in the fragment.
  const authError = useMemo(
    () => readAuthCallbackError(location.search, location.hash, "email"),
    [location.search, location.hash],
  );
  const confirmed = useMemo(
    () => looksConfirmed(location.search, location.hash, isAuthenticated),
    [location.search, location.hash, isAuthenticated],
  );
  const nextParam = useMemo(() => new URLSearchParams(location.search).get("next"), [location.search]);

  const state: "error" | "confirmed" | "checking" | "nothing" = authError
    ? "error"
    : confirmed
      ? "confirmed"
      : isLoading
        ? "checking"
        : "nothing";

  useDocumentTitle(
    state === "error"
      ? "Verification Problem"
      : state === "confirmed"
        ? "Email Confirmed"
        : "Confirm Your Email",
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-6 sm:p-8">
          {state === "error" && authError && (
            <>
              <XCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold">We couldn't confirm your email</h1>
              <p className="mt-2 text-muted-foreground">{authError.message}</p>
              {authError.canResend && <ResendConfirmation defaultEmail={user?.email ?? ""} next={nextParam} />}
              <p className="mt-6 text-sm text-muted-foreground">
                Already confirmed?{" "}
                <Link to="/auth" className="font-medium text-foreground underline underline-offset-2">
                  Sign in
                </Link>
              </p>
              {/* For a support conversation, not for the reader to interpret. */}
              <p className="mt-2 text-xs text-muted-foreground">Reference: {authError.code}</p>
            </>
          )}

          {state === "confirmed" && <Confirmed nextParam={nextParam} />}

          {state === "checking" && (
            <div role="status" aria-live="polite">
              <h1 className="text-2xl font-semibold">Checking your link</h1>
            </div>
          )}

          {state === "nothing" && (
            <>
              <MailQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h1 className="mt-4 text-2xl font-semibold">Nothing to confirm here</h1>
              <p className="mt-2 text-muted-foreground">
                This page opens from the link in a confirmation email. If you're waiting on one, we can send it
                again.
              </p>
              <ResendConfirmation defaultEmail={user?.email ?? ""} next={nextParam} />
              <Button asChild variant="outline" className="mt-4 w-full h-11">
                <Link to="/auth">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

interface ConfirmedProps {
  nextParam: string | null;
}

function Confirmed({ nextParam }: ConfirmedProps) {
  const { user } = useAuth();

  // Peeked during render and consumed in an effect, so React's dev double
  // render cannot use up the single-use path before the link reads it.
  const [destination] = useState(() => {
    const fromUrl = nextParam ? getSafeRedirectUrl(nextParam, "") : "";
    return fromUrl || peekAuthNext() || "/";
  });
  useEffect(() => {
    takeAuthNext();
  }, []);

  let continueTo = destination;
  if (!user) continueTo = destination === "/" ? "/auth" : `/auth?redirect=${encodeURIComponent(destination)}`;

  const firstName =
    typeof user?.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : "";
  const rawInterests: unknown = user?.user_metadata?.interests;
  const interests = Array.isArray(rawInterests)
    ? rawInterests.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <>
      <CheckCircle className="h-10 w-10 text-primary" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-semibold">
        {firstName ? `You're in, ${firstName}` : "Your email is confirmed"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {user ? "Your account is ready and you're signed in." : "Your account is ready. Sign in to use it."}
      </p>

      {interests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">You told us you're into</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {interests.map((id) => (
              <li key={id} className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                {interestLabel(id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {/* Signed out (a cross-browser confirmation, or the session is still
            loading), Continue goes through sign-in and still ends up there. */}
        <Button asChild className="w-full h-11">
          <Link to={continueTo} replace>
            Continue
          </Link>
        </Button>
        {user && destination !== "/dashboard" && (
          <Button asChild variant="ghost" className="w-full h-11">
            <Link to="/dashboard">Go to your account</Link>
          </Button>
        )}
      </div>
    </>
  );
}

interface ResendConfirmationProps {
  defaultEmail: string;
  next: string | null;
}

/**
 * Its own component so the Turnstile widget mounts with the form: useTurnstile
 * renders into its container once, on mount, and a container that appears
 * after that gets no widget.
 */
function ResendConfirmation({ defaultEmail, next }: ResendConfirmationProps) {
  const { toast } = useToast();
  const turnstile = useTurnstile();
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (defaultEmail) setEmail((current) => current || defaultEmail);
  }, [defaultEmail]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      toast({
        title: "Enter your email",
        description: "We need the address you signed up with to send a new link.",
        variant: "destructive",
      });
      return;
    }

    const callback = new URL(`${window.location.origin}/auth/callback`);
    callback.searchParams.set("redirect", "/auth/verified");
    const safeNext = next ? getSafeRedirectUrl(next, "") : "";
    if (safeNext) callback.searchParams.set("next", safeNext);

    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: address,
      options: { captchaToken: turnstile.token, emailRedirectTo: callback.toString() },
    });
    setSending(false);
    // A token is single-use whether the send worked or not.
    turnstile.reset();

    // NEUTRAL EITHER WAY. resend errors for an address that is already
    // confirmed, and saying so would make this page an account checker
    // (WEB-AUTH-004). The message says what was attempted, not what was found.
    toast({
      title: "Check your email",
      description: `If that address needs confirming, a new link is on its way. ${LINK_EXPIRY_COPY}`,
    });
    if (error) {
      handleError(error, { component: "AuthVerified", action: "resendConfirmation" }, ErrorSeverity.WARNING);
    }
  };

  return (
    <form onSubmit={handleResend} className="mt-6 space-y-3" noValidate>
      <Label htmlFor="resend-email">Email address</Label>
      <Input
        id="resend-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        className="h-11"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {turnstile.enabled && <div ref={turnstile.containerRef} className="flex justify-center empty:hidden" />}
      <Button type="submit" disabled={sending} className="w-full h-11">
        {sending ? "Sending..." : "Send a new confirmation link"}
      </Button>
    </form>
  );
}
