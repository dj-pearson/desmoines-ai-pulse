/**
 * Local storage for taste preferences, scoped per account (Home plan WP2 item 1).
 *
 * THE LEAK THIS CLOSES. Preferences used to live under one unscoped key,
 * `desmoines_user_preferences`. Sign in as A, onboard, log out, sign in as B on
 * the same browser: B's first load found no server value, saw a local copy, and
 * uploaded A's interests into B's profile (the "AC3" branch of
 * useUserPreferences). Logout cleared only the sb-* auth keys, so the copy
 * stayed behind for whoever came next.
 *
 * Now:
 *   - each account reads and writes `dmi_user_preferences_v1:<userId>`;
 *   - a guest reads and writes `dmi_user_preferences_v1:anonymous`;
 *   - a local copy is only ever adopted into an account when it is the guest's
 *     own copy or already belongs to that account (`canAdoptLocal`);
 *   - logout removes the account's key and the recently viewed store.
 *
 * The legacy key is read once per account for one release (migrate-on-read,
 * per the storage rule in CLAUDE.md) and never written again.
 */
import { storage } from '@/lib/safeStorage';
// The keys module, not recentlyViewed.ts: this file is imported by AuthContext,
// and recentlyViewed.ts pulls timezone.ts and date-fns into the entry chunk.
import { RECENTLY_VIEWED_KEY, LEGACY_RECENTLY_VIEWED_KEYS } from '@/lib/recentlyViewedKeys';
import type { UserPreferences } from '@/types/preferences';

export const LEGACY_PREFS_KEY = 'desmoines_user_preferences';
export const PREFS_KEY_PREFIX = 'dmi_user_preferences_v1:';
export const ANONYMOUS_USER_ID = 'anonymous';
/** "Not now" on the For You rail's Tune your picks prompt. Cleared on logout. */
export const PREFS_PROMPT_DISMISSED_KEY = 'dmi_prefs_prompt_dismissed_v1';

/** The storage key for one account, or for the guest when userId is empty. */
export function prefsKey(userId: string | null | undefined): string {
  return `${PREFS_KEY_PREFIX}${userId || ANONYMOUS_USER_ID}`;
}

/**
 * The AC3 guard. A local copy may be pushed into an account only when it was
 * written by a guest on this browser or by that same account. Anything else is
 * somebody else's taste.
 */
export function canAdoptLocal(
  local: Pick<UserPreferences, 'userId'> | null | undefined,
  userId: string,
): boolean {
  if (!local || !userId) return false;
  return local.userId === ANONYMOUS_USER_ID || local.userId === userId;
}

export type LocalPreferencesSource =
  /** The account's (or guest's) own scoped key. */
  | 'own'
  /** A guest copy, offered to a signed-in account for adoption. */
  | 'guest'
  | 'none';

export interface LocalPreferencesRead {
  prefs: UserPreferences | null;
  source: LocalPreferencesSource;
}

function isPrefs(value: unknown): value is UserPreferences {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { userId?: unknown }).userId === 'string'
  );
}

function readKey(key: string): UserPreferences | null {
  const value = storage.get<unknown>(key);
  return isPrefs(value) ? value : null;
}

/**
 * Read what this browser holds for `userId` (empty = guest), migrating the
 * legacy unscoped key into the scoped one when it belongs to the reader.
 *
 * For a signed-in account with no copy of its own, a guest copy is returned
 * with source 'guest' so the caller can decide whether to adopt it. A legacy
 * copy written by a different account is never returned.
 */
export function readLocalPreferences(userId: string | null | undefined): LocalPreferencesRead {
  const id = userId || ANONYMOUS_USER_ID;

  const own = readKey(prefsKey(id));
  if (own) return { prefs: own, source: 'own' };

  const legacy = readKey(LEGACY_PREFS_KEY);
  if (legacy && legacy.userId === id) {
    storage.set(prefsKey(id), legacy);
    return { prefs: legacy, source: 'own' };
  }

  if (id === ANONYMOUS_USER_ID) return { prefs: null, source: 'none' };

  const guest = readKey(prefsKey(ANONYMOUS_USER_ID));
  if (guest && canAdoptLocal(guest, id)) return { prefs: guest, source: 'guest' };
  if (legacy && canAdoptLocal(legacy, id)) return { prefs: legacy, source: 'guest' };

  return { prefs: null, source: 'none' };
}

export function writeLocalPreferences(userId: string | null | undefined, prefs: UserPreferences): void {
  storage.set(prefsKey(userId), prefs);
}

/**
 * Called once a guest copy has been adopted into an account. The copy now
 * lives under the account's key; leaving it under the guest key would offer it
 * to the next person who signs in on this browser.
 */
export function forgetGuestPreferences(): void {
  storage.remove(prefsKey(ANONYMOUS_USER_ID));
  const legacy = readKey(LEGACY_PREFS_KEY);
  if (legacy && legacy.userId === ANONYMOUS_USER_ID) storage.remove(LEGACY_PREFS_KEY);
}

/**
 * Logout teardown for everything personal this browser holds outside the auth
 * keys: the account's preferences (scoped and legacy), recently viewed, and
 * the dismissed prompt flag (so the next account is offered onboarding).
 * Recently viewed is not scoped per account, so it goes entirely.
 */
export function clearPersonalStorage(userId: string | null | undefined): void {
  if (userId) {
    storage.remove(prefsKey(userId));
    const legacy = readKey(LEGACY_PREFS_KEY);
    if (legacy && legacy.userId === userId) storage.remove(LEGACY_PREFS_KEY);
  }
  storage.remove(RECENTLY_VIEWED_KEY);
  storage.remove(PREFS_PROMPT_DISMISSED_KEY);
  for (const key of LEGACY_RECENTLY_VIEWED_KEYS) storage.remove(key);
}
