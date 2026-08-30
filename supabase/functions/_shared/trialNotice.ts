/**
 * Trial-conversion notice (WEB-LEGAL-006).
 *
 * A free trial that auto-charges needs a notice saying what will be taken, when,
 * and how to stop it. What existed before was a retention email: "Keep your
 * Insider perks", with no amount, no date, and a "Manage your plan" link rather
 * than a cancel path. Worse, it was suppressed for anyone who had opted out of
 * marketing and could also be dropped by an LLM quality gate, so the people most
 * likely to be surprised by a charge were the ones least likely to be told.
 *
 * This module owns the wording so the two senders cannot drift:
 *   - stripe-webhook on customer.subscription.trial_will_end, which is
 *     authoritative because Stripe hands over the exact price and trial_end.
 *   - subscription-nurture's daily sweep, a safety net for when the webhook
 *     never arrives.
 *
 * A notice is transactional, not marketing: it is sent regardless of messaging
 * preference, carries no unsubscribe link (emailLayout category
 * "transactional"), and is never passed through a quality gate that could
 * silently drop it.
 */

export interface TrialNoticeInput {
  planName: string;
  /** Charge in dollars. Null when it could not be determined; see below. */
  amount: number | null;
  /** "month" | "year", or null when unknown. */
  interval: string | null;
  /** ISO timestamp of the first charge. */
  chargeAt: string;
  siteUrl: string;
}

export interface TrialNoticeContent {
  subject: string;
  html: string;
  text: string;
}

/** Central Time, matching how the rest of the product presents dates. */
export function formatChargeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Build the notice. When the amount is unknown the copy says so and sends the
 * reader to the page that shows it, rather than inventing or omitting a figure -
 * an amount stated wrongly is worse than an amount not stated.
 */
export function buildTrialNotice(input: TrialNoticeInput): TrialNoticeContent {
  const when = formatChargeDate(input.chargeAt);
  const manageUrl = `${input.siteUrl}/profile?tab=settings`;
  const per = input.interval === "year" ? "year" : input.interval === "month" ? "month" : null;

  const charge =
    input.amount !== null && per
      ? `${money(input.amount)} per ${per}`
      : input.amount !== null
        ? money(input.amount)
        : "the plan price shown on your subscription page";

  const headline = `Your ${input.planName} trial ends ${when}`;

  const text = [
    headline,
    "",
    `When the trial ends on ${when}, the card on file will be charged ${charge}, and will renew automatically each ${per ?? "billing period"} until you cancel.`,
    "",
    `To cancel and avoid the charge, open Account > Subscription and choose Cancel: ${manageUrl}`,
    "",
    "Cancelling takes one click and keeps your access until the end of the period you have already paid for. If you subscribed through the iOS app, cancel from Settings > Apple ID > Subscriptions instead.",
    "",
    "This is a billing notice about your subscription, not a marketing email.",
  ].join("\n");

  const html = `
    <h1 style="font-size:20px;margin:0 0 16px">${headline}</h1>
    <p style="margin:0 0 16px">
      When the trial ends on <strong>${when}</strong>, the card on file will be charged
      <strong>${charge}</strong>, and will renew automatically each ${per ?? "billing period"} until you cancel.
    </p>
    <p style="margin:0 0 16px">
      <a href="${manageUrl}" style="display:inline-block;padding:10px 16px;background:#1f2937;color:#fff;border-radius:6px;text-decoration:none">
        Cancel before you are charged
      </a>
    </p>
    <p style="margin:0 0 16px">
      Cancelling takes one click and keeps your access until the end of the period you
      have already paid for. If you subscribed through the iOS app, cancel from
      Settings &gt; Apple ID &gt; Subscriptions instead.
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px">
      This is a billing notice about your subscription, not a marketing email.
    </p>
  `.trim();

  return { subject: headline, html, text };
}

/** Dollar amount for a plan row, given the interval. Null when undeterminable. */
export function planAmount(
  plan: { price_monthly?: number | null; price_yearly?: number | null } | null,
  interval: string | null,
): number | null {
  if (!plan) return null;
  if (interval === "year") return plan.price_yearly ?? null;
  if (interval === "month") return plan.price_monthly ?? null;
  return null;
}
