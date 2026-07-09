/**
 * agent error-triage (AOS-DEV-001) — clusters production error_events into
 * de-duplicated dev tasks. Runs every 30 min over a 24h window:
 *   - group by signature -> frequency, first/last seen, routes, affected users
 *   - high-frequency user-facing -> tier-2, rare/benign -> tier-1 backlog
 *   - signatures with no errors in the window auto-close their open task
 * Stored messages are already PII-scrubbed at ingest (log-error).
 *
 * Consolidated into `agent-runner` (was `agent-error-triage/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "error-triage";
const WINDOW_H = 24;
const TIER2_MIN_FREQUENCY = 10; // occurrences in the window to warrant tier-2

interface Cluster {
  signature: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
  routes: Set<string>;
  users: Set<string>;
  sample: string;
  component: string | null;
  action: string | null;
  userFacing: boolean;
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const sinceIso = new Date(Date.now() - WINDOW_H * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from("error_events")
    .select("signature, message_redacted, component, action, route, severity, source, user_id, created_at")
    .gte("created_at", sinceIso)
    .limit(50000);

  // Cluster by signature.
  const clusters = new Map<string, Cluster>();
  for (const e of (events ?? []) as Array<Record<string, string | null>>) {
    const sig = e.signature!;
    let c = clusters.get(sig);
    if (!c) {
      c = {
        signature: sig,
        frequency: 0,
        firstSeen: e.created_at!,
        lastSeen: e.created_at!,
        routes: new Set(),
        users: new Set(),
        sample: e.message_redacted ?? "",
        component: e.component,
        action: e.action,
        userFacing: false,
      };
      clusters.set(sig, c);
    }
    c.frequency += 1;
    if (e.created_at! < c.firstSeen) c.firstSeen = e.created_at!;
    if (e.created_at! > c.lastSeen) c.lastSeen = e.created_at!;
    if (e.route) c.routes.add(e.route);
    if (e.user_id) c.users.add(e.user_id);
    if (e.source === "client") c.userFacing = true; // client-side = user-facing
  }

  const activeSigs = new Set(clusters.keys());
  let upserted = 0;

  for (const c of clusters.values()) {
    const highFreqUserFacing = c.userFacing && c.frequency >= TIER2_MIN_FREQUENCY;
    const tier: 1 | 2 = highFreqUserFacing ? 2 : 1;
    const dedupeKey = `error:${c.signature}`;
    const payload = {
      signature: c.signature,
      frequency: c.frequency,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
      routes: Array.from(c.routes).slice(0, 20),
      affectedUsers: c.users.size,
      sample: c.sample, // already PII-scrubbed at ingest
      component: c.component,
      action: c.action,
    };

    // Upsert: refresh an existing open task's payload, else create.
    const { data: existing } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("agent_key", AGENT_KEY)
      .eq("dedupe_key", dedupeKey)
      .in("status", ["open", "escalated", "assigned", "auto_resolving"])
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("agent_tasks").update({ payload }).eq("id", existing.id);
    } else {
      await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "dev",
        title: `[${c.frequency}x] ${c.component ?? "app"}: ${c.sample.slice(0, 80)}`,
        confidence: 0,
        forceTier: tier,
        dedupeKey,
        payload,
      });
    }
    upserted++;
  }

  // Auto-close: open error tasks whose signature had no events in the window.
  let closed = 0;
  const { data: openTasks } = await supabase
    .from("agent_tasks")
    .select("id, dedupe_key")
    .eq("agent_key", AGENT_KEY)
    .in("status", ["open", "escalated", "assigned", "auto_resolving"])
    .like("dedupe_key", "error:%")
    .limit(5000);
  for (const t of (openTasks ?? []) as { id: string; dedupe_key: string }[]) {
    const sig = t.dedupe_key.slice("error:".length);
    if (!activeSigs.has(sig)) {
      const { error } = await supabase
        .from("agent_tasks")
        .update({ status: "resolved", resolution: { reason: "no_recurrence", window_h: WINDOW_H, by: AGENT_KEY } })
        .eq("id", t.id);
      if (!error) closed++;
    }
  }

  ctx.processed(events?.length ?? 0);
  ctx.summary(`${clusters.size} cluster(s), ${upserted} task(s) upserted, ${closed} auto-closed`);
  ctx.meta({ clusters: clusters.size, upserted, closed });
  return { clusters: clusters.size, upserted, closed };
};
