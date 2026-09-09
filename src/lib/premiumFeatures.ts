/**
 * The premium feature vocabulary, and the tier each feature requires.
 *
 * WHY THIS IS A MAP AND NOT A SWITCH (WEB-FEAT-018)
 *
 * `hasFeature` was a switch whose `default` returned TRUE, described in a
 * comment as "Free features". So every name that was not one of the eighteen
 * listed cases was granted - which means a typo in a `feature=` prop is not a
 * broken gate, it is an OPEN gate. `feature="trip_plannner"` renders the trip
 * planner to a free account, and nothing anywhere reports it: the component
 * works, the tests pass, the paywall is simply absent. The same default sits
 * in supabase/functions/_shared/entitlements.ts
 * (`PREMIUM_FEATURES[feature] ?? 'free'`), so the server agrees with the typo.
 *
 * A map turns that around. An unknown name is not in it, so it is denied, and
 * `PremiumFeature` gives call sites a union to spell wrong at compile time
 * rather than at runtime.
 *
 * The eighteen entries below are exactly the cases the old switch listed - no
 * feature gained or lost a tier here. Verify against a call site before adding
 * one; a name that reaches `hasFeature` but is missing here is now a locked
 * feature rather than a free one.
 */
export const PREMIUM_FEATURES = {
  // Insider and above
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
} as const satisfies Record<string, 'insider' | 'vip'>;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

/**
 * The tier a feature requires, or null when the name is not a premium feature
 * at all. Callers must treat null as DENY, not as free.
 *
 * Takes `string` rather than `PremiumFeature` on purpose: the whole point is to
 * be the thing that catches a name no union checked, including one that
 * arrives from a prop typed as string.
 */
export function requiredTierFor(feature: string): 'insider' | 'vip' | null {
  return (PREMIUM_FEATURES as Record<string, 'insider' | 'vip'>)[feature] ?? null;
}

/**
 * Whether `tier` may use `feature`. Unknown feature names are denied and
 * reported in development, where a typo is cheap to fix; in production the
 * deny stands on its own, since console.* is stripped from the bundle.
 */
export function tierHasFeature(tier: string, feature: string): boolean {
  const required = requiredTierFor(feature);

  if (required === null) {
    if (import.meta.env.DEV) {
      console.error(
        `[premium] unknown feature "${feature}" - denying. Add it to PREMIUM_FEATURES ` +
          `in src/lib/premiumFeatures.ts, or fix the spelling at the call site.`,
      );
    }
    return false;
  }

  if (required === 'vip') return tier === 'vip';
  return tier === 'insider' || tier === 'vip';
}
