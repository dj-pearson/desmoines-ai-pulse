/**
 * agentRun — the unified agent run ledger wrapper (AOS-CORE-002).
 *
 * The evolution of jobRunner for autonomous agents: it opens a row in
 * automation_job_runs linked to a registered agent (agent_key), lets the run
 * report items processed / escalated / failed, tokens, cost and a summary, and
 * closes the row with the resolved outcome.
 *
 *   const res = await runAgent('backfill-images', async (ctx) => {
 *     ctx.processed(updated);
 *     ctx.escalated(needsHuman);
 *     ctx.tokens(0);
 *     ctx.cost(0);
 *     ctx.summary(`updated ${updated}, escalated ${needsHuman}`);
 *     return { updated };
 *   });
 *
 * Fail-open contract: every ledger write is best-effort. A ledger/database
 * hiccup must NEVER crash the isolate or fail the agent's actual work — it logs
 * a warning and the run proceeds. If fn() throws, runAgent records a 'failure'
 * row and re-surfaces the outcome in the result (it does not re-throw).
 *
 * Outcome resolution (status enum: running|success|failure|escalated|skipped):
 *   - fn threw                          -> 'failure'
 *   - ctx.skip() called                 -> 'skipped'
 *   - items escalated but none processed -> 'escalated'
 *   - otherwise                          -> 'success' (items_failed still recorded)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { agentPaused } from "./agentGuards.ts";
import { notifyOps } from "./notifyOps.ts";

export type AgentRunStatus =
  | "running"
  | "success"
  | "failure"
  | "escalated"
  | "skipped";

export interface AgentRunContext {
  /** Add to the items-processed counter. */
  processed: (n: number) => void;
  /** Add to the items-escalated-to-humans counter. */
  escalated: (n: number) => void;
  /** Add to the items-failed counter. */
  failed: (n: number) => void;
  /** Add to the tokens-used counter. */
  tokens: (n: number) => void;
  /** Add to the accumulated cost (USD). */
  cost: (usd: number) => void;
  /** Set the human-readable run summary (last call wins). */
  summary: (text: string) => void;
  /** Mark the run as skipped (e.g. agent disabled, nothing to do). */
  skip: (reason?: string) => void;
  /** Merge keys into the run's metadata jsonb. */
  meta: (m: Record<string, unknown>) => void;
}

export interface RunAgentOptions {
  /** Reuse an existing service-role client instead of building one. */
  client?: SupabaseClient;
}

export interface AgentRunResult<T> {
  ok: boolean;
  status: AgentRunStatus;
  runId: string | null;
  result?: T;
  error?: string;
  itemsProcessed: number;
  itemsEscalated: number;
  itemsFailed: number;
  tokensUsed: number;
  costUsd: number;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function runAgent<T>(
  agentKey: string,
  fn: (ctx: AgentRunContext) => Promise<T>,
  options: RunAgentOptions = {},
): Promise<AgentRunResult<T>> {
  const supabase = options.client ?? serviceClient();

  let itemsProcessed = 0;
  let itemsEscalated = 0;
  let itemsFailed = 0;
  let tokensUsed = 0;
  let costUsd = 0;
  let summaryText: string | null = null;
  let skipped = false;
  let skipReason: string | null = null;
  let metadata: Record<string, unknown> = {};

  const ctx: AgentRunContext = {
    processed: (n) => { itemsProcessed += n; },
    escalated: (n) => { itemsEscalated += n; },
    failed: (n) => { itemsFailed += n; },
    tokens: (n) => { tokensUsed += n; },
    cost: (usd) => { costUsd += usd; },
    summary: (text) => { summaryText = text; },
    skip: (reason) => { skipped = true; skipReason = reason ?? null; },
    meta: (m) => { metadata = { ...metadata, ...m }; },
  };

  // Global/per-agent pause gate (AOS-CORE-009): stop before doing any work and
  // record a SKIPPED run so the paused gap is visible in the ledger. fn() is
  // never called while paused.
  if (supabase) {
    const pause = await agentPaused(supabase, agentKey);
    if (pause.paused) {
      let skipRunId: string | null = null;
      try {
        const nowIso = new Date().toISOString();
        const { data } = await supabase
          .from("automation_job_runs")
          .insert({
            job_name: agentKey,
            agent_key: agentKey,
            status: "skipped",
            finished_at: nowIso,
            summary: `paused: ${pause.reason}`,
            metadata: { pausedReason: pause.reason },
          })
          .select("id")
          .single();
        skipRunId = data?.id ?? null;
      } catch (err) {
        console.warn(`[agentRun:${agentKey}] failed to record skipped run:`, err instanceof Error ? err.message : String(err));
      }
      return {
        ok: true,
        status: "skipped",
        runId: skipRunId,
        itemsProcessed: 0,
        itemsEscalated: 0,
        itemsFailed: 0,
        tokensUsed: 0,
        costUsd: 0,
      };
    }
  }

  // Open the run row (best-effort).
  let runId: string | null = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from("automation_job_runs")
        .insert({ job_name: agentKey, agent_key: agentKey, status: "running" })
        .select("id")
        .single();
      runId = data?.id ?? null;
    } catch (err) {
      console.warn(`[agentRun:${agentKey}] failed to open run row:`, err instanceof Error ? err.message : String(err));
    }
  }

  let error: string | undefined;
  let result: T | undefined;
  try {
    result = await fn(ctx);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error(`[agentRun:${agentKey}] run failed:`, error);
  }

  const status: AgentRunStatus = error
    ? "failure"
    : skipped
      ? "skipped"
      : itemsEscalated > 0 && itemsProcessed === 0
        ? "escalated"
        : "success";

  if (skipReason) metadata = { ...metadata, skipReason };

  // Close the run row (best-effort).
  if (supabase && runId) {
    try {
      await supabase
        .from("automation_job_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          items_processed: itemsProcessed,
          items_failed: itemsFailed,
          items_escalated: itemsEscalated,
          tokens_used: tokensUsed,
          cost_usd: costUsd,
          error: error ?? null,
          summary: summaryText,
          metadata,
        })
        .eq("id", runId);
    } catch (err) {
      console.warn(`[agentRun:${agentKey}] failed to close run row:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Immediate, coalesced failure notification (AOS-CORE-010). Best-effort:
  // notifyOps never throws, and even if it did the catch keeps it from
  // affecting the agent's result.
  if (error && supabase) {
    try {
      await notifyOps(supabase, {
        severity: "high",
        title: `Agent failed: ${agentKey}`,
        body: `${agentKey} run failed: ${error}`,
        dedupeKey: `agent-failure:${agentKey}`,
      });
    } catch (err) {
      console.warn(`[agentRun:${agentKey}] failure notify failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return {
    ok: !error,
    status,
    runId,
    result,
    error,
    itemsProcessed,
    itemsEscalated,
    itemsFailed,
    tokensUsed,
    costUsd,
  };
}
