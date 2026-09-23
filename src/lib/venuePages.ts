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

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

/**
 * The venue an event's free-text venue names, or null.
 *
 * The longer venue name wins when several match, so "Des Moines Civic Center"
 * beats a hypothetical "Civic Center" row for an event at the former.
 */
export function matchVenue<V extends VenueLike>(eventVenue: string | null | undefined, venues: V[]): V | null {
  const needle = normalise(eventVenue || "");
  if (!needle) return null;

  let best: V | null = null;
  let bestLen = 0;
  for (const venue of venues) {
    const name = normalise(venue.name);
    if (!name) continue;
    const shorter = name.length <= needle.length ? name : needle;
    if (shorter.split(" ").length < 2) {
      if (name !== needle) continue;
    } else if (!(` ${needle} `.includes(` ${name} `) || ` ${name} `.includes(` ${needle} `))) {
      continue;
    }
    if (name.length > bestLen) {
      best = venue;
      bestLen = name.length;
    }
  }
  return best;
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
