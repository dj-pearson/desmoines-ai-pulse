/**
 * Agent registry accessor (AOS-CORE-001).
 *
 * Every autonomous agent calls `getAgentConfig(supabase, agentKey)` at the
 * start of a run to read its governance config from the `agent_registry` table:
 * whether it is enabled, the tier-1 confidence threshold below which it must
 * escalate to a human instead of acting, and its monthly cost budget.
 *
 * Agents run with the service-role key, which bypasses RLS, so this reads the
 * admin-only table directly. Results are cached briefly per agent_key so a
 * high-frequency agent doesn't hammer the table every run.
 *
 * Fail-safe: if the row is missing or the read fails, we return a permissive
 * default (enabled, 0.85 threshold, no budget) and log — a registry hiccup
 * should never silently disable a live agent, and callers that want a hard
 * kill-switch can check `found` / set `enabled=false` explicitly.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AgentConfig {
  agentKey: string;
  name: string;
  category: string;
  enabled: boolean;
  tier1ConfidenceThreshold: number;
  monthlyCostBudgetUsd: number | null;
  ownerRole: string;
  scheduleCron: string | null;
  /** 'shadow' = propose + log without executing; 'live' = execute (AOS-GOV-005). */
  mode: "shadow" | "live";
  /** false when no registry row exists for this agent_key (defaults returned). */
  found: boolean;
}

const DEFAULTS = {
  enabled: true,
  tier1ConfidenceThreshold: 0.85,
  monthlyCostBudgetUsd: null as number | null,
  ownerRole: "admin",
  scheduleCron: null as string | null,
  // Fail-safe default: an unregistered/unreadable agent is treated as shadow so
  // it can't take unattended actions before it's known and promoted.
  mode: "shadow" as "shadow" | "live",
};

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const cache = new Map<string, { at: number; config: AgentConfig }>();

/**
 * Read an agent's config from the registry.
 *
 * @param supabase A service-role Supabase client (edge functions already have one).
 * @param agentKey The unique agent_key seeded in agent_registry.
 */
export async function getAgentConfig(
  supabase: SupabaseClient,
  agentKey: string,
): Promise<AgentConfig> {
  const cached = cache.get(agentKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.config;
  }

  let config: AgentConfig;
  try {
    const { data, error } = await supabase
      .from("agent_registry")
      .select(
        "agent_key, name, category, enabled, tier1_confidence_threshold, monthly_cost_budget_usd, owner_role, schedule_cron, mode",
      )
      .eq("agent_key", agentKey)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      console.warn(
        `⚠️ [agentConfig] no registry row for "${agentKey}" — using permissive defaults`,
      );
      config = {
        agentKey,
        name: agentKey,
        category: "maintain",
        ...DEFAULTS,
        found: false,
      };
    } else {
      config = {
        agentKey: data.agent_key,
        name: data.name,
        category: data.category,
        enabled: data.enabled ?? DEFAULTS.enabled,
        tier1ConfidenceThreshold:
          data.tier1_confidence_threshold ?? DEFAULTS.tier1ConfidenceThreshold,
        monthlyCostBudgetUsd: data.monthly_cost_budget_usd ?? null,
        ownerRole: data.owner_role ?? DEFAULTS.ownerRole,
        scheduleCron: data.schedule_cron ?? null,
        mode: (data.mode ?? DEFAULTS.mode) as "shadow" | "live",
        found: true,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `❌ [agentConfig] failed to read config for "${agentKey}": ${message} — using permissive defaults`,
    );
    config = {
      agentKey,
      name: agentKey,
      category: "maintain",
      ...DEFAULTS,
      found: false,
    };
  }

  cache.set(agentKey, { at: Date.now(), config });
  return config;
}

/**
 * Convenience overload for callers that only hold url + key rather than a
 * client (mirrors getAIConfig's signature).
 */
export function getAgentConfigByKey(
  supabaseUrl: string,
  supabaseKey: string,
  agentKey: string,
): Promise<AgentConfig> {
  return getAgentConfig(createClient(supabaseUrl, supabaseKey), agentKey);
}

/** Clear the in-memory cache (test/debug helper). */
export function clearAgentConfigCache(): void {
  cache.clear();
}
