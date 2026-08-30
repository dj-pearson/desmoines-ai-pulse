/**
 * PseoPage — Main wrapper component for programmatic SEO pages.
 *
 * Renders a complete pSEO page from a PseoPageContent object,
 * including SEO head, structured data, and all content sections.
 */

import { lazy, Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { BRAND, getCanonicalUrl } from '@/lib/brandConfig';
import type { PseoPageContent, PseoSection as PseoSectionType } from '../schemas';
import { PseoHeroIntro } from './sections/PseoHeroIntro';
import { PseoCuratedPicks } from './sections/PseoCuratedPicks';
import { PseoLocalTips } from './sections/PseoLocalTips';
import { PseoFaq } from './sections/PseoFaq';
import { PseoSeasonalContext } from './sections/PseoSeasonalContext';
import { PseoNeighborhoodProfile } from './sections/PseoNeighborhoodProfile';
import { PseoAudienceCallout } from './sections/PseoAudienceCallout';
import { PseoRelatedPages } from './sections/PseoRelatedPages';
import { PseoLiveListings } from './sections/PseoLiveListings';
import { PseoBreadcrumbs } from './PseoBreadcrumbs';

const PseoMapEmbed = lazy(() => import('./sections/PseoMapEmbed'));

interface PseoPageProps {
  page: PseoPageContent;
}

export function PseoPage({ page }: PseoPageProps) {
  const { seo, sections, relatedPages, structuredData } = page;

  // Build structured data for Schema.org
  const schemaData = buildSchemaOrgData(page);

  return (
    <>
      <SEOHead
        title={seo.title}
        description={seo.description}
        url={seo.canonicalUrl}
        keywords={seo.keywords}
        canonicalUrl={getCanonicalUrl(page.slug)}
        breadcrumbs={structuredData.breadcrumb}
        structuredData={schemaData}
      />

      <Header />

      <main className="min-h-screen bg-background">
        {/* Breadcrumbs */}
        <div className="container mx-auto px-4 pt-4">
          <PseoBreadcrumbs items={structuredData.breadcrumb} />
        </div>

        {/* Page Header */}
        <header className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {seo.h1}
          </h1>
        </header>

        {/* Content Sections */}
        <div className="container mx-auto px-4 pb-16 space-y-12">
          {sections.map((section) => (
            <SectionRenderer key={section.id} section={section} page={page} />
          ))}

          {/* Related Pages (always last) */}
          {relatedPages.length > 0 && (
            <PseoRelatedPages pages={relatedPages} />
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}

// ---------------------------------------------------------------------------
// Section Renderer
// ---------------------------------------------------------------------------

function SectionRenderer({
  section,
  page,
}: {
  section: PseoSectionType;
  page: PseoPageContent;
}) {
  switch (section.type) {
    case 'hero_intro':
      return <PseoHeroIntro content={section.content ?? ''} />;

    case 'curated_picks':
      return (
        <PseoCuratedPicks
          heading={section.heading ?? 'Our Top Picks'}
          items={section.items ?? []}
        />
      );

    case 'live_listings':
      return (
        <PseoLiveListings
          dimensions={page.dimensions}
          pageTypeId={page.pageTypeId}
        />
      );

    case 'local_tips':
      return (
        <PseoLocalTips
          heading={section.heading ?? 'Local Tips'}
          tips={section.tips ?? []}
        />
      );

    case 'seasonal_context':
      return <PseoSeasonalContext content={section.content ?? ''} heading={section.heading} />;

    case 'faq':
      return (
        <PseoFaq
          heading={section.heading ?? 'Frequently Asked Questions'}
          faqs={section.faqs ?? []}
        />
      );

    case 'neighborhood_profile':
      return <PseoNeighborhoodProfile content={section.content ?? ''} heading={section.heading} />;

    case 'audience_callout':
      return <PseoAudienceCallout content={section.content ?? ''} heading={section.heading} />;

    case 'map_embed':
      return (
        <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
          <PseoMapEmbed dimensions={page.dimensions} />
        </Suspense>
      );

    case 'related_pages':
      return null; // Handled separately above

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Schema.org Builder
// ---------------------------------------------------------------------------

function buildSchemaOrgData(page: PseoPageContent) {
  const schemas: object[] = [];

  // NO BreadcrumbList HERE, DELIBERATELY (WEB-SEO-008).
  //
  // SEOHead already emits one from the `breadcrumbs` prop this component passes
  // it, built from the same page.structuredData.breadcrumb and with the same
  // URLs - getCanonicalUrl is `${BRAND.baseUrl}${path}`, which is exactly what
  // SEOHead does inline. Building it again here put TWO BreadcrumbList blocks in
  // the rendered DOM of every pSEO page.
  //
  // It did not show up in the prerendered HTML, which is why it survived: the
  // prerenderer's dedupeJsonLd keeps the last block of each @type and dropped
  // SEOHead's. Measured - a full build reported exactly 16 dropped BreadcrumbList
  // blocks against exactly 16 pSEO URLs. Googlebot renders the SPA, so it saw
  // both.
  //
  // AND THE DEDUP MADE IT DANGEROUS RATHER THAN MERELY UNTIDY. dedupeJsonLd types
  // a block by its FIRST "@type", and this array is emitted as one <script>. With
  // BreadcrumbList first, the whole array was typed BreadcrumbList - so the only
  // thing that stopped the dedup discarding this page's FAQPage, ItemList and
  // everything else was that SEOHead happens to render its scripts BEFORE the
  // structuredData one. A reordering inside SEOHead would have silently deleted
  // the page's entire schema payload.

  // FAQPage
  const faqSection = page.sections.find((s) => s.type === 'faq');
  if (faqSection?.faqs?.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqSection.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }

  // ItemList (for curated picks)
  const picksSection = page.sections.find((s) => s.type === 'curated_picks');
  if (picksSection?.items?.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: page.seo.h1,
      description: page.seo.description,
      numberOfItems: picksSection.items.length,
      itemListElement: picksSection.items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        description: item.description,
      })),
    });
  }

  // WebPage
  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.seo.title,
    description: page.seo.description,
    url: getCanonicalUrl(page.slug),
    isPartOf: {
      '@type': 'WebSite',
      name: BRAND.name,
      url: BRAND.baseUrl,
    },
    about: {
      '@type': 'City',
      name: 'Des Moines',
      containedInPlace: {
        '@type': 'State',
        name: 'Iowa',
      },
    },
  });

  return schemas;
}
