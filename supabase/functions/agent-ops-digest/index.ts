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

    const [autoResolved, openTier1, openTier2, openTier3, overdue, failures24h, openCves, openCompliance, openFlaky, openDbHealth, openOutages, deadLinks] = await Promise.all([
      count(supabase, "agent_tasks", (q) => q.eq("tier", 1).eq("status", "resolved").gte("updated_at", dayAgo)),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 1).in("status", ["escalated", "assigned", "auto_resolving"])),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 2).in("status", ["escalated", "assigned"])),
      count(supabase, "agent_tasks", (q) => q.eq("tier", 3).in("status", ["escalated", "assigned"])),
      count(supabase, "agent_tasks", (q) => q.not("sla_due_at", "is", null).lt("sla_due_at", nowIso).in("status", ["open", "escalated", "assigned"])),
      count(supabase, "automation_job_runs", (q) => q.in("status", ["failed", "failure"]).gte("started_at", dayAgo)),
      // Security posture: open CVE remediation tasks (AOS-SEC-002).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "dependency-cve-scanner").in("status", ["open", "escalated", "assigned", "auto_resolving"])),
      // Compliance posture: open compliance review tasks (AOS-SEC-007).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "compliance-monitor").in("status", ["open", "escalated", "assigned"])),
      // CI health: open flaky-test tasks (AOS-DEV-005).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "ci-health-watcher").in("status", ["open", "escalated", "assigned"])),
      // DB health: open slow-query/index/bloat suggestions (AOS-MAINT-002).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "db-health").in("status", ["open", "escalated", "assigned"])),
      // Uptime: open outage incidents (AOS-MAINT-001).
      count(supabase, "agent_tasks", (q) => q.eq("agent_key", "uptime-monitor").in("status", ["open", "escalated", "assigned"])),
      // Link health: currently dead links (AOS-MAINT-005).
      count(supabase, "content_link_checks", (q) => q.eq("marked_dead", true)),
    ]);

    // Backup status: the most recent verification (AOS-MAINT-003).
    const { data: lastBackup } = await supabase
      .from("backup_checks")
      .select("ok, method, backup_age_hours, checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const backupLine = lastBackup
      ? `Backups — last check ${lastBackup.ok ? "OK" : "FAILED"} (${lastBackup.method}` +
        `${lastBackup.backup_age_hours != null ? `, ${lastBackup.backup_age_hours}h old` : ""}) at ${String(lastBackup.checked_at).slice(0, 16)}`
      : `Backups — no verification recorded yet`;

    // Data-quality fill-rate trend: latest snapshot per table (AOS-MAINT-004).
    const { data: dqSnaps } = await supabase
      .from("data_quality_snapshots")
      .select("table_name, fill_rate, captured_at")
      .order("captured_at", { ascending: false })
      .limit(30);
    const latestByTable = new Map<string, number>();
    for (const s of (dqSnaps ?? []) as { table_name: string; fill_rate: number }[]) {
      if (!latestByTable.has(s.table_name)) latestByTable.set(s.table_name, s.fill_rate);
    }
    const dqLine = latestByTable.size
      ? `Data quality — fill rate: ${[...latestByTable].map(([t, r]) => `${t} ${Math.round(r * 100)}%`).join(", ")}`
      : `Data quality — no snapshot yet`;

    // Noisiest edge functions by 5xx count over 24h (AOS-MAINT-007).
    const { data: edgeErrs } = await supabase
      .from("edge_function_metrics")
      .select("function_name")
      .eq("status_class", "5xx")
      .gte("created_at", dayAgo)
      .limit(5000);
    const noisyCounts = new Map<string, number>();
    for (const e of (edgeErrs ?? []) as { function_name: string }[]) {
      noisyCounts.set(e.function_name, (noisyCounts.get(e.function_name) ?? 0) + 1);
    }
    const noisiest = [...noisyCounts].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const edgeLine = noisiest.length
      ? `Edge functions — noisiest (5xx/24h): ${noisiest.map(([f, c]) => `${f} ${c}`).join(", ")}`
      : `Edge functions — no 5xx in 24h`;

    // CSAT trend (30d) by channel and by auto-vs-human resolution (AOS-CS-007).
    const csatSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: csatRows } = await supabase
      .from("support_csat")
      .select("score, channel, resolved_by")
      .gte("created_at", csatSince)
      .limit(5000);
    const csat = (csatRows ?? []) as { score: number; channel: string | null; resolved_by: string | null }[];
    const avgBy = (key: "channel" | "resolved_by") => {
      const acc = new Map<string, { sum: number; n: number }>();
      for (const r of csat) {
        const k = (r[key] ?? "unknown") as string;
        const a = acc.get(k) ?? { sum: 0, n: 0 };
        a.sum += r.score; a.n += 1; acc.set(k, a);
      }
      return [...acc].map(([k, a]) => `${k} ${(a.sum / a.n).toFixed(1)}★ (n=${a.n})`).join(", ");
    };
    const csatLine = csat.length
      ? `CSAT (30d) — by channel: ${avgBy("channel")}; by resolution: ${avgBy("resolved_by")}`
      : `CSAT (30d) — no responses yet`;

    const openHuman = openTier2 + openTier3;
    const body = [
      `Tier-1 auto-resolutions (24h): ${autoResolved}`,
      `Open human tasks: ${openHuman} (tier-2 ${openTier2}, tier-3 ${openTier3})`,
      `Open tier-1 (in-flight): ${openTier1}`,
      `Overdue tasks: ${overdue}`,
      `Agent failures (24h): ${failures24h}`,
      `Open dependency CVEs: ${openCves}`,
      `Compliance — open review items: ${openCompliance}`,
      `CI health — open flaky/slow tasks: ${openFlaky}`,
      `DB health — open suggestions (slow query/index/bloat): ${openDbHealth}`,
      `Uptime — open outage incidents: ${openOutages}`,
      backupLine,
      dqLine,
      `Link health — dead links: ${deadLinks}`,
      edgeLine,
      csatLine,
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

    ctx.meta({ autoResolved, openHuman, overdue, failures24h, openCves, openCompliance, openFlaky, openDbHealth, openOutages, deadLinks, notify });
    ctx.processed(1);
    return { autoResolved, openHuman, openTier1, overdue, failures24h, openCves, openCompliance, openFlaky, openDbHealth, openOutages, deadLinks, notify };
  });

  return json({ ok: result.ok, ...(result.result ?? {}), status: result.status }, result.ok ? 200 : 500, corsHeaders);
});
