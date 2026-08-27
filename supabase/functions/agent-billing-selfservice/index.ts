/**
 * SECURITY: verify_jwt = false
 * Reason: agent/console-invoked; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (performs billing actions via Stripe; refunds are
 *   policy-gated + approval-gated + audited; cancellation is reversible).
 *
 * agent-billing-selfservice (AOS-CS-004) — tier-1 billing self-service within
 * explicit policy:
 *   - plan_info / resend_receipt   → read-only, tier-1, audited.
 *   - cancel_subscription          → cancel_at_period_end (reversible; entitlement
 *                                    lasts the paid period, no schema change), audited.
 *   - refund                       → evaluateRefund (AOS-GOV-003 window). In-policy
 *                                    refunds run via Stripe immediately (auto-approve
 *                                    window); out-of-policy queue a tier-2 approval
 *                                    (AOS-CORE-007). Always audited.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";
import { createApproval } from "../_shared/agentApprovals.ts";
import { evaluateRefund } from "../_shared/billingPolicy.ts";
import { stripeRefund, stripeCancelAtPeriodEnd } from "../_shared/billingExecutors.ts";

const AGENT_KEY = "billing-selfservice";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const intent = String(body.intent ?? "");
  const userId = body.userId ? String(body.userId) : null;
  if (!userId) return json({ error: "userId is required" }, 400, corsHeaders);

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    ctx.processed(1);

    // ── plan_info (read-only) ─────────────────────────────────────────────
    if (intent === "plan_info") {
      const { data: sub, error: subError } = await supabase
        .from("user_subscriptions")
        .select("status, current_period_end, cancel_at_period_end, plan:subscription_plans(name, tier)")
        .eq("user_id", userId)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle();
      // WEB-BE-032, ported from _shared/agents/billing-selfservice.ts, which is
      // the same agent and was fixed while this copy was not. `found: false` is
      // a claim about this customer's account; it must not also be what a
      // failed query looks like.
      if (subError) {
        return { intent, error: `Could not read the subscription: ${subError.message}` };
      }
      await writeAgentAudit(supabase, { agentKey: AGENT_KEY, actionType: "billing_plan_info", targetRef: `user:${userId}`, after: { found: !!sub } });
      ctx.summary(`plan_info for ${userId}`);
      return { intent, subscription: sub ?? null };
    }

    // ── resend_receipt (read-only + record intent) ────────────────────────
    if (intent === "resend_receipt") {
      const { data: pay, error: payError } = await supabase
        .from("payments")
        .select("id, amount, stripe_invoice_id, created_at")
        .eq("user_id", userId)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // "no succeeded payment found" is told to a paying customer. Saying it
      // because the table could not be read is worse than saying nothing.
      if (payError) {
        return { intent, error: `Could not read payment history: ${payError.message}` };
      }
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
      let payLookupError: string | null = null;
      if (body.paymentId) {
        const { data, error } = await supabase.from("payments").select("id, stripe_payment_intent_id, amount, refunded_amount, created_at").eq("id", String(body.paymentId)).maybeSingle();
        pay = data ?? null;
        payLookupError = error?.message ?? null;
      } else {
        const { data, error } = await supabase.from("payments").select("id, stripe_payment_intent_id, amount, refunded_amount, created_at").eq("user_id", userId).eq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle();
        pay = data ?? null;
        payLookupError = error?.message ?? null;
      }

      // "NO REFUNDABLE PAYMENT FOUND" IS A STATEMENT ABOUT A CUSTOMER'S MONEY.
      // Both lookups discarded their error, so a failed query produced pay =
      // null and this agent told the customer they have nothing to refund.
      // public.payments does not exist (42P01, measured 2026-08-23), so that is
      // not hypothetical: every refund request this copy answered was answered
      // with a falsehood, and nothing recorded that a query had failed. The
      // build-or-delete decision on the billing tables is WEB-QA-018's.
      if (payLookupError) {
        return { intent, ok: false, error: `Could not read payment history: ${payLookupError}` };
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
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
