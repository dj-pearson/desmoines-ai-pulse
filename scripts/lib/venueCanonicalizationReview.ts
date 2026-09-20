/**
 * Which events look like they were canonicalized onto the WRONG venue
 * (WEB-BE-039 AC5).
 *
 * ── WHAT CANNOT BE RECOVERED, SAID FIRST ────────────────────────────────────
 *
 * AC5 asks for "events whose venue was canonicalized from a sub-5-character
 * extraction". That cause is not recoverable from the rows. firecrawl-scraper
 * overwrote venue, location, latitude AND longitude with the matched venue's
 * values (index.ts:550-570), so the scraped text that produced the match is
 * gone from every column - including `location`, which is the one that looks
 * like it might have survived. Re-running the matcher on the stored venue name
 * now returns an exact match, because the stored name IS the venue's name.
 *
 * So this finds the EFFECT instead, from the one piece of provenance the
 * overwrite did not touch: source_url.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * eventSourceProfiles declares twelve SINGLE-VENUE sources - Hoyt Sherman,
 * Wooly's, Vibrant, Principal Park, the three Wells Fargo Arena teams, the
 * Playhouse, the Symphony and so on. Every event scraped from one of those
 * sites happens at that venue; that is what makes it a venue source rather than
 * an aggregator. So an event whose source_url belongs to Wooly's and whose
 * venue reads "Principal Park" was not mis-typed by the source. It was
 * canonicalized onto a venue it has nothing to do with, and its address and
 * coordinates went with it.
 *
 * An aggregator source (Catch Des Moines, SeatGeek, Ticketmaster) carries
 * events at many venues, so nothing can be concluded from its URL. Those are
 * reported as UNKNOWN rather than quietly counted as fine - a reviewer needs to
 * know the difference between "checked and correct" and "not checkable".
 */

export interface ReviewableEvent {
  id: string;
  title?: string | null;
  venue?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source_url?: string | null;
}

export interface ReviewableVenue {
  name: string;
  aliases?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type ReviewVerdict = 'ok' | 'suspect' | 'unknown';

export interface EventReview {
  id: string;
  verdict: ReviewVerdict;
  /** The venue the source_url says this event is at, when the source is a venue. */
  expectedVenue: string | null;
  storedVenue: string | null;
  reason: string;
  /** True when the row's coordinates are the WRONG venue's, so the map is wrong too. */
  coordinatesMoved: boolean;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Close enough to be the same pin: about 50 metres. */
const COORD_EPSILON = 0.0005;

function sameCoordinates(a: ReviewableEvent, b: ReviewableVenue): boolean {
  if (a.latitude == null || a.longitude == null) return false;
  if (b.latitude == null || b.longitude == null) return false;
  return (
    Math.abs(a.latitude - b.latitude) < COORD_EPSILON &&
    Math.abs(a.longitude - b.longitude) < COORD_EPSILON
  );
}

/** Does this stored venue name refer to `venue`, by name or by alias? */
function namesVenue(stored: string, venue: ReviewableVenue): boolean {
  if (norm(venue.name) === stored) return true;
  return (venue.aliases ?? []).some((alias) => norm(alias) === stored);
}

/**
 * Judge one event.
 *
 * `venueForSourceUrl` is passed in rather than imported so this module stays a
 * pure leaf - the resolver lives in reclaim-venue-images.ts and is the SAME
 * longest-suffix match the edge functions use. A second copy of it here is
 * exactly the drift WEB-BE-039 AC3 was trying to avoid, even though it asked
 * for it the other way round.
 */
export function reviewEvent(
  event: ReviewableEvent,
  venues: readonly ReviewableVenue[],
  venueForSourceUrl: (url: string) => string | null,
): EventReview {
  const storedVenue = event.venue ?? null;
  const stored = norm(storedVenue);

  const expectedVenue = event.source_url ? venueForSourceUrl(event.source_url) : null;

  if (!expectedVenue) {
    return {
      id: event.id,
      verdict: 'unknown',
      expectedVenue: null,
      storedVenue,
      reason: event.source_url
        ? 'source is an aggregator or unrecognised host - the URL says nothing about the venue'
        : 'no source_url',
      coordinatesMoved: false,
    };
  }

  const expected = venues.find((v) => norm(v.name) === norm(expectedVenue));

  if (expected && namesVenue(stored, expected)) {
    return {
      id: event.id,
      verdict: 'ok',
      expectedVenue,
      storedVenue,
      reason: 'stored venue is the one its source always covers',
      coordinatesMoved: false,
    };
  }

  // The stored name is not the source's venue. It is only a CANONICALIZATION
  // problem if the stored name is itself a known venue - otherwise it is just
  // whatever the source called the room, which this story does not touch.
  const wrong = venues.find((v) => namesVenue(stored, v));
  if (!wrong) {
    return {
      id: event.id,
      verdict: 'ok',
      expectedVenue,
      storedVenue,
      reason: 'stored venue is not a known venue, so nothing canonicalized it',
      coordinatesMoved: false,
    };
  }

  return {
    id: event.id,
    verdict: 'suspect',
    expectedVenue,
    storedVenue,
    reason: `scraped from a ${expectedVenue} source but stored as ${wrong.name}`,
    coordinatesMoved: sameCoordinates(event, wrong),
  };
}

export function summarize(reviews: readonly EventReview[]) {
  return {
    total: reviews.length,
    suspect: reviews.filter((r) => r.verdict === 'suspect').length,
    ok: reviews.filter((r) => r.verdict === 'ok').length,
    unknown: reviews.filter((r) => r.verdict === 'unknown').length,
    coordinatesMoved: reviews.filter((r) => r.coordinatesMoved).length,
  };
}
