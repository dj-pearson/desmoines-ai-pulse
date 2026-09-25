/**
 * SEO-002 / SEO-007: the single Event JSON-LD builder.
 *
 * WHY THIS EXISTS. Ten places in this repo built an Event node, and they
 * disagreed. Measured live on 2026-08-28:
 *
 *   /events                 30 Event nodes, NO endDate
 *   /events/this-weekend    40 Event nodes, endDate present
 *   /events/today           23 Event nodes, endDate present
 *
 * Same event data, same site, three pages, two answers. /events built its node
 * inline in EventsPage.tsx while the other two went through
 * EventListJsonLd.tsx, and the inline copy had simply never gained the field.
 * That is rule-24 drift with a rich result attached to it: Google's Events
 * report lists `endDate` among the fields it wants, and the page that omits it
 * is the hub for the term we most want to rank for.
 *
 * So the node is built HERE, once, and every caller imports it. A second
 * implementation is how the first disagreement happened.
 *
 * WHAT IS DELIBERATELY OMITTED, because an omitted field beats a wrong one:
 *
 *   organizer / performer  The `events` table carries no organizer, performer
 *     or artist column, so there is nothing true to put here. Both used to fall
 *     back to BRAND.name, which claimed we organize touring Broadway shows and
 *     perform at symphony concerts. An aggregator inserting itself as organizer
 *     of third-party events is false and is a recognisable scraped-content spam
 *     signature. Neither field is required by Google's Event guidance
 *     (WEB-SEO-010). If ingestion ever captures them, add them conditionally -
 *     never as a fallback.
 *
 *   offers  Omitted when the price string is unreadable ("Varies", "TBD").
 *     Asserting price "0" there made every such node claim a free event
 *     (WEB-SEO-018). buildEventOffers owns that judgement.
 *
 *   addressLocality  Omitted when the event has no city. It used to default to
 *     "Des Moines", which is how a trivia night at Mickey's Irish Pub in Waukee
 *     shipped with `addressLocality: "Des Moines"` and Waukee's real geo
 *     coordinates - measured on /events, 2026-08-28. The suburbs are exactly
 *     where a local events site should beat a downtown-focused competitor, and
 *     telling Google they are all one city gives that up. A missing locality
 *     costs a recommended field; a wrong one is bad data on a live page.
 */
import { Event } from '@/lib/types';
import { centralDateOf, createEventSlugWithCentralTime, hasSpecificTime } from '@/lib/timezone';
import { BRAND } from '@/lib/brandConfig';
import { isHttpUrl } from '@/lib/dashboardItems';
import { buildEventOffers, isEventAccessibleForFree, parseEventPrice } from '@/lib/eventOffers';
import { DEFAULT_EVENT_HOURS } from '@/lib/eventTiming';

/**
 * The event's outbound source link, or null when it is missing, not http(s)
 * (a scraped `javascript:` URL), or flagged broken by the link checker. The
 * detail page and the JSON-LD offer both read this, so they cannot disagree.
 */
export function eventTicketUrl(event: { source_url?: string | null; source_url_broken?: boolean | null }): string | null {
  if (event.source_url_broken) return null;
  return isHttpUrl(event.source_url) ? event.source_url : null;
}

/**
 * Hosts that sell tickets for what they list (events-pass2 WP4 item 5): the
 * national ticketers, plus the team and venue sites the scrapers ingest from
 * (supabase/functions/_shared/knownVenues.ts and the firecrawl sources), which
 * sell their own. A match is the host itself or any subdomain of it.
 */
export const TICKETING_HOSTS: readonly string[] = [
  'ticketmaster.com',
  'seatgeek.com',
  'etix.com',
  'eventbrite.com',
  'axs.com',
  'iowawild.com',
  'theiowabarnstormers.com',
  'milb.com',
  'iowa.gleague.nba.com',
];

/** The link's host without "www.", or null for a missing or non-http link. */
export function linkHost(url: string | null | undefined): string | null {
  if (!isHttpUrl(url)) return null;
  try {
    return new URL(url as string).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isTicketingHost(host: string): boolean {
  return TICKETING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface EventOutboundLink {
  href: string;
  /** "Get tickets", or "Event listing on catchdesmoines.com". */
  label: string;
  /** True only when the label promises tickets. */
  sellsTickets: boolean;
}

/**
 * What the detail page's outbound button says, and where it goes. "Get
 * tickets" is a promise that the link sells them, so it needs both a stated
 * paid price (fixed or a range) and a ticketing host. Anything else names the
 * host, so a reader knows they are going to a listing, not a box office. null
 * when there is no usable link (eventTicketUrl).
 */
export function eventOutboundLink(event: {
  source_url?: string | null;
  source_url_broken?: boolean | null;
  price?: string | null;
}): EventOutboundLink | null {
  const href = eventTicketUrl(event);
  const host = linkHost(href);
  if (!href || !host) return null;
  const kind = parseEventPrice(event.price).kind;
  const paid = kind === 'fixed' || kind === 'range';
  if (paid && isTicketingHost(host)) {
    return { href, label: 'Get tickets', sellsTickets: true };
  }
  return { href, label: `Event listing on ${host}`, sellsTickets: false };
}

export function eventPageUrl(event: Event): string {
  return `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`;
}

/** hasSpecificTime reads string fields, and `date` can arrive as a Date. */
function eventHasTime(event: Event): boolean {
  const date = typeof event.date === 'string' ? event.date : event.date?.toISOString();
  return hasSpecificTime({ ...event, date });
}

function startInstant(event: Event): string {
  return event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString());
}

/** The Central yyyy-MM-dd of an instant string, or null when it won't parse. */
function centralDay(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? centralDateOf(new Date(ms)) : null;
}

export function eventStartIso(event: Event): string {
  const iso = startInstant(event);

  // WEB-BE-038, widened by events-pass2 WP4 item 2. DATE ONLY when the source
  // announced no start time: time_tbd, the 19:31:58 marker, or SeatGeek's
  // 03:30 placeholder - the same test the page uses (hasSpecificTime), so the
  // JSON-LD can't publish a showtime the page says isn't listed. schema.org
  // accepts a bare date for startDate.
  //
  // The date is the CENTRAL one. iso.slice(0, 10) of a UTC string put every
  // evening event on the next day.
  if (!eventHasTime(event)) {
    const day = centralDay(iso);
    if (day) return day;
  }

  return iso;
}

/**
 * endDate, which Google's Events report names as a missing field.
 *
 * Falls back to start + DEFAULT_EVENT_HOURS rather than omitting. This is the
 * one estimated field here and it is a deliberate exception to the
 * omit-rather-than-guess rule above: an Event with no endDate is treated by
 * Google as a point in time and drops out of "happening now" style surfaces.
 * It is bounded, nothing renders it, and it is never applied over a real
 * end_date. eventTiming.ts uses the same constant for "is it over".
 */
export function eventEndIso(event: Event): string | null {
  const startMs = Date.parse(startInstant(event));
  const endMs = event.end_date ? Date.parse(event.end_date) : NaN;
  // An end before the start is bad data; treat it as absent.
  const realEnd =
    event.end_date && (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs >= startMs)
      ? event.end_date
      : null;

  if (!eventHasTime(event)) {
    // WEB-BE-038. NO ESTIMATE WHEN THERE IS NO START TIME: three hours after
    // a placeholder is a made-up hour. A real end_date is kept, as a Central
    // date so it matches the date-only startDate.
    return realEnd ? centralDay(realEnd) : null;
  }

  if (realEnd) return realEnd;
  if (!Number.isFinite(startMs)) return eventStartIso(event);
  return new Date(startMs + DEFAULT_EVENT_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * Cut at a word boundary with "..." (events-pass2 WP4 item 18). List pages
 * carried 30-50 full descriptions each in their ItemList.
 */
function clipDescription(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > (max - 3) * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.-]+$/, '')}...`;
}

/** Characters of description per Event node inside an ItemList. */
export const LIST_DESCRIPTION_MAX = 300;

/** The Place node, with the locality rules described in this file's header. */
export function buildEventLocation(event: Event) {
  const city = event.city?.trim();
  return {
    '@type': 'Place' as const,
    name: event.venue || event.location || `${BRAND.city} Area`,
    address: {
      '@type': 'PostalAddress' as const,
      ...(event.location ? { streetAddress: event.location } : {}),
      // SEO-007: no default. See the header.
      ...(city ? { addressLocality: city } : {}),
      addressRegion: BRAND.state,
      addressCountry: BRAND.country,
    },
    ...(event.latitude && event.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates' as const,
            latitude: event.latitude,
            longitude: event.longitude,
          },
        }
      : {}),
  };
}

/**
 * One Event node. `withContext` adds @context for a standalone block; leave it
 * off inside an ItemList, where the wrapper already carries it.
 */
export function buildEventJsonLd(
  event: Event,
  opts: { withContext?: boolean; descriptionMax?: number } = {},
) {
  const url = eventPageUrl(event);
  const endDate = eventEndIso(event);
  const fullDescription =
    event.enhanced_description ||
    event.original_description ||
    `${event.title} in ${event.city?.trim() || BRAND.city}, ${BRAND.state}`;
  const offers = buildEventOffers(event.price);
  const accessibleForFree = isEventAccessibleForFree(event.price);

  return {
    ...(opts.withContext ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Event' as const,
    // A fragment, not the bare URL. The detail page also emits a WebPage whose
    // @id is the URL (the Speakable node, and this node's own
    // mainEntityOfPage), and a graph parser merges nodes that share an @id -
    // so the Event and its page were read as one thing that was both.
    '@id': `${url}#event`,
    name: event.title,
    // The detail page keeps the full text; lists pass descriptionMax.
    description: opts.descriptionMax
      ? clipDescription(fullDescription, opts.descriptionMax)
      : fullDescription,
    startDate: eventStartIso(event),
    // Omitted rather than estimated when there is no announced start time
    // (WEB-BE-038); see eventEndIso.
    ...(endDate ? { endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: buildEventLocation(event),
    image: event.image_url ? [event.image_url] : [`${BRAND.baseUrl}${BRAND.ogImage}`],
    url,
    ...(offers
      ? {
          offers: {
            ...offers,
            // A source_url the link checker flagged, or one that is not
            // http(s), is not a ticket page (events plan WP8 item 5).
            url: eventTicketUrl(event) ?? url,
            validFrom: event.created_at || new Date().toISOString(),
          },
        }
      : {}),
    ...(accessibleForFree !== undefined ? { isAccessibleForFree: accessibleForFree } : {}),
  };
}

/** ItemList of Event nodes, as used by every list and hub page. */
export function buildEventItemList(
  events: Event[],
  list: { name: string; description: string; url: string },
  maxItems = 50,
) {
  const slice = events.slice(0, maxItems);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList' as const,
    name: list.name,
    description: list.description,
    url: list.url,
    numberOfItems: slice.length,
    itemListElement: slice.map((event, index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      url: eventPageUrl(event),
      item: buildEventJsonLd(event, { descriptionMax: LIST_DESCRIPTION_MAX }),
    })),
  };
}
