import { useState } from "react";
import { CheckCircle2, CircleAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useMFAFactors } from "@/hooks/useMFA";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { formatInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email and password",
  google: "Google",
  apple: "Apple",
};

interface CheckRowProps {
  ok: boolean;
  label: string;
  detail: string;
  action?: React.ReactNode;
}

function CheckRow({ ok, label, detail, action }: CheckRowProps) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon
          className={cn("mt-0.5 h-5 w-5 shrink-0", ok ? "text-primary" : "text-destructive")}
          aria-hidden="true"
        />
        <div>
          <p className="font-medium">
            <span className="sr-only">{ok ? "Done: " : "Needs attention: "}</span>
            {label}
          </p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      {action && <div className="pl-8 sm:pl-0 sm:shrink-0">{action}</div>}
    </li>
  );
}

/** Scroll to a settings section by id, for the inline fixes. */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusable = el.querySelector<HTMLElement>("input, button");
    focusable?.focus({ preventScroll: true });
  }
}

/**
 * A security checkup built only from what the client already knows (account
 * plan bet 4, WP5 item 2).
 *
 * Every line is read from the signed-in user object or one listFactors() call,
 * so nothing here depends on a table production doesn't have. It replaces the
 * "Active sessions" panel, which read user_sessions and two RPCs that don't
 * exist and showed "Failed to Load Sessions" on every visit. A real device list
 * needs an edge function over auth.sessions (deferred D11); until then the
 * honest control is "Sign out of other devices", which GoTrue does for real.
 */
export function SecurityCheckup() {
  const { user, resendVerification } = useAuth();
  const { toast } = useToast();
  const { summary, isLoading: factorsLoading, isError: factorsError, refetch } = useMFAFactors();
  const [signingOut, setSigningOut] = useState(false);
  const [resending, setResending] = useState(false);

  if (!user) return null;

  const emailConfirmed = !!user.email_confirmed_at;
  const providers = Array.from(new Set((user.identities ?? []).map((i) => i.provider)));
  const hasPassword = providers.includes("email");
  const methodNames = providers.map((p) => PROVIDER_LABELS[p] ?? p);
  const verifiedCount = summary.verified.length;

  const signOutOthers = async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast({
        title: "Other devices signed out",
        description: "Every other browser and app now has to sign in again. This one stays signed in.",
      });
    } catch (error) {
      handleError(error, { component: "SecurityCheckup", action: "signOutOthers" });
      toast({
        title: "Couldn't sign out other devices",
        description: "Nothing changed. Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSigningOut(false);
    }
  };

  const resend = async () => {
    if (!user.email) return;
    setResending(true);
    try {
      const result = await resendVerification(user.email);
      toast(
        result.success
          ? { title: "Confirmation sent", description: `Check ${user.email}, including spam.` }
          : { title: "Couldn't send it", description: result.error ?? "Try again in a minute.", variant: "destructive" },
      );
    } finally {
      setResending(false);
    }
  };

  let twoStepDetail: string;
  let twoStepAction: React.ReactNode = null;
  if (factorsLoading) {
    twoStepDetail = "Checking...";
  } else if (factorsError) {
    twoStepDetail = "We couldn't check your authenticators.";
    twoStepAction = (
      <Button size="sm" variant="outline" onClick={() => void refetch()}>
        Try again
      </Button>
    );
  } else if (verifiedCount === 0) {
    twoStepDetail = "Off. Anyone with your password can sign in as you.";
    twoStepAction = (
      <Button size="sm" onClick={() => jumpTo("two-step")}>
        Turn it on
      </Button>
    );
  } else if (verifiedCount === 1) {
    twoStepDetail = "On, with one authenticator and no backup.";
    twoStepAction = (
      <Button size="sm" variant="outline" onClick={() => jumpTo("two-step")}>
        Add a backup
      </Button>
    );
  } else {
    twoStepDetail = `On, with ${verifiedCount} authenticators.`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security checkup</CardTitle>
        <CardDescription>What protects this account right now, and how to fix what doesn't.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="divide-y">
          <CheckRow
            ok={emailConfirmed}
            label={emailConfirmed ? "Email confirmed" : "Email not confirmed"}
            detail={
              emailConfirmed
                ? `${user.email} can receive password resets and security alerts.`
                : `Until you confirm ${user.email}, password resets and security alerts can't reach you.`
            }
            action={
              emailConfirmed ? undefined : (
                <Button size="sm" onClick={resend} disabled={resending}>
                  {resending ? "Sending..." : "Resend confirmation"}
                </Button>
              )
            }
          />
          <CheckRow
            ok={methodNames.length > 0}
            label="How you sign in"
            detail={methodNames.length > 0 ? methodNames.join(", ") : "No sign-in method on record."}
            action={
              hasPassword ? undefined : (
                <Button size="sm" variant="outline" onClick={() => jumpTo("password")}>
                  Set a password
                </Button>
              )
            }
          />
          <CheckRow
            ok={!factorsLoading && !factorsError && verifiedCount >= 2}
            label="Two-step sign-in"
            detail={twoStepDetail}
            action={twoStepAction}
          />
          <CheckRow
            ok
            label="Last signed in"
            detail={
              user.last_sign_in_at
                ? `${formatInCentralTime(user.last_sign_in_at, "EEE, MMM d 'at' h:mm a")} Central. Not you? Change your password and sign out other devices.`
                : "No sign-in on record."
            }
          />
        </ul>

        <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Left yourself signed in on a shared computer or a lost phone? End every session except this one.
          </p>
          <Button variant="outline" onClick={signOutOthers} disabled={signingOut} className="sm:shrink-0">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            {signingOut ? "Signing out..." : "Sign out of other devices"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
