/**
 * Which Claude model every edge function calls, and how its request is shaped.
 *
 * THE ONE PLACE A MODEL ID LIVES. Before this module there were three sources
 * of truth and none of them was the one the operator could change: literal ids
 * in individual functions (several retired, so those calls 404'd), the
 * `ai_configuration` default_model / lightweight_model rows, and the
 * `ai_model_configurations` table that only the admin UI read. The operator
 * set DEFAULT_AI_MODEL as an edge-function secret so the model could move
 * without a code change, and nothing read it.
 *
 * Now:
 *   defaultModel()      DEFAULT_AI_MODEL, else FALLBACK_MODEL (logged once).
 *   lightweightModel()  LIGHTWEIGHT_AI_MODEL, else defaultModel().
 *
 * The secret wins over the ai_configuration model rows; those rows are no
 * longer read for the model. scripts/check-edge-model-pins.mjs fails the build
 * on a Claude model id literal anywhere else under supabase/functions.
 *
 * REQUEST SHAPE. Decided per RESOLVED model, never per call site. Production
 * runs DEFAULT_AI_MODEL=claude-sonnet-5-5 and LIGHTWEIGHT_AI_MODEL=
 * claude-haiku-5-5; both reject parameters older models accepted, and the
 * rejection is an HTTP 400. shapeClaudeRequest() is the single place that
 * knows which model takes what:
 *   - temperature / top_p / top_k: kept only for LEGACY models (below). Opus
 *     4.7+, Opus 5/5.5, Sonnet 5/5.5, Haiku 5.5 and Fable 5.x reject them
 *     (Sonnet 5.5 and Haiku 5.5 reject any non-default value).
 *   - thinking {type:"enabled", budget_tokens} or {type:"disabled"}: always
 *     dropped. Both are 400s on the current models; omitting `thinking` runs
 *     the model's default (adaptive on Sonnet 5.5 / Opus 5.5).
 *   - output_config.effort: dropped for legacy models that error on it
 *     (Haiku 4.5, Sonnet 4.5 and older); kept for Opus 4.5/4.6, Sonnet 4.6
 *     and every current model.
 *   - max_tokens: raised to MIN_MAX_TOKENS_ADAPTIVE on non-legacy models,
 *     because adaptive thinking spends from the same budget: a 20-token (or
 *     1000-token) cap can stop with stop_reason "max_tokens" after a thinking
 *     block and before any text. Output is billed as generated, so a higher
 *     cap costs nothing unless it is used.
 *   - { lightweight: true }: adds output_config.effort "low" (unless the
 *     caller set one) so cheap, high-volume calls think briefly. The effort
 *     rule above still applies, so a legacy model that errors on effort never
 *     receives it.
 *   - assistant prefill (last message role "assistant"; rejected from 4.6 on)
 *     and forced tool_choice
 *     ({type:"any"} / {type:"tool"}) on a non-legacy model THROW rather than
 *     being rewritten: each changes what the caller asked for, so the call site
 *     must be fixed (toolChoiceFor() gives the per-model choice).
 *
 * Because adaptive thinking can put a `thinking` block FIRST in `content`,
 * reading `content[0].text` is a bug on these models. Read replies with
 * extractClaudeText() from aiConfig.ts, which finds the first text block.
 */

/**
 * Used only when DEFAULT_AI_MODEL is unset. No date suffix: the alias tracks
 * the current snapshot.
 */
export const FALLBACK_MODEL = "claude-sonnet-5-5";

/**
 * Models that still accept sampling parameters and forced tool_choice: the
 * Claude 3.x line and Claude 4 / 4.1 / 4.5 / 4.6 (any tier, with or without a
 * date suffix). Everything else - including ids this module has never seen -
 * is treated as current, so an unknown future id never gets a parameter that
 * might be a 400. Being wrong in that direction loses a temperature setting;
 * being wrong the other way loses the whole call.
 */
const LEGACY_MODEL_RE =
  /^claude-(?:(?:instant|1|2|3|3-5|3-7)(?:-|$)|(?:haiku|sonnet|opus)-4(?:-[0-6])?(?:-\d{8})?$)/;

/** Legacy models that accept output_config.effort; the rest of the legacy set (Haiku 4.5 among them) error on it. */
const EFFORT_LEGACY_RE = /^claude-(?:opus-4-5|opus-4-6|sonnet-4-6)(?:-\d{8})?$/;

/** The 4.6 models are legacy for sampling but already reject assistant prefill. */
const PREFILL_REJECTED_LEGACY_RE = /^claude-(?:haiku|sonnet|opus)-4-6(?:-\d{8})?$/;

/** Floor for max_tokens on models that think by default. */
export const MIN_MAX_TOKENS_ADAPTIVE = 4096;

let warnedUnset = false;

function envModel(name: string): string | null {
  const v = Deno.env.get(name);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/** The model for everything that is not explicitly cheap/high-volume. */
export function defaultModel(): string {
  const fromEnv = envModel("DEFAULT_AI_MODEL");
  if (fromEnv) return fromEnv;
  if (!warnedUnset) {
    warnedUnset = true;
    console.warn(`[ai] DEFAULT_AI_MODEL unset; using ${FALLBACK_MODEL}`);
  }
  return FALLBACK_MODEL;
}

/** The model for cheap, high-volume calls. Falls back to defaultModel(). */
export function lightweightModel(): string {
  return envModel("LIGHTWEIGHT_AI_MODEL") ?? defaultModel();
}

/** True for models that accept temperature/top_p/top_k and forced tool_choice. */
export function isLegacyModel(model: string): boolean {
  return LEGACY_MODEL_RE.test(String(model ?? "").trim());
}

/**
 * tool_choice for a call that needs one specific tool. Legacy models get the
 * forced form; current models reject it with a 400, so they get `auto` and the
 * caller's prompt must name the tool.
 */
export function toolChoiceFor(
  model: string,
  toolName: string,
): { type: "tool"; name: string } | { type: "auto" } {
  return isLegacyModel(model) ? { type: "tool", name: toolName } : { type: "auto" };
}

/** Raised for a request shape that would be a 400 and must be fixed at the call site. */
export class ClaudeRequestShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeRequestShapeError";
  }
}

/**
 * A Messages API request body. Loosely typed on purpose: the shaper removes
 * and adds fields, so returning the caller's own type would be a lie.
 */
// deno-lint-ignore no-explicit-any
export type Body = Record<string, any>;

/**
 * Make a Messages API body valid for its model. Returns a new object; the
 * input is not modified. See the module comment for each rule.
 */
export function shapeClaudeRequest(
  body: Body,
  opts: { lightweight?: boolean } = {},
): Body {
  const out: Body = { ...body };
  const model = String(out.model ?? "");
  const legacy = isLegacyModel(model);

  if (opts.lightweight && out.output_config?.effort === undefined) {
    out.output_config = { ...(out.output_config ?? {}), effort: "low" };
  }

  if (!legacy) {
    delete out.temperature;
    delete out.top_p;
    delete out.top_k;
    if (typeof out.max_tokens === "number" && out.max_tokens < MIN_MAX_TOKENS_ADAPTIVE) {
      out.max_tokens = MIN_MAX_TOKENS_ADAPTIVE;
    }
  }

  if (legacy && out.output_config?.effort !== undefined && !EFFORT_LEGACY_RE.test(model)) {
    const { effort: _drop, ...rest } = out.output_config;
    if (Object.keys(rest).length > 0) out.output_config = rest;
    else delete out.output_config;
  }

  const thinkingType = out.thinking?.type;
  if (thinkingType === "enabled" || thinkingType === "disabled") delete out.thinking;

  const messages = Array.isArray(out.messages) ? out.messages : [];
  const prefillRejected = !legacy || PREFILL_REJECTED_LEGACY_RE.test(model);
  if (prefillRejected && messages.length > 0 && messages[messages.length - 1]?.role === "assistant") {
    throw new ClaudeRequestShapeError(
      `assistant prefill is rejected by ${model}; ask for the format in the prompt instead`,
    );
  }

  const tc = out.tool_choice?.type;
  if (!legacy && (tc === "any" || tc === "tool")) {
    throw new ClaudeRequestShapeError(
      `tool_choice ${tc} is rejected by ${model}; use toolChoiceFor() and name the tool in the prompt`,
    );
  }

  return out;
}
