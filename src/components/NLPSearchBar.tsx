import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { Search, Utensils, Loader2, X, Star, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useNLPSearch, loosenQuery, orderExamplesForHour } from "@/hooks/useNLPSearch";
import { createSlug } from "@/lib/slug";
import { createEventSlugWithCentralTime, formatEventPart, nowInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import type { Attraction, Event, Restaurant } from "@/lib/types";

type ResultType = 'events' | 'restaurants' | 'attractions';

/**
 * nlp-search returns raw rows (`select('*')`), not the camelCased shapes the
 * list hooks produce, so a few snake_case columns ride alongside the shared
 * types. Every one is optional: the edge function's projection is not a
 * contract this component can rely on.
 */
interface RawRowColumns {
  slug?: string | null;
  description?: string | null;
  price_range?: string | null;
  cuisine?: string | null;
  rating?: number | null;
  location?: string | null;
}

export type NLPResultItem = (Event | Restaurant | Attraction) & RawRowColumns;

interface NLPSearchBarProps {
  placeholder?: string;
  showExamples?: boolean;
  showResults?: boolean;
  className?: string;
  /** Classes for the input itself (the hero sizes it up). */
  inputClassName?: string;
  onResultClick?: (result: NLPResultItem, type: ResultType) => void;
}

/**
 * Where a result goes (WP1 item 3, docs/page-plans/home.md).
 *
 * This used to be `/${type}/${item.id}` for every type. The event and
 * attraction detail pages resolve a SLUG - for events a date-suffixed one - so
 * every event and attraction result was an Event Not Found. Each type now
 * builds its link the way its own list page does.
 */
function resultHref(item: NLPResultItem, type: ResultType): string {
  switch (type) {
    case 'events':
      return `/events/${createEventSlugWithCentralTime('title' in item ? item.title : null, item)}`;
    case 'attractions':
      return `/attractions/${item.slug || createSlug('name' in item ? item.name : '')}`;
    case 'restaurants':
      return `/restaurants/${item.slug || item.id}`;
  }
}

function itemTitle(item: NLPResultItem): string {
  return 'title' in item ? item.title : item.name;
}

function itemDescription(item: NLPResultItem): string {
  if ('title' in item) {
    return item.enhanced_description || item.original_description || item.description || '';
  }
  return item.description || '';
}

const searchHref = (q: string) => `/search?q=${encodeURIComponent(q)}`;

/**
 * The home page's one search box (WP1 items 4, 6, 7).
 *
 * Submitting (Enter or the button) goes to /search?q=, the page the WebSite
 * SearchAction already names as canonical. The example chips still run an
 * inline natural-language search, so a visitor can see what the box
 * understands without leaving the page; "View all" carries that query on.
 */
export function NLPSearchBar({
  placeholder = "Search naturally, like 'Free things to do this weekend with kids'",
  showExamples = true,
  showResults = true,
  className = '',
  inputClassName,
  onResultClick,
}: NLPSearchBarProps) {
  const [query, setQuery] = useState('');
  // The query the results on screen belong to. Results stay visible while the
  // visitor edits the input, dimmed and labelled, rather than silently
  // answering a question the input no longer asks.
  const [lastQuery, setLastQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const panelId = useId();
  const statusId = useId();

  const {
    search,
    clearResults,
    results,
    parsedIntent,
    isSearching,
    isError,
    hasResults,
    totalResults,
    responseTime,
    getIntentSummary,
    examples,
  } = useNLPSearch();

  // Central hour, computed once per mount: the examples describe Des Moines
  // time, not the visitor's clock.
  const orderedExamples = useMemo(
    () => orderExamplesForHour(nowInCentralTime().getHours(), examples),
    [examples],
  );

  const runInlineSearch = (q: string) => {
    setLastQuery(q);
    void search(q);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setIsFocused(false);
    navigate(searchHref(q));
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    runInlineSearch(example);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setQuery('');
    setLastQuery('');
    clearResults();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape' && isFocused) {
      e.stopPropagation();
      setIsFocused(false);
      inputRef.current?.focus();
    }
  };

  // Keyboard focus leaving the box closes the panel. A null relatedTarget is a
  // click on nothing focusable, which the outside-mousedown listener below
  // decides, so a click on the panel's own padding does not close it.
  const handleBlur = (e: FocusEvent<HTMLFormElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !containerRef.current?.contains(next)) setIsFocused(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const intentSummary = getIntentSummary();
  const hasSearched = lastQuery.length > 0;
  const isStale = hasResults && query.trim() !== lastQuery;
  const noResults = hasSearched && !isSearching && !isError && !hasResults && parsedIntent !== null;
  const showError = hasSearched && !isSearching && isError;
  const showExamplePanel = showExamples && !hasResults && !isSearching && !showError && !noResults;
  const loosened = noResults ? loosenQuery(lastQuery) : null;

  const panelOpen =
    isFocused && (showExamplePanel || isSearching || (showResults && hasResults) || showError || noResults);

  const status = isSearching
    ? 'Searching...'
    : showError
      ? 'Smart search is unavailable. Press Enter to search by keyword.'
      : noResults
        ? `No results for ${lastQuery}.`
        : hasResults
          ? `${totalResults} results for ${lastQuery}.`
          : '';

  const renderItems = (items: NLPResultItem[], type: ResultType, icon: ReactNode) =>
    items.map((item) => (
      <ResultItem
        key={`${type}-${item.id}`}
        item={item}
        type={type}
        icon={icon}
        onClick={onResultClick}
      />
    ));

  return (
    <form
      ref={containerRef}
      role="search"
      aria-label="Search Des Moines events, restaurants and places"
      className={cn('relative', className)}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {isSearching ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <SpriteIcon name="sparkles" className="h-5 w-5 text-primary" aria-hidden="true" />
          )}
        </div>
        <Input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          name="q"
          autoComplete="off"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-describedby={statusId}
          aria-label="Search events, restaurants and things to do"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className={cn(
            'h-12 pl-11 pr-28 text-base [&::-webkit-search-cancel-button]:appearance-none',
            inputClassName,
          )}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 p-0"
              onClick={handleClear}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={query.trim().length === 0}
            className="h-11 w-11 p-0"
            aria-label="Search"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p id={statusId} className="sr-only" aria-live="polite">
        {status}
      </p>

      <div id={panelId} role="region" aria-label="Search suggestions and results" hidden={!panelOpen}>
        {panelOpen && (
          <Card className="absolute left-0 right-0 top-full z-50 mt-2 text-left">
            <CardContent className="p-4">
              {showExamplePanel && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="h-4 w-4" aria-hidden="true" />
                    <span>Try searching naturally:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {orderedExamples.slice(0, 6).map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handleExampleClick(example)}
                        className="inline-flex min-h-11 items-center rounded-full bg-secondary/10 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSearching && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                    <span className="text-sm">Understanding your search...</span>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              )}

              {showResults && hasResults && !isSearching && (
                <div className={cn('space-y-4 transition-opacity', isStale && 'opacity-60')}>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      Results for "{lastQuery}"
                      {isStale && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          (press Enter to search for "{query.trim()}")
                        </span>
                      )}
                    </p>
                    {intentSummary && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <SpriteIcon name="sparkles" className="h-4 w-4 text-primary" aria-hidden="true" />
                        <span>Understood: {intentSummary}</span>
                      </p>
                    )}
                  </div>

                  <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
                      <TabsTrigger value="events" disabled={results.events.length === 0}>
                        <SpriteIcon name="calendar" className="mr-1 h-3 w-3" aria-hidden="true" />
                        Events ({results.events.length})
                      </TabsTrigger>
                      <TabsTrigger value="restaurants" disabled={results.restaurants.length === 0}>
                        <Utensils className="mr-1 h-3 w-3" aria-hidden="true" />
                        Food ({results.restaurants.length})
                      </TabsTrigger>
                      <TabsTrigger value="attractions" disabled={results.attractions.length === 0}>
                        <SpriteIcon name="map-pin" className="mr-1 h-3 w-3" aria-hidden="true" />
                        Places ({results.attractions.length})
                      </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="mt-3 h-[300px]">
                      <TabsContent value="all" className="mt-0 space-y-2">
                        {renderItems(results.events.slice(0, 3), 'events', <SpriteIcon name="calendar" className="h-4 w-4" />)}
                        {renderItems(results.restaurants.slice(0, 3), 'restaurants', <Utensils className="h-4 w-4" />)}
                        {renderItems(results.attractions.slice(0, 3), 'attractions', <SpriteIcon name="map-pin" className="h-4 w-4" />)}
                      </TabsContent>
                      <TabsContent value="events" className="mt-0 space-y-2">
                        {renderItems(results.events, 'events', <SpriteIcon name="calendar" className="h-4 w-4" />)}
                      </TabsContent>
                      <TabsContent value="restaurants" className="mt-0 space-y-2">
                        {renderItems(results.restaurants, 'restaurants', <Utensils className="h-4 w-4" />)}
                      </TabsContent>
                      <TabsContent value="attractions" className="mt-0 space-y-2">
                        {renderItems(results.attractions, 'attractions', <SpriteIcon name="map-pin" className="h-4 w-4" />)}
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>

                  <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span>
                      {totalResults} results in {responseTime}ms
                    </span>
                    <Link
                      to={searchHref(lastQuery)}
                      className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline"
                    >
                      View all results
                      <SpriteIcon name="arrow-right" className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              )}

              {showError && (
                <div className="space-y-3 py-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    Smart search is unavailable right now. You can still search by keyword.
                  </p>
                  <Link
                    to={searchHref(lastQuery)}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Search "{lastQuery}" by keyword
                  </Link>
                </div>
              )}

              {noResults && (
                <div className="space-y-2 py-4 text-center">
                  <p className="text-muted-foreground">No results for "{lastQuery}".</p>
                  <div className="flex flex-col items-center gap-1 text-sm">
                    <Link
                      to={searchHref(lastQuery)}
                      className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                    >
                      Search everything for "{lastQuery}"
                    </Link>
                    {loosened && (
                      <Link
                        to={searchHref(loosened)}
                        className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                      >
                        Try "{loosened}"
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </form>
  );
}

interface ResultItemProps {
  item: NLPResultItem;
  type: ResultType;
  icon: ReactNode;
  onClick?: (item: NLPResultItem, type: ResultType) => void;
}

function ResultItem({ item, type, icon, onClick }: ResultItemProps) {
  const title = itemTitle(item);
  const description = itemDescription(item);
  const truncatedDesc = description.length > 100 ? `${description.substring(0, 100)}...` : description;
  const price = ('title' in item ? item.price : undefined) || item.price_range;
  const eventDate = 'title' in item && item.date ? formatEventPart(item, 'MMM d, yyyy') : null;

  return (
    <Link
      to={resultHref(item, type)}
      onClick={() => onClick?.(item, type)}
      data-result-type={type}
      className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary" aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 font-medium">{title}</p>
          <div className="flex shrink-0 items-center gap-1">
            {item.rating ? (
              <Badge variant="secondary" className="text-xs">
                <Star className="mr-1 h-3 w-3 fill-yellow-500 text-yellow-500" aria-hidden="true" />
                {item.rating}
              </Badge>
            ) : null}
            {price && (
              <Badge variant="outline" className="text-xs">
                {price}
              </Badge>
            )}
          </div>
        </div>
        {truncatedDesc && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{truncatedDesc}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {item.location && (
            <span className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-3 w-3" aria-hidden="true" />
              {item.location}
            </span>
          )}
          {eventDate && (
            <span className="flex items-center gap-1">
              <SpriteIcon name="clock" className="h-3 w-3" aria-hidden="true" />
              {eventDate}
            </span>
          )}
          {item.cuisine && <span>{item.cuisine}</span>}
        </div>
      </div>
      <SpriteIcon name="arrow-right" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export default NLPSearchBar;
