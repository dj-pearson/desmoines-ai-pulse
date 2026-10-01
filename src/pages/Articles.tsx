import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Search, Filter, Tag, BookOpen, Grid, List } from "lucide-react";
import { CardsGridSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { FAQSection } from '@/components/FAQSection';
import { BackToTop } from '@/components/BackToTop';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useUrlFilters } from '@/hooks/useUrlFilters';
import NoIndexMeta from '@/components/schema/NoIndexMeta';
import { OptimizedImage } from "@/components/OptimizedImage";
import {
  VIEW_COUNTS_LIVE,
  effectiveArticleSort,
  usePublishedArticleCategories,
  usePublishedArticles,
} from '@/hooks/useArticles';
import { aiBadgeLabel, isAiArticle } from '@/lib/articleHubs';
import { handleError } from '@/lib/errorHandler';
import { DES_MOINES_TIME_ZONE } from '@/lib/restaurantHours';

/** Cards that get the entrance animation; the rest appear without a delay. */
const STAGGERED_CARDS = 6;

const FILTERS_PANEL_ID = 'articles-filters';

/** Publish dates in Central time, not the reader's zone (pass 2 WP4 item 11). */
function formatDate(dateString: string | null | undefined): string {
  const t = Date.parse(dateString ?? '');
  return Number.isFinite(t) ? formatInTimeZone(t, DES_MOINES_TIME_ZONE, 'MMMM d, yyyy') : '';
}

const Articles: React.FC = () => {
  // URL-synced filters (WEB-UX-035). These were local React state, so a
  // filtered view could not be shared or bookmarked, and reading an article
  // and pressing Back returned to an unfiltered list. viewMode and showFilters
  // stay local: they are chrome, not a description of what is being shown.
  const { getStr, setParam } = useUrlFilters();
  const urlSearch = getStr('q', '');
  const selectedCategory = getStr('category', 'all');
  // ?sort=popular still parses (old links), but reads as newest while view
  // counts are off, and the Select shows what the list is actually sorted by.
  const sortBy = effectiveArticleSort(getStr('sort', 'newest'));

  const setSelectedCategory = (v: string) => setParam('category', v, { def: 'all' });
  const setSortBy = (v: string) => setParam('sort', v, { def: 'newest' });

  // Local immediate input, mirrored to the URL debounced with replace so
  // typing does not stack a history entry per keystroke.
  const [searchQuery, setSearchQuery] = useState(() => urlSearch);
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(true); // Show filters by default

  useEffect(() => {
    if (searchQuery === urlSearch) return;
    const timer = setTimeout(
      () => setParam('q', searchQuery, { def: '', replace: true }),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchQuery, urlSearch, setParam]);

  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);

  // One request per page of 12, published only, filtered and sorted on the
  // server, and never the article body (Plan & Stay WP4 items 2 and 3). The
  // mount effect that called loadArticles('all') is gone: it flipped the query
  // key and refetched every article, drafts included, with its full content.
  const {
    data,
    isLoading: loading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePublishedArticles({ search: urlSearch, category: selectedCategory, sort: sortBy });

  const articles = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const total = data?.pages[0]?.total ?? articles.length;

  // Every published category from one lean query (pass 2 WP4 item 5), plus the
  // selected one so an active filter never disappears from its own dropdown.
  // Until that query answers, the loaded rows stand in.
  const { data: allCategories } = usePublishedArticleCategories();
  const categories = useMemo(() => {
    const set = new Set<string>(allCategories ?? articles.map((a) => a.category).filter(Boolean));
    if (selectedCategory !== 'all') set.add(selectedCategory);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [allCategories, articles, selectedCategory]);

  // No separate loading return. It was an early return above the page's own
  // <h1>, so a slow response left the document with an sr-only stand-in and no
  // search box at all - the reader could not start typing until the articles
  // they were waiting for had arrived. The skeleton moved down into the grid,
  // which is the only part that has nothing to show yet. WEB-CI-028 AC2.

  // A failed first page no longer replaces the page (pass 2 WP4 item 11): the
  // header, search and filters stay, so the reader can change what they asked
  // for, and the error sits where the cards would. A failed "Load more" keeps
  // the rows already on screen (TanStack keeps `data` and sets `error`).
  const listFailed = Boolean(error) && articles.length === 0;

  useEffect(() => {
    if (error) {
      handleError(error, {
        component: 'Articles',
        action: 'load',
        metadata: { search: urlSearch, category: selectedCategory, sort: sortBy },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per failure, not per filter keystroke
  }, [error]);

  return (
    <>
      {/* A transient failure must not be indexed (WEB-A11Y-002). */}
      {listFailed && <NoIndexMeta />}
      <SEOHead
        title="Articles & Insights | Des Moines Insider"
        description="Articles about Des Moines events, attractions, dining and local things to do, each linked to what's on now."
        keywords={['Des Moines articles', 'local insights', 'events guide', 'attractions', 'dining']}
      />
      <Header />
      <div className="min-h-screen bg-background">
        {/* Plain header: the gradient band and the three stat tiles (article
            count, category count, average views) are gone (WP4 item 9). */}
        <div className="border-b">
          <div className="container mx-auto px-4 py-10 md:py-12">
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                Des Moines Stories & Insights
              </h1>
              <p className="text-lg text-muted-foreground">
                Guides and local stories about events, food and places to go in Des Moines. Each one links to what's on now.
              </p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Home", href: "/" },
              { label: "Articles" },
            ]}
          />

          {/* Search and Filter Controls */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-2xl">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search articles, tags, or topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base"
                  aria-label="Search articles"
                  role="searchbox"
                />
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                  aria-expanded={showFilters}
                  aria-controls={FILTERS_PANEL_ID}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>

                {/* View Mode Toggle */}
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-r-none"
                    aria-label="Grid view"
                    aria-pressed={viewMode === 'grid'}
                    title="Grid view"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-l-none"
                    aria-label="List view"
                    aria-pressed={viewMode === 'list'}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Expandable Filters */}
            {showFilters && (
              <div id={FILTERS_PANEL_ID} className="mt-4 p-4 bg-muted/30 rounded-lg border animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="articles-category" className="text-sm font-medium mb-2 block">Category</label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger id="articles-category">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="articles-sort" className="text-sm font-medium mb-2 block">Sort By</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger id="articles-sort">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        {/* Only once views are counted (pass 2 WP4 item 3, D13). */}
                        {VIEW_COUNTS_LIVE && <SelectItem value="popular">Most Popular</SelectItem>}
                        <SelectItem value="title">Alphabetical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setSortBy('newest');
                      }}
                      className="w-full"
                    >
                      Clear Filters
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <h2 className="text-2xl font-semibold mb-2">
            {selectedCategory !== 'all' ? selectedCategory : 'All articles'}
          </h2>

          {/* Results Info */}
          <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
            <span aria-live="polite">
              {listFailed
                ? ''
                : loading
                ? 'Loading articles...'
                : urlSearch || selectedCategory !== 'all'
                  ? `Found ${total} article${total !== 1 ? 's' : ''}${urlSearch ? ` for "${urlSearch}"` : ''}`
                  : `${total} article${total !== 1 ? 's' : ''} published`}
            </span>
            {selectedCategory !== 'all' && (
              <Badge variant="outline" className="gap-1">
                <Tag className="h-3 w-3" />
                {selectedCategory}
              </Badge>
            )}
          </div>

          {/* Articles Grid/List */}
          {listFailed ? (
            <ErrorState error={error} onRetry={() => { void refetch(); }} />
          ) : loading ? (
            <CardsGridSkeleton count={6} label="Loading articles..." />
          ) : articles.length === 0 ? (
            (urlSearch || selectedCategory !== 'all') ? (
              <EmptyState
                icon={BookOpen}
                title="No articles found"
                description="Try adjusting your search criteria or browse all articles."
                actions={[
                  {
                    label: 'Clear Filters',
                    variant: 'outline',
                    onClick: () => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    },
                  },
                ]}
              />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No articles published yet"
                description="No articles have been published yet. Check back soon!"
              />
            )
          ) : (
            <div className={
              viewMode === 'grid' 
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
                : "space-y-6"
            }>
              {articles.map((article, index) => (
                <Card
                  key={article.id}
                  // Only the first six animate in; a stagger across a page of
                  // 12 (and every "Load more" after it) left later cards
                  // invisible for over half a second.
                  className={`group relative hover:shadow-lg transition-all duration-300 hover-scale ${
                    index < STAGGERED_CARDS ? 'animate-fade-in' : ''
                  } ${
                    viewMode === 'list' ? 'flex flex-col md:flex-row overflow-hidden' : 'overflow-hidden'
                  }`}
                  style={index < STAGGERED_CARDS ? { animationDelay: `${index * 50}ms` } : undefined}
                >
                  {article.featured_image_url && (
                    <div className={`overflow-hidden ${
                      viewMode === 'list' ? 'md:w-64 md:flex-shrink-0' : 'aspect-video'
                    }`}>
                      <OptimizedImage
                        src={article.featured_image_url}
                        alt=""
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        // The height lived on the img, and in list mode the
                        // wrapper above sets none (it only fixes a width), so
                        // both variants move onto the component's container.
                        containerClassName={`w-full ${
                          viewMode === 'list' ? 'h-48 md:h-full' : 'h-full'
                        }`}
                        // The first row of a three-column grid. Chrome does not start a lazy
                        // image's fetch until layout has run, so the LCP candidate on a listing
                        // page must not be lazy (WEB-SEO-032).
                        priority={index < 3}
                        sizes={viewMode === 'list' ? '(max-width: 768px) 100vw, 256px' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
                      />
                    </div>
                  )}

                  <div className="p-6 flex-1">
                    {/* Category and AI disclosure. Read time is gone from the
                        card until articles.word_count is confirmed in
                        production: the only way to compute it was to ship
                        every article body to the list. */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge variant="secondary" className="text-xs">
                        {article.category}
                      </Badge>
                      {/* A short label on the card; the full disclosure is on
                          the article page (pass 2 WP4 item 4). */}
                      {isAiArticle(article) && (
                        <Badge
                          variant="outline"
                          role="note"
                          aria-label={aiBadgeLabel(article)}
                          className="gap-1 border-primary/30 bg-primary/10 text-xs text-primary"
                        >
                          <SpriteIcon name="sparkles" className="h-3 w-3" aria-hidden="true" />
                          {aiBadgeLabel(article)}
                        </Badge>
                      )}
                      {VIEW_COUNTS_LIVE && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" aria-hidden="true" />
                          {article.view_count || 0}
                        </span>
                      )}
                    </div>

                    {/* The link is the title, and its ::after covers the card,
                        so the whole card is clickable while the link's name is
                        just the title (pass 2 WP4 item 9). */}
                    <CardTitle className="mb-3 line-clamp-2">
                      <Link
                        to={`/articles/${article.slug}`}
                        className="transition-colors hover:text-primary after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background"
                      >
                        {article.title}
                      </Link>
                    </CardTitle>

                    {/* Excerpt */}
                    {article.excerpt && (
                      <CardDescription className="line-clamp-3 mb-4">
                        {article.excerpt}
                      </CardDescription>
                    )}

                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {article.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{article.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <SpriteIcon name="calendar" className="h-3 w-3" />
                        <time dateTime={article.published_at || article.created_at}>
                          {formatDate(article.published_at || article.created_at)}
                        </time>
                      </div>

                      <span className="text-primary font-medium group-hover:underline" aria-hidden="true">
                        Read more
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* "Explore More Topics" was here with no handler. This one loads
              the next 12. */}
          {hasNextPage && articles.length > 0 && (
            <div className="text-center mt-12">
              <Button
                variant="outline"
                size="lg"
                onClick={() => { void fetchNextPage(); }}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : `Load more (${articles.length} of ${total})`}
              </Button>
              {error && !isFetchingNextPage && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  Couldn't load more articles. Try again.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Articles & Blog - Frequently Asked Questions"
            description="Common questions about Des Moines Insider articles, local news, and community content."
            // Four answers the page can back up (WP4 item 6). The old eight
            // were emitted as FAQPage schema and claimed fixed categories, AI
            // related-article suggestions, maps, video and fact-checking.
            faqs={[
              {
                question: "What do Des Moines Insider articles cover?",
                answer: "Guides and local stories about Des Moines events, restaurants, attractions and things to do. Each article links to the matching listings on this site, so a guide leads to what's on now."
              },
              {
                question: "Are the articles free to read?",
                answer: "Yes. Every published article is free to read, with no account and no paywall."
              },
              {
                question: "Is AI used to write the articles?",
                answer: "Some of them. Articles written by AI and published automatically after quality checks carry an \"AI-written\" label and a note saying no editor reviewed them. Articles drafted by AI and then published by a person on our team carry an \"AI-assisted\" label. Either way, check dates, prices and hours with the venue before you rely on them."
              },
              {
                question: "How current is the information in an article?",
                answer: "Each article shows the date it was published, and the date it was updated when that was more than a day later. Articles older than six months carry a note pointing to the current listings, because hours, prices and dates change."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />
      <BackToTop />
    </>
  );
};

export default Articles;