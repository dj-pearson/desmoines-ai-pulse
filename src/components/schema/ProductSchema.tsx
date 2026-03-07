import { Helmet } from "react-helmet-async";

interface ProductSchemaProps {
  name: string;
  description: string;
  image?: string;
  url?: string;
  brand?: string;
  sku?: string;
  price?: string | number;
  priceCurrency?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder" | "Discontinued";
  category?: string;
  rating?: {
    value: number;
    count: number;
  };
  offers?: {
    price: string | number;
    priceCurrency?: string;
    url?: string;
    availability?: string;
    validFrom?: string;
    priceValidUntil?: string;
  }[];
}

export default function ProductSchema({
  name,
  description,
  image,
  url,
  brand,
  sku,
  price,
  priceCurrency = "USD",
  availability = "InStock",
  category,
  rating,
  offers,
}: ProductSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    ...(image && { image }),
    ...(url && { url }),
    ...(brand && {
      brand: {
        "@type": "Brand",
        name: brand,
      },
    }),
    ...(sku && { sku }),
    ...(category && { category }),
    ...(rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating.value,
        reviewCount: rating.count,
        bestRating: "5",
        worstRating: "1",
      },
    }),
  };

  if (offers && offers.length > 0) {
    schema.offers = offers.map((offer) => ({
      "@type": "Offer",
      price: offer.price.toString(),
      priceCurrency: offer.priceCurrency || priceCurrency,
      ...(offer.url && { url: offer.url }),
      ...(offer.availability && {
        availability: `https://schema.org/${offer.availability}`,
      }),
      ...(offer.validFrom && { validFrom: offer.validFrom }),
      ...(offer.priceValidUntil && { priceValidUntil: offer.priceValidUntil }),
    }));
  } else if (price !== undefined) {
    schema.offers = {
      "@type": "Offer",
      price: price.toString(),
      priceCurrency,
      availability: `https://schema.org/${availability}`,
    };
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
