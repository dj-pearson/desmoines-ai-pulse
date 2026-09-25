import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAuthSecurity } from "@/hooks/useAuthSecurity";
import { useTurnstile } from "@/hooks/useTurnstile";
import { MFAVerificationDialog } from "@/components/auth/MFAVerificationDialog";
import { SignInForm, type SignInValues, EMAIL_FORMAT_MESSAGE } from "@/components/auth/SignInForm";
import { SignUpForm, type SignUpValues, type SignUpFieldError } from "@/components/auth/SignUpForm";
import { ForgotPasswordForm, type ForgotPasswordValues } from "@/components/auth/ForgotPasswordForm";
import { EmailSentPanel } from "@/components/auth/EmailSentPanel";
import { supabase } from "@/integrations/supabase/client";
import { getSafeRedirectUrl } from "@/lib/redirectSafety";
import { rememberAuthNext, takeAuthNext } from "@/lib/authReturn";
import { SecurityUtils } from "@/lib/securityUtils";
import { authErrorCopy } from "@/lib/authErrorMessages";
import { logConsent } from "@/lib/consentLog";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policyVersions";
import { handleError } from "@/lib/errorHandler";

// Google Logo SVG Component (official colors)
const GoogleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// Apple Logo SVG Component
const AppleLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

type AuthTab = "signin" | "signup";
type AuthView = "form" | "forgot" | "email-sent";


interface LockoutCheck {
  allowed?: boolean;
  lockoutSeconds?: number;
}

/**
 * Ask check-login-attempt whether this address is locked, and for how long.
 * AuthContext consults the same function before every sign-in but returns only
 * a sentence, and a sentence can't drive a countdown. `check` is read-only on
 * the server. Any failure answers "not locked": an outage must never disable
 * the sign-in button.
 */
async function readServerLockoutSeconds(email: string): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke<LockoutCheck>("check-login-attempt", {
      body: { email, action: "check" },
    });
    if (error || !data || data.allowed !== false) return 0;
    const seconds = Number(data.lockoutSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0;
  } catch {
    return 0;
  }
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // `?mode=signup` opens the sign-up tab. The header's "Sign Up Free" and every
  // "create an account to save this" prompt can link straight to it.
  const [tab, setTab] = useState<AuthTab>(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [view, setView] = useState<AuthView>("form");
  const [emailDraft, setEmailDraft] = useState("");
  const [sentTo, setSentTo] = useState("");
  // WEB-AUTH-004. Held so Resend can skip the call for an address that already
  // had an account. The panel itself says the same thing either way.
  const [addressAlreadyRegistered, setAddressAlreadyRegistered] = useState(false);
  // WEB-AUTH-008: set when a sign-in fails only because the address was never
  // confirmed.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isOAuthPending, setIsOAuthPending] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);
  // Set once a code is accepted, so the dialog does not reopen while the
  // context catches up with the aal2 session.
  const [mfaDone, setMfaDone] = useState(false);
  const [challengeVisible, setChallengeVisible] = useState(false);

  const {
    isAuthenticated,
    isPasswordRecovery,
    requiresMFA,
    mfaFactorId,
    logout,
    login,
    signup,
    signInWithGoogle,
    signInWithApple,
    resetPassword: resetPasswordContext,
    resendVerification: resendVerificationContext,
  } = useAuth();

  const { checkDisposableEmail } = useAuthSecurity();

  /**
   * WEB-SEC-029. Solves in the background and renders nothing unless
   * Cloudflare wants to interrogate this visitor. With no
   * VITE_TURNSTILE_SITE_KEY this is inert: `token` is undefined, every call
   * below passes undefined, and nothing renders.
   */
  const turnstile = useTurnstile();

  useDocumentTitle(tab === "signup" ? "Create an account" : "Sign In");

  const rawRedirect = searchParams.get("redirect");
  const redirectTo = getSafeRedirectUrl(rawRedirect, "/");

  useEffect(() => {
    // WEB-AUTH-001. A password-recovery link creates a real session; both
    // isPasswordRecovery and the old ?reset=true link go to the page that can
    // change a password.
    const isRecovery = isPasswordRecovery || searchParams.get("reset") === "true";
    if (isRecovery) {
      navigate("/auth/reset-password", { replace: true });
      return;
    }

    // WEB-SEC-026: never navigate away from the sign-in page while a second
    // factor is still owed.
    if (isAuthenticated && !requiresMFA) {
      navigate(getSafeRedirectUrl(searchParams.get("redirect"), "/"), { replace: true });
    }
  }, [isAuthenticated, isPasswordRecovery, requiresMFA, navigate, searchParams]);

  // Live countdown for the server lockout. The button re-enables at zero with
  // no reload (WP1 item 3).
  useEffect(() => {
    if (!lockoutUntil) {
      setLockoutSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutSecondsLeft(left);
      if (left === 0) setLockoutUntil(null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  // WP1 item 7. Announce a Turnstile challenge when Cloudflare actually draws
  // one. The container is `empty:hidden`, so its height is zero until then.
  const containerRef = turnstile.containerRef;
  useEffect(() => {
    const el = containerRef.current;
    if (!turnstile.enabled || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setChallengeVisible(el.offsetHeight > 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [turnstile.enabled, containerRef]);

  /** A token is single-use: after any submit that carried one, get a new one. */
  const takeCaptchaToken = useCallback((): { token: string | undefined; done: () => void } => {
    const token = turnstile.token;
    return {
      token,
      done: () => {
        if (token) turnstile.reset();
      },
    };
  }, [turnstile]);

  const goToSignIn = (email?: string) => {
    if (email !== undefined) setEmailDraft(email);
    setView("form");
    setTab("signin");
  };

  const goToForgot = (email: string) => {
    setEmailDraft(email);
    setTab("signin");
    setView("forgot");
  };

  const handleLogin = async ({ email, password }: SignInValues) => {
    const address = email.trim();
    setEmailDraft(address);

    // Format first, before anything counts an attempt. The schema already did
    // this; the handler repeats it because it is the last stop before the
    // network, and a format problem must never read as "Too Many Attempts".
    if (!SecurityUtils.validateEmail(address).isValid) {
      toast({ title: "Check your email address", description: EMAIL_FORMAT_MESSAGE, variant: "destructive" });
      return;
    }

    const captcha = takeCaptchaToken();
    try {
      const result = await login(address, password, captcha.token);

      if (result.requiresMFA) {
        // The dialog opens from requiresMFA; nothing else to do here.
        setMfaDone(false);
        return;
      }

      if (result.success) {
        setUnconfirmedEmail(null);
        setLockoutUntil(null);
        toast({ title: "Signed in", description: "Welcome back." });
        navigate(redirectTo, { replace: true });
        return;
      }

      const copy = authErrorCopy(result.errorCode, result.error);
      setUnconfirmedEmail(copy.action === "resend_confirmation" ? address : null);

      // AuthContext's own throttle and the server lock both answer with a
      // sentence and no code. Ask the server how long, so the button can count
      // down and come back by itself.
      const lockoutSeconds = copy.action === "resend_confirmation" ? 0 : await readServerLockoutSeconds(address);
      if (lockoutSeconds > 0) {
        setLockoutUntil(Date.now() + lockoutSeconds * 1000);
        toast({
          title: "Too many attempts",
          description: "Sign-in for this address is paused for a few minutes. The button will come back on its own.",
          variant: "destructive",
        });
        return;
      }

      if (!result.errorCode && result.error && /too many/i.test(result.error)) {
        // The local throttle's sentence is ours, not Supabase's, so it can be
        // shown as written.
        toast({ title: "Too many attempts", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: copy.title, description: copy.description, variant: "destructive" });
    } catch (error) {
      handleError(error, { component: "Auth", action: "login" });
    } finally {
      captcha.done();
    }
  };

  const handleMFASuccess = () => {
    setMfaDone(true);
    setLockoutUntil(null);
    toast({ title: "Signed in", description: "Welcome back." });
    navigate(redirectTo, { replace: true });
  };

  const handleMFACancel = async () => {
    // WEB-SEC-026. signInWithPassword has already stored an aal1 session, and
    // it stays valid against the API until it expires. Cancelling the second
    // factor has to end it. This runs ONLY on a real cancel now: the dialog no
    // longer calls onCancel after a correct code (WP1 item 1).
    await logout();

    toast({
      title: "Sign-in cancelled",
      description: "You're signed out. Sign in again when you have your code.",
    });
  };

  // Takes the address rather than reading state, because there are two
  // callers: the email-sent panel and the unconfirmed-address note.
  const handleResendVerification = async (email: string) => {
    setIsResending(true);
    try {
      const result = await resendVerificationContext(email);
      if (!result.success) {
        const copy = authErrorCopy(undefined, result.error, "Couldn't send the email");
        toast({ title: copy.title, description: copy.description, variant: "destructive" });
        return;
      }
      toast({ title: "Sent", description: "A new link is on its way. Check spam if it doesn't show up." });
    } finally {
      setIsResending(false);
    }
  };

  const handleResendFromPanel = async () => {
    if (addressAlreadyRegistered) {
      // auth.resend({ type: 'signup' }) errors for an address that is already
      // confirmed. Skipping the call keeps the screen identical for everyone;
      // the copy below is the same one a new address gets.
      toast({ title: "Sent", description: "A new link is on its way. Check spam if it doesn't show up." });
      return;
    }
    await handleResendVerification(sentTo);
  };

  const handleForgotPassword = async ({ email }: ForgotPasswordValues) => {
    const address = email.trim();
    setEmailDraft(address);
    const captcha = takeCaptchaToken();
    try {
      const result = await resetPasswordContext(address, captcha.token);
      if (!result.success) {
        const copy = authErrorCopy(undefined, result.error, "Couldn't send the reset link");
        toast({ title: copy.title, description: copy.description, variant: "destructive" });
        return;
      }
      toast({
        title: "Check your email",
        description: "If there's an account for that address, a reset link is on its way.",
      });
      setView("form");
    } finally {
      captcha.done();
    }
  };

  const handleSignup = async (values: SignUpValues): Promise<SignUpFieldError | void> => {
    const email = values.email.trim();
    setEmailDraft(email);

    const disposable = await checkDisposableEmail(email);
    if (!disposable.allowed) {
      return {
        field: "email",
        message: disposable.message || "Use a permanent email address.",
      };
    }

    // Consent record - timestamped acceptance of the Terms and Privacy Policy,
    // read out of raw_user_meta_data by the handle_new_user trigger. The
    // opt-ins are recorded only as the person set them; both default off. SMS
    // is recorded as not given because the form no longer offers it.
    const consentRecord = {
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      // The "I'm 13 or older" box. No date of birth is collected.
      at_least_13: values.isAtLeast13,
      email_marketing_consent: values.emailNotifications,
      sms_marketing_consent: false,
      personalization_consent: values.eventRecommendations,
    };

    const metadata = {
      account_type: "personal",
      communication_preferences: {
        email_notifications: values.emailNotifications,
        sms_notifications: false,
        event_recommendations: values.eventRecommendations,
      },
      consent: consentRecord,
    };

    // WP1 item 6. Remember where they came from before the account exists, so
    // confirmation (or OAuth, below) can land them back there.
    rememberAuthNext(redirectTo);

    const captcha = takeCaptchaToken();
    let result: Awaited<ReturnType<typeof signup>>;
    try {
      result = await signup(email, values.password, metadata, captcha.token);
    } finally {
      captcha.done();
    }

    if (!result.success) {
      const copy = authErrorCopy(undefined, result.error, "Couldn't create your account");
      // A password the server refused belongs on the password field, not in a
      // toast that disappears while they fix it.
      if (copy === authErrorCopy("weak_password", null)) {
        return { field: "password", message: copy.description };
      }
      toast({ title: copy.title, description: copy.description, variant: "destructive" });
      return;
    }

    // FALLBACK ONLY, AND SCHEDULED FOR REMOVAL (WEB-AUTH-003).
    //
    // These rows are written by the handle_new_user trigger out of
    // raw_user_meta_data.consent. This client copy stays until D9 in the
    // account plan confirms the trigger writes them in production; a duplicate
    // in an append-only consent log proves the same fact twice, which is the
    // safe direction to be wrong in. metadata.writer tells the two apart.
    void logConsent({
      type: "terms",
      granted: true,
      source: "signup",
      policyVersion: consentRecord.terms_version,
      email,
      metadata: { privacy_version: consentRecord.privacy_version },
    });
    if (values.emailNotifications) {
      void logConsent({ type: "marketing_email", granted: true, source: "signup", email });
    }
    if (values.eventRecommendations) {
      void logConsent({ type: "personalization_ai", granted: true, source: "signup", email });
    }

    if (result.needsVerification) {
      setSentTo(email);
      setAddressAlreadyRegistered(!!result.alreadyRegistered);
      setView("email-sent");
      return;
    }

    toast({ title: "Account created", description: "Welcome to Des Moines Insider." });
    navigate(takeAuthNext() ?? redirectTo, { replace: true });
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setIsOAuthPending(true);
    rememberAuthNext(redirectTo);
    const target = rawRedirect ? redirectTo : undefined;
    const result = provider === "google" ? await signInWithGoogle(target) : await signInWithApple(target);
    if (!result.success) {
      const name = provider === "google" ? "Google" : "Apple";
      const copy = authErrorCopy(undefined, result.error, `Couldn't reach ${name}`);
      toast({ title: copy.title, description: copy.description, variant: "destructive" });
      setIsOAuthPending(false);
    }
    // On success the browser is leaving for the provider; keep the buttons busy.
  };

  const showTabs = view !== "email-sent";
  const showOAuth = view === "form";

  return (
    <main className="min-h-screen bg-background flex items-start justify-center px-4 py-8 sm:items-center">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            {tab === "signup" ? "Create your account" : "Sign in"}
          </h1>
          <CardDescription>
            {tab === "signup"
              ? "Save events, restaurants and searches to your account."
              : "Welcome back to Des Moines Insider."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(value) => { setTab(value as AuthTab); setView("form"); }}>
            {showTabs && (
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
            )}

            {/* WP1 item 5. Google and Apple above the form on BOTH tabs; they
                were only on the sign-in tab, so a new visitor had to type a
                password to find out they didn't need one. */}
            {showOAuth && (
              <div className="mt-6 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleOAuth("google")}
                    disabled={isOAuthPending}
                    className="w-full"
                  >
                    <GoogleLogo className="h-4 w-4 mr-2" />
                    Continue with Google
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleOAuth("apple")}
                    disabled={isOAuthPending}
                    className="w-full"
                  >
                    <AppleLogo className="h-4 w-4 mr-2" />
                    Continue with Apple
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Continuing with Google or Apple means you agree to our{" "}
                  <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>
                  {" "}and{" "}
                  <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
                </p>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <span className="w-full border-t" />
                  </div>
                  <p className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">or use your email</span>
                  </p>
                </div>
              </div>
            )}

            {/* WEB-SEC-029 / WP1 item 7. ONE Turnstile widget for every form on
                this page, kept mounted in this slot so switching tabs does not
                throw it away. It sits above the forms, and so above every
                submit button, and is no longer aria-hidden: that hid the
                challenge iframe from screen readers on the one occasion it has
                something to say. `empty:hidden` keeps an unconfigured or
                unchallenged page free of an empty box. */}
            <p className="sr-only" aria-live="polite">
              {challengeVisible ? "Complete the check below to continue." : ""}
            </p>
            {turnstile.enabled && (
              <div
                ref={turnstile.containerRef}
                className={view === "email-sent" ? "hidden" : "mt-4 flex justify-center empty:hidden"}
              />
            )}

            {view === "email-sent" ? (
              <EmailSentPanel
                email={sentTo}
                onResend={handleResendFromPanel}
                isResending={isResending}
                onSignIn={() => goToSignIn(sentTo)}
                onForgotPassword={() => goToForgot(sentTo)}
              />
            ) : (
              <>
                <TabsContent value="signin" className="mt-4">
                  {view === "forgot" ? (
                    <ForgotPasswordForm
                      defaultEmail={emailDraft}
                      onSubmit={handleForgotPassword}
                      onBack={() => setView("form")}
                    />
                  ) : (
                    <SignInForm
                      defaultEmail={emailDraft}
                      onSubmit={handleLogin}
                      onForgotPassword={goToForgot}
                      lockoutSecondsLeft={lockoutSecondsLeft}
                      unconfirmedEmail={unconfirmedEmail}
                      onResendConfirmation={handleResendVerification}
                      isResending={isResending}
                    />
                  )}
                </TabsContent>
                <TabsContent value="signup" className="mt-4">
                  <SignUpForm defaultEmail={emailDraft} onSubmit={handleSignup} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* WP1 item 4. Open whenever the session still owes a second factor, not
          only after the password form set a factor id: a Google or Apple
          sign-in, or a reload between the password and the code, lands here
          with requiresMFA set and no local state. The dialog finds the factor
          itself when none is known. */}
      <MFAVerificationDialog
        open={requiresMFA && !mfaDone}
        onOpenChange={() => {
          /* Open state follows requiresMFA; success and cancel handle the rest. */
        }}
        factorId={mfaFactorId}
        onSuccess={handleMFASuccess}
        onCancel={handleMFACancel}
      />
    </main>
  );
}
