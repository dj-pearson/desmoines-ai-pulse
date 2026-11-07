import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Loop 12. The fallback reads behind Home's MostSearched logged their errors
 * and returned empty lists as a success, so an outage rendered "No rated
 * places to show right now". A failed read with nothing to show must reach
 * TanStack as an error; a partial failure keeps the rows it got.
 */
type Result = { data: unknown; error: unknown };
/** A table's result, or a queue of them consumed one read at a time. */
const results: Record<string, Result | Result[]> = {};

function next(table: string): Result {
  const r = results[table];
  if (Array.isArray(r)) return r.shift() ?? { data: [], error: null };
  return r ?? { data: [], error: null };
}

/** A PostgREST builder: every filter returns itself, awaiting resolves the table's result. */
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'in', 'or', 'order', 'limit']) b[m] = () => b;
  b.then = (resolve: (r: Result) => unknown) => resolve(next(table));
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => builder(table) },
}));

const { renderHook, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { useTrending } = await import('../useTrending');

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// A permanent PostgREST code, so the hook's own shouldRetry does not retry.
const failure = { code: 'PGRST000', message: 'unreachable' };
const TYPES = ['restaurant', 'attraction', 'playground'] as const;

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
});

describe('useTrending fallback errors', () => {
  it('reports an error when every read fails', async () => {
    for (const t of ['restaurants', 'attractions', 'playgrounds']) results[t] = { data: null, error: failure };
    const { result } = renderHook(() => useTrending({ types: [...TYPES] }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toMatchObject({ code: 'PGRST000' });
    // Shape stays safe for a caller that ignores isError.
    expect(result.current.trending.restaurants).toEqual([]);
  });

  it('keeps the rows from reads that succeeded', async () => {
    results.restaurants = { data: [{ id: 'r1', name: 'Fong', rating: 4.5 }], error: null };
    results.attractions = { data: null, error: failure };
    const { result } = renderHook(() => useTrending({ types: [...TYPES] }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.trending.restaurants).toHaveLength(1);
  });

  it('treats a genuinely empty result as empty, not as an error', async () => {
    const { result } = renderHook(() => useTrending({ types: [...TYPES] }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.hasRealData).toBe(false);
  });

  it('falls back to the organic reads when the trending_scores content read fails', async () => {
    results.trending_scores = {
      data: [
        { id: 's1', content_type: 'restaurant', content_id: 'r9', score: 9, rank: 1 },
        { id: 's2', content_type: 'restaurant', content_id: 'r8', score: 8, rank: 2 },
        { id: 's3', content_type: 'restaurant', content_id: 'r7', score: 7, rank: 3 },
      ],
      error: null,
    };
    // First restaurants read is the enrich read, and it fails; the second is
    // the organic fallback. r1 on screen proves the fallback ran.
    results.restaurants = [
      { data: null, error: failure },
      { data: [{ id: 'r1', name: 'Fong', rating: 4.5 }], error: null },
    ];
    const { result } = renderHook(
      () => useTrending({ types: [...TYPES], readScores: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.hasRealData).toBe(false);
    expect(result.current.trending.restaurants[0]?.contentId).toBe('r1');
  });
});
