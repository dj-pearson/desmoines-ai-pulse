/**
 * Venue pages: which venue an event is at, what is near a venue, and the
 * venue's own JSON-LD (SEO-018, SEO-013).
 *
 * WHY THE MATCHER IS CONSERVATIVE. events.venue is free text from three
 * scrapers - "Wells Fargo Arena", "Wells Fargo Arena - Des Moines", "Civic
 * Center" - and the venues table has one canonical name per venue. A match
 * turns into a link on the event page, so a loose one sends a reader to the
 * wrong building. Containment in either direction, after normalising case and
 * punctuation, and never on a fragment shorter than two words: "Arena" alone
 * must not match Wells Fargo Arena.
 *
 * WHY DISTANCES ARE STRAIGHT-LINE AND SAY SO. SEO-013 is "which hotel is
 * walkable to the venue I bought a ticket for", and its own criteria forbid
 * a distance nobody verified. A haversine between two stored coordinates is
 * a measurement, not a claim about the walk; it is labelled as a straight
 * line wherever it renders, and nothing here calls anything "walkable".
 *
 * WHAT THE JSON-LD LEAVES OUT. The seed migration carries a capacity for each
 * venue. Nobody verified those figures, and SEO-018 names seating capacity as
 * a field not to assert, so it is neither rendered nor emitted.
 */
import { BRAND } from "@/lib/brandConfig";
import { haversineDistance } from "@/lib/geo";
import { sanitizePostgrestPattern } from "@/lib/postgrestPattern";

export interface VenueLike {
  name: string;
  slug: string;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  website?: string | null;
  image_url?: string | null;
  description?: string | null;
}

/** How far is "near" for a hotel or a venue, in straight-line miles. */
export const NEARBY_MILES = 2;

/**
 * A venue name reduced to what two spellings of it share: lower case, "&" as
 * "and", apostrophes dropped (so "Wooly's" and "Woolys" agree, and "Lefty's"
 * and "Leftys"), other punctuation as a space, a leading "the" dropped.
 *
 * Apostrophes go before the punctuation pass on purpose: turned into a space
 * they split "wooly s" off from "woolys", and that was why the /music card for
 * Woolys never showed a "Next:" line (explore pass 2 WP5 item 1).
 */
export function normaliseVenueName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/['\u2018\u2019`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    .replace(/\s+/g, " ");
}

/**
 * Other names the event scrapers write for a venue row, keyed by the row's
 * slug. Taken from known_venues.aliases in
 * supabase/migrations/20260729000001_event_source_venue_aliases.sql and
 * 20260203000000_known_venues.sql, and kept in code so /music adds no request.
 *
 * The arena is Casey's Center now; the venues row still says Wells Fargo Arena
 * until the data rename (explore-pass2 D13) ships, so both names must match.
 * known_venues also lists "Wells Fargo" and "The Well"; they are left out
 * because "Wells Fargo" would match "Wells Fargo Arenas Parking Lot" and a
 * wrong venue link is worse than none.
 */
export const VENUE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "wells-fargo-arena": [
    "Casey's Center",
    "Caseys Center",
    "Casey's Center at Iowa Events Center",
    "WF Arena",
  ],
  woolys: ["Wooly's", "Wooly's Des Moines"],
  "leftys-live-music": ["Lefty's Live Music", "Lefty's", "Leftys"],
};

/**
 * Former names shown under their current one. The teams and venues rows still
 * carry "Wells Fargo Arena" (D13); the building has been Casey's Center since
 * the rename, and a page should not send someone looking for a sign that is
 * gone.
 */
const CURRENT_VENUE_NAMES: Readonly<Record<string, string>> = {
  "wells fargo arena": "Casey's Center",
};

/** A venue name as it should read on a page today. */
export function currentVenueName(name: string): string;
export function currentVenueName(name: string | null | undefined): string | null;
export function currentVenueName(name: string | null | undefined): string | null {
  if (!name) return name ?? null;
  return CURRENT_VENUE_NAMES[normaliseVenueName(name)] ?? name;
}

/** Every name a venue row answers to: its own, then its aliases. */
export function venueNames(venue: { name: string; slug?: string | null }): string[] {
  const aliases = venue.slug ? VENUE_ALIASES[venue.slug] ?? [] : [];
  return [venue.name, ...aliases];
}

/** How well one venue name matches the event's text; 0 is no match. */
function nameMatchScore(needle: string, rawName: string): number {
  const name = normaliseVenueName(rawName);
  if (!name) return 0;
  const shorter = name.length <= needle.length ? name : needle;
  if (shorter.split(" ").length < 2) {
    return name === needle ? name.length : 0;
  }
  return ` ${needle} `.includes(` ${name} `) || ` ${name} `.includes(` ${needle} `) ? name.length : 0;
}

/**
 * The venue an event's free-text venue names, or null. This is the one rule
 * for "is this event at this venue": event detail, the venue page
 * (useVenueEvents) and the /music venue cards (eventAtVenue) all use it.
 *
 * A venue matches under its own name or any alias in VENUE_ALIASES. The
 * longer matching name wins when several venues match, so "Des Moines Civic
 * Center" beats a hypothetical "Civic Center" row for an event at the former.
 */
export function matchVenue<V extends Pick<VenueLike, "name"> & { slug?: string | null }>(
  eventVenue: string | null | undefined,
  venues: readonly V[],
): V | null {
  const needle = normaliseVenueName(eventVenue);
  if (!needle) return null;

  let best: V | null = null;
  let bestLen = 0;
  for (const venue of venues) {
    for (const candidate of venueNames(venue)) {
      const score = nameMatchScore(needle, candidate);
      if (score > bestLen) {
        best = venue;
        bestLen = score;
      }
    }
  }
  return best;
}

/**
 * The loose PostgREST pre-filter for one venue's events: an or() body of
 * `venue.ilike` over each of its names, with LIKE wildcards and or() syntax
 * neutralised. It over-fetches on purpose; matchVenue decides.
 */
export function venueIlikeOrFilter(venue: { name: string; slug?: string | null }): string {
  const patterns = new Set<string>();
  for (const name of venueNames(venue)) {
    // Each apostrophe becomes LIKE's one-character wildcard, so the pattern
    // for "Wooly's" also finds a row typed with U+2019. Everything between is
    // escaped as usual (commas and parentheses would end the or() clause).
    const core = name
      .split(/['\u2018\u2019`]/)
      .map((part) => sanitizePostgrestPattern(part))
      .join("_")
      .trim();
    if (core.replace(/_/g, "").trim()) patterns.add(`venue.ilike.%${core}%`);
  }
  return [...patterns].join(",");
}

function coords(p: { latitude?: number | string | null; longitude?: number | string | null }) {
  const latitude = p.latitude == null ? NaN : Number(p.latitude);
  const longitude = p.longitude == null ? NaN : Number(p.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
    ? { latitude, longitude }
    : null;
}

/**
 * Items within `maxMiles` of `origin`, nearest first, each with its
 * straight-line distance. Items without coordinates are left out rather than
 * placed last: an unknown distance is not "far".
 */
export function nearby<T extends { latitude?: number | string | null; longitude?: number | string | null }>(
  origin: { latitude?: number | string | null; longitude?: number | string | null },
  items: T[],
  opts: { maxMiles?: number; limit?: number } = {},
): Array<{ item: T; miles: number }> {
  const from = coords(origin);
  if (!from) return [];
  const maxMiles = opts.maxMiles ?? NEARBY_MILES;
  return items
    .map((item) => {
      const at = coords(item);
      return at ? { item, miles: haversineDistance(from, at) } : null;
    })
    .filter((x): x is { item: T; miles: number } => !!x && x.miles <= maxMiles)
    .sort((a, b) => a.miles - b.miles)
    .slice(0, opts.limit ?? 5);
}

/** "0.3 mi", or "under 0.1 mi" - one decimal is all a straight line earns. */
export function formatMiles(miles: number): string {
  return miles < 0.1 ? "under 0.1 mi" : `${miles.toFixed(1)} mi`;
}

/** "West Des Moines" from "301 Ashworth Rd, West Des Moines, IA 50265". */
export function venueCity(address: string | null | undefined): string | null {
  const parts = (address || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return parts[parts.length - 2] || null;
}

export function venuePageUrl(venue: Pick<VenueLike, "slug">): string {
  return `${BRAND.baseUrl}/music/venues/${venue.slug}`;
}

/** The venue as an EventVenue node. Only stored fields; capacity omitted (see header). */
export function buildVenueJsonLd(venue: VenueLike) {
  const url = venuePageUrl(venue);
  const at = coords(venue);
  const city = venueCity(venue.address);
  return {
    "@context": "https://schema.org",
    "@type": "EventVenue" as const,
    "@id": `${url}#venue`,
    name: venue.name,
    url,
    ...(venue.description ? { description: venue.description } : {}),
    ...(venue.image_url ? { image: venue.image_url } : {}),
    ...(venue.website ? { sameAs: [venue.website] } : {}),
    ...(venue.address
      ? {
          address: {
            "@type": "PostalAddress" as const,
            streetAddress: venue.address.split(",")[0].trim(),
            ...(city ? { addressLocality: city } : {}),
            addressRegion: BRAND.stateAbbr,
            addressCountry: BRAND.country,
          },
        }
      : {}),
    ...(at ? { geo: { "@type": "GeoCoordinates" as const, ...at } } : {}),
  };
}
