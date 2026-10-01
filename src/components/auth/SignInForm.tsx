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

interface SignInFormProps {
  defaultEmail?: string;
  onSubmit: (values: SignInValues) => Promise<void>;
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
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
              <FormControl>
                <PasswordInput
                  autoComplete="current-password"
                  aria-required="true"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting || lockedOut}>
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
