/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (issues read-only GET / OPTIONS probes; records results;
 *   opens incident tasks — never mutates monitored surfaces).
 *
 * agent-uptime-monitor (AOS-MAINT-001) — synthetic uptime monitoring.
 *
 * Every 5 min, probes critical public routes (GET on the site URL) and
 * edge-function health (CORS OPTIONS preflight — non-mutating, no auth, no
 * side effects) and records latency/status to `uptime_probes`.
 *
 * Alerting threshold (documented in docs/AGENTIC_OS.md):
 *   - A single failed probe is a *blip* — recorded, never alerted.
 *   - CONSEC_FAIL_THRESHOLD (3) consecutive failed probes for one target is a
 *     *sustained* outage — opens a tier-2 incident (idempotent per target) and
 *     notifies ops immediately.
 *   - When a target with an open incident probes healthy again, the incident is
 *     resolved and a recovery notice is sent.
 *
 * Targets are configurable via env (UPTIME_ROUTES / UPTIME_FUNCTIONS, comma
 * separated); sensible defaults are used when unset.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "uptime-monitor";
const CONSEC_FAIL_THRESHOLD = 3; // sustained-outage definition
const PROBE_TIMEOUT_MS = 8000;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Target {
  key: string;
  kind: "route" | "function";
  url: string;
  method: "GET" | "OPTIONS";
}

function buildTargets(): Target[] {
  const siteUrl = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");

  const routes = (Deno.env.get("UPTIME_ROUTES") || "/,/events,/restaurants,/attractions")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  // Health probes must be non-mutating: OPTIONS preflight returns CORS headers
  // from handleCors before any auth/logic runs.
  // OPTIONS IS THIS PROBE'S BLIND SPOT, measured against production 2026-08-23:
  //     OPTIONS /functions/v1/api-events  -> 204
  //     GET     /functions/v1/api-events  -> 500 Internal server error
  // The public events API had been answering 500 to every caller and this
  // monitor would have reported it healthy, because OPTIONS returns from
  // handleCors before any handler code runs. It detects a function that fails
  // to BOOT, not one that is broken INSIDE.
  const fns = (Deno.env.get("UPTIME_FUNCTIONS") || "agent-ops-digest,version-check")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  // Opt-in GET probes for endpoints safe to actually call: read-only, no auth
  // side effects, no spend. DELIBERATELY EMPTY BY DEFAULT - which function is
  // safe to GET is an operator's judgement, and a wrong guess means a monitor
  // with side effects. api-events and api-restaurants are the candidates.
  const getFns = (Deno.env.get("UPTIME_FUNCTIONS_GET") || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const targets: Target[] = [];
  if (siteUrl) {
    for (const path of routes) {
      targets.push({ key: `route:${path}`, kind: "route", url: `${siteUrl}${path}`, method: "GET" });
    }
  }
  if (supabaseUrl) {
    for (const fn of fns) {
      targets.push({ key: `fn:${fn}`, kind: "function", url: `${supabaseUrl}/functions/v1/${fn}`, method: "OPTIONS" });
    }
    // Keyed `fn-get:` rather than `fn:` on purpose: a function can legitimately
    // be probed both ways, and the consecutive-failure counter is per target
    // key. Sharing a key would let a healthy OPTIONS reset the GET streak and
    // hide exactly the outage this exists to catch.
    for (const fn of getFns) {
      targets.push({ key: `fn-get:${fn}`, kind: "function", url: `${supabaseUrl}/functions/v1/${fn}`, method: "GET" });
    }
  }
  return targets;
}

interface ProbeResult {
  target: Target;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

async function probe(target: Target): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(target.url, {
      method: target.method,
      redirect: "manual",
      signal: controller.signal,
      headers: target.method === "OPTIONS" ? { Origin: "https://uptime-probe.internal" } : undefined,
    });
    const latencyMs = Date.now() - started;
    // A route is up on any non-5xx (2xx/3xx/even 4xx means the server responded).
    // An edge-function OPTIONS preflight should return < 500.
    const ok = res.status > 0 && res.status < 500;
    return { target, ok, status: res.status, latencyMs, error: ok ? null : `status ${res.status}` };
  } catch (err) {
    return {
      target,
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: (err as Error)?.name === "AbortError" ? "timeout" : ((err as Error)?.message ?? "probe error").slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
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
    const targets = buildTargets();
    if (targets.length === 0) {
      ctx.summary("no probe targets configured (set VITE_SITE_URL / SUPABASE_URL)");
      return { probed: 0, incidents: 0, recovered: 0 };
    }

    const results = await Promise.all(targets.map(probe));

    // Record every probe (blips included).
    await supabase.from("uptime_probes").insert(
      results.map((r) => ({
        target_key: r.target.key,
        target_kind: r.target.kind,
        url: r.target.url,
        ok: r.ok,
        status_code: r.status,
        latency_ms: r.latencyMs,
        error: r.error,
      })),
    );

    let incidents = 0;
    let recovered = 0;
    const downNow: string[] = [];

    for (const r of results) {
      const dedupeKey = `uptime-down:${r.target.key}`;
      if (!r.ok) {
        // Sustained? Look at the last CONSEC_FAIL_THRESHOLD probes (which now
        // include the one we just inserted) — all failing ⇒ sustained outage.
        const { data: recent } = await supabase
          .from("uptime_probes")
          .select("ok")
          .eq("target_key", r.target.key)
          .order("checked_at", { ascending: false })
          .limit(CONSEC_FAIL_THRESHOLD);
        const rows = (recent ?? []) as { ok: boolean }[];
        const sustained = rows.length >= CONSEC_FAIL_THRESHOLD && rows.every((x) => !x.ok);
        if (sustained) {
          downNow.push(r.target.key);
          const task = await createAgentTask(supabase, {
            agentKey: AGENT_KEY,
            category: "maintain",
            title: `Outage: ${r.target.key} down (${CONSEC_FAIL_THRESHOLD}+ consecutive probe failures)`,
            confidence: 0, // rule-based, human-confirmed
            forceTier: 2,
            dedupeKey,
            payload: { target: r.target, lastError: r.error, threshold: CONSEC_FAIL_THRESHOLD },
          });
          if (task.ok) {
            incidents++;
            ctx.escalated(1);
          }
        }
      } else {
        // Recovery: if an incident task is open for this target, resolve it.
        const { data: open } = await supabase
          .from("agent_tasks")
          .select("id")
          .eq("agent_key", AGENT_KEY)
          .eq("dedupe_key", dedupeKey)
          .in("status", ["open", "escalated", "assigned", "auto_resolving"])
          .limit(1);
        const openRows = (open ?? []) as { id: string }[];
        if (openRows.length > 0) {
          await supabase
            .from("agent_tasks")
            .update({
              status: "resolved",
              resolution: { auto: true, reason: "target recovered (uptime healthy)", latencyMs: r.latencyMs },
              updated_at: new Date().toISOString(),
            })
            .eq("id", openRows[0].id);
          recovered++;
          await notifyOps(supabase, {
            severity: "medium",
            title: `Recovered: ${r.target.key} is back up`,
            body: `${r.target.url} responded healthy again (${r.latencyMs}ms).`,
            dedupeKey: `uptime-recovered:${r.target.key}`,
            capWindowMs: 30 * 60 * 1000,
          });
        }
      }
    }

    if (downNow.length > 0) {
      await notifyOps(supabase, {
        severity: "high",
        title: `Uptime: ${downNow.length} target(s) DOWN`,
        body: downNow.map((k) => `- ${k}`).join("\n"),
        dedupeKey: `uptime-down-summary`,
        capWindowMs: 15 * 60 * 1000,
      });
    }

    const upCount = results.filter((r) => r.ok).length;
    ctx.processed(results.length);
    ctx.summary(`probed ${results.length} targets — ${upCount} up, ${results.length - upCount} failing; ${incidents} incident(s), ${recovered} recovered`);
    ctx.meta({ up: upCount, down: results.length - upCount, incidents, recovered, downNow });
    return { probed: results.length, up: upCount, incidents, recovered };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
