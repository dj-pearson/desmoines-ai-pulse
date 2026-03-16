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
  performer?: {
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
    validFrom?: string;
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
  performer,
  category,
  eventStatus = "EventScheduled",
  eventAttendanceMode = "OfflineEventAttendanceMode",
  offers,
}: EventSchemaProps) {
  // If no endDate provided, estimate as startDate + 3 hours
  const computedEndDate = endDate || new Date(new Date(startDate).getTime() + 3 * 60 * 60 * 1000).toISOString();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    description: description || `${name} event`,
    startDate,
    endDate: computedEndDate,
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
    image: image || undefined,
    ...(url && { url }),
    organizer: organizer
      ? {
          "@type": "Organization",
          name: organizer.name,
          ...(organizer.url && { url: organizer.url }),
        }
      : {
          "@type": "Organization",
          name: "Des Moines Insider",
          url: "https://desmoinesinsider.com",
        },
    performer: performer
      ? {
          "@type": "Organization",
          name: performer.name,
          ...(performer.url && { url: performer.url }),
        }
      : organizer
        ? { "@type": "Organization", name: organizer.name }
        : { "@type": "Organization", name: "Des Moines Insider" },
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
        url: offers.url || url || undefined,
        availability: offers.availability
          ? `https://schema.org/${offers.availability}`
          : "https://schema.org/InStock",
        validFrom: offers.validFrom || new Date().toISOString(),
      },
    }),
    ...(price !== undefined &&
      !offers && {
        offers: {
          "@type": "Offer",
          price: price === "Free" || price === 0 ? "0" : price.toString(),
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          ...(url && { url }),
          validFrom: new Date().toISOString(),
        },
      }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
