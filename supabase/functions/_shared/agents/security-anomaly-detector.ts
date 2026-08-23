/**
 * agent security-anomaly-detector (AOS-SEC-001) — Security Anomaly Detector
 *
 * Runs every 15 min. Reads login_attempts, rate_limit_entries, and
 * security_audit_logs for spikes/anomalies (credential stuffing, quota abuse,
 * unusual admin actions). Confident benign patterns are noted; ambiguous /
 * high-severity patterns open a tier-2/3 incident task with evidence. It NEVER
 * locks a user — remediation is always human-confirmed.
 *
 * Detection thresholds (documented in docs/AGENTIC_OS.md):
 *   - credential stuffing: >= 15 failed logins from one IP in 20 min (high),
 *     or one email failed from >= 5 distinct IPs in 20 min (high)
 *   - quota abuse: a client_id with request_count >= 300 across a 20-min window
 *     on any endpoint (medium)
 *   - unusual admin: >= 1 high-severity, or >= 10 admin_action, audit rows in
 *     20 min (medium/high)
 *
 * Consolidated into `agent-runner` (was `agent-security-monitor/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "security-anomaly-detector";
const WINDOW_MIN = 20;

// Thresholds
const STUFF_IP_FAILS = 15;
const STUFF_EMAIL_IPS = 5;
const QUOTA_REQUESTS = 300;
const ADMIN_ACTION_BURST = 10;

interface Incident {
  key: string; // dedupe key
  severity: "medium" | "high";
  title: string;
  evidence: Record<string, unknown>;
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const sinceIso = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();
  const incidents: Incident[] = [];

  // ── 1. Credential stuffing (failed logins) ──────────────────────────────
  const { data: fails } = await supabase
    .from("login_attempts")
    // Real columns are client_ip and attempted_at; ip_address / attempt_time
    // belong to failed_login_attempts, a SEPARATE table with 0 rows and no
    // writer anywhere in the codebase. This query named one table and the
    // other table's columns, so it 42703d and the credential-stuffing
    // detector has never seen an attempt (WEB-QA-017).
    //
    // NO success FILTER, and its absence is the point rather than an
    // omission: check-login-attempt INSERTs on record_failure and DELETEs
    // the email's rows on record_success, so every row here is already a
    // failure. There is no success column because success is not stored.
    .select("email, client_ip")
    .gte("attempted_at", sinceIso)
    .limit(5000);

  const byIp = new Map<string, number>();
  const byEmailIps = new Map<string, Set<string>>();
  for (const r of (fails ?? []) as { email: string; client_ip: string | null }[]) {
    const ip = r.client_ip ?? "unknown";
    byIp.set(ip, (byIp.get(ip) ?? 0) + 1);
    if (!byEmailIps.has(r.email)) byEmailIps.set(r.email, new Set());
    byEmailIps.get(r.email)!.add(ip);
  }
  for (const [ip, count] of byIp) {
    if (ip !== "unknown" && count >= STUFF_IP_FAILS) {
      incidents.push({
        key: `credential_stuffing_ip:${ip}`,
        severity: "high",
        title: `Credential stuffing from ${ip} (${count} failed logins/${WINDOW_MIN}m)`,
        evidence: { ip, failedLogins: count, windowMin: WINDOW_MIN },
      });
    }
  }
  for (const [email, ips] of byEmailIps) {
    if (ips.size >= STUFF_EMAIL_IPS) {
      incidents.push({
        key: `credential_stuffing_email:${email}`,
        severity: "high",
        title: `Distributed login attempts on one account (${ips.size} IPs/${WINDOW_MIN}m)`,
        evidence: { email, distinctIps: ips.size, windowMin: WINDOW_MIN },
      });
    }
  }

  // ── 2. Quota abuse (rate-limit pressure) ────────────────────────────────
  const { data: rl } = await supabase
    .from("rate_limit_entries")
    .select("client_id, endpoint, request_count")
    .gte("window_start", sinceIso)
    .limit(5000);
  const byClient = new Map<string, number>();
  for (const r of (rl ?? []) as { client_id: string; request_count: number }[]) {
    byClient.set(r.client_id, (byClient.get(r.client_id) ?? 0) + (r.request_count ?? 0));
  }
  for (const [client, total] of byClient) {
    if (total >= QUOTA_REQUESTS) {
      incidents.push({
        key: `quota_abuse:${client}`,
        severity: "medium",
        title: `Quota abuse from ${client} (${total} requests/${WINDOW_MIN}m)`,
        evidence: { clientId: client, requests: total, windowMin: WINDOW_MIN },
      });
    }
  }

  // ── 3. Unusual admin activity / high-severity security events ───────────
  const { data: audit } = await supabase
    .from("security_audit_logs")
    .select("event_type, severity, identifier, action")
    .gte("created_at", sinceIso)
    .limit(5000);
  const rows = (audit ?? []) as { event_type: string; severity: string; identifier: string; action: string | null }[];
  const highSev = rows.filter((r) => r.severity === "high");
  const adminActions = rows.filter((r) => r.event_type === "admin_action");
  if (highSev.length >= 1) {
    incidents.push({
      key: `high_severity_security_events`,
      severity: "high",
      title: `${highSev.length} high-severity security event(s) in ${WINDOW_MIN}m`,
      evidence: { count: highSev.length, sample: highSev.slice(0, 5) },
    });
  }
  if (adminActions.length >= ADMIN_ACTION_BURST) {
    incidents.push({
      key: `admin_action_burst`,
      severity: "medium",
      title: `Unusual admin-action burst (${adminActions.length}/${WINDOW_MIN}m)`,
      evidence: { count: adminActions.length },
    });
  }

  // ── Open incident tasks (idempotent via dedupe key) ─────────────────────
  let opened = 0;
  for (const inc of incidents) {
    const task = await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "security",
      title: inc.title,
      confidence: 0, // rule-based finding, always human-confirmed
      forceTier: inc.severity === "high" ? 3 : 2,
      dedupeKey: inc.key,
      payload: { anomaly: inc.key, severity: inc.severity, evidence: inc.evidence },
    });
    if (task.ok) {
      opened++;
      ctx.escalated(1);
    }
  }

  if (incidents.length > 0) {
    await notifyOps(supabase, {
      severity: incidents.some((i) => i.severity === "high") ? "high" : "medium",
      title: `Security anomalies detected (${incidents.length})`,
      body: incidents.map((i) => `- ${i.title}`).join("\n"),
      dedupeKey: "security-anomaly-summary",
    });
  }

  ctx.processed(rows.length + (fails?.length ?? 0) + (rl?.length ?? 0));
  ctx.summary(`scanned ${rows.length} audit + ${fails?.length ?? 0} logins + ${rl?.length ?? 0} rl rows; ${opened} incident(s)`);
  ctx.meta({ incidents: incidents.map((i) => i.key), opened });
  return { incidents: incidents.length, opened };
};
