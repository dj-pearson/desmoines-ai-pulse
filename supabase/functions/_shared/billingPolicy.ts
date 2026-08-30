/**
 * billingPolicy — the explicit self-service refund policy (AOS-CS-004 /
 * AOS-GOV-003). A refund auto-approves ONLY when it clearly falls inside the
 * auto-approve window: small amount, recent charge, and an allowed reason.
 * Anything else escalates to a tier-2 human approval (AOS-CORE-007). Keeping the
 * window explicit and narrow is what makes unattended financial actions safe.
 */

export const REFUND_AUTO_WINDOW_DAYS = 7; // charge must be this recent
export const REFUND_AUTO_MAX_USD = 30; // and no larger than this
export const ALLOWED_AUTO_REFUND_REASONS = new Set<string>([
  "duplicate_charge",
  "accidental_purchase",
  "service_unavailable",
]);

export interface RefundContext {
  amountUsd: number;
  chargeAgeDays: number;
  reason: string;
}

export interface RefundDecision {
  autoApprove: boolean;
  reason: string; // human-readable policy explanation
}

export function evaluateRefund(ctx: RefundContext): RefundDecision {
  if (!ALLOWED_AUTO_REFUND_REASONS.has(ctx.reason)) {
    return { autoApprove: false, reason: `reason "${ctx.reason}" is not in the auto-approve set` };
  }
  if (ctx.amountUsd > REFUND_AUTO_MAX_USD) {
    return { autoApprove: false, reason: `amount $${ctx.amountUsd} exceeds the $${REFUND_AUTO_MAX_USD} auto-approve cap` };
  }
  if (ctx.chargeAgeDays > REFUND_AUTO_WINDOW_DAYS) {
    return { autoApprove: false, reason: `charge is ${ctx.chargeAgeDays}d old, past the ${REFUND_AUTO_WINDOW_DAYS}d window` };
  }
  if (ctx.amountUsd <= 0) {
    return { autoApprove: false, reason: "non-positive amount" };
  }
  return { autoApprove: true, reason: `within policy (≤$${REFUND_AUTO_MAX_USD}, ≤${REFUND_AUTO_WINDOW_DAYS}d, allowed reason)` };
}
