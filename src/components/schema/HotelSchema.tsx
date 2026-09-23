import { Helmet } from "react-helmet-async";

interface HotelSchemaProps {
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
  starRating?: number;
  checkInTime?: string;
  checkOutTime?: string;
  /** This hotel's page on our site. Used for @id and url (SEO-013). */
  pageUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
  amenities?: string[] | null;
}

export default function HotelSchema({
  name,
  description,
  address,
  phone,
  website,
  image,
  priceRange,
  starRating,
  checkInTime,
  checkOutTime,
  pageUrl,
  latitude,
  longitude,
  amenities,
}: HotelSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    // SEO-013: this node used to put the hotel's own website in `url` and had
    // no @id and no coordinates. `url` is the page this markup is on; the
    // hotel's site is sameAs. geo and amenities come from stored columns.
    ...(pageUrl && { "@id": `${pageUrl}#hotel`, url: pageUrl }),
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
    ...(website && (pageUrl ? { sameAs: [website] } : { url: website })),
    ...(latitude != null && longitude != null && {
      geo: { "@type": "GeoCoordinates", latitude, longitude },
    }),
    ...(amenities && amenities.length > 0 && {
      amenityFeature: amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
    }),
    ...(image && { image }),
    ...(priceRange && { priceRange }),
    ...(starRating && {
      starRating: {
        "@type": "Rating",
        ratingValue: String(starRating),
      },
    }),
    ...(checkInTime && { checkinTime: checkInTime }),
    ...(checkOutTime && { checkoutTime: checkOutTime }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
