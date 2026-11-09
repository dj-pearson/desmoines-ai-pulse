/**
 * Dates for fixtures in specs that do NOT pin the browser clock (WEB-QA-041).
 *
 * A literal like opening_date: '2026-11-01' written in October means "a month
 * from now". On 2026-11-02 it means "last week", the app correctly stops
 * calling the place an upcoming opening, and a required smoke test goes red
 * with no code change. home-dashboard and home-rails-cls both did exactly that.
 *
 * Two honest ways to date a fixture:
 *   - pin the clock (page.clock.setFixedTime) and write literals against it, or
 *   - leave the clock alone and compute the date from today, with this.
 * scripts/check-fixture-dates.mjs flags the third way: a near-future literal in
 * a file that never pins the clock.
 *
 * Days are America/Chicago calendar days, the zone the app reads opening_date
 * and event dates in. Arithmetic is on the calendar date, not on milliseconds,
 * so adding 30 days across a DST change cannot land on the wrong day.
 */

const CENTRAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Central calendar day `offsetDays` from `now`, as YYYY-MM-DD. */
export function centralDay(offsetDays = 0, now: Date = new Date()): string {
  const [y, m, d] = CENTRAL.format(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

/** "Sep 12" for a YYYY-MM-DD day: the month-and-day prefix the app prints. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
