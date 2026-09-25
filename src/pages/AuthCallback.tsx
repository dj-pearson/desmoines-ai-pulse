import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import { readAuthCallbackError, type AuthFlow } from "@/lib/authCallbackError";
import { getSafeRedirectUrl } from "@/lib/redirectSafety";
import { takeAuthNext } from "@/lib/authReturn";
import { logConsent } from "@/lib/consentLog";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/policyVersions";

const log = createLogger("AuthCallback");

/** How long to wait for supabase-js to finish the code exchange before giving up. */
const SESSION_TIMEOUT_MS = 10_000;


const VERIFIED_PATH = "/auth/verified";

type Phase =
  | { kind: "loading" }
  | { kind: "finish-setup"; destination: string }
  | { kind: "error"; message: string; code: string | null; canResend: boolean };

/**
 * Which redirect this is. `flow=oauth` is explicit when AuthContext sends it
 * (Home WP2 hand-off); until then a return aimed at /auth/verified is an email
 * confirmation and anything else came back from Google or Apple.
 */
function detectFlow(params: URLSearchParams): AuthFlow {
  const flow = params.get("flow");
  if (flow === "oauth" || flow === "email" || flow === "recovery") return flow;
  if (params.get("type") === "recovery") return "recovery";
  return params.get("redirect") === VERIFIED_PATH ? "email" : "oauth";
}

/** Where "Try again" and the MFA hop should point, without consuming storage. */
function intendedPath(params: URLSearchParams, flow: AuthFlow): string {
  const raw = flow === "email" ? params.get("next") : params.get("redirect");
  return getSafeRedirectUrl(raw, "/");
}

function authLink(path: string): string {
  return path === "/" ? "/auth" : `/auth?redirect=${encodeURIComponent(path)}`;
}

/**
 * Resolves with the session as soon as one exists, or null after the timeout.
 * supabase-js exchanges the code or reads the fragment itself on load; this
 * only listens for the result. onAuthStateChange fires INITIAL_SESSION on
 * subscribe, so an exchange that already finished resolves at once.
 */
function waitForSession(timeoutMs: number): Promise<Session | null> {
  return new Promise((resolve) => {
    let settled = false;
    // Filled in below; finish() may run before either exists, because the
    // listener can fire during the onAuthStateChange call itself.
    const pending: { unsubscribe?: () => void; timer?: ReturnType<typeof setTimeout> } = {};

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      if (pending.timer) clearTimeout(pending.timer);
      pending.unsubscribe?.();
      resolve(session);
    };

    // Deferred with setTimeout: supabase-js runs this listener while holding
    // its auth lock, and the next step calls back into supabase.auth. Resolving
    // inline deadlocked until the lock timed out and threw.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(() => finish(session), 0);
    });
    pending.unsubscribe = () => data.subscription.unsubscribe();
    if (settled) {
      pending.unsubscribe();
      return;
    }

    pending.timer = setTimeout(() => finish(null), timeoutMs);

    void supabase.auth.getSession().then(({ data: current, error }) => {
      if (error) log.warn("waitForSession", "getSession failed", { message: error.message });
      if (current.session) finish(current.session);
    });
  });
}

/** True when this session still owes a second factor (aal1 now, aal2 available). */
async function owesSecondFactor(): Promise<boolean> {
  // Fails open like AuthContext does: a user with no second factor must never
  // be stuck here because an assurance read failed, and AuthContext still
  // withholds isAuthenticated from an aal1 session that needs aal2. The call
  // can THROW as well as resolve with { error } (a token it cannot decode
  // throws AuthInvalidJwtError), so both are caught.
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      handleError(error, { component: "AuthCallback", action: "readAssuranceLevel" }, ErrorSeverity.WARNING);
      return false;
    }
    return data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
  } catch (error) {
    handleError(error, { component: "AuthCallback", action: "readAssuranceLevel" }, ErrorSeverity.WARNING);
    return false;
  }
}

/**
 * True when this account has no terms acceptance on record. Google and Apple
 * sign-ups carry no `consent` metadata, so the signup trigger writes nothing
 * for them (20260902000014) and they have never agreed to anything.
 *
 * An email sign-up that carries `consent.terms_accepted` in its metadata is
 * treated as recorded even with no row visible yet: until 20260902000014 is
 * applied (it is not in the 2026-08-24 snapshot), the client wrote that row
 * with user_id NULL, so the user cannot read it back and asking again would
 * be asking someone who ticked the box ten seconds ago.
 *
 * A failed read answers false. Blocking sign-in on a consent lookup that
 * could not run would lock people out for our fault.
 */
async function needsTermsConsent(session: Session): Promise<boolean> {
  const meta = session.user.user_metadata as { consent?: { terms_accepted?: unknown } } | undefined;
  if (meta?.consent?.terms_accepted === true) return false;

  const { data, error } = await supabase
    .from("consent_records")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("consent_type", "terms")
    .eq("granted", true)
    .limit(1);
  if (error) {
    handleError(error, { component: "AuthCallback", action: "readTermsConsent" }, ErrorSeverity.WARNING);
    return false;
  }
  return (data ?? []).length === 0;
}

/**
 * /auth/callback: where Google, Apple and every confirmation email return.
 *
 * It says only what happened. There is no "Sign in successful!" screen: the
 * page navigates the moment a session exists, a session that still owes a
 * second factor goes to /auth to give it, and an OAuth account that never
 * agreed to the terms answers that here before going anywhere.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const startedRef = useRef(false);

  useDocumentTitle(
    phase.kind === "finish-setup" ? "Finish Setting Up" : phase.kind === "error" ? "Sign-in Problem" : "Signing You In",
  );

  const flow = detectFlow(searchParams);
  const retryPath = intendedPath(searchParams, flow);

  useEffect(() => {
    // Once per mount. React's dev double-invoke would otherwise consume the
    // stored return path on the first run and find nothing on the second.
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        // WEB-AUTH-005: both halves of the URL, because Supabase puts
        // implicit-flow and email-link failures in the fragment.
        const authError = readAuthCallbackError(window.location.search, window.location.hash, flow);
        if (authError) {
          log.error("run", "Auth callback error", { code: authError.code, flow });
          setPhase({ kind: "error", message: authError.message, code: authError.code, canResend: authError.canResend });
          return;
        }

        const session = await waitForSession(SESSION_TIMEOUT_MS);
        if (!session) {
          log.error("run", "No session before timeout", { flow });
          setPhase({
            kind: "error",
            message:
              flow === "email"
                ? "We couldn't finish confirming your email. If you opened the link in a different browser from the one you signed up in, open it there, or request a new one."
                : "We couldn't finish signing you in. Try again, or sign in with your email and password.",
            code: null,
            canResend: flow === "email",
          });
          return;
        }

        const destination = resolveDestination(searchParams, flow);

        if (await owesSecondFactor()) {
          // WP2 item 4. /auth shows the code dialog whenever requiresMFA is
          // set, then honours ?redirect.
          navigate(authLink(destination), { replace: true });
          return;
        }

        if (await needsTermsConsent(session)) {
          setPhase({ kind: "finish-setup", destination });
          return;
        }

        navigate(destination, { replace: true });
      } catch (error) {
        handleError(error, { component: "AuthCallback", action: "completeSignIn" }, ErrorSeverity.WARNING);
        setPhase({
          kind: "error",
          message: "Something went wrong while signing you in. Trying again usually works.",
          code: null,
          canResend: false,
        });
      }
    };

    void run();
  }, [flow, navigate, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 sm:p-8">
        {phase.kind === "loading" && (
          <div className="text-center" role="status" aria-live="polite">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold">
              {flow === "email" ? "Confirming your email" : "Signing you in"}
            </h1>
          </div>
        )}

        {phase.kind === "finish-setup" && (
          <FinishSetup
            onDone={() => navigate(phase.destination, { replace: true })}
            onDecline={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) handleError(error, { component: "AuthCallback", action: "declineTerms" }, ErrorSeverity.WARNING);
              navigate("/", { replace: true });
            }}
          />
        )}

        {phase.kind === "error" && (
          <div className="text-center">
            <XCircle className="h-10 w-10 text-destructive mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-xl font-semibold mb-2">
              {flow === "email" ? "We couldn't confirm your email" : "We couldn't sign you in"}
            </h1>
            <p className="text-muted-foreground mb-6">{phase.message}</p>
            <div className="flex flex-col gap-3">
              {flow === "email" && phase.canResend && (
                <Button asChild className="w-full">
                  <Link
                    to={`${VERIFIED_PATH}?error_code=${encodeURIComponent(phase.code ?? "server_error")}${
                      retryPath !== "/" ? `&next=${encodeURIComponent(retryPath)}` : ""
                    }`}
                  >
                    Send a new confirmation link
                  </Link>
                </Button>
              )}
              <Button
                asChild
                variant={flow === "email" && phase.canResend ? "outline" : "default"}
                className="w-full"
              >
                <Link to={authLink(retryPath)}>{flow === "email" ? "Back to sign in" : "Try again"}</Link>
              </Button>
            </div>
            {phase.code && <p className="mt-4 text-xs text-muted-foreground">Reference: {phase.code}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Where a finished sign-in goes. An email confirmation goes on to
 * /auth/verified, which takes the remembered path itself; an OAuth return
 * prefers the explicit ?redirect and otherwise the path remembered before the
 * button was pressed.
 */
function resolveDestination(params: URLSearchParams, flow: AuthFlow): string {
  if (flow === "email") {
    const next = params.get("next");
    const safeNext = next ? getSafeRedirectUrl(next, "") : "";
    const query = new URLSearchParams({ confirmed: "true" });
    if (safeNext) query.set("next", safeNext);
    return `${VERIFIED_PATH}?${query.toString()}`;
  }

  const stored = takeAuthNext();
  const explicit = getSafeRedirectUrl(params.get("redirect"), "");
  if (explicit && explicit !== "/") return explicit;
  return stored ?? "/";
}

interface FinishSetupProps {
  onDone: () => void;
  onDecline: () => Promise<void>;
}

/**
 * WP2 item 3. The same bar an email sign-up clears: age, terms, and the
 * opt-ins left unticked. Each answer is written as its own consent row before
 * the person moves on.
 */
function FinishSetup({ onDone, onDecline }: FinishSetupProps) {
  const [atLeast13, setAtLeast13] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketingEmail, setMarketingEmail] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const ageError = submitted && !atLeast13;
  const termsError = submitted && !terms;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!atLeast13 || !terms) return;

    setSaving(true);
    // logConsent never throws; a failed insert is logged there. The rows are
    // written before navigating so the record exists by the time any page
    // that reads it loads.
    await Promise.all([
      logConsent({
        type: "terms",
        granted: true,
        source: "signup",
        policyVersion: TERMS_VERSION,
        metadata: { privacy_version: PRIVACY_VERSION, at_least_13: true, writer: "oauth_finish_setup" },
      }),
      logConsent({
        type: "marketing_email",
        granted: marketingEmail,
        source: "signup",
        metadata: { writer: "oauth_finish_setup" },
      }),
      logConsent({
        type: "personalization_ai",
        granted: personalization,
        source: "signup",
        metadata: { writer: "oauth_finish_setup" },
      }),
    ]);
    setSaving(false);
    onDone();
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="text-2xl font-semibold">Finish setting up</h1>
      <p className="mt-2 text-muted-foreground">
        Google and Apple don't pass these along, so we ask once.
      </p>

      <fieldset className="mt-6 space-y-4">
        <legend className="sr-only">Required</legend>
        <ConsentCheckbox
          id="finish-age"
          checked={atLeast13}
          onChange={setAtLeast13}
          error={ageError ? "You need to be 13 or older to use Des Moines Insider." : undefined}
        >
          I'm 13 or older
        </ConsentCheckbox>
        <ConsentCheckbox
          id="finish-terms"
          checked={terms}
          onChange={setTerms}
          error={termsError ? "Agree to the terms to continue." : undefined}
        >
          I agree to the{" "}
          <Link to="/terms" target="_blank" rel="noopener" className="underline underline-offset-2">
            Terms of Service
          </Link>
          ,{" "}
          <Link to="/privacy-policy" target="_blank" rel="noopener" className="underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/acceptable-use" target="_blank" rel="noopener" className="underline underline-offset-2">
            Acceptable Use Policy
          </Link>
        </ConsentCheckbox>
      </fieldset>

      <fieldset className="mt-6 space-y-4">
        <legend className="text-sm font-medium">Optional, and off unless you tick them</legend>
        <ConsentCheckbox id="finish-marketing" checked={marketingEmail} onChange={setMarketingEmail}>
          Email me about Des Moines events and offers
        </ConsentCheckbox>
        <ConsentCheckbox id="finish-personalization" checked={personalization} onChange={setPersonalization}>
          Use what I save and view to suggest events
        </ConsentCheckbox>
      </fieldset>

      <div className="mt-8 flex flex-col gap-3">
        <Button type="submit" className="w-full h-11" disabled={saving}>
          {saving ? "Saving..." : "Continue"}
        </Button>
        <Button type="button" variant="ghost" className="w-full h-11" disabled={saving} onClick={() => void onDecline()}>
          Not now, sign me out
        </Button>
      </div>
    </form>
  );
}

interface ConsentCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string;
  children: React.ReactNode;
}

function ConsentCheckbox({ id, checked, onChange, error, children }: ConsentCheckboxProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 h-5 w-5"
        />
        <Label htmlFor={id} className="text-sm font-normal leading-snug">
          {children}
        </Label>
      </div>
      {error && (
        <p id={errorId} className="mt-1 pl-8 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
