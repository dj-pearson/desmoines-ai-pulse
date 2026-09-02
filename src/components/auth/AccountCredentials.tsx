import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("AccountCredentials");

/**
 * Change password and change email (WEB-AUTH-012).
 *
 * /profile edited first name, last name and phone. There was no way to change a
 * password or an email address anywhere in the app: `updateUser({ email })`
 * appeared nowhere, and AuthContext.updatePassword existed but nothing called
 * it. A user whose password leaked had one route -- sign out, then "forgot
 * password" -- and a user whose email changed had none at all.
 */
export function AccountCredentials() {
  const { user, updatePassword, updateEmail } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailPending, setEmailPending] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Re-enter the new password to confirm it.",
        variant: "destructive",
      });
      return;
    }

    setSavingPassword(true);
    try {
      // RE-AUTHENTICATE FIRST. updateUser({ password }) accepts any live
      // session, so without this an unlocked laptop, a borrowed phone or a
      // stolen token is enough to take the account over permanently -- the
      // attacker sets a password the owner does not know. Proving the current
      // password is what makes the session's holder and the account's owner the
      // same person.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (reauthError) {
        toast({
          title: "Current password is incorrect",
          description: "Enter your existing password to confirm this change.",
          variant: "destructive",
        });
        return;
      }

      // updatePassword also sends the password_changed security alert, so an
      // account holder learns about it even when the session doing it is not
      // theirs.
      const result = await updatePassword(newPassword);
      if (!result.success) {
        toast({
          title: "Could not change password",
          description: result.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

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

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast({
        title: "Password changed",
        description: revokeError
          ? "Your password is updated. Other devices may stay signed in until their sessions expire."
          : "Your password is updated and every other device has been signed out.",
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
      // Through AuthContext, not supabase directly, so the change goes down the
      // same path updatePassword uses and the current address gets a security
      // alert whether or not anyone ever clicks the link.
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Sign-in details
        </CardTitle>
        <CardDescription>
          Change the password and the email address you sign in with.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <h3 className="font-medium">Password</h3>

          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Changing your password signs out every other device.
          </p>

          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? "Changing..." : "Change password"}
          </Button>
        </form>

        <Separator />

        <form onSubmit={handleChangeEmail} className="space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" />
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
