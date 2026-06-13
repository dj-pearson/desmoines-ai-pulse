import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";
import SEOHead from "@/components/SEOHead";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";
import {
  type RestaurantFilterOptions,
} from "@/components/RestaurantFilters";
import { RestaurantSmartPresets } from "@/components/RestaurantSmartPresets";
import { RestaurantInlineFilters } from "@/components/RestaurantInlineFilters";
import {
  useRestaurants,
  useRestaurantFilterOptions,
  useCuisineCounts,
} from "@/hooks/useRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton, LoadingSpinner } from "@/components/ui/loading-skeleton";
import {
  Star,
  DollarSign,
  ChefHat,
  Search,
  SearchX,
  Utensils,
  X,
  Sparkles,
  Clock,
  List,
  Map,
  SlidersHorizontal,
  TrendingUp,
  ArrowRight,
  Leaf,
  ChevronDown,
  Shuffle,
} from "lucide-react";
import { useState, lazy, Suspense, useMemo, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { useAnnounce } from "@/hooks/use-announce";
import { OpenNowBanner } from "@/components/OpenNowBanner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useIsMobile } from "@/hooks/use-mobile";
import RestaurantCard from "@/components/RestaurantCard";
import { SearchAutocomplete, addRecentSearch } from "@/components/SearchAutocomplete";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Lazy load map component to prevent react-leaflet bundling issues
const RestaurantsMap = lazy(() => import("@/components/RestaurantsMap"));


const sortOptions = [
  { value: "popularity", label: "Most Popular", icon: TrendingUp },
  { value: "rating", label: "Highest Rated", icon: Star },
  { value: "newest", label: "Newest", icon: Clock },
  { value: "alphabetical", label: "A-Z", icon: SlidersHorizontal },
  { value: "price_low", label: "Price: Low-High", icon: DollarSign },
  { value: "price_high", label: "Price: High-Low", icon: DollarSign },
];

export default function Restaurants() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [searchInput, setSearchInput] = useState("");
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 30;
  const [page, setPage] = useState(1);

  const { restaurants, isLoading, error, totalCount, refetch } = useRestaurants(filters);
  const filterOptions = useRestaurantFilterOptions();
  const { cuisineCounts } = useCuisineCounts();
  const { announce, announcement, regionProps } = useAnnounce();

  const handleSurpriseMe = useCallback(() => {
    if (!restaurants || restaurants.length === 0) return;
    const random = restaurants[Math.floor(Math.random() * restaurants.length)];
    navigate(`/restaurants/${random.slug || random.id}`);
  }, [restaurants, navigate]);

  // Paginate restaurants
  const totalPages = Math.ceil((restaurants?.length || 0) / ITEMS_PER_PAGE);
  const paginatedRestaurants = useMemo(() => {
    if (isMobile) {
      // Mobile: show all up to current page (load more pattern)
      return restaurants.slice(0, page * ITEMS_PER_PAGE);
    }
    // Desktop: show current page only
    const start = (page - 1) * ITEMS_PER_PAGE;
    return restaurants.slice(start, start + ITEMS_PER_PAGE);
  }, [restaurants, page, isMobile]);

  const hasMorePages = isMobile
    ? page * ITEMS_PER_PAGE < restaurants.length
    : page < totalPages;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters((prev) => ({ ...prev, search: searchInput }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search]);

  // Announce result count to screen readers
  useEffect(() => {
    if (!isLoading && restaurants) {
      const count = restaurants.length;
      const context = filters.search ? ` matching "${filters.search}"` : '';
      announce(`Found ${count} restaurant${count !== 1 ? 's' : ''}${context}`);
    }
  }, [restaurants?.length, isLoading, filters.search, announce]);

  const handleClearFilters = useCallback(() => {
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
    setSearchInput("");
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  }, [toast]);

  const getActiveFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    count += filters.cuisine.length;
    count += filters.priceRange.length;
    count += filters.location.length;
    count += filters.tags.length;
    if (filters.featuredOnly) count++;
    if (filters.openNow) count++;
    if (filters.rating[0] !== 0 || filters.rating[1] !== 5) count++;
    return count;
  }, [filters]);

  const hasActiveFilters = getActiveFiltersCount > 0;

  // Split restaurants for featured section
  const featuredRestaurants = useMemo(
    () => restaurants.filter((r) => r.is_featured).slice(0, 3),
    [restaurants]
  );

  // SEO data
  const restaurantsKeywords = [
    "Des Moines restaurants",
    "best restaurants Des Moines",
    "Des Moines dining guide",
    "restaurants near me Des Moines",
    "where to eat Des Moines Iowa",
    "Des Moines food",
    "Iowa restaurants",
    "Des Moines restaurant reviews",
    "new restaurants Des Moines",
    "Des Moines restaurant openings",
    "best food Des Moines",
    "downtown Des Moines restaurants",
    "West Des Moines restaurants",
    "East Village restaurants Des Moines",
    "cheap eats Des Moines",
    "fine dining Des Moines",
    "family restaurants Des Moines",
    "Des Moines brunch",
    "late night food Des Moines",
  ];

  const restaurantsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Best Restaurants in Des Moines, Iowa",
    description:
      "Complete guide to the best restaurants in Des Moines, Iowa. Browse 200+ local restaurants with ratings, reviews, menus, and real-time availability.",
    numberOfItems: totalCount || restaurants.length,
    itemListElement: restaurants.slice(0, 20).map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Restaurant",
        name: restaurant.name,
        description: restaurant.description,
        servesCuisine: restaurant.cuisine,
        priceRange: restaurant.price_range,
        address: {
          "@type": "PostalAddress",
          streetAddress: restaurant.location,
          addressLocality: restaurant.city || "Des Moines",
          addressRegion: "Iowa",
          addressCountry: "US",
        },
        ...(restaurant.image_url && { image: restaurant.image_url }),
        aggregateRating: restaurant.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: restaurant.rating,
              bestRating: "5",
              worstRating: "1",
              ratingCount: Math.round(
                (restaurant.popularity_score || 50) * 2
              ),
            }
          : undefined,
        ...(restaurant.phone && { telephone: restaurant.phone }),
        ...(restaurant.website && { url: restaurant.website }),
        geo: restaurant.latitude
          ? {
              "@type": "GeoCoordinates",
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
            }
          : undefined,
      },
    })),
  };

  return (
    <>
      <SEOHead
        title="Best Restaurants in Des Moines, Iowa - Complete Dining Guide 2026"
        description="Find the best restaurants in Des Moines, Iowa. Browse 200+ local restaurants with ratings, reviews, photos, and real-time open/closed status. Filter by cuisine, price, and neighborhood."
        type="website"
        keywords={restaurantsKeywords}
        structuredData={restaurantsSchema}
        url="/restaurants"
      />
      <div className="min-h-screen bg-gray-50">
        <Header />

        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-[#1a0f3c] via-[#2D1B69] to-[#DC143C] overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-[#DC143C]/20 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#2D1B69]/30 rounded-full blur-3xl" />
          </div>

          <div className="relative container mx-auto px-4 pt-16 pb-20 md:pt-20 md:pb-28">
            {/* Title */}
            <div className="text-center mb-10">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 tracking-tight">
                Des Moines
                <span className="block bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                  Restaurant Guide
                </span>
              </h1>
              <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
                Discover 200+ restaurants across Des Moines. Search by cuisine, price,
                neighborhood, or find what's open right now.
              </p>
            </div>

            {/* Search Bar - The Main Event */}
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder={isMobile ? "Search restaurants..." : "Search restaurants, cuisines, neighborhoods..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchInput.trim()) {
                      addRecentSearch('restaurants', searchInput);
                    }
                  }}
                  className="w-full h-14 pl-14 pr-36 text-base md:text-lg bg-white border-0 rounded-2xl shadow-2xl shadow-black/20 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-0 placeholder:text-gray-400"
                  aria-label="Search restaurants"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 sm:h-8 sm:w-8 text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setSearchInput("");
                        setFilters((prev) => ({ ...prev, search: "" }));
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    className="h-10 bg-gradient-to-r from-[#2D1B69] to-[#DC143C] hover:opacity-90 text-white rounded-xl px-5 font-semibold"
                    onClick={() => {
                      if (searchInput.trim()) addRecentSearch('restaurants', searchInput);
                      setFilters((prev) => ({ ...prev, search: searchInput }));
                    }}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
                <SearchAutocomplete
                  contentType="restaurants"
                  value={searchInput}
                  onSelect={(val) => {
                    setSearchInput(val);
                    setFilters((prev) => ({ ...prev, search: val }));
                  }}
                  inputRef={searchInputRef}
                />
              </div>

              {/* Quick action pills below search */}
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSurpriseMe}
                  disabled={!restaurants || restaurants.length === 0}
                  className="rounded-full text-sm bg-white/15 hover:bg-white/25 text-white border-white/20"
                >
                  <Shuffle className="h-3.5 w-3.5 mr-1.5" />
                  Surprise Me
                </Button>
                <Button
                  variant={filters.openNow ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setFilters((prev) => ({ ...prev, openNow: !prev.openNow }))}
                  className={`rounded-full text-sm ${
                    filters.openNow
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-white/15 hover:bg-white/25 text-white border-white/20"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Open Now
                </Button>
                <Button
                  variant={filters.featuredOnly ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setFilters((prev) => ({ ...prev, featuredOnly: !prev.featuredOnly }))}
                  className={`rounded-full text-sm ${
                    filters.featuredOnly
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-white/15 hover:bg-white/25 text-white border-white/20"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Featured
                </Button>

                {/* View Mode Toggle */}
                <div className="flex items-center rounded-full bg-white/15 p-0.5 ml-2">
                  <Button
                    onClick={() => setViewMode("list")}
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-full ${
                      viewMode === "list"
                        ? "bg-white/30 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setViewMode("map")}
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-full ${
                      viewMode === "map"
                        ? "bg-white/30 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                    aria-label="Map view"
                  >
                    <Map className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              <path d="M0 60L1440 60L1440 0C1440 0 1080 60 720 60C360 60 0 0 0 0L0 60Z" fill="#f9fafb" />
            </svg>
          </div>
        </section>

        <div className="container mx-auto px-4 py-6 md:py-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Restaurants" },
            ]}
            className="mb-4"
          />
          <div className="flex gap-8">
          <div className="flex-1 min-w-0 space-y-6">
            {/* Smart Preset Filters - one-tap scenarios */}
            <RestaurantSmartPresets
              onApplyPreset={setFilters}
              defaultFilters={{
                search: "",
                cuisine: [],
                priceRange: [],
                rating: [0, 5],
                location: [],
                sortBy: "popularity",
                featuredOnly: false,
                openNow: false,
                tags: [],
              }}
            />

            {/* Inline Filter Pills - always visible, no hidden panel */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <RestaurantInlineFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  availableCuisines={filterOptions.cuisines}
                  availableLocations={filterOptions.locations}
                  totalResults={totalCount}
                  isLoading={isLoading}
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Sort dropdown */}
                <Select
                  value={filters.sortBy}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, sortBy: value as RestaurantFilterOptions["sortBy"] }))
                  }
                >
                  <SelectTrigger className="w-40 bg-white dark:bg-card rounded-xl shadow-sm text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Results count */}
                <p className="text-sm text-muted-foreground whitespace-nowrap hidden md:block">
                  {isLoading ? (
                    "Searching..."
                  ) : (
                    <span>
                      <strong className="text-foreground">{totalCount}</strong> found
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Restaurant Openings Section */}
            <RestaurantOpenings />

            {/* Open Now Banner */}
            <OpenNowBanner
              isActive={filters.openNow}
              onToggle={() =>
                setFilters((prev) => ({ ...prev, openNow: !prev.openNow }))
              }
              openCount={filters.openNow ? restaurants.length : undefined}
              totalCount={totalCount}
            />

            {/* Featured Restaurants Row */}
            {!hasActiveFilters && featuredRestaurants.length > 0 && (
              <section aria-labelledby="featured-heading">
                <div className="flex items-center justify-between mb-4">
                  <h2 id="featured-heading" className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Sparkles className="h-6 w-6 text-amber-500" />
                    Featured Restaurants
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters((prev) => ({ ...prev, featuredOnly: true }))}
                    className="text-[#2D1B69] hover:text-[#2D1B69]/80"
                  >
                    View All
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {featuredRestaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      variant="featured"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Featured Spot Ad */}
            <div className="my-6">
              <AdBanner placement="featured_spot" />
            </div>

            {/* Screen reader announcement for result count changes */}
            <div {...regionProps}>{announcement}</div>

            {/* Main Restaurant Grid */}
            <section aria-labelledby="all-restaurants-heading">
              <div className="flex items-center justify-between mb-4">
                <h2 id="all-restaurants-heading" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {hasActiveFilters ? "Search Results" : "All Restaurants"}
                </h2>
              </div>

              {isLoading ? (
                <CardsGridSkeleton
                  count={9}
                  variant="restaurant"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                  label={filters.search ? `Searching for "${filters.search}"...` : filters.cuisine.length > 0 ? `Loading ${filters.cuisine.join(', ')} restaurants...` : "Loading restaurants..."}
                />
              ) : error ? (
                <ErrorState error={error} onRetry={() => refetch()} />
              ) : restaurants.length === 0 ? (
                <EmptyState
                  icon={hasActiveFilters ? SearchX : Utensils}
                  title={
                    filters.search
                      ? `No results for "${filters.search}"`
                      : "No restaurants found"
                  }
                  description={
                    hasActiveFilters
                      ? "Try adjusting your search criteria or filters to find more restaurants."
                      : "No restaurants available at the moment. Check back soon!"
                  }
                  actions={
                    hasActiveFilters
                      ? [
                          {
                            label: "Clear All Filters",
                            onClick: handleClearFilters,
                            variant: "outline",
                            icon: X,
                          },
                          {
                            label: "Browse All",
                            onClick: () => {
                              handleClearFilters();
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            },
                            icon: Sparkles,
                          },
                        ]
                      : undefined
                  }
                />
              ) : viewMode === "map" ? (
                <Suspense fallback={<LoadingSpinner label="Loading map..." />}>
                  <RestaurantsMap restaurants={restaurants || []} />
                </Suspense>
              ) : (
                <>
                  {/* Results count */}
                  <p className="text-sm text-muted-foreground mb-4">
                    {isMobile
                      ? `Showing ${Math.min(paginatedRestaurants.length, restaurants.length)} of ${restaurants.length} restaurants`
                      : `Showing ${Math.min((page - 1) * ITEMS_PER_PAGE + 1, restaurants.length)}-${Math.min(page * ITEMS_PER_PAGE, restaurants.length)} of ${restaurants.length} restaurants`}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedRestaurants.map((restaurant) => (
                      <RestaurantCard
                        key={restaurant.id}
                        restaurant={restaurant}
                      />
                    ))}
                  </div>

                  {/* Pagination controls */}
                  {restaurants.length > ITEMS_PER_PAGE && (
                    <div className="mt-8">
                      {isMobile ? (
                        hasMorePages && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => setPage((p) => p + 1)}
                          >
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Load More Restaurants
                          </Button>
                        )
                      ) : (
                        <Pagination>
                          <PaginationContent>
                            {page > 1 && (
                              <PaginationItem>
                                <PaginationPrevious
                                  onClick={() => {
                                    setPage((p) => Math.max(1, p - 1));
                                    document.getElementById('all-restaurants-heading')?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="cursor-pointer"
                                />
                              </PaginationItem>
                            )}
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                              let pageNum: number;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (page <= 3) {
                                pageNum = i + 1;
                              } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = page - 2 + i;
                              }
                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    isActive={pageNum === page}
                                    onClick={() => {
                                      setPage(pageNum);
                                      document.getElementById('all-restaurants-heading')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="cursor-pointer"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            {totalPages > 5 && page < totalPages - 2 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                            {page < totalPages && (
                              <PaginationItem>
                                <PaginationNext
                                  onClick={() => {
                                    setPage((p) => Math.min(totalPages, p + 1));
                                    document.getElementById('all-restaurants-heading')?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                  className="cursor-pointer"
                                />
                              </PaginationItem>
                            )}
                          </PaginationContent>
                        </Pagination>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Below-Fold Ad */}
            <div className="my-8">
              <AdBanner placement="below_fold" />
            </div>

            {/* Browse by Cuisine Section */}
            {cuisineCounts.length > 0 && (
              <section className="py-8" aria-labelledby="browse-cuisine-heading">
                <h2
                  id="browse-cuisine-heading"
                  className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2"
                >
                  Browse by Cuisine
                </h2>
                <p className="text-muted-foreground mb-6">
                  Explore Des Moines restaurants by cuisine type
                </p>
                <div className="flex flex-wrap gap-2">
                  {cuisineCounts.map(({ cuisine, count }) => (
                    <button
                      key={cuisine}
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, cuisine: [cuisine] }));
                        setActiveCuisineQuick('');
                        document.getElementById('all-restaurants-heading')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-gray-700 dark:text-gray-300 hover:border-[#2D1B69] dark:hover:border-primary hover:bg-[#2D1B69]/5 dark:hover:bg-primary/10 transition-all duration-200 shadow-sm"
                    >
                      <ChefHat className="h-3.5 w-3.5 text-muted-foreground" />
                      {cuisine}
                      <span className="text-xs text-muted-foreground ml-0.5">({count})</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* SEO Content Section */}
            <section className="max-w-4xl mx-auto space-y-12 mt-16" aria-labelledby="guide-heading">
              <div className="prose prose-lg max-w-none">
                <h2 id="guide-heading" className="text-3xl font-bold mb-6 text-center text-gray-900 dark:text-gray-100">
                  Des Moines Restaurant Guide: Your Complete Local Dining Directory
                </h2>

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 p-6 rounded-2xl mb-8 border border-blue-100 dark:border-blue-900">
                  <h3 className="text-xl font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <ChefHat className="h-5 w-5 text-blue-600" />
                    Des Moines Dining at a Glance
                  </h3>
                  <p className="text-lg leading-relaxed text-gray-700">
                    Des Moines, Iowa offers over 200 diverse restaurants spanning 30+ cuisines across downtown,
                    East Village, West Des Moines, and Ankeny. From James Beard-nominated fine dining establishments
                    to beloved neighborhood diners, the capital city's food scene rivals cities twice its size.
                    New restaurant openings happen monthly, making Des Moines one of the Midwest's most exciting
                    dining destinations.
                  </p>
                </div>

                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Best Neighborhoods for Dining in Des Moines</h3>

                <div className="grid md:grid-cols-2 gap-6 mb-8 not-prose">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <h4 className="text-xl font-semibold mb-3 text-gray-900">East Village & Downtown</h4>
                    <p className="mb-3 text-gray-600">
                      The epicenter of Des Moines dining. Farm-to-table restaurants, craft cocktail bars,
                      and critically acclaimed fine dining. Home to Harbinger, Alba, and other nationally
                      recognized establishments. Best area for date nights and special occasions.
                    </p>
                    <p className="text-sm text-gray-500">
                      <strong>Best for:</strong> Fine dining, date nights, craft cocktails, farm-to-table
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <h4 className="text-xl font-semibold mb-3 text-gray-900">West Des Moines & Jordan Creek</h4>
                    <p className="mb-3 text-gray-600">
                      The fastest-growing dining corridor in the metro. Family-friendly restaurants near
                      Jordan Creek Town Center plus diverse ethnic eateries along University Avenue.
                      Particularly strong in Asian and Latin American cuisines.
                    </p>
                    <p className="text-sm text-gray-500">
                      <strong>Best for:</strong> Family dining, international cuisine, suburban convenience
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <h4 className="text-xl font-semibold mb-3 text-gray-900">Ingersoll & Grand Avenue</h4>
                    <p className="mb-3 text-gray-600">
                      Classic Des Moines neighborhood dining. Locally-owned institutions serving the community
                      for decades alongside trendy newcomers. Known for brunch spots, neighborhood bars,
                      and casual American dining.
                    </p>
                    <p className="text-sm text-gray-500">
                      <strong>Best for:</strong> Brunch, neighborhood favorites, casual dining
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <h4 className="text-xl font-semibold mb-3 text-gray-900">Ankeny & Altoona</h4>
                    <p className="mb-3 text-gray-600">
                      Rapidly expanding suburban dining with new openings monthly. Excellent value,
                      family-friendly atmospheres, and convenient access. Growing selection of
                      independent restaurants alongside popular chains.
                    </p>
                    <p className="text-sm text-gray-500">
                      <strong>Best for:</strong> Value dining, families, new restaurant openings
                    </p>
                  </div>
                </div>

                <h3 className="text-2xl font-semibold mb-4 text-gray-900">Dining Tips for Des Moines</h3>

                <div className="space-y-4 mb-8 not-prose">
                  <div className="bg-white p-5 rounded-xl border flex gap-4 items-start">
                    <div className="bg-amber-100 rounded-full p-2 shrink-0 mt-0.5">
                      <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Peak Hours & Reservations</h4>
                      <p className="text-gray-600 text-sm">
                        Friday and Saturday evenings (6-8 PM) are busiest. Make reservations for fine dining
                        and popular spots. Most casual restaurants accommodate walk-ins even during peak hours.
                        Sunday brunch is popular from 9-11 AM at East Village and Ingersoll restaurants.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border flex gap-4 items-start">
                    <div className="bg-emerald-100 rounded-full p-2 shrink-0 mt-0.5">
                      <DollarSign className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Best Value Dining</h4>
                      <p className="text-gray-600 text-sm">
                        Des Moines offers exceptional dining value compared to larger metros. Many top-rated
                        restaurants fall in the $15-30 per person range. Happy hour deals (typically 3-6 PM)
                        at downtown establishments offer half-price appetizers and drink specials.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border flex gap-4 items-start">
                    <div className="bg-purple-100 rounded-full p-2 shrink-0 mt-0.5">
                      <Leaf className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Dietary Accommodations</h4>
                      <p className="text-gray-600 text-sm">
                        The Des Moines dining scene increasingly caters to dietary needs. Vegetarian and
                        vegan options are available at most restaurants. Gluten-free menus are common at
                        upscale establishments. Asian and Mediterranean restaurants naturally offer many
                        plant-based options.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-2xl border border-emerald-100">
                  <h4 className="text-lg font-semibold mb-3 text-gray-900">Des Moines Food Scene by the Numbers</h4>
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    <li><strong>200+ restaurants</strong> in the greater Des Moines metro area</li>
                    <li><strong>30+ cuisine types</strong> from farm-to-table to authentic international</li>
                    <li><strong>Weekly new openings</strong> tracked and verified by local experts</li>
                    <li><strong>Real-time status</strong> showing which restaurants are open right now</li>
                    <li><strong>Free, unbiased reviews</strong> from the Des Moines community</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar Ad - Desktop Only */}
          <aside className="hidden lg:block w-[160px] flex-shrink-0" aria-label="Sidebar advertisement">
            <div className="sticky top-24">
              <AdBanner placement="sidebar" />
            </div>
          </aside>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="py-16 bg-white dark:bg-background" aria-labelledby="faq-heading">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="Des Moines Restaurants - Frequently Asked Questions"
              description="Common questions about dining, restaurants, and the food scene in Des Moines, Iowa."
              faqs={[
                {
                  question: "What are the best restaurants in Des Moines in 2026?",
                  answer: "Des Moines features over 200 diverse restaurants. Top-rated establishments include Harbinger for Asian-inspired fine dining, Alba for innovative American cuisine, Centro for authentic Italian, Django for French-inspired dishes, and Bubba for Southern fusion. The East Village neighborhood offers trendy farm-to-table options, while Ingersoll Avenue features beloved local institutions. Use our search filters to find restaurants by cuisine, price, rating, and neighborhood to discover your perfect Des Moines dining experience."
                },
                {
                  question: "What restaurants are open right now in Des Moines?",
                  answer: "Use our 'Open Now' filter at the top of this page to instantly see all Des Moines restaurants currently serving. We track real-time operating hours for 200+ local restaurants. Most downtown restaurants serve lunch 11 AM-2 PM and dinner 5-10 PM. Late-night options are available in the East Village and Court Avenue districts. For the most up-to-date information, click 'Open Now' above or visit our dedicated Open Now Restaurants page."
                },
                {
                  question: "What cuisines are available in Des Moines?",
                  answer: "Des Moines offers 30+ cuisine types including American (farm-to-table and classic), Italian, Mexican, Chinese, Japanese, Thai, Vietnamese, Korean, Indian, Mediterranean, French, BBQ, seafood, and more. The metro area has seen significant growth in authentic ethnic restaurants, particularly along University Avenue in West Des Moines. Use our cuisine filter to browse restaurants by food type."
                },
                {
                  question: "Where can I find new restaurant openings in Des Moines?",
                  answer: "Our 'New Openings' section at the top of this page tracks every new restaurant opening in the Des Moines metro within 48 hours of announcement. Recent growth areas include West Des Moines (particularly near Jordan Creek), Ankeny, and the East Village. We monitor social media, building permits, and local news sources to bring you the most current restaurant opening information."
                },
                {
                  question: "What are the best cheap eats in Des Moines?",
                  answer: "Des Moines offers excellent budget-friendly dining. Filter by '$' price range to find meals under $15 per person. Popular affordable options include food trucks downtown during lunch, family-style restaurants in Ankeny, taco shops on the east side, and weekday lunch specials at downtown establishments. Happy hour deals (3-6 PM) at many restaurants offer half-price appetizers."
                },
                {
                  question: "Are there vegan and vegetarian restaurants in Des Moines?",
                  answer: "Yes, Des Moines has expanding plant-based dining options. Several restaurants offer dedicated vegetarian and vegan menus, and most upscale restaurants accommodate dietary restrictions. Asian restaurants, Mediterranean eateries, and farm-to-table establishments offer naturally plant-forward options. Visit our Dietary Restaurants page for a complete guide to vegan, vegetarian, gluten-free, and allergen-friendly dining in Des Moines."
                },
                {
                  question: "What neighborhoods have the best restaurant scenes in Des Moines?",
                  answer: "Des Moines has several distinct dining districts: East Village (trendy farm-to-table, craft cocktails), Downtown (business dining, fine dining), Ingersoll Avenue (neighborhood favorites, brunch spots), Court Avenue (nightlife, casual dining), Valley Junction in West Des Moines (unique concepts), and Drake neighborhood (diverse, student-friendly options). Each area reflects its unique neighborhood character through its restaurants."
                },
                {
                  question: "Do Des Moines restaurants require reservations?",
                  answer: "Reservation policies vary. Fine dining restaurants (Harbinger, Django, Alba) typically require reservations, especially on weekends. Mid-range restaurants accept reservations but often accommodate walk-ins. Casual dining operates first-come, first-served. We recommend calling ahead for groups of 6 or more, and for Friday-Saturday dinner service at popular restaurants. Check individual restaurant pages for contact details."
                },
              ]}
              showSchema={true}
              className="border-0 shadow-lg rounded-2xl"
            />
          </div>
        </section>

        <Footer />
        <BackToTop />
      </div>
    </>
  );
}
