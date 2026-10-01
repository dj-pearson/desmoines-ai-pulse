/**
 * The canonical event category vocabulary (WEB-BE-049).
 *
 * WHAT WAS WRONG. There was no list. Every writer invented its own words and
 * they only overlapped by accident: SeatGeek emitted "Comedy" and "Family" that
 * no other path produced, tribeEvents and venueProfile defaulted to "General",
 * the three row builders defaulted to "General" again, and the extraction
 * prompt told the model "Music/Sports/Arts/Community/Entertainment/Festival"
 * and then showed it an example reading `"category": "Concert"` - a value not
 * in its own list, which is why "Concert" is in the table. The filter chips on
 * /events come from `get_event_categories`, a SELECT DISTINCT, so the UI
 * faithfully renders whatever mess is stored, and src/pseo/listingFilters.ts
 * already works around it with regex patterns over the free text.
 *
 * THE VOCABULARY IS DATA, NOT CODE, because four runtimes have to agree on it:
 * these edge functions, the browser bundle, the Python crawler, and the
 * backfill migration. Same reason _shared/prompts holds its templates in JSON.
 *
 * WHY A KEYWORD TABLE RATHER THAN AN EXHAUSTIVE MAP. The inputs are labels from
 * a dozen sources plus whatever a model decides to write, so an exact-match
 * table would be permanently incomplete. Ordered keyword groups collapse
 * "Music & Concerts", "Live Music" and "concert" onto Music without anyone
 * enumerating them. Order is load-bearing: first match wins.
 *
 * KEYWORDS MATCH WORD PREFIXES, NOT RAW SUBSTRINGS. A plain `includes` filed
 * "Block Party" and "Startup Expo" under Arts, because both contain "art".
 * The value is split on non-letters and a group fires when some word STARTS
 * with the keyword - so "art" still catches "Arts", "Artist" and "Art & Culture"
 * and no longer catches "Party". A keyword that is not plain letters ("trade
 * show", "stand-up") is matched against the whole string instead, because the
 * split would have torn it in half and it could never fire.
 *
 * WHAT NORMALIZING COSTS. A value matching nothing becomes "Other" rather than
 * being kept. That is the point - a one-off label is a filter chip matching one
 * event - but a genuinely new kind of event lands in Other until somebody adds
 * a keyword to the JSON. That is the intended place to make that decision.
 */
import data from "./eventCategories.json" with { type: "json" };

export const EVENT_CATEGORIES: readonly string[] = data.categories;

/** Where an unrecognised value goes. Deliberately not "General": that word was
 *  three different writers' default and meant "nobody decided". */
export const FALLBACK_CATEGORY: string = data.fallback;

const KEYWORDS: ReadonlyArray<{ category: string; match: readonly string[] }> = data.keywords;

const CANONICAL_BY_LOWER: ReadonlyMap<string, string> = new Map(
  EVENT_CATEGORIES.map((c) => [c.toLowerCase(), c]),
);

/** Is this exactly one of the canonical values, spelling and all? */
export function isCanonicalCategory(value: unknown): boolean {
  return typeof value === "string" && EVENT_CATEGORIES.includes(value);
}

/**
 * Map any writer's category value onto the canonical vocabulary.
 *
 * Total and deterministic: every input, including null, a number and the empty
 * string, produces one of EVENT_CATEGORIES.
 */
export function normalizeCategory(raw: unknown): string {
  if (typeof raw !== "string") return FALLBACK_CATEGORY;
  const trimmed = raw.trim();
  if (!trimmed) return FALLBACK_CATEGORY;

  const lower = trimmed.toLowerCase();
  const exact = CANONICAL_BY_LOWER.get(lower);
  if (exact) return exact;

  const words = lower.split(/[^a-z]+/).filter(Boolean);
  for (const { match, category } of KEYWORDS) {
    for (const kw of match) {
      const hit = /[^a-z]/.test(kw)
        ? lower.includes(kw)
        : words.some((w) => w.startsWith(kw));
      if (hit) return category;
    }
  }
  return FALLBACK_CATEGORY;
}
