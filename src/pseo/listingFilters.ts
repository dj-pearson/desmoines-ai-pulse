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
import { isNeighborhoodSlug } from '../lib/neighborhoodBoundaries';
import { upcomingOrRunningFilter } from '../lib/eventRunningFilter';
import { sanitizePostgrestPattern } from '../lib/postgrestPattern';
import { addCentralDays, centralDateOf, centralWeekday, centralWindow, upcomingFloorUtc } from '../lib/timezone';

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
  // SEO-041. 'pizz' covers Pizza, Pizzeria and "Italian/Pizza". It is a subset
  // of italian's pattern on purpose: an area's pizza page and its italian page
  // can overlap, and src/pseo/coverageRule.ts refuses to index two pages whose
  // listings are identical.
  pizza: { entity: 'restaurants', column: 'cuisine', pattern: 'pizz' },
};

/**
 * How a location dimension selects restaurants (SEO-060).
 *
 * A suburb is a municipality and its name is in restaurants.city or the
 * address, so it is matched as text. A neighbourhood is not: every downtown
 * and East Village row reads "Des Moines", and the location NAME the pages
 * carried ("Downtown Des Moines", "East Village") appears on almost no row,
 * so those pages listed nothing. Neighbourhoods match restaurants.neighborhood,
 * which scripts/assign-restaurant-neighborhoods.ts fills from lat/lng against
 * the polygons in src/lib/neighborhoodBoundaries.ts.
 *
 * Events and attractions keep the text match; they have no such column.
 */
export type RestaurantLocationMatch =
  | { kind: 'neighborhood'; slug: string }
  | { kind: 'text'; name: string };

export function restaurantLocationMatch(location: { slug: string; name: string }): RestaurantLocationMatch {
  return isNeighborhoodSlug(location.slug)
    ? { kind: 'neighborhood', slug: location.slug }
    : { kind: 'text', name: location.name };
}

/**
 * Which table a page lists, from its dimensions. The one copy: the live
 * listing component, the shippable-set gate and the coverage rule all call it.
 * Category membership comes from CATEGORY_FILTERS rather than a second
 * hand-kept list, which is how /pizza/* would otherwise have been resolved to
 * events and listed nothing.
 */
export function resolveEntityType(contentSlug?: string, categorySlug?: string): 'events' | 'restaurants' | 'attractions' {
  if (contentSlug === 'restaurants') return 'restaurants';
  if (contentSlug === 'attractions') return 'attractions';
  if (contentSlug === 'events' || contentSlug === 'things-to-do' || contentSlug === 'nightlife') return 'events';
  const cat = categorySlug ? CATEGORY_FILTERS[categorySlug] : undefined;
  if (cat) return cat.entity;
  return 'events';
}

/**
 * The calendar day after a YYYY-MM-DD key, for an exclusive upper bound.
 * temporalRange's `to` is the last day INCLUDED; events.date is timestamptz,
 * so a query must stop before the next day starts, not at midnight of `to`.
 */
export function dayAfter(key: string): string {
  return addCentralDays(key, 1);
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** First day of a month as a YYYY-MM-DD key; month is 0-based, may overflow. */
function monthFirst(year: number, month0: number): string {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return `${y}-${pad2(m + 1)}-01`;
}

/**
 * WEB-SEO-064. Every key is a CENTRAL calendar date. This used to read
 * now.getFullYear/getMonth/getDate, the runtime's local date, while
 * pseoEventFilters turns the keys into Central days. The prerenderer and the
 * inventory gate run in UTC, so from 7 PM CDT (6 PM CST) /x/today was
 * tomorrow's window, and a visitor in another zone got their own date.
 */
export function temporalRange(slug: string, now: Date = new Date()): { from: string; to: string } | null {
  const today = centralDateOf(now);

  if (slug === 'today') return { from: today, to: today };

  if (slug === 'this-weekend') {
    const sat = addCentralDays(today, (6 - centralWeekday(today) + 7) % 7);
    return { from: sat, to: addCentralDays(sat, 1) };
  }

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = MONTHS.indexOf(slug);
  const span: [number, number] | undefined =
    monthIndex >= 0 ? [monthIndex, monthIndex] : SEASON_MONTHS[slug];
  if (!span) return null;

  const [startMonth, endMonth] = span;
  const thisYear = Number(today.slice(0, 4));
  for (let year = thisYear; year <= thisYear + 1; year++) {
    const endYear = endMonth < startMonth ? year + 1 : year;
    const start = monthFirst(year, startMonth);
    // The day before the first of the following month is the last day.
    const end = addCentralDays(monthFirst(endYear, endMonth + 1), -1);
    if (end < today) continue;
    return { from: start < today ? today : start, to: end };
  }
  return null;
}

/**
 * WEB-SEO-063. The date half of a pSEO events listing, as PostgREST filters:
 * one `or=` body and an optional inclusive upper bound on `date`.
 *
 * The listing used to send `date >= now()`, which dropped two kinds of event
 * that are still on:
 *   - a run that started before today (a festival vanished on its second day),
 *   - an untimed event, stored at the 19:31:58 Central sentinel, which vanished
 *     at 7:31 PM on its own day.
 * The floor is now the start of today in Central time (upcomingFloorUtc) and a
 * row also qualifies while its end_date is at or after it, the same group
 * /events and site search send. With a temporal dimension the window is an
 * overlap: started by the window's end, not over before its start. The window's
 * days are Central days, so "today" no longer includes last night's 7 PM show
 * (00:00 UTC is still yesterday in Des Moines).
 *
 * The location match shares the one `or=`: a second .or() is a second `or`
 * query param, and PostgREST does not promise to AND duplicates.
 *
 * Shared by PseoLiveListings and scripts/lib/pseoShippable.ts (the inventory
 * gate), so the two count the same rows.
 */
export function pseoEventFilters(
  opts: { temporalSlug?: string; locationName?: string },
  now: Date = new Date(),
): { or: string; lte: string | null } {
  let lower = upcomingFloorUtc(now);
  let lte: string | null = null;
  const range = opts.temporalSlug ? temporalRange(opts.temporalSlug, now) : null;
  if (range) {
    const w = centralWindow({ kind: 'range', from: range.from, to: range.to }, now);
    if (w.start > lower) lower = w.start;
    lte = w.end;
  }
  const running = upcomingOrRunningFilter(lower);
  if (!opts.locationName) return { or: running, lte };
  // venue is in the OR because that is where a neighbourhood name actually
  // lands on this table - events.city is NULL on 1,243 of 1,249 rows, so the
  // city arm almost never fires. Same fields EventsByLocation.tsx matches.
  // A name with a comma ("Ankeny, IA") would end the or() clause and 400.
  const place = sanitizePostgrestPattern(opts.locationName);
  const where = `city.ilike.%${place}%,location.ilike.%${place}%,venue.ilike.%${place}%`;
  return { or: `and(or(${running}),or(${where}))`, lte };
}
