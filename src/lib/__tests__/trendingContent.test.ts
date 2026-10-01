import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { applyPublicVisibility, contentHref } from '@/lib/trendingContent';

/**
 * The Social "Trending" tab fetched rows with select('*') and no visibility
 * filter, so past, hidden, merged or inactive content could list as trending,
 * and it navigated by UUID, which is a 404 for attractions and playgrounds.
 */

/** A builder that records each filter call and returns itself. */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['neq', 'is', 'eq', 'gte']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return q;
    };
  }
  return { q, calls };
}

describe('applyPublicVisibility', () => {
  it('events: not merged, hidden or archived, and not already past', () => {
    const { q, calls } = recorder();
    applyPublicVisibility('event', q);
    expect(calls).toContainEqual(['neq', 'is_merged', true]);
    expect(calls).toContainEqual(['neq', 'is_hidden', true]);
    expect(calls).toContainEqual(['is', 'archived_at', null]);
    const gte = calls.find((c) => c[0] === 'gte');
    expect(gte?.[1]).toBe('date');
    expect(new Date(gte?.[2] as string).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('restaurants drop merged rows; attractions drop inactive ones', () => {
    const r = recorder();
    applyPublicVisibility('restaurant', r.q);
    expect(r.calls).toEqual([['neq', 'is_merged', true]]);

    const a = recorder();
    applyPublicVisibility('attraction', a.q);
    expect(a.calls).toEqual([['eq', 'is_active', true]]);
  });
});

describe('contentHref', () => {
  const ID = '0b9f2c1e-8d7a-4c2b-9e1f-3a4b5c6d7e8f';

  it('never links an attraction or playground by id', () => {
    expect(contentHref('attraction', { name: 'Blank Park Zoo' }, ID)).toBe('/attractions/blank-park-zoo');
    expect(contentHref('playground', { name: 'Union Park' }, ID)).toBe('/playgrounds/union-park');
    expect(contentHref('attraction', null, ID)).toBe('/attractions');
  });

  it('links events by title and Central Time date', () => {
    expect(contentHref('event', { title: 'Jazz in July', event_start_utc: '2026-07-04T02:30:00Z' }, ID)).toBe(
      '/events/jazz-in-july-2026-07-03',
    );
  });

  it('links restaurants by slug, then id', () => {
    expect(contentHref('restaurant', { slug: 'hello-pho' }, ID)).toBe('/restaurants/hello-pho');
    expect(contentHref('restaurant', {}, ID)).toBe(`/restaurants/${ID}`);
  });
});
