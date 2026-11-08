/**
 * Newsletter Unsubscribe Page — CAN-SPAM §5(a)(5) one-click unsubscribe.
 *
 * Reached from a signed link in every commercial email we send
 * (https://site/unsubscribe?token=...). No sign-in is required and the user
 * never has to see their email address re-confirmed on screen. We call the
 * `newsletter_unsubscribe_by_token` SECURITY DEFINER RPC which validates the
 * token format, updates the newsletter subscriber row, and returns a simple
 * success / already-unsubscribed boolean.
 *
 * An event-reminder email links here with ?reminder=<id> instead (WEB-FEAT-059).
 * That stops the remaining reminders for that one event and leaves the
 * newsletter alone; see src/lib/reminderOptOut.ts.
 */

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { logConsent } from "@/lib/consentLog";
import { cancelRemindersByToken } from "@/lib/reminderOptOut";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  MailX,
} from "lucide-react";

type Status = "loading" | "success" | "already" | "reminders" | "invalid" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reminderToken = params.get("reminder");
  const [status, setStatus] = useState<Status>("loading");
  const [reminderEvent, setReminderEvent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runReminder(id: string) {
      const result = await cancelRemindersByToken(id);
      if (cancelled) return;
      if (result.kind === "error") {
        handleError(result.error, { component: "Unsubscribe", action: "cancelRemindersByToken" });
        setStatus("error");
        return;
      }
      if (result.kind === "invalid") {
        setStatus("invalid");
        return;
      }
      setReminderEvent(result.eventTitle);
      setStatus("reminders");
    }

    async function run() {
      if (reminderToken !== null) {
        await runReminder(reminderToken);
        return;
      }
      if (!token) {
        setStatus("invalid");
        return;
      }
      try {
        const { data, error } = await supabase.rpc(
          "newsletter_unsubscribe_by_token",
          { p_token: token }
        );

        if (cancelled) return;
        if (error) {
          // WEB-ADS-024: the reader gets fixed copy; the PostgREST text goes to
          // ops through handleError, never onto the page.
          handleError(error, { component: "Unsubscribe", action: "unsubscribeByToken" });
          setStatus("error");
          return;
        }

        // RPC returns a table; supabase-js gives us an array of rows.
        const row = Array.isArray(data) ? data[0] : data;
        const success = !!row?.success;
        const alreadyUnsubscribed = !!row?.already_unsubscribed;

        if (!success) {
          setStatus("invalid");
          return;
        }

        if (alreadyUnsubscribed) {
          setStatus("already");
        } else {
          setStatus("success");
          void logConsent({
            type: "newsletter",
            granted: false,
            source: "unsubscribe_page",
            metadata: { via: "one_click_link" },
          });
        }
      } catch (err) {
        if (cancelled) return;
        handleError(err, { component: "Unsubscribe", action: "unsubscribeByToken" });
        setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, reminderToken]);

  return (
    <>
      <Helmet>
        <title>Unsubscribe | Des Moines Insider</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MailX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle>Email preferences</CardTitle>
            <CardDescription>
              One-click unsubscribe, as required by CAN-SPAM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "loading" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Processing your unsubscribe request…
                </AlertDescription>
              </Alert>
            )}

            {status === "success" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  You&apos;ve been unsubscribed. You won&apos;t receive any more
                  marketing emails from Des Moines Insider. Transactional emails
                  (like receipts and security alerts) may still be sent to keep
                  your account safe.
                </AlertDescription>
              </Alert>
            )}

            {status === "reminders" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  {reminderEvent
                    ? `Reminders for ${reminderEvent} are off.`
                    : "Reminders for this event are off."}{" "}
                  Your other reminders and any newsletter you get are unchanged.{" "}
                  <Link to="/my-events?tab=reminders" className="underline">
                    See your reminders
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            )}

            {status === "already" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  You were already unsubscribed. No further action is needed.
                </AlertDescription>
              </Alert>
            )}

            {status === "invalid" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This unsubscribe link is invalid or has expired. Please use
                  the link from your most recent email, or email{" "}
                  <a
                    href="mailto:unsubscribe@desmoinesinsider.com"
                    className="underline"
                  >
                    unsubscribe@desmoinesinsider.com
                  </a>{" "}
                  and we&apos;ll remove you manually.
                </AlertDescription>
              </Alert>
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Something went wrong while processing your request. Please try again
                  in a moment, or email{" "}
                  <a
                    href="mailto:unsubscribe@desmoinesinsider.com"
                    className="underline"
                  >
                    unsubscribe@desmoinesinsider.com
                  </a>
                  .
                </AlertDescription>
              </Alert>
            )}

            {/* WP5 item 6. This offered "receipts, security, product updates"
                categories that don't exist. The settings page has three real
                switches: the weekly digest, account and activity emails, and
                saved-search alerts. Security emails have no switch. */}
            <div className="pt-2 text-center text-sm text-muted-foreground">
              Have an account? The weekly digest and account emails have their
              own switches.{" "}
              <Link to="/profile?tab=settings#emails" className="underline">
                Open your email settings
              </Link>
              .
            </div>

            <div className="flex justify-center">
              <Button asChild variant="outline">
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
