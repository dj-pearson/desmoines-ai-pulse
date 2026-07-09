/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked ingest endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the secret-history-scan workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: MEDIUM (opens incident tasks; stores only file:line references,
 *   never secret values).
 *
 * agent-secret-scan (AOS-SEC-003) — Secret-leak scanner ingest.
 *
 * The scan runs in CI (needs git). The secret-history-scan workflow scans the
 * tree and POSTs findings here as {file, line, type} — NO secret values. On any
 * finding this opens a single tier-3 incident with all locations and the
 * rotation runbook linked, deduped so a persistent leak is one task.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "secret-leak-scanner";
const ROTATION_RUNBOOK = "docs/AGENTIC_OS.md#secret-rotation-runbook";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

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

  const body = await req.json().catch(() => ({}));
  const findings: Finding[] = Array.isArray(body.findings) ? body.findings.map(sanitize) : [];

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
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
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
