import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * docs/page-plans/pricing.md WP1. planBenefits.ts is the one list every premium
 * surface renders, so what it says is what the product claims. These tests pin
 * the lines, the planner switch, the display-only price helpers, and the two
 * useSubscription behaviours the surfaces depend on: a refused checkout comes
 * back with the server's code, and refreshSubscription keeps its identity.
 */

// AI_PLANNER_AVAILABLE is a const in production; the mock lets one test file
// see both states of the switch.
const planner = { available: false };
vi.mock('@/lib/tripPlannerStatus', () => ({
  get AI_PLANNER_AVAILABLE() {
    return planner.available;
  },
  AI_PLANNER_PAUSED_MESSAGE: 'paused',
}));

const invoke = vi.fn();
const tableRows: Record<string, unknown[]> = {};
function chain(table: string) {
  const result = { data: tableRows[table] ?? [], error: null };
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q;
  q.then = (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (table: string) => chain(table),
  },
}));

const authUser = { current: { id: 'user-1' } as { id: string } | null };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authUser.current }),
}));

const handleError = vi.fn();
vi.mock('@/lib/errorHandler', () => ({
  handleError: (...a: unknown[]) => handleError(...a),
}));

const { benefitsFor, displayPrice, yearlySavings, FALLBACK_PRICES, TRIP_PLANNER_MONTHLY_QUOTA } =
  await import('../planBenefits');
const { renderHook, act, waitFor } = await import('@testing-library/react');
const { useSubscription, USER_SUBSCRIPTIONS_QUERY_KEY } = await import('@/hooks/useSubscription');
const { PLAN_CHANGE_PAUSED_CODE } = await import('../billingStatus');

const texts = (plan: 'free' | 'insider' | 'vip', limits?: Parameters<typeof benefitsFor>[1]) =>
  benefitsFor(plan, limits).map((b) => b.text);

beforeEach(() => {
  planner.available = false;
  invoke.mockReset();
  handleError.mockReset();
  authUser.current = { id: 'user-1' };
  for (const k of Object.keys(tableRows)) delete tableRows[k];
});

describe('benefitsFor', () => {
  it('lists no trip planner line on any tier while the planner is paused', () => {
    for (const plan of ['free', 'insider', 'vip'] as const) {
      for (const b of benefitsFor(plan)) {
        expect(b.text).not.toMatch(/trip plan/i);
        expect(b.href).not.toBe('/trip-planner');
      }
    }
  });

  it('lists the server quota once the planner runs', () => {
    planner.available = true;
    expect(texts('insider')).toContain('AI trip plans (5 a month)');
    expect(texts('vip')).toContain('Unlimited AI trip plans');
    expect(TRIP_PLANNER_MONTHLY_QUOTA).toEqual({ insider: 5, vip: -1 });
    const plannerLine = benefitsFor('insider').find((b) => b.key === 'trip_planner');
    expect(plannerLine?.href).toBe('/trip-planner');
  });

  it('holds exactly the delivered lines, and nothing WEB-FEAT-016 withdrew', () => {
    expect(benefitsFor('free').map((b) => b.key)).toEqual([
      'browse',
      'keyword_search',
      'favorites_limit',
      'view_reviews',
      'weekly_digest',
    ]);
    expect(benefitsFor('insider').map((b) => b.key)).toEqual([
      'unlimited_favorites',
      'save_searches',
      'write_reviews',
      'ad_free',
      'advanced_filters',
    ]);
    expect(benefitsFor('vip').map((b) => b.key)).toEqual([
      'everything_in_insider',
      'unlimited_saved_searches',
    ]);
    const all = (['free', 'insider', 'vip'] as const).flatMap((p) => texts(p)).join('\n');
    for (const gone of [/early access/i, /priority support/i, /concierge/i, /VIP perks/i, /best value/i]) {
      expect(all).not.toMatch(gone);
    }
  });

  it('keeps "Advanced search filters" verbatim, pending Search D2', () => {
    expect(texts('insider')).toContain('Advanced search filters');
  });

  it('starts VIP with "Everything in Insider"', () => {
    expect(texts('vip')[0]).toBe('Everything in Insider');
  });

  it('takes numbers from the plan row limits, with the documented fallbacks', () => {
    expect(texts('free')).toContain('Save up to 3 favorites');
    expect(texts('free', { favorites: 5 })).toContain('Save up to 5 favorites');
    expect(texts('insider')).toContain('Saved searches and event alerts (up to 10)');
    expect(texts('insider', { saved_searches: 25 })).toContain('Saved searches and event alerts (up to 25)');
    expect(benefitsFor('insider', { saved_searches: 0 }).map((b) => b.key)).not.toContain('save_searches');
  });

  it('links a line to what it unlocks', () => {
    expect(benefitsFor('insider').find((b) => b.key === 'save_searches')?.href).toBe('/search');
    expect(benefitsFor('free').find((b) => b.key === 'browse')?.href).toBe('/events');
  });
});

describe('display prices', () => {
  const rows = [
    { name: 'free', price_monthly: 0, price_yearly: 0 },
    { name: 'insider', price_monthly: 4.99, price_yearly: 49.99 },
    { name: 'vip', price_monthly: 12.99, price_yearly: 129.99 },
  ];

  it('reads the plan rows', () => {
    const changed = [{ name: 'insider', price_monthly: 5.49, price_yearly: 54.99 }];
    expect(displayPrice(changed, 'insider', 'monthly')).toBe(5.49);
    expect(displayPrice(changed, 'insider', 'yearly')).toBe(54.99);
    expect(displayPrice(rows, 'free', 'monthly')).toBe(0);
  });

  it('uses the fallback only while no rows have loaded', () => {
    expect(displayPrice([], 'vip', 'monthly')).toBe(FALLBACK_PRICES.vip.monthly);
    // Rows loaded but VIP missing: say nothing rather than a stale number.
    expect(displayPrice([rows[1]], 'vip', 'monthly')).toBeNull();
  });

  it('reports yearly savings to the exact cent', () => {
    expect(yearlySavings(rows, 'insider')).toBe(9.89);
    expect(yearlySavings(rows, 'vip')).toBe(25.89);
    expect(yearlySavings(rows, 'free')).toBeNull();
    expect(yearlySavings([{ name: 'insider', price_monthly: 4, price_yearly: 48 }], 'insider')).toBeNull();
  });
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

describe('useSubscription checkout', () => {
  it('returns the server code for a 403 email_verification_required', async () => {
    const body = {
      error: 'Please verify your email address before subscribing.',
      code: 'email_verification_required',
    };
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 403, json: async () => body },
      },
    });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSubscription(), { wrapper: Wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.startCheckout>> | undefined;
    await act(async () => {
      outcome = await result.current.startCheckout('plan-uuid', 'monthly');
    });

    expect(outcome).toEqual({ ok: false, code: 'email_verification_required', message: body.error });
    expect(result.current.checkoutError).toBe(body.error);
    // A refusal the server explained is not an unexpected failure.
    expect(handleError).not.toHaveBeenCalled();
  });

  it('passes a store platform through so the page can name the store', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'non-2xx',
        context: {
          json: async () => ({ error: 'You already have Insider.', code: 'store_subscription_active', platform: 'ios' }),
        },
      },
    });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSubscription(), { wrapper: Wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startCheckout('plan-uuid');
    });
    expect(outcome).toEqual({
      ok: false,
      code: 'store_subscription_active',
      message: 'You already have Insider.',
      platform: 'ios',
    });
  });

  it('reports an unexplained failure through handleError', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('network down') });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSubscription(), { wrapper: Wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startCheckout('plan-uuid');
    });
    expect(outcome).toMatchObject({ ok: false, code: null });
    expect(handleError).toHaveBeenCalledWith(expect.anything(), { component: 'useSubscription', action: 'checkout' });
  });

  it('does not call checkout for a web subscriber changing tier while plan change is paused', async () => {
    tableRows.subscription_plans = [
      { id: 'p-insider', name: 'insider', limits: {} },
      { id: 'p-vip', name: 'vip', limits: {} },
    ];
    tableRows.user_subscriptions = [
      {
        id: 's1',
        user_id: 'user-1',
        plan_id: 'p-insider',
        status: 'active',
        platform: 'web',
        current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
        plan: { id: 'p-insider', name: 'insider', limits: {} },
      },
    ];
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useSubscription(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.tier).toBe('insider'));
    await waitFor(() => expect(result.current.plans).toHaveLength(2));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startCheckout('p-vip');
    });
    expect(outcome).toMatchObject({ ok: false, code: PLAN_CHANGE_PAUSED_CODE });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('useSubscription identity and keys', () => {
  it('keeps refreshSubscription stable across renders', async () => {
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(() => useSubscription(), { wrapper: Wrapper });
    const first = result.current.refreshSubscription;
    rerender();
    await waitFor(() => expect(result.current.subscriptionLoading).toBe(false));
    rerender();
    expect(result.current.refreshSubscription).toBe(first);
  });

  it('invalidates the key the rows live under', async () => {
    const { client, Wrapper } = wrapper();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSubscription(), { wrapper: Wrapper });
    act(() => result.current.refreshSubscription());
    expect(USER_SUBSCRIPTIONS_QUERY_KEY).toBe('user-subscriptions');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['user-subscriptions', 'user-1'] });
  });
});
