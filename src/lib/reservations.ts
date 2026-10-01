/**
 * Which booking path to offer on a restaurant page (WEB-FEAT-024).
 *
 * WHAT WAS THERE BEFORE. One affordance: a tel: link labelled "Call to
 * Reserve", shown for every restaurant with a phone number. That asserts the
 * place takes reservations, which for a counter-service taco shop is simply
 * false, and it was the only booking path on the highest-intent action of the
 * page.
 *
 * TWO SOURCES, DELIBERATELY KEPT APART.
 *
 *   reservable, google_maps_uri   automatic, from the Places enrichment pass
 *   reservation_url, provider     curated, no automatic source exists
 *
 * The Places API (New) publishes `reservable` and `googleMapsUri` but NO
 * booking-provider URL - checked against Google's own field reference, not
 * assumed. So the automatic path sends a visitor to the Google listing, which
 * carries its own reserve button for a reservable place, and a curated direct
 * link wins whenever someone has entered one.
 *
 * NULL IS NOT FALSE. `reservable` is a tristate. Unknown must fall back to the
 * neutral "call the restaurant" wording rather than either claiming or denying
 * that reservations are taken.
 *
 * EVERY URL HERE IS SCRAPED OR CURATED TEXT, not a link we built. `website`,
 * `reservation_url` and `google_maps_uri` all pass through safeWebUrl before
 * they reach an href, so a `javascript:` value renders no link at all rather
 * than a clickable one (restaurants plan WP8 item 1).
 */
import { safeHttpUrl } from '@/lib/safeUrl';

/**
 * An absolute http(s) URL, or null. Delegates to safeHttpUrl so the React
 * page and the crawler shell (functions/_middleware.ts) refuse the same values.
 * A bare "www.x.com" becomes https://www.x.com/; any other scheme is refused.
 */
export function safeWebUrl(raw: unknown): string | null {
  return safeHttpUrl(raw);
}

/**
 * A tel: href, or null when the value holds too few digits to dial. Only
 * digits and the usual phone punctuation survive, so the href cannot carry
 * anything else.
 */
export function telHref(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[^0-9+().-]/g, '');
  if (cleaned.replace(/\D/g, '').length < 7) return null;
  return `tel:${cleaned}`;
}

export interface ReservationSource {
  name?: string | null;
  phone?: string | null;
  website?: string | null;
  reservable?: boolean | null;
  google_maps_uri?: string | null;
  reservation_url?: string | null;
  reservation_provider?: string | null;
}

export type ReservationKind =
  /** A real booking page: curated link, or the Google listing. */
  | 'booking'
  /** We know they take reservations, but only by phone. */
  | 'call_to_reserve'
  /** We do not know, or they do not take them. Phone, without the claim. */
  | 'call'
  /** No phone and no booking link. */
  | 'website'
  | 'none';

export interface ReservationAction {
  kind: ReservationKind;
  label: string;
  href?: string;
  /** Opens in a new tab. */
  external: boolean;
  /** Short line explaining what the visitor is about to get. */
  detail?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  opentable: 'OpenTable',
  resy: 'Resy',
  tock: 'Tock',
  yelp: 'Yelp',
  sevenrooms: 'SevenRooms',
  direct: 'the restaurant',
};

export function providerLabel(provider?: string | null): string | undefined {
  if (!provider) return undefined;
  return PROVIDER_LABELS[provider.toLowerCase()];
}

/** True when we can say, on evidence, that the place takes reservations. */
export function takesReservations(restaurant: ReservationSource): boolean {
  return restaurant.reservable === true || safeWebUrl(restaurant.reservation_url) !== null;
}

export function resolveReservation(restaurant: ReservationSource): ReservationAction {
  const reservationUrl = safeWebUrl(restaurant.reservation_url);
  const mapsUrl = safeWebUrl(restaurant.google_maps_uri);
  const website = safeWebUrl(restaurant.website);
  const tel = telHref(restaurant.phone);

  // 1. A curated link goes straight to the restaurant's own booking page and
  //    beats everything else.
  if (reservationUrl) {
    const label = providerLabel(restaurant.reservation_provider);
    return {
      kind: 'booking',
      label: 'Reserve a table',
      href: reservationUrl,
      external: true,
      detail: label ? `Booking through ${label}` : undefined,
    };
  }

  // 2. Google's listing carries a reserve button for a reservable place. Only
  //    offered when `reservable` is actually true - sending someone to a Google
  //    listing that has no reserve button would be a dead end dressed up as a
  //    booking link.
  if (restaurant.reservable === true && mapsUrl) {
    return {
      kind: 'booking',
      label: 'Reserve a table',
      href: mapsUrl,
      external: true,
      detail: 'Booking through the Google listing',
    };
  }

  // 3. Known to take reservations, but we have no link for it.
  if (restaurant.reservable === true && tel) {
    return {
      kind: 'call_to_reserve',
      label: 'Call to reserve',
      href: tel,
      external: false,
      detail: 'This restaurant takes reservations by phone',
    };
  }

  // 4. Unknown, or known NOT to take reservations. Offer the phone without
  //    claiming anything about reservations - the old copy claimed it for
  //    every restaurant that had a number.
  if (tel) {
    return {
      kind: 'call',
      label: 'Call the restaurant',
      href: tel,
      external: false,
      detail:
        restaurant.reservable === false
          ? 'Walk-ins only, according to their Google listing'
          : undefined,
    };
  }

  if (website) {
    return {
      kind: 'website',
      label: 'Visit website',
      href: website,
      external: true,
    };
  }

  return { kind: 'none', label: 'No contact details yet', external: false };
}
