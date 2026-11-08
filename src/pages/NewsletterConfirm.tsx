/**
 * Newsletter confirmation page (WEB-FEAT-019).
 *
 * The landing point for the link in the confirmation email. Calls the
 * `newsletter_confirm_by_token` SECURITY DEFINER RPC, which flips the row from
 * 'pending' to 'active', spends the token and appends the consent record — the
 * click here IS the affirmative consent GDPR Art. 7 asks us to be able to
 * demonstrate, which the signup form on its own never was.
 *
 * No sign-in, and the address is never shown back: the token is the only thing
 * that identifies the row, exactly as on the unsubscribe page.
 *
 * The already-confirmed case is deliberately NOT an error. A link that has been
 * clicked twice — or prefetched by a mail client and then clicked — would
 * otherwise tell someone their subscription had failed when it had worked.
 *
 * WEB-ADS-031: the page used to end at "Back to home" in every
 * state. A reader who just confirmed is the most engaged visitor the site gets
 * all week, so success and already-confirmed point at something to read now
 * and, when signed out, at a free account. An invalid link told the reader to
 * "sign up again from any page" without a form on this one; it now has one.
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
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { useAuthFlags } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";

type Status = "loading" | "success" | "already" | "invalid" | "error";

/** Where a confirmed reader can go next. Every target is a routed page. */
const NEXT_STEPS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/events/this-weekend", label: "What's on this weekend" },
  { to: "/events/today", label: "Events today" },
  { to: "/restaurants/open-now", label: "Restaurants open now" },
];

interface ConfirmedNextStepsProps {
  isAuthenticated: boolean;
}

function ConfirmedNextSteps({ isAuthenticated }: ConfirmedNextStepsProps) {
  return (
    <nav aria-labelledby="confirm-next-heading" className="space-y-3">
      <h2 id="confirm-next-heading" className="text-sm font-semibold">
        Don&apos;t want to wait for the email?
      </h2>
      <ul className="flex flex-col gap-2">
        {NEXT_STEPS.map((step) => (
          <li key={step.to}>
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link to={step.to}>{step.label}</Link>
            </Button>
          </li>
        ))}
      </ul>
      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground">
          Save events, restaurants and places to your account.{" "}
          <Link to="/auth?mode=signup" className="font-medium text-foreground underline underline-offset-4">
            Create a free account
          </Link>
        </p>
      )}
    </nav>
  );
}

export default function NewsletterConfirm() {
  const { isAuthenticated } = useAuthFlags();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus("invalid");
        return;
      }
      try {
        const { data, error } = await supabase.rpc("newsletter_confirm_by_token", {
          p_token: token,
        });

        if (cancelled) return;
        if (error) {
          // WEB-ADS-024: the reader gets fixed copy; the PostgREST text goes to
          // ops through handleError, never onto the page.
          handleError(error, { component: "NewsletterConfirm", action: "confirmByToken" });
          setStatus("error");
          return;
        }

        // The RPC returns a table, so supabase-js hands back an array of rows.
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.success) {
          setStatus("invalid");
          return;
        }
        // The consent record is written by the RPC, inside the same transaction
        // as the status change. Logging it again from here would double-count
        // the one event the audit trail exists to count once.
        setStatus(row.already_confirmed ? "already" : "success");
      } catch (err) {
        if (cancelled) return;
        handleError(err, { component: "NewsletterConfirm", action: "confirmByToken" });
        setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      <Helmet>
        <title>Confirm your subscription | Des Moines Insider</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MailCheck className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <CardTitle>Newsletter subscription</CardTitle>
            <CardDescription>
              One click to confirm the address is yours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "loading" && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>Confirming your subscription…</AlertDescription>
              </Alert>
            )}

            {status === "success" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  You&apos;re confirmed. The next Des Moines digest will come
                  straight to your inbox, and every one of them carries a
                  one-click unsubscribe link.
                </AlertDescription>
              </Alert>
            )}

            {status === "already" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  This address is already confirmed. Nothing else to do.
                </AlertDescription>
              </Alert>
            )}

            {status === "invalid" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This confirmation link is no longer valid — it may already
                  have been used, or replaced by a newer one. Enter your email
                  below and we&apos;ll send a fresh link.
                </AlertDescription>
              </Alert>
            )}

            {status === "invalid" && (
              <section aria-labelledby="confirm-fresh-link-heading" className="space-y-2">
                <h2 id="confirm-fresh-link-heading" className="text-sm font-semibold">
                  Get a new confirmation link
                </h2>
                <NewsletterSignup variant="compact" source="website" />
              </section>
            )}

            {(status === "success" || status === "already") && (
              <ConfirmedNextSteps isAuthenticated={isAuthenticated} />
            )}

            {status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Something went wrong while confirming your subscription. Please try the
                  link again in a moment, or email{" "}
                  <a href="mailto:hello@desmoinesinsider.com" className="underline">
                    hello@desmoinesinsider.com
                  </a>
                  .
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center">
              <Button asChild variant={status === "success" || status === "already" ? "ghost" : "outline"}>
                <Link to="/">Back to home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
