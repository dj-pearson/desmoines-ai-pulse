/**
 * Transit facts that we publish as current, with their source and the date a
 * human last checked them (WEB-FEAT-023).
 *
 * WHY THIS EXISTS. src/pages/GettingAround.tsx asserted a set of specific,
 * checkable, drift-prone numbers as plain prose: a $1.75 base fare, a $4.00 day
 * pass, and a free "D-Line" downtown circulator "running every 10-15 minutes".
 * None carried a source or a date. That is the same defect class as the Iowa
 * State Fair dates (WEB-FEAT-029) and the unverifiable statistics in
 * WEB-SEO-015: correct only by luck, and with nothing to catch it when it stops
 * being correct.
 *
 * WHAT CHECKING THEM FOUND, on 2026-09-09 against ridedart.com:
 *
 *   base fare $1.75      CONFIRMED on the official fares page
 *   day pass $4          CONFIRMED (the $3.50 on that page is DART On Demand,
 *                        a different service - easy to misread)
 *   the D-Line           NOT FOUND. Its route page 404s, the fares page does
 *                        not mention it, and DART's current bus-routes page
 *                        (dateModified 2026-08-31) contains no occurrence of
 *                        "D-Line", "circulator" or even "free". Three
 *                        independent negatives, so we stop telling visitors to
 *                        catch a bus we cannot show exists.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not invent a confidence level for
 * the parking rates and drive times that page also hardcodes. Those stay where
 * they are, but the page now labels them as approximate rather than implying
 * they were checked. Real transit data needs the DART GTFS feed, which is
 * tracked in this story's notes as blocked.
 */

export interface SourcedFact {
  /** Rendered label, e.g. "Base fare". */
  label: string;
  /** Rendered value, e.g. "$1.75". */
  value: string;
  /** Optional qualifier shown after the value. */
  note?: string;
}

export interface TransitFactSet {
  id: string;
  /** Where these were confirmed. */
  sourceUrl: string;
  /** Human-readable source name, shown to the reader. */
  sourceName: string;
  /** ISO date a human last confirmed every fact in this set. */
  verifiedAt: string;
  facts: SourcedFact[];
}

/**
 * DART bus fares, confirmed 2026-09-09 against
 * https://www.ridedart.com/fares — regular one trip $1.75, half-fare $0.75,
 * day pass $4, weekly $16, monthly $48.
 */
export const DART_FARES: TransitFactSet = {
  id: 'dart-fares',
  sourceUrl: 'https://www.ridedart.com/fares',
  sourceName: 'DART',
  verifiedAt: '2026-09-09',
  facts: [
    { label: 'One trip', value: '$1.75', note: 'regular fare' },
    { label: 'Half fare', value: '$0.75', note: 'seniors, riders with disabilities, Medicare' },
    { label: 'Day pass', value: '$4', note: 'unlimited trips' },
    { label: 'Weekly pass', value: '$16' },
    { label: 'Monthly pass', value: '$48' },
  ],
};

export const TRANSIT_FACT_SETS: readonly TransitFactSet[] = [DART_FARES];

/**
 * How long a sourced fact may go unchecked before it should be re-verified.
 *
 * Six months. Transit agencies change fares on their own schedule, and a
 * shorter window would cry wolf while a longer one lets a whole fare increase
 * pass unnoticed.
 */
export const VERIFICATION_MAX_AGE_DAYS = 183;

/** Days since a fact set was last confirmed. */
export function daysSinceVerified(
  set: Pick<TransitFactSet, 'verifiedAt'>,
  now: Date = new Date(),
): number {
  const verified = Date.parse(`${set.verifiedAt}T00:00:00Z`);
  if (Number.isNaN(verified)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - verified) / 86_400_000);
}

/** True once a fact set is old enough that it should not be trusted as current. */
export function isVerificationStale(
  set: Pick<TransitFactSet, 'verifiedAt'>,
  now: Date = new Date(),
): boolean {
  return daysSinceVerified(set, now) > VERIFICATION_MAX_AGE_DAYS;
}

/**
 * The line shown under a set of facts, so a reader knows how old they are and
 * where to check. Always names the source; a bare number with no provenance is
 * what this module exists to stop.
 */
export function verificationLine(set: TransitFactSet, now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${set.verifiedAt}T00:00:00Z`));

  return isVerificationStale(set, now)
    ? `Last checked ${formatted}. Fares may have changed since - confirm with ${set.sourceName}.`
    : `Checked against ${set.sourceName} on ${formatted}.`;
}
