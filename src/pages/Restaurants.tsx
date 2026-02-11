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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton, LoadingSpinner } from "@/components/ui/loading-skeleton";
import {
  MapPin,
  Star,
  DollarSign,
  ChefHat,
  Search,
  SearchX,
  Utensils,
  X,
  Sparkles,
  AlertCircle,
  Clock,
  List,
  Map,
  SlidersHorizontal,
  TrendingUp,
  ArrowRight,
  Flame,
  Leaf,
  Pizza,
  Fish,
  Beef,
  Coffee,
  Globe,
} from "lucide-react";
import { useState, lazy, Suspense, useMemo, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { OpenNowBanner } from "@/components/OpenNowBanner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useIsMobile } from "@/hooks/use-mobile";
import RestaurantCard from "@/components/RestaurantCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Lazy load map component to prevent react-leaflet bundling issues
const RestaurantsMap = lazy(() => import("@/components/RestaurantsMap"));

// Popular cuisine quick-filters with icons
const cuisineQuickFilters = [
  { label: "All", value: "", icon: Utensils },
  { label: "American", value: "American", icon: Beef },
  { label: "Italian", value: "Italian", icon: Pizza },
  { label: "Mexican", value: "Mexican", icon: Flame },
  { label: "Asian", value: "Asian", icon: Globe },
  { label: "Seafood", value: "Seafood", icon: Fish },
  { label: "Vegetarian", value: "Vegetarian", icon: Leaf },
  { label: "Coffee & Cafe", value: "Cafe", icon: Coffee },
];

const sortOptions = [
  { value: "popularity", label: "Most Popular", icon: TrendingUp },
  { value: "rating", label: "Highest Rated", icon: Star },
  { value: "newest", label: "Newest", icon: Clock },
  { value: "alphabetical", label: "A-Z", icon: SlidersHorizontal },
  { value: "price_low", label: "Price: Low-High", icon: DollarSign },
  { value: "price_high", label: "Price: High-Low", icon: DollarSign },
];

export default function Restaurants() {
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [searchInput, setSearchInput] = useState("");
  const [activeCuisineQuick, setActiveCuisineQuick] = useState("");
  const { toast } = useToast();

  const { restaurants, isLoading, error, totalCount } = useRestaurants(filters);
  const filterOptions = useRestaurantFilterOptions();

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        setFilters((prev) => ({ ...prev, search: searchInput }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search]);

  const handleCuisineQuickFilter = useCallback((cuisineValue: string) => {
    setActiveCuisineQuick(cuisineValue);
    if (cuisineValue === "") {
      setFilters((prev) => ({ ...prev, cuisine: [] }));
    } else {
      // Match any cuisine containing the value (e.g., "Asian" matches "Asian Fusion", "Thai", etc.)
      const matchingCuisines = filterOptions.cuisines.filter((c) =>
        c.toLowerCase().includes(cuisineValue.toLowerCase())
      );
      setFilters((prev) => ({
        ...prev,
        cuisine: matchingCuisines.length > 0 ? matchingCuisines : [cuisineValue],
      }));
    }
  }, [filterOptions.cuisines]);

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
    setActiveCuisineQuick("");
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  }, [toast]);

  const removeFilter = useCallback((filterType: string, value?: string) => {
    setFilters((prev) => {
      switch (filterType) {
        case "search":
          setSearchInput("");
          return { ...prev, search: "" };
        case "cuisine":
          setActiveCuisineQuick("");
          return { ...prev, cuisine: prev.cuisine.filter((c) => c !== value) };
        case "priceRange":
          return { ...prev, priceRange: prev.priceRange.filter((p) => p !== value) };
        case "location":
          return { ...prev, location: prev.location.filter((l) => l !== value) };
        case "tags":
          return { ...prev, tags: prev.tags.filter((t) => t !== value) };
        case "featuredOnly":
          return { ...prev, featuredOnly: false };
        case "openNow":
          return { ...prev, openNow: false };
        case "rating":
          return { ...prev, rating: [0, 5] };
        default:
          return prev;
      }
    });
  }, []);

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
                  className="w-full h-14 pl-14 pr-36 text-base md:text-lg bg-white border-0 rounded-2xl shadow-2xl shadow-black/20 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-0 placeholder:text-gray-400"
                  aria-label="Search restaurants"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-gray-600"
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
                    onClick={() => setFilters((prev) => ({ ...prev, search: searchInput }))}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>

              {/* Quick action pills below search */}
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
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

        <main className="container mx-auto px-4 py-6 md:py-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Restaurants" },
            ]}
            className="mb-4"
          />
          <div className="space-y-8">
            {/* Cuisine Quick Filter Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {cuisineQuickFilters.map((item) => {
                const Icon = item.icon;
                const isActive = activeCuisineQuick === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => handleCuisineQuickFilter(item.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full whitespace-nowrap transition-all duration-200 text-sm font-medium border ${
                      isActive
                        ? "bg-[#2D1B69] text-white border-[#2D1B69] shadow-md"
                        : "bg-white text-gray-700 border-gray-200 hover:border-[#2D1B69]/30 hover:bg-[#2D1B69]/5 shadow-sm"
                    }`}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Sort & Filter Controls Bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                {/* Sort dropdown */}
                <Select
                  value={filters.sortBy}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, sortBy: value as RestaurantFilterOptions["sortBy"] }))
                  }
                >
                  <SelectTrigger className="w-44 bg-white rounded-xl shadow-sm">
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

                {/* Advanced filters button */}
                {isMobile ? (
                  <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-xl bg-white shadow-sm relative"
                      >
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Filters
                        {getActiveFiltersCount > 0 && (
                          <Badge className="ml-2 bg-[#DC143C] text-white h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                            {getActiveFiltersCount}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
                      <SheetHeader>
                        <SheetTitle className="text-xl">Filter Restaurants</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                        <RestaurantFilters
                          filters={filters}
                          onFiltersChange={setFilters}
                          availableCuisines={filterOptions.cuisines}
                          availableLocations={filterOptions.locations}
                          availableTags={filterOptions.tags}
                          totalResults={totalCount}
                          isLoading={isLoading}
                        />
                        <div className="flex gap-3 pt-4 sticky bottom-0 bg-background pb-4">
                          <Button variant="outline" onClick={handleClearFilters} className="flex-1 rounded-xl">
                            Clear All
                          </Button>
                          <Button onClick={() => setShowMobileFilters(false)} className="flex-1 rounded-xl bg-[#2D1B69]">
                            Show {restaurants?.length || 0} Results
                          </Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="rounded-xl bg-white shadow-sm relative"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    More Filters
                    {getActiveFiltersCount > 0 && (
                      <Badge className="ml-2 bg-[#DC143C] text-white h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                        {getActiveFiltersCount}
                      </Badge>
                    )}
                  </Button>
                )}
              </div>

              {/* Results count */}
              <p className="text-sm text-muted-foreground">
                {isLoading ? (
                  "Searching..."
                ) : (
                  <span>
                    <strong className="text-foreground">{totalCount}</strong> restaurant{totalCount !== 1 ? "s" : ""} found
                  </span>
                )}
              </p>
            </div>

            {/* Active Filter Chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2">
                {filters.search && (
                  <Badge variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    Search: "{filters.search}"
                    <button onClick={() => removeFilter("search")} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.cuisine.map((cuisine) => (
                  <Badge key={cuisine} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    <ChefHat className="h-3 w-3" />
                    {cuisine}
                    <button onClick={() => removeFilter("cuisine", cuisine)} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {filters.priceRange.map((price) => (
                  <Badge key={price} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    <DollarSign className="h-3 w-3" />
                    {price}
                    <button onClick={() => removeFilter("priceRange", price)} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {filters.location.map((location) => (
                  <Badge key={location} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    <MapPin className="h-3 w-3" />
                    {location}
                    <button onClick={() => removeFilter("location", location)} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {filters.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    {tag}
                    <button onClick={() => removeFilter("tags", tag)} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {filters.featuredOnly && (
                  <Badge variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-amber-50 border-amber-200 text-amber-800">
                    <Sparkles className="h-3 w-3" />
                    Featured Only
                    <button onClick={() => removeFilter("featuredOnly")} className="ml-1 hover:bg-amber-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.openNow && (
                  <Badge variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-emerald-50 border-emerald-200 text-emerald-800">
                    <Clock className="h-3 w-3" />
                    Open Now
                    <button onClick={() => removeFilter("openNow")} className="ml-1 hover:bg-emerald-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {(filters.rating[0] !== 0 || filters.rating[1] !== 5) && (
                  <Badge variant="secondary" className="gap-1 pl-3 pr-1 py-1.5 rounded-full bg-white shadow-sm border">
                    <Star className="h-3 w-3" />
                    Rating: {filters.rating[0]}-{filters.rating[1]}
                    <button onClick={() => removeFilter("rating")} className="ml-1 hover:bg-gray-200 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs h-7 text-[#DC143C] hover:text-[#DC143C]/80 hover:bg-red-50"
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && !isMobile && (
              <div className="bg-white rounded-2xl shadow-md p-6 border">
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
                  <Button variant="outline" onClick={handleClearFilters} className="rounded-xl">
                    Clear Filters
                  </Button>
                  <Button onClick={() => setShowAdvancedFilters(false)} className="rounded-xl bg-[#2D1B69]">
                    Apply Filters
                  </Button>
                </div>
              </div>
            )}

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
                  <h2 id="featured-heading" className="text-2xl font-bold text-gray-900 flex items-center gap-2">
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

            {/* Main Restaurant Grid */}
            <section aria-labelledby="all-restaurants-heading">
              <div className="flex items-center justify-between mb-4">
                <h2 id="all-restaurants-heading" className="text-2xl font-bold text-gray-900">
                  {hasActiveFilters ? "Search Results" : "All Restaurants"}
                </h2>
              </div>

              {isLoading ? (
                <CardsGridSkeleton
                  count={9}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                  label="Loading restaurants..."
                />
              ) : error ? (
                <EmptyState
                  icon={AlertCircle}
                  title="Unable to load restaurants"
                  description="We're having trouble loading the restaurant list. Please check your connection and try again."
                  actions={[
                    {
                      label: "Try Again",
                      onClick: () => window.location.reload(),
                      variant: "default",
                    },
                  ]}
                />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {restaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* SEO Content Section */}
            <section className="max-w-4xl mx-auto space-y-12 mt-16" aria-labelledby="guide-heading">
              <div className="prose prose-lg max-w-none">
                <h2 id="guide-heading" className="text-3xl font-bold mb-6 text-center text-gray-900">
                  Des Moines Restaurant Guide: Your Complete Local Dining Directory
                </h2>

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl mb-8 border border-blue-100">
                  <h3 className="text-xl font-semibold mb-3 flex items-center gap-2 text-gray-900">
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
        </main>

        {/* FAQ Section */}
        <section className="py-16 bg-white" aria-labelledby="faq-heading">
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
