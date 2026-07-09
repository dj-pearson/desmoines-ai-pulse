/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (sends a summary email; no user data returned).
 *
 * agent-ops-digest (AOS-CORE-010)
 *
 * Once a day, email ops a batched digest: tier-1 auto-resolutions in the last
 * 24h, open-task counts by tier, overdue tasks, and agent failures. This is the
 * low-severity, non-immediate half of notifyOps (immediate alerts fire on
 * escalations/failures; the quiet stuff is batched here).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function count(supabase: Client, table: string, apply: (q: Client) => Client): Promise<number> {
  const { count } = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  return count ?? 0;
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

  const result = await runJob("ops-digest", async (ctx) => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const [autoResolved, openTier1, openTier2, openTier3, overdue, failures24h, openCves] = await Promise.all([
      count(supabase, "agent_tasks", (q) => q.eq("tier", 1).eq("status", "resolved").gte("updated_at", dayAgo)),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 1).in("status", ["escalated", "assigned", "auto_resolving"])),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 2).in("status", ["escalated", "assigned"])),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 3).in("status", ["escalated", "assigned"])),
      count(supabase, "agent_tasks", (q) => q.not("sla_due_at", "is", null).lt("sla_due_at", nowIso).in("status", ["open", "escalated", "assigned"])),
      count(supabase, "automation_job_runs", (q) => q.in("status", ["failed", "failure"]).gte("started_at", dayAgo)),
      // Security posture: open CVE remediation tasks (AOS-SEC-002).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "dependency-cve-scanner").in("status", ["open", "escalated", "assigned", "auto_resolving"])),
    ]);

    const openHuman = openTier2 + openTier3;
    const body = [
      `Tier-1 auto-resolutions (24h): ${autoResolved}`,
      `Open human tasks: ${openHuman} (tier-2 ${openTier2}, tier-3 ${openTier3})`,
      `Open tier-1 (in-flight): ${openTier1}`,
      `Overdue tasks: ${overdue}`,
      `Agent failures (24h): ${failures24h}`,
      `Open dependency CVEs: ${openCves}`,
    ].join("\n");

    // Date-keyed dedupe so a re-run same day coalesces instead of double-sending.
    const dayKey = nowIso.slice(0, 10);
    const notify = await notifyOps(supabase, {
      severity: "high", // ensure the digest actually emails
      title: "Daily ops digest",
      body,
      dedupeKey: `ops-digest:${dayKey}`,
      capWindowMs: 20 * 60 * 60 * 1000, // ~one per day
    });

    ctx.meta({ autoResolved, openHuman, overdue, failures24h, openCves, notify });
    ctx.processed(1);
    return { autoResolved, openHuman, openTier1, overdue, failures24h, openCves, notify };
  });

  return json({ ok: result.ok, ...(result.result ?? {}), status: result.status }, result.ok ? 200 : 500, corsHeaders);
});
