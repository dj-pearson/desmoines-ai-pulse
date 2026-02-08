import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface LocalBusinessSchemaProps {
  name?: string;
  description?: string;
  url?: string;
  telephone?: string;
  email?: string;
  image?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  latitude?: number;
  longitude?: number;
  priceRange?: string;
  openingHours?: string[];
  areaServed?: string[];
  sameAs?: string[];
}

export default function LocalBusinessSchema({
  name = BRAND.name,
  description = BRAND.description,
  url = BRAND.baseUrl,
  telephone,
  email = BRAND.email,
  image,
  address,
  latitude = 41.5868,
  longitude = -93.625,
  priceRange,
  openingHours,
  areaServed = [
    "Des Moines",
    "West Des Moines",
    "Ankeny",
    "Urbandale",
    "Clive",
    "Johnston",
    "Waukee",
    "Windsor Heights",
    "Altoona",
  ],
  sameAs,
}: LocalBusinessSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description,
    url,
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(image && { image }),
    address: {
      "@type": "PostalAddress",
      ...(address?.street && { streetAddress: address.street }),
      addressLocality: address?.city || BRAND.city,
      addressRegion: address?.state || BRAND.state,
      ...(address?.zip && { postalCode: address.zip }),
      addressCountry: BRAND.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude,
      longitude,
    },
    areaServed: areaServed.map((area) => ({
      "@type": "City",
      name: area,
    })),
    ...(priceRange && { priceRange }),
    ...(openingHours && openingHours.length > 0 && {
      openingHoursSpecification: openingHours.map((hours) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: hours.split(" ")[0],
        opens: hours.split(" ")[1],
        closes: hours.split(" ")[2],
      })),
    }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
