/**
 * WEB-BE-066: the rules the full restaurant enrichment in
 * bulk-update-restaurants follows, kept pure so restaurant-enrich.test.ts runs
 * offline.
 *
 * Three defects made the daily auto-enrich job do harm instead of work:
 *   1. auto-enrich-restaurants posted the ids of the incomplete rows it had
 *      picked, and bulk-update-restaurants never read them. With forceUpdate
 *      its select was unordered and unfiltered, so each run re-enriched
 *      whichever rows Postgres returned first.
 *   2. That select left out description, so the current description always
 *      read as missing and a place with no Google editorial summary had its
 *      description set to null.
 *   3. The last fallback search was the bare name, and places[0] was taken
 *      with no name check, so a different business's address, phone and
 *      website could be written onto the row.
 */

import { normalizePlaceName, type PlaceCandidate } from './placeLookup.ts';

/** The columns the enrichment reads. description is here so it can be kept. */
export const ENRICH_SELECT = 'id, name, location, google_place_id, enhanced, description';

/** Matches the batch cap in bulk-update-restaurants (each row is a paid lookup). */
export const ENRICH_IDS_MAX = 50;

/** A row stamped enrich_checked_at is not offered to the daily job again for this long. */
export const ENRICH_RETRY_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The restaurantIds a caller sent, deduplicated and capped, or null when the
 * field is absent or holds no usable id. Null means the old behaviour, so a
 * caller that never sends the field sees no change.
 */
export function parseRestaurantIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && UUID.test(v)))];
  return ids.length > 0 ? ids.slice(0, ENRICH_IDS_MAX) : null;
}

/** A cursor id from the request, or null. */
export function parseCursor(raw: unknown): string | null {
  return typeof raw === 'string' && UUID.test(raw) ? raw : null;
}

/** The query methods the target selection uses, so a test can record them. */
export interface EnrichQuery<Q> {
  in(column: string, values: string[]): Q;
  or(filter: string): Q;
  gt(column: string, value: string): Q;
  order(column: string, options: { ascending: boolean }): Q;
  limit(count: number): Q;
}

export interface EnrichTargetOptions {
  restaurantIds: string[] | null;
  forceUpdate: boolean;
  afterId: string | null;
  batchSize: number;
}

/**
 * Applies the row selection to a query that has already called
 * select(ENRICH_SELECT).
 *
 * With ids: exactly those rows. Without: rows in id order after the cursor,
 * so repeated force runs reach different rows (the caller passes back the
 * response's lastId). Without forceUpdate, rows already enhanced are skipped,
 * as before.
 */
export function applyEnrichTargets<Q extends EnrichQuery<Q>>(query: Q, opts: EnrichTargetOptions): Q {
  let q = query;
  if (opts.restaurantIds) {
    q = q.in('id', opts.restaurantIds);
  } else if (opts.afterId) {
    q = q.gt('id', opts.afterId);
  }
  if (!opts.forceUpdate) q = q.or('enhanced.is.null,enhanced.neq.completed');
  return q.order('id', { ascending: true }).limit(opts.batchSize);
}

/**
 * The description field to write, or an empty object to leave it as it is.
 *
 * Google's editorial summary replaces the description when it has one. When
 * it has none, nothing is written: a stored description, even the generic
 * "Discovered via Google Places API" one, is never replaced with null.
 */
export function descriptionUpdate(
  current: string | null | undefined,
  editorialSummary: string | null | undefined,
): { description?: string } {
  const summary = (editorialSummary ?? '').trim();
  if (!summary) return {};
  if ((current ?? '').trim() === summary) return {};
  return { description: summary };
}

/**
 * The first Text Search hit whose normalised name equals the restaurant's,
 * or null. Search results are ranked by Google, and the query with the bare
 * name is the loosest of them; a hit with another name is another business.
 */
export function pickNamedSearchHit(name: string, places: PlaceCandidate[]): PlaceCandidate | null {
  const want = normalizePlaceName(name);
  if (!want) return null;
  return (
    places.find(
      (p) => typeof p.id === 'string' && p.id !== '' && normalizePlaceName(p.displayName?.text ?? '') === want,
    ) ?? null
  );
}

/** The ISO time before which a stamped row is due again. */
export function enrichRetryCutoff(now: Date = new Date(), days: number = ENRICH_RETRY_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/** PostgREST .or() filter: never checked, or checked before the cutoff. */
export function enrichDueFilter(cutoff: string): string {
  return `enrich_checked_at.is.null,enrich_checked_at.lt.${cutoff}`;
}
