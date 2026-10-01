import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmailSentPanelProps {
  email: string;
  onResend: () => Promise<void>;
  isResending: boolean;
  onSignIn: () => void;
  onForgotPassword: () => void;
}

/**
 * The one screen after sign-up, for a new address and a registered one alike
 * (account plan WP1 item 8). Supabase answers both the same way on purpose so
 * the form can't be used to find out who has an account, and this screen keeps
 * that: same heading, same buttons, same copy. For a registered address the
 * Resend button does nothing on the server (Auth.tsx skips the call), and it
 * still says the same thing it says for everyone else.
 */
export function EmailSentPanel({
  email,
  onResend,
  isResending,
  onSignIn,
  onForgotPassword,
}: EmailSentPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <MailCheck className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground break-all">{email}</span>.
          Open it to finish setting up your account.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        It can take a minute to arrive. If it isn't in your inbox, look in spam or promotions.
        Already have an account with this address? Sign in, or reset your password.
      </p>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isResending}
          onClick={() => void onResend()}
        >
          {isResending ? "Sending..." : "Resend the email"}
        </Button>
        <Button type="button" className="w-full" onClick={onSignIn}>
          Sign in
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onForgotPassword}>
          Forgot password?
        </Button>
      </div>
    </div>
  );
}
