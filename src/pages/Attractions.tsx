import React, { useState, useMemo, useEffect, lazy, Suspense, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { FAQSection } from "@/components/FAQSection";
import { useAttractions } from "@/hooks/useAttractions";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { BackToTop } from "@/components/BackToTop";
import { useAnnounce } from "@/hooks/use-announce";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardsGridSkeleton } from "@/components/ui/loading-skeleton";
import { MapPin, Star, Filter, List, Map, SlidersHorizontal, Landmark, ChevronRight, SearchX, X, ChevronDown, Shuffle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StickyFilterBar } from "@/components/ui/sticky-filter-bar";
import { ActiveFilterChips, type FilterChip } from "@/components/ui/active-filter-chips";
import { SortDropdown, ATTRACTION_SORT_OPTIONS } from "@/components/SortDropdown";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { useIsMobile } from "@/hooks/use-mobile";
import { OptimizedImage } from "@/components/OptimizedImage";
import { CARD_IMAGE_WIDTHS } from "@/lib/imageTransform";
import { SearchAutocomplete, addRecentSearch } from "@/components/SearchAutocomplete";
import { usePrefetchAttraction } from "@/hooks/usePrefetchDetail";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { getStringParam, getNumberParam } from "@/lib/urlParams";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { promoteSponsored, isActivelySponsored } from "@/lib/sponsoredListings";
import { useSponsoredTracking } from "@/hooks/useSponsoredTracking";

// Lazy load map to prevent react-leaflet bundling issues
const AttractionsMap = lazy(() => import("@/components/AttractionsMap"));

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

interface AttractionListCardProps {
  attraction: {
    id: string;
    name: string;
    type: string;
    image_url?: string | null;
    rating?: number | null;
    location?: string | null;
    description?: string | null;
    is_featured?: boolean | null;
    is_sponsored?: boolean | null;
    sponsored_until?: string | null;
  };
  onPrefetch: (slug: string) => void;
}

// Browse-list attraction card. Extracted so it can host the sponsored-listing
// viewability/click tracking hook (WEB-FEAT-005). Sponsored treatment is
// expiry-aware: a lapsed sponsored_until window drops the badge/ring with no
// manual cleanup.
function AttractionListCard({ attraction, onPrefetch }: AttractionListCardProps) {
  const slug = createSlug(attraction.name);
  const sponsored = isActivelySponsored(attraction);
  const { ref: sponsoredRef, trackClick } = useSponsoredTracking<HTMLAnchorElement>(
    sponsored,
    "attraction",
    attraction.id,
  );

  return (
    <Link
      ref={sponsoredRef}
      to={`/attractions/${slug}`}
      className="block"
      onMouseEnter={() => onPrefetch(slug)}
      onClick={trackClick}
      aria-label={`${sponsored ? "Sponsored: " : ""}${attraction.name}`}
    >
      <Card
        className={`h-full hover:shadow-lg transition-all duration-200 hover:-translate-y-1 rounded-2xl overflow-hidden ${
          sponsored ? "ring-2 ring-amber-400/60" : ""
        }`}
      >
        <div className="relative">
          {attraction.image_url ? (
            <OptimizedImage
              src={attraction.image_url}
              alt={`${attraction.name} - ${attraction.type} in Des Moines`}
              width={640}
              height={360}
              className="transition-transform duration-200 hover:scale-105 object-cover"
              containerClassName="aspect-video overflow-hidden"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              useTransformApi
              enableWebP={false}
              transformWidths={[...CARD_IMAGE_WIDTHS]}
            />
          ) : (
            <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-[#DC143C] flex items-center justify-center" role="img" aria-label={`No image available for ${attraction.name}`}>
              <Landmark className="h-12 w-12 text-white/40" />
            </div>
          )}
          {sponsored && (
            <div className="absolute top-3 left-3 z-10">
              <SponsoredBadge />
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <Badge
              variant="outline"
              className="bg-[#2D1B69]/10 text-[#2D1B69] text-xs"
            >
              <Landmark className="h-3 w-3 mr-1" />
              {attraction.type}
            </Badge>
            {!sponsored && attraction.is_featured && (
              <Badge className="bg-[#DC143C] text-white text-xs">Featured</Badge>
            )}
          </div>
          <h3 className="font-semibold text-lg line-clamp-2 mb-2">
            {attraction.name}
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {attraction.rating && (
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span>{attraction.rating}/5</span>
              </div>
            )}
            {attraction.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="line-clamp-1">{attraction.location}</span>
              </div>
            )}
          </div>
          {attraction.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
              {attraction.description}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Attractions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  useDocumentTitle("Attractions");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefetchAttraction = usePrefetchAttraction();
  // Filter states — initialize from the URL (shareable + back-nav restore,
  // WEB-UX-001).
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => getStringParam(searchParams, "q"));
  const [selectedType, setSelectedType] = useState(() => getStringParam(searchParams, "type", "all"));
  const [minRating, setMinRating] = useState(() => getStringParam(searchParams, "rating", "any-rating"));
  const [showFilters, setShowFilters] = useState(true); // Show filters by default
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(() => getStringParam(searchParams, "featured", "all"));
  const [sortBy, setSortBy] = useState(() => getStringParam(searchParams, "sort", "rating"));
  const [viewMode, setViewMode] = useState(() => getStringParam(searchParams, "view", "list"));

  const ITEMS_PER_PAGE = 30;
  const [page, setPage] = useState(() => getNumberParam(searchParams, "page", 1));

  // Get all attractions first
  const { attractions: allAttractions, isLoading, error, refetch } = useAttractions({});
  const { announce, announcement, regionProps } = useAnnounce();

  // Get unique types for filter options
  const attractionTypes = useMemo(() => {
    const uniqueTypes = new Set(
      allAttractions.map((attraction) => attraction.type).filter(Boolean)
    );
    return Array.from(uniqueTypes).sort();
  }, [allAttractions]);

  // Apply filters
  const filteredAttractions = useMemo(() => {
    return allAttractions.filter((attraction) => {
      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          attraction.name.toLowerCase().includes(searchLower) ||
          attraction.description?.toLowerCase().includes(searchLower) ||
          attraction.location?.toLowerCase().includes(searchLower) ||
          attraction.type?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (selectedType !== "all" && attraction.type !== selectedType) {
        return false;
      }

      // Rating filter
      if (minRating !== "any-rating") {
        const ratingThreshold = parseFloat(minRating);
        if (!attraction.rating || attraction.rating < ratingThreshold) {
          return false;
        }
      }

      // Featured filter
      if (featuredOnly === "featured" && !attraction.is_featured) {
        return false;
      }

      return true;
    });
  }, [allAttractions, searchQuery, selectedType, minRating, featuredOnly]);

  const sortedAttractions = useMemo(() => {
    const sorted = [...filteredAttractions];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
      case "name_asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "rating":
      default:
        sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
    }
    // Float up to 2 actively-sponsored attractions to the top; organic order
    // otherwise untouched (WEB-FEAT-005).
    return promoteSponsored(sorted);
  }, [filteredAttractions, sortBy]);

  const handleSurpriseMe = () => {
    if (!filteredAttractions || filteredAttractions.length === 0) return;
    const random = filteredAttractions[Math.floor(Math.random() * filteredAttractions.length)];
    navigate(`/attractions/${createSlug(random.name)}`);
  };

  // Pagination
  const totalPages = Math.ceil(sortedAttractions.length / ITEMS_PER_PAGE);
  const paginatedAttractions = useMemo(() => {
    if (isMobile) {
      return sortedAttractions.slice(0, page * ITEMS_PER_PAGE);
    }
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedAttractions.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedAttractions, page, isMobile]);

  const hasMorePages = isMobile
    ? page * ITEMS_PER_PAGE < sortedAttractions.length
    : page < totalPages;

  // Reset page when filters change — but not on the first render, so a
  // deep-linked ?page=N from the URL survives mount (WEB-UX-001).
  const isFirstFilterChange = useRef(true);
  useEffect(() => {
    if (isFirstFilterChange.current) {
      isFirstFilterChange.current = false;
      return;
    }
    setPage(1);
  }, [searchQuery, selectedType, minRating, featuredOnly, sortBy]);

  // Keep the URL in sync with the active filters (shareable + back-nav restore).
  useUrlFilters({
    managed: {
      q: searchQuery,
      type: selectedType !== "all" ? selectedType : undefined,
      rating: minRating !== "any-rating" ? minRating : undefined,
      featured: featuredOnly !== "all" ? featuredOnly : undefined,
      sort: sortBy !== "rating" ? sortBy : undefined,
      view: viewMode !== "list" ? viewMode : undefined,
      page: page > 1 ? page : undefined,
    },
    apply: (params) => {
      setSearchQuery(getStringParam(params, "q"));
      setSelectedType(getStringParam(params, "type", "all"));
      setMinRating(getStringParam(params, "rating", "any-rating"));
      setFeaturedOnly(getStringParam(params, "featured", "all"));
      setSortBy(getStringParam(params, "sort", "rating"));
      setViewMode(getStringParam(params, "view", "list"));
      setPage(getNumberParam(params, "page", 1));
    },
  });

  // Announce result count to screen readers
  useEffect(() => {
    if (!isLoading && filteredAttractions) {
      const count = filteredAttractions.length;
      const context = searchQuery ? ` matching "${searchQuery}"` : '';
      announce(`Found ${count} attraction${count !== 1 ? 's' : ''}${context}`);
    }
  }, [filteredAttractions?.length, isLoading, searchQuery, announce]);

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedType !== "all") count++;
    if (minRating !== "any-rating") count++;
    if (featuredOnly !== "all") count++;
    return count;
  };

  const hasActiveFilters = getActiveFiltersCount() > 0;

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setMinRating("any-rating");
    setFeaturedOnly("all");
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  // Filter-trigger refs. On closing the mobile sheet we return focus to whichever
  // trigger opened it (a11y, WEB-UX-003).
  const filtersRef = useRef<HTMLDivElement>(null);
  const heroFilterBtnRef = useRef<HTMLButtonElement>(null);
  const stickyFilterBtnRef = useRef<HTMLButtonElement>(null);
  const lastFilterTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handleStickyFilterClick = () => {
    if (isMobile) {
      lastFilterTriggerRef.current = stickyFilterBtnRef.current;
      setShowMobileFilters(true);
    } else {
      setShowFilters(true);
      filtersRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Removable active-filter chips, visible at all viewports (WEB-UX-003).
  const activeChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (searchQuery) {
      chips.push({ key: "search", label: `Search: "${searchQuery}"`, onRemove: () => setSearchQuery("") });
    }
    if (selectedType !== "all") {
      chips.push({ key: "type", label: `Type: ${selectedType}`, onRemove: () => setSelectedType("all") });
    }
    if (minRating !== "any-rating") {
      chips.push({ key: "rating", label: `Rating: ${minRating}+`, onRemove: () => setMinRating("any-rating") });
    }
    if (featuredOnly !== "all") {
      chips.push({ key: "featured", label: "Featured Only", onRemove: () => setFeaturedOnly("all") });
    }
    return chips;
  }, [searchQuery, selectedType, minRating, featuredOnly]);

  const pageTitle = searchQuery
    ? `"${searchQuery}" Attractions in Des Moines`
    : selectedType !== "all"
    ? `${selectedType} Attractions in Des Moines`
    : "Des Moines Attractions - Museums, Parks & Things to Do";

  const pageDescription = `Discover ${filteredAttractions.length}+ attractions in Des Moines, Iowa. Explore museums, parks, entertainment venues, and cultural destinations. Find visitor information, hours, and directions for the best things to do in Des Moines.`;

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Attractions", url: "/attractions" },
  ];

  const faqData = [
    {
      question: "What are the top attractions in Des Moines?",
      answer: `Des Moines features ${filteredAttractions.length}+ attractions including Science Center of Iowa (interactive STEM exhibits), Blank Park Zoo (year-round animal exhibits), Pappajohn Sculpture Park (free outdoor art), Iowa State Capitol (free guided tours), and the Des Moines Art Center (free admission).`,
    },
    {
      question: "Are there free attractions in Des Moines?",
      answer: "Yes! Many Des Moines attractions offer free admission including Pappajohn Sculpture Park, Des Moines Art Center, Iowa State Capitol tours, State Historical Museum of Iowa, and various neighborhood parks.",
    },
    {
      question: "What are the best family attractions in Des Moines?",
      answer: "Top family-friendly attractions include Science Center of Iowa (hands-on exhibits), Blank Park Zoo, Adventureland Park (amusement rides), Living History Farms (interactive farm activities), and various splash pads and playgrounds.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/attractions")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        keywords={[
          "Des Moines attractions",
          "things to do Des Moines",
          "Des Moines museums",
          "Des Moines parks",
          "Iowa attractions",
          "Des Moines tourism",
          "family attractions Des Moines",
          "Des Moines sightseeing",
        ]}
      />

      <Header />

      {/* Hero Section with DMI Brand Colors */}
      <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Discover Des Moines Attractions
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Explore museums, parks, entertainment venues, and cultural
            attractions throughout the capital city
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search attractions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      addRecentSearch('attractions', searchQuery);
                    }
                  }}
                  className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  aria-label="Search attractions"
                  role="searchbox"
                />
                <SearchAutocomplete
                  contentType="attractions"
                  value={searchQuery}
                  onSelect={setSearchQuery}
                  inputRef={searchInputRef}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSurpriseMe}
                  disabled={!filteredAttractions || filteredAttractions.length === 0}
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                  variant="secondary"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Surprise Me
                </Button>
                {/* Filter Button - Mobile Sheet or Desktop Toggle */}
                {isMobile ? (
                  <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
                    <SheetTrigger asChild>
                      <Button
                        ref={heroFilterBtnRef}
                        onClick={() => { lastFilterTriggerRef.current = heroFilterBtnRef.current; }}
                        variant="secondary"
                        className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12 relative"
                      >
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Filters
                        {hasActiveFilters && (
                          <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {getActiveFiltersCount()}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="bottom"
                      className="h-[85vh]"
                      onCloseAutoFocus={(e) => {
                        // Return focus to the trigger that opened the sheet (a11y).
                        if (lastFilterTriggerRef.current) {
                          e.preventDefault();
                          lastFilterTriggerRef.current.focus();
                        }
                      }}
                    >
                      <SheetHeader>
                        <SheetTitle className="text-xl">Filter Attractions</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                        {/* Mobile Filter Content */}
                        <div className="space-y-6">
                          {/* Type Filter */}
                          <div className="space-y-2">
                            <label className="text-base font-medium">
                              Attraction Type
                            </label>
                            <Select value={selectedType} onValueChange={setSelectedType}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {attractionTypes?.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Rating Filter */}
                          <div className="space-y-2">
                            <label className="text-base font-medium">
                              Minimum Rating
                            </label>
                            <Select value={minRating} onValueChange={setMinRating}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any-rating">Any Rating</SelectItem>
                                <SelectItem value="4.5">4.5+ Stars</SelectItem>
                                <SelectItem value="4.0">4.0+ Stars</SelectItem>
                                <SelectItem value="3.5">3.5+ Stars</SelectItem>
                                <SelectItem value="3.0">3.0+ Stars</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Featured Filter */}
                          <div className="space-y-2">
                            <label className="text-base font-medium">
                              Featured
                            </label>
                            <Select value={featuredOnly} onValueChange={setFeaturedOnly}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Attractions</SelectItem>
                                <SelectItem value="featured">Featured Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Mobile Filter Actions */}
                        <div className="flex gap-3 pt-4">
                          <Button variant="outline" onClick={handleClearFilters} className="flex-1">
                            Clear All
                          </Button>
                          <Button onClick={() => setShowMobileFilters(false)} className="flex-1">
                            Show {filteredAttractions?.length || 0} Results
                          </Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Button
                    onClick={() => setShowFilters(!showFilters)}
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                )}
                <div className="flex items-center rounded-md bg-white/20 p-0.5">
                  <Button
                    onClick={() => setViewMode('list')}
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    className={viewMode === 'list' ? 'bg-white/30 text-white h-11' : 'text-white/70 hover:bg-white/30 hover:text-white h-11'}
                    aria-label="Switch to list view"
                    title="Switch to list view"
                  >
                    <List className="h-5 w-5" />
                  </Button>
                  <Button
                    onClick={() => setViewMode('map')}
                    variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                    size="icon"
                    className={viewMode === 'map' ? 'bg-white/30 text-white h-11' : 'text-white/70 hover:bg-white/30 hover:text-white h-11'}
                    aria-label="Switch to map view"
                    title="Switch to map view"
                  >
                    <Map className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky condensed search + filter trigger + result count (WEB-UX-003) */}
      <StickyFilterBar
        ref={stickyFilterBtnRef}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search attractions..."
        searchAriaLabel="Search attractions"
        activeFilterCount={getActiveFiltersCount()}
        onFilterClick={handleStickyFilterClick}
        resultCount={filteredAttractions.length}
        isLoading={isLoading}
        resultNoun="attraction"
      />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Attractions" },
          ]}
        />
        <div className="flex gap-8">
        <div className="flex-1 min-w-0">

        {/* Filters Section */}
        {showFilters && (
          <div ref={filtersRef} className="bg-white rounded-2xl shadow-lg p-6 mb-8 border scroll-mt-36">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Attraction Type
                </label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {attractionTypes?.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Rating Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Minimum Rating
                </label>
                <Select value={minRating} onValueChange={setMinRating}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any-rating">Any Rating</SelectItem>
                    <SelectItem value="4.5">4.5+ Stars</SelectItem>
                    <SelectItem value="4.0">4.0+ Stars</SelectItem>
                    <SelectItem value="3.5">3.5+ Stars</SelectItem>
                    <SelectItem value="3.0">3.0+ Stars</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Featured Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Featured
                </label>
                <Select value={featuredOnly} onValueChange={setFeaturedOnly}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Attractions</SelectItem>
                    <SelectItem value="featured">Featured Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
              <div className="text-sm text-gray-500">
                {filteredAttractions?.length || 0} attractions found
              </div>
            </div>
          </div>
        )}

        {/* Screen reader announcement for result count changes */}
        <div {...regionProps}>{announcement}</div>

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {searchQuery
              ? `Search results for "${searchQuery}"`
              : selectedType && selectedType !== "all"
              ? `${selectedType} Attractions`
              : "Des Moines Attractions"}
          </h2>
          <SortDropdown
            options={ATTRACTION_SORT_OPTIONS}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>

        {/* Active filter chips — removable, visible at all viewports (WEB-UX-003) */}
        <ActiveFilterChips chips={activeChips} onClearAll={handleClearFilters} className="mb-4" />


        {viewMode === 'map' ? (
          <AttractionsMap attractions={sortedAttractions} />
        ) : isLoading ? (
          <CardsGridSkeleton count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" label={searchQuery ? `Searching for "${searchQuery}"...` : selectedType !== "all" ? `Loading ${selectedType} attractions...` : "Loading attractions..."} />
        ) : error ? (
          <ErrorState
            error={error}
            resourceLabel="attractions"
            onRetry={() => refetch()}
            compact={isMobile}
          />
        ) : sortedAttractions.length === 0 ? (
          <EmptyState
            icon={searchQuery || selectedType !== "all" || minRating !== "any-rating" || featuredOnly !== "all" ? SearchX : Landmark}
            title={searchQuery ? `No results for "${searchQuery}"` : "No attractions found"}
            description={
              searchQuery || selectedType !== "all" || minRating !== "any-rating" || featuredOnly !== "all"
                ? "Try adjusting your search criteria or filters to find more attractions."
                : "No attractions available at the moment. Check back soon!"
            }
            actions={
              searchQuery || selectedType !== "all" || minRating !== "any-rating" || featuredOnly !== "all"
                ? [
                    { label: "Clear Filters", onClick: handleClearFilters, variant: "outline" as const, icon: X },
                    { label: "Browse All Attractions", onClick: () => { handleClearFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
                  ]
                : undefined
            }
            compact={isMobile}
          />
        ) : (
          <>
            {/* Results count */}
            <p className="text-sm text-muted-foreground mb-4">
              {isMobile
                ? `Showing ${Math.min(paginatedAttractions.length, sortedAttractions.length)} of ${sortedAttractions.length} attractions`
                : `Showing ${Math.min((page - 1) * ITEMS_PER_PAGE + 1, sortedAttractions.length)}-${Math.min(page * ITEMS_PER_PAGE, sortedAttractions.length)} of ${sortedAttractions.length} attractions`}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedAttractions.map((attraction) => (
                <AttractionListCard
                  key={attraction.id}
                  attraction={attraction}
                  onPrefetch={prefetchAttraction}
                />
              ))}
            </div>

            {/* Pagination controls */}
            {sortedAttractions.length > ITEMS_PER_PAGE && (
              <div className="mt-8">
                {isMobile ? (
                  hasMorePages && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Load More Attractions
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
                              window.scrollTo({ top: 0, behavior: 'smooth' });
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
                                window.scrollTo({ top: 0, behavior: 'smooth' });
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
                              window.scrollTo({ top: 0, behavior: 'smooth' });
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
      </div>

      {/* Sidebar Ad - Desktop Only */}
      <aside className="hidden lg:block w-[160px] flex-shrink-0" aria-label="Sidebar advertisement">
        <div className="sticky top-24">
          <AdBanner placement="sidebar" />
        </div>
      </aside>
      </div>
      </div>

      {/* Featured Spot Ad */}
      <div className="py-6 bg-muted/10">
        <div className="container mx-auto px-4">
          <AdBanner placement="featured_spot" />
        </div>
      </div>

      {/* Browse Attractions By Type - Internal Linking for SEO */}
      {attractionTypes.length > 0 && (
        <section className="py-12 bg-white border-t">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Browse Attractions By Type
            </h2>
            <p className="text-gray-600 mb-6">
              Explore Des Moines attractions by category to find exactly what you're looking for
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {attractionTypes.map((type) => {
                const count = allAttractions.filter((a) => a.type === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center justify-between p-3 rounded-xl border hover:border-[#2D1B69] hover:bg-[#2D1B69]/5 transition-colors text-left group"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-[#2D1B69]">
                        {type}
                      </span>
                      <span className="block text-xs text-gray-500">{count} attractions</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#2D1B69]" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Below-Fold Ad */}
      <div className="py-6 bg-muted/20">
        <div className="container mx-auto px-4">
          <AdBanner placement="below_fold" />
        </div>
      </div>

      {/* SEO Content Section - Things to Do */}
      <section className="py-12 bg-gray-50 border-t">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Things to Do in Des Moines, Iowa
          </h2>
          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-4">
            <p>
              Des Moines, the capital city of Iowa, offers a diverse array of attractions that cater to
              every interest and age group. From world-class museums and interactive science centers to
              sprawling parks and outdoor recreation, there's something for everyone in the Greater Des
              Moines Area. Our comprehensive guide covers {allAttractions.length}+ attractions to help
              you plan the perfect visit.
            </p>
            <p>
              Whether you're a local looking for new weekend activities or a tourist planning a trip to
              central Iowa, Des Moines delivers with attractions like the Pappajohn Sculpture Park (one
              of the largest free outdoor sculpture parks in the country), the Des Moines Art Center
              (offering free admission to internationally recognized collections), and the Science Center
              of Iowa (featuring hands-on exhibits and an IMAX theater). Families will love Blank Park
              Zoo, Adventureland Park, and the city's extensive network of playgrounds and splash pads.
            </p>
            <p>
              Use the filters above to narrow down attractions by type, rating, or featured status. Switch
              to map view to find attractions near you. Each attraction page includes visitor information,
              directions, and tips to make the most of your visit to Des Moines.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Attractions - Frequently Asked Questions"
            description="Common questions about attractions, museums, and things to see in Des Moines, Iowa."
            faqs={[
              {
                question: "What are the top attractions in Des Moines?",
                answer: "Des Moines features 50+ attractions including Science Center of Iowa (interactive STEM exhibits and IMAX theater), Blank Park Zoo (year-round animal exhibits with over 100 species), Pappajohn Sculpture Park (free outdoor art gallery with 31 sculptures), Iowa State Capitol (free guided tours of the historic building), Living History Farms (interactive 500-acre farm experience), Des Moines Art Center (free admission to world-class art collections), Greater Des Moines Botanical Garden (indoor and outdoor gardens), and Adventureland Park (major amusement park with rides and water park). Our platform provides current hours, admission prices, and accessibility information for all attractions."
              },
              {
                question: "Are there free attractions in Des Moines?",
                answer: "Yes! Many Des Moines attractions offer free admission: Pappajohn Sculpture Park (downtown public art), Des Moines Art Center (free permanent collection), Iowa State Capitol tours (free guided tours), State Historical Museum of Iowa (free admission), Salisbury House & Gardens (free grounds access), Western Gateway Park (sculptures and trails), Gray's Lake Park (walking trails and beach), Principal Riverwalk (scenic downtown walking path), and various neighborhood parks. Several museums offer free admission days monthly. Check our Attractions page with the 'Free' filter for current free options."
              },
              {
                question: "What are the best family attractions in Des Moines?",
                answer: "Des Moines excels in family-friendly attractions: Science Center of Iowa (hands-on exhibits for all ages), Blank Park Zoo (educational animal experiences), Adventureland Park (amusement rides and water park for all ages), Living History Farms (interactive farm activities), Laser Quest (laser tag arena), Skyzone (trampoline park), various splash pads and playgrounds throughout the metro, Civic Center Broadway shows and family performances, and seasonal activities like pumpkin patches and Christmas displays. Our platform indicates age appropriateness and family amenities for each attraction."
              },
              {
                question: "What museums are in Des Moines?",
                answer: "Des Moines museums include Des Moines Art Center (modern and contemporary art with free admission), State Historical Museum of Iowa (Iowa history and culture), Science Center of Iowa (STEM exhibits and planetarium), Salisbury House & Gardens (historic mansion and art collection), World Food Prize Hall of Laureates (global food security), Hoyt Sherman Place (art gallery and historic theater), and various specialized museums. Most museums offer educational programs, special exhibitions, and guided tours. Check our Attractions page for current exhibits, hours, and special events at each museum."
              },
              {
                question: "What outdoor attractions are available in Des Moines?",
                answer: "Des Moines offers extensive outdoor attractions: Gray's Lake Park (177-acre park with trails and beach), Raccoon River Park (1,500 acres with trails and lodge), Pappajohn Sculpture Park (outdoor art), Greater Des Moines Botanical Garden (outdoor gardens), Water Works Park (1,500 acres along Raccoon River), Principal Riverwalk (downtown river trails), Maffitt Lake (fishing and wildlife), Big Creek State Park (nearby with 900-acre lake), and 100+ neighborhood parks and playgrounds. Seasonal activities include kayaking, paddleboarding, biking, hiking, and cross-country skiing."
              },
              {
                question: "Do Des Moines attractions require advance tickets?",
                answer: "Ticket requirements vary by attraction. Popular attractions like Science Center of Iowa and Blank Park Zoo accept walk-ins but recommend online tickets during peak seasons (summer, weekends, holidays) to guarantee entry and skip lines. Adventureland Park offers online discounts for advance purchase. Special events and shows at Civic Center require advance tickets. Most museums and parks accept walk-ins year-round. Our attraction pages include ticketing information, online purchase links, and recommendations for advance booking based on season and day of week."
              },
              {
                question: "Are Des Moines attractions accessible for people with disabilities?",
                answer: "Yes! Des Moines attractions prioritize accessibility. Major attractions like Science Center of Iowa, Blank Park Zoo, Des Moines Art Center, and Iowa State Capitol offer wheelchair accessibility, accessible parking, accessible restrooms, and accommodations for various disabilities. Many attractions provide sensory-friendly hours, assistive listening devices, and trained staff. Our platform indicates specific accessibility features for each attraction including wheelchair access, accessible parking, sensory accommodations, and service animal policies. Contact attractions directly for specific accommodation needs."
              },
              {
                question: "What seasonal attractions are available in Des Moines?",
                answer: "Des Moines offers seasonal attractions year-round: Spring (tulip displays at botanical gardens, Easter events), Summer (outdoor festivals, farmers markets, water parks, outdoor concerts), Fall (pumpkin patches, corn mazes, Oktoberfest, Iowa State Fair in August), Winter (holiday light displays, ice skating at Brenton Skating Plaza, indoor attractions). The Iowa State Fair in August is the state's largest event attracting 1+ million visitors. Check our Attractions page filtered by current season for relevant activities and special seasonal exhibitions."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}
