import { forwardRef, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/components/ui/form";
import { SecurityUtils } from "@/lib/securityUtils";

/**
 * The email check is SecurityUtils.validateEmail, the same one the handler
 * runs, and it runs here BEFORE anything counts an attempt. A malformed
 * address used to reach the limiter first and come back titled "Too Many
 * Attempts" (account plan WP1 item 2).
 */
export const EMAIL_FORMAT_MESSAGE = "Check your email address. It should look like name@example.com.";

const emailField = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .refine((value) => SecurityUtils.validateEmail(value).isValid, EMAIL_FORMAT_MESSAGE);

const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
});

export type SignInValues = z.infer<typeof signInSchema>;

/**
 * A failed sign-in, as the form shows it. It used to be a toast that was gone
 * in five seconds, before most people had finished reading it; now it sits
 * above the button until they edit a field, the way sign-up's server errors
 * do. `credentials` is the one kind that marks both fields invalid: the copy
 * never says which of the two was wrong, so neither does the markup.
 */
export interface SignInError {
  kind: "credentials" | "rate_limited" | "other";
  title: string;
  message: string;
}

interface SignInFormProps {
  defaultEmail?: string;
  /** Resolves with an error to show inline, or nothing on success / MFA. */
  onSubmit: (values: SignInValues) => Promise<SignInError | void>;
  /** Receives whatever is in the email field, so the reset form starts filled. */
  onForgotPassword: (email: string) => void;
  /**
   * Seconds left on the server's lockout (check-login-attempt). While above
   * zero the button is disabled and counts down; at zero it re-enables on its
   * own, no reload needed (WP1 item 3).
   */
  lockoutSecondsLeft: number;
  /** Set when the only problem is an unconfirmed address. */
  unconfirmedEmail: string | null;
  onResendConfirmation: (email: string) => Promise<void>;
  isResending: boolean;
}

/**
 * FormControl that also points at the sign-in error. FormControl sets its own
 * aria-describedby and aria-invalid, and a prop passed to it replaces them, so
 * the zod message id has to be read here and joined rather than overwritten.
 */
const CredentialsControl = forwardRef<
  ElementRef<typeof FormControl>,
  ComponentPropsWithoutRef<typeof FormControl> & { credentialsErrorId: string | null }
>(({ credentialsErrorId, ...props }, ref) => {
  const { error, formDescriptionId, formMessageId } = useFormField();
  if (!credentialsErrorId) return <FormControl ref={ref} {...props} />;
  const describedBy = [formDescriptionId, error ? formMessageId : null, credentialsErrorId]
    .filter(Boolean)
    .join(" ");
  return <FormControl ref={ref} aria-describedby={describedBy} aria-invalid {...props} />;
});
CredentialsControl.displayName = "CredentialsControl";

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SignInForm({
  defaultEmail = "",
  onSubmit,
  onForgotPassword,
  lockoutSecondsLeft,
  unconfirmedEmail,
  onResendConfirmation,
  isResending,
}: SignInFormProps) {
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: defaultEmail, password: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const isSubmitting = form.formState.isSubmitting;
  const lockedOut = lockoutSecondsLeft > 0;

  const [serverError, setServerError] = useState<SignInError | null>(null);
  const errorId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);
  const credentialsErrorId = serverError?.kind === "credentials" ? errorId : null;

  // Editing either field means they are acting on the message, so it goes.
  // watch() only fires on changes, not on a resubmit of the same values.
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name === "email" || name === "password") setServerError(null);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    const error = await onSubmit(values);
    if (!error) return;
    setServerError(error);
    if (error.kind !== "credentials") return;
    // Wrong password: put them back in the password field to retype it. Only
    // when focus is on the button or nowhere; someone who has already gone
    // back to the email field while the request ran keeps their place.
    const active = document.activeElement;
    if (!active || active === document.body || active === submitRef.current) {
      form.setFocus("password", { shouldSelect: true });
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <CredentialsControl credentialsErrorId={credentialsErrorId}>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                  {...field}
                />
              </CredentialsControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <button
                  type="button"
                  onClick={() => onForgotPassword(form.getValues("email").trim())}
                  className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Forgot password?
                </button>
              </div>
              <CredentialsControl credentialsErrorId={credentialsErrorId}>
                <PasswordInput
                  autoComplete="current-password"
                  aria-required="true"
                  {...field}
                />
              </CredentialsControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Always mounted, so screen readers have a live region before the
            first failure lands in it. */}
        <div id={errorId} role="alert" aria-atomic="true">
          {serverError && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">
              <p className="font-medium">{serverError.title}</p>
              <p>{serverError.message}</p>
            </div>
          )}
        </div>

        <Button ref={submitRef} type="submit" className="w-full" disabled={isSubmitting || lockedOut}>
          {lockedOut
            ? `Try again in ${formatCountdown(lockoutSecondsLeft)}`
            : isSubmitting
              ? "Signing in..."
              : "Sign in"}
        </Button>

        {lockedOut && (
          <p className="text-sm text-muted-foreground" role="status">
            Too many tries for this address. The button comes back when the wait is over.
          </p>
        )}

        {/* WEB-AUTH-008. A sign-in that fails only because the address was
            never confirmed is the one failure this screen can fix, so the
            resend sits inline where it outlives the toast. */}
        {unconfirmedEmail && (
          <div className="rounded-xl border bg-muted p-3 text-sm text-foreground" role="status">
            <p className="mb-2">
              This address hasn't been confirmed yet. The link is in your inbox, or in spam.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isResending}
              onClick={() => void onResendConfirmation(unconfirmedEmail)}
            >
              {isResending ? "Sending..." : "Send a new link"}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
