/**
 * agent compliance-monitor (AOS-SEC-007) — retention / consent / deletion SLA.
 *
 * Weekly checks:
 *   - Deletion SLA: account_deletion_tokens still present past the SLA window
 *     mean a deletion request may not have completed (the row cascade-deletes
 *     with the user) -> tier-2 review.
 *   - Retention: rows on telemetry/PII tables past policy are flagged for
 *     review; the agent never hard-deletes (purge is approval-gated).
 *   - Consent: required consent types must have coverage.
 * Compliance counts feed the ops digest.
 *
 * Consolidated into `agent-runner` (was `agent-compliance-monitor/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

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

/**
 * null means "could not read". Every finding in this agent is gated on a count
 * being above a threshold, so `count ?? 0` meant a failed query reported
 * compliance. The one direction a compliance check must never fail in.
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

export const run: AgentRun = async (ctx, { supabase }) => {
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
      // null (unreadable) is recorded too - an unchecked retention policy is a
      // finding, not a pass.
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
};
