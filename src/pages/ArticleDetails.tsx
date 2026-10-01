import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { formatInTimeZone } from 'date-fns-tz';
import { Eye, ArrowLeft, Tag, BookOpen } from "lucide-react";
import { RelatedLinks } from "@/components/seo/InternalLinks";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Badge } from '@/components/ui/badge';
import { AIDisclosureBadge, AIDisclosureNotice } from '@/components/AIDisclosureBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { RouteCanonical } from '@/components/RouteCanonical';
import ShareDialog from '@/components/ShareDialog';
import SpeakableSchema from '@/components/schema/SpeakableSchema';
import NoIndexMeta from '@/components/schema/NoIndexMeta';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { RelatedArticles } from '@/components/articles/RelatedArticles';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { VIEW_COUNTS_LIVE, useArticleBySlug } from '@/hooks/useArticles';
import {
  ARTICLE_HUBS,
  aiBadgeLabel,
  aiDisclosureText,
  classifyArticleHref,
  hubsForArticle,
  isAiArticle,
  isStaleArticle,
  primaryHubForArticle,
  readTimeLabel,
  wasMeaningfullyUpdated,
} from "@/lib/articleHubs";
import { ogImageUrl } from '@/lib/ogImage';
import { BRAND, getCanonicalUrl } from '@/lib/brandConfig';
import { handleError } from '@/lib/errorHandler';
import { DES_MOINES_TIME_ZONE } from '@/lib/restaurantHours';

/**
 * Dates in Central time (pass 2 WP4 item 11). toLocaleDateString used the
 * reader's zone, so an article published at 8 PM Central read as the next day
 * on the East Coast and in the UTC prerender.
 */
function formatCentral(dateString: string, pattern: string): string {
  const t = Date.parse(dateString);
  return Number.isFinite(t) ? formatInTimeZone(t, DES_MOINES_TIME_ZONE, pattern) : '';
}

const formatDate = (dateString: string) => formatCentral(dateString, 'MMMM d, yyyy');

const formatMonthYear = (dateString: string) => formatCentral(dateString, 'MMMM yyyy');

/**
 * Links inside the article body (pass 2 WP4 item 12). A site path is an
 * in-app route; another host opens in a new tab with rel="nofollow noopener",
 * because the article pipeline writes these and nobody vouches for them.
 */
const markdownComponents: Components = {
  a: ({ href, children }) => {
    const target = classifyArticleHref(href, BRAND.baseUrl);
    if (target.kind === 'internal') return <Link to={target.path}>{children}</Link>;
    if (target.kind === 'external') {
      return (
        <a href={target.href} target="_blank" rel="nofollow noopener">
          {children}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      );
    }
    return <a href={target.href}>{children}</a>;
  },
};

const ArticleDetails: React.FC = () => {
  const { slug } = useParams();
  // The canonical URL, not the browser's current address (WEB-BE-056 AC4).
  // scripts/prerender.mjs captures these pages from a headless browser pointed
  // at http://127.0.0.1:<port>, so every share link in the prerendered markup
  // carried a localhost address - a share target nobody can open.
  const canonicalUrl = getCanonicalUrl(`/articles/${slug ?? ''}`);
  // Three states, not two (Plan & Stay WP4 item 4): a missing row is "not
  // found" and noindex; a failed request is an error with Retry, and is NOT
  // told to crawlers as a missing page.
  const { data: article, isLoading, error, refetch } = useArticleBySlug(slug);

  useEffect(() => {
    if (error) handleError(error, { component: 'ArticleDetails', action: 'load', metadata: { slug } });
  }, [error, slug]);

  if (isLoading) {
    return (
      <>
        {/* SEO-028: the canonical comes from the route, so a prerender capture
            that lands mid-fetch still has one (pass 2 WP4 item 1). */}
        <RouteCanonical path={`/articles/${slug ?? ''}`} />
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8">
            <h1 className="sr-only">Loading article</h1>
            <div className="flex items-center justify-center min-h-[400px]">
              <LoadingSpinner />
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (error) {
    return (
      <>
        <NoIndexMeta />
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-16">
            <h1 className="sr-only">Article unavailable</h1>
            <ErrorState
              error={error}
              onRetry={() => { void refetch(); }}
              title="We couldn't load this article"
            />
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!article) {
    return (
      <>
        <NoIndexMeta />
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-16 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h1 className="text-2xl font-semibold mb-2">Article Not Found</h1>
            <p className="text-muted-foreground mb-8">
              The article you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link to="/articles">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Articles
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const publishedAt = article.published_at || article.created_at;
  const updated = wasMeaningfullyUpdated(publishedAt, article.updated_at);
  const disclosure = aiDisclosureText(article);
  const primaryHub = primaryHubForArticle(article);
  const currentHub = primaryHub
    ? ARTICLE_HUBS[primaryHub]
    : { href: '/things-to-do', title: 'Things to do in Des Moines' };
  const ogImage = ogImageUrl("article", article.id);

  // Article Schema for SEO
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.title,
    "description": article.excerpt || article.seo_description || '',
    // Same fallback as og:image below, so the two never disagree.
    "image": article.featured_image_url || ogImage,
    "datePublished": publishedAt,
    "dateModified": article.updated_at || article.published_at || article.created_at,
    "author": {
      "@type": "Organization",
      "name": BRAND.name,
      "url": BRAND.baseUrl
    },
    "publisher": {
      "@type": "Organization",
      "name": BRAND.name,
      "logo": {
        "@type": "ImageObject",
        "url": `${BRAND.baseUrl}${BRAND.logo}`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${BRAND.baseUrl}/articles/${article.slug}`
    },
    "articleSection": article.category || "Local News",
    "keywords": Array.isArray(article.tags) ? article.tags.join(', ') : article.tags || '',
    "wordCount": article.content ? article.content.split(/\s+/).length : 0,
    "inLanguage": "en-US",
    "about": {
      "@type": "Place",
      "name": "Des Moines, Iowa"
    }
  };

  return (
    <>
      <SEOHead
        title={article.seo_title || article.title}
        description={article.seo_description || article.excerpt || `Read ${article.title} on ${BRAND.name}`}
        keywords={article.seo_keywords || article.tags || []}
        type="article"
        imageUrl={ogImage}
        canonicalUrl={`${BRAND.baseUrl}/articles/${article.slug}`}
        publishedTime={publishedAt}
        modifiedTime={article.updated_at || publishedAt}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Articles", url: "/articles" },
          { name: article.title, url: `/articles/${article.slug}` },
        ]}
        // Serialized by toJsonLd, which escapes "</script>" in a title or
        // body the pipeline wrote (pass 2 WP4 item 2).
        structuredData={articleSchema}
      />
      <SpeakableSchema
        name={article.title}
        description={article.excerpt || article.seo_description || `Read ${article.title} on ${BRAND.name}`}
        url={`${BRAND.baseUrl}/articles/${article.slug}`}
        datePublished={publishedAt}
        dateModified={article.updated_at}
        speakableCssSelectors={["[data-speakable]", "h1", "article > p:first-of-type", ".article-content > p:first-of-type"]}
      />
      <Header />
      
      <div className="min-h-screen bg-background">
        {/* Hero Section */}
        <div className="relative">
          {/* Featured Image */}
          {article.featured_image_url && (
            <div className="relative h-64 md:h-96 lg:h-[500px] overflow-hidden">
              <OptimizedImage
                src={article.featured_image_url}
                alt={article.title}
                className="object-cover"
                containerClassName="absolute inset-0"
                priority
                sizes="(max-width: 768px) 100vw, 1024px"
              />
              <div className="absolute inset-0 bg-black/30" />
              
              {/* Back Button Overlay */}
              <div className="absolute top-4 left-4 z-10">
                <Button asChild variant="secondary" size="sm" className="backdrop-blur-sm">
                  <Link to="/articles">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Articles
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Article Header */}
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className={`py-8 ${!article.featured_image_url ? 'pt-16' : ''}`}>
                {/* Breadcrumb Navigation */}
                <Breadcrumbs
                  items={[
                    { label: "Home", href: "/" },
                    { label: "Articles", href: "/articles" },
                    { label: article.title }
                  ]}
                  className="mb-6"
                />

                {!article.featured_image_url && (
                  <Button asChild variant="ghost" size="sm" className="mb-6">
                    <Link to="/articles">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Articles
                    </Link>
                  </Button>
                )}

                {/* Article Meta */}
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <Badge variant="secondary" className="text-sm">
                    {article.category}
                  </Badge>
                  {/* AI transparency disclosure (EU AI Act Art. 50, CA AB 2013,
                      Colorado AI Act). It keyed on generated_from_suggestion_id
                      alone, which no writer sets, so the auto-published
                      pipeline articles - the ones with no human step - never
                      showed it (Plan & Stay WP4 item 1). */}
                  {isAiArticle(article) && disclosure && (
                    <AIDisclosureBadge
                      label={aiBadgeLabel(article)}
                      tooltip={disclosure}
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <SpriteIcon name="calendar" className="h-4 w-4" />
                      <span>
                        Published <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
                        {updated && article.updated_at && (
                          <>
                            {' '}/ Updated <time dateTime={article.updated_at}>{formatDate(article.updated_at)}</time>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <SpriteIcon name="clock" className="h-4 w-4" />
                      {readTimeLabel(article.content)}
                    </span>
                    {/* Hidden until counts are real (pass 2 WP4 item 3, D13). */}
                    {VIEW_COUNTS_LIVE && (
                      <span className="flex items-center gap-1">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        {article.view_count || 0} views
                      </span>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
                  {article.title}
                </h1>

                {/* Excerpt */}
                {article.excerpt && (
                  <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
                    {article.excerpt}
                  </p>
                )}

                {disclosure && (
                  <AIDisclosureNotice
                    className="mb-8"
                    title="About this article"
                  >
                    <p className="text-muted-foreground leading-snug">{disclosure}</p>
                  </AIDisclosureNotice>
                )}

                {isStaleArticle(publishedAt) && (
                  <p className="mb-8 text-sm text-muted-foreground">
                    This piece is from {formatMonthYear(publishedAt)}, so details may have
                    changed. For what&apos;s on now, see{' '}
                    <Link to={currentHub.href} className="text-primary underline-offset-4 hover:underline">
                      {currentHub.title}
                    </Link>
                    .
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 mb-8">
                  {/* Save and Like were buttons with no handler and no table
                      behind them (WP4 item 5); Share is the one real action. */}
                  <ShareDialog
                    kind="article"
                    title={article.title}
                    description={article.excerpt || article.title}
                    url={canonicalUrl}
                    trigger={
                      <Button variant="outline" size="sm" className="gap-2">
                        <SpriteIcon name="share-2" className="h-4 w-4" />
                        Share
                      </Button>
                    }
                  />
                </div>

                {/* Tags */}
                {article.tags && article.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-8">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-sm gap-1">
                        <Tag className="h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Article Content */}
        <div className="container mx-auto px-4 pb-16">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Main Content */}
              <article className="lg:col-span-8">
                <Card className="p-6 md:p-8">
                  {/* The blockquote side rule below is the one side-tab
                      finding in this file that impeccable counts and that
                      stays. CLAUDE.md's rule names cards, list items, callouts
                      and alerts; a rule down the side of a quotation is
                      typography, and it is what Tailwind Typography ships. It
                      is left in the ratchet's count rather than ignored,
                      because the only ignore the detector offers would silence
                      side-tab for this WHOLE file - and an article page is
                      where a real one is most likely to appear
                      (WEB-UX-034 AC2). */}
                  {/* article-content is what SpeakableSchema's
                      ".article-content > p:first-of-type" selector names. */}
                  <div className="article-content prose prose-lg max-w-none dark:prose-invert
                               prose-headings:font-bold prose-headings:text-foreground
                               prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                               prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                               prose-p:leading-relaxed prose-p:mb-4 prose-p:text-foreground/90
                               prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6
                               prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6
                               prose-li:mb-2 prose-li:text-foreground/90
                               prose-strong:text-foreground prose-strong:font-semibold
                               prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                               prose-img:rounded-lg prose-img:shadow-md
                               prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic
                               prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {article.content}
                    </ReactMarkdown>
                  </div>
                </Card>

                {/* Article Footer. "Found this helpful?" with Yes and Feedback
                    buttons sat here, wired to nothing (WP4 item 5). */}
                <div className="mt-8 flex flex-col gap-4 rounded-lg border bg-muted/30 p-6 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Published <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
                    {updated && article.updated_at && (
                      <>
                        {' '}/ Updated <time dateTime={article.updated_at}>{formatDate(article.updated_at)}</time>
                      </>
                    )}
                  </p>
                  <ShareDialog
                    kind="article"
                    title={article.title}
                    description={article.excerpt || article.title}
                    url={canonicalUrl}
                    trigger={
                      <Button variant="default" size="sm" className="gap-2">
                        <SpriteIcon name="share-2" className="h-4 w-4" />
                        Share Article
                      </Button>
                    }
                  />
                </div>
              </article>

              {/* Sidebar */}
              <aside className="lg:col-span-4">
                <div className="sticky top-8 space-y-6">
                  {/* SEO-015 / SEO-019. Two placeholder cards used to sit here,
                      reading "Table of contents will be generated based on
                      article headings" and "Related articles will be shown
                      here", on every article and in every crawl. This is the
                      article half of "every article links into its hub". */}
                  <Card className="p-6">
                    <RelatedLinks title="Keep exploring" variant="list" links={hubsForArticle(article)} />
                  </Card>

                  <RelatedArticles article={article} />

                  {/* The Subscribe button here had no handler. NewsletterSignup
                      is the real one, with its rate limit and double opt-in. */}
                  <Card className="p-6">
                    <h2 className="font-semibold mb-2">Get the weekly email</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Weekly updates on Des Moines events, restaurants and more.
                    </p>
                    <NewsletterSignup variant="compact" source="website" />
                  </Card>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default ArticleDetails;