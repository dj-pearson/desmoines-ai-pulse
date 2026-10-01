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
  /** `seasonal_guides.publish_date`; null or absent is treated as undated. */
  publish_date?: string | null;
}

/** A guide older than this many months answers for a past season, not this one. */
export const GUIDE_MAX_AGE_MONTHS = 10;

/** Whole months from `from` (YYYY-MM-DD...) to `to`, by calendar month. */
function monthsBetween(from: string, to: CentralDate): number {
  const fy = Number(from.slice(0, 4));
  const fm = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  if (!Number.isFinite(fy) || !Number.isFinite(fm)) return 0;
  const months = (ty - fy) * 12 + (tm - fm);
  // Not a full month yet when the day of month has not come round.
  return to.slice(8, 10) < from.slice(8, 10) ? months - 1 : months;
}

/**
 * A guide still answers "this season" unless it was published more than
 * GUIDE_MAX_AGE_MONTHS ago or its slug names a year that has passed
 * ("summer-2026" in 2027). Without `today` nothing is stale.
 */
export function isGuideCurrent(guide: SeasonGuideRef, today?: CentralDate): boolean {
  if (!today) return true;
  const year = Number(today.slice(0, 4));
  const slugYears = guide.slug.match(/(?:^|[^0-9])(20\d{2})(?![0-9])/g) ?? [];
  for (const raw of slugYears) {
    if (Number(raw.replace(/[^0-9]/g, '')) < year) return false;
  }
  if (guide.publish_date && monthsBetween(guide.publish_date, today) > GUIDE_MAX_AGE_MONTHS) return false;
  return true;
}

/**
 * The newest current guide for a season, or the static fallback. `guides` is
 * expected newest first, which is how useSeasonalGuideSlugs orders it. Pass
 * `today` (the Central date) to skip guides that have gone stale.
 */
export function seasonHref(
  season: Season,
  guides: readonly SeasonGuideRef[] | undefined,
  today?: CentralDate,
): string {
  const match = (guides ?? []).find(
    (g) => GUIDE_SEASONS[season].includes(g.season) && g.slug && isGuideCurrent(g, today),
  );
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
