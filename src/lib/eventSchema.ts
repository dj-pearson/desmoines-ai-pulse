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
import { createEventSlugWithCentralTime } from '@/lib/timezone';
import { BRAND } from '@/lib/brandConfig';
import { buildEventOffers, isEventAccessibleForFree } from '@/lib/eventOffers';

/** Assumed run time when an event has no explicit end. */
const DEFAULT_EVENT_HOURS = 3;

export function eventPageUrl(event: Event): string {
  return `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`;
}

export function eventStartIso(event: Event): string {
  return (
    event.event_start_utc ||
    (typeof event.date === 'string' ? event.date : event.date.toISOString())
  );
}

/**
 * endDate, which Google's Events report names as a missing field.
 *
 * Falls back to start + 3h rather than omitting. This is the one estimated
 * field here and it is a deliberate exception to the omit-rather-than-guess
 * rule above: an Event with no endDate is treated by Google as a point in time
 * and drops out of "happening now" style surfaces, and a three-hour evening
 * event is a far better estimate than no duration at all. It is bounded, it
 * cannot mislead a reader (nothing renders it), and it is never applied over a
 * real end_date.
 */
export function eventEndIso(event: Event): string {
  if (event.end_date) return event.end_date;
  const startMs = new Date(eventStartIso(event)).getTime();
  if (!Number.isFinite(startMs)) return eventStartIso(event);
  return new Date(startMs + DEFAULT_EVENT_HOURS * 60 * 60 * 1000).toISOString();
}

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
export function buildEventJsonLd(event: Event, opts: { withContext?: boolean } = {}) {
  const url = eventPageUrl(event);
  const offers = buildEventOffers(event.price);
  const accessibleForFree = isEventAccessibleForFree(event.price);
  const city = event.city?.trim();

  return {
    ...(opts.withContext ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Event' as const,
    '@id': url,
    name: event.title,
    description:
      event.enhanced_description ||
      event.original_description ||
      `${event.title} in ${city || BRAND.city}, ${BRAND.state}`,
    startDate: eventStartIso(event),
    endDate: eventEndIso(event),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: buildEventLocation(event),
    image: event.image_url ? [event.image_url] : [`${BRAND.baseUrl}${BRAND.ogImage}`],
    url,
    ...(offers
      ? {
          offers: {
            ...offers,
            url: event.source_url || url,
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
      item: buildEventJsonLd(event),
    })),
  };
}
