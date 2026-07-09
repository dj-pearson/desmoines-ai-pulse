/**
 * agentRuntime — the shared agent runtime harness (AOS-CORE-003).
 *
 * One reusable Claude tool-calling loop so every agent gets the same guardrails
 * — per-run cost/token cap, wall-clock timeout, bounded retries with backoff,
 * and per-action audit logging — instead of copy-pasting (and drifting) loops.
 *
 * Two entry points:
 *   • runToolLoop(...)  — the pure, ungated loop. Used by user-facing tool-using
 *                         endpoints (e.g. discover-chat) that must NOT be gated
 *                         by the autonomous kill switch.
 *   • runAgent(config)  — the autonomous entry. Honors the agent_registry
 *                         `enabled` flag and the global kill switch, records the
 *                         run in the unified ledger (AOS-CORE-002), audits every
 *                         tool action (AOS-CORE-003 / AOS-GOV-002), then delegates
 *                         to runToolLoop. Defaults to the latest Claude model per
 *                         CLAUDE.md (from ai_configuration).
 *
 * Backward-compat: this module only reads config and writes additive audit/ledger
 * rows. It changes no edge-function request/response shape.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig } from "./aiConfig.ts";
import { runAgent as recordAgentRun } from "./agentRun.ts";
import { requiresApproval, createApproval } from "./agentApprovals.ts";
import { createAgentTask } from "./agentTasks.ts";
import { notifyOps } from "./notifyOps.ts";
import { writeAgentAudit } from "./auditLog.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ─── Tool + message shapes ───────────────────────────────────────────────────

export interface ToolSchema {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  cache_control?: any;
}

export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface ActionRecord {
  step: number;
  toolName: string;
  input: Record<string, unknown>;
  outputSummary: string;
}

// ─── Rough per-model pricing (USD per 1M tokens) for the cost cap ────────────
// Approximate; used only to enforce costCapUsd, not for billing.
function priceFor(model: string): { inPerM: number; outPerM: number } {
  const m = model.toLowerCase();
  if (m.includes("opus")) return { inPerM: 15, outPerM: 75 };
  if (m.includes("haiku")) return { inPerM: 0.8, outPerM: 4 };
  // sonnet / fable / default
  return { inPerM: 3, outPerM: 15 };
}

// ─── The pure tool-calling loop ──────────────────────────────────────────────

export interface RunToolLoopParams {
  apiKey: string;
  model: string;
  anthropicVersion: string;
  /** System prompt as plain text (wrapped in a cache-controlled block when caching). */
  system: string;
  tools: ToolSchema[];
  messages: ChatMessage[];
  /** Executes a tool call and returns its raw result (JSON-serializable). */
  dispatch: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
  maxTokensPerStep?: number;
  costCapUsd?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** When the model calls this tool, the loop ends and returns its input. */
  finalToolName?: string;
  enableCaching?: boolean;
  /** Called after each tool executes — the audit hook. Best-effort. */
  onAction?: (a: ActionRecord) => Promise<void> | void;
}

export type StopReason =
  | "final_tool"
  | "end_turn"
  | "max_steps"
  | "cost_cap"
  | "timeout"
  | "error";

export interface RunToolLoopResult {
  ok: boolean;
  stopReason: StopReason;
  finalToolInput?: Record<string, unknown>;
  text: string;
  steps: number;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  messages: ChatMessage[];
  error?: string;
}

// deno-lint-ignore no-explicit-any
type ContentBlock = any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runToolLoop(p: RunToolLoopParams): Promise<RunToolLoopResult> {
  const {
    apiKey,
    model,
    anthropicVersion,
    system,
    tools,
    dispatch,
    maxSteps = 6,
    maxTokensPerStep = 1024,
    costCapUsd = Infinity,
    timeoutMs = 60_000,
    maxRetries = 2,
    finalToolName,
    enableCaching = false,
    onAction,
  } = p;

  const price = priceFor(model);
  const conversation: ChatMessage[] = [...p.messages];
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let text = "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": anthropicVersion,
  };
  if (enableCaching) headers["anthropic-beta"] = "prompt-caching-2024-07-31";

  const systemBlocks = enableCaching
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;
  const toolsBody = enableCaching
    ? tools.map((t, i) =>
        i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
      )
    : tools;

  let step = 0;
  for (; step < maxSteps; step++) {
    if (Date.now() - startedAt > timeoutMs) {
      return done("timeout");
    }
    if (costUsd >= costCapUsd) {
      return done("cost_cap");
    }

    const body = {
      model,
      max_tokens: maxTokensPerStep,
      system: systemBlocks,
      tools: toolsBody,
      messages: conversation,
    };

    // Call with bounded retries on transient (429 / 5xx / network) failures.
    let reply: { content: ContentBlock[]; stop_reason?: string; usage?: Record<string, number> } | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.max(1000, timeoutMs - (Date.now() - startedAt))),
        });
        if (res.ok) {
          reply = await res.json();
          break;
        }
        lastErr = `Claude API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
        // Retry only transient statuses.
        if (res.status !== 429 && res.status < 500) {
          return fail(lastErr);
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
      if (attempt < maxRetries) await sleep(500 * Math.pow(2, attempt));
    }
    if (!reply) return fail(lastErr || "Claude API unreachable");

    // Accumulate usage → cost.
    const u = reply.usage ?? {};
    inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    outputTokens += u.output_tokens ?? 0;
    costUsd = (inputTokens / 1_000_000) * price.inPerM + (outputTokens / 1_000_000) * price.outPerM;

    conversation.push({ role: "assistant", content: reply.content });
    for (const b of reply.content) {
      if (b.type === "text" && typeof b.text === "string") text += b.text;
    }

    // Terminating tool?
    if (finalToolName) {
      const finalCall = reply.content.find(
        (b: ContentBlock) => b.type === "tool_use" && b.name === finalToolName,
      );
      if (finalCall) {
        return done("final_tool", (finalCall.input as Record<string, unknown>) ?? {});
      }
    }

    const toolUses = reply.content.filter((b: ContentBlock) => b.type === "tool_use");
    if (toolUses.length === 0) {
      return done("end_turn");
    }

    const toolResults: ContentBlock[] = [];
    for (const call of toolUses) {
      let output: unknown;
      try {
        output = await dispatch(call.name ?? "", (call.input as Record<string, unknown>) ?? {});
      } catch (err) {
        output = { error: err instanceof Error ? err.message : String(err) };
      }
      const serialized = JSON.stringify(output);
      if (onAction) {
        try {
          await onAction({
            step,
            toolName: call.name ?? "",
            input: (call.input as Record<string, unknown>) ?? {},
            outputSummary: serialized.slice(0, 500),
          });
        } catch (err) {
          console.warn("[agentRuntime] onAction hook failed:", err instanceof Error ? err.message : String(err));
        }
      }
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: serialized });
    }
    conversation.push({ role: "user", content: toolResults });
  }

  return done("max_steps");

  function done(stopReason: StopReason, finalToolInput?: Record<string, unknown>): RunToolLoopResult {
    return {
      ok: true,
      stopReason,
      finalToolInput,
      text,
      steps: step,
      usage: { inputTokens, outputTokens, costUsd },
      messages: conversation,
    };
  }
  function fail(error: string): RunToolLoopResult {
    return {
      ok: false,
      stopReason: "error",
      text,
      steps: step,
      usage: { inputTokens, outputTokens, costUsd },
      messages: conversation,
      error,
    };
  }
}

// ─── The autonomous agent entry ──────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
  /**
   * If set to a guarded action type (see agentApprovals.GUARDED_ACTIONS), the
   * runtime queues a human approval and does NOT execute the tool — the model
   * gets back a "queued for approval" result. Approval executes it later.
   */
  actionType?: string;
}

export interface RunAgentConfig {
  agentKey: string;
  systemPrompt: string;
  tools: AgentTool[];
  /** Convenience: seed a single user message. Ignored if `messages` is given. */
  userMessage?: string;
  messages?: ChatMessage[];
  maxSteps?: number;
  /** Per-run cost ceiling (USD). Defaults to 0.50. */
  costCapUsd?: number;
  model?: string;
  timeoutMs?: number;
  finalToolName?: string;
  /** Reuse a service-role client instead of building one. */
  client?: SupabaseClient;
  /** Anthropic key override; else ANTHROPIC_API_KEY / CLAUDE_API from env. */
  apiKey?: string;
}

export interface RunAgentResult {
  status: "success" | "failure" | "disabled";
  disabledReason?: string;
  stopReason?: StopReason;
  finalToolInput?: Record<string, unknown>;
  text?: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  runId?: string | null;
  error?: string;
}

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

interface MonthlyBudgetState {
  budgetUsd: number | null;
  spendMtd: number;
  category: string;
}

/** Month-to-date spend + budget for an agent (AOS-GOV-001). Fail-open: on a read
 *  error, report no budget so a metrics hiccup can't wrongly block the agent. */
async function monthlyBudgetState(supabase: SupabaseClient, agentKey: string): Promise<MonthlyBudgetState> {
  try {
    const { data } = await supabase
      .from("agent_month_spend")
      .select("monthly_cost_budget_usd, spend_mtd, category")
      .eq("agent_key", agentKey)
      .maybeSingle();
    return {
      budgetUsd: data?.monthly_cost_budget_usd ?? null,
      spendMtd: Number(data?.spend_mtd ?? 0),
      category: data?.category ?? "governance",
    };
  } catch (err) {
    console.warn(`[agentRuntime:${agentKey}] budget read failed (treating as no budget):`, err instanceof Error ? err.message : String(err));
    return { budgetUsd: null, spendMtd: 0, category: "governance" };
  }
}

/** Record the budget breach: a failure run, a tier-2 task, and an ops alert. */
async function handleBudgetBreach(supabase: SupabaseClient, agentKey: string, budget: MonthlyBudgetState): Promise<void> {
  const detail = `${agentKey} hit its monthly budget: $${budget.spendMtd.toFixed(2)} of $${budget.budgetUsd}.`;
  try {
    const nowIso = new Date().toISOString();
    await supabase.from("automation_job_runs").insert({
      job_name: agentKey,
      agent_key: agentKey,
      status: "failure",
      finished_at: nowIso,
      error: "monthly budget exceeded",
      summary: detail,
      metadata: { reason: "budget", spendMtd: budget.spendMtd, budgetUsd: budget.budgetUsd },
    });
  } catch (err) {
    console.warn(`[agentRuntime:${agentKey}] failed to record budget-breach run:`, err instanceof Error ? err.message : String(err));
  }
  // deno-lint-ignore no-explicit-any
  await createAgentTask(supabase as any, {
    // deno-lint-ignore no-explicit-any
    agentKey,
    category: budget.category as any,
    title: `Budget exceeded: ${agentKey}`,
    confidence: 0,
    forceTier: 2,
    payload: { reason: "monthly_budget_exceeded", spendMtd: budget.spendMtd, budgetUsd: budget.budgetUsd },
  }).catch((e) => console.warn(`[agentRuntime:${agentKey}] budget task failed:`, e?.message ?? e));
  // deno-lint-ignore no-explicit-any
  await notifyOps(supabase as any, {
    severity: "high",
    title: `Agent over budget: ${agentKey}`,
    body: detail,
    dedupeKey: `budget:${agentKey}`,
  }).catch((e) => console.warn(`[agentRuntime:${agentKey}] budget notify failed:`, e?.message ?? e));
}


/**
 * Run an autonomous agent through the guarded runtime. Returns `disabled`
 * (without acting) when the global kill switch is on or the agent is disabled
 * in the registry.
 */
export async function runAgent(config: RunAgentConfig): Promise<RunAgentResult> {
  const supabase = config.client ?? serviceClient();
  if (!supabase) {
    return { status: "failure", error: "no service-role Supabase client available" };
  }

  // The global kill switch + per-agent enabled gate (AOS-CORE-009) is enforced
  // centrally by recordAgentRun below: when paused it records a SKIPPED run and
  // never calls the loop, and we map that to `disabled` at the end.
  const apiKey = config.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY") ?? Deno.env.get("CLAUDE_API");
  if (!apiKey) {
    return { status: "failure", error: "no Anthropic API key configured" };
  }

  // Latest Claude model per CLAUDE.md: the DB-managed default, overridable.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const aiCfg = await getAIConfig(supabaseUrl, supabaseKey);
  const model = config.model ?? aiCfg.default_model;

  const messages: ChatMessage[] = config.messages ??
    [{ role: "user", content: config.userMessage ?? "Begin." }];

  // Monthly per-agent budget hard stop (AOS-GOV-001). Checked BEFORE any work,
  // so a breach can't partially corrupt state. On breach: record a failure run
  // (reason=budget), open a tier-2 task, notify ops, and return without acting.
  const budget = await monthlyBudgetState(supabase, config.agentKey);
  if (budget.budgetUsd != null && budget.spendMtd >= budget.budgetUsd) {
    await handleBudgetBreach(supabase, config.agentKey, budget);
    return {
      status: "failure",
      error: `monthly budget exceeded ($${budget.spendMtd.toFixed(2)} of $${budget.budgetUsd})`,
    };
  }

  // Correlates the ledger row with the audit-log rows for this run.
  const runCorrelation = crypto.randomUUID();
  const toolByName = new Map(config.tools.map((t) => [t.name, t]));

  const ledger = await recordAgentRun(
    config.agentKey,
    async (ctx) => {
      ctx.meta({ runCorrelation, model });

      const loop = await runToolLoop({
        apiKey,
        model,
        anthropicVersion: aiCfg.anthropic_version,
        system: config.systemPrompt,
        tools: config.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        messages,
        maxSteps: config.maxSteps ?? 8,
        costCapUsd: config.costCapUsd ?? 0.5,
        timeoutMs: config.timeoutMs ?? 60_000,
        finalToolName: config.finalToolName,
        dispatch: async (name, input) => {
          const tool = toolByName.get(name);
          if (!tool) return { error: `unknown tool: ${name}` };
          // Human-in-the-loop gate (AOS-CORE-007): a guarded action is queued
          // for approval and NOT executed. The model is told it's pending.
          if (requiresApproval(tool.actionType)) {
            const approval = await createApproval(supabase, {
              agentKey: config.agentKey,
              actionType: tool.actionType!,
              payload: input,
            });
            return {
              status: "queued_for_approval",
              approval_id: approval.approvalId ?? null,
              note: `Action "${tool.actionType}" requires human approval before it runs. It has been queued; do not retry.`,
            };
          }
          return await tool.execute(input);
        },
        onAction: async (a) => {
          ctx.processed(1);
          // Low-level tool-call trace.
          try {
            await supabase.from("agent_action_log").insert({
              agent_key: config.agentKey,
              run_correlation: runCorrelation,
              step: a.step,
              tool_name: a.toolName,
              action: "tool_call",
              input: a.input,
              output_summary: a.outputSummary,
            });
          } catch (err) {
            console.warn(`[agentRuntime:${config.agentKey}] trace write failed:`, err instanceof Error ? err.message : String(err));
          }
          // Immutable action audit (AOS-GOV-002).
          await writeAgentAudit(supabase, {
            agentKey: config.agentKey,
            runId: runCorrelation,
            actionType: `tool:${a.toolName}`,
            before: a.input,
            after: { output_summary: a.outputSummary },
          });
        },
      });

      ctx.tokens(loop.usage.inputTokens + loop.usage.outputTokens);
      ctx.cost(loop.usage.costUsd);
      ctx.summary(`stop=${loop.stopReason} steps=${loop.steps} cost=$${loop.usage.costUsd.toFixed(4)}`);
      if (!loop.ok) ctx.failed(1);

      // Surface the loop outcome out of the ledger wrapper.
      if (!loop.ok) throw new Error(loop.error ?? "agent loop failed");
      return loop;
    },
    { client: supabase },
  );

  // Paused: recordAgentRun short-circuited to a skipped run without acting.
  if (ledger.status === "skipped") {
    return { status: "disabled", disabledReason: "paused (global kill switch or agent disabled)", runId: ledger.runId };
  }

  const loop = ledger.result;
  if (!ledger.ok || !loop) {
    return { status: "failure", error: ledger.error ?? "agent run failed", runId: ledger.runId };
  }

  return {
    status: "success",
    stopReason: loop.stopReason,
    finalToolInput: loop.finalToolInput,
    text: loop.text,
    usage: loop.usage,
    runId: ledger.runId,
  };
}
