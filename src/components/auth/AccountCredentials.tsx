import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { handleError } from "@/lib/errorHandler";
import { passwordSchema } from "@/lib/passwordStrength";

const log = createLogger("AccountCredentials");

const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  apple: "Apple",
};

type PasswordStep = "form" | "code";

/**
 * Change password and change email (WEB-AUTH-012, account plan WP5 item 1).
 *
 * PROOF OF IDENTITY IS AN EMAILED CODE, NOT signInWithPassword. The old form
 * re-signed-in with the current password, which swaps an aal2 session for a
 * fresh aal1 one: a two-step user was then marked signed out by AuthContext's
 * WEB-SEC-026 hold halfway through changing their password. reauthenticate()
 * emails a one-time code to the account address and
 * updateUser({ password, nonce }) spends it, so the session that asked is the
 * session that finishes, at the same assurance level, with no captcha and no
 * token request.
 *
 * The same path lets someone who signed up with Google or Apple set a password,
 * which the current-password field made impossible.
 */
export function AccountCredentials() {
  const { user, updateEmail } = useAuth();
  const { toast } = useToast();

  const hasPassword = !!user?.identities?.some((identity) => identity.provider === "email");
  const oauthProvider = user?.identities
    ?.map((identity) => PROVIDER_NAMES[identity.provider])
    .find(Boolean);

  const [step, setStep] = useState<PasswordStep>("form");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailPending, setEmailPending] = useState(false);

  const validateNewPassword = (): boolean => {
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The two passwords don't match.");
      return false;
    }
    setPasswordError(null);
    return true;
  };

  const sendCode = async () => {
    const { error } = await supabase.auth.reauthenticate();
    if (error) {
      handleError(error, { component: "AccountCredentials", action: "reauthenticate" });
      setPasswordError(
        error.status === 429
          ? "We sent a code a moment ago. Wait a minute, then try again."
          : "We couldn't send a code. Try again in a moment.",
      );
      return false;
    }
    return true;
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || !validateNewPassword()) return;

    setSavingPassword(true);
    try {
      if (await sendCode()) setStep("code");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResend = async () => {
    setSavingPassword(true);
    try {
      if (await sendCode()) {
        toast({ title: "New code sent", description: `Check ${user?.email}.` });
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateNewPassword()) return;
    const nonce = code.trim();
    if (!/^\d{6}$/.test(nonce)) {
      setPasswordError("Enter the six-digit code from the email.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, nonce });
      if (error) {
        const codeName = error.code;
        setPasswordError(
          codeName === "same_password"
            ? "That's the password you have now. Pick a different one."
            : codeName === "reauthentication_not_valid" || codeName === "reauth_nonce_missing"
              ? "That code didn't match or has expired. Send a new one."
              : codeName === "weak_password"
                ? "That password is on a list of leaked passwords. Pick another."
                : "We couldn't change your password. Try again in a moment.",
        );
        if (codeName !== "same_password" && codeName !== "weak_password") {
          handleError(error, { component: "AccountCredentials", action: "updatePassword" });
        }
        return;
      }

      // The account holder hears about it even when the session doing it is
      // not theirs. Fire-and-forget: the change has already happened.
      void supabase.functions
        .invoke("send-security-notification", {
          body: {
            event_type: "password_changed",
            context: {
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            },
          },
        })
        .catch((err) => log.warn("handleChangePassword", "security alert failed", { error: String(err) }));

      // SIGN OUT THE OTHER SESSIONS. Changing a password because it may be
      // compromised achieves nothing while the sessions opened with the old one
      // stay valid. `others` leaves this tab signed in, so the user is not
      // ejected from the screen they just used.
      const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });
      if (revokeError) {
        log.warn("handleChangePassword", "could not revoke other sessions", {
          message: revokeError.message,
        });
      }

      setStep("form");
      setNewPassword("");
      setConfirmPassword("");
      setCode("");
      setPasswordError(null);

      toast({
        title: hasPassword ? "Password changed" : "Password set",
        description: revokeError
          ? "Other devices may stay signed in until their sessions expire. Use Sign out of other devices above to end them now."
          : "Every other device has been signed out. This one stays signed in.",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = newEmail.trim().toLowerCase();

    if (!address || address === user?.email?.toLowerCase()) {
      toast({
        title: "Enter a different address",
        description: "That is already the address on this account.",
        variant: "destructive",
      });
      return;
    }

    setSavingEmail(true);
    try {
      // Through AuthContext, not supabase directly, so the current address gets
      // a security alert whether or not anyone ever clicks the link.
      const result = await updateEmail(address);

      if (!result.success) {
        toast({
          title: "Could not change email",
          description: result.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setEmailPending(true);
      setNewEmail("");
      toast({
        title: "Confirm from both inboxes",
        description:
          "We sent a link to your current address and to the new one. The change takes effect only after both are confirmed.",
        duration: 12000,
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const passwordHeading = hasPassword ? "Password" : "Set a password";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          Sign-in details
        </CardTitle>
        <CardDescription>The password and email address you sign in with.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <form
          id="password"
          onSubmit={step === "form" ? handleRequestCode : handleChangePassword}
          className="space-y-4 scroll-mt-24"
          noValidate
        >
          <div className="space-y-1">
            <h3 className="font-medium">{passwordHeading}</h3>
            {!hasPassword && (
              <p className="text-sm text-muted-foreground">
                You sign in with {oauthProvider ?? "a social account"}. Set a password to also sign in
                with {user?.email}.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={step === "code"}
                aria-invalid={!!passwordError}
                aria-describedby="new-password-rules"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Type it again</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={step === "code"}
                aria-invalid={!!passwordError}
                required
              />
            </div>
          </div>

          <PasswordStrengthMeter password={newPassword} showRequirements id="new-password-rules" />

          {step === "code" && (
            <div className="space-y-2">
              <Label htmlFor="reauth-code">Code from the email</Label>
              <Input
                id="reauth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-[12rem] font-mono tracking-widest"
                aria-invalid={!!passwordError}
                required
              />
              <p className="text-sm text-muted-foreground">
                We sent a six-digit code to {user?.email}. It proves the change is coming from you.
              </p>
            </div>
          )}

          {passwordError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {passwordError}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Changing your password signs out every other device. This one stays signed in.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={savingPassword}>
              {step === "form"
                ? savingPassword
                  ? "Sending code..."
                  : "Email me a code"
                : savingPassword
                  ? "Saving..."
                  : hasPassword
                    ? "Change password"
                    : "Set password"}
            </Button>
            {step === "code" && (
              <>
                <Button type="button" variant="outline" onClick={handleResend} disabled={savingPassword}>
                  Send a new code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep("form");
                    setCode("");
                    setPasswordError(null);
                  }}
                  disabled={savingPassword}
                >
                  Start over
                </Button>
              </>
            )}
          </div>
        </form>

        <Separator />

        <form onSubmit={handleChangeEmail} className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Email address
          </h3>

          <p className="text-sm text-muted-foreground">
            Currently <span className="font-medium text-foreground">{user?.email}</span>
          </p>

          <div className="space-y-2">
            <Label htmlFor="new-email">New email address</Label>
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </div>

          {/* Supabase's default is double confirmation: a link goes to BOTH
              addresses and the change lands only when both are clicked. Saying
              so up front matters, because a user who confirms one and stops
              will otherwise believe the change failed. */}
          <p className="text-sm text-muted-foreground">
            You will get a confirmation link at your current address and at the new one. The change
            takes effect after both are confirmed.
          </p>

          {emailPending && (
            <p className="text-sm font-medium">
              A change is pending. Check both inboxes, including spam.
            </p>
          )}

          <Button type="submit" disabled={savingEmail} variant="outline">
            {savingEmail ? "Sending..." : "Send confirmation links"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
