/**
 * WEB-BE-069: fields a person set on a restaurant are not overwritten by
 * Google.
 *
 * restaurants.locked_fields (migration 20261121000070) maps a field name to
 * who set it and when. update_claimed_listing writes it for owner edits and
 * set_restaurant_field_locks for admin edits. Every write
 * bulk-update-restaurants makes goes through withoutLockedFields first, so a
 * locked field keeps the person's value however many times the row is
 * enriched, including after "Clear Enhanced Status".
 *
 * Which fields CAN be locked is decided in SQL (restaurant_lockable_fields()).
 * This module does not keep its own list: it drops whatever the row's map
 * names, apart from the bookkeeping keys below, which a lock must never stop.
 */

import { isUnknownColumnError } from './postgrestErrors.ts';

export const LOCKS_COLUMN = 'locked_fields';

/** Keys a write needs whatever the map says: the row id and the run's own stamps. */
const NEVER_LOCKED = new Set([
  'id',
  'name',
  'updated_at',
  'enhanced',
  'enrich_checked_at',
  'hours_checked_at',
  'place_lookup_checked_at',
]);

/** The field names a stored locked_fields value locks. Anything malformed locks nothing. */
export function lockedFieldNames(raw: unknown): Set<string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return new Set();
  return new Set(Object.keys(raw as Record<string, unknown>).filter((k) => !NEVER_LOCKED.has(k)));
}

/**
 * WEB-BE-070: columns that describe a lockable field and go with it. A locked
 * rating keeps the person's number, so Google's review count and check date
 * must not be written beside it as if they described that number; a locked
 * price_range must not be stamped as Google's.
 */
export const LOCK_COMPANIONS: Readonly<Record<string, readonly string[]>> = {
  rating: ['google_review_count', 'google_rating_checked_at'],
  price_range: ['price_range_source', 'price_range_source_at'],
};

/**
 * The update with every locked field (and its companions) removed, and the
 * names removed. The input is not modified.
 */
export function withoutLockedFields<T extends object>(
  update: T,
  locked: unknown,
): { update: T; skipped: string[] } {
  const names = lockedFieldNames(locked);
  if (names.size === 0) return { update, skipped: [] };
  for (const name of [...names]) {
    for (const companion of LOCK_COMPANIONS[name] ?? []) names.add(companion);
  }
  const out: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(update)) {
    if (names.has(key)) skipped.push(key);
    else out[key] = value;
  }
  return { update: out as T, skipped };
}

/** A select list with locked_fields added. */
export function withLocksColumn(select: string): string {
  return `${select}, ${LOCKS_COLUMN}`;
}

export interface SelectResult<R> {
  data: R[] | null;
  error: { code?: string | null; message?: string | null } | null;
}

/**
 * Runs a select with locked_fields, and again without it when PostgREST says
 * the column does not exist. Edge functions deploy separately from
 * migrations; without the retry, deploying this before 20261121000070 would
 * stop every enrichment run at its first query. In that window no lock can
 * exist yet, so reading none is correct.
 */
export async function selectWithLocks<R>(
  run: (select: string) => PromiseLike<SelectResult<R>>,
  select: string,
): Promise<SelectResult<R> & { locksRead: boolean }> {
  const first = await run(withLocksColumn(select));
  if (first.error && isUnknownColumnError(first.error)) {
    const retry = await run(select);
    return { ...retry, locksRead: false };
  }
  return { ...first, locksRead: true };
}
