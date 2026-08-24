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
import { composeDigest, renderCount, unavailable, type Counted } from "../_shared/digestFormat.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

/**
 * null means "could not read", which is NOT the same as zero.
 *
 * This returned `count ?? 0` and discarded the error, so a failed query
 * reported the most reassuring possible number. Every headline metric in this
 * digest runs through here: a broken read printed "Open human tasks: 0",
 * "Overdue tasks: 0", "Agent failures (24h): 0", "Open dependency CVEs: 0" -
 * a totally blind digest and a perfectly healthy-looking one are the same
 * eleven lines. The whole point of this function is telling ops what is
 * happening, and its failure mode was to say nothing is.
 *
 * The lint that flags discarded Supabase errors cannot see this: it looks for a
 * destructured `data` without `error`, and this destructures `count`.
 */
async function count(supabase: Client, table: string, apply: (q: Client) => Client): Promise<Counted> {
  const { count, error } = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) {
    console.error(`[ops-digest] count(${table}) failed:`, error.message);
    return null;
  }
  return count ?? 0;
}

const n = renderCount;

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
    const { data: lastBackup, error: backupError } = await supabase
      .from("backup_checks")
      .select("ok, method, backup_age_hours, checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const backupLine = backupError
      ? unavailable("Backups", backupError)
      : lastBackup
      ? `Backups — last check ${lastBackup.ok ? "OK" : "FAILED"} (${lastBackup.method}` +
        `${lastBackup.backup_age_hours != null ? `, ${lastBackup.backup_age_hours}h old` : ""}) at ${String(lastBackup.checked_at).slice(0, 16)}`
      : `Backups — no verification recorded yet`;

    // Data-quality fill-rate trend: latest snapshot per table (AOS-MAINT-004).
    const { data: dqSnaps, error: dqError } = await supabase
      .from("data_quality_snapshots")
      .select("table_name, fill_rate, captured_at")
      .order("captured_at", { ascending: false })
      .limit(30);
    const latestByTable = new Map<string, number>();
    for (const s of (dqSnaps ?? []) as { table_name: string; fill_rate: number }[]) {
      if (!latestByTable.has(s.table_name)) latestByTable.set(s.table_name, s.fill_rate);
    }
    const dqLine = dqError
      ? unavailable("Data quality", dqError)
      : latestByTable.size
      ? `Data quality — fill rate: ${[...latestByTable].map(([t, r]) => `${t} ${Math.round(r * 100)}%`).join(", ")}`
      : `Data quality — no snapshot yet`;

    // Noisiest edge functions by 5xx count over 24h (AOS-MAINT-007).
    const { data: edgeErrs, error: edgeError } = await supabase
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
    // The sharpest of these: a failed read used to print "no 5xx in 24h",
    // reporting the system healthy on the strength of a query that never ran.
    const edgeLine = edgeError
      ? unavailable("Edge functions", edgeError)
      : noisiest.length
      ? `Edge functions — noisiest (5xx/24h): ${noisiest.map(([f, c]) => `${f} ${c}`).join(", ")}`
      : `Edge functions — no 5xx in 24h`;

    // CSAT trend (30d) by channel and by auto-vs-human resolution (AOS-CS-007).
    const csatSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: csatRows, error: csatError } = await supabase
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
    const csatLine = csatError
      ? unavailable("CSAT (30d)", csatError)
      : csat.length
      ? `CSAT (30d) — by channel: ${avgBy("channel")}; by resolution: ${avgBy("resolved_by")}`
      : `CSAT (30d) — no responses yet`;

    // Nurture: onboarding sends + activation over 7d (AOS-NURTURE-002).
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: nurtureRows, error: nurtureError } = await supabase
      .from("nurture_sends")
      .select("status, activated_at, opened_at, clicked_at")
      .eq("agent_key", "onboarding-drip")
      .gte("created_at", weekAgo)
      .limit(5000);
    const nur = (nurtureRows ?? []) as { status: string; activated_at: string | null; opened_at: string | null; clicked_at: string | null }[];
    const nurSent = nur.filter((r) => r.status !== "skipped" && r.status !== "failed").length;
    const nurLine = nurtureError
      ? unavailable("Onboarding (7d)", nurtureError)
      : nur.length
      ? `Onboarding (7d) — ${nurSent} sent, ${nur.filter((r) => r.opened_at).length} opened, ${nur.filter((r) => r.clicked_at).length} clicked, ${nur.filter((r) => r.activated_at).length} activated`
      : `Onboarding (7d) — no sends`;

    // Weekly digest engagement (AOS-NURTURE-004).
    const { data: wdRows, error: wdError } = await supabase.from("nurture_sends").select("status, opened_at, clicked_at").eq("agent_key", "weekly-digest-personal").gte("created_at", weekAgo).limit(5000);
    const wd = (wdRows ?? []) as { status: string; opened_at: string | null; clicked_at: string | null }[];
    const wdSent = wd.filter((r) => r.status !== "skipped" && r.status !== "failed").length;
    const wdLine = wdError
      ? unavailable("Weekly digest (7d)", wdError)
      : wd.length
      ? `Weekly digest (7d) — ${wdSent} sent, ${wd.filter((r) => r.opened_at).length} opened, ${wd.filter((r) => r.clicked_at).length} clicked`
      : `Weekly digest (7d) — no sends`;

    // Milestone recognition (AOS-NURTURE-006).
    const msRecognized = await count(supabase, "user_milestones", (q) => q.gte("created_at", weekAgo));
    const msEmailed = await count(supabase, "user_milestones", (q) => q.eq("emailed", true).gte("created_at", weekAgo));
    const msLine = `Milestones (7d) — ${n(msRecognized)} recognized, ${n(msEmailed)} emailed`;

    // Prospecting: new leads (AOS-PROSPECT-001).
    const newLeads = await count(supabase, "prospect_leads", (q) => q.gte("created_at", weekAgo));
    const openLeads = await count(supabase, "prospect_leads", (q) => q.eq("status", "new"));
    const leadLine = `Prospecting — ${n(newLeads)} new leads (7d), ${n(openLeads)} open`;

    // Subscription nurture (AOS-NURTURE-007).
    const { data: subRows, error: subError } = await supabase.from("nurture_sends").select("kind, status, activated_at").eq("agent_key", "subscription-nurture").gte("created_at", weekAgo).limit(5000);
    const subN = (subRows ?? []) as { kind: string; status: string; activated_at: string | null }[];
    const subSent = subN.filter((r) => r.status !== "skipped" && r.status !== "failed").length;
    const subConv = subN.filter((r) => r.activated_at).length;
    const subLine = subError
      ? unavailable("Subscription nurture (7d)", subError)
      : subN.length
      ? `Subscription nurture (7d) — ${subSent} sent, ${subConv} converted/recovered`
      : `Subscription nurture (7d) — no sends`;

    // Re-engagement (AOS-NURTURE-005).
    const { data: reRows, error: reError } = await supabase.from("nurture_sends").select("status, activated_at").eq("agent_key", "dormant-reengagement").gte("created_at", weekAgo).limit(5000);
    const re = (reRows ?? []) as { status: string; activated_at: string | null }[];
    const reSent = re.filter((r) => r.status !== "skipped" && r.status !== "failed").length;
    const reLine = reError
      ? unavailable("Re-engagement (7d)", reError)
      : re.length
      ? `Re-engagement (7d) — ${reSent} sent, ${re.filter((r) => r.activated_at).length} reactivated`
      : `Re-engagement (7d) — no sends`;

    // Win-back effectiveness (AOS-NURTURE-003).
    const { data: wbRows, error: wbError } = await supabase.from("winback_interventions").select("status").gte("created_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()).limit(5000);
    const wb = (wbRows ?? []) as { status: string }[];
    const wbRetained = wb.filter((r) => r.status === "retained").length;
    const wbChurned = wb.filter((r) => r.status === "churned").length;
    const wbDecided = wbRetained + wbChurned;
    const wbLine = wbError
      ? unavailable("Win-back (60d)", wbError)
      : wb.length
      ? `Win-back (60d) — ${wb.length} interventions, ${wb.filter((r) => r.status === "approval_pending").length} awaiting approval; retained ${wbRetained}/${wbDecided}${wbDecided ? ` (${Math.round((wbRetained / wbDecided) * 100)}%)` : ""}`
      : `Win-back (60d) — none`;

    const openHuman = openTier2 === null || openTier3 === null ? null : openTier2 + openTier3;

    const lines = [
      `Tier-1 auto-resolutions (24h): ${n(autoResolved)}`,
      `Open human tasks: ${n(openHuman)} (tier-2 ${n(openTier2)}, tier-3 ${n(openTier3)})`,
      `Open tier-1 (in-flight): ${n(openTier1)}`,
      `Overdue tasks: ${n(overdue)}`,
      `Agent failures (24h): ${n(failures24h)}`,
      `Open dependency CVEs: ${n(openCves)}`,
      `Compliance — open review items: ${n(openCompliance)}`,
      `CI health — open flaky/slow tasks: ${n(openFlaky)}`,
      `DB health — open suggestions (slow query/index/bloat): ${n(openDbHealth)}`,
      `Uptime — open outage incidents: ${n(openOutages)}`,
      backupLine,
      dqLine,
      `Link health — dead links: ${n(deadLinks)}`,
      edgeLine,
      csatLine,
      nurLine,
      wdLine,
      reLine,
      msLine,
      subLine,
      leadLine,
      wbLine,
    ];

    const { body, degraded } = composeDigest(lines);

    // Date-keyed dedupe so a re-run same day coalesces instead of double-sending.
    const dayKey = nowIso.slice(0, 10);
    const notify = await notifyOps(supabase, {
      severity: "high", // ensure the digest actually emails
      title: "Daily ops digest",
      body,
      dedupeKey: `ops-digest:${dayKey}`,
      capWindowMs: 20 * 60 * 60 * 1000, // ~one per day
    });

    ctx.meta({ autoResolved, openHuman, overdue, failures24h, openCves, openCompliance, openFlaky, openDbHealth, openOutages, deadLinks, degraded, notify });
    ctx.processed(1);
    return { autoResolved, openHuman, openTier1, overdue, failures24h, openCves, openCompliance, openFlaky, openDbHealth, openOutages, deadLinks, degraded, notify };
  });

  return json({ ok: result.ok, ...(result.result ?? {}), status: result.status }, result.ok ? 200 : 500, corsHeaders);
});
