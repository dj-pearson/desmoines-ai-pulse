import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface SEOStructureProps {
  title?: string;
  description?: string;
  keywords?: string;
  articleType?: "event" | "restaurant" | "attraction" | "playground";
  structuredData?: object;
  canonicalUrl?: string;
}

export default function SEOStructure({
  title = `${BRAND.name}: Events, Restaurants & Attractions`,
  description = BRAND.description,
  keywords = `${BRAND.city} events, ${BRAND.state} restaurants, ${BRAND.city} attractions, family activities, local guide, restaurant openings`,
  articleType,
  structuredData,
  canonicalUrl
}: SEOStructureProps) {

  const defaultStructuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": BRAND.name,
    "description": description,
    "url": BRAND.baseUrl,
    "telephone": "+1-515-000-0000",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": BRAND.city,
      "addressRegion": BRAND.state,
      "addressCountry": BRAND.country
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "41.5868",
      "longitude": "-93.6250"
    },
    "priceRange": "Free - $$$",
    "servedCuisine": "Local Information",
    "serviceArea": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": "41.5868",
        "longitude": "-93.6250"
      },
      "geoRadius": "50000"
    }
  };

  return (
    <Helmet>
      {/* Enhanced meta tags for AI optimization */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Article-specific meta tags */}
      {articleType && (
        <>
          <meta name="article:section" content={articleType} />
          <meta name="article:publisher" content={BRAND.name} />
          <meta name="article:author" content={`${BRAND.name} Team`} />
        </>
      )}

      {/* Enhanced Open Graph for AI */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData || defaultStructuredData)}
      </script>

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl || (typeof window !== 'undefined' ? window.location.href : BRAND.baseUrl)} />
    </Helmet>
  );
}