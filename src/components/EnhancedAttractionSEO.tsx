import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

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

  // WEB-SEO-026: A SITE-WIDE LocalBusiness USED TO BE BUILT HERE, so every
  // attraction page carried a second identity claim about US, at
  // @id /#localbusiness, alongside the attraction it is actually about. An
  // aggregator is not a local business, and a page about someone else's place
  // is the worst position from which to say otherwise. SEOHead's Organization
  // node, with a stable @id, is the one identity this site publishes.


  return (
    <Helmet>
      {/* WEB-SEO-027 -- THIS COMPONENT NO LONGER MANAGES THE HEAD.
          It used to emit its own <title>, description, keywords, canonical,
          robots, DC.title, the full Open Graph set and the full Twitter set,
          alongside AttractionDetails' <SEOHead>, which emits every one of
          those too. Two components computing a title independently means the
          one that ships is decided by mount order rather than by anyone - and
          the prerenderer's dedupeJsonLd kept the LAST block of each @type, so
          the static HTML looked settled while the live DOM was not.
          SEOHead is the single head manager for this page now. What stays here
          is what SEOHead has no notion of: the place:* meta for AI parsers, and
          the three typed schema blocks. Nothing observable changed when these
          were removed - SEOHead mounts second and was already winning every one
          of them. */}

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

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(attractionSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(speakableSchema)}
      </script>
    </Helmet>
  );
}
