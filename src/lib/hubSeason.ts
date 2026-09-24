/**
 * Which seasons the /things-to-do "When" row shows, and where each one links.
 *
 * The row used to carry six fixed cards, including two out-of-season ones and
 * a `/guides/summer-2026` literal that would have gone stale the day summer
 * ended. It now shows the current season and the next one, computed from the
 * date in Des Moines, and resolves each season's href from the published
 * seasonal guides with a static fallback.
 *
 * Everything here is pure so it can be tested with a fixed date.
 */
import { addCentralDays, type CentralDate } from '@/lib/timezone';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

const ORDER: readonly Season[] = ['spring', 'summer', 'fall', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/**
 * Meteorological seasons: Mar-May spring, Jun-Aug summer, Sep-Nov fall,
 * Dec-Feb winter. Whole months keep the boundary obvious and stop the row from
 * flipping on an equinox nobody plans around.
 */
export function currentSeason(day: CentralDate): Season {
  const month = Number(day.slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

export function nextSeason(season: Season): Season {
  return ORDER[(ORDER.indexOf(season) + 1) % ORDER.length];
}

/**
 * Where a season links when no seasonal guide for it is published. Fall and
 * winter keep the guides the hub already pointed at; spring and summer have
 * no standing guide, so they go to the guides index rather than a dated slug.
 */
export const SEASON_FALLBACK_HREF: Record<Season, string> = {
  spring: '/guides',
  summer: '/guides',
  fall: '/guides/fall-festivals',
  winter: '/guides/holiday-lights',
};

/** `seasonal_guides.season` values that answer for each hub season. */
const GUIDE_SEASONS: Record<Season, readonly string[]> = {
  spring: ['spring'],
  summer: ['summer'],
  fall: ['fall'],
  winter: ['winter', 'holiday'],
};

export interface SeasonGuideRef {
  season: string;
  slug: string;
}

/**
 * The newest published guide for a season, or the static fallback. `guides`
 * is expected newest first, which is how useSeasonalGuides orders it.
 */
export function seasonHref(season: Season, guides: readonly SeasonGuideRef[] | undefined): string {
  const match = (guides ?? []).find((g) => GUIDE_SEASONS[season].includes(g.season) && g.slug);
  return match ? `/guides/${match.slug}` : SEASON_FALLBACK_HREF[season];
}

/**
 * True from `leadDays` before an annual event starts through its last day.
 * Plain `YYYY-MM-DD` string comparison, same reasoning as annualEvents.ts:
 * no timezone can shift a calendar date compared as a string.
 */
export function isInLeadWindow(
  event: { startISO: string; endISO: string },
  today: CentralDate,
  leadDays = 45,
): boolean {
  return today >= addCentralDays(event.startISO, -leadDays) && today <= event.endISO;
}
