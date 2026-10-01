import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AUTH_NEXT_KEY,
  AUTH_RETURN_TTL_MS,
  PENDING_ACTION_KEY,
  rememberAuthNext,
  stashPendingAction,
  takeAuthNext,
  takePendingAction,
} from '@/lib/authReturn';
import { storage } from '@/lib/safeStorage';

/**
 * Account plan WP2 item 2. Sign-up used to end on '/' whatever page it started
 * from. These pin the return path's lifetime (one hour, one read) and that a
 * stored value is re-validated rather than trusted.
 */

const START = new Date('2026-09-25T15:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  storage.remove(AUTH_NEXT_KEY);
  storage.remove(PENDING_ACTION_KEY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rememberAuthNext / takeAuthNext', () => {
  it('returns the remembered path with its query string', () => {
    rememberAuthNext('/events?q=jazz%20night');
    expect(takeAuthNext()).toBe('/events?q=jazz%20night');
  });

  it('returns it once', () => {
    rememberAuthNext('/restaurants/open-now');
    expect(takeAuthNext()).toBe('/restaurants/open-now');
    expect(takeAuthNext()).toBeNull();
  });

  it('is null with nothing stored', () => {
    expect(takeAuthNext()).toBeNull();
  });

  it('expires after an hour', () => {
    rememberAuthNext('/events');
    vi.setSystemTime(START.getTime() + AUTH_RETURN_TTL_MS + 1);
    expect(takeAuthNext()).toBeNull();
  });

  it('is still good just inside the hour', () => {
    rememberAuthNext('/events');
    vi.setSystemTime(START.getTime() + AUTH_RETURN_TTL_MS - 1000);
    expect(takeAuthNext()).toBe('/events');
  });

  it('refuses an off-site path and clears the older one', () => {
    rememberAuthNext('/attractions');
    rememberAuthNext('//evil.com');
    expect(takeAuthNext()).toBeNull();
  });

  it('never sends someone back to an auth page', () => {
    rememberAuthNext('/auth?mode=signup');
    expect(takeAuthNext()).toBeNull();
    rememberAuthNext('/auth/verified');
    expect(takeAuthNext()).toBeNull();
  });

  it('keeps a path that merely starts with the same letters', () => {
    rememberAuthNext('/authors');
    expect(takeAuthNext()).toBe('/authors');
  });

  it('re-validates on read, so a value planted in storage is not trusted', () => {
    storage.set(AUTH_NEXT_KEY, { path: 'https://evil.com', savedAt: Date.now() });
    expect(takeAuthNext()).toBeNull();
    storage.set(AUTH_NEXT_KEY, { path: '/\\evil.com', savedAt: Date.now() });
    expect(takeAuthNext()).toBeNull();
  });

  it('ignores a malformed stored value', () => {
    storage.setString(AUTH_NEXT_KEY, 'not json');
    expect(takeAuthNext()).toBeNull();
    storage.set(AUTH_NEXT_KEY, { path: '/events' });
    expect(takeAuthNext()).toBeNull();
  });

  it('rejects a timestamp from the future', () => {
    storage.set(AUTH_NEXT_KEY, { path: '/events', savedAt: Date.now() + 60_000 });
    expect(takeAuthNext()).toBeNull();
  });
});

describe('stashPendingAction / takePendingAction', () => {
  it('returns the stashed action once', () => {
    stashPendingAction({ type: 'favorite', payload: { id: 'evt-1', kind: 'event' } });
    expect(takePendingAction('favorite')).toEqual({
      type: 'favorite',
      payload: { id: 'evt-1', kind: 'event' },
    });
    expect(takePendingAction('favorite')).toBeNull();
  });

  it('keeps each type separate', () => {
    stashPendingAction({ type: 'favorite', payload: 'a' });
    stashPendingAction({ type: 'save-search', payload: 'b' });
    expect(takePendingAction('watch-search')).toBeNull();
    expect(takePendingAction('save-search')?.payload).toBe('b');
    expect(takePendingAction('favorite')?.payload).toBe('a');
  });

  it('lets the latest tap of a type win', () => {
    stashPendingAction({ type: 'favorite', payload: 'first' });
    stashPendingAction({ type: 'favorite', payload: 'second' });
    expect(takePendingAction('favorite')?.payload).toBe('second');
  });

  it('drops an action older than an hour, and does not return it later', () => {
    stashPendingAction({ type: 'watch-search', payload: { q: 'jazz' } });
    vi.setSystemTime(START.getTime() + AUTH_RETURN_TTL_MS + 1);
    expect(takePendingAction('watch-search')).toBeNull();
    vi.setSystemTime(START);
    expect(takePendingAction('watch-search')).toBeNull();
  });

  it('removes the storage key once nothing is pending', () => {
    stashPendingAction({ type: 'favorite', payload: 1 });
    takePendingAction('favorite');
    expect(storage.getString(PENDING_ACTION_KEY)).toBeNull();
  });

  it('ignores an unknown type rather than storing it', () => {
    stashPendingAction({ type: 'delete-account' as 'favorite', payload: 1 });
    expect(storage.getString(PENDING_ACTION_KEY)).toBeNull();
  });
});
