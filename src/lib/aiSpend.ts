/**
 * Today's AI spend, summarised for the admin tile (WP1 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * Reads the 'global:<provider>' rows of ai_usage_daily, which consume_ai_quota
 * and settle_ai_usage keep per feature per Central date, against
 * ai_global_budget. Pure, so it is tested without a database.
 */

export interface AiUsageRow {
  subject: string;
  feature: string;
  calls: number | string | null;
  cost_usd: number | string | null;
}

export interface AiBudgetRow {
  provider: string;
  daily_usd: number | string;
  kill_switch: boolean;
}

export interface ProviderPauseRow {
  provider: string;
  paused: boolean;
}

/** Why a provider is or is not taking calls right now. */
export type AiProviderState = "kill_switch" | "paused" | "over_budget" | "ok";

export interface AiProviderSpend {
  provider: string;
  dailyUsd: number;
  spentUsd: number;
  calls: number;
  /** spent / daily budget; null when the budget is 0. */
  ratio: number | null;
  state: AiProviderState;
}

export interface AiFeatureSpend {
  feature: string;
  provider: string;
  calls: number;
  costUsd: number;
}

export interface AiSpendSummary {
  totalUsd: number;
  totalCalls: number;
  providers: AiProviderSpend[];
  features: AiFeatureSpend[];
}

const GLOBAL_PREFIX = "global:";

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

export function summarizeAiSpend(
  usage: AiUsageRow[],
  budgets: AiBudgetRow[],
  pauses: ProviderPauseRow[] = [],
): AiSpendSummary {
  const features: AiFeatureSpend[] = [];
  const byProvider = new Map<string, { spent: number; calls: number }>();

  for (const row of usage) {
    // Subject rows (user:, ip:) are per-caller; the global rows already sum
    // them, so counting both would double every number.
    if (!row.subject.startsWith(GLOBAL_PREFIX)) continue;
    const provider = row.subject.slice(GLOBAL_PREFIX.length);
    const calls = num(row.calls);
    const costUsd = num(row.cost_usd);
    features.push({ feature: row.feature, provider, calls, costUsd });
    const agg = byProvider.get(provider) ?? { spent: 0, calls: 0 };
    agg.spent += costUsd;
    agg.calls += calls;
    byProvider.set(provider, agg);
  }

  const paused = new Set(pauses.filter((p) => p.paused).map((p) => p.provider));
  const providerNames = new Set<string>([...budgets.map((b) => b.provider), ...byProvider.keys()]);

  const providers: AiProviderSpend[] = [...providerNames].map((provider) => {
    const budget = budgets.find((b) => b.provider === provider);
    const dailyUsd = budget ? num(budget.daily_usd) : 0;
    const agg = byProvider.get(provider) ?? { spent: 0, calls: 0 };
    const ratio = dailyUsd > 0 ? agg.spent / dailyUsd : null;
    // Same order consume_ai_quota checks them in.
    const state: AiProviderState = budget?.kill_switch
      ? "kill_switch"
      : paused.has(provider)
        ? "paused"
        : budget && agg.spent >= dailyUsd
          ? "over_budget"
          : "ok";
    return { provider, dailyUsd, spentUsd: agg.spent, calls: agg.calls, ratio, state };
  });

  providers.sort((a, b) => b.spentUsd - a.spentUsd || a.provider.localeCompare(b.provider));
  features.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

  return {
    totalUsd: providers.reduce((s, p) => s + p.spentUsd, 0),
    totalCalls: providers.reduce((s, p) => s + p.calls, 0),
    providers,
    features,
  };
}

/** $0.0042 reads better than $0.00 for the sub-cent numbers a quiet day has. */
export function formatUsd(v: number): string {
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
