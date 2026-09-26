/**
 * What a campaign payment is allowed to change, and what a refund may return,
 * as pure functions (NON_CORE_REVIEW WP3 items 1, 2 and 4; WP6 item 3).
 *
 * stripe-webhook, verify-campaign-payment and process-stripe-refund import
 * Stripe and supabase-js from esm.sh, so nothing in them can be reached by a
 * test. The decisions below are the part that goes wrong quietly:
 *
 *   - A late or replayed checkout.session.completed moved an ACTIVE campaign
 *     back to pending_creative, because the update matched on session id
 *     alone. Only draft and pending_payment may advance.
 *   - An async payment method completes the session with payment_status
 *     'unpaid'. That is not money, and must not start a campaign.
 *   - A refund was capped at campaigns.total_cost, the list price, ignoring a
 *     promotion code and every refund already made; and any refund, however
 *     small, marked the campaign refunded, which ends it.
 *
 * Structural types only, no remote import: this loads in an offline test.
 */

/** The statuses a paid checkout may move a campaign out of. */
export const PAYABLE_CAMPAIGN_STATUSES = ["draft", "pending_payment"] as const;

/** Where a paid campaign goes next. */
export const PAID_CAMPAIGN_STATUS = "pending_creative";

/** The part of a Stripe Checkout Session these functions read. */
export interface CheckoutSessionLike {
  id: string;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  total_details?: {
    amount_discount?: number | null;
    breakdown?: {
      discounts?: Array<{
        amount?: number | null;
        discount?: {
          promotion_code?: string | { id?: string | null; code?: string | null } | null;
        } | null;
      }> | null;
    } | null;
  } | null;
  /** Present on newer API versions; read as a fallback. */
  discounts?: Array<{
    promotion_code?: string | { id?: string | null; code?: string | null } | null;
  }> | null;
}

export type CampaignPaymentDecision =
  | { advance: true }
  | { advance: false; reason: "not_paid" | "no_campaign" };

/**
 * Whether a completed checkout may advance its campaign at all.
 *
 * The status half of the rule (draft/pending_payment only) is enforced in the
 * UPDATE's WHERE clause, not here, because only the database can make it
 * atomic. This is the half the database cannot see: whether Stripe says the
 * money arrived.
 */
export function campaignPaymentDecision(
  session: Pick<CheckoutSessionLike, "payment_status">,
  campaignId: string | null | undefined,
): CampaignPaymentDecision {
  if (!campaignId) return { advance: false, reason: "no_campaign" };
  if (session.payment_status !== "paid") return { advance: false, reason: "not_paid" };
  return { advance: true };
}

/**
 * What a matched UPDATE means for the side effects that follow it.
 *
 * Zero rows is the replay or the late delivery: the campaign already moved on
 * (paid, active, cancelled, refunded), so the "Payment Confirmed" email and
 * the admin notice must not be sent a second time.
 */
export function shouldAnnouncePayment(matchedRows: number): boolean {
  return matchedRows > 0;
}

/** The columns the webhook writes to record what was actually charged. */
export interface PaymentRecord {
  amount_paid_cents: number | null;
  amount_discount_cents: number | null;
  promotion_code: string | null;
}

function codeOf(
  value: string | { id?: string | null; code?: string | null } | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.code ?? value.id ?? null;
}

/**
 * The promotion code a session used: the customer-facing code when the
 * session was retrieved with the promotion code expanded, its id otherwise.
 */
export function promotionCodeOf(session: CheckoutSessionLike): string | null {
  for (const d of session.total_details?.breakdown?.discounts ?? []) {
    const code = codeOf(d?.discount?.promotion_code);
    if (code) return code;
  }
  for (const d of session.discounts ?? []) {
    const code = codeOf(d?.promotion_code);
    if (code) return code;
  }
  return null;
}

/** Cents, as Stripe reports them. Null when Stripe did not say. */
function cents(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

export function paymentRecordFromSession(session: CheckoutSessionLike): PaymentRecord {
  return {
    amount_paid_cents: cents(session.amount_total),
    amount_discount_cents: cents(session.total_details?.amount_discount),
    promotion_code: promotionCodeOf(session),
  };
}

// --- Refunds ---

export interface RefundInput {
  /** What the customer was charged, in cents, from Stripe. */
  paidCents: number;
  /** What has been refunded already, in cents, from Stripe. */
  refundedCents: number;
  /** The admin's requested amount in dollars; null or undefined means "the rest". */
  requestedDollars?: number | null;
}

export type RefundDecision =
  | { ok: true; amountCents: number; full: boolean; remainingAfterCents: number }
  | { ok: false; error: string; maxCents: number };

/**
 * How much may be refunded, and whether the refund ends the campaign.
 *
 * The cap is what Stripe says was charged minus what Stripe says was already
 * returned. A promotion code lowers the first; an earlier partial refund
 * raises the second. Only a refund that brings the balance to zero is "full",
 * and only a full refund may mark the campaign refunded: a goodwill partial
 * refund on a running campaign must not take its ads down.
 */
export function refundDecision(input: RefundInput): RefundDecision {
  const paid = Math.max(0, Math.round(input.paidCents));
  const refunded = Math.max(0, Math.round(input.refundedCents));
  const max = Math.max(0, paid - refunded);

  if (max === 0) {
    return { ok: false, error: "Nothing left to refund on this payment.", maxCents: 0 };
  }

  const requested = input.requestedDollars;
  const amountCents =
    requested === null || requested === undefined ? max : Math.round(Number(requested) * 100);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Refund amount must be more than zero.", maxCents: max };
  }
  if (amountCents > max) {
    return {
      ok: false,
      error: `Refund amount is more than what is left. Maximum refundable: $${(max / 100).toFixed(2)}`,
      maxCents: max,
    };
  }

  const remainingAfterCents = max - amountCents;
  return { ok: true, amountCents, full: remainingAfterCents === 0, remainingAfterCents };
}

/** What the advertiser is told. A partial refund says the campaign keeps running. */
export function refundNoticeText(args: {
  campaignName: string;
  amount: number;
  full: boolean;
}): { title: string; message: string } {
  const name = args.campaignName || "your campaign";
  const amount = `$${args.amount.toFixed(2)}`;
  if (args.full) {
    return {
      title: `Refund issued: ${name}`,
      message:
        `We've refunded ${amount} for "${name}", the full amount paid. The campaign has ended. ` +
        `Refunds usually reach your card in 5 to 10 business days.`,
    };
  }
  return {
    title: `Partial refund issued: ${name}`,
    message:
      `We've refunded ${amount} of what you paid for "${name}". The campaign keeps running as scheduled. ` +
      `Refunds usually reach your card in 5 to 10 business days.`,
  };
}
