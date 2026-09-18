import { Helmet } from "react-helmet-async";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";

interface LocalSEOProps {
  pageTitle?: string;
  pageDescription?: string;
  pageType?: "website" | "article" | "local_business";
  neighborhood?: string;
  eventData?: any;
  businessData?: any;
  breadcrumbs?: Array<{ name: string; url: string }>;
  canonicalPath?: string;
}

export default function LocalSEO({
  pageTitle = "Des Moines Events & Local Guide",
  pageDescription = "Discover what's happening in Des Moines, Iowa this weekend. Find local events, new restaurant openings, family activities, and things to do in Des Moines metro area.",
  pageType = "website",
  neighborhood,
  eventData,
  businessData,
  breadcrumbs = [],
  canonicalPath,
}: LocalSEOProps) {

  // WEB-SEO-002: this used to append unconditionally, producing
  // "Events & Activities in Highland Park in Highland Park, Des Moines |
  // Des Moines Insider" (86 chars) because NeighborhoodPage already names the
  // neighborhood in pageTitle. The no-neighborhood branch was similarly
  // doubled: "... | Des Moines, Iowa | Des Moines Insider".
  //
  // Only add what is not already there, and add the brand once. Google
  // truncates around 60 characters, so every wasted repetition costs a real
  // word in the SERP.
  const withLocality =
    neighborhood && !pageTitle.includes(neighborhood)
      ? `${pageTitle} in ${neighborhood}, ${BRAND.city}`
      : pageTitle;
  const enhancedTitle = withLocality.includes(BRAND.name)
    ? withLocality
    : `${withLocality} | ${BRAND.name}`;

  // Canonical URL
  const canonicalUrl = canonicalPath
    ? getCanonicalUrl(canonicalPath)
    : typeof window !== 'undefined'
      ? `${BRAND.baseUrl}${window.location.pathname}`
      : BRAND.baseUrl;

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

  // WEB-SEO-026 -- THIS WAS A LocalBusiness AND ALMOST NOTHING IN IT WAS TRUE.
  //
  // It shipped on five sitemapped neighborhood pages carrying:
  //   telephone      "+1-515-DES-MOIN"   not a number; a phone cannot dial it
  //   streetAddress  "Downtown Des Moines" and postalCode 50309, an address
  //                  that belongs to a part of the city rather than to us
  //   openingHours   "Mo-Su 00:00-23:59"
  //   hasOfferCatalog  three Offers for "services" nobody sells
  //   sameAs         the OLD brand's Facebook, X and Instagram handles, which
  //                  WEB-SEO-023 removed from every other emitter
  // An aggregator is not a local business, and a page about a NEIGHBOURHOOD is
  // not about us at all.
  //
  // What these pages are is a view of one place, so that is what they now say.
  // Place when the page is scoped to a neighbourhood, CollectionPage when it
  // lists them - no telephone, no address, no hours, no offers.
  const placeSchema = neighborhood
    ? {
        "@context": "https://schema.org",
        "@type": "Place",
        "@id": `${BRAND.baseUrl}/neighborhoods/${encodeURIComponent(neighborhood.toLowerCase().replace(/\s+/g, "-"))}#place`,
        name: `${neighborhood}, ${BRAND.city}`,
        description: `Events, restaurants and things to do in ${neighborhood}, ${BRAND.city}, ${BRAND.state}.`,
        address: {
          "@type": "PostalAddress",
          addressLocality: BRAND.city,
          addressRegion: BRAND.stateAbbr,
          addressCountry: BRAND.country,
        },
        containedInPlace: {
          "@type": "City",
          name: BRAND.city,
          sameAs: "https://en.wikipedia.org/wiki/Des_Moines,_Iowa",
        },
      }
    : {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: pageTitle,
        description: pageDescription,
        about: {
          "@type": "City",
          name: BRAND.city,
          sameAs: "https://en.wikipedia.org/wiki/Des_Moines,_Iowa",
        },
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
    }
    // WEB-SEO-010: no "organizer". This named BRAND.name as the organizer of
    // whatever event the neighbourhood pages passed in, which is never true.
  } : null;

  // Generate Breadcrumb Schema
  const breadcrumbSchema = breadcrumbs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": `${BRAND.baseUrl}${crumb.url}`
    }))
  } : null;

  return (
    <Helmet>
      {/* Enhanced Local Titles */}
      <title>{enhancedTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={localKeywords} />
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <link rel="canonical" href={canonicalUrl} />
      
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
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:region" content="IA" />
      <meta property="og:country-name" content="USA" />
      
      {/* Local Twitter Cards */}
      <meta name="twitter:title" content={enhancedTitle} />
      <meta name="twitter:description" content={pageDescription} />
      
      {/* Local Business Schema */}
      <script type="application/ld+json">
        {JSON.stringify(placeSchema)}
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
          // WEB-SEO-026: the provider of this service is us, and we are an
          // Organization. LocalBusiness implies a premises, hours and a phone.
          "provider": {
            "@type": "Organization",
            "@id": `${BRAND.baseUrl}/#organization`,
            "name": BRAND.name
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
