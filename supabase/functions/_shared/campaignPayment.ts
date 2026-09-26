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
