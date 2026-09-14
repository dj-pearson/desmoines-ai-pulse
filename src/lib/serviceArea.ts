/**
 * WEB-SEO-037: is this row inside the area this site claims to cover?
 *
 * `playgrounds` holds 69 rows and 21 of them are in Oregon, Washington,
 * Colorado and Missouri - a Google Places import that went wide (see the
 * header of useOutdoorsNearby, which dodges them by distance). Nothing filters
 * them on the hub, in the hook, or in the sitemap, so sitemap-playgrounds.xml
 * submits 67 URLs of which a third are not in Iowa. A local guide that
 * publishes a park in Portland is telling Google its topic is broader than it
 * is, on the one module that ranks.
 *
 * WHY A REGEX AND NOT AN `ilike` FILTER. The obvious server-side version is
 * `location NOT ILIKE '%, OR%'`, and it is wrong: that pattern matches
 * ", Orange City", an Iowa town. Every two-letter code has this problem
 * somewhere (", IN" inside ", Independence"), so the state token has to be
 * matched as a token - after a comma, uppercase, and either ending the string
 * or followed by a ZIP. That is not expressible in PostgREST's ilike, hence a
 * predicate applied to the fetched rows.
 *
 * DIRECTION OF THE DOUBT. A row is excluded only when it POSITIVELY names
 * another state. A location with no state token at all ("1234 Main St,
 * Ankeny") stays, because most local rows are written that way and dropping
 * them would silently shrink the sitemap far past the 21 rows this is aimed
 * at.
 */

/** `, XX` as a token: uppercase, at the end or before a ZIP / trailing text. */
const STATE_TOKEN = /,\s*([A-Z]{2})(?=\s*(?:\d{5}(?:-\d{4})?)?\s*(?:,|$))/g;

/** Spelled-out state names, matched whole-word and case-insensitively. */
const STATE_NAMES =
  /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

/**
 * True when the location names a state that is not Iowa.
 *
 * Returns false for an empty location and for one that names no state: unknown
 * is not the same as elsewhere, and only "elsewhere" earns removal.
 */
export function isOutsideIowa(location?: string | null): boolean {
  if (!location) return false;

  for (const match of location.matchAll(STATE_TOKEN)) {
    if (match[1] !== 'IA') return true;
  }

  const named = location.match(STATE_NAMES);
  if (named && named[1].toLowerCase() !== 'iowa') return true;

  return false;
}
