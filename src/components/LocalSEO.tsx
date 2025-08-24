import { Helmet } from "react-helmet-async";

interface LocalSEOProps {
  pageTitle?: string;
  pageDescription?: string;
  pageType?: "website" | "article" | "local_business";
  neighborhood?: string;
  eventData?: any;
  businessData?: any;
  breadcrumbs?: Array<{ name: string; url: string }>;
}

export default function LocalSEO({
  pageTitle = "Des Moines Events & Local Guide",
  pageDescription = "Discover what's happening in Des Moines, Iowa this weekend. Find local events, new restaurant openings, family activities, and things to do in Des Moines metro area.",
  pageType = "website",
  neighborhood,
  eventData,
  businessData,
  breadcrumbs = []
}: LocalSEOProps) {
  
  // Enhanced local title with neighborhood if provided
  const enhancedTitle = neighborhood 
    ? `${pageTitle} in ${neighborhood}, Des Moines | Des Moines Insider`
    : `${pageTitle} | Des Moines, Iowa | Des Moines Insider`;

  // Local keywords for this page
  const localKeywords = [
    "Des Moines events",
    "things to do in Des Moines",
    "Des Moines Iowa activities",
    "Des Moines weekend events",
    "local Des Moines guide",
    neighborhood && `${neighborhood} Des Moines`,
    "Central Iowa events",
    "Des Moines metro area",
    "family activities Des Moines"
  ].filter(Boolean).join(", ");

  // Generate Local Business Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://desmoinessider.com/#business",
    "name": "Des Moines Insider",
    "description": "Your comprehensive guide to Des Moines events, restaurants, attractions, and local activities",
    "url": "https://desmoinessider.com",
    "telephone": "+1-515-DES-MOIN",
    "priceRange": "Free",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Downtown Des Moines",
      "addressLocality": "Des Moines", 
      "addressRegion": "IA",
      "postalCode": "50309",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 41.5868,
      "longitude": -93.6250
    },
    "areaServed": [
      {
        "@type": "City",
        "name": "Des Moines",
        "sameAs": "https://en.wikipedia.org/wiki/Des_Moines,_Iowa"
      },
      {
        "@type": "City", 
        "name": "West Des Moines",
        "sameAs": "https://en.wikipedia.org/wiki/West_Des_Moines,_Iowa"
      },
      {
        "@type": "City",
        "name": "Ankeny", 
        "sameAs": "https://en.wikipedia.org/wiki/Ankeny,_Iowa"
      },
      {
        "@type": "City",
        "name": "Urbandale",
        "sameAs": "https://en.wikipedia.org/wiki/Urbandale,_Iowa"
      },
      {
        "@type": "City",
        "name": "Johnston",
        "sameAs": "https://en.wikipedia.org/wiki/Johnston,_Iowa"
      },
      {
        "@type": "City",
        "name": "Clive",
        "sameAs": "https://en.wikipedia.org/wiki/Clive,_Iowa"
      },
      {
        "@type": "City",
        "name": "Waukee",
        "sameAs": "https://en.wikipedia.org/wiki/Waukee,_Iowa"
      }
    ],
    "serviceType": "Event Information Service",
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Des Moines Local Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Event Listings",
            "description": "Comprehensive Des Moines area event calendar and recommendations"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "Restaurant Guide",
            "description": "Local Des Moines restaurant directory with new openings and reviews"
          }
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service", 
            "name": "Family Activity Guide",
            "description": "Kid-friendly attractions, playgrounds, and family events in Des Moines"
          }
        }
      ]
    },
    "openingHours": "Mo-Su 00:00-23:59",
    "sameAs": [
      "https://www.facebook.com/desmoinessider",
      "https://twitter.com/desmoinessider",
      "https://www.instagram.com/desmoinessider"
    ]
  };

  // Generate Event Schema if event data provided
  const eventSchema = eventData ? {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": eventData.title,
    "description": eventData.description,
    "startDate": eventData.start_date,
    "endDate": eventData.end_date,
    "location": {
      "@type": "Place",
      "name": eventData.venue || "Des Moines Area",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Des Moines",
        "addressRegion": "IA", 
        "addressCountry": "US"
      }
    },
    "organizer": {
      "@type": "Organization",
      "name": "Des Moines Insider",
      "url": "https://desmoinessider.com"
    }
  } : null;

  // Generate Breadcrumb Schema
  const breadcrumbSchema = breadcrumbs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": `https://desmoinessider.com${crumb.url}`
    }))
  } : null;

  return (
    <Helmet>
      {/* Enhanced Local Titles */}
      <title>{enhancedTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={localKeywords} />
      
      {/* Enhanced Geographic Targeting */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="DC.title" content={enhancedTitle} />
      
      {/* Local Business targeting */}
      <meta name="locality" content="Des Moines" />
      <meta name="region" content="Iowa" />
      <meta name="country-name" content="United States" />
      
      {/* Enhanced Open Graph for Local */}
      <meta property="og:title" content={enhancedTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:type" content={pageType} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:region" content="IA" />
      <meta property="og:country-name" content="USA" />
      
      {/* Local Twitter Cards */}
      <meta name="twitter:title" content={enhancedTitle} />
      <meta name="twitter:description" content={pageDescription} />
      
      {/* Local Business Schema */}
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
      
      {/* Event Schema if provided */}
      {eventSchema && (
        <script type="application/ld+json">
          {JSON.stringify(eventSchema)}
        </script>
      )}
      
      {/* Breadcrumb Schema if provided */}
      {breadcrumbSchema && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      )}
      
      {/* Local Service Area Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          "name": "Des Moines Local Event Guide",
          "provider": {
            "@type": "LocalBusiness",
            "name": "Des Moines Insider"
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
          "serviceType": "Local Information Service",
          "description": "Comprehensive guide to events, restaurants, and activities in the Des Moines metropolitan area"
        })}
      </script>
    </Helmet>
  );
}
