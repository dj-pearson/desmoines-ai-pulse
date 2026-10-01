import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '@/lib/safeStorage';
import {
  ANONYMOUS_USER_ID,
  LEGACY_PREFS_KEY,
  PREFS_PROMPT_DISMISSED_KEY,
  canAdoptLocal,
  clearPersonalStorage,
  forgetGuestPreferences,
  prefsKey,
  readLocalPreferences,
  writeLocalPreferences,
} from '@/lib/userPreferencesStore';
import { RECENTLY_VIEWED_KEY, LEGACY_EVENTS_KEY } from '@/lib/recentlyViewed';
import { defaultPreferences, type UserPreferences } from '@/types/preferences';

/**
 * Home plan WP2 item 1: taste preferences leaked between accounts on one
 * browser. These pin the guard and the one-release legacy migration.
 */
const prefs = (userId: string, tags: string[] = []): UserPreferences => ({
  ...defaultPreferences,
  userId,
  interests: { ...defaultPreferences.interests, tags },
});

describe('canAdoptLocal (the AC3 guard)', () => {
  it('adopts a guest copy into any account', () => {
    expect(canAdoptLocal(prefs(ANONYMOUS_USER_ID), 'user-b')).toBe(true);
  });

  it("adopts the account's own copy", () => {
    expect(canAdoptLocal(prefs('user-b'), 'user-b')).toBe(true);
  });

  it("refuses another account's copy", () => {
    expect(canAdoptLocal(prefs('user-a'), 'user-b')).toBe(false);
  });

  it('refuses nothing-to-adopt and an empty user id', () => {
    expect(canAdoptLocal(null, 'user-b')).toBe(false);
    expect(canAdoptLocal(prefs(ANONYMOUS_USER_ID), '')).toBe(false);
  });
});

describe('readLocalPreferences', () => {
  beforeEach(() => storage.clear());

  it('scopes keys per account', () => {
    expect(prefsKey('user-a')).not.toBe(prefsKey('user-b'));
    expect(prefsKey(null)).toBe(prefsKey(ANONYMOUS_USER_ID));
  });

  it("never hands A's legacy copy to B, as own or as adoptable", () => {
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    const read = readLocalPreferences('user-b');
    expect(read.prefs).toBeNull();
    expect(read.source).toBe('none');
  });

  it("never hands A's legacy copy to a guest", () => {
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    expect(readLocalPreferences(null).prefs).toBeNull();
  });

  it("migrates the legacy key into the owner's scoped key on read", () => {
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    const read = readLocalPreferences('user-a');
    expect(read.source).toBe('own');
    expect(read.prefs?.interests.tags).toEqual(['free']);
    expect(storage.get<UserPreferences>(prefsKey('user-a'))?.interests.tags).toEqual(['free']);
  });

  it('migrates a guest legacy copy for the guest', () => {
    storage.set(LEGACY_PREFS_KEY, prefs(ANONYMOUS_USER_ID, ['family']));
    const read = readLocalPreferences(undefined);
    expect(read.source).toBe('own');
    expect(storage.get<UserPreferences>(prefsKey(null))?.interests.tags).toEqual(['family']);
  });

  it('offers a guest copy to a signed-in account for adoption', () => {
    writeLocalPreferences(null, prefs(ANONYMOUS_USER_ID, ['patio']));
    const read = readLocalPreferences('user-b');
    expect(read.source).toBe('guest');
    expect(read.prefs?.interests.tags).toEqual(['patio']);
  });

  it('prefers the scoped key over the legacy one', () => {
    writeLocalPreferences('user-a', prefs('user-a', ['downtown']));
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    expect(readLocalPreferences('user-a').prefs?.interests.tags).toEqual(['downtown']);
  });

  it('forgetGuestPreferences removes the guest copy once adopted', () => {
    writeLocalPreferences(null, prefs(ANONYMOUS_USER_ID, ['patio']));
    storage.set(LEGACY_PREFS_KEY, prefs(ANONYMOUS_USER_ID, ['patio']));
    forgetGuestPreferences();
    expect(readLocalPreferences('user-b').source).toBe('none');
  });
});

describe('clearPersonalStorage (logout)', () => {
  beforeEach(() => storage.clear());

  it("removes the account's prefs, its legacy copy and recently viewed", () => {
    writeLocalPreferences('user-a', prefs('user-a', ['free']));
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    storage.set(RECENTLY_VIEWED_KEY, [{ id: 'e1' }]);
    storage.set(LEGACY_EVENTS_KEY, [{ id: 'e1' }]);
    storage.set(PREFS_PROMPT_DISMISSED_KEY, true);

    clearPersonalStorage('user-a');

    expect(storage.get(PREFS_PROMPT_DISMISSED_KEY)).toBeNull();
    expect(storage.get(prefsKey('user-a'))).toBeNull();
    expect(storage.get(LEGACY_PREFS_KEY)).toBeNull();
    expect(storage.get(RECENTLY_VIEWED_KEY)).toBeNull();
    expect(storage.get(LEGACY_EVENTS_KEY)).toBeNull();
  });

  it("leaves another account's scoped copy alone", () => {
    writeLocalPreferences('user-c', prefs('user-c'));
    clearPersonalStorage('user-a');
    expect(storage.get(prefsKey('user-c'))).not.toBeNull();
  });

  it('after A logs out, B starts with nothing from A', () => {
    storage.set(LEGACY_PREFS_KEY, prefs('user-a', ['free']));
    writeLocalPreferences('user-a', prefs('user-a', ['free']));
    clearPersonalStorage('user-a');
    const read = readLocalPreferences('user-b');
    expect(read.prefs).toBeNull();
  });
});
