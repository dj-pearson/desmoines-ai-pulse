import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { eventsQueryKey } from '@/hooks/useEvents';

/**
 * WEB-PERF-032 AC4. The invalidation behaviour these pin is structural: TanStack
 * matches a query key by PREFIX, so which rung a key sits on decides what a
 * write takes out. Before this, the homepage's featured rail sat one rung above
 * every list, so nothing could refresh "all lists" without also refetching a
 * rail that could not have changed.
 */

/** What invalidateQueries({ queryKey: prefix }) would match. */
const matches = (prefix: readonly unknown[], key: readonly unknown[]) =>
  prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(key[i]));

describe('events query keys', () => {
  it('nests every list under events.lists()', () => {
    const lists = queryKeys.events.lists();
    for (const key of [
      queryKeys.events.list({ hub: 'music' }),
      queryKeys.events.list({ venue: 'Wells Fargo Arena' }),
      queryKeys.events.list({ price: 'free' }),
      eventsQueryKey({ category: 'Music' }),
    ]) {
      expect(matches(lists, key), JSON.stringify(key)).toBe(true);
    }
  });

  it('keeps the featured rail OUT of lists()', () => {
    // The defect: ['events','featured',day] under a ['events'] invalidation.
    const featured = queryKeys.events.featured('2026-09-18');
    expect(matches(queryKeys.events.lists(), featured)).toBe(false);
    expect(matches(queryKeys.events.details(), featured)).toBe(false);
    // ...but a deliberate featured invalidation still reaches it.
    expect(matches(queryKeys.events.featuredAll(), featured)).toBe(true);
  });

  it('keeps details out of lists and lists out of details', () => {
    const detail = queryKeys.events.detail('abc');
    expect(matches(queryKeys.events.details(), detail)).toBe(true);
    expect(matches(queryKeys.events.lists(), detail)).toBe(false);
    expect(matches(queryKeys.events.details(), queryKeys.events.list({}))).toBe(false);
  });

  it('still lets the catch-all events.all reach everything', () => {
    // useClearEventCache means "drop everything about events" and relies on it.
    for (const key of [
      queryKeys.events.list({ hub: 'sports' }),
      queryKeys.events.detail('abc'),
      queryKeys.events.featured('2026-09-18'),
      queryKeys.events.social('abc'),
    ]) {
      expect(matches(queryKeys.events.all, key), JSON.stringify(key)).toBe(true);
    }
  });

  it('gives distinct filters distinct keys', () => {
    const a = JSON.stringify(eventsQueryKey({ category: 'Music' }));
    const b = JSON.stringify(eventsQueryKey({ category: 'Sports' }));
    const c = JSON.stringify(queryKeys.events.list({ hub: 'music' }));
    const d = JSON.stringify(queryKeys.events.list({ hub: 'sports' }));
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('gives an absent filter and an undefined filter the SAME key', () => {
    // eventsQueryKey spells each field out and defaults it, rather than
    // spreading the caller's object. Spreading would make {} and
    // { category: undefined } two cache entries for one query - two requests,
    // and a write that refreshes only one of them.
    expect(JSON.stringify(eventsQueryKey({}))).toBe(
      JSON.stringify(eventsQueryKey({ category: undefined, search: undefined }))
    );
  });

  it('defaults sortBy so an explicit default does not fork the cache', () => {
    expect(JSON.stringify(eventsQueryKey({}))).toBe(
      JSON.stringify(eventsQueryKey({ sortBy: 'soonest' }))
    );
    expect(JSON.stringify(eventsQueryKey({}))).not.toBe(
      JSON.stringify(eventsQueryKey({ sortBy: 'featured' }))
    );
  });
});
