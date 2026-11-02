import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * useAnalytics wrote to user_analytics, user_interactions_enhanced and the
 * log-content-metrics function with no consent check, recorded its own page
 * view on every mount (three per homepage visit, on top of usePageTracking's
 * real one), and lost a rejected batch because supabase-js resolves with
 * { error } instead of throwing into the catch that re-queued it.
 */
const insertByTable = new Map<string, ReturnType<typeof vi.fn>>();
const from = vi.fn((table: string) => {
  if (!insertByTable.has(table)) {
    insertByTable.set(table, vi.fn().mockResolvedValue({ error: null }));
  }
  const insert = insertByTable.get(table)!;
  return { insert, upsert: insert };
});
const invoke = vi.fn().mockResolvedValue({ data: null, error: null });
const getUser = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => from(table),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
  },
}));

let granted = false;
vi.mock('@/lib/analyticsConsent', () => ({
  analyticsGranted: () => granted,
}));

let authUser: { id: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ user: authUser }),
}));

const { renderHook, act } = await import('@testing-library/react');
const { useAnalytics, retryDelayMs, isPermanentRejection } = await import('../useAnalytics');

const CONTENT_ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  vi.useFakeTimers();
  granted = false;
  authUser = null;
  insertByTable.clear();
  from.mockClear();
  invoke.mockClear();
  getUser.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAnalytics consent', () => {
  it('writes nothing anywhere without analytics consent', async () => {
    const { result, unmount } = renderHook(() => useAnalytics());

    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
      await result.current.trackPageView();
      await result.current.trackSearch('jazz', {}, 3);
      await result.current.trackPreference('cuisine', 'thai');
      await result.current.trackConversion('phone_call', 'restaurant', CONTENT_ID);
      await result.current.flushEventQueue();
      vi.advanceTimersByTime(60_000);
    });
    unmount();
    await act(async () => {});

    expect(from).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('drops a queued event if consent is withdrawn before the flush', async () => {
    granted = true;
    const { result } = renderHook(() => useAnalytics());
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
    });
    granted = false;
    await act(async () => {
      await result.current.flushEventQueue();
    });
    expect(from).not.toHaveBeenCalledWith('user_interactions_enhanced');
  });
});

describe('useAnalytics mount', () => {
  it('records no page view on mount and does no periodic work while idle', async () => {
    granted = true;
    const { unmount } = renderHook(() => useAnalytics());
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    unmount();
    await act(async () => {});
    expect(from).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('takes the user from the auth context, not a getUser round trip', async () => {
    granted = true;
    authUser = { id: 'user-1' };
    const { result } = renderHook(() => useAnalytics());
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
    });
    expect(getUser).not.toHaveBeenCalled();
    const row = insertByTable.get('user_analytics')!.mock.calls[0][0] as { user_id: string };
    expect(row.user_id).toBe('user-1');
  });

  it('shares one session id across mounted instances', () => {
    const a = renderHook(() => useAnalytics());
    const b = renderHook(() => useAnalytics());
    expect(a.result.current.sessionId).toBe(b.result.current.sessionId);
  });
});

describe('useAnalytics flush', () => {
  it('re-queues a batch the database rejected, and sends metrics only once it lands', async () => {
    granted = true;
    const enhanced = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'permission denied', code: '42501' } })
      .mockResolvedValue({ error: null });
    insertByTable.set('user_interactions_enhanced', enhanced);

    const { result } = renderHook(() => useAnalytics());
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
    });

    await act(async () => {
      await result.current.flushEventQueue();
    });
    expect(enhanced).toHaveBeenCalledTimes(1);
    const firstBatch = enhanced.mock.calls[0][0] as Array<{ content_id: string }>;
    expect(firstBatch).toHaveLength(1);
    // Not counted while the rows are not stored.
    expect(invoke).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flushEventQueue();
    });
    expect(enhanced).toHaveBeenCalledTimes(2);
    expect(enhanced.mock.calls[1][0]).toEqual(firstBatch);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('log-content-metrics');

    // And it is gone from the queue once stored.
    await act(async () => {
      await result.current.flushEventQueue();
    });
    expect(enhanced).toHaveBeenCalledTimes(2);
  });

  it('does not copy a rejected batch into user_analytics, which trackEvent already wrote', async () => {
    granted = true;
    insertByTable.set(
      'user_interactions_enhanced',
      vi.fn().mockResolvedValue({ error: { message: 'down', code: '503' } }),
    );
    const { result } = renderHook(() => useAnalytics());
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
      await result.current.flushEventQueue();
    });
    expect(insertByTable.get('user_analytics')).toHaveBeenCalledTimes(1);
  });

  it('flushes on its own after the delay, then stops', async () => {
    granted = true;
    const { result } = renderHook(() => useAnalytics());
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId: CONTENT_ID });
    });
    expect(insertByTable.get('user_interactions_enhanced')).toBeUndefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(insertByTable.get('user_interactions_enhanced')).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * WEB-QA-038: a rejected batch was retried every 10s for as long as the tab
 * stayed open. Retries now back off from 10s to a 5-minute cap, and a batch the
 * database refuses three times in a row (4xx / PostgREST code) is dropped.
 * Network failures and 5xx keep the batch.
 */
describe('useAnalytics retry backoff', () => {
  /** Advance to just before `ms`, check nothing fired, then to `ms`. */
  async function expectFlushAfter(insert: ReturnType<typeof vi.fn>, ms: number) {
    const before = insert.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms - 1);
    });
    expect(insert).toHaveBeenCalledTimes(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(insert).toHaveBeenCalledTimes(before + 1);
  }

  async function trackOne(result: { current: ReturnType<typeof useAnalytics> }, contentId = CONTENT_ID) {
    await act(async () => {
      await result.current.trackEvent({ eventType: 'click', contentType: 'event', contentId });
    });
  }

  it('doubles the wait after each network failure, caps it at 5 minutes, and keeps the batch', async () => {
    granted = true;
    const enhanced = vi.fn().mockResolvedValue({ error: { message: 'Failed to fetch', code: '' }, status: 0 });
    insertByTable.set('user_interactions_enhanced', enhanced);
    const { result } = renderHook(() => useAnalytics());
    await trackOne(result);

    await expectFlushAfter(enhanced, 10_000); // first send
    for (const wait of [10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000, 300_000]) {
      await expectFlushAfter(enhanced, wait);
    }
    // Every attempt still carries the original row.
    for (const call of enhanced.mock.calls) {
      expect(call[0]).toHaveLength(1);
    }
    expect(vi.getTimerCount()).toBe(1);
  });

  it('treats a 5xx as transient: the batch is kept past three failures', async () => {
    granted = true;
    const enhanced = vi.fn().mockResolvedValue({ error: { message: 'bad gateway', code: '' }, status: 502 });
    insertByTable.set('user_interactions_enhanced', enhanced);
    const { result } = renderHook(() => useAnalytics());
    await trackOne(result);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(enhanced.mock.calls.length).toBeGreaterThan(3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('drops a batch after three schema rejections and stops sending it', async () => {
    granted = true;
    const enhanced = vi
      .fn()
      .mockResolvedValue({ error: { message: 'relation does not exist', code: '42P01' }, status: 404 });
    insertByTable.set('user_interactions_enhanced', enhanced);
    const { result } = renderHook(() => useAnalytics());
    await trackOne(result);

    await expectFlushAfter(enhanced, 10_000);
    await expectFlushAfter(enhanced, 10_000);
    await expectFlushAfter(enhanced, 20_000);
    // Third rejection: dropped, nothing left armed.
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000);
    });
    expect(enhanced).toHaveBeenCalledTimes(3);
    expect(invoke).not.toHaveBeenCalled();

    // A new event goes out on the backoff (three failures: 40s), and alone.
    const OTHER_ID = '99999999-8888-7777-6666-555555555555';
    enhanced.mockResolvedValue({ error: null, status: 201 });
    await trackOne(result, OTHER_ID);
    await expectFlushAfter(enhanced, 40_000);
    const batch = enhanced.mock.calls[3][0] as Array<{ content_id: string }>;
    expect(batch.map((r) => r.content_id)).toEqual([OTHER_ID]);

    // Once a batch lands the delay is back to 10s.
    await trackOne(result);
    await expectFlushAfter(enhanced, 10_000);
  });

  it('classifies errors and computes the delay', () => {
    expect(isPermanentRejection({ code: 'PGRST204' })).toBe(true);
    expect(isPermanentRejection({ code: '42703' }, 400)).toBe(true);
    expect(isPermanentRejection({ code: '' }, 0)).toBe(false);
    expect(isPermanentRejection({ code: '' }, 503)).toBe(false);
    expect(isPermanentRejection({ code: '' }, 429)).toBe(false);
    expect(isPermanentRejection({ code: '' }, 408)).toBe(false);
    expect(isPermanentRejection({ code: '503' })).toBe(false);
    expect(retryDelayMs(0)).toBe(10_000);
    expect(retryDelayMs(1)).toBe(10_000);
    expect(retryDelayMs(6)).toBe(300_000);
    expect(retryDelayMs(40)).toBe(300_000);
  });
});
