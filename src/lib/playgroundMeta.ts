/**
 * The suburb a `location` string names, or null when it names none we can
 * read.
 *
 * The old rule took the second-to-last comma segment, which is right for
 * "123 Main St, Ankeny" and wrong for the Places shape
 * "123 Main St, Ankeny, IA 50023, USA", where it yields "IA 50023". This walks
 * back from the end past country, state and ZIP segments and takes the first
 * segment that looks like a place name. A segment that starts with a digit is
 * a street address, never a suburb.
 *
 * Whatever it returns is a substring of `location`, so the ilike filter the
 * dropdown drives always matches at least the row it came from.
 */
export function suburbFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const isTail = (seg: string) =>
    /^(usa|us|united states)$/i.test(seg) ||
    /^(ia|iowa)(\s+\d{5}(-\d{4})?)?$/i.test(seg) ||
    /^\d{5}(-\d{4})?$/.test(seg);
  let end = parts.length - 1;
  while (end >= 0 && isTail(parts[end])) end--;
  if (end < 0) return null;
  // A lone segment with no state after it ("Gray's Lake Park") could be a
  // place or a suburb and nothing in the string says which. "Ankeny, IA" is
  // fine: the state segment says what precedes it is a city.
  if (end === 0 && parts.length === 1) return null;
  const candidate = parts[end]
    .replace(/\s+(ia|iowa)(\s+\d{5}(-\d{4})?)?$/i, "")
    .replace(/\s+\d{5}(-\d{4})?$/, "")
    .trim();
  if (!candidate || /^\d/.test(candidate)) return null;
  return candidate;
}

/**
 * Google cuts a result title near 60 characters. EnhancedPlaygroundSEO writes
 * <title> itself with no brand suffix, so the whole budget is the title.
 */
export const PLAYGROUND_TITLE_BUDGET = 60;

export interface PlaygroundTitleInput {
  name: string;
  location?: string | null;
  amenities?: string[] | null;
  has_shade?: boolean | null;
  has_restrooms?: boolean | null;
}

export interface PlaygroundTitleFacets {
  equipment: boolean;
  shade: boolean;
  restrooms: boolean;
}

const SHADE_RE = /\bshade[sd]?\b/i;
const RESTROOM_RE = /\b(restrooms?|bathrooms?)\b/i;
const NAMES_PLAYGROUND_RE = /\b(playgrounds?|playscapes?)\b/i;

/**
 * What a row can back, word by word (SEO-042, the SEO-030 pattern). The
 * boolean columns win when they are true; until somebody fills them (0 of 69
 * rows on 2026-10-01) the amenity list is the only evidence, and only an
 * entry that names the thing counts: "shaded areas" and "sun shades" are
 * shade, "bathrooms" is restrooms. A null column is unknown, never "no", and
 * never "yes".
 */
export function playgroundTitleFacets(row: PlaygroundTitleInput): PlaygroundTitleFacets {
  const amenities = (row.amenities ?? []).map((a) => a.trim()).filter((a) => a.length > 0);
  return {
    equipment: amenities.length > 0,
    shade: row.has_shade === true || amenities.some((a) => SHADE_RE.test(a)),
    restrooms: row.has_restrooms === true || amenities.some((a) => RESTROOM_RE.test(a)),
  };
}

/**
 * "{Park} Playground, {City}: Equipment, Shade, Restrooms", each word only
 * when the row backs it, shortened until it fits PLAYGROUND_TITLE_BUDGET.
 *
 * "Playground" is added only when the name does not already say it (or
 * "Playscape"). The city is the suburb the row's own location names, and is
 * left out when the name already contains it ("Polk City Town Square
 * Playground") or the location names none: a guessed city is the defect
 * WEB-SEO-024 removed from the schema.
 *
 * Shortening drops "Equipment" first, then "Shade": restrooms is the one a
 * parent decides on. The city is given up for Shade or Restrooms, never for
 * "Equipment" alone, which says less than a city does. The bare park name is
 * the floor.
 */
export function playgroundTitle(row: PlaygroundTitleInput): string {
  const name = row.name.trim();
  const park = NAMES_PLAYGROUND_RE.test(name) ? name : `${name} Playground`;
  const city = suburbFromLocation(row.location);
  const where =
    city && !name.toLowerCase().includes(city.toLowerCase()) ? `${park}, ${city}` : park;
  const f = playgroundTitleFacets(row);
  const words = [
    f.equipment ? "Equipment" : null,
    f.shade ? "Shade" : null,
    f.restrooms ? "Restrooms" : null,
  ].filter((w): w is string => w !== null);

  // [all], then without the first word, and so on down to the last one.
  const wordSets: string[][] = [];
  for (let i = 0; i < words.length; i++) wordSets.push(words.slice(i));

  const candidates = [
    ...wordSets.map((ws) => `${where}: ${ws.join(", ")}`),
    ...(where !== park
      ? wordSets
          .filter((ws) => ws.some((w) => w !== "Equipment"))
          .map((ws) => `${park}: ${ws.join(", ")}`)
      : []),
    where,
    park,
  ];
  return candidates.find((c) => c.length <= PLAYGROUND_TITLE_BUDGET) ?? park;
}

/** "all ages" reads as a phrase; anything else is a range to quote. */
export function playgroundAgeText(ageRange: string | null | undefined): string | null {
  const age = ageRange?.trim();
  if (!age) return null;
  return /^all\s+ages$/i.test(age) ? "Listed for all ages." : `Listed for ages ${age}.`;
}
