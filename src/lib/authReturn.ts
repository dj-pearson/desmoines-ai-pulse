/**
 * Where to send someone once their account exists (account plan WP2 item 2).
 *
 * Sign-up used to end on '/' whatever page it started from: the confirmation
 * email's link goes to /auth/callback and then /auth/verified, and neither knew
 * where the person had been. This keeps that path in this browser for an hour,
 * so the confirmed account can land back on `/events?q=jazz%20night` rather
 * than the home page.
 *
 * It also holds one pending tap per kind (a heart, a saved search, a watched
 * search) so the button that sent someone to sign up can finish the job when
 * they come back. The buttons' owners adopt it; this file only stores.
 *
 * PER-BROWSER ONLY. A confirmation link opened on another device finds nothing
 * here, and the page falls back to '/'. Carrying the path in the callback URL
 * is the cross-device fix and belongs to AuthContext (Home WP2 hand-off).
 *
 * Every value read back is re-validated. Storage is writable by anything on
 * this origin, so a stored path is treated as untrusted input, not as the
 * value this file wrote.
 */
import { getSafeRedirectUrl } from '@/lib/redirectSafety';
import { storage } from '@/lib/safeStorage';

export const AUTH_NEXT_KEY = 'dmi_auth_next_v1';
export const PENDING_ACTION_KEY = 'dmi_pending_action_v1';

/** One hour: long enough to find the email and click it, short enough not to surprise. */
export const AUTH_RETURN_TTL_MS = 60 * 60 * 1000;

export type PendingActionType = 'favorite' | 'save-search' | 'watch-search';

export interface PendingAction {
  type: PendingActionType;
  payload: unknown;
}

interface StoredNext {
  path: string;
  savedAt: number;
}

interface StoredAction {
  payload: unknown;
  savedAt: number;
}

type StoredActions = Partial<Record<PendingActionType, StoredAction>>;

const PENDING_TYPES: readonly PendingActionType[] = ['favorite', 'save-search', 'watch-search'];

/** A fallback no valid result can equal (every valid one starts with '/'). */
const INVALID = 'not-a-path';

function validPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const safe = getSafeRedirectUrl(value, INVALID);
  return safe === INVALID ? null : safe;
}

/**
 * The auth pages themselves are never a destination: coming back to /auth
 * after confirming an email would ask a signed-in person to sign in.
 */
function isAuthPage(path: string): boolean {
  return path === '/auth' || path.startsWith('/auth/') || path.startsWith('/auth?') || path.startsWith('/auth#');
}

function isFresh(savedAt: unknown, now: number): boolean {
  return typeof savedAt === 'number' && now - savedAt >= 0 && now - savedAt <= AUTH_RETURN_TTL_MS;
}

/**
 * Remember where to land after sign-up or OAuth. An invalid path, or an auth
 * page, clears whatever was stored before rather than leaving an older path to
 * be picked up by the wrong sign-up.
 */
export function rememberAuthNext(path: string): void {
  const safe = validPath(path);
  if (!safe || isAuthPage(safe)) {
    storage.remove(AUTH_NEXT_KEY);
    return;
  }
  const value: StoredNext = { path: safe, savedAt: Date.now() };
  storage.set(AUTH_NEXT_KEY, value);
}

function readNext(): string | null {
  const stored = storage.get<StoredNext>(AUTH_NEXT_KEY);
  if (!stored || typeof stored !== 'object') return null;
  if (!isFresh(stored.savedAt, Date.now())) return null;
  const safe = validPath(stored.path);
  if (!safe || isAuthPage(safe)) return null;
  return safe;
}

/**
 * The remembered path, once. Removed on read whether or not it was usable, so
 * a second sign-in in this browser does not inherit the first one's page.
 */
export function takeAuthNext(): string | null {
  const next = readNext();
  storage.remove(AUTH_NEXT_KEY);
  return next;
}

/**
 * The remembered path without consuming it, for a render that may run twice
 * (React's dev double render). Pair it with takeAuthNext() in an effect.
 */
export function peekAuthNext(): string | null {
  return readNext();
}

function readActions(): StoredActions {
  const stored = storage.get<StoredActions>(PENDING_ACTION_KEY);
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

function writeActions(actions: StoredActions): void {
  if (Object.keys(actions).length === 0) {
    storage.remove(PENDING_ACTION_KEY);
  } else {
    storage.set(PENDING_ACTION_KEY, actions);
  }
}

/**
 * Hold one tap until the account exists. A second stash of the same type
 * replaces the first: the latest tap is the one the person meant.
 */
export function stashPendingAction(action: PendingAction): void {
  if (!PENDING_TYPES.includes(action.type)) return;
  const actions = readActions();
  actions[action.type] = { payload: action.payload, savedAt: Date.now() };
  writeActions(actions);
}

/**
 * The held tap of this type, at most once and only within the hour. The entry
 * is removed on read, so a remount or a second tab cannot replay it.
 */
export function takePendingAction(type: PendingActionType): PendingAction | null {
  const actions = readActions();
  const entry = actions[type];
  if (!entry) return null;
  delete actions[type];
  writeActions(actions);
  if (!isFresh(entry.savedAt, Date.now())) return null;
  return { type, payload: entry.payload };
}
