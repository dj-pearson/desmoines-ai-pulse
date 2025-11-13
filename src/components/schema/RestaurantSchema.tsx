import { Helmet } from "react-helmet-async";

interface RestaurantSchemaProps {
  name: string;
  description?: string;
  address: {
    street?: string;
    city: string;
    state: string;
    zip?: string;
  };
  phone?: string;
  website?: string;
  image?: string;
  priceRange?: string;
  cuisine?: string[];
  rating?: {
    value: number;
    count: number;
  };
  openingHours?: string[];
  menu?: string;
  acceptsReservations?: boolean;
  servesCuisine?: string[];
}

export default function RestaurantSchema({
  name,
  description,
  address,
  phone,
  website,
  image,
  priceRange,
  cuisine,
  rating,
  openingHours,
  menu,
  acceptsReservations,
  servesCuisine,
}: RestaurantSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    ...(description && { description }),
    address: {
      "@type": "PostalAddress",
      ...(address.street && { streetAddress: address.street }),
      addressLocality: address.city,
      addressRegion: address.state,
      ...(address.zip && { postalCode: address.zip }),
      addressCountry: "US",
    },
    ...(phone && { telephone: phone }),
    ...(website && { url: website }),
    ...(image && { image }),
    ...(priceRange && { priceRange }),
    ...(cuisine && cuisine.length > 0 && {
      servesCuisine: cuisine,
    }),
    ...(servesCuisine && servesCuisine.length > 0 && {
      servesCuisine,
    }),
    ...(rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating.value,
        reviewCount: rating.count,
        bestRating: "5",
        worstRating: "1",
      },
    }),
    ...(openingHours && openingHours.length > 0 && {
      openingHoursSpecification: openingHours.map((hours) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: hours.split(" ")[0],
        opens: hours.split(" ")[1],
        closes: hours.split(" ")[2],
      })),
    }),
    ...(menu && { hasMenu: menu }),
    ...(acceptsReservations !== undefined && { acceptsReservations }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
