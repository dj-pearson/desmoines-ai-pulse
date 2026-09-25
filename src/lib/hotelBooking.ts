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
  /** Visible link text: "Book on hilton.com" or "Hotel website". */
  label: string;
  /** The rel attribute to put on the anchor. */
  rel: string;
  /**
   * The site the visitor ends up on ("hilton.com"), or null when an affiliate
   * redirect could not be decoded and there is no website to fall back to.
   */
  host: string | null;
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

/**
 * Affiliate NETWORKS, not places anyone books. generate-hotel-affiliate-urls
 * stores the network in affiliate_provider ("Partnerize", "Awin",
 * "Commission Junction"), so "Book via Awin" is what the first pass printed
 * on a link that lands on hilton.com (plan-stay-pass2 WP2 item 2).
 */
const NETWORK_NAMES = new Set([
  'partnerize',
  'awin',
  'commission junction',
  'cj',
  'cj affiliate',
  'impact',
  'rakuten',
  'shareasale',
]);

/** The longest provider name we will print; anything longer is not a name. */
const MAX_PROVIDER_LENGTH = 40;

/**
 * "Expedia" from "expedia", the stored text for an unknown one, or null. A
 * network name ("Awin") is null: it is who pays us, not where you book.
 */
export function bookingProviderName(provider: string | null | undefined): string | null {
  if (typeof provider !== 'string') return null;
  const trimmed = provider.trim();
  if (!trimmed || trimmed.length > MAX_PROVIDER_LENGTH) return null;
  if (NETWORK_NAMES.has(trimmed.toLowerCase())) return null;
  return PROVIDER_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

/** CJ's click domains. generate-hotel-affiliate-urls writes anrdoezrs.net. */
const CJ_HOSTS = new Set([
  'anrdoezrs.net',
  'dpbolvw.net',
  'jdoqocy.com',
  'kqzyfj.com',
  'tkqlhce.com',
]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function isNetworkHost(host: string): boolean {
  return host === 'awin1.com' || host === 'prf.hn' || host.endsWith('.prf.hn') || CJ_HOSTS.has(host);
}

/**
 * Where an affiliate redirect sends the visitor, as a safe http(s) URL, or
 * null. Reads the three shapes generate-hotel-affiliate-urls builds:
 * Awin `?ued=`, CJ `?url=` and Partnerize `/destination:<url>`.
 */
export function affiliateDestination(affiliateUrl: string | null | undefined): string | null {
  const safe = safeWebUrl(affiliateUrl);
  if (!safe) return null;
  const url = parseUrl(safe);
  if (!url) return null;
  const host = bareHost(url.hostname);

  if (host === 'awin1.com') return safeWebUrl(url.searchParams.get('ued'));
  if (CJ_HOSTS.has(host)) return safeWebUrl(url.searchParams.get('url'));
  if (host === 'prf.hn' || host.endsWith('.prf.hn')) {
    // The destination is the rest of the URL, query and all, and may or may
    // not be percent-encoded.
    const marker = '/destination:';
    const at = safe.indexOf(marker);
    if (at < 0) return null;
    let rest = safe.slice(at + marker.length);
    if (/^https?%3A/i.test(rest)) {
      try {
        rest = decodeURIComponent(rest);
      } catch {
        return null;
      }
    }
    return safeWebUrl(rest);
  }
  return null;
}

/** "hilton.com" from "https://www.hilton.com/en/hotels/...", or null. */
export function bookingHost(url: string | null | undefined): string | null {
  const safe = safeWebUrl(url);
  if (!safe) return null;
  const parsed = parseUrl(safe);
  return parsed ? bareHost(parsed.hostname) : null;
}

/**
 * The booking link to render for a hotel, or null when it has no usable one.
 *
 * An affiliate URL wins and is sponsored. Its label names the site the
 * visitor lands on ("Book on hilton.com"): the link's own host, or for a
 * network redirect the destination decoded from it, then the hotel's own
 * website host. A network name is never printed. A plain website reads "Hotel website" and carries
 * no sponsored rel, because nobody pays us for it and saying otherwise to a
 * crawler is a false claim.
 */
export function resolveBooking(hotel: HotelBookingSource | null | undefined): HotelBooking | null {
  if (!hotel) return null;

  const affiliate = safeWebUrl(hotel.affiliate_url);
  if (affiliate) {
    const ownHost = bookingHost(affiliate);
    // A network redirect lands where it points; any other link lands on its
    // own host. Only an undecodable redirect falls back to the website.
    const host =
      ownHost && !isNetworkHost(ownHost)
        ? ownHost
        : bookingHost(affiliateDestination(affiliate)) ?? bookingHost(hotel.website);
    return {
      href: affiliate,
      isAffiliate: true,
      label: host ? `Book on ${host}` : 'Book with our partner',
      rel: 'sponsored noopener noreferrer',
      host,
    };
  }

  const website = safeWebUrl(hotel.website);
  if (website) {
    return {
      href: website,
      isAffiliate: false,
      label: 'Hotel website',
      rel: 'noopener noreferrer',
      host: bookingHost(website),
    };
  }

  return null;
}

/**
 * The official hotel class to print as stars, or null.
 *
 * The Google Places import wrote the review average into star_rating (a 4.5
 * from reviews is not a four-and-a-half-star hotel), and D15 cleans the rows
 * already stored. Until then a row with a google_place_id is not trusted as a
 * class, and 0 is never printed.
 */
export function hotelClassStars(hotel: {
  star_rating?: number | null;
  google_place_id?: string | null;
}): number | null {
  if (hotel.google_place_id) return null;
  const n = hotel.star_rating;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
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
