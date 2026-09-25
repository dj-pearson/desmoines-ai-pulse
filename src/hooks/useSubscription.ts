import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { tierHasFeature } from '@/lib/premiumFeatures';
import { handleError } from "@/lib/errorHandler";
import {
  IN_PLACE_PLAN_CHANGE_ENABLED,
  PLAN_CHANGE_PAUSED_CODE,
  PLAN_CHANGE_PAUSED_MESSAGE,
} from "@/lib/billingStatus";

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

/**
 * The query key the per-user subscription rows live under, as
 * `[USER_SUBSCRIPTIONS_QUERY_KEY, userId]`. Exported so a mutation elsewhere
 * (cancel, resume) invalidates the key the data actually lives under.
 */
export const USER_SUBSCRIPTIONS_QUERY_KEY = "user-subscriptions";

/**
 * What a checkout attempt came to. On failure, `code` and `message` are the
 * server's own (create-subscription-checkout's `{ error, code, platform }`
 * body), so a caller can tell "verify your email" from "you already pay through
 * the App Store" from "try again". `code` is null when the server sent none.
 */
export type CheckoutFailure = {
  ok: false;
  code: string | null;
  message: string;
  platform?: "ios" | "android";
};
export type CheckoutResult = { ok: true; url: string } | CheckoutFailure;

/**
 * Narrows a CheckoutResult to its failure branch. The app project compiles
 * with strictNullChecks off, where `if (result.ok) return;` does NOT narrow
 * what follows; `result.ok === false` or this guard does.
 */
export function isCheckoutFailure(result: CheckoutResult): result is CheckoutFailure {
  return result.ok === false;
}

// Stable empty defaults, so callbacks keyed on `plans` keep their identity
// while the query has no data yet.
const NO_PLANS: SubscriptionPlan[] = [];
const NO_SUBSCRIPTIONS: UserSubscription[] = [];

const CHECKOUT_FALLBACK_MESSAGE = "We couldn't start checkout. Please try again in a moment.";

interface CheckoutErrorBody {
  error?: unknown;
  code?: unknown;
  platform?: unknown;
}

/**
 * Turns a supabase-js invoke error into a CheckoutResult. A FunctionsHttpError
 * carries the Response in `context`; its body is what the server said, which
 * the generic "non-2xx status code" message throws away. Same approach as
 * useTripPlanner's generate-itinerary call.
 */
async function checkoutFailureFromInvokeError(error: unknown): Promise<CheckoutResult> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    const body = (await (ctx as Response).json().catch(() => null)) as CheckoutErrorBody | null;
    if (body && typeof body.error === "string" && body.error) {
      const platform = body.platform === "ios" || body.platform === "android" ? body.platform : undefined;
      return {
        ok: false,
        code: typeof body.code === "string" ? body.code : null,
        message: body.error,
        ...(platform ? { platform } : {}),
      };
    }
  }
  handleError(error, { component: "useSubscription", action: "checkout" });
  return { ok: false, code: null, message: CHECKOUT_FALLBACK_MESSAGE };
}

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

/**
 * Number of days a past_due subscription keeps premium access after its paid
 * period ends, giving Stripe's dunning retries time to recover payment before
 * we drop the user to free (PROD-SUB-003).
 */
export const GRACE_PERIOD_DAYS = 14;

/**
 * The instant premium access lapses for a row. For past_due rows this is the
 * paid period end plus the grace window; for other statuses it is the period
 * end itself. A missing period end is treated as the epoch (i.e. lapsed).
 */
export function gracePeriodEnd(sub: UserSubscription): Date {
  const base = sub.current_period_end ? new Date(sub.current_period_end) : new Date(0);
  if (sub.status === "past_due") {
    base.setDate(base.getDate() + GRACE_PERIOD_DAYS);
  }
  return base;
}

/**
 * Whether a single subscription row currently grants premium entitlement:
 * `active` and `trialing` always do; `past_due` does only within the grace
 * window; `canceled`/`paused` never do. This is what gates premium features —
 * a failed renewal no longer instantly revokes access, and a row lapsed beyond
 * grace correctly stops granting a tier.
 */
export function isSubscriptionEntitled(
  sub: UserSubscription,
  now: Date = new Date(),
): boolean {
  switch (sub.status) {
    case "active":
    case "trialing":
      return true;
    case "past_due":
      return now.getTime() <= gracePeriodEnd(sub).getTime();
    default:
      return false;
  }
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fetch available subscription plans
  const {
    data: plans = NO_PLANS,
    isLoading: plansLoading,
    error: plansError,
  } = useQuery({
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
  // A failed read throws, so `subscriptionError` is set and the caller can say
  // "couldn't check your plan" instead of showing a paying member as free. The
  // derived tier still falls back to free, which is the safe default for gates.
  const {
    data: subscriptions = NO_SUBSCRIPTIONS,
    isLoading: subscriptionLoading,
    error: subscriptionError,
    refetch: refetchSubscriptionQuery,
  } = useQuery({
    // Spelled out rather than [USER_SUBSCRIPTIONS_QUERY_KEY, ...]: the
    // logout teardown test reads this literal to prove the key is per-user.
    // planBenefits.test.ts pins the constant to the same string.
    queryKey: ["user-subscriptions", user?.id],
    queryFn: async (): Promise<UserSubscription[]> => {
      if (!user) return [];

      // @ts-ignore -- Supabase SDK TS2589: deep type instantiation under strict mode
      const subQuery = supabase.from("user_subscriptions");
      // @ts-ignore -- Supabase SDK TS2769: overload resolution under strict mode
      const { data, error } = await subQuery
        .select('*, plan:subscription_plans(*)')
        .eq("user_id", user.id)
        // Include trialing + past_due (not just active) so trial users aren't
        // read as free and a failed renewal can be held in its grace window.
        // Entitlement (below) decides which of these actually grant a tier.
        .in("status", ["active", "trialing", "past_due"]);

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

  // Entitlement is computed from rows that CURRENTLY grant access (active,
  // trialing, or past_due within grace). `subscription` above stays the highest
  // row of ANY status for display (e.g. showing "Past Due" in the portal),
  // while tier/limits/features below derive from the entitled set so a failed
  // payment doesn't instantly revoke access and a beyond-grace row drops to free.
  const entitledSubscription = resolveHighestSubscription(
    subscriptions.filter((s) => isSubscriptionEntitled(s)),
  );

  // A past_due row (if any) drives the "payment failed" grace banner.
  const pastDueSubscription = subscriptions.find((s) => s.status === "past_due") ?? null;
  const inGracePeriod =
    !!pastDueSubscription && isSubscriptionEntitled(pastDueSubscription);
  const gracePeriodEndsAt = pastDueSubscription
    ? gracePeriodEnd(pastDueSubscription).toISOString()
    : null;

  // Determine current tier
  const getCurrentTier = (): SubscriptionTier => {
    if (!user) return "free";
    if (!entitledSubscription) return "free";
    return (entitledSubscription.plan?.name || "free") as SubscriptionTier;
  };

  const tier = getCurrentTier();

  // Get current limits based on tier
  const getLimits = (): SubscriptionLimits => {
    if (entitledSubscription?.plan?.limits) {
      return entitledSubscription.plan.limits;
    }
    return FREE_LIMITS;
  };

  const limits = getLimits();

  // Feature access checks. The vocabulary and each feature's tier live in
  // src/lib/premiumFeatures.ts (WEB-FEAT-018); this used to be a switch whose
  // `default` returned true, so any name not listed - a typo in a `feature=`
  // prop included - was an unlock rather than a broken gate. Unknown names are
  // now denied, and reported in development.
  const hasFeature = (feature: string): boolean => tierHasFeature(tier, feature);

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
    if (!entitledSubscription?.current_period_end) return false;
    const endDate = new Date(entitledSubscription.current_period_end);
    const now = new Date();
    const daysUntilExpiry = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const userId = user?.id;

  // The web row, if any, that a checkout for another tier would change in
  // place. See IN_PLACE_PLAN_CHANGE_ENABLED for why that is refused today.
  const activeWebPlanName =
    subscriptions.find(
      (s) => s.platform === "web" && (s.status === "active" || s.status === "trialing"),
    )?.plan?.name ?? null;

  // Create checkout session for subscription. Never throws.
  const createCheckoutSession = useCallback(
    async (
      planId: string,
      billingInterval: "monthly" | "yearly" = "monthly",
    ): Promise<CheckoutResult> => {
      if (!userId) {
        const message = "Please sign in to subscribe.";
        setCheckoutError(message);
        return { ok: false, code: "not_signed_in", message };
      }

      if (!IN_PLACE_PLAN_CHANGE_ENABLED && activeWebPlanName) {
        const target = plans.find((p) => p.id === planId || p.name === planId);
        if (target && target.name !== "free" && target.name !== activeWebPlanName) {
          setCheckoutError(PLAN_CHANGE_PAUSED_MESSAGE);
          return { ok: false, code: PLAN_CHANGE_PAUSED_CODE, message: PLAN_CHANGE_PAUSED_MESSAGE };
        }
      }

      setCheckoutLoading(true);
      setCheckoutError(null);

      try {
        const { data, error } = await supabase.functions.invoke(
          "create-subscription-checkout",
          { body: { planId, billingInterval } },
        );

        let result: CheckoutResult;
        if (error) {
          result = await checkoutFailureFromInvokeError(error);
        } else if (typeof data?.url === "string" && data.url) {
          result = { ok: true, url: data.url };
        } else {
          handleError(new Error("create-subscription-checkout returned no url"), {
            component: "useSubscription",
            action: "checkout",
          });
          result = { ok: false, code: null, message: CHECKOUT_FALLBACK_MESSAGE };
        }

        if (result.ok === false) setCheckoutError(result.message);
        return result;
      } catch (err) {
        handleError(err, { component: "useSubscription", action: "checkout" });
        setCheckoutError(CHECKOUT_FALLBACK_MESSAGE);
        return { ok: false, code: null, message: CHECKOUT_FALLBACK_MESSAGE };
      } finally {
        setCheckoutLoading(false);
      }
    },
    [userId, activeWebPlanName, plans],
  );

  // Start checkout and redirect only when the server returned a URL. The
  // result goes back to the caller either way, so a refusal can be shown.
  const startCheckout = useCallback(
    async (
      planId: string,
      billingInterval: "monthly" | "yearly" = "monthly",
    ): Promise<CheckoutResult> => {
      const result = await createCheckoutSession(planId, billingInterval);
      if (result.ok) {
        window.location.href = result.url;
      }
      return result;
    },
    [createCheckoutSession],
  );

  // Get a specific plan by name
  const getPlanByName = useCallback(
    (name: SubscriptionTier): SubscriptionPlan | undefined =>
      plans.find((plan) => plan.name === name),
    [plans],
  );

  // Mark the rows stale and refetch them. Stable across renders (it used to be
  // a new function every render, which fed SubscriptionSuccess's refetch loop).
  const refreshSubscription = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [USER_SUBSCRIPTIONS_QUERY_KEY, userId] });
  }, [queryClient, userId]);

  // Refetch now and resolve when the rows are back, for a caller that polls.
  const refetchSubscription = useCallback(
    () => refetchSubscriptionQuery(),
    [refetchSubscriptionQuery],
  );

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

    // Read errors: set when the query failed, so "free" and "couldn't check"
    // are distinguishable.
    subscriptionError,
    plansError,

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
    // Payment-failed grace state (PROD-SUB-003): isPastDue surfaces a banner,
    // inGracePeriod means access is still granted, gracePeriodEndsAt is when it lapses.
    isPastDue: !!pastDueSubscription,
    inGracePeriod,
    gracePeriodEndsAt,

    // Checkout functions
    createCheckoutSession,
    startCheckout,
    checkoutLoading,
    // Kept for compatibility; prefer the CheckoutResult startCheckout returns.
    checkoutError,

    // Utility functions
    getPlanByName,
    refreshSubscription,
    refetchSubscription,
  };
}
