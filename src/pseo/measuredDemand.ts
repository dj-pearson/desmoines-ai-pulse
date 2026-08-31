/**
 * Measured search demand per pSEO location, and which locations to skip.
 *
 * SEO-025. GENERATION_PRIORITY in pipeline.ts orders page TYPES. It has never
 * ordered LOCATIONS, so a `content-location` run treats Beaverdale and Ankeny
 * as equals. That is expensive rather than merely untidy: generation is capped
 * at 30 pages/hour and 200/day, every page is a Claude call, and the taxonomy
 * crosses 21 locations with 6 content types and 12 months.
 *
 * The numbers below are measured, not estimated. Source is the Keyword Planner
 * export joined to the seed classification in
 * docs/seo/keyword-research/keyword-opportunities.csv, aggregated per location
 * over its Suburbs and Neighborhoods rows. Regenerate with
 * scripts/analyze-keyword-volumes.mjs when a fresh export lands.
 *
 * THREE THINGS THAT LIMIT HOW HARD THESE NUMBERS SHOULD BE PUSHED.
 *
 * 1. Volumes are Planner buckets - 50 / 500 / 5,000 / 50,000 and nothing
 *    between - from an account with no active ad spend. Treat a total as an
 *    order of magnitude and a rank, never as a forecast.
 * 2. A blank in Planner is SUPPRESSION, not a measured zero. Every playground
 *    and kids term came back blank while Search Console measures that module at
 *    6,706 impressions ranking 6-7. So a zero here means "Planner would not
 *    report it", which is weaker than "nobody searches this".
 * 3. Which is why EXCLUDED_LOCATIONS is a DEPRIORITISATION, not a verdict. Each
 *    entry returned nothing across every term tested, and unlike playgrounds we
 *    have no Search Console evidence to the contrary - but we have no evidence
 *    FOR them either, because gsc_keyword_performance only started collecting
 *    properly in SEO-023. Revisit this list once that has a full window.
 */

export interface LocationDemand {
  /** Summed Planner volume across the location's tested terms. Bucketed. */
  monthlyVolume: number;
  /** How many of its tested terms returned any volume at all. */
  termsWithVolume: number;
  /** How many terms were tested for this location. */
  termsTested: number;
}

/** Measured 2026-08-31. Slugs match `taxonomy.ts` location ids. */
export const LOCATION_DEMAND: Record<string, LocationDemand> = {
  'west-des-moines': { monthlyVolume: 60550, termsWithVolume: 5, termsTested: 6 },
  ankeny: { monthlyVolume: 21000, termsWithVolume: 6, termsTested: 6 },
  altoona: { monthlyVolume: 11550, termsWithVolume: 6, termsTested: 6 },
  downtown: { monthlyVolume: 10500, termsWithVolume: 3, termsTested: 3 },
  waukee: { monthlyVolume: 6600, termsWithVolume: 6, termsTested: 6 },
  urbandale: { monthlyVolume: 6550, termsWithVolume: 5, termsTested: 6 },
  johnston: { monthlyVolume: 6150, termsWithVolume: 6, termsTested: 6 },
  clive: { monthlyVolume: 6050, termsWithVolume: 4, termsTested: 6 },
  'east-village': { monthlyVolume: 5550, termsWithVolume: 3, termsTested: 3 },
  ingersoll: { monthlyVolume: 5000, termsWithVolume: 1, termsTested: 3 },
  'pleasant-hill': { monthlyVolume: 1150, termsWithVolume: 5, termsTested: 6 },
  'windsor-heights': { monthlyVolume: 550, termsWithVolume: 2, termsTested: 6 },
  'valley-junction': { monthlyVolume: 0, termsWithVolume: 0, termsTested: 3 },
  beaverdale: { monthlyVolume: 0, termsWithVolume: 0, termsTested: 3 },
  'sherman-hill': { monthlyVolume: 0, termsWithVolume: 0, termsTested: 3 },
  drake: { monthlyVolume: 0, termsWithVolume: 0, termsTested: 3 },
};

/**
 * Locations that returned nothing on every term tested. Generation should reach
 * these only after everything with measured demand is covered.
 *
 * Not deleted from the taxonomy on purpose. A slug that disappears takes its
 * route with it, and per the Backward Compatibility rules in CLAUDE.md a public
 * route needs its 301 in place for a release cycle before it goes. These have no
 * published pages today, so there is nothing to redirect and nothing to remove -
 * they simply should not be generated next.
 */
export const EXCLUDED_LOCATIONS: readonly string[] = [
  'valley-junction',
  'beaverdale',
  'sherman-hill',
  'drake',
];

/** True when a location has no measured demand and should not be generated yet. */
export function isDeprioritised(slug: string): boolean {
  return EXCLUDED_LOCATIONS.includes(slug);
}

/**
 * Location slugs ordered by measured volume, highest first, with the
 * zero-demand ones dropped. Feed this to the combination selector so a capped
 * generation run spends its budget where demand was measured.
 */
export function locationGenerationOrder(): string[] {
  return Object.entries(LOCATION_DEMAND)
    .filter(([slug]) => !isDeprioritised(slug))
    .sort((a, b) => b[1].monthlyVolume - a[1].monthlyVolume)
    .map(([slug]) => slug);
}
