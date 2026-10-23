/**
 * Which events get a writeup, and the guarded write that stores one.
 *
 * PURE of remote imports so a test can drive it with an in-memory table; index.ts
 * imports supabase-js and the Deno http server from URLs, so nothing in it can
 * be imported by a test (same reason as ./prompt.ts).
 *
 * WHY SOONEST FIRST, FROM OFFSET ZERO. This used to compute a "rotating offset"
 * from the hour of day and the row count - and read the count from `data` on a
 * head request, where it is always null, so the offset was always 0 and the
 * rotation never happened. Taken at its word it would also have skipped the
 * events starting soonest, which are the ones a reader is about to look at. Now
 * that pg_cron calls this every 15 minutes, a plain soonest-first queue drains
 * the backlog in the order it matters and keeps up with new events after.
 *
 * WHY THE DATE FILTER. A writeup for an event that has already happened is money
 * spent on a page nobody will visit to plan anything.
 */

export const EVENT_WRITEUP_COLUMNS =
  'id, title, original_description, enhanced_description, location, venue, category, date, source_url';

export const DEFAULT_WRITEUP_BATCH = 10;
export const MAX_WRITEUP_BATCH = 20;

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export interface WriteupCandidate {
  id: string;
  title: string;
  original_description?: string | null;
  enhanced_description?: string | null;
  location?: string | null;
  venue?: string | null;
  category?: string | null;
  date: string;
  source_url?: string | null;
}

export function clampWriteupBatch(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_WRITEUP_BATCH;
  return Math.min(n, MAX_WRITEUP_BATCH);
}

/** Upcoming events with no writeup, soonest first. */
export async function selectEventsNeedingWriteup(
  db: Db,
  batchSize: number,
  now: Date = new Date(),
): Promise<WriteupCandidate[]> {
  const { data, error } = await db
    .from('events')
    .select(EVENT_WRITEUP_COLUMNS)
    .gte('date', now.toISOString())
    .is('ai_writeup', null)
    .order('date', { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(`Failed to fetch events: ${error.message}`);
  return (data ?? []) as WriteupCandidate[];
}

/**
 * Store one writeup. Refuses an id that was not in the batch (the model returns
 * the ids, and it can return one it was never given) and never overwrites a
 * writeup that is already there, so a manual run racing the cron, or an admin
 * edit, is not clobbered.
 */
export async function saveWriteup(
  db: Db,
  batchIds: ReadonlySet<string>,
  eventId: unknown,
  writeup: unknown,
  promptUsed: string,
  now: Date = new Date(),
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  if (typeof eventId !== 'string' || !batchIds.has(eventId)) {
    return { ok: false, error: 'eventId was not in this batch' };
  }
  if (typeof writeup !== 'string' || writeup.trim() === '') {
    return { ok: false, error: 'empty writeup' };
  }
  const { data, error } = await db
    .from('events')
    .update({
      ai_writeup: writeup,
      writeup_generated_at: now.toISOString(),
      writeup_prompt_used: promptUsed,
    })
    .eq('id', eventId)
    .is('ai_writeup', null)
    .select('id, title');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'already has a writeup' };
  return { ok: true, title: data[0].title ?? 'Updated' };
}
