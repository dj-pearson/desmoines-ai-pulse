import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface EventData {
  name: string;
  startDate: string;
  endDate?: string;
  location?: {
    name: string;
    address: {
      streetAddress: string;
      addressLocality: string;
      addressRegion: string;
      postalCode: string;
    };
  };
  description?: string;
  price?: string;
  organizer?: string;
  image?: string;
}

interface RestaurantData {
  name: string;
  cuisine: string[];
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
  };
  telephone?: string;
  url?: string;
  image?: string;
  priceRange?: string;
}

interface AttractionData {
  name: string;
  address: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion: string;
    postalCode?: string;
  };
  description?: string;
  image?: string;
}

interface EnhancedLocalSEOProps {
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  pageType?: "website" | "article" | "event" | "restaurant" | "attraction";
  breadcrumbs?: BreadcrumbItem[];
  eventData?: EventData;
  restaurantData?: RestaurantData;
  attractionData?: AttractionData;
  faqData?: Array<{
    question: string;
    answer: string;
  }>;
  neighborhood?: string;
  suburb?: string;
  category?: string;
  isTimeSensitive?: boolean; // For today/weekend pages
}

export default function EnhancedLocalSEO({
  pageTitle,
  pageDescription,
  canonicalUrl,
  pageType = "website",
  breadcrumbs = [],
  eventData,
  restaurantData,
  attractionData,
  faqData,
  neighborhood,
  suburb,
  category,
  isTimeSensitive = false,
}: EnhancedLocalSEOProps) {
  // Generate location-specific keywords
  const generateLocalKeywords = () => {
    const baseKeywords = ["Des Moines"];
    const suburbs = [
      "West Des Moines",
      "Ankeny",
      "Urbandale",
      "Johnston",
      "Altoona",
      "Clive",
      "Windsor Heights",
    ];

    if (suburb) baseKeywords.push(suburb);
    if (neighborhood) baseKeywords.push(neighborhood);
    if (category) baseKeywords.push(category);

    const keywords = [...baseKeywords];

    if (eventData) {
      keywords.push("events", "things to do", "activities");
      if (isTimeSensitive) keywords.push("today", "this weekend", "upcoming");
    }

    if (restaurantData) {
      keywords.push("restaurants", "dining", "food");
      if (restaurantData.cuisine) keywords.push(...restaurantData.cuisine);
    }

    if (attractionData) {
      keywords.push("attractions", "places to visit", "sightseeing");
    }

    return keywords.join(", ");
  };

  // Organization Schema
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: BRAND.baseUrl,
    logo: `${BRAND.baseUrl}${BRAND.logo}`,
    description: BRAND.description,
    email: BRAND.email,
    areaServed: {
      "@type": "City",
      name: BRAND.city,
      containedInPlace: {
        "@type": "State",
        name: BRAND.state,
      },
    },
    sameAs: [
      "https://www.instagram.com/desmoinespulse",
      "https://www.facebook.com/desmoinespulse",
      "https://www.twitter.com/desmoinespulse",
    ],
  };

  // WebSite Schema with SearchAction
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND.name,
    url: BRAND.baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${BRAND.baseUrl}/search?q={query}`,
      "query-input": "required name=query",
    },
  };

  // Breadcrumb Schema
  const breadcrumbSchema =
    breadcrumbs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((crumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: crumb.name,
            item: `${BRAND.baseUrl}${crumb.url}`,
          })),
        }
      : null;

  // Event Schema
  const eventSchema = eventData
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: eventData.name,
        startDate: eventData.startDate,
        ...(eventData.endDate && { endDate: eventData.endDate }),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        ...(eventData.location && {
          location: {
            "@type": "Place",
            name: eventData.location.name,
            address: {
              "@type": "PostalAddress",
              streetAddress: eventData.location.address.streetAddress,
              addressLocality: eventData.location.address.addressLocality,
              addressRegion: eventData.location.address.addressRegion,
              postalCode: eventData.location.address.postalCode,
              addressCountry: "US",
            },
          },
        }),
        ...(eventData.image && { image: [eventData.image] }),
        ...(eventData.description && { description: eventData.description }),
        ...(eventData.price && {
          offers: {
            "@type": "Offer",
            price: eventData.price === "Free" ? "0" : eventData.price,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: canonicalUrl,
          },
        }),
        ...(eventData.organizer && {
          organizer: {
            "@type": "Organization",
            name: eventData.organizer,
          },
        }),
      }
    : null;

  // Restaurant Schema
  const restaurantSchema = restaurantData
    ? {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: restaurantData.name,
        url: canonicalUrl,
        ...(restaurantData.image && { image: restaurantData.image }),
        servesCuisine: restaurantData.cuisine,
        address: {
          "@type": "PostalAddress",
          streetAddress: restaurantData.address.streetAddress,
          addressLocality: restaurantData.address.addressLocality,
          addressRegion: restaurantData.address.addressRegion,
          postalCode: restaurantData.address.postalCode,
          addressCountry: "US",
        },
        ...(restaurantData.telephone && {
          telephone: restaurantData.telephone,
        }),
        ...(restaurantData.priceRange && {
          priceRange: restaurantData.priceRange,
        }),
      }
    : null;

  // Tourist Attraction Schema
  const attractionSchema = attractionData
    ? {
        "@context": "https://schema.org",
        "@type": "TouristAttraction",
        name: attractionData.name,
        url: canonicalUrl,
        ...(attractionData.image && { image: attractionData.image }),
        address: {
          "@type": "PostalAddress",
          ...(attractionData.address.streetAddress && {
            streetAddress: attractionData.address.streetAddress,
          }),
          addressLocality: attractionData.address.addressLocality,
          addressRegion: attractionData.address.addressRegion,
          ...(attractionData.address.postalCode && {
            postalCode: attractionData.address.postalCode,
          }),
          addressCountry: "US",
        },
        ...(attractionData.description && {
          description: attractionData.description,
        }),
      }
    : null;

  // FAQ Schema
  const faqSchema =
    faqData && faqData.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqData.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        }
      : null;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta name="keywords" content={generateLocalKeywords()} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Geographic Targeting */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="locality" content="Des Moines" />
      <meta name="region" content="Iowa" />
      <meta name="country-name" content="United States" />

      {/* Open Graph */}
      <meta property="og:type" content={pageType} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:region" content="IA" />
      <meta property="og:country-name" content="USA" />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Time-sensitive content for AI */}
      {isTimeSensitive && (
        <>
          <meta
            name="article:published_time"
            content={new Date().toISOString()}
          />
          <meta
            name="article:modified_time"
            content={new Date().toISOString()}
          />
          <meta property="og:updated_time" content={new Date().toISOString()} />
        </>
      )}

      {/* Schema.org Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>

      <script type="application/ld+json">
        {JSON.stringify(websiteSchema)}
      </script>

      {breadcrumbSchema && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      )}

      {eventSchema && (
        <script type="application/ld+json">
          {JSON.stringify(eventSchema)}
        </script>
      )}

      {restaurantSchema && (
        <script type="application/ld+json">
          {JSON.stringify(restaurantSchema)}
        </script>
      )}

      {attractionSchema && (
        <script type="application/ld+json">
          {JSON.stringify(attractionSchema)}
        </script>
      )}

      {faqSchema && (
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      )}
    </Helmet>
  );
}
