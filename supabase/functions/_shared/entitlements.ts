/**
 * Server-side subscription entitlement (PROD-SUB-001).
 *
 * Premium gating was previously CLIENT-ONLY (PremiumGate + useSubscription), so
 * a determined user could call a premium edge function directly and bypass the
 * paywall. This module is the server-side source of truth: it resolves a user's
 * entitled tier from user_subscriptions and maps premium features -> minimum
 * tier, mirroring the web client's logic (src/hooks/useSubscription.ts) including
 * the failed-payment grace window so behavior is consistent across surfaces.
 */

export type Tier = 'free' | 'insider' | 'vip';

/** Mirror of useSubscription.GRACE_PERIOD_DAYS (PROD-SUB-003). */
export const GRACE_PERIOD_DAYS = 14;

export const TIER_RANK: Record<Tier, number> = { free: 0, insider: 1, vip: 2 };

/**
 * Central premium-feature -> minimum-tier map. Mirrors hasFeature() in
 * src/hooks/useSubscription.ts so server and client agree on what is gated.
 */
export const PREMIUM_FEATURES: Record<string, Tier> = {
  // Insider+
  unlimited_favorites: 'insider',
  early_access: 'insider',
  advanced_filters: 'insider',
  ad_free: 'insider',
  daily_digest: 'insider',
  priority_support: 'insider',
  trip_planner: 'insider',
  write_reviews: 'insider',
  save_searches: 'insider',
  create_alerts: 'insider',
  // VIP only
  vip_events: 'vip',
  reservation_assistance: 'vip',
  sms_alerts: 'vip',
  concierge: 'vip',
  local_perks: 'vip',
};

/**
 * Whether a single subscription row currently grants entitlement.
 * Pure + side-effect free so it can be unit-tested in isolation. Mirrors
 * isSubscriptionEntitled() in src/hooks/useSubscription.ts:
 *   active / trialing  -> always
 *   past_due           -> only within current_period_end + GRACE_PERIOD_DAYS
 *   canceled / paused  -> never
 */
export function isSubscriptionRowEntitled(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  switch (status) {
    case 'active':
    case 'trialing':
      return true;
    case 'past_due': {
      if (!currentPeriodEnd) return false;
      const grace = new Date(currentPeriodEnd);
      grace.setDate(grace.getDate() + GRACE_PERIOD_DAYS);
      return now.getTime() <= grace.getTime();
    }
    default:
      return false;
  }
}

/** Does an entitled tier satisfy a premium feature's minimum tier? */
export function hasFeatureAccess(tier: Tier, feature: string): boolean {
  const required = PREMIUM_FEATURES[feature] ?? 'free';
  return TIER_RANK[tier] >= TIER_RANK[required];
}

/** Minimal Supabase client shape (matches the proven pattern in discover-chat). */
// deno-lint-ignore no-explicit-any
interface SupabaseLike { from: (table: string) => any; }

interface SubRow {
  status?: string;
  current_period_end?: string;
  plan?: { name?: string } | null;
}

/**
 * Resolve the highest tier the user is CURRENTLY entitled to (across platforms),
 * honoring trialing + the past_due grace window. Returns 'free' on any error so
 * a transient DB issue fails closed to the free tier rather than throwing.
 */
export async function resolveEntitledTier(
  supabase: SupabaseLike,
  userId: string,
  now: Date = new Date(),
): Promise<Tier> {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('status, current_period_end, plan:subscription_plans(name)')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due']);

    if (error || !data) return 'free';

    let best: Tier = 'free';
    for (const row of data as SubRow[]) {
      if (!isSubscriptionRowEntitled(row.status, row.current_period_end, now)) continue;
      const name = (row.plan?.name ?? '').toLowerCase();
      if (name === 'vip') return 'vip';
      if (name === 'insider' && best === 'free') best = 'insider';
    }
    return best;
  } catch {
    return 'free';
  }
}
