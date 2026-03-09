import { Helmet } from "react-helmet-async";
import { Database } from "@/integrations/supabase/types";
import { BRAND } from "@/lib/brandConfig";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

interface RestaurantListJsonLdProps {
  restaurants: Restaurant[];
  listName: string;
  listDescription: string;
  listUrl: string;
  /** Max restaurants to include in schema (default 50) */
  maxItems?: number;
}

/**
 * Generates JSON-LD structured data for a list of restaurants.
 * Outputs both an ItemList schema and individual Restaurant schemas
 * to maximize Google Local Business indexing coverage.
 *
 * Google requires: name, address for Restaurant rich results.
 * Recommended: servesCuisine, priceRange, aggregateRating, image, openingHours.
 */
export function RestaurantListJsonLd({
  restaurants,
  listName,
  listDescription,
  listUrl,
  maxItems = 50,
}: RestaurantListJsonLdProps) {
  if (!restaurants || restaurants.length === 0) return null;

  const items = restaurants.slice(0, maxItems);

  const buildRestaurantSchema = (restaurant: Restaurant) => {
    const restaurantUrl = `${BRAND.baseUrl}/restaurants/${restaurant.slug || restaurant.id}`;

    return {
      "@type": "Restaurant",
      "@id": restaurantUrl,
      name: restaurant.name,
      description: restaurant.seo_description || restaurant.description || `${restaurant.name} in ${restaurant.city || BRAND.city}, ${BRAND.state}`,
      url: restaurantUrl,
      ...(restaurant.image_url && { image: [restaurant.image_url] }),
      ...(restaurant.cuisine && { servesCuisine: restaurant.cuisine }),
      ...(restaurant.price_range && { priceRange: restaurant.price_range }),
      ...(restaurant.phone && { telephone: restaurant.phone }),
      ...(restaurant.website && { menu: restaurant.website }),
      address: {
        "@type": "PostalAddress",
        streetAddress: restaurant.location || "",
        addressLocality: restaurant.city || BRAND.city,
        addressRegion: BRAND.state,
        addressCountry: BRAND.country,
      },
      ...(restaurant.latitude && restaurant.longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        },
      }),
      ...(restaurant.rating && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: restaurant.rating,
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
    itemListElement: items.map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${BRAND.baseUrl}/restaurants/${restaurant.slug || restaurant.id}`,
      item: buildRestaurantSchema(restaurant),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
    </Helmet>
  );
}

export default RestaurantListJsonLd;
