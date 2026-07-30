import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Sparkles,
  SlidersHorizontal,
  Lightbulb,
  AlertTriangle,
  Calendar,
  Utensils,
  MapPin,
  Star,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { useNLPSearch, NLP_SEARCH_EXAMPLES } from "@/hooks/useNLPSearch";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";

type ResultType = "events" | "restaurants" | "attractions";

interface CardItem {
  id: string;
  title?: string;
  name?: string;
  image_url?: string;
  enhanced_description?: string;
  description?: string;
  rating?: number;
  price?: string;
  price_range?: string;
  location?: string;
  venue?: string;
  cuisine?: string;
  date?: string;
}

const typeMeta: Record<ResultType, { label: string; icon: typeof Calendar }> = {
  events: { label: "Event", icon: Calendar },
  restaurants: { label: "Restaurant", icon: Utensils },
  attractions: { label: "Place", icon: MapPin },
};

/** A single result card. Always links by id (/{type}/{id}) — never slug-based. */
function ResultCard({ item, type }: { item: CardItem; type: ResultType }) {
  const { label, icon: Icon } = typeMeta[type];
  const title = item.title || item.name || "Untitled";
  const desc = item.enhanced_description || item.description || "";
  const price = item.price || item.price_range;

  return (
    <Link to={`/${type}/${item.id}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg">
        {item.image_url && (
          <div className="relative h-40 overflow-hidden">
            <img
              src={item.image_url}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <Badge variant="secondary" className="absolute left-2 top-2 flex items-center gap-1">
              <Icon className="h-3 w-3" />
              {label}
            </Badge>
          </div>
        )}
        <CardContent className="space-y-2 p-4">
          {!item.image_url && (
            <Badge variant="secondary" className="flex w-fit items-center gap-1">
              <Icon className="h-3 w-3" />
              {label}
            </Badge>
          )}
          <h3 className="line-clamp-2 font-semibold group-hover:text-primary">{title}</h3>
          {desc && <p className="line-clamp-2 text-sm text-muted-foreground">{desc}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {(item.location || item.venue) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {item.venue || item.location}
              </span>
            )}
            {item.rating ? (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {item.rating}
              </span>
            ) : null}
            {price && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {price}
              </span>
            )}
            {item.cuisine && <span>{item.cuisine}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Keyword fallback — only mounted when the NLP function errors, so its hooks
 * don't run on the happy path. Reuses the existing list hooks' search filter.
 */
function KeywordFallbackResults({ query }: { query: string }) {
  const { events, isLoading: le } = useEvents({ search: query, limit: 12 });
  const { restaurants, isLoading: lr } = useRestaurants({ search: query, limit: 12 });
  const { attractions, isLoading: la } = useAttractions({ search: query, limit: 12 });

  const isLoading = le || lr || la;
  const items: { item: CardItem; type: ResultType }[] = [
    ...events.map((e) => ({ item: e as unknown as CardItem, type: "events" as const })),
    ...restaurants.map((r) => ({ item: r as unknown as CardItem, type: "restaurants" as const })),
    ...attractions.map((a) => ({ item: a as unknown as CardItem, type: "attractions" as const })),
  ];

  if (isLoading) return <ResultsSkeleton />;

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No keyword matches for "{query}" either. Try a different search.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ item, type }) => (
        <ResultCard key={`${type}-${item.id}`} item={item} type={type} />
      ))}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-40 w-full" />
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * NLP-driven search results page (/search). Reads ?q= from the URL, runs the
 * deployed nlp-search edge function, and renders results linked by id. Advanced
 * structured filters remain available as a refine step at /search/advanced.
 */
export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [input, setInput] = useState(query);

  const {
    search,
    results,
    parsedIntent,
    isSearching,
    isError,
    hasResults,
    totalResults,
    getIntentSummary,
  } = useNLPSearch();

  // Run the NLP search whenever the URL query changes.
  useEffect(() => {
    setInput(query);
    if (query.trim().length >= 3) {
      search(query);
    }
  }, [query, search]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    setSearchParams({ q: trimmed });
  };

  const intentSummary = getIntentSummary();
  const allItems: { item: CardItem; type: ResultType }[] = [
    ...results.events.map((e) => ({ item: e as unknown as CardItem, type: "events" as const })),
    ...results.restaurants.map((r) => ({ item: r as unknown as CardItem, type: "restaurants" as const })),
    ...results.attractions.map((a) => ({ item: a as unknown as CardItem, type: "attractions" as const })),
  ];

  return (
    <>
      <SEOHead
        title={query ? `Search: ${query} | Des Moines Insider` : "Search | Des Moines Insider"}
        description="Search events, restaurants, and attractions in Des Moines using natural language — just describe what you're looking for."
        keywords={["Des Moines search", "natural language search", "events", "restaurants", "attractions"]}
      />
      {/* WEB-SEO-005: internal search results are thin content by construction —
          every ?q= permutation is a near-duplicate assembled from pages that are
          already indexed on their own. Google explicitly discourages indexing
          them. noindex,follow so the outbound links still pass. /search was also
          removed from the prerender route list for the same reason. */}
      <NoIndexMeta />
      <div className="flex min-h-screen flex-col">
        <Header />
        {/* Plain <div>, not <main>: App.tsx already provides the single
            top-level <main id="main-content"> landmark, so a nested main here
            produced a duplicate landmark + duplicate id (WCAG 1.3.1 / 4.1.1). */}
        <div className="container mx-auto flex-1 px-4 py-8">
          {/* Search input (primary, natural-language) */}
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              <Sparkles className="h-6 w-6 text-primary" />
              Search Des Moines
            </h1>
            <p className="mb-4 text-muted-foreground">
              Describe what you're looking for in plain language — like "free things to do this weekend with kids".
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search naturally…"
                aria-label="Search"
                className="h-12 pl-11 pr-28 text-base"
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2" disabled={input.trim().length < 3}>
                Search
              </Button>
            </form>

            {/* Example chips */}
            {!query && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lightbulb className="h-4 w-4" />
                  <span>Try one of these:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {NLP_SEARCH_EXAMPLES.slice(0, 6).map((ex) => (
                    <Badge
                      key={ex}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => {
                        setInput(ex);
                        submit(ex);
                      }}
                    >
                      {ex}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Refine step */}
            <div className="mt-4">
              <Button asChild variant="outline" size="sm">
                <Link to="/search/advanced">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Refine with advanced filters
                </Link>
              </Button>
            </div>
          </div>

          {/* Results */}
          {query && (
            <div className="mt-8">
              {/* Intent summary */}
              {!isSearching && !isError && intentSummary && (
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Understood:</span>
                  <span className="font-medium">{intentSummary}</span>
                  <span className="text-muted-foreground">· {totalResults} results</span>
                </div>
              )}

              {/* Error → keyword fallback */}
              {isError && (
                <>
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>AI search is temporarily unavailable</AlertTitle>
                    <AlertDescription>
                      Showing keyword matches for "{query}" instead.
                    </AlertDescription>
                  </Alert>
                  <KeywordFallbackResults query={query} />
                </>
              )}

              {/* Loading */}
              {!isError && isSearching && <ResultsSkeleton />}

              {/* Results grid */}
              {!isError && !isSearching && hasResults && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {allItems.map(({ item, type }) => (
                    <ResultCard key={`${type}-${item.id}`} item={item} type={type} />
                  ))}
                </div>
              )}

              {/* Empty */}
              {!isError && !isSearching && parsedIntent && !hasResults && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="mb-2 text-lg font-semibold">No results for "{query}"</h3>
                    <p className="mb-6 text-muted-foreground">
                      Try rephrasing, or browse with advanced filters.
                    </p>
                    <Button asChild variant="outline">
                      <Link to="/search/advanced">
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Advanced filters
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
