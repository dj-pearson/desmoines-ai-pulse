import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AdvancedSearchFilters } from "./AdvancedSearchFilters";
import { SavedSearches } from "./SavedSearches";
import { useAdvancedSearch } from "@/hooks/useAdvancedSearch";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import Footer from "./Footer";
import SEOHead from "./SEOHead";
import {
  Search,
  MapPin,
  Star,
  Clock,
  DollarSign,
  Heart,
  Filter,
  Grid,
  List,
  ExternalLink,
  Calendar,
  Navigation2
} from "lucide-react";
import { Link } from "react-router-dom";

export default function AdvancedSearchPage() {
  const { user } = useAuth();
  const {
    filters,
    setFilters,
    results,
    savedSearches,
    loading,
    performSearch,
    saveSearch,
    loadSearch,
    deleteSearch,
    resetFilters
  } = useAdvancedSearch();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const handleSearch = () => {
    performSearch(filters);
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'event':
        return <Calendar className="h-4 w-4" />;
      case 'restaurant':
        return <DollarSign className="h-4 w-4" />;
      case 'attraction':
        return <MapPin className="h-4 w-4" />;
      case 'playground':
        return <Navigation2 className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getResultLink = (result: any) => {
    const slug = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    switch (result.type) {
      case 'event':
        return `/events/${slug}`;
      case 'restaurant':
        return `/restaurants/${slug}`;
      case 'attraction':
        return `/attractions/${slug}`;
      case 'playground':
        return `/playgrounds/${slug}`;
      default:
        return '#';
    }
  };

  const formatPrice = (price: string | undefined) => {
    if (!price) return 'Price not listed';
    if (price.toLowerCase() === 'free') return 'Free';
    return price;
  };

  return (
    <>
      <SEOHead
        title="Advanced Search - Des Moines Insider"
        description="Search and discover events, restaurants, attractions, and playgrounds in Des Moines with advanced filters and personalized recommendations."
        keywords={["Des Moines search", "events near me", "restaurants search", "attractions finder", "playground locator"]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <div className="container mx-auto px-4 py-8 space-y-8">
          {/* Page Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold">
              <span className="text-primary">Advanced Search</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Find exactly what you're looking for with intelligent filters, location-based discovery, and personalized recommendations.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Search Filters Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              <AdvancedSearchFilters
                filters={filters}
                onFiltersChange={setFilters}
                onSaveSearch={user ? saveSearch : undefined}
                onReset={resetFilters}
              />

              {user && (
                <SavedSearches
                  savedSearches={savedSearches}
                  onLoadSearch={loadSearch}
                  onDeleteSearch={deleteSearch}
                />
              )}
            </div>

            {/* Search Results */}
            <div className="lg:col-span-3 space-y-6">
              {/* Search Actions */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button onClick={handleSearch} disabled={loading} size="lg">
                        <Search className="h-4 w-4 mr-2" />
                        {loading ? 'Searching...' : 'Search'}
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        {results.length > 0 && !loading && (
                          <span>{results.length} results found</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                      >
                        <Grid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
              ) : results.length > 0 ? (
                <div className={
                  viewMode === 'grid' 
                    ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
                    : "space-y-4"
                }>
                  {results.map((result) => (
                    <Card key={result.id} className="group hover:shadow-lg transition-shadow">
                      {viewMode === 'grid' ? (
                        <>
                          {result.imageUrl && (
                            <div className="relative h-48 overflow-hidden rounded-t-lg">
                              <img
                                src={result.imageUrl}
                                alt={result.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                              <div className="absolute top-2 left-2">
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  {getContentTypeIcon(result.type)}
                                  {result.type}
                                </Badge>
                              </div>
                            </div>
                          )}
                          <CardContent className="p-4 space-y-3">
                            <div className="space-y-2">
                              <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
                                {result.title}
                              </h3>
                              {result.description && (
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                  {result.description}
                                </p>
                              )}
                            </div>

                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{result.location}</span>
                                {result.distance && (
                                  <span className="text-xs">({result.distance.toFixed(1)} mi)</span>
                                )}
                              </div>

                              {result.rating && (
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                  <span>{result.rating}</span>
                                </div>
                              )}

                              {result.price && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <DollarSign className="h-3 w-3" />
                                  <span>{formatPrice(result.price)}</span>
                                </div>
                              )}
                            </div>

                            {result.features && result.features.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.features.slice(0, 3).map((feature) => (
                                  <Badge key={feature} variant="outline" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                                {result.features.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{result.features.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            )}

                            <Link to={getResultLink(result)} className="block">
                              <Button className="w-full mt-4 group">
                                View Details
                                <ExternalLink className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                              </Button>
                            </Link>
                          </CardContent>
                        </>
                      ) : (
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {result.imageUrl && (
                              <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                                <img
                                  src={result.imageUrl}
                                  alt={result.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-start justify-between">
                                <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
                                  {result.title}
                                </h3>
                                <Badge variant="secondary" className="flex items-center gap-1 ml-2">
                                  {getContentTypeIcon(result.type)}
                                  {result.type}
                                </Badge>
                              </div>

                              {result.description && (
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                  {result.description}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  <span>{result.location}</span>
                                  {result.distance && (
                                    <span>({result.distance.toFixed(1)} mi)</span>
                                  )}
                                </div>

                                {result.rating && (
                                  <div className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                    <span>{result.rating}</span>
                                  </div>
                                )}

                                {result.price && (
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    <span>{formatPrice(result.price)}</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between">
                                {result.features && result.features.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {result.features.slice(0, 2).map((feature) => (
                                      <Badge key={feature} variant="outline" className="text-xs">
                                        {feature}
                                      </Badge>
                                    ))}
                                    {result.features.length > 2 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{result.features.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                )}

                                <Link to={getResultLink(result)}>
                                  <Button variant="outline" size="sm" className="group">
                                    View Details
                                    <ExternalLink className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
                                  </Button>
                                </Link>
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
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
                    <p className="text-muted-foreground mb-6">
                      Try adjusting your search criteria or filters to find what you're looking for.
                    </p>
                    <Button onClick={resetFilters} variant="outline">
                      <Filter className="h-4 w-4 mr-2" />
                      Clear All Filters
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