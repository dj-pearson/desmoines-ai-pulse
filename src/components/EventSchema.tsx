import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";
import { buildEventOffers, isEventAccessibleForFree } from "@/lib/eventOffers";

interface EventSchemaProps {
  event: Event;
  isUpcoming?: boolean;
}

export default function EventSchema({ event, isUpcoming = true }: EventSchemaProps) {
  const offers = buildEventOffers(event.price);
  const accessibleForFree = isEventAccessibleForFree(event.price);

  // Comprehensive Google Events Schema
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.enhanced_description || event.original_description || event.title,
    startDate: event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString()),
    endDate: event.end_date
      ? event.end_date
      : event.event_start_utc
        ? new Date(new Date(event.event_start_utc).getTime() + 3 * 60 * 60 * 1000).toISOString()
        : new Date((typeof event.date === 'string' ? new Date(event.date).getTime() : event.date.getTime()) + 3 * 60 * 60 * 1000).toISOString(),
    location: {
      "@type": "Place",
      name: event.venue || event.location || "Des Moines, Iowa",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.location || "",
        addressLocality: event.city || "Des Moines", 
        addressRegion: "Iowa",
        addressCountry: "US",
        postalCode: "50309"
      },
      ...(event.latitude && event.longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude: event.latitude,
          longitude: event.longitude
        }
      })
    },
    image: [
      event.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`
    ],
    url: `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
    eventStatus: isUpcoming
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventPostponed",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    organizer: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${BRAND.baseUrl}${BRAND.logo}`
      },
      // WEB-SEO-023: this asserted Facebook, X and Instagram profiles on the
      // OLD brand's handle, under the new brand's name. sameAs is a
      // machine-readable identity claim, so the property is OMITTED rather
      // than emitted empty until BRAND.social has real URLs in it.
      ...(BRAND.social.length > 0 ? { sameAs: [...BRAND.social] } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl
    },
    // WEB-SEO-018: one offers node built from the parsed price, not two hand-
    // written branches. A range yields an AggregateOffer; "Varies" yields
    // nothing, because a fabricated 0 reads to Google as a free event.
    ...(offers && {
      offers: {
        ...offers,
        url: event.source_url || `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
        validFrom: new Date().toISOString(),
        ...(event.venue && {
          seller: { "@type": "Organization", name: event.venue }
        }),
      },
    }),
    performer: event.venue
      ? { "@type": "Organization", name: event.venue }
      : { "@type": "Organization", name: BRAND.name, url: BRAND.baseUrl },
    keywords: [
      event.category,
      "Des Moines events",
      "Iowa events", 
      "things to do Des Moines",
      event.venue || "",
      event.location || "",
      "entertainment",
      "activities"
    ].filter(Boolean).join(", "),
    about: [
      {
        "@type": "Thing",
        name: event.category
      },
      {
        "@type": "Place", 
        name: "Des Moines, Iowa"
      }
    ],
    ...(accessibleForFree !== undefined && { isAccessibleForFree: accessibleForFree }),
    inLanguage: "en-US",
    audience: {
      "@type": "Audience",
      audienceType: "general public"
    },
  };

  // Remove undefined properties
  const cleanSchema = JSON.parse(JSON.stringify(eventSchema));

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(cleanSchema)}
      </script>
      
      {/* Google Events specific meta tags */}
      <meta property="event:title" content={event.title} />
      <meta property="event:description" content={event.enhanced_description || event.original_description || event.title} />
      <meta property="event:start_time" content={event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString())} />
      <meta property="event:location" content={event.venue || event.location || "Des Moines, Iowa"} />
      {event.image_url && <meta property="event:image" content={event.image_url} />}
      
      {/* Additional meta for event discovery */}
      <meta name="event-category" content={event.category} />
      <meta name="event-city" content="Des Moines" />
      <meta name="event-state" content="Iowa" />
      <meta name="event-country" content="United States" />
      
      {/* Rich snippets support */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={event.title} />
      <meta property="og:description" content={event.enhanced_description || event.original_description || event.title} />
      {event.image_url && <meta property="og:image" content={event.image_url} />}
      <meta property="og:url" content={`${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`} />
      
      {/* Twitter Card for events */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={event.title} />
      <meta name="twitter:description" content={event.enhanced_description || event.original_description || event.title} />
      {event.image_url && <meta name="twitter:image" content={event.image_url} />}
    </Helmet>
  );
}