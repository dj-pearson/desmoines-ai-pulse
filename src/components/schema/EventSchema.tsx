import { Helmet } from "react-helmet-async";

interface EventSchemaProps {
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  location: {
    name: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  image?: string;
  url?: string;
  price?: string | number;
  organizer?: {
    name: string;
    url?: string;
  };
  category?: string;
  eventStatus?: "EventScheduled" | "EventCancelled" | "EventPostponed" | "EventRescheduled";
  eventAttendanceMode?: "OfflineEventAttendanceMode" | "OnlineEventAttendanceMode" | "MixedEventAttendanceMode";
  offers?: {
    price: string | number;
    priceCurrency: string;
    url?: string;
    availability?: "InStock" | "OutOfStock" | "PreOrder";
  };
}

export default function EventSchema({
  name,
  description,
  startDate,
  endDate,
  location,
  image,
  url,
  price,
  organizer,
  category,
  eventStatus = "EventScheduled",
  eventAttendanceMode = "OfflineEventAttendanceMode",
  offers,
}: EventSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    description,
    startDate,
    ...(endDate && { endDate }),
    eventStatus: `https://schema.org/${eventStatus}`,
    eventAttendanceMode: `https://schema.org/${eventAttendanceMode}`,
    location: {
      "@type": "Place",
      name: location.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: location.address,
        ...(location.city && { addressLocality: location.city }),
        ...(location.state && { addressRegion: location.state }),
        ...(location.zip && { postalCode: location.zip }),
        addressCountry: "US",
      },
    },
    ...(image && { image }),
    ...(url && { url }),
    ...(organizer && {
      organizer: {
        "@type": "Organization",
        name: organizer.name,
        ...(organizer.url && { url: organizer.url }),
      },
    }),
    ...(category && {
      category: {
        "@type": "Thing",
        name: category,
      },
    }),
    ...(offers && {
      offers: {
        "@type": "Offer",
        price: offers.price.toString(),
        priceCurrency: offers.priceCurrency || "USD",
        ...(offers.url && { url: offers.url }),
        ...(offers.availability && {
          availability: `https://schema.org/${offers.availability}`,
        }),
      },
    }),
    ...(price !== undefined &&
      !offers && {
        offers: {
          "@type": "Offer",
          price: price === "Free" || price === 0 ? "0" : price.toString(),
          priceCurrency: "USD",
        },
      }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
