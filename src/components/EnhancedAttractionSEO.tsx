import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";
import { ogImageUrl } from "@/lib/ogImage";

interface AttractionData {
  id?: string | null;
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
  /**
   * WEB-SEO-024. A real column on public.attractions, and the only honest
   * source for isAccessibleForFree -- which this component used to hard-code
   * true, claiming free admission for every attraction including the ones that
   * charge. Optional because the prop type is a hand-written subset and not
   * every caller passes the whole row; the schema omits the property when it is
   * absent rather than guessing.
   */
  is_free?: boolean | null;
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
  // Branded dynamic OG card (WEB-FEAT-008); falls back to the item photo / default.
  const ogImage = ogImageUrl("attraction", attraction.id) || attraction.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`;

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
    // WEB-SEO-024. THE ADDRESS ASSERTED A CITY AND A POSTCODE NO COLUMN HOLDS.
    //
    // public.attractions has address, location, latitude and longitude and no
    // city or postal_code at all. So every attraction in the set -- Ames, Ankeny,
    // Waukee, Altoona -- was published as being in Des Moines 50309. That is the
    // same locality bug SEO-007 fixed for events, on a different table.
    //
    // addressRegion and addressCountry stay: this is a Greater Des Moines site
    // and Iowa/US is true of the whole set. A locality is not, and a postcode
    // is a specific claim about a specific building.
    address: {
      "@type": "PostalAddress",
      ...(attraction.location && { streetAddress: attraction.location }),
      addressRegion: BRAND.state,
      addressCountry: BRAND.country,
    },
    // Coordinates fell back to 41.5868,-93.625 -- the middle of downtown Des
    // Moines -- for any row without them. A wrong pin is worse than no pin: it
    // puts the attraction somewhere it is not, on a map a user may drive to.
    ...(attraction.latitude != null && attraction.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: attraction.latitude,
            longitude: attraction.longitude,
          },
        }
      : {}),
    // WEB-SEO-016: aggregateRating removed. The ratingValue was real but
    // ratingCount was invented from it (attraction.rating >= 4.5 ? ... ), and
    // Google requires the count to reflect actual reviews. No reviews table
    // exists, so there is no honest count to emit.
    // is_free is a real column, so this can be stated -- but only when it is
    // set. It was hard-coded true, which claimed free admission for every
    // attraction including the ones that charge.
    ...(attraction.is_free != null && { isAccessibleForFree: attraction.is_free }),
    // publicAccess and touristType are GONE. Nothing backs either. touristType
    // in particular listed "Family", "Couples", "Solo travelers", "Groups" for
    // every row, which is a claim that says nothing and is false the moment one
    // attraction is not suitable for one of them.

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

  // FAQ schema is output by FAQSection on AttractionDetails - avoid duplicate FAQPage

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
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content={`${attraction.name} - ${attraction.type} in ${BRAND.city}`}
      />
      <meta property="og:url" content={attractionUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(attractionSchema)}
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
