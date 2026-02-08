import { Helmet } from "react-helmet-async";

interface TouristAttractionSchemaProps {
  name: string;
  description: string;
  address: {
    street?: string;
    city: string;
    state: string;
    zip?: string;
  };
  image?: string;
  url?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string[];
  telephone?: string;
  priceRange?: string;
  isAccessibleForFree?: boolean;
  publicAccess?: boolean;
  touristType?: string[];
}

export default function TouristAttractionSchema({
  name,
  description,
  address,
  image,
  url,
  latitude,
  longitude,
  openingHours,
  telephone,
  priceRange,
  isAccessibleForFree,
  publicAccess,
  touristType,
}: TouristAttractionSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name,
    description,
    address: {
      "@type": "PostalAddress",
      ...(address.street && { streetAddress: address.street }),
      addressLocality: address.city,
      addressRegion: address.state,
      ...(address.zip && { postalCode: address.zip }),
      addressCountry: "US",
    },
    ...(image && { image }),
    ...(url && { url }),
    ...(latitude && longitude && {
      geo: {
        "@type": "GeoCoordinates",
        latitude,
        longitude,
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
    ...(telephone && { telephone }),
    ...(priceRange && { priceRange }),
    ...(isAccessibleForFree !== undefined && { isAccessibleForFree }),
    ...(publicAccess !== undefined && { publicAccess }),
    ...(touristType && touristType.length > 0 && {
      touristType,
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
