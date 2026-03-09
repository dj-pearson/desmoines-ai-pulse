import { Helmet } from "react-helmet-async";
import { Database } from "@/integrations/supabase/types";
import { BRAND } from "@/lib/brandConfig";

type Playground = Database["public"]["Tables"]["playgrounds"]["Row"];

interface PlaygroundListJsonLdProps {
  playgrounds: Playground[];
  listName: string;
  listDescription: string;
  listUrl: string;
  /** Max playgrounds to include in schema (default 50) */
  maxItems?: number;
}

/**
 * Generates JSON-LD structured data for a list of playgrounds.
 * Outputs both an ItemList schema and individual Park schemas
 * to maximize Google Local Business indexing coverage.
 *
 * Uses Schema.org Park type with playground-specific properties.
 * Google requires: name, address for local business rich results.
 * Recommended: description, image, aggregateRating, geo, amenityFeature.
 */
export function PlaygroundListJsonLd({
  playgrounds,
  listName,
  listDescription,
  listUrl,
  maxItems = 50,
}: PlaygroundListJsonLdProps) {
  if (!playgrounds || playgrounds.length === 0) return null;

  const items = playgrounds.slice(0, maxItems);

  const createSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const buildPlaygroundSchema = (playground: Playground) => {
    const playgroundUrl = `${BRAND.baseUrl}/playgrounds/${createSlug(playground.name)}`;

    return {
      "@type": "Park",
      "@id": playgroundUrl,
      name: playground.name,
      description: playground.description || `${playground.name} - Playground in ${BRAND.city}, ${BRAND.state}`,
      url: playgroundUrl,
      ...(playground.image_url && { image: [playground.image_url] }),
      isAccessibleForFree: true,
      address: {
        "@type": "PostalAddress",
        streetAddress: playground.location || "",
        addressLocality: BRAND.city,
        addressRegion: BRAND.state,
        addressCountry: BRAND.country,
      },
      ...(playground.latitude && playground.longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude: playground.latitude,
          longitude: playground.longitude,
        },
      }),
      ...(playground.rating && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: playground.rating,
          bestRating: 5,
          worstRating: 1,
        },
      }),
      ...(playground.amenities && playground.amenities.length > 0 && {
        amenityFeature: playground.amenities.map((amenity) => ({
          "@type": "LocationFeatureSpecification",
          name: amenity,
          value: true,
        })),
      }),
      ...(playground.age_range && {
        additionalProperty: {
          "@type": "PropertyValue",
          name: "Age Range",
          value: playground.age_range,
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
    itemListElement: items.map((playground, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${BRAND.baseUrl}/playgrounds/${createSlug(playground.name)}`,
      item: buildPlaygroundSchema(playground),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
    </Helmet>
  );
}

export default PlaygroundListJsonLd;
