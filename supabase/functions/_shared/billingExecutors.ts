/**
 * billingExecutors — the actual financial side-effects for AOS-CS-004, run
 * against the same Stripe integration the app's Stripe functions use
 * (STRIPE_SECRET_KEY). Importing this module registers the `process_refund`
 * approval executor, so when a human approves a queued refund in the approvals
 * console (executeApprovedAction), the refund actually runs — and is audited.
 *
 * Entitlement changes use cancel_at_period_end (Stripe) — no local schema
 * change, and access continues to the end of the paid period, so shipped
 * clients keep reading the subscription_tier shape they expect.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { registerApprovalExecutor } from "./agentApprovals.ts";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string {
  const k = Deno.env.get("STRIPE_SECRET_KEY");
  if (!k) throw new Error("STRIPE_SECRET_KEY not set");
  return k;
}

async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${(json?.error?.message ?? "").slice(0, 200)}`);
  return json;
}

/** Refund a payment intent (in whole USD). Reason maps to Stripe's enum where possible. */
export async function stripeRefund(paymentIntentId: string, amountUsd: number, reason: string): Promise<{ refundId: string }> {
  const form: Record<string, string> = { payment_intent: paymentIntentId };
  if (amountUsd > 0) form.amount = String(Math.round(amountUsd * 100));
  // Stripe accepts duplicate | fraudulent | requested_by_customer.
  form.reason = reason === "duplicate_charge" ? "duplicate" : "requested_by_customer";
  const out = await stripePost("/refunds", form);
  return { refundId: String(out.id ?? "") };
}

/** Cancel a subscription at period end (reversible; entitlement lasts the period). */
export async function stripeCancelAtPeriodEnd(subscriptionId: string): Promise<void> {
  await stripePost(`/subscriptions/${subscriptionId}`, { cancel_at_period_end: "true" });
}

// Register the refund executor once (idempotent — Map.set overwrites).
registerApprovalExecutor("process_refund", async (_supabase: SupabaseClient, payload: Record<string, unknown>) => {
  const paymentIntentId = String(payload.paymentIntentId ?? "");
  const amountUsd = Number(payload.amountUsd) || 0;
  const reason = String(payload.reason ?? "requested_by_customer");
  if (!paymentIntentId) return { executed: false, note: "missing paymentIntentId" };
  const { refundId } = await stripeRefund(paymentIntentId, amountUsd, reason);
  return { executed: true, refundId, amountUsd };
});
