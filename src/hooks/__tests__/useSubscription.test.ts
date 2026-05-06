import { describe, it, expect } from 'vitest';
import {
  resolveHighestSubscription,
  type SubscriptionPlan,
  type UserSubscription,
} from '../useSubscription';

/**
 * Cross-platform subscription sync — read-side tests (SUB-SYNC-013).
 *
 * Companion edge-function and DB-constraint tests live next to their
 * respective implementations:
 *   - supabase/functions/_tests/cross-platform-sync.test.ts
 *   - supabase/migrations/_tests/cross-platform-sync.test.sql (manual run
 *     against a Postgres copy of the schema)
 *
 * These vitest cases pin the read-side guarantee: when a user holds rows
 * on multiple platforms, useSubscription must resolve the highest tier
 * regardless of platform, so iOS picks up a VIP purchased via the website
 * and the website picks up a VIP purchased via Google Play.
 */

const insiderPlan: SubscriptionPlan = {
  id: 'plan-insider',
  name: 'insider',
  display_name: 'Insider',
  description: 'Insider tier',
  price_monthly: 4.99,
  price_yearly: 49,
  features: [],
  limits: { favorites: -1, alerts: 5, saved_searches: 5 },
};

const vipPlan: SubscriptionPlan = {
  id: 'plan-vip',
  name: 'vip',
  display_name: 'VIP',
  description: 'VIP tier',
  price_monthly: 12.99,
  price_yearly: 129,
  features: [],
  limits: { favorites: -1, alerts: -1, saved_searches: -1 },
};

const freePlan: SubscriptionPlan = {
  id: 'plan-free',
  name: 'free',
  display_name: 'Free',
  description: 'Free tier',
  price_monthly: 0,
  price_yearly: 0,
  features: [],
  limits: { favorites: 3, alerts: 0, saved_searches: 0 },
};

function makeRow(
  platform: 'web' | 'ios' | 'android',
  plan: SubscriptionPlan,
): UserSubscription {
  return {
    id: `sub-${platform}-${plan.name}`,
    user_id: 'user-1',
    plan_id: plan.id,
    status: 'active',
    current_period_start: '2026-04-01T00:00:00Z',
    current_period_end: '2026-05-01T00:00:00Z',
    cancel_at_period_end: false,
    platform,
    plan,
  };
}

describe('resolveHighestSubscription (cross-platform sync read-side)', () => {
  it('returns null when there are no subscriptions', () => {
    expect(resolveHighestSubscription([])).toBeNull();
  });

  it('returns the only row when there is just one platform', () => {
    const row = makeRow('web', insiderPlan);
    expect(resolveHighestSubscription([row])).toBe(row);
  });

  it('picks VIP over Insider when VIP is on iOS and Insider is on web', () => {
    const ios = makeRow('ios', vipPlan);
    const web = makeRow('web', insiderPlan);
    const winner = resolveHighestSubscription([web, ios]);
    expect(winner?.plan?.name).toBe('vip');
    expect(winner?.platform).toBe('ios');
  });

  it('picks VIP over Insider when VIP is on web and Insider is on Android', () => {
    const web = makeRow('web', vipPlan);
    const android = makeRow('android', insiderPlan);
    const winner = resolveHighestSubscription([android, web]);
    expect(winner?.plan?.name).toBe('vip');
    expect(winner?.platform).toBe('web');
  });

  it('picks Insider over Free across platforms', () => {
    const web = makeRow('web', freePlan);
    const ios = makeRow('ios', insiderPlan);
    expect(resolveHighestSubscription([web, ios])?.plan?.name).toBe('insider');
  });

  it('keeps the first row when ranks are tied', () => {
    const web = makeRow('web', insiderPlan);
    const ios = makeRow('ios', insiderPlan);
    expect(resolveHighestSubscription([web, ios])?.platform).toBe('web');
  });

  it('treats a missing plan as free (lowest rank)', () => {
    const row1: UserSubscription = { ...makeRow('web', freePlan), plan: undefined };
    const row2 = makeRow('android', vipPlan);
    expect(resolveHighestSubscription([row1, row2])?.plan?.name).toBe('vip');
  });

  it('returns the highest tier even with three platforms', () => {
    const web = makeRow('web', insiderPlan);
    const ios = makeRow('ios', freePlan);
    const android = makeRow('android', vipPlan);
    const winner = resolveHighestSubscription([web, ios, android]);
    expect(winner?.plan?.name).toBe('vip');
    expect(winner?.platform).toBe('android');
  });
});
