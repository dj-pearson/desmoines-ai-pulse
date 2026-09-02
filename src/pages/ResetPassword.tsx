/**
 * WEB-AUTH-001 — the page a password reset link actually leads to.
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
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("ResetPassword");

/**
 * The same rules as SecurityUtils.validatePassword, expressed for this form so
 * the messages land on the field instead of in a toast. Kept in the same order
 * as that function so a change there is easy to mirror here.
 */
const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password must be less than 128 characters long")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/\d/, "Password must contain at least one number")
      .regex(
        /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
        "Password must contain at least one special character"
      ),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

/** Supabase reports a dead link in the query string (PKCE) or the hash (implicit). */
function readLinkError(search: URLSearchParams): { code: string; description: string } | null {
  const hash = new URLSearchParams(
    typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : ""
  );
  const code = search.get("error_code") || hash.get("error_code") || "";
  const rawError = search.get("error") || hash.get("error") || "";
  if (!code && !rawError) return null;
  const description =
    search.get("error_description") || hash.get("error_description") || "";
  return { code: code || rawError, description: description.replace(/\+/g, " ") };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isPasswordRecovery, updatePassword, resetPassword } = useAuth();
  useDocumentTitle("Set a New Password");

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  const linkError = useMemo(() => readLinkError(searchParams), [searchParams]);

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const password = form.watch("password");

  // A recovery session is a real session, so `isAuthenticated` is the check
  // that matters. `isPasswordRecovery` is only used to keep the copy honest for
  // someone who arrived here already signed in and is changing their password
  // deliberately rather than recovering it.
  const hasSession = isAuthenticated;

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => navigate("/", { replace: true }), 5000);
      return () => clearTimeout(timer);
    }
  }, [isDone, navigate]);

  const onSubmit = async (values: PasswordForm) => {
    setIsSubmitting(true);
    try {
      const result = await updatePassword(values.password);
      if (!result.success) {
        toast({
          title: "Could not update password",
          description: result.error || "Please request a new reset link and try again.",
          variant: "destructive",
        });
        return;
      }

      // Anyone who got in with the old password stays in until their token
      // expires unless the other sessions are ended here. 'others' rather than
      // 'global' so this browser stays signed in and the confirmation below is
      // not immediately followed by a bounce to the login page.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
      if (signOutError) {
        // Not fatal: the password IS changed, which is what the user asked for.
        log.warn("onSubmit", "could not end other sessions", { message: signOutError.message });
      }

      setIsDone(true);
      toast({
        title: "Password updated",
        description: "You are signed in, and other devices have been signed out.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail) {
      toast({
        title: "Email required",
        description: "Enter the address you used to sign up.",
        variant: "destructive",
      });
      return;
    }
    setIsResending(true);
    const result = await resetPassword(resendEmail);
    setIsResending(false);
    toast({
      title: result.success ? "Reset email sent" : "Could not send email",
      description: result.success
        ? "Check your inbox for a new link. It is valid for one hour."
        : result.error || "Please try again in a moment.",
      variant: result.success ? "default" : "destructive",
    });
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">{children}</Card>
      </div>
      <Footer />
    </div>
  );

  if (isDone) {
    return shell(
      <>
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl">Password updated</CardTitle>
          <CardDescription>
            You are signed in on this device. Every other device has been signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => navigate("/", { replace: true })}>
            Continue to Des Moines Insider
          </Button>
        </CardContent>
      </>
    );
  }

  // A dead link, or a visit with no recovery session at all. Both land here,
  // and both are fixed by the same thing: send another email.
  if (linkError || (!isLoading && !hasSession)) {
    const expired = linkError?.code === "otp_expired";
    return shell(
      <>
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-100 p-3">
              <AlertTriangle className="h-10 w-10 text-amber-600" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {expired ? "This link has expired" : "This reset link is no longer valid"}
          </CardTitle>
          <CardDescription>
            {linkError?.description ||
              "Reset links are valid for one hour and can be used once. Request another and we will send a fresh one."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="resend-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="resend-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
            />
          </div>
          <Button className="w-full" onClick={handleResend} disabled={isResending}>
            {isResending ? "Sending..." : "Send again"}
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link to="/auth">Back to sign in</Link>
          </Button>
        </CardContent>
      </>
    );
  }

  if (isLoading) {
    return shell(
      <CardContent className="py-12 text-center text-muted-foreground">
        Checking your reset link...
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
        <CardTitle className="text-2xl">
          {isPasswordRecovery ? "Set a new password" : "Change your password"}
        </CardTitle>
        <CardDescription>
          Choose something you have not used here before. Other devices will be
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
