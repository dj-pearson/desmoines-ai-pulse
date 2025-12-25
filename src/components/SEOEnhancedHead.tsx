import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

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
  description = BRAND.description,
  image = `${BRAND.baseUrl}${BRAND.logo}`,
  url,
  type = "website",
  article,
  structuredData,
  canonical
}: SEOEnhancedHeadProps) => {
  const fullTitle = title.includes(BRAND.city) ? title : `${title} | ${BRAND.name}`;
  const currentUrl = url || (typeof window !== 'undefined' ? `${BRAND.baseUrl}${window.location.pathname}` : BRAND.baseUrl);
  const canonicalUrl = canonical || currentUrl;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={`${BRAND.city}, ${BRAND.state}, events, restaurants, attractions, things to do, DSM, metro, entertainment, dining, activities`} />

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={BRAND.name} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content={BRAND.twitter} />
      
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
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      <meta name="geo.placename" content={BRAND.city} />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />

      {/* Additional SEO Meta Tags */}
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow" />
      <meta name="revisit-after" content="7 days" />
      <meta name="language" content="en-US" />
      <meta name="author" content={BRAND.name} />
      <meta name="publisher" content={BRAND.name} />
      
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
          "name": BRAND.name,
          "url": BRAND.baseUrl,
          "logo": `${BRAND.baseUrl}${BRAND.logo}`,
          "description": BRAND.tagline,
          "address": {
            "@type": "PostalAddress",
            "addressLocality": BRAND.city,
            "addressRegion": BRAND.stateAbbr,
            "addressCountry": BRAND.country
          },
          "sameAs": [
            "https://www.facebook.com/desmoinespulse",
            "https://www.twitter.com/desmoinespulse",
            "https://www.instagram.com/desmoinespulse"
          ],
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Customer Service",
            "email": BRAND.email
          }
        })}
      </script>
    </Helmet>
  );
};