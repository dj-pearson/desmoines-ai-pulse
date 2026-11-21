/**
 * WEB-FEAT-103: the do-not-ingest list for restaurants.
 *
 * restaurant_blacklist (migration 20260127000000) names places that must not
 * be added to restaurants: not a restaurant, a chain, out of the area, and,
 * since 20261121000140, every listing an admin hid (reason_category
 * 'admin_hidden'). Hiding replaced the admin's hard delete, which the next
 * scrape or Places search could undo by adding the place again.
 *
 * Every path that inserts into restaurants loads the list once per run and
 * drops matching rows before it writes. restaurant-do-not-ingest.test.ts
 * reads each path's source and fails when one stops doing so.
 *
 * The table is admin-read only (WEB-SEC-074), so the client passed in must be
 * the service role.
 */

export interface DoNotIngestList {
  placeIds: ReadonlySet<string>;
  names: ReadonlySet<string>;
}

export interface DoNotIngestEntry {
  google_place_id?: string | null;
  restaurant_name?: string | null;
}

/** Lower case, trimmed, inner whitespace collapsed. Empty for a missing name. */
export function normalizeRestaurantName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

export function buildDoNotIngestList(entries: readonly DoNotIngestEntry[]): DoNotIngestList {
  const placeIds = new Set<string>();
  const names = new Set<string>();
  for (const e of entries) {
    const id = typeof e.google_place_id === 'string' ? e.google_place_id.trim() : '';
    if (id) placeIds.add(id);
    const name = normalizeRestaurantName(e.restaurant_name);
    if (name) names.add(name);
  }
  return { placeIds, names };
}

/** True when the candidate's place id or name is on the list. */
export function isDoNotIngest(
  list: DoNotIngestList,
  candidate: { name?: unknown; google_place_id?: unknown },
): boolean {
  const id = typeof candidate.google_place_id === 'string' ? candidate.google_place_id.trim() : '';
  if (id && list.placeIds.has(id)) return true;
  const name = normalizeRestaurantName(candidate.name);
  return name !== '' && list.names.has(name);
}

/** The rows that may be written, and the names of the ones refused. */
export function withoutDoNotIngest<T extends { name?: unknown; google_place_id?: unknown }>(
  list: DoNotIngestList,
  rows: readonly T[],
): { kept: T[]; refused: string[] } {
  const kept: T[] = [];
  const refused: string[] = [];
  for (const row of rows) {
    if (isDoNotIngest(list, row)) refused.push(String(row.name ?? row.google_place_id ?? ''));
    else kept.push(row);
  }
  return { kept, refused };
}

interface BlacklistQuery {
  from(table: string): {
    select(columns: string): {
      or(filter: string): PromiseLike<{
        data: DoNotIngestEntry[] | null;
        error: { message?: string | null } | null;
      }>;
    };
  };
}

/**
 * The current list: permanent entries and those not yet expired. On a failed
 * read this returns the error and no list. Callers refuse to write restaurant
 * rows in that case rather than write them unchecked, because an unchecked
 * write is exactly how a hidden place comes back.
 */
export async function loadDoNotIngest(
  client: BlacklistQuery,
  now: Date = new Date(),
): Promise<{ list: DoNotIngestList | null; error: string | null }> {
  const { data, error } = await client
    .from('restaurant_blacklist')
    .select('google_place_id, restaurant_name')
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
  if (error) return { list: null, error: error.message || 'restaurant_blacklist read failed' };
  return { list: buildDoNotIngestList(data ?? []), error: null };
}
