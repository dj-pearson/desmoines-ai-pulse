/**
 * Which rows get SEO content, and the per-row lock that stops two runs paying
 * for the same one.
 *
 * PURE of remote imports so a test can drive it with an in-memory table (see
 * ./prompts.ts for why index.ts cannot be imported).
 *
 * THE LOCK USED TO BE A STRING. A row was claimed by writing
 * seo_title = 'PROCESSING...' and released only in the catch block, so a crash,
 * a timeout or a killed isolate left the row claimed forever: it no longer
 * matched "seo_title is null" and nothing ever looked at it again. It also never
 * excluded anyone - the claim checked only for an error, and an UPDATE that
 * matches no row is not an error. The lock is now seo_locked_at, a claim is an
 * UPDATE that must return the row, and a lock older than SEO_LOCK_STALE_MINUTES
 * is treated as free.
 *
 * EVENTS: UPCOMING ONLY, WRITEUP FIRST. There was no date filter, so a run spent
 * money on events that had already happened. Events with an ai_writeup come
 * first because the prompt builds geo_summary and the FAQ from it; an event
 * without one is taken only when it starts within IMMINENT_HOURS, so a page is
 * not left bare for want of a writeup, and otherwise waits for
 * bulk-enhance-events (which runs 7 minutes earlier on the same cadence).
 */

export const SEO_LOCK_STALE_MINUTES = 15;
export const IMMINENT_HOURS = 24;

/** seo_title is missing. 'PROCESSING...' is not here on purpose: see above. */
export const NEEDS_SEO_FILTER = 'seo_title.is.null,seo_title.eq.""';

export const EVENT_SEO_COLUMNS = 'id, title, venue, location, date, category, ai_writeup, seo_locked_at';
export const RESTAURANT_SEO_COLUMNS =
  'id, name, description, cuisine, location, price_range, ai_writeup, opening_date, status, seo_locked_at';

export type SeoContentType = 'event' | 'restaurant';

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

// deno-lint-ignore no-explicit-any
export type SeoCandidate = { id: string; seo_locked_at?: string | null; [key: string]: any };

/**
 * data-quality-heal and the data-quality sweeper send the table name ('events',
 * 'restaurants'); the admin tool sends 'event' / 'restaurant'. Anything that was
 * not 'event' used to fall through to restaurants, so a request for events from
 * the heal job generated restaurant SEO instead. Unknown types are now refused.
 */
export function normalizeContentType(raw: unknown): SeoContentType | null {
  if (raw === 'event' || raw === 'events') return 'event';
  if (raw === 'restaurant' || raw === 'restaurants') return 'restaurant';
  return null;
}

export function tableFor(type: SeoContentType): 'events' | 'restaurants' {
  return type === 'event' ? 'events' : 'restaurants';
}

export function staleLockCutoff(now: Date): string {
  return new Date(now.getTime() - SEO_LOCK_STALE_MINUTES * 60_000).toISOString();
}

export function isLockFree(lockedAt: string | null | undefined, now: Date): boolean {
  if (!lockedAt) return true;
  const t = new Date(lockedAt).getTime();
  return Number.isNaN(t) || t < now.getTime() - SEO_LOCK_STALE_MINUTES * 60_000;
}

function freeOnly(rows: SeoCandidate[] | null, now: Date): SeoCandidate[] {
  return (rows ?? []).filter((r) => isLockFree(r.seo_locked_at, now));
}

/**
 * Rows to process. Over-fetches and drops rows another run holds, so a
 * concurrent run (heal job, admin click) does not shrink this batch to nothing.
 */
export async function selectSeoCandidates(
  db: Db,
  type: SeoContentType,
  batchSize: number,
  now: Date = new Date(),
): Promise<SeoCandidate[]> {
  const window = batchSize * 3;

  if (type === 'restaurant') {
    const { data, error } = await db
      .from('restaurants')
      .select(RESTAURANT_SEO_COLUMNS)
      .or(NEEDS_SEO_FILTER)
      .limit(window);
    if (error) throw new Error(`Failed to fetch restaurants: ${error.message}`);
    return freeOnly(data, now).slice(0, batchSize);
  }

  const nowIso = now.toISOString();
  const withWriteup = await db
    .from('events')
    .select(EVENT_SEO_COLUMNS)
    .gte('date', nowIso)
    .or(NEEDS_SEO_FILTER)
    .not('ai_writeup', 'is', null)
    .order('date', { ascending: true })
    .limit(window);
  if (withWriteup.error) throw new Error(`Failed to fetch events: ${withWriteup.error.message}`);
  const picked = freeOnly(withWriteup.data, now).slice(0, batchSize);
  if (picked.length >= batchSize) return picked;

  const imminentBy = new Date(now.getTime() + IMMINENT_HOURS * 3_600_000).toISOString();
  const imminent = await db
    .from('events')
    .select(EVENT_SEO_COLUMNS)
    .gte('date', nowIso)
    .lt('date', imminentBy)
    .or(NEEDS_SEO_FILTER)
    .is('ai_writeup', null)
    .order('date', { ascending: true })
    .limit(window);
  if (imminent.error) throw new Error(`Failed to fetch events: ${imminent.error.message}`);
  return picked.concat(freeOnly(imminent.data, now).slice(0, batchSize - picked.length));
}

/**
 * Claim a row. True only when this call took the lock AND the row still has no
 * SEO title - if another run finished it between our select and this update,
 * the lock is handed straight back.
 */
export async function claimSeoLock(
  db: Db,
  type: SeoContentType,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const table = tableFor(type);
  const { data, error } = await db
    .from(table)
    .update({ seo_locked_at: now.toISOString() })
    .eq('id', id)
    .or(`seo_locked_at.is.null,seo_locked_at.lt."${staleLockCutoff(now)}"`)
    .select('id, seo_title');
  if (error || !data || data.length === 0) return false;
  const title = data[0].seo_title;
  if (typeof title === 'string' && title.trim() !== '') {
    await releaseSeoLock(db, type, id);
    return false;
  }
  return true;
}

export async function releaseSeoLock(db: Db, type: SeoContentType, id: string): Promise<void> {
  await db.from(tableFor(type)).update({ seo_locked_at: null }).eq('id', id);
}
