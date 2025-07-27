import { Helmet } from "react-helmet-async";

interface SEOStructureProps {
  title?: string;
  description?: string;
  keywords?: string;
  articleType?: "event" | "restaurant" | "attraction" | "playground";
  structuredData?: object;
}

export default function SEOStructure({
  title = "Des Moines Insider - Your Complete Guide to Des Moines Events, Restaurants & Attractions",
  description = "Discover the best events, restaurants, attractions, and playgrounds in Des Moines, Iowa. AI-powered recommendations, real-time updates, and comprehensive local insights.",
  keywords = "Des Moines events, Iowa restaurants, Des Moines attractions, family activities, local guide, restaurant openings",
  articleType,
  structuredData
}: SEOStructureProps) {
  
  const defaultStructuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Des Moines Insider",
    "description": description,
    "url": "https://desmoinssider.com",
    "telephone": "+1-515-000-0000",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Des Moines",
      "addressRegion": "Iowa",
      "addressCountry": "US"
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
          <meta name="article:publisher" content="Des Moines Insider" />
          <meta name="article:author" content="Des Moines Insider Team" />
        </>
      )}
      
      {/* Enhanced Open Graph for AI */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content="Des Moines Insider" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(structuredData || defaultStructuredData)}
      </script>
      
      {/* Canonical URL */}
      <link rel="canonical" href="https://desmoinssider.com" />
    </Helmet>
  );
}