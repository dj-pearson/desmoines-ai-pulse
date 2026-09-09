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
 */

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
  return restaurant.reservable === true || Boolean(restaurant.reservation_url);
}

export function resolveReservation(restaurant: ReservationSource): ReservationAction {
  // 1. A curated link goes straight to the restaurant's own booking page and
  //    beats everything else.
  if (restaurant.reservation_url) {
    const label = providerLabel(restaurant.reservation_provider);
    return {
      kind: 'booking',
      label: 'Reserve a table',
      href: restaurant.reservation_url,
      external: true,
      detail: label ? `Booking through ${label}` : undefined,
    };
  }

  // 2. Google's listing carries a reserve button for a reservable place. Only
  //    offered when `reservable` is actually true - sending someone to a Google
  //    listing that has no reserve button would be a dead end dressed up as a
  //    booking link.
  if (restaurant.reservable === true && restaurant.google_maps_uri) {
    return {
      kind: 'booking',
      label: 'Reserve a table',
      href: restaurant.google_maps_uri,
      external: true,
      detail: 'Booking through the Google listing',
    };
  }

  // 3. Known to take reservations, but we have no link for it.
  if (restaurant.reservable === true && restaurant.phone) {
    return {
      kind: 'call_to_reserve',
      label: 'Call to reserve',
      href: `tel:${restaurant.phone}`,
      external: false,
      detail: 'This restaurant takes reservations by phone',
    };
  }

  // 4. Unknown, or known NOT to take reservations. Offer the phone without
  //    claiming anything about reservations - the old copy claimed it for
  //    every restaurant that had a number.
  if (restaurant.phone) {
    return {
      kind: 'call',
      label: 'Call the restaurant',
      href: `tel:${restaurant.phone}`,
      external: false,
      detail:
        restaurant.reservable === false
          ? 'Walk-ins only, according to their Google listing'
          : undefined,
    };
  }

  if (restaurant.website) {
    return {
      kind: 'website',
      label: 'Visit website',
      href: restaurant.website,
      external: true,
    };
  }

  return { kind: 'none', label: 'No contact details yet', external: false };
}
