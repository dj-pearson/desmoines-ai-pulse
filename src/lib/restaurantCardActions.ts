/**
 * What a restaurant list card offers besides its link (WEB-UX-087): a Call
 * action, a Directions action, and the street part of the address.
 *
 * Each action exists only when the row carries what it needs. A place that
 * is closed (for good or for now) gets no Call, and a place closed for good
 * gets no Directions either: there is nothing to drive to.
 */
import { getDirectionsUrl } from "@/lib/directions";
import { telHref } from "@/lib/reservations";
import { isPermanentlyClosedRestaurant, isShutRestaurant } from "@/lib/restaurantStatus";

export interface CardActionSource {
  phone?: string | null;
  location?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  business_status?: string | null;
}

export interface CardActions {
  /** A tel: href, or null. */
  callHref: string | null;
  /** A Google Maps directions URL, or null. */
  directionsHref: string | null;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The address without the city the card already prints beside the price.
 *
 * "123 Grand Ave, Des Moines, IA 50309" with city "Des Moines" is
 * "123 Grand Ave": the city segment and everything after it (state, zip,
 * country) go. A location that is only the city is null. A location that
 * does not name the city is returned whole, since there is nothing to drop.
 */
export function streetAddress(location: string | null | undefined, city: string | null | undefined): string | null {
  const loc = location?.trim();
  if (!loc) return null;
  const c = city?.trim();
  if (!c) return loc;
  const parts = loc.split(",").map((p) => p.trim());
  const at = parts.findIndex((p) => sameText(p, c));
  if (at < 0) return loc;
  const street = parts.slice(0, at).filter(Boolean).join(", ");
  return street || null;
}

function finite(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function restaurantCardActions(row: CardActionSource): CardActions {
  const shut = isShutRestaurant(row);
  const gone = isPermanentlyClosedRestaurant(row);

  const callHref = shut ? null : telHref(row.phone);

  let directionsHref: string | null = null;
  if (!gone) {
    if (finite(row.latitude) && finite(row.longitude)) {
      directionsHref = getDirectionsUrl({ latitude: row.latitude, longitude: row.longitude });
    } else {
      // A street address, with the city so the maps search lands in the right
      // town. A bare city name would route to the middle of town, so a row
      // with no street and no coordinates gets no Directions.
      const street = streetAddress(row.location, row.city);
      if (street) {
        directionsHref = getDirectionsUrl({ address: [street, row.city?.trim()].filter(Boolean).join(", ") });
      }
    }
  }

  return { callHref, directionsHref };
}
