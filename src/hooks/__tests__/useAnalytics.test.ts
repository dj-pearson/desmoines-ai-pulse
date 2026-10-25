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
const { useAnalytics } = await import('../useAnalytics');

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
