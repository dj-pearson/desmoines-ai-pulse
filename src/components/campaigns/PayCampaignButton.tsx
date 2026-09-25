import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import { formatUSD } from "@/lib/campaignDisplay";
import { readCheckoutFailure, type CheckoutFailure } from "@/lib/campaignCheckout";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

export interface PayCampaignButtonProps {
  campaignId: string;
  /** The stored, server-computed campaigns.total_cost. Printed, never recomputed. */
  totalCost: number | null | undefined;
  /** Called when checkout says the campaign isn't payable any more, to re-read it. */
  onStale?: () => void;
  className?: string;
}

/**
 * "Pay $66.50" for a draft or pending_payment campaign. The amount on the
 * button is what the server stored; create-campaign-checkout reprices on the
 * server and refuses (409) to charge anything else, which is shown here as
 * the new total rather than as a generic failure.
 */
export function PayCampaignButton({ campaignId, totalCost, onStale, className }: PayCampaignButtonProps) {
  const { createCheckoutSession } = useCampaigns({ enabled: false });
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState<CheckoutFailure | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const pay = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFailure(null);
    try {
      const url: unknown = await createCheckoutSession(campaignId);
      if (typeof url !== "string" || !/^https:\/\//.test(url)) {
        throw new Error("Checkout didn't return a payment page. Try again in a minute.");
      }
      window.location.href = url;
      // Leave the button disabled: the page is navigating away.
      return;
    } catch (err) {
      const read = await readCheckoutFailure(err);
      setFailure(read);
      if (read.kind === "not_payable") onStale?.();
      if (read.kind === "error") {
        handleError(err, { component: "PayCampaignButton", action: "checkout" }, ErrorSeverity.WARNING);
      }
    }
    inFlight.current = false;
    setSubmitting(false);
  };

  const resendVerification = async () => {
    if (!user?.email) return;
    setResendState("sending");
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    if (error) {
      handleError(error, { component: "PayCampaignButton", action: "resend-verification" }, ErrorSeverity.WARNING);
      setResendState("failed");
      return;
    }
    setResendState("sent");
  };

  const hasAmount = typeof totalCost === "number" && Number.isFinite(totalCost) && totalCost > 0;

  return (
    <div className={className}>
      <Button
        type="button"
        onClick={() => void pay()}
        disabled={submitting}
        aria-busy={submitting}
        className="min-h-11"
      >
        {submitting ? "Opening checkout..." : hasAmount ? `Pay ${formatUSD(totalCost)}` : "Pay for this campaign"}
      </Button>

      <div aria-live="polite" className="mt-3 max-w-prose text-sm">
        {failure?.kind === "verify_email" && (
          <div className="space-y-2">
            <p>
              Confirm your email address before paying. The link is in the email we sent when you
              signed up{user?.email ? ` to ${user.email}` : ""}.
            </p>
            {resendState === "sent" ? (
              <p className="text-muted-foreground">A new link is on its way. Come back here once you've clicked it.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void resendVerification()}
                disabled={resendState === "sending" || !user?.email}
              >
                {resendState === "sending" ? "Sending..." : "Send the link again"}
              </Button>
            )}
            {resendState === "failed" && (
              <p className="text-destructive">That didn't send. Try again in a minute.</p>
            )}
          </div>
        )}

        {failure?.kind === "price_changed" && (
          <div className="space-y-2">
            <p>
              The price for these dates is now <strong>{formatUSD(failure.currentTotal)}</strong>, not{" "}
              {formatUSD(totalCost)}. The rate card changed after this campaign was saved, and checkout
              won't charge an amount you haven't seen.
            </p>
            <p className="text-muted-foreground">
              <Link to="/advertise" className="underline underline-offset-4">
                Start a new campaign at {formatUSD(failure.currentTotal)}
              </Link>{" "}
              or email{" "}
              <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
                {BUSINESS_CONTACT_EMAIL}
              </a>{" "}
              and we'll update this one.
            </p>
          </div>
        )}

        {failure?.kind === "not_payable" && (
          <p>This campaign can't be paid for in its current state. The page has been refreshed to show where it stands.</p>
        )}

        {failure?.kind === "error" && <p className="text-destructive">{failure.message}</p>}
      </div>
    </div>
  );
}
