/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (aggregate counts only; no per-user rows leave the function).
 *
 * executive-digest (AOS-MANAGE-001) - daily/weekly KPI roll-up.
 *
 * One digest across content, users, revenue, support and ops, so the owner does
 * not assemble KPIs by hand. agent-ops-digest (AOS-CORE-010) already owns the
 * ops detail - tier-1 auto-resolutions, open tasks by tier, agent failures - so
 * this summarises ops rather than restating it.
 *
 * THE DESIGN CONSTRAINT IS AC3: every number sourced from a real table, no
 * fabrication. That is harder here than it sounds, because two of the KPI
 * families this story asks for have no table to read:
 *
 *     payments           ABSENT (WEB-QA-018)  -> revenue: MRR, invoices
 *     agent_escalations  ABSENT (WEB-QA-018)  -> ops: escalation counts
 *
 * A digest printing "Payments recorded: 0" for a table that does not exist would
 * be fabricating, and it is the exact failure WEB-BE-032 already fixed once in
 * agent-ops-digest: `count ?? 0` made "read nothing" and "nothing is wrong"
 * print identically. So every metric here is Counted (number | null), an absent
 * table or a failed read renders as UNAVAILABLE with its reason, and
 * composeDigest puts the warning at the TOP when any section is blind.
 *
 * Empty is not absent, and the difference is reported: user_subscriptions EXISTS
 * with 0 rows, so its counts legitimately read 0.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { notifyOps } from "../_shared/notifyOps.ts";
import {
  composeDigest,
  renderDelta,
  renderMetric,
  type Counted,
  type Metric,
} from "../_shared/digestFormat.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

const SITE = (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") || "https://desmoinesinsider.com")
  .replace(/\/+$/, "");
const DAY = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

async function countRows(
  supabase: Client,
  table: string,
  build?: (q: unknown) => unknown,
): Promise<{ value: Counted; error: { message?: string; code?: string } | null }> {
  try {
    let q: unknown = supabase.from(table).select("*", { count: "exact", head: true });
    if (build) q = build(q);
    const { count, error } = await (q as Promise<{
      count: number | null;
      error: { message?: string; code?: string } | null;
    }>);
    if (error) return { value: null, error };
    return { value: count ?? 0, error: null };
  } catch (e) {
    return { value: null, error: { message: (e as Error).message } };
  }
}

async function metric(
  supabase: Client,
  label: string,
  table: string,
  source: string,
  build?: (q: unknown) => unknown,
  adminPath?: string,
): Promise<Metric> {
  const { value, error } = await countRows(supabase, table, build);
  const m: Metric = { label, value, source, adminPath };
  // 42P01 is "relation does not exist". Permanent, and a different thing for the
  // reader than a query that happened to fail today.
  if (error && error.code === "42P01") m.absent = table + " does not exist";
  return m;
}

async function buildDigest(supabase: Client, windowDays: number) {
  const since = new Date(Date.now() - windowDays * DAY).toISOString();
  const prevSince = new Date(Date.now() - 2 * windowDays * DAY).toISOString();
  // deno-lint-ignore no-explicit-any
  const newIn = (q: any) => q.gte("created_at", since);
  // deno-lint-ignore no-explicit-any
  const prevIn = (q: any) => q.gte("created_at", prevSince).lt("created_at", since);

  const [
    events, restaurants, attractions, articles, eventsPrev,
    members, membersNew,
    subs, subsNew, payments,
    contact, tickets,
    jobRuns, escalations,
  ] = await Promise.all([
    metric(supabase, "New events", "events", "events.created_at", newIn, "/admin/content"),
    metric(supabase, "New restaurants", "restaurants", "restaurants.created_at", newIn, "/admin/content"),
    metric(supabase, "New attractions", "attractions", "attractions.created_at", newIn, "/admin/content"),
    metric(supabase, "New articles", "articles", "articles.created_at", newIn, "/admin/content"),
    metric(supabase, "New events (previous window)", "events", "events.created_at", prevIn),
    metric(supabase, "Total members", "profiles", "profiles", undefined, "/admin/users"),
    metric(supabase, "New members", "profiles", "profiles.created_at", newIn, "/admin/users"),
    metric(supabase, "Subscriptions", "user_subscriptions", "user_subscriptions", undefined, "/admin/subscriptions"),
    metric(supabase, "New subscriptions", "user_subscriptions", "user_subscriptions.created_at", newIn),
    metric(supabase, "Payments recorded", "payments", "payments.created_at", newIn),
    metric(supabase, "Contact submissions", "contact_submissions", "contact_submissions.created_at", newIn, "/admin/inbox"),
    metric(supabase, "Support tickets", "support_tickets", "support_tickets.created_at", newIn, "/admin/support"),
    metric(supabase, "Automation runs", "automation_job_runs", "automation_job_runs.created_at", newIn, "/admin/system"),
    metric(supabase, "Agent escalations", "agent_escalations", "agent_escalations.created_at", newIn),
  ]);

  const sections: Array<[string, Metric[]]> = [
    ["CONTENT", [events, restaurants, attractions, articles]],
    ["USERS", [members, membersNew]],
    ["REVENUE", [subs, subsNew, payments]],
    ["SUPPORT", [contact, tickets]],
    ["OPS", [jobRuns, escalations]],
  ];

  const lines: string[] = [];
  for (const [title, ms] of sections) {
    lines.push("-- " + title + " --");
    for (const m of ms) lines.push(renderMetric(m, SITE));
  }
  lines.push("-- TRENDS --");
  lines.push(renderDelta("New events vs previous " + windowDays + "d", events.value, eventsPrev.value));
  lines.push("-- NOTE --");
  lines.push("Ops detail (auto-resolutions, open tasks by tier, agent failures) is in agent-ops-digest.");

  const { body, degraded } = composeDigest(lines);
  const metrics = sections.flatMap(([, ms]) => ms);
  return {
    body,
    degraded,
    windowDays,
    sourced: metrics.filter((m) => m.value !== null).length,
    total: metrics.length,
    absent: metrics.filter((m) => m.absent).map((m) => m.label),
  };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const cors = getCorsHeaders(req.headers.get("origin") ?? undefined);
  const denied = await requireAdminOrApiKey(req, cors);
  if (denied) return denied;

  // Daily is the default, so the Job Health re-run button - which posts
  // {manual:true} and nothing else - gets the safe mode (see progress.txt).
  let windowDays = 1;
  try {
    const body = await req.json();
    if (body && typeof body.windowDays === "number" && body.windowDays > 0 && body.windowDays <= 30) {
      windowDays = Math.floor(body.windowDays);
    }
  } catch {
    // no body, or not JSON
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const result = await runJob("executive-digest", async (ctx) => {
    const digest = await buildDigest(supabase, windowDays);
    ctx.processed(digest.sourced);
    ctx.failed(digest.total - digest.sourced);
    ctx.meta({
      window_days: digest.windowDays,
      sourced: digest.sourced,
      of: digest.total,
      degraded_sections: digest.degraded,
      absent_tables: digest.absent,
    });

    await notifyOps(supabase, {
      severity: "low",
      title: "Executive digest (" + windowDays + "d)",
      body: digest.body,
      dedupeKey: "executive-digest:" + windowDays + "d",
      capWindowMs: windowDays * DAY,
    });

    return digest;
  });

  return json(result, result.ok ? 200 : 500, cors);
});
