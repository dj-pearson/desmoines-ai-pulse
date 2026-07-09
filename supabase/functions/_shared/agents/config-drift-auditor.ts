/**
 * agent config-drift-auditor (AOS-SEC-006) — RLS/config drift ingest.
 *
 * The CI drift sweep regenerates the RLS audit + config snapshot, diffs them
 * against the committed baselines, and POSTs the drift here:
 *   { newFindings: string[], configDrift: string[] }
 * New permissive-write/anon-write/missing-RLS/unpinned-definer findings, or
 * CORS/CSP/verify_jwt config drift, open a deduped tier-2 security task. A clean
 * run just records a successful agent run.
 *
 * Consolidated into `agent-runner` (was `agent-config-audit/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "config-drift-auditor";

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const newFindings: string[] = Array.isArray(body.newFindings) ? body.newFindings.map(String).slice(0, 500) : [];
  const configDrift: string[] = Array.isArray(body.configDrift) ? body.configDrift.map(String).slice(0, 100) : [];

  const drift = [...newFindings, ...configDrift];
  ctx.processed(drift.length);

  if (drift.length === 0) {
    // Clean: close any open drift task.
    const { data: open } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("agent_key", AGENT_KEY)
      .eq("dedupe_key", "config_drift")
      .in("status", ["open", "escalated", "assigned"])
      .limit(5);
    for (const t of (open ?? []) as { id: string }[]) {
      await supabase.from("agent_tasks").update({
        status: "resolved",
        resolution: { reason: "drift_cleared", by: AGENT_KEY },
      }).eq("id", t.id);
    }
    ctx.summary("no RLS/config drift vs baseline");
    return { drift: 0 };
  }

  const task = await createAgentTask(supabase, {
    agentKey: AGENT_KEY,
    category: "security",
    title: `RLS/config drift: ${newFindings.length} RLS finding(s), ${configDrift.length} config change(s)`,
    confidence: 0,
    forceTier: 2,
    dedupeKey: "config_drift",
    payload: {
      newFindings: newFindings.slice(0, 200),
      configDrift,
      note: "Review the drift. If intended, regenerate + commit the baselines (docs/RLS_AUDIT.md, rls-audit-findings.json, security-config-baseline.json) after review.",
    },
  });

  await notifyOps(supabase, {
    severity: "high",
    title: `Security config drift detected (${drift.length})`,
    body: [...newFindings.slice(0, 10), ...configDrift].map((k) => `- ${k}`).join("\n"),
    dedupeKey: "config-drift-alert",
  });

  ctx.escalated(1);
  ctx.summary(`${newFindings.length} new RLS finding(s), ${configDrift.length} config change(s); tier-2 opened`);
  ctx.meta({ newFindings: newFindings.length, configDrift });
  return { drift: drift.length, opened: task.ok ? 1 : 0 };
};
