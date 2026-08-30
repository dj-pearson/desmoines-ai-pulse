/**
 * The URL shapes the sitemaps advertise, shared by the generator and by the
 * freshness check that compares what is live against what the data would
 * produce today.
 *
 * IT IS A SHARED MODULE FOR ONE REASON. The check answers "which events are in
 * the database and not in the live sitemap" by building the slug for each event
 * and looking for it. If it built slugs even slightly differently from the
 * generator - a different timezone, a different separator - every event would
 * look missing and the report would read as a catastrophic freshness failure on
 * a perfectly current sitemap.
 *
 * CENTRAL TIME IS LOAD-BEARING, not a formatting preference. An event at 7 PM
 * on the 4th in Des Moines is the 5th in UTC, so slugging from the raw
 * timestamp puts a date in the URL that is a day off for every evening event -
 * which is most of them. This mirrors createEventSlugWithCentralTime in the app.
 */
import { toZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

export const CENTRAL_TIMEZONE = 'America/Chicago';

export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Event slug matching the app's createEventSlugWithCentralTime.
 *
 * Falls back to the bare title slug when there is no date or the date will not
 * parse, which is deliberate: a URL without the date suffix is wrong, but
 * throwing here would fail a whole sitemap generation over one bad row.
 */
export function createEventSlug(
  title: string,
  event?: { date?: string | null; event_start_utc?: string | null },
): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!event) return titleSlug;
  try {
    const dateToUse = event.event_start_utc || event.date;
    if (!dateToUse) return titleSlug;
    const dateObj = typeof dateToUse === 'string' ? parseISO(dateToUse) : dateToUse;
    // parseISO does not THROW on a bad string, it returns an Invalid Date - so
    // the catch below never fired and the slug came out `title-NaN-NaN-NaN`,
    // which would be submitted to Google as a URL. Not currently reachable (the
    // generator filters on `date >= cutoff`, which excludes nulls, and no row in
    // the window fails to parse today), but the catch was clearly meant to cover
    // this and did not.
    if (Number.isNaN(dateObj.getTime())) return titleSlug;
    const centralDate = toZonedTime(dateObj, CENTRAL_TIMEZONE);
    const year = centralDate.getFullYear();
    const month = String(centralDate.getMonth() + 1).padStart(2, '0');
    const day = String(centralDate.getDate()).padStart(2, '0');
    return `${titleSlug}-${year}-${month}-${day}`;
  } catch {
    return titleSlug;
  }
}
