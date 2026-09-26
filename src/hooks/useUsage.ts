import { useCallback } from "react";

/**
 * Metered-usage billing hook. Currently a fixed empty state, on purpose.
 *
 * It used to read `usage_events` and call `get_current_usage` /
 * `record_usage_event`. None of the three exists in production (42P01 /
 * PGRST202; migration 20260110000001 is ledgered and produced nothing), so
 * every mount fired two failing requests and every recordUsage() threw. No
 * page mounts a consumer today (UsageDisplay and UsageIndicator are exported
 * and unused), and no plan meters usage.
 *
 * AI usage IS counted now, server-side, in ai_usage_daily (migration
 * 20261001000001) by the edge functions that spend it. That table is admin
 * read only, so it is not a source for this hook. If metered billing is ever
 * built, give it a user-readable view over ai_usage_daily and read that here.
 *
 * The exported shapes are unchanged so UsageDisplay keeps compiling and
 * renders nothing (it returns null for an empty currentUsage).
 */

export type UsageEventType =
  | "api_call"
  | "ai_generation"
  | "email_sent"
  | "sms_sent"
  | "report_generated"
  | "export_created"
  | "custom";

export interface UsageEvent {
  id: string;
  user_id: string;
  subscription_id: string | null;
  event_type: UsageEventType;
  event_name: string;
  quantity: number;
  unit_price: number;
  metadata: Record<string, unknown>;
  billed: boolean;
  billed_at: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  created_at: string;
}

export interface UsageQuota {
  event_type: UsageEventType;
  total_quantity: number;
  monthly_limit: number | null;
  included_units: number;
  overage_quantity: number;
  overage_cost: number;
}

export interface RecordUsageParams {
  eventType: UsageEventType;
  eventName: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

const NO_QUOTAS: UsageQuota[] = [];
const NO_EVENTS: UsageEvent[] = [];

export function useUsage() {
  // Resolves to null: there is nowhere to record to. Kept async so a caller
  // that awaits it keeps working.
  const recordUsage = useCallback(async (_params: RecordUsageParams): Promise<null> => {
    if (import.meta.env.DEV) {
      console.debug("[useUsage] recordUsage is a no-op: usage_events does not exist");
    }
    return null;
  }, []);

  const refetchUsage = useCallback(async () => ({ data: NO_QUOTAS }), []);

  return {
    // Data
    currentUsage: NO_QUOTAS,
    recentEvents: NO_EVENTS,

    // Loading states
    isLoading: false,
    usageLoading: false,
    eventsLoading: false,

    // Error
    usageError: null as Error | null,

    // Actions
    recordUsage,
    refetchUsage,

    // Mutation state
    isRecording: false,

    // Helpers: with no quotas defined, everything is within limit.
    isWithinLimit: (_eventType: UsageEventType): boolean => true,
    getRemainingQuota: (_eventType: UsageEventType): number | "unlimited" => "unlimited",
    getUsagePercentage: (_eventType: UsageEventType): number => 0,
    getTotalOverageCost: (): number => 0,
    getUsageByType: (_eventType: UsageEventType): UsageQuota | undefined => undefined,
  };
}

/**
 * Track AI generation usage. A no-op for the reason above; the edge functions
 * that call a model count their own usage server-side.
 */
export function useAIUsage() {
  const { recordUsage, isWithinLimit, getRemainingQuota, getUsagePercentage } = useUsage();

  const trackAIGeneration = async (eventName: string, metadata?: Record<string, unknown>) => {
    return recordUsage({
      eventType: "ai_generation",
      eventName,
      quantity: 1,
      metadata,
    });
  };

  return {
    trackAIGeneration,
    canGenerate: () => isWithinLimit("ai_generation"),
    remainingGenerations: () => getRemainingQuota("ai_generation"),
    usagePercentage: () => getUsagePercentage("ai_generation"),
  };
}
