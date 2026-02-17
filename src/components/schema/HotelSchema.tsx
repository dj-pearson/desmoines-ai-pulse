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
}: HotelSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
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
