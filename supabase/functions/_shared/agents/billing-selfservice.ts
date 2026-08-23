/**
 * agent billing-selfservice (AOS-CS-004) — tier-1 billing self-service within
 * explicit policy:
 *   - plan_info / resend_receipt   → read-only, tier-1, audited.
 *   - cancel_subscription          → cancel_at_period_end (reversible; entitlement
 *                                    lasts the paid period, no schema change), audited.
 *   - refund                       → evaluateRefund (AOS-GOV-003 window). In-policy
 *                                    refunds run via Stripe immediately (auto-approve
 *                                    window); out-of-policy queue a tier-2 approval
 *                                    (AOS-CORE-007). Always audited.
 *
 * Consolidated into `agent-runner` (was `agent-billing-selfservice/index.ts`).
 * Manual-trigger params (intent/userId/…) come from `env.body` — the dispatcher
 * already consumed the request stream.
 */
import { writeAgentAudit } from "../auditLog.ts";
import { createApproval } from "../agentApprovals.ts";
import { evaluateRefund } from "../billingPolicy.ts";
import { stripeRefund, stripeCancelAtPeriodEnd } from "../billingExecutors.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "billing-selfservice";

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const intent = String(body.intent ?? "");
  const userId = body.userId ? String(body.userId) : null;
  if (!userId) return { error: "userId is required" };

  ctx.processed(1);

  // ── plan_info (read-only) ─────────────────────────────────────────────
  if (intent === "plan_info") {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("status, current_period_end, cancel_at_period_end, plan:subscription_plans(name, tier)")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "billing_plan_info", targetRef: `user:${userId}`, after: { found: !!sub } });
    ctx.summary(`plan_info for ${userId}`);
    return { intent, subscription: sub ?? null };
  }

  // ── resend_receipt (read-only + record intent) ────────────────────────
  if (intent === "resend_receipt") {
    const { data: pay } = await supabase
      .from("payments")
      .select("id, amount, stripe_invoice_id, created_at")
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "resend_receipt", targetRef: `user:${userId}`, after: { paymentId: pay?.id ?? null } });
    ctx.summary(`resend_receipt for ${userId}`);
    return { intent, receipt: pay ?? null, note: pay ? "receipt located; delivery queued" : "no succeeded payment found" };
  }

  // ── cancel_subscription (reversible; period-end) ──────────────────────
  if (intent === "cancel_subscription") {
    const { data: sub, error: subError } = await supabase
      .from("user_subscriptions")
      .select("id, stripe_subscription_id, status")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();
    // A read failure here tells the user they have NO ACTIVE SUBSCRIPTION,
    // which is a false statement about their own billing rather than a
    // refusal. It still does not cancel, so the direction is safe, but the
    // two outcomes must not read the same to the caller (WEB-BE-032 AC2).
    if (subError) {
      console.error(`[billing-selfservice] subscription read failed for ${userId}: ${subError.message}`);
      return { intent, ok: false, note: "could not read your subscription; please try again" };
    }
    if (!sub?.stripe_subscription_id) {
      return { intent, ok: false, note: "no active subscription" };
    }
    await stripeCancelAtPeriodEnd(sub.stripe_subscription_id);
    await supabase.from("user_subscriptions").update({ cancel_at_period_end: true }).eq("id", sub.id);
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: "cancel_subscription",
      targetRef: `user_subscriptions:${sub.id}`,
      before: { cancel_at_period_end: false },
      after: { cancel_at_period_end: true, reversible: true, entitlement: "retained until period end" },
    });
    ctx.summary(`cancel_subscription (period-end) for ${userId}`);
    return { intent, ok: true, canceledAtPeriodEnd: true };
  }

  // ── refund (policy + approval gated) ──────────────────────────────────
  if (intent === "refund") {
    const reason = String(body.reason ?? "requested_by_customer");
    // Locate the target payment (explicit or latest succeeded).
    let pay: { id: string; stripe_payment_intent_id: string | null; amount: number; refunded_amount: number | null; created_at: string } | null = null;
    if (body.paymentId) {
      const { data } = await supabase.from("payments").select("id, stripe_payment_intent_id, amount, refunded_amount, created_at").eq("id", String(body.paymentId)).maybeSingle();
      pay = data ?? null;
    } else {
      const { data } = await supabase.from("payments").select("id, stripe_payment_intent_id, amount, refunded_amount, created_at").eq("user_id", userId).eq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle();
      pay = data ?? null;
    }
    if (!pay?.stripe_payment_intent_id) {
      return { intent, ok: false, note: "no refundable payment found" };
    }
    const amountUsd = Number(body.amountUsd) || (Number(pay.amount) - Number(pay.refunded_amount ?? 0));
    const chargeAgeDays = Math.floor((Date.now() - new Date(pay.created_at).getTime()) / (24 * 60 * 60 * 1000));
    const decision = evaluateRefund({ amountUsd, chargeAgeDays, reason });
    const payload = { userId, paymentId: pay.id, paymentIntentId: pay.stripe_payment_intent_id, amountUsd, reason, chargeAgeDays };

    if (!decision.autoApprove) {
      // Out-of-policy → tier-2 approval (AOS-CORE-007). Not executed here.
      const approval = await createApproval(supabase, { agentKey: AGENT_KEY, actionType: "process_refund", payload });
      ctx.escalated(1);
      ctx.summary(`refund escalated (${decision.reason}) for ${userId}`);
      return { intent, autoApproved: false, escalated: true, approvalId: approval.approvalId, policy: decision.reason };
    }

    // In-policy (auto-approve window) → execute now, audited.
    const { refundId } = await stripeRefund(pay.stripe_payment_intent_id, amountUsd, reason);
    await supabase.from("payments").update({ refunded_amount: Number(pay.refunded_amount ?? 0) + amountUsd }).eq("id", pay.id);
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: "process_refund",
      targetRef: `payments:${pay.id}`,
      after: { refundId, amountUsd, reason, autoApproved: true, policy: decision.reason },
    });
    ctx.summary(`refund auto-approved $${amountUsd} for ${userId}`);
    return { intent, autoApproved: true, refundId, amountUsd };
  }

  return { intent, ok: false, error: `unknown intent: ${intent}` };
};
