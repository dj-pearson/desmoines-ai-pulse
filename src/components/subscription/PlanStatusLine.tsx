import { format, isValid, parseISO } from "date-fns";
import { AlertCircle, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One sentence that says what happens next to a subscription
 * (docs/page-plans/pricing.md, WP3 item 6).
 *
 * Every amount comes from Stripe (manage-subscription's `upcomingInvoice`),
 * never from `subscription_plans.price_*`: the plan row is what the page
 * advertises, the upcoming invoice is what the member will actually be charged
 * (CLAUDE.md "Money is decided on the server"). When there is no amount (a
 * store-billed row, or Stripe had no upcoming invoice) the sentence names the
 * date alone rather than guessing a figure.
 *
 * Dates come from the row's period or trial end. `upcomingInvoice.dueDate` is
 * not used: Stripe leaves it null for automatically charged subscriptions,
 * which is every subscription this site sells.
 */

export interface NextChargeAmount {
  amount: number;
  currency: string;
}

export interface PlanStatusInput {
  /** The row's status: active, trialing, past_due (anything else says nothing). */
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  /** Stripe's next charge. Null or absent for store rows. */
  nextAmount?: NextChargeAmount | null;
}

export interface PlanStatusLineProps extends PlanStatusInput {
  /** Opens where the payment method is changed; shown only for past_due. */
  onManagePayment?: () => void;
  managePaymentPending?: boolean;
  className?: string;
}

/** Parses an ISO timestamp or a date-only value; null when it isn't a date. */
export function parseBillingDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

/** "October 25, 2026", or null for a missing or malformed value. */
export function formatBillingDate(value: string | null | undefined): string | null {
  const parsed = parseBillingDate(value);
  return parsed ? format(parsed, "MMMM d, yyyy") : null;
}

/** "$4.99" from an amount in major units and a Stripe currency code. */
export function formatChargeAmount(charge: NextChargeAmount | null | undefined): string | null {
  if (!charge || typeof charge.amount !== "number" || !Number.isFinite(charge.amount)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (charge.currency || "usd").toUpperCase(),
    }).format(charge.amount);
  } catch {
    return null;
  }
}

/**
 * The sentence for every state except past_due, which is an alert rather than
 * a sentence. Null when the row doesn't carry what the sentence needs.
 */
export function planStatusSentence(input: PlanStatusInput): string | null {
  const { status, cancelAtPeriodEnd, currentPeriodEnd, trialEnd, nextAmount } = input;
  const amount = formatChargeAmount(nextAmount);
  // A Stripe trial's period ends when the trial does, so the period end is
  // the right fallback for a row written before trial_end was stored.
  const trialDate = formatBillingDate(trialEnd) ?? formatBillingDate(currentPeriodEnd);
  const periodDate = formatBillingDate(currentPeriodEnd);

  if (cancelAtPeriodEnd) {
    const endDate = status === "trialing" ? trialDate : periodDate;
    return endDate
      ? `Ends ${endDate}. You won't be charged again.`
      : "Your plan is set to end. You won't be charged again.";
  }

  if (status === "trialing") {
    if (!trialDate) return null;
    return amount ? `Trial ends ${trialDate}, then ${amount}.` : `Trial ends ${trialDate}.`;
  }

  if (status === "active") {
    if (!periodDate) return null;
    return amount ? `Renews ${periodDate} for ${amount}.` : `Renews ${periodDate}.`;
  }

  return null;
}

export function PlanStatusLine({
  onManagePayment,
  managePaymentPending = false,
  className,
  ...input
}: PlanStatusLineProps) {
  if (input.status === "past_due") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Your last payment didn't go through. Update your payment method to
            keep your plan.
          </p>
          {onManagePayment && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={onManagePayment}
              disabled={managePaymentPending}
            >
              <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
              {managePaymentPending ? "Opening..." : "Manage payment method"}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  const sentence = planStatusSentence(input);
  if (!sentence) return null;

  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {sentence}
    </p>
  );
}
