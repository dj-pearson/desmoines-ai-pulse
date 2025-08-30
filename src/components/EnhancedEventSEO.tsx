import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime, hasSpecificTime, formatEventDate, formatInCentralTime } from "@/lib/timezone";

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
      return `${event.title} - ${dateStr} | Des Moines Events`;
    }
    
    // For detail pages, include venue for better local SEO
    const venue = event.venue ? ` at ${event.venue}` : '';
    return `${event.title}${venue} - ${dateStr} | Des Moines, Iowa Events`;
  };

  // GEO-Optimized Description for AI Search Engines
  const getGEODescription = () => {
    const description = event.enhanced_description || event.original_description || '';
    const venue = event.venue || event.location || 'Des Moines';
    const dateStr = formatEventDate(event);
    const price = event.price ? ` Tickets: ${event.price}.` : '';
    const category = event.category?.toLowerCase() || 'event';
    
    if (description.length > 50) {
      return `${event.title} is a ${category} happening ${dateStr} at ${venue} in Des Moines, Iowa. ${description.substring(0, 120)}...${price} Find local Des Moines events and activities.`;
    }
    
    return `Join ${event.title}, a ${category} event happening ${dateStr} at ${venue} in Des Moines, Iowa.${price} Discover what's happening in Des Moines this week with our local event guide.`;
  };

  // Enhanced Keywords for Local SEO + AI Search
  const getLocalKeywords = () => {
    const base = [
      event.title,
      `${event.title} Des Moines`,
      `Des Moines ${event.category}`,
      `${event.category} events Des Moines`,
      'Des Moines events',
      'things to do Des Moines',
      'Iowa events',
      'Central Iowa events',
      'Des Moines activities',
      'events near me Des Moines'
    ];

    // Add venue-specific keywords
    if (event.venue) {
      base.push(
        `${event.venue} events`,
        `${event.venue} Des Moines`,
        `events at ${event.venue}`
      );
    }

    // Add neighborhood/location keywords
    if (event.location && !event.location.includes('Des Moines')) {
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
      `Des Moines events ${month}`,
      `${dayOfWeek} events Des Moines`,
      'this weekend Des Moines',
      'tonight Des Moines'
    );

    return base.filter(Boolean);
  };

  // Comprehensive Event Schema with AI-Friendly Properties
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`,
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
      "@id": `https://desmoinesinsider.com/venues/${event.venue?.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      "name": event.venue || event.location || "Des Moines Area",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": event.location || "",
        "addressLocality": event.city || "Des Moines",
        "addressRegion": "Iowa", 
        "addressCountry": "US",
        "postalCode": event.city === "Des Moines" ? "50309" : undefined
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
          "name": "Des Moines",
          "sameAs": "https://en.wikipedia.org/wiki/Des_Moines,_Iowa"
        },
        {
          "@type": "AdministrativeArea",
          "name": "Central Iowa"
        }
      ]
    },
    "organizer": {
      "@type": "Organization",
      "@id": "https://desmoinesinsider.com/#organization",
      "name": "Des Moines Insider",
      "url": "https://desmoinesinsider.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://desmoinesinsider.com/DMI-Logo.png",
        "width": 512,
        "height": 512
      },
      "sameAs": [
        "https://facebook.com/desmoinesinsider",
        "https://twitter.com/desmoinesinsider", 
        "https://instagram.com/desmoinesinsider"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "areaServed": "US-IA",
        "availableLanguage": "English"
      }
    },
    "publisher": {
      "@type": "Organization",
      "name": "Des Moines Insider",
      "url": "https://desmoinesinsider.com"
    },
    "image": [
      event.image_url || "https://desmoinesinsider.com/default-event-image.jpg"
    ],
    "url": `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`,
    
    // Enhanced offer information
    "offers": event.price && event.price.toLowerCase() !== 'free'
      ? {
          "@type": "Offer",
          "price": event.price.replace(/[^0-9.]/g, '') || "0",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": event.source_url || `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`,
          "validFrom": new Date().toISOString(),
          "seller": {
            "@type": "Organization", 
            "name": event.venue || "Des Moines Insider"
          },
          "category": event.category
        }
      : {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD", 
          "availability": "https://schema.org/InStock",
          "url": event.source_url || `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`
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
          "addressLocality": "Des Moines",
          "addressRegion": "Iowa"
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
        "name": "Des Moines, Iowa",
        "sameAs": "https://en.wikipedia.org/wiki/Des_Moines,_Iowa"
      }
    ],
    "isAccessibleForFree": !event.price || event.price.toLowerCase().includes('free'),
    "inLanguage": "en-US",
    "audience": {
      "@type": "Audience",
      "audienceType": "local residents and visitors",
      "geographicArea": {
        "@type": "AdministrativeArea",
        "name": "Greater Des Moines Area"
      }
    },
    
    // Additional AI-discovery properties
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`
    },
    "subjectOf": {
      "@type": "WebPage",
      "url": `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`,
      "name": `${event.title} Event Details`
    }
  };

  // Local Business Context Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://desmoinesinsider.com/#localbusiness", 
    "name": "Des Moines Insider",
    "description": "Your comprehensive guide to Des Moines events, dining, and local activities",
    "url": "https://desmoinesinsider.com",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Des Moines",
      "addressRegion": "Iowa",
      "addressCountry": "US"
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
      "Des Moines events",
      "Iowa entertainment",
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
          "text": `${event.title} takes place ${formatEventDate(event)} in Des Moines, Iowa.`
        }
      },
      {
        "@type": "Question", 
        "name": `Where is ${event.title} located?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is held at ${event.venue || event.location || 'Des Moines'}, Iowa.`
        }
      },
      {
        "@type": "Question",
        "name": `What type of event is ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is a ${event.category.toLowerCase()} event in Des Moines.`
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
          "text": `Yes, ${event.title} is a free event in Des Moines.`
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
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines, Iowa" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="DC.title" content={getOptimizedTitle()} />
      
      {/* Event-Specific Meta for AI Parsers */}
      <meta name="event:title" content={event.title} />
      <meta name="event:description" content={getGEODescription()} />
      <meta name="event:start_time" content={event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString())} />
      <meta name="event:location" content={event.venue || event.location || "Des Moines, Iowa"} />
      <meta name="event:category" content={event.category} />
      <meta name="event:city" content="Des Moines" />
      <meta name="event:state" content="Iowa" />
      <meta name="event:country" content="United States" />
      {event.image_url && <meta name="event:image" content={event.image_url} />}
      {event.price && <meta name="event:price" content={event.price} />}
      
      {/* Enhanced Open Graph for Social + AI */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={getOptimizedTitle()} />
      <meta property="og:description" content={getGEODescription()} />
      <meta property="og:locality" content="Des Moines" />
      <meta property="og:region" content="Iowa" />
      <meta property="og:country-name" content="United States" />
      <meta property="og:postal-code" content="50309" />
      {event.image_url && <meta property="og:image" content={event.image_url} />}
      <meta property="og:url" content={`https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(event.title, event)}`} />
      
      {/* Twitter Cards Optimized for Event Discovery */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      {event.image_url && <meta name="twitter:image" content={event.image_url} />}
      <meta name="twitter:site" content="@desmoinesinsider" />
      
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
          "name": "Des Moines Local Events",
          "description": "Curated list of upcoming events in Des Moines, Iowa",
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