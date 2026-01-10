import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

export function useUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch current period usage
  const {
    data: currentUsage = [],
    isLoading: usageLoading,
    error: usageError,
    refetch: refetchUsage,
  } = useQuery({
    queryKey: ["current-usage", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase.rpc("get_current_usage", {
        p_user_id: user.id,
      });

      if (error) throw error;
      return (data || []) as UsageQuota[];
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch recent usage events
  const { data: recentEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["usage-events", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("usage_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as UsageEvent[];
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Record usage event mutation
  const recordUsage = useMutation({
    mutationFn: async ({
      eventType,
      eventName,
      quantity = 1,
      metadata = {},
      idempotencyKey,
    }: RecordUsageParams) => {
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase.rpc("record_usage_event", {
        p_user_id: user.id,
        p_event_type: eventType,
        p_event_name: eventName,
        p_quantity: quantity,
        p_metadata: metadata,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-usage"] });
      queryClient.invalidateQueries({ queryKey: ["usage-events"] });
    },
  });

  // Helper to check if usage is within limit
  const isWithinLimit = (eventType: UsageEventType): boolean => {
    const quota = currentUsage.find((q) => q.event_type === eventType);
    if (!quota) return true; // No quota defined = unlimited
    if (quota.monthly_limit === null) return true; // Null = unlimited
    return quota.total_quantity < quota.monthly_limit;
  };

  // Helper to get remaining quota
  const getRemainingQuota = (
    eventType: UsageEventType
  ): number | "unlimited" => {
    const quota = currentUsage.find((q) => q.event_type === eventType);
    if (!quota) return "unlimited";
    if (quota.monthly_limit === null) return "unlimited";
    return Math.max(0, quota.monthly_limit - quota.total_quantity);
  };

  // Helper to get usage percentage
  const getUsagePercentage = (eventType: UsageEventType): number => {
    const quota = currentUsage.find((q) => q.event_type === eventType);
    if (!quota || quota.monthly_limit === null) return 0;
    return Math.min(100, (quota.total_quantity / quota.monthly_limit) * 100);
  };

  // Get total overage cost for current period
  const getTotalOverageCost = (): number => {
    return currentUsage.reduce((sum, quota) => sum + quota.overage_cost, 0);
  };

  // Get usage by type
  const getUsageByType = (eventType: UsageEventType): UsageQuota | undefined => {
    return currentUsage.find((q) => q.event_type === eventType);
  };

  return {
    // Data
    currentUsage,
    recentEvents,

    // Loading states
    isLoading: usageLoading || eventsLoading,
    usageLoading,
    eventsLoading,

    // Error
    usageError,

    // Actions
    recordUsage: recordUsage.mutateAsync,
    refetchUsage,

    // Mutation state
    isRecording: recordUsage.isPending,

    // Helpers
    isWithinLimit,
    getRemainingQuota,
    getUsagePercentage,
    getTotalOverageCost,
    getUsageByType,
  };
}

/**
 * Track AI generation usage
 * Use this hook to easily track AI-related usage events
 */
export function useAIUsage() {
  const { recordUsage, isWithinLimit, getRemainingQuota, getUsagePercentage } =
    useUsage();

  const trackAIGeneration = async (
    eventName: string,
    metadata?: Record<string, unknown>
  ) => {
    return recordUsage({
      eventType: "ai_generation",
      eventName,
      quantity: 1,
      metadata,
      idempotencyKey: `ai-gen-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
  };

  return {
    trackAIGeneration,
    canGenerate: () => isWithinLimit("ai_generation"),
    remainingGenerations: () => getRemainingQuota("ai_generation"),
    usagePercentage: () => getUsagePercentage("ai_generation"),
  };
}
