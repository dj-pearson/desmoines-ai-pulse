import { useParams, Link } from 'react-router-dom';
import { RouteCanonical } from "@/components/RouteCanonical";
import { ErrorState } from "@/components/ui/error-state";
import { Helmet } from 'react-helmet-async';
import { DetailBreadcrumb } from '@/components/seo/DetailBreadcrumb';
import { useSeasonalGuide, getSeasonLabel, getSeasonColor } from '@/hooks/useSeasonalGuides';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { BRAND } from '@/lib/brandConfig';
import SEOHead from '@/components/SEOHead';
import {
  buildSeasonalGuideJsonLd,
  guideImageUrl,
  guideMetaDescription,
  guideMetaTitle,
  guidePublishedAt,
  seasonalGuidePath,
} from '@/lib/seasonalGuideSchema';

export default function SeasonalGuide() {
  const { slug } = useParams<{ slug: string }>();
  const { data: guide, isLoading, error, refetch } = useSeasonalGuide(slug || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/guides/${slug}`} />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  /**
   * WEB-SEO-040. A FAILED LOAD AND A MISSING ROW ARE DIFFERENT ANSWERS.
   * This used to fall straight through to the not-found branch below, which
   * renders "not found" AND a noindex - so Googlebot arriving during a
   * PostgREST blip was told a real page should not be indexed. No query here
   * sets throwOnError, so RouteErrorBoundary never sees these either.
   *
   * The retry state carries NO robots meta: the page is fine, the fetch was
   * not, and saying nothing leaves whatever is already indexed alone.
   */
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={`/guides/${slug}`} />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Guide Not Found</h1>
          <Link to="/guides" className="text-primary hover:underline">Back to Guides</Link>
        </div>
      </div>
    );
  }

  const sections = guide.content?.sections || [];

  return (
    <>
      {/*
        WEB-SEO-067. SEOHead, not a hand-written Helmet: the old block had no
        og:* or twitter:* tags, so a shared guide previewed as the home page,
        and its Article node went through a bare JSON.stringify. The canonical
        still matters to the prerender gate (WEB-PERF-020): a route that does
        not declare one cannot be published as static HTML. No breadcrumbs
        prop: DetailBreadcrumb below emits the one BreadcrumbList.
      */}
      <SEOHead
        title={guideMetaTitle(guide)}
        description={guideMetaDescription(guide)}
        type="article"
        imageUrl={guideImageUrl(guide) ?? undefined}
        url={seasonalGuidePath(guide.slug)}
        canonicalUrl={`${BRAND.baseUrl}${seasonalGuidePath(guide.slug)}`}
        publishedTime={guidePublishedAt(guide) ?? undefined}
        modifiedTime={guide.updated_at || guidePublishedAt(guide) || undefined}
        structuredData={buildSeasonalGuideJsonLd(guide)}
      />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <DetailBreadcrumb
            className="mb-6"
            crumbs={[
              { name: 'Guides', path: '/guides' },
              { name: guide.title, path: `/guides/${slug}` },
            ]}
          />

          {/* Header */}
          <div className="mb-8">
            {guide.season && (
              <Badge className={`${getSeasonColor(guide.season)} mb-3`}>
                {getSeasonLabel(guide.season)}
              </Badge>
            )}
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{guide.title}</h1>
            {guide.description && (
              <p className="text-lg text-muted-foreground">{guide.description}</p>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {sections.map((section, idx) => (
              <Card key={idx}>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">{section.title}</h2>
                  <ul className="space-y-3">
                    {section.items.map((item, itemIdx) => (
                      <li key={itemIdx} className="flex items-start gap-3 text-muted-foreground">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
