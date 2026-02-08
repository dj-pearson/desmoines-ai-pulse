import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface OrganizationSchemaProps {
  name?: string;
  url?: string;
  logo?: string;
  description?: string;
  email?: string;
  telephone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  sameAs?: string[];
  foundingDate?: string;
  areaServed?: string[];
}

export default function OrganizationSchema({
  name = BRAND.name,
  url = BRAND.baseUrl,
  logo = `${BRAND.baseUrl}${BRAND.logo}`,
  description = BRAND.description,
  email = BRAND.email,
  telephone,
  address,
  sameAs,
  foundingDate,
  areaServed,
}: OrganizationSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url,
    logo: {
      "@type": "ImageObject",
      url: logo,
    },
    description,
    ...(email && { email }),
    ...(telephone && { telephone }),
    address: {
      "@type": "PostalAddress",
      ...(address?.street && { streetAddress: address.street }),
      addressLocality: address?.city || BRAND.city,
      addressRegion: address?.state || BRAND.state,
      addressCountry: BRAND.country,
    },
    ...(sameAs && sameAs.length > 0 && { sameAs }),
    ...(foundingDate && { foundingDate }),
    ...(areaServed && areaServed.length > 0 && {
      areaServed: areaServed.map((area) => ({
        "@type": "City",
        name: area,
      })),
    }),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      ...(email && { email }),
      ...(telephone && { telephone }),
      availableLanguage: "English",
      areaServed: {
        "@type": "AdministrativeArea",
        name: BRAND.region,
      },
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
