import { describe, it, expect } from 'vitest';
import {
  resolveHighestSubscription,
  isSubscriptionEntitled,
  gracePeriodEnd,
  GRACE_PERIOD_DAYS,
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

/**
 * Payment-failed grace period (PROD-SUB-003).
 *
 * A failed renewal must not instantly revoke premium access: past_due rows stay
 * entitled until current_period_end + GRACE_PERIOD_DAYS, then drop to free.
 * active/trialing always grant; canceled/paused never do.
 */
describe('isSubscriptionEntitled / gracePeriodEnd (grace period)', () => {
  const now = new Date('2026-05-10T00:00:00Z');
  const withStatus = (
    status: UserSubscription['status'],
    periodEnd: string,
  ): UserSubscription => ({
    ...makeRow('web', insiderPlan),
    status,
    current_period_end: periodEnd,
  });

  it('grants access for active subscriptions', () => {
    expect(isSubscriptionEntitled(withStatus('active', '2026-05-01T00:00:00Z'), now)).toBe(true);
  });

  it('grants access for trialing subscriptions (fixes trial-reads-as-free)', () => {
    expect(isSubscriptionEntitled(withStatus('trialing', '2026-05-20T00:00:00Z'), now)).toBe(true);
  });

  it('never grants access for canceled or paused subscriptions', () => {
    expect(isSubscriptionEntitled(withStatus('canceled', '2026-06-01T00:00:00Z'), now)).toBe(false);
    expect(isSubscriptionEntitled(withStatus('paused', '2026-06-01T00:00:00Z'), now)).toBe(false);
  });

  it('keeps a past_due subscription entitled inside the grace window', () => {
    // period ended 2026-05-01, +14d grace = 2026-05-15, now is 2026-05-10 → still in grace
    expect(isSubscriptionEntitled(withStatus('past_due', '2026-05-01T00:00:00Z'), now)).toBe(true);
  });

  it('drops a past_due subscription after the grace window lapses', () => {
    // period ended 2026-04-01, +14d grace = 2026-04-15, now is 2026-05-10 → lapsed
    expect(isSubscriptionEntitled(withStatus('past_due', '2026-04-01T00:00:00Z'), now)).toBe(false);
  });

  it('treats a past_due row with no period end as lapsed', () => {
    const row = { ...withStatus('past_due', '2026-05-01T00:00:00Z'), current_period_end: '' as unknown as string };
    expect(isSubscriptionEntitled(row, now)).toBe(false);
  });

  it('gracePeriodEnd adds the grace window for past_due but not for active', () => {
    const periodEnd = '2026-05-01T00:00:00Z';
    const due = gracePeriodEnd(withStatus('past_due', periodEnd));
    const active = gracePeriodEnd(withStatus('active', periodEnd));
    expect(active.toISOString()).toBe(new Date(periodEnd).toISOString());
    const expected = new Date(periodEnd);
    expected.setDate(expected.getDate() + GRACE_PERIOD_DAYS);
    expect(due.toISOString()).toBe(expected.toISOString());
  });
});
