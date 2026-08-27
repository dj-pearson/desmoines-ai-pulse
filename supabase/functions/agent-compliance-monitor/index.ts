/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (reads compliance state, opens review tasks; NEVER hard-
 *   deletes data — retention purges are human-approved).
 *
 * agent-compliance-monitor (AOS-SEC-007) — retention / consent / deletion SLA.
 *
 * Weekly checks:
 *   - Deletion SLA: account_deletion_tokens still present past the SLA window
 *     mean a deletion request may not have completed (the row cascade-deletes
 *     with the user) -> tier-2 review.
 *   - Retention: rows on telemetry/PII tables past policy are flagged for
 *     review; the agent never hard-deletes (purge is approval-gated).
 *   - Consent: required consent types must have coverage.
 * Compliance counts feed the ops digest.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "compliance-monitor";
const DELETION_SLA_DAYS = 30;
const REQUIRED_CONSENT_TYPES = ["privacy_policy", "terms"];

// Retention policy (days) per telemetry/PII table + its timestamp column.
const RETENTION: Array<{ table: string; col: string; days: number }> = [
  { table: "login_attempts", col: "attempt_time", days: 90 },
  { table: "security_audit_logs", col: "created_at", days: 180 },
];

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

/**
 * WEB-BE-032, ported from _shared/agents/compliance-monitor.ts, which is the
 * same agent and was fixed while this copy was not.
 *
 * The error was discarded and `count ?? 0` turned an unreadable table into a
 * count of zero - so on every gate below, a failed query read as "no
 * violations". A compliance monitor reporting a clean bill of health because it
 * could not see the data is the worst version of this defect in the repo.
 *
 * Note for whoever maintains scripts/check-discarded-supabase-errors.mjs: this
 * site was invisible to it, because the ratchet looks for `const { data` and
 * this destructures `{ count }`. It is not the only aggregate-only read.
 */
async function count(supabase: Client, table: string, apply: (q: Client) => Client): Promise<number | null> {
  const { count, error } = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) {
    console.error(`[compliance-monitor] count(${table}) failed:`, error.message);
    return null;
  }
  return count ?? 0;
}

/** A gate that treats an unreadable count as "needs a human", never as a pass. */
function exceeds(value: number | null, threshold: number): boolean {
  return value === null || value > threshold;
}

interface Finding { key: string; title: string; evidence: Record<string, unknown>; }

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
    const findings: Finding[] = [];
    const nowMs = Date.now();

    // ── 1. Deletion SLA ─────────────────────────────────────────────────────
    const deletionCutoff = new Date(nowMs - DELETION_SLA_DAYS * 86400_000).toISOString();
    const staleDeletions = await count(supabase, "account_deletion_tokens", (q) => q.lt("created_at", deletionCutoff));
    if (exceeds(staleDeletions, 0)) {
      findings.push({
        key: "deletion_sla",
        title: staleDeletions === null
          ? `Deletion SLA UNVERIFIED - account_deletion_tokens could not be counted`
          : `${staleDeletions} deletion request(s) past the ${DELETION_SLA_DAYS}-day SLA`,
        evidence: { staleDeletions, slaDays: DELETION_SLA_DAYS, unreadable: staleDeletions === null },
      });
    }

    // ── 2. Retention (flag for review — never hard-delete) ──────────────────
    const retentionOverages: Record<string, number | null> = {};
    for (const r of RETENTION) {
      const cutoff = new Date(nowMs - r.days * 86400_000).toISOString();
      try {
        const n = await count(supabase, r.table, (q) => q.lt(r.col, cutoff));
        // null (unreadable) is recorded too - an unchecked retention policy is
        // a finding, not a pass.
        if (exceeds(n, 0)) retentionOverages[r.table] = n;
      } catch (_e) { /* table may not exist in this env — skip */ }
    }
    if (Object.keys(retentionOverages).length > 0) {
      findings.push({
        key: "retention_overage",
        title: `Rows past retention policy on ${Object.keys(retentionOverages).length} table(s)`,
        evidence: { retentionOverages, note: "flag only — purge is approval-gated, no auto-delete" },
      });
    }

    // ── 3. Consent coverage ─────────────────────────────────────────────────
    const missingConsent: string[] = [];
    for (const ctype of REQUIRED_CONSENT_TYPES) {
      try {
        const n = await count(supabase, "consent_records", (q) => q.eq("consent_type", ctype).eq("granted", true));
        // null is treated as missing: an unreadable consent count has not shown
        // that consent exists, and this is the one gate that must not fail open.
        if (n === null || n === 0) missingConsent.push(ctype);
      } catch (_e) { /* skip */ }
    }
    if (missingConsent.length > 0) {
      findings.push({
        key: "consent_coverage",
        title: `No granted consent records for: ${missingConsent.join(", ")}`,
        evidence: { missingConsent },
      });
    }

    // ── Open review tasks (idempotent, human review — no destructive action) ─
    let opened = 0;
    for (const f of findings) {
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "governance",
        title: f.title,
        confidence: 0,
        forceTier: 2,
        dedupeKey: `compliance:${f.key}`,
        payload: { finding: f.key, evidence: f.evidence, note: "compliance review — no data deleted; retention purge requires approval" },
      });
      if (task.ok) { opened++; ctx.escalated(1); }
    }

    if (findings.length > 0) {
      await notifyOps(supabase, {
        severity: "medium",
        title: `Compliance findings (${findings.length})`,
        body: findings.map((f) => `- ${f.title}`).join("\n"),
        dedupeKey: "compliance-summary",
      });
    }

    ctx.processed(findings.length);
    ctx.summary(`${findings.length} compliance finding(s); ${opened} task(s). NOTE: data-export requests are not yet tracked in a table (best-effort).`);
    ctx.meta({ findings: findings.map((f) => f.key), opened });
    return { findings: findings.length, opened };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
