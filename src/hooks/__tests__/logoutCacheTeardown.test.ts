import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WEB-SEC-031 -- what a logout leaves behind on a shared browser.
 *
 * Logout removed the sb-* storage keys and nothing else. The TanStack cache
 * survived, so the previous user's profile, favorites, subscription, trip plans
 * and -- if they were an admin -- the whole admin surface stayed readable until
 * staleTime expired.
 *
 * Two halves, and both need pinning:
 *   1. Something has to empty the cache when a session ends.
 *   2. Queries whose ANSWER depends on who is asking have to say so in the key,
 *      or the next account is served the previous one's rows before the first
 *      refetch lands.
 */

const SRC = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('the cache is emptied when a session ends', () => {
  it('clear() removes user-scoped entries, which is what the fix relies on', () => {
    // Pins the mechanism rather than mocking the provider tree: if clear()
    // ever stopped evicting, the fix would be silently inert.
    const qc = new QueryClient();
    qc.setQueryData(['user', 'profile', 'user-a'], { email: 'a@example.com' });
    qc.setQueryData(['favorites', 'user-a'], [{ id: 'e1' }]);
    qc.setQueryData(['all-submitted-events', 'user-a'], [{ id: 's1' }]);
    qc.setQueryData(['events', 'list'], [{ id: 'public' }]);

    expect(qc.getQueryCache().getAll()).toHaveLength(4);

    qc.clear();

    expect(qc.getQueryData(['user', 'profile', 'user-a'])).toBeUndefined();
    expect(qc.getQueryData(['favorites', 'user-a'])).toBeUndefined();
    expect(qc.getQueryData(['all-submitted-events', 'user-a'])).toBeUndefined();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it('AuthContext clears on the SIGNED_OUT event', () => {
    const src = SRC('src/contexts/AuthContext.tsx');
    const branch = src.slice(src.indexOf("if (event === 'SIGNED_OUT')"));
    expect(branch.slice(0, 400)).toContain('clearQueryCache()');
  });

  it('AuthContext also clears inside logout(), because the event never arrives there', () => {
    // handleAuthChange returns early while isLoggingOutRef is set, so the
    // SIGNED_OUT raised by the logout button is dropped before its handler.
    // Covering only the event would miss the common case.
    const src = SRC('src/contexts/AuthContext.tsx');
    const logout = src.slice(src.indexOf('const logout = useCallback'));
    expect(logout.slice(0, 900)).toContain('clearQueryCache()');
    expect(src).toContain('isLoggingOutRef.current');
  });

  it('the clear lives in AuthContext, not in a logout button', () => {
    // Per-button teardown is how one of them ends up missing it.
    const header = SRC('src/components/Header.tsx');
    expect(header).not.toContain('queryClient.clear()');
  });
});

describe('queries whose answer depends on the account say so in the key', () => {
  it('active ads are keyed by user, because the RPC frequency-caps per account', () => {
    const src = SRC('src/hooks/useActiveAds.ts');
    expect(src).toMatch(/queryKey: \['active-ads', placementType, user\?\.id/);
    // The reason the key needs it.
    expect(src).toContain('p_user_id');
  });

  it('the admin submission list is keyed by user', () => {
    const src = SRC('src/hooks/useUserSubmittedEvents.ts');
    expect(src).toMatch(/queryKey: \['all-submitted-events', user\?\.id/);
  });

  it('the hooks that were already keyed still are', () => {
    // The audit found these correct. Pinned so a refactor cannot quietly drop
    // the id back out of a key.
    const cases: [string, RegExp][] = [
      ['src/hooks/useFavorites.ts', /queryKey: \["favorites", user\?\.id\]/],
      ['src/hooks/useSubscription.ts', /queryKey: \["user-subscriptions", user\?\.id\]/],
      ['src/hooks/useTripPlanner.ts', /queryKey: \['trip-plans', user\?\.id\]/],
      ['src/hooks/useApiKeys.ts', /queryKey: \['api-keys', user\?\.id\]/],
      ['src/hooks/useBreweryTrail.ts', /queryKey: \['brewery-checkins', user\?\.id\]/],
      ['src/hooks/useProfile.ts', /queryKeys\.user\.profile\(user\?\.id/],
    ];
    for (const [file, re] of cases) {
      expect(SRC(file), file).toMatch(re);
    }
  });

  it('two accounts never share a cache entry for the same user-scoped query', () => {
    // The property the keys above exist to give: distinct ids, distinct rows.
    const qc = new QueryClient();
    qc.setQueryData(['favorites', 'user-a'], ['a-only']);
    qc.setQueryData(['favorites', 'user-b'], ['b-only']);
    expect(qc.getQueryData(['favorites', 'user-a'])).toEqual(['a-only']);
    expect(qc.getQueryData(['favorites', 'user-b'])).toEqual(['b-only']);
  });
});
