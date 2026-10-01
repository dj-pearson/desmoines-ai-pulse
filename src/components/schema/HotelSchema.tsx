import { Helmet } from "react-helmet-async";
import { toJsonLd } from "@/lib/jsonLd";
import { safeWebUrl } from "@/lib/reservations";
import { parseHotelTime } from "@/lib/hotelTimes";

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
  starRating?: number | null;
  /**
   * Set for rows the Google Places import created. Their star_rating is a
   * review average, not a hotel class, so no starRating is emitted for them.
   */
  googlePlaceId?: string | null;
  /** Row text; emitted only when it parses to HH:MM ("3:00 PM" -> "15:00"). */
  checkInTime?: string | null;
  checkOutTime?: string | null;
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
  googlePlaceId,
  checkInTime,
  checkOutTime,
  pageUrl,
  latitude,
  longitude,
  amenities,
}: HotelSchemaProps) {
  // plan-stay WP2 item 3: `website` is row text, so only an http(s) URL is
  // emitted as sameAs/url.
  const safeWebsite = safeWebUrl(website);
  // plan-stay-pass2 WP2 item 11: schema.org wants Time values and a URL image.
  const safeImage = safeWebUrl(image);
  const checkin = parseHotelTime(checkInTime);
  const checkout = parseHotelTime(checkOutTime);
  const stars =
    !googlePlaceId && typeof starRating === "number" && starRating > 0 && starRating <= 5
      ? starRating
      : null;
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
    ...(safeWebsite && (pageUrl ? { sameAs: [safeWebsite] } : { url: safeWebsite })),
    ...(latitude != null && longitude != null && {
      geo: { "@type": "GeoCoordinates", latitude, longitude },
    }),
    ...(amenities && amenities.length > 0 && {
      amenityFeature: amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
    }),
    ...(safeImage && { image: safeImage }),
    ...(priceRange && { priceRange }),
    ...(stars !== null && {
      starRating: {
        "@type": "Rating",
        ratingValue: String(stars),
      },
    }),
    ...(checkin && { checkinTime: checkin }),
    ...(checkout && { checkoutTime: checkout }),
  };

  return (
    <Helmet>
      {/* plan-stay WP2 item 2: hotel rows are editable text on a prerendered
          route, so a "</script>" in a description must not end this element. */}
      <script type="application/ld+json">{toJsonLd(schema)}</script>
    </Helmet>
  );
}
