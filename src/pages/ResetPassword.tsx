/**
 * WEB-AUTH-001: the page a password reset link actually leads to.
 *
 * Before this existed, "Forgot password" sent a link to `/auth?reset=true`,
 * nothing read that parameter, no PASSWORD_RECOVERY handler existed, and
 * `updatePassword` had zero callers. The link signed the user in and Auth.tsx
 * redirected them to the homepage, so the feature was a one-hour magic link
 * that left the old password in place.
 *
 * Two things make this page work without trusting a flag:
 *   - `resetPassword` now points its redirectTo here, so the recovery session
 *     is already established when this mounts;
 *   - Supabase puts an expired or consumed link's failure in the URL rather
 *     than in a session, so the error branch below reads it from the query
 *     string AND the hash (PKCE uses one, the implicit flow the other).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/hooks/use-toast";
import { useTurnstile } from "@/hooks/useTurnstile";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { readAuthCallbackError, LINK_EXPIRY_COPY } from "@/lib/authCallbackError";
import { authErrorCopy } from "@/lib/authErrorMessages";
import { passwordSchema } from "@/lib/passwordStrength";

const log = createLogger("ResetPassword");

/** Where a signed-in person changes a password, behind re-authentication (WP5). */
const SETTINGS_PASSWORD_PATH = "/profile?tab=settings#password";

/**
 * How long to wait before deciding a signed-in visitor is not recovering.
 * supabase-js emits PASSWORD_RECOVERY in a setTimeout after it saves the
 * session, so INITIAL_SESSION can reach AuthContext first and the flag lands a
 * beat later. Redirecting on the first render would bounce the very person the
 * reset link was for.
 */
const RECOVERY_GRACE_MS = 1500;

/** The password rules come from one place (WP1's passwordStrength.ts). */
const resetSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof resetSchema>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isPasswordRecovery, updatePassword } = useAuth();
  useDocumentTitle("Set a New Password");

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState<null | { othersSignedOut: boolean }>(null);
  const [notRecovering, setNotRecovering] = useState(false);

  // WEB-AUTH-005's reader, with recovery wording. The fragment is read from
  // window as well: supabase-js can clear it before this lazy page mounts.
  const linkError = useMemo(
    () => readAuthCallbackError(location.search, location.hash || window.location.hash, "recovery"),
    [location.search, location.hash],
  );

  const form = useForm<PasswordForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const password = form.watch("password");

  // WP2 item 8. This page lets a session set a new password with nothing else,
  // which is right for a recovery link and wrong for any other signed-in
  // visitor. They go to Settings, where the change asks for the current
  // password first.
  useEffect(() => {
    if (done || linkError || isLoading || !isAuthenticated || isPasswordRecovery) {
      setNotRecovering(false);
      return;
    }
    const timer = setTimeout(() => setNotRecovering(true), RECOVERY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [done, linkError, isLoading, isAuthenticated, isPasswordRecovery]);

  const onSubmit = async (values: PasswordForm) => {
    setIsSubmitting(true);
    try {
      const result = await updatePassword(values.password);
      if (!result.success) {
        const copy = authErrorCopy(undefined, result.error, "Could not update password");
        toast({ title: copy.title, description: copy.description, variant: "destructive" });
        return;
      }

      // Anyone who got in with the old password stays in until their token
      // expires unless the other sessions are ended here. 'others' rather than
      // 'global' so this browser stays signed in.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
      if (signOutError) {
        // Not fatal: the password IS changed. But the page must not then claim
        // the other devices were signed out.
        log.warn("onSubmit", "could not end other sessions", { message: signOutError.message });
      }

      setDone({ othersSignedOut: !signOutError });
      toast({
        title: "Password updated",
        description: signOutError
          ? "Your password is changed. We couldn't sign out your other devices."
          : "You're signed in here, and other devices have been signed out.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md rounded-2xl">{children}</Card>
      </div>
      <Footer />
    </div>
  );

  if (done) {
    return shell(
      <>
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Password updated</h1>
          <CardDescription>
            {done.othersSignedOut
              ? "You're signed in on this device. Every other device has been signed out."
              : "You're signed in on this device. We couldn't sign out your other devices, so do that from Settings."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full h-11" onClick={() => navigate("/", { replace: true })}>
            Continue to Des Moines Insider
          </Button>
          {!done.othersSignedOut && (
            <Button variant="outline" className="w-full h-11" asChild>
              <Link to="/profile?tab=settings">Open Settings</Link>
            </Button>
          )}
        </CardContent>
      </>
    );
  }

  if (notRecovering) {
    return <Navigate to={SETTINGS_PASSWORD_PATH} replace />;
  }

  // A dead link, or a visit with no recovery session at all. Both are fixed by
  // the same thing: send another email.
  if (linkError || (!isLoading && !isAuthenticated)) {
    const expired = linkError?.code === "otp_expired";
    const title = !linkError
      ? "Reset your password"
      : expired
        ? "This link has expired"
        : "This reset link can't be used";
    return shell(
      <>
        <CardHeader className="text-center space-y-3">
          {linkError && (
            <div className="flex justify-center">
              <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
          <CardDescription>
            {linkError
              ? linkError.message
              : `Enter the address you signed up with and we'll send a link to set a new password. ${LINK_EXPIRY_COPY}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResendResetLink />
          <Button variant="ghost" className="w-full h-11" asChild>
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </CardContent>
      </>
    );
  }

  if (isLoading || (isAuthenticated && !isPasswordRecovery)) {
    return shell(
      <CardContent className="py-12 text-center" role="status" aria-live="polite">
        <h1 className="text-xl font-semibold">Checking your reset link</h1>
      </CardContent>
    );
  }

  return shell(
    <>
      <CardHeader className="text-center space-y-3">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-3">
            <KeyRound className="h-10 w-10 text-primary" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold leading-none tracking-tight">Set a new password</h1>
        <CardDescription>
          Choose something you haven't used here before. Other devices will be
          signed out once you save.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="new-password">New password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoFocus
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-r-md"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PasswordStrengthMeter password={password} showRequirements />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="confirm-password">Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </>
  );
}

/**
 * The "send again" form, as its own component so the Turnstile widget mounts
 * with it (useTurnstile renders into its container once, on mount).
 * WP2 item 7: recovery has to work once captcha is enforced.
 */
function ResendResetLink() {
  const { toast } = useToast();
  const { resetPassword } = useAuth();
  const turnstile = useTurnstile();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      toast({
        title: "Enter your email",
        description: "Use the address you signed up with.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    const result = await resetPassword(address, turnstile.token);
    setSending(false);
    // Single-use token: reset after every send, success or failure.
    turnstile.reset();

    if (result.success) {
      toast({
        title: "Check your email",
        description: `If that address has an account, a reset link is on its way. ${LINK_EXPIRY_COPY}`,
      });
      return;
    }
    const copy = authErrorCopy(undefined, result.error, "Could not send the email");
    toast({ title: copy.title, description: copy.description, variant: "destructive" });
  };

  return (
    <form onSubmit={handleSend} className="space-y-4" noValidate>
      <div className="space-y-2">
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
      </div>
      {turnstile.enabled && <div ref={turnstile.containerRef} className="flex justify-center empty:hidden" />}
      <Button type="submit" className="w-full h-11" disabled={sending}>
        {sending ? "Sending..." : "Send again"}
      </Button>
    </form>
  );
}
