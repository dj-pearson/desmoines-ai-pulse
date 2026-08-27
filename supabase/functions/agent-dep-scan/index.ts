/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked ingest endpoint; auth via requireAdminOrApiKey per
 *   WEB-SEC-001 (the dependency-scan workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: MEDIUM (opens/closes remediation tasks; no destructive action).
 *
 * agent-dep-scan (AOS-SEC-002) — Dependency & CVE scanner ingest.
 *
 * The scan itself runs in CI (npm audit needs Node) — the .github/workflows/
 * dependency-scan.yml workflow runs `npm audit --json` and POSTs it here. This
 * function parses it and manages remediation tasks:
 *   - low/moderate with a fix available -> tier-1 (auto patch, hand to AOS-DEV-003)
 *   - high/critical                     -> tier-2 (human)
 * Idempotent per package (dedupe key cve:<name>), and CVE tasks are auto-closed
 * when the package no longer appears in the audit.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "dependency-cve-scanner";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface AuditVuln {
  name?: string;
  severity?: string; // info|low|moderate|high|critical
  // deno-lint-ignore no-explicit-any
  via?: any[];
  range?: string;
  // deno-lint-ignore no-explicit-any
  fixAvailable?: boolean | Record<string, any>;
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
  const audit = body.audit ?? body; // accept { audit: {...} } or the raw report

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const vulns: Record<string, AuditVuln> = audit?.vulnerabilities ?? {};
    const meta = audit?.metadata?.vulnerabilities ?? {};

    const currentKeys = new Set<string>();
    let opened = 0;
    let tier1 = 0;
    let tier2 = 0;

    for (const [name, v] of Object.entries(vulns)) {
      const severity = (v.severity ?? "low").toLowerCase();
      if (severity === "info") continue;
      const key = `cve:${name}`;
      currentKeys.add(key);

      const fixAvailable = v.fixAvailable === true || (v.fixAvailable && typeof v.fixAvailable === "object");
      const highRisk = severity === "high" || severity === "critical";
      // low/moderate with a fix -> tier-1 auto patch; else -> tier-2 human.
      const forceTier: 1 | 2 = highRisk || !fixAvailable ? 2 : 1;

      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "security",
        title: `${severity} vuln in ${name}${fixAvailable ? " (fix available)" : ""}`,
        confidence: 0,
        forceTier,
        dedupeKey: key,
        payload: {
          package: name,
          severity,
          range: v.range,
          fixAvailable: v.fixAvailable ?? false,
          advisory: Array.isArray(v.via) ? v.via.filter((x) => typeof x === "object").slice(0, 3) : [],
          handoff: forceTier === 1 ? "AOS-DEV-003" : undefined,
        },
      });
      if (task.ok) {
        opened++;
        if (forceTier === 1) tier1++; else tier2++;
        ctx.escalated(forceTier === 2 ? 1 : 0);
      }
    }

    // ── Auto-close CVE tasks whose package no longer appears in the audit ──
    let closed = 0;
    const { data: openTasks, error: openTasksError } = await supabase
      .from("agent_tasks")
      .select("id, dedupe_key")
      .eq("agent_key", AGENT_KEY)
      .in("status", ["open", "escalated", "assigned", "auto_resolving"])
      .like("dedupe_key", "cve:%")
      .limit(2000);
    // DEDUPE GUARD. `open cve: task` is what stops this agent opening a second task for
    // something it has already filed. A dropped error emptied it, so every finding
    // looked new and the queue filled with duplicates of one problem. Logged, not
    // thrown - a duplicate task is noise, and refusing to run at all is worse.
    if (openTasksError) console.error(`open cve: task read failed; duplicate tasks are possible this run: ${openTasksError.message}`);
    for (const t of (openTasks ?? []) as { id: string; dedupe_key: string }[]) {
      if (!currentKeys.has(t.dedupe_key)) {
        const { error } = await supabase
          .from("agent_tasks")
          .update({ status: "resolved", resolution: { reason: "cve_resolved", by: "dependency-cve-scanner" } })
          .eq("id", t.id);
        if (!error) closed++;
      }
    }

    const summary = `open CVEs — critical ${meta.critical ?? 0}, high ${meta.high ?? 0}, moderate ${meta.moderate ?? 0}, low ${meta.low ?? 0}`;
    if ((meta.high ?? 0) > 0 || (meta.critical ?? 0) > 0) {
      await notifyOps(supabase, {
        severity: "high",
        title: `Dependency vulnerabilities found (${(meta.critical ?? 0) + (meta.high ?? 0)} high/critical)`,
        body: summary,
        dedupeKey: "dep-scan-summary",
      });
    }

    ctx.processed(Object.keys(vulns).length);
    ctx.summary(`${summary}; opened ${opened} (t1 ${tier1}, t2 ${tier2}), closed ${closed}`);
    ctx.meta({ opened, tier1, tier2, closed, posture: meta });
    return { opened, tier1, tier2, closed, posture: meta };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
