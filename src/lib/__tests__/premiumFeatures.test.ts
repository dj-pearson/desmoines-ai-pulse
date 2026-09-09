import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PREMIUM_FEATURES, requiredTierFor, tierHasFeature } from '../premiumFeatures';

/**
 * WEB-FEAT-018. hasFeature was a switch whose `default` returned true, so a
 * feature name that was not one of the listed cases was GRANTED. A typo in a
 * `feature=` prop did not break the gate, it opened it - silently, on both
 * client and server.
 */
describe('premium feature vocabulary', () => {
  it('denies a name that is not a premium feature', () => {
    // The exact failure: one letter wrong in the trip planner's gate.
    expect(tierHasFeature('free', 'trip_plannner')).toBe(false);
    expect(tierHasFeature('vip', 'trip_plannner')).toBe(false);
    expect(requiredTierFor('trip_plannner')).toBeNull();
  });

  it('does not treat an unknown name as a free feature', () => {
    // The old default returned true for anything unlisted, described in a
    // comment as "Free features". Free and unknown are not the same thing.
    expect(tierHasFeature('free', 'concierge_service')).toBe(false);
  });

  it('gates insider features at insider and above', () => {
    expect(tierHasFeature('free', 'trip_planner')).toBe(false);
    expect(tierHasFeature('insider', 'trip_planner')).toBe(true);
    expect(tierHasFeature('vip', 'trip_planner')).toBe(true);
  });

  it('gates vip features at vip only', () => {
    expect(tierHasFeature('free', 'concierge')).toBe(false);
    expect(tierHasFeature('insider', 'concierge')).toBe(false);
    expect(tierHasFeature('vip', 'concierge')).toBe(true);
  });

  it('covers every feature name the components actually pass', () => {
    // The names in <PremiumGate feature="...">, hasFeature('...') call sites
    // and TripPlanner's own check. A name missing here is now a LOCKED
    // feature, which is the failure mode this change trades for.
    for (const feature of [
      'write_reviews',
      'advanced_filters',
      'trip_planner',
      'save_searches',
      'ad_free',
    ]) {
      expect(requiredTierFor(feature)).not.toBeNull();
    }
  });

  it('agrees with the edge functions map, entry for entry', () => {
    // supabase/functions/_shared/entitlements.ts holds the server's copy, and
    // generate-itinerary gates the paid model call on it. The two drifting
    // apart is how a feature ends up sold on the web and refused by the API,
    // or gated in the browser and open on the server. Read as text because a
    // Deno module cannot be imported into vitest.
    const source = readFileSync('supabase/functions/_shared/entitlements.ts', 'utf8');
    const block = source.match(
      /export const PREMIUM_FEATURES: Record<string, Tier> = \{([\s\S]*?)\n\};/,
    );
    expect(block, 'entitlements.ts must declare PREMIUM_FEATURES').not.toBeNull();

    const server: Record<string, string> = {};
    for (const [, name, tier] of block![1].matchAll(/^\s*(\w+):\s*'(\w+)',/gm)) {
      server[name] = tier;
    }

    expect(server).toEqual({ ...PREMIUM_FEATURES });
  });
});
