/**
 * The existing events a writer dedups against, read in full.
 *
 * A single PostgREST select stops at the project's max-rows (1000 by default)
 * and says nothing about it, so a writer that reads "the next N days" in one
 * request silently dedups against a prefix of them once the calendar is busy
 * enough - and inserts a second copy of every event past the cut. This pages
 * until an EMPTY page comes back rather than a short one, because a project
 * whose max-rows is set below PAGE returns short pages that are not the end.
 *
 * Bounded by the dates the caller is about to write, +/- one day, because the
 * dedup tiers never look further than a neighbouring Central day.
 */
import { generateEventFingerprint, type ExistingEvent } from "./eventDedup.ts";

export interface ExistingEventRow extends ExistingEvent {
  image_url: string | null;
}

const PAGE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The [from, to] window that covers every date in `dates`, padded a day each way. */
export function dedupWindow(dates: Date[]): { from: Date; to: Date } | null {
  const times = dates.map((d) => d.getTime()).filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return {
    from: new Date(Math.min(...times) - DAY_MS),
    to: new Date(Math.max(...times) + DAY_MS),
  };
}

/**
 * Throws on a failed read. The callers must refuse to write when this throws:
 * an unreadable existing set treated as empty makes every tier pass and
 * duplicates the whole batch.
 */
export async function loadExistingEvents(
  // Structural rather than SupabaseClient: the generics differ in arity
  // between the supabase-js pins callers use, and this reads one table.
  // deno-lint-ignore no-explicit-any
  supabase: { from: (table: string) => any },
  window: { from: Date; to: Date },
): Promise<ExistingEventRow[]> {
  const rows: ExistingEventRow[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, date, venue, source_url, image_url")
      .gte("date", window.from.toISOString())
      .lte("date", window.to.toISOString())
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`could not read existing events: ${error.message}`);
    const page = (data || []) as ExistingEventRow[];
    for (const e of page) {
      rows.push({
        ...e,
        title: e.title ?? "",
        venue: e.venue ?? "",
        source_url: e.source_url ?? "",
        fingerprint: generateEventFingerprint({
          title: e.title ?? "",
          date: new Date(e.date),
          venue: e.venue ?? "",
          source_url: e.source_url ?? "",
        }),
      });
    }
    if (page.length === 0) break;
    offset += page.length;
  }
  return rows;
}
