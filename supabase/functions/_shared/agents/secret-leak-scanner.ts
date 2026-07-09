/**
 * agent secret-leak-scanner (AOS-SEC-003) — Secret-leak scanner ingest.
 *
 * The scan runs in CI (needs git). The secret-history-scan workflow scans the
 * tree and POSTs findings here as {file, line, type} — NO secret values. On any
 * finding this opens a single tier-3 incident with all locations and the
 * rotation runbook linked, deduped so a persistent leak is one task.
 *
 * Consolidated into `agent-runner` (was `agent-secret-scan/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "secret-leak-scanner";
const ROTATION_RUNBOOK = "docs/AGENTIC_OS.md#secret-rotation-runbook";

interface Finding {
  file: string;
  line: number;
  type: string;
}

// Defensive: strip anything that isn't a plain location/type so a secret value
// can never be persisted even if a caller sends extra fields.
function sanitize(f: Finding): Finding {
  return { file: String(f.file ?? "").slice(0, 300), line: Number(f.line) || 0, type: String(f.type ?? "unknown").slice(0, 40) };
}

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const findings: Finding[] = Array.isArray(body.findings) ? body.findings.map(sanitize) : [];

  ctx.processed(findings.length);
  if (findings.length === 0) {
    // Nothing found this run — auto-close any open leak incident.
    const { data: open } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("agent_key", AGENT_KEY)
      .eq("dedupe_key", "secret_leak")
      .in("status", ["open", "escalated", "assigned"])
      .limit(5);
    for (const t of (open ?? []) as { id: string }[]) {
      await supabase.from("agent_tasks").update({
        status: "resolved",
        resolution: { reason: "no_secret_findings", by: AGENT_KEY },
      }).eq("id", t.id);
    }
    ctx.summary("no secret findings; cleared any open leak incident");
    return { findings: 0, opened: 0 };
  }

  const byType: Record<string, number> = {};
  for (const f of findings) byType[f.type] = (byType[f.type] ?? 0) + 1;

  // One tier-3 incident with all locations + the rotation runbook. Deduped so
  // a persistent leak stays one task (its payload is refreshed on new runs).
  const task = await createAgentTask(supabase, {
    agentKey: AGENT_KEY,
    category: "security",
    title: `Potential secret leak: ${findings.length} location(s)`,
    confidence: 0,
    forceTier: 3,
    dedupeKey: "secret_leak",
    payload: {
      // Locations + types ONLY — never the secret values.
      locations: findings.slice(0, 100).map((f) => `${f.file}:${f.line} (${f.type})`),
      byType,
      rotationRunbook: ROTATION_RUNBOOK,
    },
  });

  await notifyOps(supabase, {
    severity: "high",
    title: `Secret leak suspected (${findings.length} location(s))`,
    body: `Types: ${Object.entries(byType).map(([t, n]) => `${t} x${n}`).join(", ")}. See task + rotation runbook (${ROTATION_RUNBOOK}). Values withheld.`,
    dedupeKey: "secret-leak-alert",
  });

  ctx.escalated(1);
  ctx.summary(`${findings.length} secret location(s) across ${Object.keys(byType).length} type(s); opened tier-3 incident`);
  ctx.meta({ findings: findings.length, byType });
  return { findings: findings.length, opened: task.ok ? 1 : 0 };
};
