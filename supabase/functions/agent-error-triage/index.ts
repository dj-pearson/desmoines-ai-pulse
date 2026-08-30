/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (clusters errors into dev tasks; no destructive action).
 *
 * agent-error-triage (AOS-DEV-001) — clusters production error_events into
 * de-duplicated dev tasks. Runs every 30 min over a 24h window:
 *   - group by signature -> frequency, first/last seen, routes, affected users
 *   - high-frequency user-facing -> tier-2, rare/benign -> tier-1 backlog
 *   - signatures with no errors in the window auto-close their open task
 * Stored messages are already PII-scrubbed at ingest (log-error).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";

const AGENT_KEY = "error-triage";
const WINDOW_H = 24;
const TIER2_MIN_FREQUENCY = 10; // occurrences in the window to warrant tier-2

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

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
    const { data: events, error: eventsError } = await supabase
      .from("error_events")
      .select("signature, message_redacted, component, action, route, severity, source, user_id, created_at")
      .gte("created_at", sinceIso)
      .limit(50000);

    // Cluster by signature.
    // No events means nothing to triage, which the run reports as a SUCCESS -
    // indistinguishable from a quiet window (WEB-BE-032 AC2).
    if (eventsError) throw new Error(`error_events read failed: ${eventsError.message}`);
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
      const { data: existing, error: existingError } = await supabase
        .from("agent_tasks")
        .select("id")
        .eq("agent_key", AGENT_KEY)
        .eq("dedupe_key", dedupeKey)
        .in("status", ["open", "escalated", "assigned", "auto_resolving"])
        .limit(1)
        .maybeSingle();

      // A dropped error reads as "no open task for this signature" and creates a
      // SECOND task every run, for a signature that by definition keeps firing.
      // Same idempotency shape as agentTasks.createTask (WEB-BE-032 AC2).
      if (existingError) {
        console.warn(`[error-triage] dedupe read failed for ${dedupeKey}; skipping: ${existingError.message}`);
        continue;
      }
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
    const { data: openTasks, error: openTasksError } = await supabase
      .from("agent_tasks")
      .select("id, dedupe_key")
      .eq("agent_key", AGENT_KEY)
      .in("status", ["open", "escalated", "assigned", "auto_resolving"])
      .like("dedupe_key", "error:%")
      .limit(5000);
    // Best-effort: an empty list closes nothing, which is the safe direction
    // for an auto-close sweep (WEB-BE-032 AC3).
    if (openTasksError) console.warn(`[error-triage] auto-close sweep read failed: ${openTasksError.message}`);
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
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
