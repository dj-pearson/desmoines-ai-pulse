import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";
import { toJsonLd } from "@/lib/jsonLd";
import { suburbFromLocation } from "@/hooks/usePlaygrounds";

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

/**
 * Head tags and JSON-LD for one playground (explore pass 2 WP4 items 1-3).
 *
 * Everything here is read from the row. The locality is the suburb the
 * `location` string names (suburbFromLocation), or nothing: stamping
 * BRAND.city on every row told search engines that Ankeny and Clive
 * playgrounds were in Des Moines. geo.position and ICBM appear only when the
 * row has its own coordinates; they used to fall back to downtown.
 */
export default function EnhancedPlaygroundSEO({
  playground,
  slug,
}: EnhancedPlaygroundSEOProps) {
  const playgroundUrl = `${BRAND.baseUrl}/playgrounds/${slug}`;
  const locality = suburbFromLocation(playground.location);
  const hasCoords = playground.latitude != null && playground.longitude != null;
  const where = locality ? `${locality}, ${BRAND.state}` : `the ${BRAND.city} metro`;

  const getOptimizedTitle = () => {
    const parts = [playground.name];
    if (playground.age_range) parts.push(`Ages ${playground.age_range}`);
    parts.push(`Playground in ${where}`);
    return parts.join(" - ");
  };

  const getGEODescription = () => {
    const desc = playground.description || "";
    const ageText = playground.age_range
      ? ` Listed for ages ${playground.age_range}.`
      : "";
    const amenitiesText =
      playground.amenities && playground.amenities.length > 0
        ? ` Amenities include ${playground.amenities.slice(0, 4).join(", ")}.`
        : "";
    const locationText = playground.location ? ` Located at ${playground.location}.` : "";

    if (desc.length > 50) {
      return `${playground.name} is a playground in ${where}. ${desc.substring(0, 150).trim()}...${ageText}${amenitiesText}${locationText}`;
    }

    return `${playground.name}, a playground in ${where}.${ageText}${amenitiesText} Directions, amenities and parent essentials.`;
  };

  const getLocalKeywords = () => {
    return [
      playground.name,
      locality ? `${playground.name} ${locality}` : "",
      locality ? `${locality} playgrounds` : "",
      `${BRAND.city} playgrounds`,
      `playgrounds in ${BRAND.city}`,
      `kids activities ${BRAND.city}`,
      `${BRAND.state} playgrounds`,
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
    "@type": "Playground",
    "@id": `${playgroundUrl}#place`,
    name: playground.name,
    description: getGEODescription(),
    url: playgroundUrl,
    ...(playground.image_url && { image: [playground.image_url] }),
    // WEB-SEO-024: public.playgrounds has location, latitude and longitude and
    // NO city or postal_code. The locality is read out of `location` when it
    // names one and omitted when it doesn't.
    address: {
      "@type": "PostalAddress",
      ...(playground.location && { streetAddress: playground.location }),
      ...(locality && { addressLocality: locality }),
      addressRegion: BRAND.stateAbbr,
      addressCountry: BRAND.country,
    },
    ...(hasCoords
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: playground.latitude,
            longitude: playground.longitude,
          },
        }
      : {}),
    // WEB-SEO-016: no aggregateRating. There is no reviews table, so there is
    // no honest ratingCount.
    //
    // No isAccessibleForFree or publicAccess (explore pass 2 WP4 item 2). The
    // table has no admission column and holds indoor play spaces as well as
    // park equipment, so "free" is not something a row can back. Plan D9 adds
    // the column; emit it from that when it exists.
    amenityFeature: (playground.amenities || []).map((amenity) => ({
      "@type": "LocationFeatureSpecification",
      name: amenity,
      value: true,
    })),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": playgroundUrl,
    },
  };

  // FAQ schema is output by FAQSection on PlaygroundDetails - avoid duplicate FAQPage

  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": playgroundUrl,
    name: getOptimizedTitle(),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1"],
    },
    url: playgroundUrl,
  };

  // WEB-SEO-026: no site-wide LocalBusiness here. SEOHead's Organization node
  // is the one identity this site publishes.

  const description = getGEODescription();
  const title = getOptimizedTitle();
  const image = playground.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={getLocalKeywords().join(", ")} />
      <link rel="canonical" href={playgroundUrl} />

      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      {locality && <meta name="geo.placename" content={`${locality}, ${BRAND.state}`} />}
      {hasCoords && (
        <meta name="geo.position" content={`${playground.latitude};${playground.longitude}`} />
      )}
      {hasCoords && <meta name="ICBM" content={`${playground.latitude}, ${playground.longitude}`} />}
      <meta name="DC.title" content={title} />

      <meta name="place:name" content={playground.name} />
      <meta name="place:type" content="Playground" />
      {playground.location && <meta name="place:location" content={playground.location} />}
      {locality && <meta name="place:city" content={locality} />}
      <meta name="place:state" content={BRAND.state} />
      <meta name="place:country" content="United States" />
      {playground.image_url && (
        <meta name="place:image" content={playground.image_url} />
      )}
      {playground.rating != null && (
        <meta name="place:rating" content={playground.rating.toFixed(1)} />
      )}
      {playground.age_range && (
        <meta name="place:age_range" content={playground.age_range} />
      )}

      <meta
        name="robots"
        content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
      />
      <meta name="googlebot" content="index, follow" />
      <meta name="bingbot" content="index, follow" />

      <meta property="og:type" content="place" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {locality && <meta property="og:locality" content={locality} />}
      <meta property="og:region" content={BRAND.state} />
      <meta property="og:country-name" content="United States" />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={`${playground.name}, playground in ${where}`} />
      <meta property="og:url" content={playgroundUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* toJsonLd escapes the block: names and descriptions come from a
          Places import, and a "</script" in one would end the block. */}
      <script type="application/ld+json">{toJsonLd(playgroundSchema)}</script>
      <script type="application/ld+json">{toJsonLd(speakableSchema)}</script>
    </Helmet>
  );
}
