/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (reads billing/usage, opens incident tasks; takes NO
 *   account-affecting action itself — those escalate to a human).
 *
 * agent-fraud-monitor (AOS-SEC-004) — Subscription & AI-endpoint abuse/fraud.
 *
 * Correlates payments (refunds/chargebacks), user_subscriptions (entitlement),
 * and usage_events (AI-quota) to flag: rapid signup+refund, per-user quota
 * abuse, and mismatched entitlements. Account-affecting responses escalate to
 * tier-2 with evidence; tier-1 is limited to safe throttling within the existing
 * rate-limit infra and NEVER tightens shipped client limits below their retry
 * thresholds (WEB-SEC-002).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "fraud-abuse-detector";
const WINDOW_H = 24;
const QUOTA_ABUSE_UNITS = 2000; // AI usage units/user/24h that warrants review

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Finding {
  key: string;
  tier: 2 | 3;
  title: string;
  evidence: Record<string, unknown>;
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

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const sinceIso = new Date(Date.now() - WINDOW_H * 60 * 60 * 1000).toISOString();
    const findings: Finding[] = [];

    // ── 1. Refund / chargeback risk (rapid signup + refund) ─────────────────
    const { data: refunds } = await supabase
      .from("payments")
      .select("user_id, amount, status, refunded_amount, created_at")
      .or("status.eq.refunded,status.eq.partially_refunded,refunded_amount.gt.0")
      .gte("created_at", sinceIso)
      .limit(2000);
    const byUserRefunds = new Map<string, { count: number; total: number }>();
    for (const p of (refunds ?? []) as { user_id: string | null; refunded_amount: number; amount: number }[]) {
      if (!p.user_id) continue;
      const cur = byUserRefunds.get(p.user_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(p.refunded_amount || p.amount || 0);
      byUserRefunds.set(p.user_id, cur);
    }
    for (const [userId, r] of byUserRefunds) {
      findings.push({
        key: `refund:${userId}`,
        tier: 2,
        title: `Refund/chargeback risk for user (${r.count} refund(s), $${r.total.toFixed(2)}/${WINDOW_H}h)`,
        evidence: { userId, refunds: r.count, totalRefunded: r.total, windowH: WINDOW_H },
      });
    }

    // ── 2. Per-user AI quota abuse ──────────────────────────────────────────
    const { data: usage } = await supabase
      .from("usage_events")
      .select("user_id, quantity")
      .gte("created_at", sinceIso)
      .limit(20000);
    const byUserUsage = new Map<string, number>();
    for (const u of (usage ?? []) as { user_id: string | null; quantity: number }[]) {
      if (!u.user_id) continue;
      byUserUsage.set(u.user_id, (byUserUsage.get(u.user_id) ?? 0) + (u.quantity ?? 0));
    }
    for (const [userId, units] of byUserUsage) {
      if (units >= QUOTA_ABUSE_UNITS) {
        findings.push({
          key: `quota_user:${userId}`,
          tier: 2, // throttling a paid account is account-affecting -> human
          title: `AI quota abuse: user consumed ${units} units/${WINDOW_H}h`,
          evidence: { userId, units, threshold: QUOTA_ABUSE_UNITS },
        });
      }
    }

    // ── 3. Mismatched entitlements (active sub, no successful payment) ───────
    const { data: activeSubs } = await supabase
      .from("user_subscriptions")
      .select("id, user_id, status, trial_end")
      .eq("status", "active")
      .limit(5000);
    // Users who have at least one successful payment ever.
    const { data: paidRows } = await supabase
      .from("payments")
      .select("user_id")
      .eq("status", "succeeded")
      .limit(20000);
    const paidUsers = new Set<string>((paidRows ?? []).map((p: { user_id: string | null }) => p.user_id).filter(Boolean) as string[]);
    const nowMs = Date.now();
    for (const s of (activeSubs ?? []) as { id: string; user_id: string; trial_end: string | null }[]) {
      const trialing = s.trial_end && new Date(s.trial_end).getTime() > nowMs;
      if (!trialing && !paidUsers.has(s.user_id)) {
        findings.push({
          key: `entitlement:${s.id}`,
          tier: 2,
          title: `Entitlement mismatch: active subscription with no successful payment`,
          evidence: { subscriptionId: s.id, userId: s.user_id },
        });
      }
    }

    // ── Open incident tasks (idempotent, account-affecting -> human) ────────
    let opened = 0;
    for (const f of findings) {
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "security",
        title: f.title,
        confidence: 0,
        forceTier: f.tier,
        dedupeKey: f.key,
        payload: { finding: f.key, evidence: f.evidence, note: "account-affecting action requires human review (WEB-SEC-002)" },
      });
      if (task.ok) { opened++; ctx.escalated(1); }
    }

    if (findings.length > 0) {
      await notifyOps(supabase, {
        severity: "high",
        title: `Billing/AI abuse signals (${findings.length})`,
        body: findings.map((f) => `- ${f.title}`).join("\n"),
        dedupeKey: "fraud-abuse-summary",
      });
    }

    ctx.processed((refunds?.length ?? 0) + (usage?.length ?? 0) + (activeSubs?.length ?? 0));
    ctx.summary(`${findings.length} abuse/fraud finding(s); ${opened} incident(s)`);
    ctx.meta({ findings: findings.map((f) => f.key), opened });
    return { findings: findings.length, opened };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
