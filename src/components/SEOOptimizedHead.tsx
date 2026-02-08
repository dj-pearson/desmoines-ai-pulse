import React from 'react';
import { Helmet } from 'react-helmet-async';
import { SEOData } from '@/lib/seoUtils';
import { BRAND } from '@/lib/brandConfig';

interface SEOOptimizedHeadProps {
  seoData: SEOData;
}

export function SEOOptimizedHead({ seoData }: SEOOptimizedHeadProps) {
  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{seoData.title}</title>
      <meta name="description" content={seoData.description} />
      <meta name="keywords" content={seoData.keywords.join(', ')} />

      {/* Canonical URL */}
      <link rel="canonical" href={seoData.canonical} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={seoData.openGraph.title} />
      <meta property="og:description" content={seoData.openGraph.description} />
      <meta property="og:type" content={seoData.openGraph.type} />
      <meta property="og:url" content={seoData.openGraph.url} />
      <meta property="og:site_name" content={BRAND.name} />
      <meta property="og:locale" content="en_US" />
      {seoData.openGraph.image && (
        <>
          <meta property="og:image" content={seoData.openGraph.image} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content={seoData.openGraph.title} />
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={BRAND.twitter} />
      <meta name="twitter:title" content={seoData.openGraph.title} />
      <meta name="twitter:description" content={seoData.openGraph.description} />
      {seoData.openGraph.image && (
        <meta name="twitter:image" content={seoData.openGraph.image} />
      )}

      {/* Geographic Tags */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content={`${BRAND.city}, ${BRAND.state}`} />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />

      {/* Additional SEO Tags */}
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      <meta name="author" content={BRAND.name} />
      <meta name="publisher" content={BRAND.name} />
      <meta name="copyright" content={BRAND.name} />

      {/* Content Freshness Signals for AI Crawlers */}
      <meta name="article:modified_time" content={new Date().toISOString()} />

      {/* Mobile Optimization */}
      <meta name="format-detection" content="telephone=yes" />

      {/* Structured Data (JSON-LD) */}
      <script type="application/ld+json">
        {JSON.stringify(seoData.structuredData)}
      </script>

      {/* Additional structured data for local business context */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: BRAND.name,
          url: BRAND.baseUrl,
          description: BRAND.description,
          inLanguage: 'en-US',
          about: {
            '@type': 'City',
            name: BRAND.city,
            addressRegion: BRAND.state,
            addressCountry: BRAND.country
          },
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${BRAND.baseUrl}/search?q={search_term_string}`
            },
            'query-input': 'required name=search_term_string'
          }
        })}
      </script>

      {/* Breadcrumb structured data for better navigation understanding */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: BRAND.baseUrl
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: seoData.openGraph.type === 'event' ? 'Events' : 'Restaurants',
              item: seoData.openGraph.type === 'event' ?
                `${BRAND.baseUrl}/events` :
                `${BRAND.baseUrl}/restaurants`
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: seoData.openGraph.title,
              item: seoData.canonical
            }
          ]
        })}
      </script>
    </Helmet>
  );
}