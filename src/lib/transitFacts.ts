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
 * figures nobody checked. The parking rates went in plan-stay WP3; the typed
 * drive times, the garage list and the skywalk length went in pass 2 WP3.
 * Distances are now computed from stored coordinates (STRAIGHT_LINE_* below)
 * and say they are straight-line. Real transit times need the DART GTFS feed,
 * which is tracked in this story's notes as blocked.
 */

import { haversineDistance } from '@/lib/geo';
import { NEAR_ME_ORIGINS, findNearMeOrigin, type NearMeOrigin } from '@/lib/nearMeOrigins';

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

/*
 * UNSOURCED GUIDANCE, KEPT AS WORDS (plan-stay WP3 item 2).
 *
 * /getting-around also printed a taxi fare ("$18-22 to downtown"), a named
 * airport bus ("DART Route 8, $1.75, ~20 min"), BCycle prices and skywalk
 * hours ("6am-9pm weekdays" in the body, "business hours" in the FAQ). None
 * had a source or a check date, and the body and FAQ disagreed about the
 * skywalk and about naming the route. They could not be re-checked when this
 * was written (no access to ridedart.com, flydsm.com or bcycle.com from the
 * build machine), so the numbers are gone rather than given a verifiedAt
 * nobody earned. What is left below carries no figure that could drift, and
 * the page body and the FAQ both read from these constants, so the two can
 * no longer disagree.
 *
 * To bring a figure back: confirm it at the source, add a TransitFactSet with
 * sourceUrl and verifiedAt, and render verificationLine() next to it.
 */

export interface TravelOption {
  label: string;
  detail: string;
}

/*
 * STRAIGHT-LINE DISTANCES (plan-stay-pass2 WP3 item 3).
 *
 * The page had a typed table of drive times and distances ("Jordan Creek Mall,
 * 15 min, 10.5 mi") with no source. These are computed instead: haversine from
 * one named downtown point to each place's stored point, printed as "x.x mi
 * straight line" so nobody reads them as a road distance. The points are the
 * ones /events/near-me already uses (src/lib/nearMeOrigins.ts), so the two
 * pages can't disagree. Places with no stored point (Gray's Lake,
 * Adventureland, Ames) are left out rather than given a typed number.
 */

/** The named downtown point every distance is measured from. */
export const STRAIGHT_LINE_ORIGIN: NearMeOrigin = findNearMeOrigin('downtown') ?? NEAR_ME_ORIGINS[0];

/**
 * Des Moines International Airport, the FAA airport reference point
 * (41 32 01 N, 93 39 47 W), rounded to three decimals like the other points.
 */
export const DSM_AIRPORT_POINT = { label: 'Des Moines International Airport (DSM)', latitude: 41.534, longitude: -93.663 } as const;

export interface StraightLineRow {
  destination: string;
  /** Miles, one decimal. */
  miles: number;
}

/** Miles between two points, rounded to one decimal. */
export function straightLineMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  return Math.round(haversineDistance(from, to) * 10) / 10;
}

/** "4.2 mi straight line". The one formatter for these figures. */
export function formatStraightLine(miles: number): string {
  return `${miles.toFixed(1)} mi straight line`;
}

/** Every stored point except downtown itself, plus the airport, nearest first. */
export function straightLineTable(): StraightLineRow[] {
  const places = [
    ...NEAR_ME_ORIGINS.filter((o) => o.slug !== STRAIGHT_LINE_ORIGIN.slug),
    DSM_AIRPORT_POINT,
  ];
  return places
    .map((p) => ({ destination: p.label, miles: straightLineMiles(STRAIGHT_LINE_ORIGIN, p) }))
    .sort((a, b) => a.miles - b.miles || a.destination.localeCompare(b.destination));
}

const AIRPORT_MILES = straightLineMiles(STRAIGHT_LINE_ORIGIN, DSM_AIRPORT_POINT);

/** Airport to downtown. The distance is the same computed figure the table prints. */
export const AIRPORT_TO_DOWNTOWN = {
  summary: `Des Moines International Airport (DSM) is on the south side of the city, ${formatStraightLine(
    AIRPORT_MILES,
  )} from downtown; the drive is longer.`,
  bus: 'DART buses serve the airport. Check ridedart.com for the route that runs there now; it costs the regular DART one-trip fare.',
  options: [
    { label: 'Uber and Lyft', detail: 'Pick up at the arrivals curb. The app quotes the fare before you book.' },
    { label: 'Taxi', detail: 'Ask for the fare to your hotel before you set off; it is not a flat rate.' },
    { label: 'Hotel shuttles', detail: 'Some hotels run one. Ask when you book rather than assuming.' },
    { label: 'Rental cars', detail: 'Counters are at the airport.' },
  ] as readonly TravelOption[],
} as const;

/** The FAQ answer, built from the same text the page body renders. */
export function airportFaqAnswer(): string {
  const labels = AIRPORT_TO_DOWNTOWN.options.map((o) => o.label).join(', ');
  return `${AIRPORT_TO_DOWNTOWN.summary} Options include ${labels}, and the bus. ${AIRPORT_TO_DOWNTOWN.bus}`;
}

export const SKYWALK = {
  summary:
    'The Des Moines Skywalk is a network of enclosed, climate-controlled walkways connecting buildings across downtown. It is free and open to the public.',
  hours:
    'There is no single schedule: each building sets its own hours, so some segments close in the evening and on weekends. If a door is locked, the street is the way through.',
} as const;

export const BCYCLE = {
  siteUrl: 'https://desmoines.bcycle.com',
  summary:
    'Des Moines BCycle runs bike share stations downtown and in nearby neighborhoods, handy for short trips and the trail system.',
  pricing:
    'Pricing and passes are set by BCycle and change; the BCycle site and app show current rates before you unlock a bike.',
} as const;
