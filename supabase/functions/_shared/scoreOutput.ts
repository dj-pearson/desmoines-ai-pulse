/**
 * scoreOutput — LLM-judge quality/safety evaluation (AOS-GOV-004).
 *
 * Scores agent-generated, user-facing content against a per-category rubric
 * BEFORE it is sent/published. Below the per-category threshold, the caller
 * should downgrade the work to a tier-2 human review instead of auto-executing
 * (`evaluateAndGate` does this for you). Every score is recorded for analysis.
 *
 * Bounded by construction — a single lightweight (Haiku) call with a hard
 * max_tokens cap: it cannot loop, and its cost is recorded so it is itself
 * budgeted.
 */

// deno-lint-ignore no-explicit-any
type Client = any;
import { buildLightweightClaudeRequest, getClaudeHeaders, getAIConfig } from "./aiConfig.ts";
import { createAgentTask } from "./agentTasks.ts";

/** Per-category pass threshold (0..100). */
export const QUALITY_THRESHOLD: Record<string, number> = {
  nurture: 72,
  support: 78,
  manage: 78,
  prospect: 65,
  governance: 80,
  security: 85,
  dev: 75,
  maintain: 70,
};
export const DEFAULT_QUALITY_THRESHOLD = 72;

/** Per-category rubric the judge scores against. */
const RUBRIC: Record<string, string> = {
  nurture:
    "brand voice (warm, local, on-brand for a Des Moines city guide), factual accuracy, no spammy/clickbait language, grammar, and clear value to the reader",
  support:
    "helpfulness (actually resolves the ask), correct + safe information, empathetic professional tone, and no overpromising",
  manage:
    "accuracy of account/campaign facts, professional tone, and no unauthorized commitments",
  prospect:
    "relevance of the prospect/lead, accuracy of enrichment, and no fabricated details",
  governance: "policy correctness, clarity, and no unsafe recommendations",
  security: "accuracy, no leaking sensitive detail, and appropriate severity",
  dev: "correctness, safety of the proposed change, and clear rationale",
  maintain: "correctness of the data change and no collateral damage",
};
const DEFAULT_RUBRIC = "accuracy, safety, clarity, and appropriateness for a public audience";

const EVAL_MAX_TOKENS = 400; // hard cap — bounds cost, prevents runaway output

export interface QualityScore {
  score: number; // 0..100
  passed: boolean;
  threshold: number;
  dimensions: Record<string, number> | null;
  reasons: string;
  evalCostUsd: number;
}

export interface ScoreOutputArgs {
  agentKey: string;
  category: string;
  content: string;
  runId?: string | null;
  taskId?: string | null;
}

function thresholdFor(category: string): number {
  return QUALITY_THRESHOLD[category] ?? DEFAULT_QUALITY_THRESHOLD;
}

/** Approximate Haiku cost from token counts (fail-safe: never zero for tokens). */
function haikuCost(inTok: number, outTok: number): number {
  return (inTok / 1_000_000) * 0.8 + (outTok / 1_000_000) * 4;
}

export async function scoreOutput(supabase: Client, args: ScoreOutputArgs): Promise<QualityScore> {
  const threshold = thresholdFor(args.category);
  const rubric = RUBRIC[args.category] ?? DEFAULT_RUBRIC;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("CLAUDE_API") ?? Deno.env.get("ANTHROPIC_API_KEY");

  // Fail-safe default: if we can't evaluate, DON'T silently pass — return a
  // failing score so the content is gated to a human rather than auto-shipped.
  let result: QualityScore = {
    score: 0,
    passed: false,
    threshold,
    dimensions: null,
    reasons: "evaluation unavailable — gated to human review",
    evalCostUsd: 0,
  };

  if (!apiKey) {
    await record(supabase, args, result);
    return result;
  }

  try {
    const prompt =
      `You are a strict quality/safety reviewer for a Des Moines city-guide platform. ` +
      `Score the following ${args.category} content against this rubric: ${rubric}. ` +
      `Return ONLY compact JSON: {"score": 0-100, "dimensions": {"accuracy":0-100,"tone":0-100,"safety":0-100}, "reasons": "one sentence"}.\n\n` +
      `CONTENT:\n${args.content.slice(0, 4000)}`;

    const body = await buildLightweightClaudeRequest(
      [{ role: "user", content: prompt }],
      { supabaseUrl, supabaseKey, customMaxTokens: EVAL_MAX_TOKENS, customTemperature: 0 },
    );
    const headers = await getClaudeHeaders(apiKey, supabaseUrl, supabaseKey);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`judge API ${res.status}`);
    const data = await res.json();
    const text: string = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    const usage = data.usage ?? {};
    const evalCostUsd = haikuCost(usage.input_tokens ?? 0, usage.output_tokens ?? 0);

    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    result = {
      score,
      passed: score >= threshold,
      threshold,
      dimensions: parsed.dimensions ?? null,
      reasons: String(parsed.reasons ?? "").slice(0, 500),
      evalCostUsd,
    };
  } catch (err) {
    console.warn(`[scoreOutput:${args.agentKey}] eval failed (gating to human):`, err instanceof Error ? err.message : String(err));
    // keep the fail-safe failing result
  }

  await record(supabase, args, result);
  return result;
}

async function record(supabase: Client, args: ScoreOutputArgs, result: QualityScore): Promise<void> {
  try {
    await supabase.from("agent_quality_scores").insert({
      agent_key: args.agentKey,
      category: args.category,
      score: result.score,
      threshold: result.threshold,
      passed: result.passed,
      dimensions: result.dimensions,
      reasons: result.reasons,
      content_preview: args.content.slice(0, 280),
      run_id: args.runId ?? null,
      task_id: args.taskId ?? null,
      eval_cost_usd: result.evalCostUsd,
    });
  } catch (err) {
    console.warn("[scoreOutput] failed to record score:", err instanceof Error ? err.message : String(err));
  }
}

export interface GateResult {
  gated: boolean; // true => downgraded to human, do NOT auto-execute
  score: QualityScore;
  taskId?: string;
}

/**
 * Score content and gate on it: if it fails the category threshold, downgrade to
 * a tier-2 human review task and return gated=true. Otherwise gated=false and
 * the caller may proceed with send/publish.
 */
export async function evaluateAndGate(
  supabase: Client,
  args: ScoreOutputArgs & { title?: string },
): Promise<GateResult> {
  const score = await scoreOutput(supabase, args);
  if (score.passed) return { gated: false, score };

  const task = await createAgentTask(supabase, {
    agentKey: args.agentKey,
    // deno-lint-ignore no-explicit-any
    category: args.category as any,
    title: args.title ?? `Low-quality output for review (${score.score}/${score.threshold})`,
    confidence: 0,
    forceTier: 2,
    payload: {
      reason: "quality_below_threshold",
      score: score.score,
      threshold: score.threshold,
      reasons: score.reasons,
      content_preview: args.content.slice(0, 500),
    },
  }).catch(() => ({ ok: false, task: undefined }));

  return { gated: true, score, taskId: task?.task?.id };
}
