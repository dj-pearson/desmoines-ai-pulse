/**
 * Decide whether an extracted venue string names a known venue (WEB-BE-039).
 *
 * WHY THIS IS STRICT, and what the old rule cost. firecrawl-scraper matched a
 * scraped venue against known_venues with
 *
 *     if (venueLower.includes(searchText) || searchText.includes(venueLower)) {
 *       if (searchText.length >= 5 || venueLower.length >= 5) { ...match... }
 *     }
 *
 * The guard is an OR, and the right-hand side is about the KNOWN venue, which
 * is essentially always 5 characters or more. So the length test passed for any
 * extracted string at all, and a 3-4 character extraction - "Park", "The",
 * "Hall" - matched the first known venue whose name happened to contain it.
 *
 * A match is not a label. The caller then overwrites the event's venue NAME,
 * its full street ADDRESS and its LATITUDE and LONGITUDE with that venue's, so
 * an event extracted as "Park" was stored at Principal Park's address and
 * pinned at its coordinates on the map.
 *
 * THE RULE: exact and alias matches canonicalize. A partial match has to earn
 * it - the extracted text must be long enough to be a name rather than a word,
 * must line up on WORD BOUNDARIES, and must account for most of the venue it
 * claims to be. Anything short of that returns null, and the caller keeps what
 * the source actually said. Refusing to canonicalize costs a tidier venue
 * string; canonicalizing wrongly costs a wrong address and a wrong pin.
 */

export interface MatchableVenue {
  name: string;
  aliases?: string[] | null;
}

export type MatchKind = "exact" | "alias" | "partial";

export interface VenueMatch<T> {
  venue: T;
  kind: MatchKind;
  /** The candidate string that matched - the name, or the alias. */
  matchedOn: string;
}

/**
 * Minimum length for the EXTRACTED side of a partial match.
 *
 * Five, because the shortest real venue names in this corpus that a scrape
 * abbreviates ("Hoyt", "Adler") are already borderline, while the strings that
 * caused the damage are the common nouns below it: "The", "Park", "Hall",
 * "Room". The old code had this number and applied it to the wrong side of an
 * OR.
 */
export const MIN_PARTIAL_LENGTH = 5;

/**
 * How much of the candidate the extracted text has to cover.
 *
 * "Hoyt Sherman" against "Hoyt Sherman Place" is 12 of 18 characters, which is
 * the case AC4 requires to pass. "Center" against "Iowa Events Center" is 6 of
 * 18, which is the case that must not: an event at some other centre would take
 * the Iowa Events Center's address.
 */
export const MIN_COVERAGE = 0.5;

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * True when `needle` appears in `haystack` on word boundaries at both ends.
 *
 * Plain `includes` is what let "The" match "The Temple for Performing Arts" and
 * "Park" match "Principal Park". Requiring boundaries does not save those on
 * its own - "Park" IS a whole word in "Principal Park" - which is why the
 * length and coverage rules below exist too. It does rule out the sillier half:
 * "Hall" matching "Marshalltown".
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const i = haystack.indexOf(needle);
  if (i === -1) return false;
  const before = i === 0 ? " " : haystack[i - 1];
  const afterIdx = i + needle.length;
  const after = afterIdx >= haystack.length ? " " : haystack[afterIdx];
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/** A partial match one way or the other, subject to length and coverage. */
function partialMatches(searchText: string, candidate: string): boolean {
  if (searchText.length < MIN_PARTIAL_LENGTH) return false;

  // The extracted text names part of the venue: "Hoyt Sherman" in
  // "Hoyt Sherman Place".
  if (containsWord(candidate, searchText)) {
    return searchText.length / candidate.length >= MIN_COVERAGE;
  }

  // The extracted text is LONGER and contains the venue: "Wells Fargo Arena,
  // Des Moines" contains "Wells Fargo Arena". Coverage is measured the same way
  // round - the venue must be most of what was extracted, or a scrape that
  // swept up a whole sentence would match on one word in it.
  if (containsWord(searchText, candidate)) {
    return candidate.length / searchText.length >= MIN_COVERAGE;
  }

  return false;
}

/**
 * The first venue that matches, in order of confidence: exact name, exact
 * alias, then partial on either.
 *
 * Returns null rather than a best guess. The caller overwrites an address and a
 * pair of coordinates with whatever comes back, so "no idea" has to be
 * expressible.
 */
export function matchKnownVenue<T extends MatchableVenue>(
  venueName: string,
  venues: readonly T[],
): VenueMatch<T> | null {
  const searchText = norm(venueName ?? "");
  if (!searchText) return null;

  for (const venue of venues) {
    if (norm(venue.name) === searchText) {
      return { venue, kind: "exact", matchedOn: venue.name };
    }
  }

  for (const venue of venues) {
    for (const alias of venue.aliases ?? []) {
      if (norm(alias) === searchText) {
        return { venue, kind: "alias", matchedOn: alias };
      }
    }
  }

  for (const venue of venues) {
    if (partialMatches(searchText, norm(venue.name))) {
      return { venue, kind: "partial", matchedOn: venue.name };
    }
    for (const alias of venue.aliases ?? []) {
      if (partialMatches(searchText, norm(alias))) {
        return { venue, kind: "partial", matchedOn: alias };
      }
    }
  }

  return null;
}
