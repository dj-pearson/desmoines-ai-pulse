import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Star, DollarSign, Grid, List, Navigation2 } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { AdvancedSearchFilters } from "./AdvancedSearchFilters";
import { SavedSearches } from "./SavedSearches";
import Header from "./Header";
import Footer from "./Footer";
import SEOHead from "./SEOHead";
import { useAdvancedSearch, type SavedSearch, type SearchResult } from "@/hooks/useAdvancedSearch";
import { useAuth } from "@/hooks/useAuth";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { createSlug } from "@/lib/slug";

function contentTypeIcon(type: SearchResult['type']) {
  switch (type) {
    case 'event':
      return <SpriteIcon name="calendar" className="h-4 w-4" />;
    case 'restaurant':
      return <DollarSign className="h-4 w-4" aria-hidden="true" />;
    case 'attraction':
      return <SpriteIcon name="map-pin" className="h-4 w-4" />;
    case 'playground':
      return <Navigation2 className="h-4 w-4" aria-hidden="true" />;
  }
}

/**
 * Each type links the way its own detail route resolves. Attractions and
 * playgrounds resolve by slug or createSlug(name), never by id
 * (src/lib/resolveBySlug.ts), so an id link opened Not Found.
 */
function resultLink(result: SearchResult): string {
  switch (result.type) {
    case 'event':
      // A row with no date falls back to the id, which useEventBySlug resolves.
      return result.event_start_utc || result.date
        ? `/events/${createEventSlugWithCentralTime(result.title, result)}`
        : `/events/${encodeURIComponent(result.id)}`;
    case 'restaurant':
      return `/restaurants/${result.slug || result.id}`;
    case 'attraction': {
      const slug = createSlug(result.title ?? '');
      return slug ? `/attractions/${slug}` : '/attractions';
    }
    case 'playground': {
      const slug = createSlug(result.title ?? '');
      return slug ? `/playgrounds/${slug}` : '/playgrounds';
    }
  }
}

function formatPrice(price: string | undefined) {
  if (!price) return 'Price not listed';
  if (price.toLowerCase() === 'free') return 'Free';
  return price;
}

export default function AdvancedSearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialQuery = (searchParams.get('q') ?? '').trim();

  const {
    filters,
    setFilters,
    results,
    savedSearches,
    loading,
    hasSearched,
    performSearch,
    saveSearch,
    loadSearch,
    deleteSearch,
    resetFilters
  } = useAdvancedSearch({ initialQuery });

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Arriving with ?q= means someone already asked; run it once.
  const ranInitial = useRef(false);
  useEffect(() => {
    if (ranInitial.current || !initialQuery) return;
    ranInitial.current = true;
    void performSearch(filters);
  }, [initialQuery, filters, performSearch]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void performSearch(filters);
  };

  /** Rows /events or the iOS app wrote can't fill these controls; /search can read their words. */
  const handleUseSearch = (search: SavedSearch) => {
    if (search.restorable) {
      void loadSearch(search);
      return;
    }
    navigate(search.query ? `/search?q=${encodeURIComponent(search.query)}` : '/search');
  };

  return (
    <>
      <SEOHead
        title="Advanced Search - Des Moines Insider"
        description="Search Des Moines events, restaurants, attractions and playgrounds by name, area, rating and date."
        keywords={["Des Moines search", "Des Moines events search", "Des Moines restaurants search"]}
        robots="noindex, follow"
      />

      <div className="min-h-screen bg-background">
        <Header />

        <div className="container mx-auto px-4 py-8 space-y-8">
          <div className="space-y-3 max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Advanced search</h1>
            <p className="text-lg text-muted-foreground">
              Search events, restaurants, attractions and playgrounds by name, then narrow by area, rating and date.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Search Filters Sidebar */}
            <aside aria-label="Search filters" className="lg:col-span-1 space-y-6 order-2 lg:order-1">
              <AdvancedSearchFilters
                filters={filters}
                onFiltersChange={setFilters}
                onSaveSearch={user ? saveSearch : undefined}
                onReset={resetFilters}
              />

              {user && (
                <SavedSearches
                  savedSearches={savedSearches}
                  onLoadSearch={handleUseSearch}
                  onDeleteSearch={deleteSearch}
                />
              )}
            </aside>

            {/* Search Results */}
            <div className="lg:col-span-3 space-y-6 order-1 lg:order-2">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <form role="search" onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                    <label htmlFor="advanced-search-query" className="sr-only">
                      Search
                    </label>
                    <Input
                      id="advanced-search-query"
                      type="search"
                      name="q"
                      value={filters.query}
                      onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                      placeholder="Jazz, tacos, Ankeny..."
                      autoComplete="off"
                      enterKeyHint="search"
                      className="flex-1 h-11"
                    />
                    <Button type="submit" disabled={loading} size="lg" className="h-11">
                      <Search className="h-4 w-4 mr-2" aria-hidden="true" />
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                  </form>

                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {hasSearched && !loading && results.length > 0
                        ? `Showing ${results.length} ${results.length === 1 ? 'result' : 'results'}`
                        : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        size="sm"
                        aria-label="Grid view"
                        aria-pressed={viewMode === 'grid'}
                        onClick={() => setViewMode('grid')}
                      >
                        <Grid className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        size="sm"
                        aria-label="List view"
                        aria-pressed={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                      >
                        <List className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <div className="h-48 bg-muted rounded-t-lg" />
                      <CardContent className="p-4 space-y-3">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : !hasSearched ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-2">
                    <h2 className="text-lg font-semibold">Start with a word or two</h2>
                    <p className="text-muted-foreground max-w-prose mx-auto">
                      Type a name, a venue or a kind of food above and press Search. Leave it blank to browse everything the filters allow.
                    </p>
                  </CardContent>
                </Card>
              ) : results.length > 0 ? (
                <div className={
                  viewMode === 'grid'
                    ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                    : "space-y-4"
                }>
                  {results.map((result) => (
                    <Card key={`${result.type}-${result.id}`} className="group">
                      {viewMode === 'grid' ? (
                        <>
                          {result.imageUrl && (
                            <div className="relative h-48 overflow-hidden rounded-t-lg">
                              <img
                                src={result.imageUrl}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <CardContent className="p-4 space-y-3">
                            <div className="space-y-2">
                              <Badge variant="secondary" className="flex w-fit items-center gap-1 capitalize">
                                {contentTypeIcon(result.type)}
                                {result.type}
                              </Badge>
                              <h3 className="font-semibold text-lg line-clamp-2">
                                <Link to={resultLink(result)} className="hover:text-primary focus-visible:underline">
                                  {result.title}
                                </Link>
                              </h3>
                              {result.description && (
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                  {result.description}
                                </p>
                              )}
                            </div>

                            <div className="space-y-2 text-sm">
                              {result.location && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <SpriteIcon name="map-pin" className="h-3 w-3" />
                                  <span className="truncate">{result.location}</span>
                                </div>
                              )}

                              {result.rating ? (
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                                  <span>{result.rating}</span>
                                </div>
                              ) : null}

                              {result.price && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <DollarSign className="h-3 w-3" aria-hidden="true" />
                                  <span>{formatPrice(result.price)}</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </>
                      ) : (
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {result.imageUrl && (
                              <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                                <img
                                  src={result.imageUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-semibold text-lg line-clamp-1">
                                  <Link to={resultLink(result)} className="hover:text-primary focus-visible:underline">
                                    {result.title}
                                  </Link>
                                </h3>
                                <Badge variant="secondary" className="flex items-center gap-1 capitalize shrink-0">
                                  {contentTypeIcon(result.type)}
                                  {result.type}
                                </Badge>
                              </div>

                              {result.description && (
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                  {result.description}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                {result.location && (
                                  <div className="flex items-center gap-1">
                                    <SpriteIcon name="map-pin" className="h-3 w-3" />
                                    <span>{result.location}</span>
                                  </div>
                                )}

                                {result.rating ? (
                                  <div className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                                    <span>{result.rating}</span>
                                  </div>
                                ) : null}

                                {result.price && (
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" aria-hidden="true" />
                                    <span>{formatPrice(result.price)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center space-y-4">
                    <h2 className="text-lg font-semibold">Nothing matched</h2>
                    <p className="text-muted-foreground max-w-prose mx-auto">
                      Try fewer words, or clear a filter.
                    </p>
                    <Button onClick={resetFilters} variant="outline">
                      Clear all filters
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
