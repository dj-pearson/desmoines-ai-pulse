import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNLPSearch, NLP_SEARCH_EXAMPLES } from "@/hooks/useNLPSearch";
import { Link } from "react-router-dom";
import {
  Search,
  Sparkles,
  Calendar,
  Utensils,
  MapPin,
  Loader2,
  X,
  ArrowRight,
  Clock,
  DollarSign,
  Star,
  Lightbulb,
} from "lucide-react";

interface NLPSearchBarProps {
  placeholder?: string;
  showExamples?: boolean;
  showResults?: boolean;
  className?: string;
  onResultClick?: (result: any, type: string) => void;
}

/**
 * NLP-powered search bar component
 *
 * Features natural language search powered by Claude Haiku for fast intent parsing.
 *
 * @example
 * <NLPSearchBar
 *   placeholder="Try: 'Family dinner under $50 near downtown Saturday'"
 *   showExamples
 *   showResults
 * />
 */
export function NLPSearchBar({
  placeholder = "Search naturally, like 'Free things to do this weekend with kids'",
  showExamples = true,
  showResults = true,
  className = '',
  onResultClick,
}: NLPSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    search,
    clearResults,
    results,
    parsedIntent,
    isSearching,
    hasResults,
    totalResults,
    responseTime,
    getIntentSummary,
    examples,
  } = useNLPSearch();

  // Handle search on Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim().length >= 3) {
      search(query);
    }
  };

  // Handle example click
  const handleExampleClick = (example: string) => {
    setQuery(example);
    search(example);
    inputRef.current?.focus();
  };

  // Handle clear
  const handleClear = () => {
    setQuery('');
    clearResults();
  };

  // Close results on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getResultLink = (item: any, type: string) => {
    const name = item.title || item.name;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `/${type}/${item.id}`;
  };

  const intentSummary = getIntentSummary();

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isSearching ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5 text-primary" />
          )}
        </div>
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          className="pl-11 pr-24 h-12 text-base"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => query.length >= 3 && search(query)}
            disabled={query.length < 3 || isSearching}
            className="h-8"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dropdown */}
      {isFocused && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 shadow-lg">
          <CardContent className="p-4">
            {/* Examples (when no results) */}
            {showExamples && !hasResults && !isSearching && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lightbulb className="h-4 w-4" />
                  <span>Try searching naturally:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {examples.slice(0, 6).map((example, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 transition-colors"
                      onClick={() => handleExampleClick(example)}
                    >
                      {example}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {isSearching && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm">Understanding your search...</span>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            )}

            {/* Results */}
            {showResults && hasResults && !isSearching && (
              <div className="space-y-4">
                {/* Intent Summary */}
                {intentSummary && (
                  <div className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">Understood:</span>
                    <span className="font-medium">{intentSummary}</span>
                  </div>
                )}

                {/* Results Tabs */}
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all">
                      All ({totalResults})
                    </TabsTrigger>
                    <TabsTrigger value="events" disabled={results.events.length === 0}>
                      <Calendar className="h-3 w-3 mr-1" />
                      Events ({results.events.length})
                    </TabsTrigger>
                    <TabsTrigger value="restaurants" disabled={results.restaurants.length === 0}>
                      <Utensils className="h-3 w-3 mr-1" />
                      Food ({results.restaurants.length})
                    </TabsTrigger>
                    <TabsTrigger value="attractions" disabled={results.attractions.length === 0}>
                      <MapPin className="h-3 w-3 mr-1" />
                      Places ({results.attractions.length})
                    </TabsTrigger>
                  </TabsList>

                  <ScrollArea className="h-[300px] mt-3">
                    <TabsContent value="all" className="mt-0 space-y-2">
                      {/* Events */}
                      {results.events.slice(0, 3).map((event) => (
                        <ResultItem
                          key={`event-${event.id}`}
                          item={event}
                          type="events"
                          icon={<Calendar className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                      {/* Restaurants */}
                      {results.restaurants.slice(0, 3).map((restaurant) => (
                        <ResultItem
                          key={`restaurant-${restaurant.id}`}
                          item={restaurant}
                          type="restaurants"
                          icon={<Utensils className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                      {/* Attractions */}
                      {results.attractions.slice(0, 3).map((attraction) => (
                        <ResultItem
                          key={`attraction-${attraction.id}`}
                          item={attraction}
                          type="attractions"
                          icon={<MapPin className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                    </TabsContent>

                    <TabsContent value="events" className="mt-0 space-y-2">
                      {results.events.map((event) => (
                        <ResultItem
                          key={`event-${event.id}`}
                          item={event}
                          type="events"
                          icon={<Calendar className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                    </TabsContent>

                    <TabsContent value="restaurants" className="mt-0 space-y-2">
                      {results.restaurants.map((restaurant) => (
                        <ResultItem
                          key={`restaurant-${restaurant.id}`}
                          item={restaurant}
                          type="restaurants"
                          icon={<Utensils className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                    </TabsContent>

                    <TabsContent value="attractions" className="mt-0 space-y-2">
                      {results.attractions.map((attraction) => (
                        <ResultItem
                          key={`attraction-${attraction.id}`}
                          item={attraction}
                          type="attractions"
                          icon={<MapPin className="h-4 w-4" />}
                          onClick={onResultClick}
                        />
                      ))}
                    </TabsContent>
                  </ScrollArea>
                </Tabs>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>
                    {totalResults} results in {responseTime}ms
                  </span>
                  <Link
                    to={`/search?q=${encodeURIComponent(query)}`}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    View all results
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* No Results */}
            {!isSearching && query.length >= 3 && !hasResults && parsedIntent && (
              <div className="text-center py-6">
                <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  No results found for "{query}"
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting your search or browse our categories
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Individual result item component
 */
function ResultItem({
  item,
  type,
  icon,
  onClick,
}: {
  item: any;
  type: string;
  icon: React.ReactNode;
  onClick?: (item: any, type: string) => void;
}) {
  const title = item.title || item.name;
  const description = item.enhanced_description || item.description || item.original_description || '';
  const truncatedDesc = description.length > 100 ? description.substring(0, 100) + '...' : description;

  const handleClick = () => {
    if (onClick) {
      onClick(item, type);
    }
  };

  return (
    <Link
      to={`/${type}/${item.id}`}
      onClick={handleClick}
      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
    >
      <div className="p-2 rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium line-clamp-1">{title}</h4>
          <div className="flex items-center gap-1 shrink-0">
            {item.rating && (
              <Badge variant="secondary" className="text-xs">
                <Star className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-500" />
                {item.rating}
              </Badge>
            )}
            {(item.price || item.price_range) && (
              <Badge variant="outline" className="text-xs">
                {item.price || item.price_range}
              </Badge>
            )}
          </div>
        </div>
        {truncatedDesc && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
            {truncatedDesc}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {item.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          )}
          {item.date && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(item.date).toLocaleDateString()}
            </span>
          )}
          {item.cuisine && (
            <span>{item.cuisine}</span>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
    </Link>
  );
}

export default NLPSearchBar;
