/**
 * Daily AI quota and spend guard for user-facing AI endpoints (WP1 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * Call guardAi() after auth and tier resolution and BEFORE the model call. It
 * takes one call from the caller's daily quota through consume_ai_quota
 * (migration 20261001000001), which also refuses when the provider's kill
 * switch is on, provider_budgets.paused is set, or today's provider spend is
 * over its ceiling. After the model answers - or fails after being billed -
 * call settle() with what it cost.
 *
 * FAILURE POLICY
 *   - A refusal from the RPC is final: 429 with code quota_exceeded or
 *     ai_budget_paused. The budget refusals fail CLOSED; that is their point.
 *   - The RPC itself failing (network, migration not applied yet) fails OPEN
 *     with a logged warning, the same rule rateLimit.ts and the itinerary
 *     monthly count follow: never block a user on our own outage. One thing is
 *     still checked on that path: provider_budgets.paused, read directly,
 *     because that table already exists and a paused budget must not be
 *     bypassed by the new table being missing.
 *
 * No imports from esm.sh, so this module and its tests run offline.
 */

import { getClientIp } from "./clientIp.ts";
import { type AnthropicUsage, recordProviderUsage } from "./providerUsage.ts";

export type AiFeature =
  | "nlp-search"
  | "support-chat"
  | "discover-chat"
  | "itinerary"
  | "personalized-recs";

/** Must match an ai_global_budget / provider_budgets row. */
export type AiProvider = "anthropic" | "openai" | "google";

/** 'anon' is a caller with no verified user. */
export type QuotaTier = "anon" | "free" | "insider" | "vip";

export type AiDenialCode = "quota_exceeded" | "ai_budget_paused";

/**
 * Pre-call cost estimate per feature, USD. Only used to refuse a call that
 * would cross a dollar cap; the real cost is settled afterwards. Rough is
 * fine: these came from the token counts each feature typically sends.
 */
export const AI_EST_USD: Record<AiFeature, number> = {
  "nlp-search": 0.002,
  "support-chat": 0.01,
  "discover-chat": 0.05,
  "itinerary": 0.15,
  "personalized-recs": 0.002,
};

export type QuotaDecision =
  | { kind: "allow"; limit: number | null; remaining: number | null; calls: number | null }
  | { kind: "deny"; code: AiDenialCode; reason: string; limit: number | null }
  | { kind: "fail_open"; detail: string };

export type QuotaDenial = Extract<QuotaDecision, { kind: "deny" }>;

/** 'user:<id>' for a verified user, else 'ip:<addr>'. Never 'global:'. */
export function quotaSubject(userId: string | null | undefined, ip: string): string {
  return userId ? `user:${userId}` : `ip:${ip || "unknown"}`;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Turn the consume_ai_quota RPC result into a decision. Pure. */
export function interpretConsume(
  data: unknown,
  error: { message?: string; code?: string } | null | undefined,
): QuotaDecision {
  if (error) {
    return { kind: "fail_open", detail: `${error.code ?? "no code"}: ${error.message ?? "rpc error"}` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { kind: "fail_open", detail: "unexpected RPC result shape" };
  }
  const r = data as Record<string, unknown>;
  if (r.allowed === true) {
    return {
      kind: "allow",
      limit: numOrNull(r.limit),
      remaining: numOrNull(r.remaining),
      calls: numOrNull(r.calls),
    };
  }
  if (r.allowed === false) {
    const code: AiDenialCode = r.code === "ai_budget_paused" ? "ai_budget_paused" : "quota_exceeded";
    return {
      kind: "deny",
      code,
      reason: typeof r.reason === "string" ? r.reason : code,
      limit: numOrNull(r.limit),
    };
  }
  return { kind: "fail_open", detail: "RPC result has no allowed flag" };
}

/** The tier to suggest when a quota runs out; null when there is none above. */
export function nextTier(tier: QuotaTier): "free" | "insider" | "vip" | null {
  switch (tier) {
    case "anon":
      return "free";
    case "free":
      return "insider";
    case "insider":
      return "vip";
    default:
      return null;
  }
}

/** Seconds until the next midnight in America/Chicago, where the quota day ends. */
export function secondsUntilCentralMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Intl renders midnight as hour 24 in some runtimes.
  const hour = get("hour") % 24;
  const elapsed = hour * 3600 + get("minute") * 60 + get("second");
  // A DST change day is 23 or 25 hours; an hour off on two nights a year is
  // fine for a Retry-After.
  return Math.max(60, 86_400 - elapsed);
}

const MESSAGES: Record<AiDenialCode, string> = {
  quota_exceeded: "You've reached today's limit for this feature. It resets at midnight Central.",
  ai_budget_paused: "AI features are paused for the rest of the day. Please try again tomorrow.",
};

/** The JSON body of a refusal. Pure. */
export function denialBody(
  decision: QuotaDenial,
  feature: AiFeature,
  tier: QuotaTier,
  now: Date,
): Record<string, unknown> {
  const upgrade = decision.code === "quota_exceeded" ? nextTier(tier) : null;
  return {
    error: decision.reason === "kill_switch"
      ? "AI features are paused right now. Please try again later."
      : MESSAGES[decision.code],
    code: decision.code,
    reason: decision.reason,
    feature,
    tier,
    limit: decision.limit,
    upgradeHint: upgrade,
    retryAfter: secondsUntilCentralMidnight(now),
  };
}

export function denialResponse(
  decision: QuotaDenial,
  feature: AiFeature,
  tier: QuotaTier,
  headers: Record<string, string>,
  now: Date,
): Response {
  const body = denialBody(decision, feature, tier, now);
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Retry-After": String(body.retryAfter),
    },
  });
}

/** The slice of a supabase-js client this module uses. */
export interface QuotaClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface AiGuardOptions {
  feature: AiFeature;
  provider: AiProvider;
  tier: QuotaTier;
  /** Verified user id, or null for an anonymous caller (keyed by IP). */
  userId: string | null;
  /** Defaults to AI_EST_USD[feature]. */
  estUsd?: number;
  /** provider_usage.meta.source. Defaults to the feature. */
  source?: string;
  /** CORS headers for the 429. */
  headers?: Record<string, string>;
  now?: Date;
}

export interface SettleArgs {
  costUsd: number;
  model?: string;
  usage?: AnthropicUsage;
  /** Non-PII context for provider_usage.meta. */
  extra?: Record<string, unknown>;
}

export interface AiGuardAllowed {
  ok: true;
  subject: string;
  /** Today's call cap, or null when there is none (or the check failed open). */
  limit: number | null;
  remaining: number | null;
  failedOpen: boolean;
  /**
   * Book what the call cost: ai_usage_daily (subject and global rows) and
   * provider_usage. Never throws. A second call is ignored.
   */
  settle(args: SettleArgs): Promise<void>;
}

export interface AiGuardDenied {
  ok: false;
  decision: QuotaDenial;
  response: Response;
}

export type AiGuardResult = AiGuardAllowed | AiGuardDenied;

async function providerPaused(supabase: QuotaClient, provider: AiProvider): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("provider_budgets")
      .select("paused")
      .eq("provider", provider)
      .maybeSingle();
    if (error) return false;
    return (data as { paused?: boolean } | null)?.paused === true;
  } catch {
    return false;
  }
}

export async function guardAi(
  supabase: QuotaClient,
  req: Request,
  opts: AiGuardOptions,
): Promise<AiGuardResult> {
  const now = opts.now ?? new Date();
  const subject = quotaSubject(opts.userId, getClientIp(req));
  const estUsd = opts.estUsd ?? AI_EST_USD[opts.feature];

  let decision: QuotaDecision;
  try {
    const { data, error } = await supabase.rpc("consume_ai_quota", {
      p_subject: subject,
      p_tier: opts.tier,
      p_feature: opts.feature,
      p_provider: opts.provider,
      p_est_usd: estUsd,
    });
    decision = interpretConsume(data, error);
  } catch (err) {
    decision = { kind: "fail_open", detail: err instanceof Error ? err.message : String(err) };
  }

  if (decision.kind === "fail_open") {
    console.warn(`[ai-quota] consume_ai_quota failed for ${opts.feature}, allowing: ${decision.detail}`);
    if (await providerPaused(supabase, opts.provider)) {
      decision = { kind: "deny", code: "ai_budget_paused", reason: "provider_paused", limit: null };
    }
  }

  if (decision.kind === "deny") {
    return {
      ok: false,
      decision,
      response: denialResponse(decision, opts.feature, opts.tier, opts.headers ?? {}, now),
    };
  }

  let settled = false;
  const failedOpen = decision.kind === "fail_open";
  return {
    ok: true,
    subject,
    limit: decision.kind === "allow" ? decision.limit : null,
    remaining: decision.kind === "allow" ? decision.remaining : null,
    failedOpen,
    async settle(args: SettleArgs): Promise<void> {
      if (settled) return;
      settled = true;
      const costUsd = Number.isFinite(args.costUsd) ? Math.max(0, args.costUsd) : 0;
      if (costUsd === 0) return;

      const settleDaily = (async () => {
        try {
          const { error } = await supabase.rpc("settle_ai_usage", {
            p_subject: subject,
            p_feature: opts.feature,
            p_provider: opts.provider,
            p_cost_usd: costUsd,
          });
          if (error) {
            console.error(
              `[ai-quota] settle_ai_usage failed for ${opts.feature} ($${costUsd.toFixed(6)}): ${error.message ?? error.code}`,
            );
          }
        } catch (err) {
          console.error(
            `[ai-quota] settle_ai_usage threw for ${opts.feature}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      })();

      await Promise.all([
        settleDaily,
        recordProviderUsage(supabase, {
          provider: opts.provider,
          costUsd,
          source: opts.source ?? opts.feature,
          model: args.model,
          usage: args.usage,
          extra: { ...(args.extra ?? {}), tier: opts.tier },
        }),
      ]);
    },
  };
}
