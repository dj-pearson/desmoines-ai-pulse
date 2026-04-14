/**
 * Newsletter Unsubscribe Page — CAN-SPAM §5(a)(5) one-click unsubscribe.
 *
 * Reached from a signed link in every commercial email we send
 * (https://site/unsubscribe?token=...). No sign-in is required and the user
 * never has to see their email address re-confirmed on screen. We call the
 * `newsletter_unsubscribe_by_token` SECURITY DEFINER RPC which validates the
 * token format, updates the newsletter subscriber row, and returns a simple
 * success / already-unsubscribed boolean.
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
import { logConsent } from "@/lib/consentLog";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  MailX,
} from "lucide-react";

type Status = "loading" | "success" | "already" | "invalid" | "error";

export default function Unsubscribe() {
  useDocumentTitle("Unsubscribe");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
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
          setStatus("error");
          setErrorMessage(error.message);
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
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Unknown error"
        );
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
                  Something went wrong while processing your request
                  {errorMessage ? ` (${errorMessage})` : ""}. Please try again
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

            <div className="pt-2 text-center text-sm text-muted-foreground">
              Want to manage individual categories (receipts, security, product
              updates) instead?{" "}
              <Link to="/profile?tab=settings" className="underline">
                Open your notification settings
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
