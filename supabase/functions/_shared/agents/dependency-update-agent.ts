/**
 * agent dependency-update-agent (AOS-DEV-003) — dependency-update coordination.
 *
 *   { mode: 'priority' } -> package names that have an OPEN CVE task, so the
 *                           workflow bumps security-affected deps first
 *                           (coordinates with AOS-SEC-002).
 *   { mode: 'majors', majors: [{name,current,latest}] } -> open a deduped
 *                           tier-2 review task per major-version bump (human
 *                           review — majors can break).
 *
 * Consolidated into `agent-runner` (was `agent-dep-update/index.ts`).
 *
 * DEVIATION FROM THE SINGLE-CALLBACK SHAPE: the original had mode dispatch
 * OUTSIDE `runAgent` — the `priority` branch returned directly WITHOUT a ledger
 * entry, only the `majors` branch ran under `runAgent`, and unknown modes / errors
 * returned HTTP 400 / 500. Under the consolidated dispatcher the whole `run` body
 * is wrapped in `runAgent`, so: (a) the `priority` mode now records a ledger run,
 * and (b) unknown modes now return HTTP 200 with an `{ error }` result (was 400)
 * and thrown errors surface as the dispatcher's 500. Logic/return payloads are
 * otherwise preserved verbatim.
 */
import { createAgentTask } from "../agentTasks.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "dependency-update-agent";

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const mode = body.mode as string | undefined;

  // Security-priority packages: those with an open CVE task (AOS-SEC-002).
  if (mode === "priority") {
    const { data, error: openCveError } = await supabase
      .from("agent_tasks")
      .select("dedupe_key")
      .eq("agent_key", "dependency-cve-scanner")
      .in("status", ["open", "escalated", "assigned", "auto_resolving"])
      .like("dedupe_key", "cve:%")
      .limit(500);
    // DEDUPE GUARD. `open cve: task` is what stops this agent opening a second task for
    // something it has already filed. A dropped error emptied it, so every finding
    // looked new and the queue filled with duplicates of one problem. Logged, not
    // thrown - a duplicate task is noise, and refusing to run at all is worse.
    if (openCveError) console.error(`open cve: task read failed; duplicate tasks are possible this run: ${openCveError.message}`);
    const packages = Array.from(
      new Set((data ?? []).map((r: { dedupe_key: string }) => r.dedupe_key.slice("cve:".length))),
    );
    return { ok: true, packages };
  }

  if (mode === "majors") {
    const majors: Array<{ name: string; current?: string; latest?: string }> = Array.isArray(body.majors) ? body.majors : [];
    let opened = 0;
    for (const m of majors.slice(0, 100)) {
      if (!m?.name) continue;
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "dev",
        title: `Major dependency update: ${m.name} ${m.current ?? "?"} -> ${m.latest ?? "?"}`,
        confidence: 0,
        forceTier: 2, // majors can break — human review
        dedupeKey: `major_update:${m.name}`,
        payload: { package: m.name, current: m.current, latest: m.latest, kind: "major", note: "semver major — review breaking changes before bumping" },
      });
      if (task.ok) { opened++; ctx.escalated(1); }
    }
    ctx.processed(majors.length);
    ctx.summary(`${majors.length} major update(s); ${opened} review task(s)`);
    ctx.meta({ majors: majors.length, opened });
    return { majors: majors.length, opened };
  }

  return { error: "Unknown mode; expected priority|majors" };
};
