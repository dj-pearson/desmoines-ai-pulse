/**
 * One booking truth for every hotel surface (plan-stay WP2 items 3-5).
 *
 * WHAT WAS THERE BEFORE. HotelDetails computed the booking link twice, once
 * with `??` and once with `||`, so an empty-string affiliate_url sent the
 * sidebar button to the website and the sticky CTA to nowhere. HotelCard had a
 * third copy. Every copy labelled the link "Book Now" and marked it
 * rel="sponsored" whether or not anyone paid us for it, and every copy put the
 * raw column text into an href. `hotels` is writable by any signed-in user
 * until the RLS fix lands (D2 in docs/page-plans/plan-stay.md), so
 * `javascript:` in affiliate_url was one row away from a click-to-run link.
 *
 * NOW. resolveBooking() is the only place that decides which link a hotel
 * gets, what it is called, and whether it is sponsored. Both URLs go through
 * safeWebUrl first, so anything that is not an absolute http(s) URL renders
 * no link at all. EventHotelCallout (owned by the Events plan) is meant to
 * import this too.
 *
 * PRICES ARE LABELS, NOT AMOUNTS. avg_nightly_rate was seeded once and nothing
 * refreshes it. hotelRateLabel() words it as a typical figure that moves with
 * the date, and does no arithmetic on it. Nothing here decides what anyone is
 * charged; the hotel or the booking site does that.
 */
import { safeWebUrl } from '@/lib/reservations';

export { safeWebUrl };

export interface HotelBookingSource {
  affiliate_url?: string | null;
  affiliate_provider?: string | null;
  website?: string | null;
}

export interface HotelBooking {
  /** An absolute http(s) URL. */
  href: string;
  /** True when the link is a paid/affiliate one. */
  isAffiliate: boolean;
  /** Visible link text: "Book via Expedia" or "Hotel website". */
  label: string;
  /** The rel attribute to put on the anchor. */
  rel: string;
}

/** Shown next to every affiliate booking link. */
export const AFFILIATE_DISCLOSURE =
  'Affiliate link: we may earn a commission if you book, at no extra cost to you.';

const PROVIDER_NAMES: Record<string, string> = {
  booking: 'Booking.com',
  'booking.com': 'Booking.com',
  expedia: 'Expedia',
  'hotels.com': 'Hotels.com',
  hotels: 'Hotels.com',
  priceline: 'Priceline',
  kayak: 'Kayak',
  tripadvisor: 'Tripadvisor',
  agoda: 'Agoda',
  hotelscombined: 'HotelsCombined',
  trivago: 'trivago',
};

/** The longest provider name we will print; anything longer is not a name. */
const MAX_PROVIDER_LENGTH = 40;

/** "Expedia" from "expedia", the stored text for an unknown one, or null. */
export function bookingProviderName(provider: string | null | undefined): string | null {
  if (typeof provider !== 'string') return null;
  const trimmed = provider.trim();
  if (!trimmed || trimmed.length > MAX_PROVIDER_LENGTH) return null;
  return PROVIDER_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * The booking link to render for a hotel, or null when it has no usable one.
 *
 * An affiliate URL wins: it reads "Book via {provider}" and is sponsored. A
 * plain website reads "Hotel website" and carries no sponsored rel, because
 * nobody pays us for it and saying otherwise to a crawler is a false claim.
 */
export function resolveBooking(hotel: HotelBookingSource | null | undefined): HotelBooking | null {
  if (!hotel) return null;

  const affiliate = safeWebUrl(hotel.affiliate_url);
  if (affiliate) {
    const provider = bookingProviderName(hotel.affiliate_provider);
    return {
      href: affiliate,
      isAffiliate: true,
      label: provider ? `Book via ${provider}` : 'Book via our partner',
      rel: 'sponsored noopener noreferrer',
    };
  }

  const website = safeWebUrl(hotel.website);
  if (website) {
    return {
      href: website,
      isAffiliate: false,
      label: 'Hotel website',
      rel: 'noopener noreferrer',
    };
  }

  return null;
}

/**
 * "Typically about $129/night; rates change by date", or null.
 *
 * Display only. The figure is shown as stored (rounded to whole dollars for
 * reading) and never added, multiplied or compared to produce a price.
 */
export function hotelRateLabel(rate: number | string | null | undefined): string | null {
  if (rate === null || rate === undefined || rate === '') return null;
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(n) || n <= 0) return null;
  const dollars = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `Typically about $${dollars}/night; rates change by date`;
}
