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
import { PseoAreaGuide } from './sections/PseoAreaGuide';
import { PseoBreadcrumbs } from './PseoBreadcrumbs';
import { HubArticles } from '@/components/seo/HubArticles';
import { areaHubForPageDimensions } from '@/lib/areaHubs';
import { AREA_GUIDE_SLUGS, areaGuideDescription, areaGuideIntro, boundaryForLocation } from '../areaGuide';
import { buildTimeRelativePage } from '../timeRelative';

const PseoMapEmbed = lazy(() => import('./sections/PseoMapEmbed'));

interface PseoPageProps {
  page: PseoPageContent;
}

export function PseoPage({ page: storedPage }: PseoPageProps) {
  const page = asTimeRelative(asAreaGuide(storedPage));
  const { seo, sections, relatedPages, structuredData } = page;

  // Build structured data for Schema.org
  const schemaData = buildSchemaOrgData(page);
  const { key: areaKey, name: areaName } = areaHubForPageDimensions(page.dimensions) ?? {};

  return (
    <>
      <SEOHead
        title={seo.title}
        description={seo.description}
        url={seo.canonicalUrl}
        keywords={seo.keywords}
        canonicalUrl={getCanonicalUrl(canonicalPath(page))}
        robots={seo.robots === 'noindex, follow' ? 'noindex, follow' : undefined}
        breadcrumbs={structuredData.breadcrumb}
        structuredData={schemaData}
      />

      <Header />

      <div className="min-h-screen bg-background">
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

          {/* SEO-044: an area page lists the articles that name its area,
              which link back to it. Renders nothing when none match. */}
          {areaKey && <HubArticles area={areaKey} title={`${areaName} guides`} />}

          {/* Related Pages (always last) */}
          {relatedPages.length > 0 && (
            <PseoRelatedPages pages={relatedPages} />
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}

/**
 * SEO-064. The page's own slug, unless the row names another site path as its
 * canonical: the duplicates src/pseo/duplicateRule.ts holds at noindex point
 * at their parent page. Only a root-relative path is honoured, so a stray
 * absolute or malformed value falls back to the self-canonical.
 */
function canonicalPath(page: PseoPageContent): string {
  const stored = page.seo.canonicalUrl;
  return stored && /^\/[a-z0-9/-]*$/.test(stored) ? stored : page.slug;
}

/**
 * SEO-040. A page in AREA_GUIDE_SLUGS renders a two-sentence intro and the
 * data-built area guide in place of its stored LLM sections, and describes
 * itself accordingly. Any other page, or one whose location has no polygon,
 * is returned unchanged.
 */
function asAreaGuide(page: PseoPageContent): PseoPageContent {
  if (!AREA_GUIDE_SLUGS.has(page.slug)) return page;
  const location = page.dimensions.find((d) => d.dimension === 'location');
  const boundary = boundaryForLocation(location?.slug);
  if (!boundary) return page;
  return {
    ...page,
    seo: { ...page.seo, description: areaGuideDescription(boundary) },
    sections: [
      { id: 'hero_intro', type: 'hero_intro', content: areaGuideIntro(boundary) },
      { id: 'area_guide', type: 'area_guide' },
    ],
  };
}

/**
 * SEO-056. A page with a temporal dimension (today, this weekend, a month, a
 * season) renders the evergreen copy from src/pseo/timeRelative.ts and the
 * live listing, whatever its stored sections say. The rows were rewritten with
 * the same builder; doing it here as well means a regenerated row cannot put
 * "March 17th in Des Moines" back into the prerendered HTML.
 */
function asTimeRelative(page: PseoPageContent): PseoPageContent {
  const built = buildTimeRelativePage(page.dimensions);
  if (!built) return page;
  return {
    ...page,
    seo: { ...page.seo, ...built.seo },
    sections: built.sections,
    structuredData: {
      ...page.structuredData,
      breadcrumb: [...built.breadcrumb, { name: built.seo.h1, url: page.slug }],
      faqItems: built.faqs,
    },
  };
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
          heading={section.heading}
          emptyHref={section.emptyHref}
          emptyLabel={section.emptyLabel}
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

    case 'area_guide':
      return <PseoAreaGuide dimensions={page.dimensions} />;

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
