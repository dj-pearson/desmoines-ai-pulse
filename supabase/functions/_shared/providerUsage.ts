/**
 * Record what a paid provider call cost, so spend is visible to the two
 * controls that already exist and currently see nothing (AOS-MANAGE-005).
 *
 * ── WHAT WAS ACTUALLY MISSING ────────────────────────────────────────────────
 *
 * The cost-governance chain is fully built: provider_budgets holds five real
 * budgets, provider_spend_mtd sums a ledger half and a reported half, and
 * api-cost-watchdog throttles at soft_pct and pauses agents at hard_pct. Both
 * halves of that view are zero by construction:
 *
 *   ledger    sum(automation_job_runs.cost_usd) joined on agent_key. Written by
 *             _shared/agentRun.ts, so it works - for agent runs.
 *   reported  sum(provider_usage.cost_usd). public.provider_usage has had NO
 *             WRITER since the table was created in 20260709000033. Not one.
 *
 * Everything that spends money OUTSIDE the agent runtime - generate-itinerary,
 * discover-chat, test-ai-model, ai-crawler - lands in the second column. A
 * paying Insider generates a trip plan, Anthropic bills for it, and both the
 * monthly quota and the budget watchdog compare zero against $100. This module
 * is the write that was missing.
 *
 * ── DO NOT CALL THIS FROM INSIDE runToolLoop ─────────────────────────────────
 *
 * runAgent() wraps runToolLoop() and already books the same tokens into
 * automation_job_runs.cost_usd, which is the LEDGER half of provider_spend_mtd.
 * Recording inside the loop would put every agent run into both halves and the
 * view sums them - the watchdog would pause agents at half the real spend. Call
 * this from the edge function, and only from ones that do NOT go through
 * runAgent.
 *
 * ── FAILING TO RECORD MUST NOT FAIL THE REQUEST ──────────────────────────────
 *
 * The money is already spent by the time this runs; the call the user asked for
 * has already succeeded. Refusing to return an itinerary because a bookkeeping
 * insert failed withholds something they paid for in exchange for nothing. So
 * this logs and continues. The log line is deliberately greppable, because the
 * failure mode it guards against is exactly the one this story is about: spend
 * going unrecorded quietly.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

/** Token counts as the Anthropic Messages API reports them. */
export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** USD per 1M tokens. */
export interface ModelPrice {
  inPerM: number;
  outPerM: number;
}

/**
 * Published list prices, USD per 1M tokens, checked 2026-08-27.
 *
 * Matched longest-prefix-first against the model id, so a dated id
 * (claude-haiku-4-5-20251001) hits the same row as the alias. Order matters:
 * "claude-opus-4-8" has to be tested before "claude-opus", and every 4.x opus
 * before the bare fallback.
 *
 * These are list prices for standard (non-batch, non-cached) tokens. Cache
 * multipliers are applied separately below.
 */
const MODEL_PRICES: Array<[prefix: string, price: ModelPrice]> = [
  ["claude-fable-5", { inPerM: 10, outPerM: 50 }],
  ["claude-opus-5", { inPerM: 5, outPerM: 25 }],
  ["claude-opus-4-8", { inPerM: 5, outPerM: 25 }],
  ["claude-opus-4-7", { inPerM: 5, outPerM: 25 }],
  ["claude-opus-4-6", { inPerM: 5, outPerM: 25 }],
  ["claude-sonnet-5", { inPerM: 2, outPerM: 10 }],
  ["claude-sonnet-4-6", { inPerM: 3, outPerM: 15 }],
  ["claude-haiku-4-5", { inPerM: 1, outPerM: 5 }],
];

/**
 * Fallbacks for a model id that matches no row above - an older release, or a
 * new one this table has not caught up with. Priced at the most expensive
 * member of its family, so an unknown model over-reports rather than
 * under-reports: the watchdog throttling early is recoverable, the watchdog
 * never firing is what AOS-MANAGE-005 exists because of.
 */
const FAMILY_FALLBACKS: Array<[needle: string, price: ModelPrice]> = [
  ["opus", { inPerM: 15, outPerM: 75 }],
  ["haiku", { inPerM: 1, outPerM: 5 }],
  ["sonnet", { inPerM: 3, outPerM: 15 }],
];

/** The last resort: an id with no recognisable family at all. */
const UNKNOWN_PRICE: ModelPrice = { inPerM: 15, outPerM: 75 };

/** Cache reads bill at 0.1x the input rate; cache writes at 1.25x (5m TTL). */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function priceForModel(model: string): ModelPrice {
  const m = (model ?? "").toLowerCase();
  for (const [prefix, price] of MODEL_PRICES) {
    if (m.startsWith(prefix)) return price;
  }
  for (const [needle, price] of FAMILY_FALLBACKS) {
    if (m.includes(needle)) return price;
  }
  return UNKNOWN_PRICE;
}

/**
 * What one Anthropic response cost, in USD.
 *
 * Cached input is priced at its own rate rather than folded into input_tokens
 * at full price - discover-chat marks its system prompt and tool schemas as
 * cacheable and re-reads them on every step of a 6-step loop, so treating a
 * cache read as a fresh input token overstates that function's cost by close to
 * 10x on the cached portion.
 */
export function anthropicCostUsd(model: string, usage: AnthropicUsage): number {
  const p = priceForModel(model);
  const input = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (
    (input / 1_000_000) * p.inPerM +
    (cacheRead / 1_000_000) * p.inPerM * CACHE_READ_MULTIPLIER +
    (cacheWrite / 1_000_000) * p.inPerM * CACHE_WRITE_MULTIPLIER +
    (output / 1_000_000) * p.outPerM
  );
}

export interface RecordUsageArgs {
  /** Must match a provider_budgets.provider row or the spend joins to nothing. */
  provider: string;
  costUsd: number;
  /** Which edge function spent it. Ends up in provider_usage.meta.source. */
  source: string;
  model?: string;
  usage?: AnthropicUsage;
  /** Extra non-PII context. Never put prompt or response text in here. */
  extra?: Record<string, unknown>;
}

/**
 * Insert one provider_usage row. Never throws, never rejects.
 *
 * Returns whether the row landed, so a caller that wants to surface it can -
 * but ignoring the return value is the expected use, and is safe.
 */
export async function recordProviderUsage(
  supabase: Client,
  args: RecordUsageArgs,
): Promise<boolean> {
  const costUsd = Number.isFinite(args.costUsd) ? Math.max(0, args.costUsd) : 0;
  try {
    const { error } = await supabase.from("provider_usage").insert({
      provider: args.provider,
      cost_usd: costUsd,
      meta: {
        source: args.source,
        ...(args.model ? { model: args.model } : {}),
        ...(args.usage
          ? {
            input_tokens: args.usage.input_tokens ?? 0,
            output_tokens: args.usage.output_tokens ?? 0,
            cache_read_input_tokens: args.usage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: args.usage.cache_creation_input_tokens ?? 0,
          }
          : {}),
        ...(args.extra ?? {}),
      },
    });
    if (error) {
      console.error(
        `[provider-usage] UNRECORDED SPEND: ${args.source} spent $${costUsd.toFixed(6)} on ${args.provider} and the insert failed: ${error.message}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[provider-usage] UNRECORDED SPEND: ${args.source} spent $${costUsd.toFixed(6)} on ${args.provider} and the insert threw: ${message}`,
    );
    return false;
  }
}

/**
 * The common case: price an Anthropic response and record it in one call.
 * Safe to call without awaiting the result.
 */
export async function recordAnthropicUsage(
  supabase: Client,
  args: { source: string; model: string; usage: AnthropicUsage; extra?: Record<string, unknown> },
): Promise<boolean> {
  return await recordProviderUsage(supabase, {
    provider: "anthropic",
    costUsd: anthropicCostUsd(args.model, args.usage),
    source: args.source,
    model: args.model,
    usage: args.usage,
    extra: args.extra,
  });
}
