import { Helmet } from "react-helmet-async";

interface SEOEnhancedHeadProps {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article" | "event" | "restaurant";
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    section?: string;
    tags?: string[];
  };
  structuredData?: object;
  canonical?: string;
}

export const SEOEnhancedHead = ({
  title,
  description = "Discover the best events, restaurants, and attractions in Des Moines, Iowa. Your complete guide to what's happening in the Des Moines metro area.",
  image = "https://desmoinesinsider.com/DMI-Logo.png",
  url,
  type = "website",
  article,
  structuredData,
  canonical
}: SEOEnhancedHeadProps) => {
  const fullTitle = title.includes("Des Moines") ? title : `${title} | Des Moines Insider`;
  const currentUrl = url || `https://desmoinesinsider.com${window.location.pathname}`;
  const canonicalUrl = canonical || currentUrl;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content="Des Moines, Iowa, events, restaurants, attractions, things to do, DSM, metro, entertainment, dining, activities" />
      
      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Des Moines Insider" />
      <meta property="og:locale" content="en_US" />
      
      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@desmoinesinsider" />
      
      {/* Article-specific meta tags */}
      {article && type === "article" && (
        <>
          <meta property="article:published_time" content={article.publishedTime} />
          {article.modifiedTime && (
            <meta property="article:modified_time" content={article.modifiedTime} />
          )}
          {article.author && (
            <meta property="article:author" content={article.author} />
          )}
          {article.section && (
            <meta property="article:section" content={article.section} />
          )}
          {article.tags && article.tags.map((tag, index) => (
            <meta key={index} property="article:tag" content={tag} />
          ))}
        </>
      )}
      
      {/* Geo Tags for Local SEO */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      
      {/* Additional SEO Meta Tags */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />
      <meta name="revisit-after" content="7 days" />
      <meta name="language" content="en-US" />
      <meta name="author" content="Des Moines Insider" />
      <meta name="publisher" content="Des Moines Insider" />
      
      {/* Mobile and Responsive */}
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
      
      {/* Default Organization Schema */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Des Moines Insider",
          "url": "https://desmoinesinsider.com",
          "logo": "https://desmoinesinsider.com/DMI-Logo.png",
          "description": "Your complete guide to Des Moines events, restaurants, and attractions",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Des Moines",
            "addressRegion": "IA",
            "addressCountry": "US"
          },
          "sameAs": [
            "https://www.facebook.com/desmoinesinsider",
            "https://www.twitter.com/desmoinesinsider",
            "https://www.instagram.com/desmoinesinsider"
          ],
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Customer Service",
            "email": "info@desmoinesinsider.com"
          }
        })}
      </script>
    </Helmet>
  );
};