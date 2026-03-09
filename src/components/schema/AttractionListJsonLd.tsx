import { Helmet } from "react-helmet-async";
import { Database } from "@/integrations/supabase/types";
import { BRAND } from "@/lib/brandConfig";

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];

interface AttractionListJsonLdProps {
  attractions: Attraction[];
  listName: string;
  listDescription: string;
  listUrl: string;
  /** Max attractions to include in schema (default 50) */
  maxItems?: number;
}

/**
 * Generates JSON-LD structured data for a list of attractions.
 * Outputs both an ItemList schema and individual TouristAttraction schemas
 * to maximize Google indexing coverage.
 *
 * Google requires: name, address for TouristAttraction rich results.
 * Recommended: description, image, aggregateRating, geo.
 */
export function AttractionListJsonLd({
  attractions,
  listName,
  listDescription,
  listUrl,
  maxItems = 50,
}: AttractionListJsonLdProps) {
  if (!attractions || attractions.length === 0) return null;

  const items = attractions.slice(0, maxItems);

  const createSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const buildAttractionSchema = (attraction: Attraction) => {
    const attractionUrl = `${BRAND.baseUrl}/attractions/${createSlug(attraction.name)}`;

    return {
      "@type": "TouristAttraction",
      "@id": attractionUrl,
      name: attraction.name,
      description: attraction.description || `${attraction.name} - ${attraction.type} in ${BRAND.city}, ${BRAND.state}`,
      url: attractionUrl,
      touristType: attraction.type,
      ...(attraction.image_url && { image: [attraction.image_url] }),
      ...(attraction.website && { sameAs: attraction.website }),
      address: {
        "@type": "PostalAddress",
        streetAddress: attraction.location || "",
        addressLocality: BRAND.city,
        addressRegion: BRAND.state,
        addressCountry: BRAND.country,
      },
      ...(attraction.latitude && attraction.longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude: attraction.latitude,
          longitude: attraction.longitude,
        },
      }),
      ...(attraction.rating && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: attraction.rating,
          bestRating: 5,
          worstRating: 1,
        },
      }),
    };
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    description: listDescription,
    url: listUrl,
    numberOfItems: items.length,
    itemListElement: items.map((attraction, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${BRAND.baseUrl}/attractions/${createSlug(attraction.name)}`,
      item: buildAttractionSchema(attraction),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
    </Helmet>
  );
}

export default AttractionListJsonLd;
