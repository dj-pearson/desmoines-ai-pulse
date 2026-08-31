import { useParams, Link } from 'react-router-dom';
import { RouteCanonical } from "@/components/RouteCanonical";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useSeasonalGuide, getSeasonLabel, getSeasonColor } from '@/hooks/useSeasonalGuides';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { BRAND } from '@/lib/brandConfig';

export default function SeasonalGuide() {
  const { slug } = useParams<{ slug: string }>();
  const { data: guide, isLoading } = useSeasonalGuide(slug || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/guides/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Footer />
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
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Guide Not Found</h1>
          <Link to="/guides" className="text-primary hover:underline">Back to Guides</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const sections = guide.content?.sections || [];

  return (
    <>
      <Helmet>
        <title>{guide.seo_title || guide.title} | Des Moines Insider</title>
        {/*
          Without this the prerender gate refuses the page: a route that does not
          declare itself cannot be published as static HTML, because there is no
          way to tell a rendered guide from the SPA shell. All four published
          guides were rejected on every build for exactly this, so /guides/:slug
          was the only sitemapped route a crawler could not read (WEB-PERF-020
          build output; the pages themselves render fine).
        */}
        <link rel="canonical" href={`${BRAND.baseUrl}/guides/${slug}`} />
        <meta name="description" content={guide.seo_description || guide.description || ''} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.description,
            datePublished: guide.publish_date,
            author: { '@type': 'Organization', name: 'Des Moines Insider' },
          })}
        </script>
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-6">
            <Link to="/guides" className="hover:text-primary">Guides</Link>
            <span className="mx-2">/</span>
            <span>{guide.title}</span>
          </nav>

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
        <Footer />
      </div>
    </>
  );
}
