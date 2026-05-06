import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useState } from "react";

export type SubscriptionTier = "free" | "insider" | "vip";

export interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  limits: {
    favorites: number;
    alerts: number;
    saved_searches: number;
  };
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
}

export type SubscriptionPlatform = "web" | "ios" | "android";

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: "active" | "canceled" | "past_due" | "trialing" | "paused";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  platform: SubscriptionPlatform;
  plan?: SubscriptionPlan;
}

export interface SubscriptionLimits {
  favorites: number;
  alerts: number;
  saved_searches: number;
}

const FREE_LIMITS: SubscriptionLimits = {
  favorites: 3,
  alerts: 0,
  saved_searches: 0,
};

const TIER_RANK: Record<string, number> = { vip: 2, insider: 1, free: 0 };

/**
 * Picks the highest-tier subscription from a per-platform list. Used both
 * inside `useSubscription` and by SUB-SYNC tests to verify cross-platform
 * sync logic (e.g. web=insider + ios=vip → vip wins).
 */
export function resolveHighestSubscription(
  subscriptions: UserSubscription[],
): UserSubscription | null {
  if (subscriptions.length === 0) return null;
  return subscriptions.reduce<UserSubscription | null>((best, row) => {
    const rowRank = TIER_RANK[row.plan?.name ?? 'free'] ?? 0;
    const bestRank = best ? TIER_RANK[best.plan?.name ?? 'free'] ?? 0 : -1;
    return rowRank > bestRank ? row : (best ?? row);
  }, null);
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fetch available subscription plans
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      // @ts-ignore -- Supabase SDK TS2589: deep type instantiation under strict mode
      const query = supabase.from("subscription_plans");
      // @ts-ignore -- Supabase SDK TS2769: overload resolution under strict mode
      const { data, error } = await query.select("*").eq("is_active", true).order("sort_order", { ascending: true });

      if (error) throw error;
      // Supabase returns JSONB columns as unknown; cast to expected types
      return (data as unknown as Array<Record<string, unknown>>).map((plan) => ({
        ...plan,
        features: plan['features'] as string[],
        limits: plan['limits'] as SubscriptionLimits,
      })) as unknown as SubscriptionPlan[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch user's current subscriptions. A user may have one row per platform
  // (web/Stripe, ios, android). We return ALL active rows (used for the per-
  // platform breakdown in Profile/Pricing) plus a derived `subscription`
  // pointing at the highest tier for back-compat with existing call sites.
  const { data: subscriptions = [], isLoading: subscriptionLoading } = useQuery({
    queryKey: ["user-subscriptions", user?.id],
    queryFn: async (): Promise<UserSubscription[]> => {
      if (!user) return [];

      // @ts-ignore -- Supabase SDK TS2589: deep type instantiation under strict mode
      const subQuery = supabase.from("user_subscriptions");
      // @ts-ignore -- Supabase SDK TS2769: overload resolution under strict mode
      const { data, error } = await subQuery
        .select('*, plan:subscription_plans(*)')
        .eq("user_id", user.id)
        .eq("status", "active");

      if (error) throw error;
      if (!data || (data as unknown[]).length === 0) return [];

      const rows = data as unknown as Array<Record<string, unknown>>;

      return rows.map((row) => {
        const joinedPlan = row['plan'] as Record<string, unknown> | null;
        return {
          ...row,
          platform: (row['platform'] as SubscriptionPlatform) ?? 'web',
          plan: joinedPlan
            ? {
                ...joinedPlan,
                features: joinedPlan['features'] as string[],
                limits: joinedPlan['limits'] as SubscriptionLimits,
              }
            : undefined,
        } as unknown as UserSubscription;
      });
    },
    enabled: !!user,
  });

  // Single highest-tier subscription, kept for back-compat with code that
  // expects one canonical row.
  const subscription = resolveHighestSubscription(subscriptions);

  // Determine current tier
  const getCurrentTier = (): SubscriptionTier => {
    if (!user) return "free";
    if (!subscription) return "free";
    return (subscription.plan?.name || "free") as SubscriptionTier;
  };

  const tier = getCurrentTier();

  // Get current limits based on tier
  const getLimits = (): SubscriptionLimits => {
    if (subscription?.plan?.limits) {
      return subscription.plan.limits;
    }
    return FREE_LIMITS;
  };

  const limits = getLimits();

  // Feature access checks
  const hasFeature = (feature: string): boolean => {
    const isInsiderOrHigher = tier === "insider" || tier === "vip";
    switch (feature) {
      // Insider+ features
      case "unlimited_favorites":
      case "early_access":
      case "advanced_filters":
      case "ad_free":
      case "daily_digest":
      case "priority_support":
      case "trip_planner":
      case "write_reviews":
      case "save_searches":
      case "create_alerts":
        return isInsiderOrHigher;
      // VIP-only features
      case "vip_events":
      case "reservation_assistance":
      case "sms_alerts":
      case "concierge":
      case "local_perks":
        return tier === "vip";
      default:
        return true; // Free features
    }
  };

  // Check if user can perform action within limits
  const canPerformAction = (
    action: "favorite" | "alert" | "saved_search",
    currentCount: number
  ): boolean => {
    const limitKey =
      action === "favorite"
        ? "favorites"
        : action === "alert"
          ? "alerts"
          : "saved_searches";
    const limit = limits[limitKey];

    // -1 means unlimited
    if (limit === -1) return true;
    return currentCount < limit;
  };

  // Get remaining quota for an action
  const getRemainingQuota = (
    action: "favorite" | "alert" | "saved_search",
    currentCount: number
  ): number | "unlimited" => {
    const limitKey =
      action === "favorite"
        ? "favorites"
        : action === "alert"
          ? "alerts"
          : "saved_searches";
    const limit = limits[limitKey];

    if (limit === -1) return "unlimited";
    return Math.max(0, limit - currentCount);
  };

  // Check if subscription is expiring soon (within 7 days)
  const isExpiringSoon = (): boolean => {
    if (!subscription?.current_period_end) return false;
    const endDate = new Date(subscription.current_period_end);
    const now = new Date();
    const daysUntilExpiry = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  // Create checkout session for subscription
  const createCheckoutSession = async (
    planId: string,
    billingInterval: "monthly" | "yearly" = "monthly"
  ): Promise<string | null> => {
    if (!user) {
      setCheckoutError("Please log in to subscribe");
      return null;
    }

    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-subscription-checkout",
        {
          body: { planId, billingInterval },
        }
      );

      if (error) {
        throw new Error(error.message || "Failed to create checkout session");
      }

      if (!data?.url) {
        throw new Error("No checkout URL returned");
      }

      return data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      setCheckoutError(message);
      return null;
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Redirect to checkout
  const startCheckout = async (
    planId: string,
    billingInterval: "monthly" | "yearly" = "monthly"
  ): Promise<boolean> => {
    const url = await createCheckoutSession(planId, billingInterval);
    if (url) {
      window.location.href = url;
      return true;
    }
    return false;
  };

  // Get a specific plan by name
  const getPlanByName = (name: SubscriptionTier): SubscriptionPlan | undefined => {
    return plans.find((plan) => plan.name === name);
  };

  // Refresh subscription data
  const refreshSubscription = () => {
    queryClient.invalidateQueries({ queryKey: ["user-subscriptions", user?.id] });
  };

  return {
    // Data
    plans,
    subscription,
    subscriptions,
    tier,
    limits,

    // Loading states
    isLoading: plansLoading || subscriptionLoading,
    plansLoading,
    subscriptionLoading,

    // Feature checks
    hasFeature,
    canPerformAction,
    getRemainingQuota,

    // Status checks
    isPremium: tier !== "free",
    isInsider: tier === "insider",
    isVIP: tier === "vip",
    isExpiringSoon: isExpiringSoon(),
    cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,

    // Checkout functions
    createCheckoutSession,
    startCheckout,
    checkoutLoading,
    checkoutError,

    // Utility functions
    getPlanByName,
    refreshSubscription,
  };
}
