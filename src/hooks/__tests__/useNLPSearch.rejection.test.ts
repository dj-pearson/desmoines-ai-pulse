import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * WEB-QA-027. useNLPSearch.search() handed a rejecting promise to three
 * fire-and-forget callers, so a failed search became an unhandled rejection.
 *
 * On web that is console noise on a page that already renders a keyword
 * fallback. Inside the Capacitor apps it is not: main.tsx's
 * unhandledrejection handler calls showErrorOverlay, which returns early only
 * when `!isCapacitor && import.meta.env.PROD`, so a failed search covers the
 * shipped mobile app with a full-screen black "Runtime Error" panel.
 *
 * The assertion is on the PROMISE, not on rendered output, because the defect
 * was never visible in the render - the page was coping.
 */
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { renderHook, act, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createElement } = await import('react');
const { useNLPSearch } = await import('../useNLPSearch');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

let rejections: unknown[] = [];
const onRejection = (e: PromiseRejectionEvent) => {
  rejections.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  rejections = [];
  invoke.mockReset();
  window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => window.removeEventListener('unhandledrejection', onRejection));

describe('useNLPSearch.search when the edge function is unreachable', () => {
  it('resolves with null instead of rejecting', async () => {
    invoke.mockRejectedValue(new Error('FunctionsFetchError: Failed to send a request'));
    const { result } = renderHook(() => useNLPSearch(), { wrapper });

    let resolved: unknown = 'not settled';
    await act(async () => {
      // Exactly how SearchResults and NLPSearchBar call it: no await, no catch.
      resolved = await result.current.search('pizza');
    });

    expect(resolved).toBeNull();
  });

  it('still reports the failure through isError, so the page can fall back', async () => {
    invoke.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useNLPSearch(), { wrapper });

    await act(async () => {
      await result.current.search('pizza');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Swallowing the rejection must not swallow the SIGNAL: SearchResults
    // renders KeywordFallbackResults off isError.
    expect(result.current.hasResults).toBe(false);
  });

  it('returns the response unchanged on success', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        query: 'pizza',
        parsedIntent: { contentTypes: ['restaurants'] },
        results: { events: [], restaurants: [{ id: 'r1' }], attractions: [] },
        metadata: { responseTimeMs: 12 },
      },
      error: null,
    });
    const { result } = renderHook(() => useNLPSearch(), { wrapper });

    let out: { query?: string } | null = null;
    await act(async () => {
      out = (await result.current.search('pizza')) as { query?: string } | null;
    });

    expect(out?.query).toBe('pizza');
    await waitFor(() => expect(result.current.hasResults).toBe(true));
  });

  it('does nothing for a query under the minimum length', async () => {
    const { result } = renderHook(() => useNLPSearch(), { wrapper });
    let out: unknown = 'unset';
    await act(async () => {
      out = await result.current.search('ab');
    });
    expect(out).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
