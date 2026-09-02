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
    // WEB-SEO-024, same defect as EnhancedAttractionSEO. public.playgrounds has
    // location, latitude and longitude and NO city or postal_code, so every
    // playground in the metro was published as Des Moines 50309.
    address: {
      "@type": "PostalAddress",
      ...(playground.location && { streetAddress: playground.location }),
      addressRegion: BRAND.state,
      addressCountry: BRAND.country,
    },
    // The fallback pin was downtown Des Moines. A playground is somewhere a
    // parent drives to, so a wrong coordinate is worse here than almost
    // anywhere else on the site.
    ...(playground.latitude != null && playground.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: playground.latitude,
            longitude: playground.longitude,
          },
        }
      : {}),
    // WEB-SEO-016: aggregateRating removed. The ratingValue was real but
    // ratingCount was invented from it (playground.rating >= 4.5 ? ... ), and
    // Google requires the count to reflect actual reviews. No reviews table
    // exists, so there is no honest count to emit.
    // WEB-SEO-024. KEPT, and this is the one place the hard-coded value is
    // defensible. public.playgrounds has no is_free column, but a public
    // playground is free by definition -- that is what makes it a playground
    // rather than an attraction, and the whole set is municipal park equipment.
    // The attraction version of this was removed because attractions DO have an
    // is_free column and many of them charge.
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

  // FAQ schema is output by FAQSection on PlaygroundDetails - avoid duplicate FAQPage

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
      <meta property="og:image" content={playground.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content={`${playground.name} - Playground in ${BRAND.city}`}
      />
      <meta property="og:url" content={playgroundUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      <meta name="twitter:image" content={playground.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(playgroundSchema)}
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
