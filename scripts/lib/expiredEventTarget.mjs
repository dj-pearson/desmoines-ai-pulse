/**
 * Is a redirect target a dated event page whose date has passed?
 *
 * check-sitemap-redirects fails a redirect whose target is in no sitemap. The
 * events sitemap is built from the database and keeps an event only while
 * `date >= today OR end_date >= today` (sitemap-event-filters.test.mjs), so a
 * redirect to /events/<slug>-YYYY-MM-DD falls out of every sitemap the day
 * after the event, with no commit involved. The first one to do it was SEO-055,
 * the Slaughterhouse date fix, which turned PR Checks red on every branch on
 * 2026-11-07.
 *
 * Exempting these cannot hide a real orphan. A past event is left out of the
 * sitemap on purpose; one still running (end_date ahead) is listed and never
 * reaches this test.
 *
 * `today` is a YYYY-MM-DD string in America/Chicago, the calendar the sitemap
 * cutoff and the URL suffix both use.
 */
const DATED_EVENT = /^\/events\/[a-z0-9-]+-(\d{4}-\d{2}-\d{2})$/;

export function expiredEventDate(path, today) {
  const m = DATED_EVENT.exec(path);
  if (!m) return null;
  return m[1] < today ? m[1] : null;
}

/** Today in America/Chicago as YYYY-MM-DD. */
export function chicagoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
