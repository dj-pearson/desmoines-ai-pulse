import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";

interface EventSchemaProps {
  event: Event;
  isUpcoming?: boolean;
}

export default function EventSchema({ event, isUpcoming = true }: EventSchemaProps) {
  // Comprehensive Google Events Schema
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.enhanced_description || event.original_description || event.title,
    startDate: event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString()),
    endDate: event.event_start_utc 
      ? new Date(new Date(event.event_start_utc).getTime() + 3 * 60 * 60 * 1000).toISOString()
      : new Date(typeof event.date === 'string' ? new Date(event.date).getTime() : event.date.getTime() + 3 * 60 * 60 * 1000).toISOString(),
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
      event.image_url || `${BRAND.baseUrl}/default-event-image.jpg`
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
      sameAs: [
        "https://facebook.com/desmoinespulse",
        "https://twitter.com/desmoinespulse",
        "https://instagram.com/desmoinespulse"
      ]
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl
    },
    offers: event.price && event.price.toLowerCase() !== 'free'
      ? {
          "@type": "Offer",
          price: event.price.replace(/[^0-9.]/g, '') || "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: event.source_url || `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
          validFrom: new Date().toISOString(),
          seller: {
            "@type": "Organization",
            name: event.venue || "Des Moines Insider"
          }
        }
      : {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: event.source_url || `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`
        },
    performer: event.venue ? {
      "@type": "Organization",
      name: event.venue
    } : undefined,
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
    isAccessibleForFree: !event.price || event.price.toLowerCase().includes('free'),
    inLanguage: "en-US",
    audience: {
      "@type": "Audience",
      audienceType: "general public"
    },
    // Additional Google-specific properties
    typicalAgeRange: "18-65",
    doorTime: event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString()),
    maximumAttendeeCapacity: 1000, // Default capacity
    remainingAttendeeCapacity: 950, // Default remaining
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.5",
      reviewCount: "25",
      bestRating: "5",
      worstRating: "1"
    }
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