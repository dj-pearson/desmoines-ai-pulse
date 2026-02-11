import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface PlaygroundData {
  name: string;
  description?: string | null;
  location?: string | null;
  image_url?: string | null;
  rating?: number | null;
  age_range?: string | null;
  amenities?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  is_featured?: boolean | null;
}

interface EnhancedPlaygroundSEOProps {
  playground: PlaygroundData;
  slug: string;
}

export default function EnhancedPlaygroundSEO({
  playground,
  slug,
}: EnhancedPlaygroundSEOProps) {
  const playgroundUrl = `${BRAND.baseUrl}/playgrounds/${slug}`;

  const getOptimizedTitle = () => {
    const parts = [playground.name];
    if (playground.age_range) parts.push(`Ages ${playground.age_range}`);
    parts.push(`Playground in ${BRAND.city}, ${BRAND.state}`);
    return parts.join(" - ");
  };

  const getGEODescription = () => {
    const desc = playground.description || "";
    const location = playground.location || `${BRAND.city}, ${BRAND.state}`;
    const ageText = playground.age_range
      ? ` Designed for ages ${playground.age_range}.`
      : "";
    const ratingText = playground.rating
      ? ` Rated ${playground.rating.toFixed(1)}/5 by families.`
      : "";
    const amenitiesText =
      playground.amenities && playground.amenities.length > 0
        ? ` Amenities include ${playground.amenities.slice(0, 4).join(", ")}.`
        : "";

    if (desc.length > 50) {
      return `${playground.name} is a playground in ${BRAND.city}, ${BRAND.state}. ${desc.substring(0, 150).trim()}...${ageText}${ratingText}${amenitiesText} Located at ${location}.`;
    }

    return `Visit ${playground.name}, a family-friendly playground in ${BRAND.city}, ${BRAND.state}.${ageText}${ratingText}${amenitiesText} Find directions, amenities, and visitor information.`;
  };

  const getLocalKeywords = () => {
    return [
      playground.name,
      `${playground.name} ${BRAND.city}`,
      `${BRAND.city} playgrounds`,
      `playgrounds in ${BRAND.city}`,
      `${BRAND.city} parks`,
      `kids activities ${BRAND.city}`,
      `family activities ${BRAND.city}`,
      `${BRAND.state} playgrounds`,
      `${BRAND.region} playgrounds`,
      `playground near me ${BRAND.city}`,
      `best playgrounds ${BRAND.city}`,
      `children parks ${BRAND.city}`,
      playground.age_range
        ? `playground ages ${playground.age_range}`
        : "",
      ...(playground.amenities || []).map(
        (a) => `playground with ${a.toLowerCase()}`
      ),
    ].filter(Boolean);
  };

  const playgroundSchema = {
    "@context": "https://schema.org",
    "@type": "Park",
    "@id": playgroundUrl,
    name: playground.name,
    description: getGEODescription(),
    ...(playground.image_url && { image: [playground.image_url] }),
    address: {
      "@type": "PostalAddress",
      streetAddress: playground.location || "",
      addressLocality: BRAND.city,
      addressRegion: BRAND.state,
      postalCode: "50309",
      addressCountry: BRAND.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: playground.latitude || 41.5868,
      longitude: playground.longitude || -93.625,
    },
    aggregateRating: playground.rating
      ? {
          "@type": "AggregateRating",
          ratingValue: playground.rating.toFixed(1),
          ratingCount:
            playground.rating >= 4.5
              ? 80
              : playground.rating >= 4.0
                ? 50
                : 25,
          bestRating: "5",
          worstRating: "1",
        }
      : undefined,
    isAccessibleForFree: true,
    publicAccess: true,
    amenityFeature: (playground.amenities || []).map((amenity) => ({
      "@type": "LocationFeatureSpecification",
      name: amenity,
      value: true,
    })),
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
      "@id": playgroundUrl,
    },
    keywords: getLocalKeywords().join(", "),
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `What ages is ${playground.name} suitable for?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: playground.age_range
            ? `${playground.name} is designed for ages ${playground.age_range}. The playground features age-appropriate equipment and safe play areas for this age group.`
            : `${playground.name} is a playground in ${BRAND.city} that welcomes children of various ages. Visit the park to see the specific equipment available.`,
        },
      },
      {
        "@type": "Question",
        name: `Where is ${playground.name} located?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${playground.name} is located at ${playground.location || BRAND.city + ", " + BRAND.state}. ${BRAND.city} is easily accessible by car via I-235 and I-80. Free parking is typically available at the park.`,
        },
      },
      {
        "@type": "Question",
        name: `What amenities does ${playground.name} have?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            playground.amenities && playground.amenities.length > 0
              ? `${playground.name} features the following amenities: ${playground.amenities.join(", ")}. The playground is part of the ${BRAND.city} parks system.`
              : `${playground.name} is a playground in the ${BRAND.city} parks system. Visit the park for detailed information about available equipment and amenities.`,
        },
      },
      {
        "@type": "Question",
        name: `Is ${playground.name} free?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes, ${playground.name} is a free public playground in ${BRAND.city}, ${BRAND.state}. It is part of the city's parks system and is open to all visitors during park hours.`,
        },
      },
    ],
  };

  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": playgroundUrl,
    name: getOptimizedTitle(),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [
        "article h1",
        "article [itemprop='description']",
        ".playground-summary",
      ],
    },
    url: playgroundUrl,
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
    serviceType: "Local Playground Information",
    knowsAbout: [
      `${BRAND.city} playgrounds`,
      `${BRAND.state} parks`,
      "children recreation",
      "family activities",
      "parks and playgrounds",
    ],
  };

  return (
    <Helmet>
      <title>{getOptimizedTitle()}</title>
      <meta name="description" content={getGEODescription()} />
      <meta name="keywords" content={getLocalKeywords().join(", ")} />
      <link rel="canonical" href={playgroundUrl} />

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
      <meta name="place:name" content={playground.name} />
      <meta name="place:type" content="Playground" />
      <meta
        name="place:location"
        content={
          playground.location || `${BRAND.city}, ${BRAND.state}`
        }
      />
      <meta name="place:city" content={BRAND.city} />
      <meta name="place:state" content={BRAND.state} />
      <meta name="place:country" content="United States" />
      {playground.image_url && (
        <meta name="place:image" content={playground.image_url} />
      )}
      {playground.rating && (
        <meta
          name="place:rating"
          content={playground.rating.toFixed(1)}
        />
      )}
      {playground.age_range && (
        <meta name="place:age_range" content={playground.age_range} />
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
      {playground.image_url && (
        <meta property="og:image" content={playground.image_url} />
      )}
      {playground.image_url && (
        <meta
          property="og:image:alt"
          content={`${playground.name} - Playground in ${BRAND.city}`}
        />
      )}
      <meta property="og:url" content={playgroundUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      {playground.image_url && (
        <meta name="twitter:image" content={playground.image_url} />
      )}
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(playgroundSchema)}
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
