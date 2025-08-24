import { Helmet } from "react-helmet-async";

interface SEOHeadProps {
  title: string;
  description: string;
  type?: "website" | "article" | "business" | "event" | "restaurant";
  imageUrl?: string;
  url?: string;
  keywords?: string[];
  structuredData?: object;
  alternateUrls?: { [key: string]: string };
  canonicalUrl?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  location?: {
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
}

export default function SEOHead({
  title,
  description,
  type = "website",
  imageUrl,
  url,
  keywords = [],
  structuredData,
  alternateUrls,
  canonicalUrl,
  author = "Des Moines Insider",
  publishedTime,
  modifiedTime,
  location,
  breadcrumbs,
}: SEOHeadProps) {
  const baseUrl = "https://desmoinesinsider.com";
  const fullUrl = url ? `${baseUrl}${url}` : window.location.href;
  const defaultImage = `${baseUrl}/og-image.jpg`;
  const image = imageUrl || defaultImage;

  // Enhanced title with branding
  const enhancedTitle = title.includes("Des Moines Insider")
    ? title
    : `${title} | Des Moines Insider`;

  // Generate comprehensive keywords
  const defaultKeywords = [
    "Des Moines",
    "Iowa",
    "local guide",
    "Des Moines Insider",
    "Iowa attractions",
    "Des Moines events",
  ];
  const allKeywords = [...keywords, ...defaultKeywords].join(", ");

  // Generate breadcrumb structured data
  const breadcrumbSchema = breadcrumbs
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: `${baseUrl}${crumb.url}`,
        })),
      }
    : null;

  // Generate location structured data
  const locationSchema = location
    ? {
        "@context": "https://schema.org",
        "@type": "Place",
        name: location.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: location.address,
          addressLocality: "Des Moines",
          addressRegion: "Iowa",
          addressCountry: "US",
        },
        ...(location.latitude &&
          location.longitude && {
            geo: {
              "@type": "GeoCoordinates",
              latitude: location.latitude,
              longitude: location.longitude,
            },
          }),
      }
    : null;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{enhancedTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={allKeywords} />
      <meta name="author" content={author} />
      <meta
        name="robots"
        content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      />

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl || fullUrl} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={enhancedTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content="Des Moines Insider" />

      {/* Article specific tags */}
      {type === "article" && (
        <>
          {publishedTime && (
            <meta property="article:published_time" content={publishedTime} />
          )}
          {modifiedTime && (
            <meta property="article:modified_time" content={modifiedTime} />
          )}
          <meta property="article:author" content={author} />
          <meta property="article:section" content="Local Guide" />
          {keywords.map((keyword) => (
            <meta key={keyword} property="article:tag" content={keyword} />
          ))}
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={enhancedTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={title} />
      <meta name="twitter:site" content="@desmoinesinsider" />
      <meta name="twitter:creator" content="@desmoinesinsider" />

      {/* Geographic Meta Tags */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />

      {/* Mobile Optimization */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="format-detection" content="telephone=yes" />
      <meta name="format-detection" content="address=yes" />
      <meta name="mobile-web-app-capable" content="yes" />

      {/* Preconnect for Performance */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />

      {/* Alternate URLs for different languages/regions */}
      {alternateUrls &&
        Object.entries(alternateUrls).map(([lang, url]) => (
          <link key={lang} rel="alternate" hrefLang={lang} href={url} />
        ))}

      {/* Structured Data */}
      {breadcrumbSchema && (
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      )}

      {locationSchema && (
        <script type="application/ld+json">
          {JSON.stringify(locationSchema)}
        </script>
      )}

      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}

      {/* Default Organization Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${baseUrl}/#organization`,
          "name": "Des Moines Insider",
          "url": baseUrl,
          "logo": {
            "@type": "ImageObject",
            "url": `${baseUrl}/DMI-Logo.png`
          }
        })}
      </script>

      {/* Default WebSite Structured Data with SearchAction */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          "url": baseUrl,
          "name": "Des Moines Insider",
          "potentialAction": {
            "@type": "SearchAction",
            "target": `${baseUrl}/?q={search_term_string}`,
            "query-input": "required name=search_term_string"
          }
        })}
      </script>

      {/* Additional Meta for Search Engines */}
      <meta name="theme-color" content="#1e40af" />
      <meta name="msapplication-TileColor" content="#1e40af" />
      <meta name="application-name" content="Des Moines Insider" />
      <meta name="apple-mobile-web-app-title" content="Des Moines Insider" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </Helmet>
  );
}
