import React from 'react';
import { Helmet } from 'react-helmet-async';
import { SEOData } from '@/lib/seoUtils';

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
      <meta property="og:site_name" content="Des Moines Insider" />
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
      <meta name="twitter:title" content={seoData.openGraph.title} />
      <meta name="twitter:description" content={seoData.openGraph.description} />
      {seoData.openGraph.image && (
        <meta name="twitter:image" content={seoData.openGraph.image} />
      )}
      
      {/* Geographic Tags */}
      <meta name="geo.region" content="US-IA" />
      <meta name="geo.placename" content="Des Moines, Iowa" />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      
      {/* Additional SEO Tags */}
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      <meta name="author" content="Des Moines Insider" />
      <meta name="publisher" content="Des Moines Insider" />
      <meta name="copyright" content="Des Moines Insider" />
      
      {/* Mobile Optimization */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
          name: 'Des Moines Insider',
          url: 'https://desmoinesinsider.com',
          description: 'Your guide to events, dining, and attractions in Des Moines, Iowa',
          inLanguage: 'en-US',
          about: {
            '@type': 'City',
            name: 'Des Moines',
            addressRegion: 'Iowa',
            addressCountry: 'US'
          },
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: 'https://desmoinesinsider.com/search?q={search_term_string}'
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
              item: 'https://desmoinesinsider.com'
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: seoData.openGraph.type === 'event' ? 'Events' : 'Restaurants',
              item: seoData.openGraph.type === 'event' ? 
                'https://desmoinesinsider.com/events' : 
                'https://desmoinesinsider.com/restaurants'
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