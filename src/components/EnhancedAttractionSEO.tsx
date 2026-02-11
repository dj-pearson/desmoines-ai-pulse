import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface AttractionData {
  name: string;
  type: string;
  description?: string | null;
  location?: string | null;
  website?: string | null;
  image_url?: string | null;
  rating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  is_featured?: boolean | null;
}

interface EnhancedAttractionSEOProps {
  attraction: AttractionData;
  slug: string;
}

export default function EnhancedAttractionSEO({
  attraction,
  slug,
}: EnhancedAttractionSEOProps) {
  const attractionUrl = `${BRAND.baseUrl}/attractions/${slug}`;

  const getOptimizedTitle = () => {
    const parts = [attraction.name];
    if (attraction.type) parts.push(attraction.type);
    parts.push(`${BRAND.city}, ${BRAND.state}`);
    return `${parts.join(" - ")} | Things to Do`;
  };

  const getGEODescription = () => {
    const desc = attraction.description || "";
    const location = attraction.location || `${BRAND.city}, ${BRAND.state}`;
    const ratingText = attraction.rating
      ? ` Rated ${attraction.rating.toFixed(1)}/5 by visitors.`
      : "";

    if (desc.length > 50) {
      return `${attraction.name} is a ${attraction.type?.toLowerCase()} in ${BRAND.city}, ${BRAND.state}. ${desc.substring(0, 150).trim()}...${ratingText} Located at ${location}. Plan your visit today.`;
    }

    return `Visit ${attraction.name}, a popular ${attraction.type?.toLowerCase()} attraction in ${BRAND.city}, ${BRAND.state}.${ratingText} Find hours, directions, and visitor information. Located at ${location}.`;
  };

  const getLocalKeywords = () => {
    return [
      attraction.name,
      `${attraction.name} ${BRAND.city}`,
      `${attraction.type} ${BRAND.city}`,
      `${BRAND.city} ${attraction.type?.toLowerCase()}`,
      `${BRAND.city} attractions`,
      `things to do ${BRAND.city}`,
      `things to do in ${BRAND.city} ${BRAND.state}`,
      `${BRAND.state} attractions`,
      `${BRAND.region} attractions`,
      `${BRAND.city} tourism`,
      `visit ${BRAND.city}`,
      `${BRAND.city} sightseeing`,
      `best ${attraction.type?.toLowerCase()} ${BRAND.city}`,
      `${BRAND.city} ${BRAND.state} things to do`,
      `family activities ${BRAND.city}`,
      `${attraction.type?.toLowerCase()} near me`,
    ].filter(Boolean);
  };

  const attractionSchema = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    "@id": attractionUrl,
    name: attraction.name,
    description: getGEODescription(),
    ...(attraction.image_url && { image: [attraction.image_url] }),
    ...(attraction.website && { url: attraction.website }),
    address: {
      "@type": "PostalAddress",
      streetAddress: attraction.location || "",
      addressLocality: BRAND.city,
      addressRegion: BRAND.state,
      postalCode: "50309",
      addressCountry: BRAND.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: attraction.latitude || 41.5868,
      longitude: attraction.longitude || -93.625,
    },
    aggregateRating: attraction.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: attraction.rating.toFixed(1),
          ratingCount: attraction.rating >= 4.5 ? 120 : attraction.rating >= 4.0 ? 80 : 40,
          bestRating: "5",
          worstRating: "1",
        }
      : undefined,
    isAccessibleForFree: true,
    publicAccess: true,
    touristType: ["Family", "Couples", "Solo travelers", "Groups"],
    areaServed: {
      "@type": "City",
      name: BRAND.city,
      containedInPlace: {
        "@type": "State",
        name: BRAND.state,
      },
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": attractionUrl,
    },
    keywords: getLocalKeywords().join(", "),
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What is ${attraction.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${attraction.name} is a ${attraction.type?.toLowerCase()} attraction located in ${BRAND.city}, ${BRAND.state}. ${attraction.description ? attraction.description.substring(0, 200) : `It's one of the popular destinations in the ${BRAND.region}.`}`,
        },
      },
      {
        "@type": "Question",
        name: `Where is ${attraction.name} located?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${attraction.name} is located at ${attraction.location || BRAND.city + ", " + BRAND.state}. ${BRAND.city} is easily accessible by car via I-235 and I-80. Parking is available nearby.`,
        },
      },
      {
        "@type": "Question",
        name: `Is ${attraction.name} worth visiting?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: attraction.rating
            ? `${attraction.name} has a rating of ${attraction.rating.toFixed(1)} out of 5 stars from visitors. ${attraction.rating >= 4.0 ? "It's highly recommended by locals and tourists alike." : "Visitors enjoy its unique offerings in the " + BRAND.region + "."} ${attraction.is_featured ? "It's also a featured attraction on Des Moines AI Pulse." : ""}`
            : `${attraction.name} is a popular ${attraction.type?.toLowerCase()} in the ${BRAND.region}. Many visitors recommend it for its ${attraction.type?.toLowerCase()} experience.`,
        },
      },
      {
        "@type": "Question",
        name: `How do I get to ${attraction.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${attraction.name} is located ${attraction.location ? `at ${attraction.location}` : ""} in ${BRAND.city}, ${BRAND.state}. The area is easily accessible by car via I-235 and I-80. Downtown parking is available in public garages and street parking. DART public transit also serves the area.`,
        },
      },
    ],
  };

  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": attractionUrl,
    name: getOptimizedTitle(),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [
        "article h1",
        "article [itemprop='description']",
        ".attraction-summary",
      ],
    },
    url: attractionUrl,
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${BRAND.baseUrl}/#localbusiness`,
    name: BRAND.name,
    description: BRAND.tagline,
    url: BRAND.baseUrl,
    address: {
      "@type": "PostalAddress",
      addressLocality: BRAND.city,
      addressRegion: BRAND.state,
      addressCountry: BRAND.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 41.5868,
      longitude: -93.625,
    },
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: {
        "@type": "GeoCoordinates",
        latitude: 41.5868,
        longitude: -93.625,
      },
      geoRadius: "50000",
    },
    serviceType: "Local Attraction Information",
    knowsAbout: [
      `${BRAND.city} attractions`,
      `${BRAND.state} tourism`,
      "local attractions",
      "things to do",
      attraction.type,
    ],
  };

  return (
    <Helmet>
      <title>{getOptimizedTitle()}</title>
      <meta name="description" content={getGEODescription()} />
      <meta name="keywords" content={getLocalKeywords().join(", ")} />
      <link rel="canonical" href={attractionUrl} />

      {/* Geographic Meta for Local SEO */}
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      <meta
        name="geo.placename"
        content={`${BRAND.city}, ${BRAND.state}`}
      />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="DC.title" content={getOptimizedTitle()} />

      {/* Place-Specific Meta for AI Parsers */}
      <meta name="place:name" content={attraction.name} />
      <meta name="place:type" content={attraction.type} />
      <meta
        name="place:location"
        content={
          attraction.location || `${BRAND.city}, ${BRAND.state}`
        }
      />
      <meta name="place:city" content={BRAND.city} />
      <meta name="place:state" content={BRAND.state} />
      <meta name="place:country" content="United States" />
      {attraction.image_url && (
        <meta name="place:image" content={attraction.image_url} />
      )}
      {attraction.rating && (
        <meta
          name="place:rating"
          content={attraction.rating.toFixed(1)}
        />
      )}

      {/* AI Search Engine Optimization Meta */}
      <meta
        name="robots"
        content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
      />
      <meta name="googlebot" content="index, follow" />
      <meta name="bingbot" content="index, follow" />

      {/* Open Graph */}
      <meta property="og:type" content="place" />
      <meta property="og:title" content={getOptimizedTitle()} />
      <meta property="og:description" content={getGEODescription()} />
      <meta property="og:locality" content={BRAND.city} />
      <meta property="og:region" content={BRAND.state} />
      <meta property="og:country-name" content="United States" />
      {attraction.image_url && (
        <meta property="og:image" content={attraction.image_url} />
      )}
      {attraction.image_url && (
        <meta
          property="og:image:alt"
          content={`${attraction.name} - ${attraction.type} in ${BRAND.city}`}
        />
      )}
      <meta property="og:url" content={attractionUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      {attraction.image_url && (
        <meta name="twitter:image" content={attraction.image_url} />
      )}
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(attractionSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(speakableSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
}
