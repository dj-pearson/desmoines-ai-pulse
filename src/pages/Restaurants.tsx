import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";
import {
  RestaurantFilters,
  RestaurantFilterOptions,
} from "@/components/RestaurantFilters";
import {
  useRestaurants,
  useRestaurantFilterOptions,
} from "@/hooks/useRestaurants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton, StatsGridSkeleton } from "@/components/ui/loading-skeleton";
import {
  MapPin,
  Star,
  DollarSign,
  ChefHat,
  Search,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function Restaurants() {
  const [filters, setFilters] = useState<RestaurantFilterOptions>({
    search: "",
    cuisine: [],
    priceRange: [],
    rating: [0, 5],
    location: [],
    sortBy: "popularity",
    featuredOnly: false,
    openNow: false,
    tags: [],
  });
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  const { restaurants, isLoading, error, totalCount } = useRestaurants(filters);
  const filterOptions = useRestaurantFilterOptions();

  const handleSearchChange = (value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: "",
      cuisine: [],
      priceRange: [],
      rating: [0, 5],
      location: [],
      sortBy: "popularity",
      featuredOnly: false,
      openNow: false,
      tags: [],
    });
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  // Enhanced SEO data for restaurants page
  const restaurantsKeywords = [
    "Des Moines restaurants",
    "Iowa dining",
    "restaurant reviews",
    "local restaurants",
    "Des Moines food",
    "restaurant guide",
    "dining guide",
    "new restaurants",
    "restaurant openings",
    "best restaurants Des Moines",
  ];

  const restaurantsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Des Moines Restaurants",
    description: "Comprehensive guide to restaurants in Des Moines, Iowa",
    numberOfItems: totalCount || restaurants.length,
    itemListElement: restaurants.slice(0, 10).map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Restaurant",
        name: restaurant.name,
        description: restaurant.description,
        servesCuisine: restaurant.cuisine,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Des Moines",
          addressRegion: "Iowa",
          addressCountry: "US",
        },
        aggregateRating: restaurant.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: restaurant.rating,
              ratingCount: "100",
            }
          : undefined,
      },
    })),
  };

  return (
    <>
      <SEOHead
        title="Des Moines Restaurants - Complete Dining Guide & New Openings"
        description="Discover the best restaurants in Des Moines, Iowa. Find new openings, read reviews, and explore diverse cuisines with our comprehensive dining guide featuring 200+ local restaurants."
        type="website"
        keywords={restaurantsKeywords}
        structuredData={restaurantsSchema}
        url="/restaurants"
      />
      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section with DMI Brand Colors */}
        <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
              Discover Des Moines Dining
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
              Find the best restaurants, local favorites, and new dining
              experiences in the capital city
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Search restaurants..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  />
                </div>
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </div>
            </div>
          </div>
        </section>

        <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
          {/* Mobile-Optimized Content */}
          <div className="space-y-8">
            {/* Restaurant Openings Section */}
            <RestaurantOpenings />

            {/* Advanced Filters */}
            {showFilters && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border">
                <RestaurantFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableCuisines={filterOptions.cuisines}
                  availableLocations={filterOptions.locations}
                  availableTags={filterOptions.tags}
                  totalResults={totalCount}
                  isLoading={isLoading}
                />
                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={handleClearFilters}>
                    Clear Filters
                  </Button>
                  <div className="text-sm text-gray-500">
                    {totalCount || 0} restaurants found
                  </div>
                </div>
              </div>
            )}

            {/* All Restaurants Section */}
            <div className="space-y-4 md:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
                <h2 className="text-mobile-title md:text-2xl font-bold">
                  All Restaurants
                </h2>
                <p className="text-mobile-caption md:text-sm text-muted-foreground">
                  {filters.sortBy === "popularity"
                    ? "Sorted by AI popularity ranking"
                    : filters.sortBy === "rating"
                    ? "Sorted by highest ratings"
                    : filters.sortBy === "newest"
                    ? "Newest restaurants first"
                    : filters.sortBy === "alphabetical"
                    ? "Listed alphabetically"
                    : filters.sortBy === "price_low"
                    ? "Most affordable first"
                    : "Premium options first"}
                </p>
              </div>

              {isLoading ? (
                <CardsGridSkeleton count={9} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" />
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Error loading restaurants. Please try again later.
                  </p>
                </div>
              ) : restaurants.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">
                    {filters.search ||
                    filters.cuisine.length > 0 ||
                    filters.priceRange.length > 0 ||
                    filters.location.length > 0
                      ? "No restaurants match your current filters. Try adjusting your search criteria."
                      : "No restaurants found."}
                  </p>
                  {(filters.search ||
                    filters.cuisine.length > 0 ||
                    filters.priceRange.length > 0 ||
                    filters.location.length > 0) && (
                    <button
                      onClick={handleClearFilters}
                      className="text-primary hover:underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {restaurants.map((restaurant) => (
                    <Link
                      key={restaurant.id}
                      to={`/restaurants/${restaurant.slug || restaurant.id}`}
                      className="block hover:scale-105 transition-transform duration-200"
                    >
                      <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg leading-tight line-clamp-2">
                              {restaurant.name}
                            </CardTitle>
                            {restaurant.is_featured && (
                              <Badge className="shrink-0 bg-[#DC143C] text-white hover:bg-[#DC143C]/90">
                                Featured
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {restaurant.cuisine && (
                              <div className="flex items-center gap-1">
                                <ChefHat className="h-4 w-4" />
                                <span className="line-clamp-1">
                                  {restaurant.cuisine}
                                </span>
                              </div>
                            )}
                            {restaurant.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span>{restaurant.rating}</span>
                              </div>
                            )}
                            {restaurant.price_range && (
                               <div className="flex items-center gap-1">
                                 <DollarSign className="h-4 w-4" />
                                 <span className="font-medium text-green-600">
                                   {restaurant.price_range}
                                 </span>
                               </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <CardDescription className="line-clamp-3 mb-3">
                            {restaurant.description}
                          </CardDescription>
                          {restaurant.location && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              📍 {restaurant.location}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
