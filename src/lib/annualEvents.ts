/**
 * Annual events whose dates are held in code (WEB-FEAT-029).
 *
 * THE PROBLEM THIS SOLVES. src/pages/IowaStateFairPage.tsx held the fair's
 * dates as a bare const. Its own header comment records that the page once
 * shipped a fair two years gone, with a 2024 startDate in its Event markup,
 * because the year was written out independently in the title, the h1, the body
 * copy, the keywords, the FAQ answer and the schema. Deriving them all from one
 * object fixed the disagreement but not the decay: the object still had to be
 * edited by hand every year, and nothing anywhere noticed when it was not.
 * On 2026-09-08 the page was advertising an event that ended on 2026-08-23.
 *
 * So the fix is not another constant. It is a constant that CI can see:
 * `scripts/check-annual-dates.mjs` reads this registry and fails the build once
 * an entry's end date is in the past, which turns a silent content bug into a
 * red check. The registry is a list rather than one entry because every annual
 * page added later inherits the same decay, and the check should already cover
 * it.
 *
 * WHY THE PAGE STILL RENDERS. A stale entry does not blank the page. It
 * switches the copy to what is actually true - this year's fair has ended, next
 * year's dates are not announced - which is a better answer than last year's
 * dates presented as upcoming, and a better answer than a 404.
 */

export interface AnnualEvent {
  /** Stable key, also used in CI output. */
  id: string;
  name: string;
  /** The year these dates describe. */
  year: number;
  /** Inclusive first day, ISO date (no time). */
  startISO: string;
  /** Inclusive last day, ISO date (no time). */
  endISO: string;
  /** Human label used in copy, e.g. "August 13-23, 2026". */
  rangeLabel: string;
  /** When a human last confirmed these dates against the source. */
  verifiedAt: string;
  /** Where they were confirmed. CI prints this when the entry goes stale. */
  sourceUrl: string;
  /** Route that renders this event, so CI can name the page to fix. */
  route: string;
}

export const ANNUAL_EVENTS: readonly AnnualEvent[] = [
  {
    id: 'iowa-state-fair',
    name: 'Iowa State Fair',
    year: 2027,
    startISO: '2027-08-12',
    endISO: '2027-08-22',
    rangeLabel: 'August 12-22, 2027',
    // Confirmed 2026-09-08 against iowastatefair.org, which states "the 2027
    // Iowa State Fair, August 12-22, 2027" in three places on its homepage.
    // Thursday to Sunday over 11 days, the same shape as 2026 (Aug 13-23).
    verifiedAt: '2026-09-08',
    sourceUrl: 'https://www.iowastatefair.org',
    route: '/iowa-state-fair',
  },
];

export type AnnualEventStatus = 'upcoming' | 'running' | 'ended';

/**
 * Compare ISO dates as plain calendar dates.
 *
 * Deliberately string comparison on `YYYY-MM-DD`, not Date arithmetic. `new
 * Date('2026-08-23')` is midnight UTC, which is the previous evening in Central
 * time, so a naive comparison would call the fair over while it was still on.
 * Lexicographic order on a zero-padded ISO date is exact and has no timezone.
 */
function todayISOInCentral(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD. The timezone is what matters here: the question is
  // always "what is the date in Des Moines right now".
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function annualEventStatus(
  event: Pick<AnnualEvent, 'startISO' | 'endISO'>,
  now: Date = new Date(),
): AnnualEventStatus {
  const today = todayISOInCentral(now);
  if (today < event.startISO) return 'upcoming';
  if (today > event.endISO) return 'ended';
  return 'running';
}

/** True once the published dates describe something already over. */
export function isAnnualEventStale(
  event: Pick<AnnualEvent, 'startISO' | 'endISO'>,
  now: Date = new Date(),
): boolean {
  return annualEventStatus(event, now) === 'ended';
}

export function getAnnualEvent(id: string): AnnualEvent | undefined {
  return ANNUAL_EVENTS.find((event) => event.id === id);
}

/**
 * Copy for a stale entry. Kept here rather than in the page so that every
 * annual page says the same honest thing, and so the wording is testable.
 */
export function staleAnnualEventCopy(event: AnnualEvent): {
  headline: string;
  detail: string;
} {
  return {
    headline: `The ${event.year} ${event.name} has ended`,
    detail:
      `Dates for ${event.year + 1} have not been announced yet. ` +
      `This page still covers what to expect and where to eat, park and stay.`,
  };
}
