import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";

interface EventListJsonLdProps {
  events: Event[];
  listName: string;
  listDescription: string;
  listUrl: string;
  /** Max events to include in schema (default 50) */
  maxItems?: number;
}

/**
 * Generates JSON-LD structured data for a list of events.
 * Outputs both an ItemList schema and individual Event schemas
 * to maximize Google Events indexing coverage.
 *
 * Google requires: name, startDate, location for Event rich results.
 * Recommended: endDate, eventStatus, eventAttendanceMode, image, description, offers, organizer.
 */
export function EventListJsonLd({
  events,
  listName,
  listDescription,
  listUrl,
  maxItems = 50,
}: EventListJsonLdProps) {
  if (!events || events.length === 0) return null;

  const eventsToSchema = events.slice(0, maxItems);

  const buildEventSchema = (event: Event) => {
    const eventSlug = createEventSlugWithCentralTime(event.title, event);
    const eventUrl = `${BRAND.baseUrl}/events/${eventSlug}`;
    const startDate = event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString());
    const isFree = !event.price || event.price.toLowerCase().includes('free') || event.price === '$0' || event.price === '0';

    return {
      "@type": "Event",
      "@id": eventUrl,
      name: event.title,
      description: event.enhanced_description || event.original_description || `${event.title} in ${event.city || BRAND.city}, ${BRAND.state}`,
      startDate,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: event.venue || event.location || `${BRAND.city} Area`,
        address: {
          "@type": "PostalAddress",
          streetAddress: event.location || "",
          addressLocality: event.city || BRAND.city,
          addressRegion: BRAND.state,
          addressCountry: BRAND.country,
        },
        ...(event.latitude && event.longitude && {
          geo: {
            "@type": "GeoCoordinates",
            latitude: event.latitude,
            longitude: event.longitude,
          },
        }),
      },
      ...(event.image_url && { image: [event.image_url] }),
      url: eventUrl,
      offers: {
        "@type": "Offer",
        price: isFree ? "0" : (event.price?.replace(/[^0-9.]/g, '') || "0"),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: event.source_url || eventUrl,
      },
      isAccessibleForFree: isFree,
      organizer: {
        "@type": "Organization",
        name: BRAND.name,
        url: BRAND.baseUrl,
      },
    };
  };

  // ItemList wrapping all events
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    description: listDescription,
    url: listUrl,
    numberOfItems: eventsToSchema.length,
    itemListElement: eventsToSchema.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
      item: buildEventSchema(event),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
    </Helmet>
  );
}

export default EventListJsonLd;
