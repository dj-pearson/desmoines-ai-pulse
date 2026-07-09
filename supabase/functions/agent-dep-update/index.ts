/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked control-plane endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the dependency-update workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (opens review tasks; returns priority packages).
 *
 * agent-dep-update (AOS-DEV-003) — dependency-update coordination.
 *
 *   { mode: 'priority' } -> package names that have an OPEN CVE task, so the
 *                           workflow bumps security-affected deps first
 *                           (coordinates with AOS-SEC-002).
 *   { mode: 'majors', majors: [{name,current,latest}] } -> open a deduped
 *                           tier-2 review task per major-version bump (human
 *                           review — majors can break).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";

const AGENT_KEY = "dependency-update-agent";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
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
  const mode = body.mode as string | undefined;

  try {
    // Security-priority packages: those with an open CVE task (AOS-SEC-002).
    if (mode === "priority") {
      const { data } = await supabase
        .from("agent_tasks")
        .select("dedupe_key")
        .eq("agent_key", "dependency-cve-scanner")
        .in("status", ["open", "escalated", "assigned", "auto_resolving"])
        .like("dedupe_key", "cve:%")
        .limit(500);
      const packages = Array.from(
        new Set((data ?? []).map((r: { dedupe_key: string }) => r.dedupe_key.slice("cve:".length))),
      );
      return json({ ok: true, packages }, 200, corsHeaders);
    }

    if (mode === "majors") {
      const majors: Array<{ name: string; current?: string; latest?: string }> = Array.isArray(body.majors) ? body.majors : [];
      const ledger = await runAgent(AGENT_KEY, async (ctx) => {
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
      });
      return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
    }

    return json({ error: "Unknown mode; expected priority|majors" }, 400, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-dep-update] error:", message);
    return json({ error: message }, 500, corsHeaders);
  }
});
