/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (can pause individual agents via agent_registry.enabled on
 *   a hard budget breach — reversible; never pauses the whole product).
 *
 * agent-api-watchdog (AOS-MAINT-006) — external-API cost & quota watchdog.
 *
 * Hourly, reads month-to-date spend per provider (provider_spend_mtd: ledger
 * cost attributed via agent_registry.provider + provider_usage reports) and
 * compares against provider_budgets:
 *   - spend ≥ soft_pct of budget → mark the provider throttled + ops alert
 *     (graceful — the per-agent budget hard-stop in runAgent already slows
 *     spend; this flags it and warns before the hard line).
 *   - spend ≥ hard_pct → pause the affected agents (set agent_registry.enabled
 *     = false — the same mechanism the kill switch uses, so runAgent records
 *     their runs as skipped) and record which ones, so it can auto-recover.
 *     The rest of the product is untouched.
 *   - spend drops back below hard_pct → re-enable the agents this watchdog
 *     paused (auto-recovery, e.g. at month rollover); below soft → un-throttle.
 * Every pause/resume is audited and reversible.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { notifyOps } from "../_shared/notifyOps.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "api-cost-watchdog";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface ProviderRow {
  provider: string;
  monthly_budget_usd: number;
  soft_pct: number;
  hard_pct: number;
  throttled: boolean;
  paused: boolean;
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
    const nowIso = new Date().toISOString();
    const { data: rows, error: rowsError } = await supabase.from("provider_spend_mtd").select("*");
    // RAISE. No providers means nothing is throttled and nothing is paused, and
    // the run reports that as a success - so a failed read silently switches off
    // the spend guard this agent exists to be (WEB-BE-032 AC2).
    if (rowsError) throw new Error(`provider_spend_mtd read failed: ${rowsError.message}`);
    const providers = (rows ?? []) as (ProviderRow & { spend_mtd: number })[];

    let throttledCount = 0;
    let pausedCount = 0;
    let recoveredCount = 0;
    const alerts: string[] = [];
    const summary: Record<string, unknown> = {};

    for (const p of providers) {
      const budget = Number(p.monthly_budget_usd) || 0;
      if (budget <= 0) continue; // unmonitored
      const spend = Number(p.spend_mtd) || 0;
      const ratio = spend / budget;
      const pct = Math.round(ratio * 100);
      summary[p.provider] = { spend: Math.round(spend * 100) / 100, budget, pct };

      // Agents drawing on this provider (candidates to pause / re-enable).
      const { data: agentRows, error: agentRowsError } = await supabase
        .from("agent_registry")
        .select("agent_key, enabled")
        .eq("provider", p.provider)
        .neq("agent_key", AGENT_KEY); // never pause the watchdog itself
      // Same reasoning: an empty list means a hard budget breach pauses nothing.
    if (agentRowsError) throw new Error(`agent_registry read failed: ${agentRowsError.message}`);
    const agents = (agentRows ?? []) as { agent_key: string; enabled: boolean }[];

      if (ratio >= p.hard_pct) {
        // Hard breach — pause the affected (still-enabled) agents.
        const toPause = agents.filter((a) => a.enabled).map((a) => a.agent_key);
        if (toPause.length > 0) {
          await supabase.from("agent_registry").update({ enabled: false }).in("agent_key", toPause);
          await writeAgentAudit(supabase, {
            agentKey: AGENT_KEY,
            actionType: "pause_agents_budget_breach",
            targetRef: `provider:${p.provider}`,
            before: { paused_agents: [], spend, budget },
            after: { paused_agents: toPause, reason: `hard budget breach (${pct}%)`, reversible: true },
          });
          pausedCount += toPause.length;
        }
        await supabase
          .from("provider_budgets")
          .update({ throttled: true, paused: true, auto_paused_agents: toPause.length ? toPause : undefined, note: `hard breach ${pct}% at ${nowIso}`, updated_at: nowIso })
          .eq("provider", p.provider);
        alerts.push(`${p.provider}: HARD breach ${pct}% ($${spend.toFixed(2)}/$${budget}) — paused ${toPause.length} agent(s)`);
      } else if (ratio >= p.soft_pct) {
        // Soft breach — throttle + warn. Also recover any prior hard-pause.
        recoveredCount += await recover(supabase, p, nowIso);
        if (!p.throttled) {
          await supabase.from("provider_budgets").update({ throttled: true, note: `soft breach ${pct}% at ${nowIso}`, updated_at: nowIso }).eq("provider", p.provider);
        }
        throttledCount++;
        alerts.push(`${p.provider}: approaching budget ${pct}% ($${spend.toFixed(2)}/$${budget}) — throttling`);
      } else {
        // Healthy — auto-recover paused agents and clear throttle.
        recoveredCount += await recover(supabase, p, nowIso);
        if (p.throttled || p.paused) {
          await supabase.from("provider_budgets").update({ throttled: false, paused: false, note: `healthy ${pct}% at ${nowIso}`, updated_at: nowIso }).eq("provider", p.provider);
        }
      }
    }

    if (alerts.length > 0) {
      const hard = alerts.some((a) => a.includes("HARD"));
      await notifyOps(supabase, {
        severity: hard ? "high" : "medium",
        title: `API budget: ${alerts.length} provider(s) over threshold`,
        body: alerts.map((a) => `- ${a}`).join("\n"),
        dedupeKey: "api-budget-alert",
        capWindowMs: 60 * 60 * 1000,
      });
    }

    ctx.processed(providers.length);
    ctx.summary(`api-cost: ${throttledCount} throttled, ${pausedCount} agent(s) paused, ${recoveredCount} recovered`);
    ctx.meta({ providers: summary, throttledCount, pausedCount, recoveredCount });
    return { throttledCount, pausedCount, recoveredCount, providers: summary };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});

// Re-enable agents this watchdog auto-paused for a provider now back under the
// hard line. Reversible + audited. Returns the count re-enabled.
async function recover(supabase: Client, p: { provider: string }, nowIso: string): Promise<number> {
  const { data: budget, error: budgetError } = await supabase
    .from("provider_budgets")
    .select("auto_paused_agents")
    .eq("provider", p.provider)
    .maybeSingle();
  // Fails safe - no recovery means no extra spend - but silently, and the
  // symptom is agents that were auto-paused staying paused forever with
  // nothing saying why (WEB-BE-032 AC3).
  if (budgetError) {
    console.warn(`[api-cost-watchdog] budget read failed for ${p.provider}; skipping recovery: ${budgetError.message}`);
    return 0;
  }
  const paused = (budget?.auto_paused_agents ?? []) as string[];
  if (paused.length === 0) return 0;
  await supabase.from("agent_registry").update({ enabled: true }).in("agent_key", paused);
  await supabase.from("provider_budgets").update({ auto_paused_agents: [], updated_at: nowIso }).eq("provider", p.provider);
  await writeAgentAudit(supabase, {
    agentKey: AGENT_KEY,
    actionType: "resume_agents_budget_recovered",
    targetRef: `provider:${p.provider}`,
    before: { paused_agents: paused },
    after: { paused_agents: [], reason: "spend back under hard threshold" },
  });
  await notifyOps(supabase, {
    severity: "medium",
    title: `API budget recovered: ${p.provider}`,
    body: `Re-enabled ${paused.length} agent(s): ${paused.join(", ")}`,
    dedupeKey: `api-budget-recovered:${p.provider}`,
    capWindowMs: 60 * 60 * 1000,
  });
  return paused.length;
}
