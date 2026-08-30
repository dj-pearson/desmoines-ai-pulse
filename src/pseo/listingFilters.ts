/**
 * Listing filters for the pSEO pages - the predicates that turn a page's
 * dimensions into a query.
 *
 * SEPARATE FROM THE COMPONENT ON PURPOSE. scripts/check-pseo-inventory.mjs is
 * WEB-SEO-013 AC5's inventory gate: it counts how many entities each published
 * page actually resolves, and a gate that counts differently from the page it
 * guards is worse than no gate. Both import from here, so the two cannot drift.
 * Nothing in this file touches React or the Supabase client, which is what lets
 * a plain node script import it.
 */

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Category dimension -> the predicate that actually selects rows.
 *
 * KEYED BY SLUG, MATCHED AGAINST THE STORED VALUE. The previous version filtered
 * with `ilike '%' + dimension.name + '%'`, so /live-music/* searched for the
 * literal "Live Music" and /bbq/* for "BBQ & Smokehouse". events.category holds
 * "Music", "Concert", "Festival"; restaurants.cuisine holds "BBQ",
 * "Texas-style BBQ", "Chinese". None of the display names is a substring of any
 * stored value, so every category-dimension page rendered an empty listing -
 * 31 published pages with inventory sitting behind them, /live-music/downtown
 * among them. Measured with scripts/check-pseo-inventory.mjs.
 *
 * imatch is PostgREST's ~* (case-insensitive POSIX regex), which is what lets
 * one filter cover the several stored spellings without stacking `or` clauses -
 * the location filter already owns the single top-level `or`.
 */
export const CATEGORY_FILTERS: Record<string, { entity: 'events' | 'restaurants'; column: string; pattern: string }> = {
  'live-music': { entity: 'events', column: 'category', pattern: 'music|concert|performing arts' },
  festivals: { entity: 'events', column: 'category', pattern: 'festival' },
  'arts-culture': { entity: 'events', column: 'category', pattern: 'art|culture|theater|theatre|museum' },
  sports: { entity: 'events', column: 'category', pattern: 'sport|athletic|game' },
  'farmers-markets': { entity: 'events', column: 'category', pattern: 'market|farmer' },
  italian: { entity: 'restaurants', column: 'cuisine', pattern: 'italian|pizza' },
  mexican: { entity: 'restaurants', column: 'cuisine', pattern: 'mexican|tex-?mex|latin' },
  asian: { entity: 'restaurants', column: 'cuisine', pattern: 'asian|chinese|thai|japanese|sushi|vietnamese|korean|ramen' },
  bbq: { entity: 'restaurants', column: 'cuisine', pattern: 'bbq|barbec|smokehouse' },
  // 'caf' rather than 'cafe|cafe-with-an-accent': the stored values use both
  // spellings and a POSIX pattern here has to stay ASCII, so the prefix covers
  // both without putting a non-ASCII byte into a query string.
  brunch: { entity: 'restaurants', column: 'cuisine', pattern: 'brunch|breakfast|caf|coffee|bakery|diner' },
  coffee: { entity: 'restaurants', column: 'cuisine', pattern: 'coffee|caf|espresso' },
  steakhouse: { entity: 'restaurants', column: 'cuisine', pattern: 'steak' },
};

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Temporal dimension -> a date window, clamped so it never starts in the past.
 *
 * THIS DIMENSION WAS READ AND THEN NEVER USED. `temporal` was destructured at
 * the top of fetchListings and no branch referenced it, so /live-music/today,
 * /live-music/summer and /live-music/december all issued the identical query
 * and rendered the identical twelve rows. 128 of the 244 published pages carry
 * a temporal dimension; the audit found nine groups of URLs rendering byte-
 * identical listings, and this was the reason for most of them.
 *
 * Seasons and named months roll forward: asking for "summer" after summer has
 * ended means next summer, not an empty list. Restaurants and attractions carry
 * no date at all, so a temporal dimension genuinely cannot narrow them - that is
 * inherent, not a bug, and those pages stay identical to each other.
 */
const SEASON_MONTHS: Record<string, [number, number]> = {
  spring: [2, 4],
  summer: [5, 7],
  fall: [8, 10],
  winter: [11, 1],
};

export function temporalRange(slug: string, now: Date = new Date()): { from: string; to: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (slug === 'today') return { from: ymd(today), to: ymd(today) };

  if (slug === 'this-weekend') {
    const sat = new Date(today);
    sat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7));
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    return { from: ymd(sat), to: ymd(sun) };
  }

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = MONTHS.indexOf(slug);
  const span: [number, number] | undefined =
    monthIndex >= 0 ? [monthIndex, monthIndex] : SEASON_MONTHS[slug];
  if (!span) return null;

  const [startMonth, endMonth] = span;
  for (let year = today.getFullYear(); year <= today.getFullYear() + 1; year++) {
    const endYear = endMonth < startMonth ? year + 1 : year;
    const start = new Date(year, startMonth, 1);
    const end = new Date(endYear, endMonth + 1, 0); // day 0 of next month = last day
    if (end < today) continue;
    return { from: ymd(start < today ? today : start), to: ymd(end) };
  }
  return null;
}
