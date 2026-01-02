import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime, hasSpecificTime, formatEventDate, formatInCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";

interface EnhancedEventSEOProps {
  event: Event;
  isUpcoming?: boolean;
  viewMode?: "list" | "detail";
}

export default function EnhancedEventSEO({ 
  event, 
  isUpcoming = true, 
  viewMode = "detail" 
}: EnhancedEventSEOProps) {
  
  // AI-Optimized Title Strategy - Different for list vs detail view
  const getOptimizedTitle = () => {
    const showTime = hasSpecificTime(event);
    const dateStr = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
      showTime ? "EEEE, MMMM d 'at' h:mm a" : "EEEE, MMMM d"
    );

    if (viewMode === "list") {
      return `${event.title} - ${dateStr} | ${BRAND.city} Events`;
    }

    // For detail pages, include venue for better local SEO
    const venue = event.venue ? ` at ${event.venue}` : '';
    return `${event.title}${venue} - ${dateStr} | ${BRAND.city}, ${BRAND.state} Events`;
  };

  // GEO-Optimized Description for AI Search Engines
  const getGEODescription = () => {
    const description = event.enhanced_description || event.original_description || '';
    const venue = event.venue || event.location || BRAND.city;
    const dateStr = formatEventDate(event);
    const price = event.price ? ` Tickets: ${event.price}.` : '';
    const category = event.category?.toLowerCase() || 'event';

    if (description.length > 50) {
      return `${event.title} is a ${category} happening ${dateStr} at ${venue} in ${BRAND.city}, ${BRAND.state}. ${description.substring(0, 120)}...${price} Find local ${BRAND.city} events and activities.`;
    }

    return `Join ${event.title}, a ${category} event happening ${dateStr} at ${venue} in ${BRAND.city}, ${BRAND.state}.${price} Discover what's happening in ${BRAND.city} this week with our local event guide.`;
  };

  // Enhanced Keywords for Local SEO + AI Search
  const getLocalKeywords = () => {
    const base = [
      event.title,
      `${event.title} ${BRAND.city}`,
      `${BRAND.city} ${event.category}`,
      `${event.category} events ${BRAND.city}`,
      `${BRAND.city} events`,
      `things to do ${BRAND.city}`,
      `${BRAND.state} events`,
      `${BRAND.region} events`,
      `${BRAND.city} activities`,
      `events near me ${BRAND.city}`
    ];

    // Add venue-specific keywords
    if (event.venue) {
      base.push(
        `${event.venue} events`,
        `${event.venue} ${BRAND.city}`,
        `events at ${event.venue}`
      );
    }

    // Add neighborhood/location keywords
    if (event.location && !event.location.includes(BRAND.city)) {
      base.push(`${event.location} events`);
    }

    // Add date-specific keywords for timely discovery
    const month = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
      "MMMM"
    );
    const dayOfWeek = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
      "EEEE"
    );

    base.push(
      `${BRAND.city} events ${month}`,
      `${dayOfWeek} events ${BRAND.city}`,
      `this weekend ${BRAND.city}`,
      `tonight ${BRAND.city}`
    );

    return base.filter(Boolean);
  };

  // Comprehensive Event Schema with AI-Friendly Properties
  const eventUrl = `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`;
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": eventUrl,
    "name": event.title,
    "description": getGEODescription(),
    "startDate": event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString()),
    "endDate": event.event_start_utc
      ? new Date(new Date(event.event_start_utc).getTime() + 3 * 60 * 60 * 1000).toISOString()
      : new Date(new Date(typeof event.date === 'string' ? event.date : event.date.toISOString()).getTime() + 3 * 60 * 60 * 1000).toISOString(),
    "eventStatus": isUpcoming
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventPostponed",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "@id": `${BRAND.baseUrl}/venues/${event.venue?.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      "name": event.venue || event.location || `${BRAND.city} Area`,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": event.location || "",
        "addressLocality": event.city || BRAND.city,
        "addressRegion": BRAND.state,
        "addressCountry": BRAND.country,
        "postalCode": event.city === BRAND.city ? "50309" : undefined
      },
      ...(event.latitude && event.longitude && {
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": event.latitude,
          "longitude": event.longitude
        }
      }),
      // Service area for better local discovery
      "areaServed": [
        {
          "@type": "City",
          "name": BRAND.city,
          "sameAs": `https://en.wikipedia.org/wiki/${BRAND.city.replace(' ', '_')},_${BRAND.state}`
        },
        {
          "@type": "AdministrativeArea",
          "name": BRAND.region
        }
      ]
    },
    "organizer": {
      "@type": "Organization",
      "@id": `${BRAND.baseUrl}/#organization`,
      "name": BRAND.name,
      "url": BRAND.baseUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${BRAND.baseUrl}${BRAND.logo}`,
        "width": 512,
        "height": 512
      },
      "sameAs": [
        "https://facebook.com/desmoinespulse",
        "https://twitter.com/desmoinespulse",
        "https://instagram.com/desmoinespulse"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "areaServed": `US-${BRAND.stateAbbr}`,
        "availableLanguage": "English"
      }
    },
    "publisher": {
      "@type": "Organization",
      "name": BRAND.name,
      "url": BRAND.baseUrl
    },
    "image": [
      event.image_url || `${BRAND.baseUrl}/default-event-image.jpg`
    ],
    "url": eventUrl,
    
    // Enhanced offer information
    "offers": event.price && event.price.toLowerCase() !== 'free'
      ? {
          "@type": "Offer",
          "price": event.price.replace(/[^0-9.]/g, '') || "0",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": event.source_url || eventUrl,
          "validFrom": new Date().toISOString(),
          "seller": {
            "@type": "Organization",
            "name": event.venue || BRAND.name
          },
          "category": event.category
        }
      : {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": event.source_url || eventUrl
        },

    // Enhanced performer/organizer info
    "performer": event.venue ? {
      "@type": "PerformingGroup",
      "name": event.venue,
      "location": {
        "@type": "Place",
        "name": event.venue,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": BRAND.city,
          "addressRegion": BRAND.state
        }
      }
    } : undefined,

    // AI-friendly content properties
    "keywords": getLocalKeywords().join(", "),
    "about": [
      {
        "@type": "Thing",
        "name": event.category,
        "sameAs": `https://en.wikipedia.org/wiki/${event.category.replace(/\s+/g, '_')}`
      },
      {
        "@type": "Place",
        "name": `${BRAND.city}, ${BRAND.state}`,
        "sameAs": `https://en.wikipedia.org/wiki/${BRAND.city.replace(' ', '_')},_${BRAND.state}`
      }
    ],
    "isAccessibleForFree": !event.price || event.price.toLowerCase().includes('free'),
    "inLanguage": "en-US",
    "audience": {
      "@type": "Audience",
      "audienceType": "local residents and visitors",
      "geographicArea": {
        "@type": "AdministrativeArea",
        "name": BRAND.region
      }
    },

    // Additional AI-discovery properties
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": eventUrl
    },
    "subjectOf": {
      "@type": "WebPage",
      "url": eventUrl,
      "name": `${event.title} Event Details`
    }
  };

  // Local Business Context Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${BRAND.baseUrl}/#localbusiness`,
    "name": BRAND.name,
    "description": BRAND.tagline,
    "url": BRAND.baseUrl,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": BRAND.city,
      "addressRegion": BRAND.state,
      "addressCountry": BRAND.country
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 41.5868,
      "longitude": -93.6250
    },
    "areaServed": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": 41.5868,
        "longitude": -93.6250
      },
      "geoRadius": "50000"
    },
    "serviceType": "Local Event Information",
    "knowsAbout": [
      `${BRAND.city} events`,
      `${BRAND.state} entertainment`,
      "local activities",
      "community events",
      event.category
    ]
  };

  // FAQ Schema for Voice Search & AI
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `When is ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} takes place ${formatEventDate(event)} in ${BRAND.city}, ${BRAND.state}.`
        }
      },
      {
        "@type": "Question",
        "name": `Where is ${event.title} located?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is held at ${event.venue || event.location || BRAND.city}, ${BRAND.state}.`
        }
      },
      {
        "@type": "Question",
        "name": `What type of event is ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is a ${event.category.toLowerCase()} event in ${BRAND.city}.`
        }
      },
      ...(event.price ? [{
        "@type": "Question",
        "name": `How much does ${event.title} cost?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} tickets are ${event.price}.`
        }
      }] : [{
        "@type": "Question",
        "name": `Is ${event.title} free?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Yes, ${event.title} is a free event in ${BRAND.city}.`
        }
      }])
    ]
  };

  return (
    <Helmet>
      {/* Enhanced Meta Tags for AI Discovery */}
      <title>{getOptimizedTitle()}</title>
      <meta name="description" content={getGEODescription()} />
      <meta name="keywords" content={getLocalKeywords().join(", ")} />

      {/* Geographic Precision for Local SEO */}
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      <meta name="geo.placename" content={`${BRAND.city}, ${BRAND.state}`} />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="DC.title" content={getOptimizedTitle()} />

      {/* Event-Specific Meta for AI Parsers */}
      <meta name="event:title" content={event.title} />
      <meta name="event:description" content={getGEODescription()} />
      <meta name="event:start_time" content={event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString())} />
      <meta name="event:location" content={event.venue || event.location || `${BRAND.city}, ${BRAND.state}`} />
      <meta name="event:category" content={event.category} />
      <meta name="event:city" content={BRAND.city} />
      <meta name="event:state" content={BRAND.state} />
      <meta name="event:country" content="United States" />
      {event.image_url && <meta name="event:image" content={event.image_url} />}
      {event.price && <meta name="event:price" content={event.price} />}

      {/* Enhanced Open Graph for Social + AI */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={getOptimizedTitle()} />
      <meta property="og:description" content={getGEODescription()} />
      <meta property="og:locality" content={BRAND.city} />
      <meta property="og:region" content={BRAND.state} />
      <meta property="og:country-name" content="United States" />
      <meta property="og:postal-code" content="50309" />
      {event.image_url && <meta property="og:image" content={event.image_url} />}
      <meta property="og:url" content={eventUrl} />

      {/* Twitter Cards Optimized for Event Discovery */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      {event.image_url && <meta name="twitter:image" content={event.image_url} />}
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data for Maximum AI Visibility */}
      <script type="application/ld+json">
        {JSON.stringify(eventSchema)}
      </script>

      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>

      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>

      {/* Additional Context for AI Understanding */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": `${BRAND.city} Local Events`,
          "description": `Curated list of upcoming events in ${BRAND.city}, ${BRAND.state}`,
          "numberOfItems": 1,
          "itemListElement": [{
            "@type": "ListItem",
            "position": 1,
            "item": eventSchema
          }]
        })}
      </script>
    </Helmet>
  );
}