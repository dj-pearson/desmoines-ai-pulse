import { HubArticles } from "@/components/seo/HubArticles";
import { RelatedLinks } from "@/components/seo/InternalLinks";
import { useState, useMemo, useEffect, lazy, Suspense, useRef, startTransition } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import ItemListSchema from "@/components/schema/ItemListSchema";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { FAQSection } from "@/components/FAQSection";
import { useAttractionTypeCounts, useAttractions } from "@/hooks/useAttractions";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { ActiveFilterChips } from "@/components/filters/ActiveFilterChips";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { useToast } from "@/hooks/use-toast";
import { BackToTop } from "@/components/BackToTop";
import { useAnnounce } from "@/hooks/use-announce";
import { Card, CardContent } from "@/components/ui/card";
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
import { Star, Filter, List, Map, SlidersHorizontal, Landmark, ChevronRight, SearchX, X, ChevronDown, Shuffle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SortDropdown, ATTRACTION_SORT_OPTIONS } from "@/components/SortDropdown";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { FavoriteButton } from "@/components/FavoriteButton";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { SponsoredImpressionMarker } from "@/components/SponsoredImpressionMarker";
import { arrangeSponsored, isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";
import { SearchAutocomplete, addRecentSearch } from "@/components/SearchAutocomplete";
import { usePrefetchAttraction } from "@/hooks/usePrefetchDetail";
import { formatCount } from "@/lib/pluralize";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { attractionOpenStatus } from "@/lib/attractionHours";
import { formatOpenStatusLine } from "@/lib/restaurantHours";

// Lazy load map to prevent react-leaflet bundling issues
const AttractionsMap = lazy(() => import("@/components/AttractionsMap"));

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/** The 600px block the lazy map swaps into, so pressing Map shifts nothing. */
function AttractionsMapSkeleton() {
  return (
    <div
      className="h-[600px] w-full animate-pulse rounded-lg bg-muted"
      role="status"
      aria-label="Loading map"
      data-testid="attractions-map-skeleton"
    />
  );
}

type AttractionRow = ReturnType<typeof useAttractions>["attractions"][number];

interface AttractionFactLineProps {
  attraction: AttractionRow;
}

/**
 * One line of facts a visitor acts on (Explore plan WP3 items 3 and 7): Free,
 * Indoor/Outdoor, Kids, and today's status when the hours say something. Each
 * part renders only when its column is set; nothing renders when none are.
 */
function AttractionFactLine({ attraction }: AttractionFactLineProps) {
  const status = formatOpenStatusLine(attractionOpenStatus(attraction.hours, attraction.hours_summary));
  const facts = [
    attraction.is_free === true ? "Free" : null,
    attraction.is_indoor === true ? "Indoor" : attraction.is_indoor === false ? "Outdoor" : null,
    attraction.is_kid_friendly === true ? "Kids" : null,
    status,
  ].filter((f): f is string => Boolean(f));
  if (facts.length === 0) return null;
  return <p className="text-sm font-medium text-foreground/80">{facts.join(", ")}</p>;
}

export default function Attractions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefetchAttraction = usePrefetchAttraction();
  // Filter states — URL-synced (WEB-UX-001) so views are shareable and survive
  // back/forward. Discrete filters are URL-derived; search keeps a local state
  // for responsive typing and writes to the URL debounced.
  const { getStr, getNum, setParam, clearParams } = useUrlFilters();
  const selectedType = getStr("type", "all");
  const minRating = getStr("rating", "any-rating");
  const featuredOnly = getStr("featured", "all");
  const sortBy = getStr("sort", "rating");
  const setSelectedType = (v: string) => setParam("type", v, { def: "all", resetsPage: true });
  const setMinRating = (v: string) => setParam("rating", v, { def: "any-rating", resetsPage: true });
  const setFeaturedOnly = (v: string) => setParam("featured", v, { def: "all", resetsPage: true });
  const setSortBy = (v: string) => setParam("sort", v, { def: "rating", resetsPage: true });
  // Explore plan WP3 item 7. The hook already applies these server-side; the
  // page never exposed them. "1" in the URL, absent otherwise.
  const freeOnly = getStr("free", "") === "1";
  const kidsOnly = getStr("kids", "") === "1";
  const indoorOnly = getStr("indoor", "") === "1";
  const toggleFlag = (key: "free" | "kids" | "indoor", on: boolean) =>
    setParam(key, on ? "1" : "", { resetsPage: true });

  const urlQ = getStr("q", "");
  const [searchQuery, setSearchQuery] = useState(() => urlQ);
  // Debounced URL write (replace, so typing doesn't spam history).
  useEffect(() => {
    if (searchQuery === urlQ) return;
    const t = setTimeout(
      () => setParam("q", searchQuery, { def: "", resetsPage: true, replace: true }),
      300
    );
    return () => clearTimeout(t);
  }, [searchQuery, urlQ, setParam]);
  // Back/forward & shared links: pull URL changes back into the input.
  useEffect(() => {
    if (urlQ !== searchQuery) setSearchQuery(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const [showFilters, setShowFilters] = useState(true); // Show filters by default
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  // ?view=map, so a shared or reloaded map view comes back as a map (item 9).
  const viewMode = getStr("view", "list") === "map" ? "map" : "list";
  const setViewMode = (v: "list" | "map") =>
    startTransition(() => setParam("view", v, { def: "list" }));
  const location = useLocation();
  /** A real href for a pagination link, keeping every other param. */
  const pageHref = (n: number) => {
    const params = new URLSearchParams(location.search);
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    return qs ? `?${qs}` : location.pathname;
  };

  const ITEMS_PER_PAGE = 30;
  const page = getNum("page", 1);
  /** Accepts a number OR a React-style updater. Three call sites below pass an
   *  updater (Load More / Previous / Next), and before this signature existed
   *  that function was handed straight to setParam, which does String(value) —
   *  serialising the function SOURCE into the ?page= param. getNum then parsed
   *  NaN and fell back to 1, so those controls silently did nothing. Surfaced by
   *  the strict type-check (WEB-CI-007). */
  const setPage = (v: number | ((prev: number) => number)) =>
    setParam("page", typeof v === "function" ? v(page) : v, { def: 1 });

  // WEB-PERF-028 AC4. The hook used to be called with no filters at all --
  // every active attraction, every column in the list projection, on every
  // visit -- with the search, type, rating, featured and sort controls all
  // applied in the two useMemos below. The filters now go to Postgres, so a
  // visitor who has picked a type downloads that type instead of the whole
  // table and then discards most of it.
  //
  // `urlQ` rather than `searchQuery`: the input keeps its own immediate state
  // and writes to the URL on a 300ms debounce (see above). Passing the raw
  // input would fire a request per keystroke.
  const { attractions: allAttractions, isLoading, error, refetch } = useAttractions({
    // This page renders no total, so it does not pay for one (WEB-PERF-033).
    countMode: "none",
    search: urlQ || undefined,
    type: selectedType !== "all" ? selectedType : undefined,
    minRating: minRating !== "any-rating" ? parseFloat(minRating) : undefined,
    featuredOnly: featuredOnly === "featured" || undefined,
    freeOnly: freeOnly || undefined,
    kidFriendlyOnly: kidsOnly || undefined,
    indoorOnly: indoorOnly || undefined,
    sortBy: sortBy === "name_asc" ? "alphabetical" : sortBy === "newest" ? "newest" : "rating",
  });
  const { announce, announcement, regionProps } = useAnnounce();

  // The type list and the "Browse By Type" counts describe the WHOLE catalogue,
  // not the current view, so they cannot be derived from a filtered list any
  // more. One narrow single-column query answers both.
  const { types: attractionTypes, counts: attractionTypeCounts } = useAttractionTypeCounts();
  // The whole active catalogue, not the filtered view (item 11).
  const catalogueTotal = useMemo(
    () => Object.values(attractionTypeCounts).reduce((sum, n) => sum + n, 0),
    [attractionTypeCounts]
  );

  // Postgres has already applied every filter and the sort. Both names are kept
  // because the JSX below reads each of them in a dozen places, and the
  // distinction between "filtered" and "sorted" no longer exists client-side.
  const filteredAttractions = allAttractions;
  // arrangeSponsored still runs client-side: boosting up to two active
  // sponsored listings to the top (WEB-FEAT-005) is not something the ORDER BY
  // expresses, and it must be applied AFTER the sort, exactly as before.
  const sortedAttractions = useMemo(
    () => arrangeSponsored([...allAttractions]),
    [allAttractions]
  );

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

  // Page reset on filter change is handled by setParam({ resetsPage: true }).

  // Announce result count to screen readers
  const resultCount = filteredAttractions.length;
  useEffect(() => {
    if (!isLoading) {
      const count = resultCount;
      const context = searchQuery ? ` matching "${searchQuery}"` : '';
      announce(`Found ${count} attraction${count !== 1 ? 's' : ''}${context}`);
    }
  }, [resultCount, isLoading, searchQuery, announce]);

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedType !== "all") count++;
    if (minRating !== "any-rating") count++;
    if (featuredOnly !== "all") count++;
    if (freeOnly) count++;
    if (kidsOnly) count++;
    if (indoorOnly) count++;
    return count;
  };

  const hasActiveFilters = getActiveFiltersCount() > 0;

  const handleClearFilters = () => {
    setSearchQuery("");
    clearParams(["q", "type", "rating", "featured", "sort", "free", "kids", "indoor"]);
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  const pageTitle = searchQuery
    ? `"${searchQuery}" Attractions in Des Moines`
    : selectedType !== "all"
    ? `${selectedType} Attractions in Des Moines`
    : "Des Moines Attractions - Museums, Parks & Things to Do";

  const pageDescription = catalogueTotal > 0
    ? `${catalogueTotal} attractions across the Des Moines metro: museums, parks, gardens and landmarks, with hours, admission and directions.`
    : "Attractions across the Des Moines metro: museums, parks, gardens and landmarks, with hours, admission and directions.";

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Attractions", url: "/attractions" },
  ];


  // The rendered set, capped, so every URL here is a link the crawler can
  // also see on the page. createSlug above is the same function the cards
  // use, so the schema URL and the href cannot drift apart.
  const SCHEMA_LIMIT = 20;
  const schemaItems = paginatedAttractions
    .slice(0, SCHEMA_LIMIT)
    .map((item) => ({
      name: item.name,
      url: getCanonicalUrl(`/attractions/${createSlug(item.name)}`),
      ...(item.image_url && { image: item.image_url }),
      ...(item.description && { description: item.description }),
    }));

  return (
    <div className="min-h-screen bg-background">
      <ItemListSchema
        name="Attractions in Des Moines, Iowa"
        description="Museums, parks, landmarks and family attractions in the Greater Des Moines area."
        items={schemaItems}
      />
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

      {/* Hero: one solid brand surface at about half the old height
          (Explore plan WP3 item 11). */}
      <section className="bg-[#2D1B69]">
        <div className="container mx-auto px-4 py-10 md:py-12 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 tracking-tight">
            Des Moines Attractions
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-6 max-w-3xl mx-auto">
            Museums, parks, gardens and landmarks across the metro, with today's hours
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
                    <SheetContent side="bottom" className="h-[85vh]">
                      <SheetHeader>
                        <SheetTitle className="text-xl">Filter Attractions</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                        {/* Mobile Filter Content */}
                        <div className="space-y-6">
                          {/* Type Filter */}
                          <div className="space-y-2">
                            <label htmlFor="m-filter-type" className="text-base font-medium">
                              Attraction Type
                            </label>
                            <Select value={selectedType} onValueChange={setSelectedType}>
                              <SelectTrigger id="m-filter-type" className="input-mobile">
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
                            <label htmlFor="m-filter-rating" className="text-base font-medium">
                              Minimum Rating
                            </label>
                            <Select value={minRating} onValueChange={setMinRating}>
                              <SelectTrigger id="m-filter-rating" className="input-mobile">
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
                            <label htmlFor="m-filter-featured" className="text-base font-medium">
                              Featured
                            </label>
                            <Select value={featuredOnly} onValueChange={setFeaturedOnly}>
                              <SelectTrigger id="m-filter-featured" className="input-mobile">
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
                    aria-pressed={viewMode === 'list'}
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
                    aria-pressed={viewMode === 'map'}
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
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Attraction Type
                </label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger aria-label="Attraction Type">
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
                  <SelectTrigger aria-label="Minimum Rating">
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
                  <SelectTrigger aria-label="Featured">
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
                {formatCount(filteredAttractions?.length || 0, 'attraction')} found
              </div>
            </div>
          </div>
        )}

        {/* Free / Kids / Indoors (item 7): one tap each, URL-synced. */}
        <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Quick filters">
          {([
            { key: "free", label: "Free", on: freeOnly },
            { key: "kids", label: "Kid-friendly", on: kidsOnly },
            { key: "indoor", label: "Indoors", on: indoorOnly },
          ] as const).map((chip) => (
            <Button
              key={chip.key}
              type="button"
              variant={chip.on ? "default" : "outline"}
              className="h-11 rounded-full px-5"
              aria-pressed={chip.on}
              onClick={() => toggleFlag(chip.key, !chip.on)}
            >
              {chip.label}
            </Button>
          ))}
        </div>

        {/* Screen reader announcement for result count changes */}
        <div {...regionProps}>{announcement}</div>

        {/* Results Header.
            WEB-UX-031: this was a non-wrapping flex row, and at 320px it could
            not fit. Measured: the row is 288px wide, the h2 shrinks to its
            min-content 124.97px, and SortDropdown is a hard w-[180px] that
            cannot shrink below its own min-content — 124.97 + 180 = 304.97
            against 288 available. The overflow escaped to the document, whose
            scrollWidth then ceiled 320.97 to 321, which is the "1px horizontal
            scroll" this story reported. The 1px was rounding; the real overflow
            was 17px.
            flex-wrap lets the dropdown drop to its own line at that width and
            changes nothing wider, since a row that fits never wraps. */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
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

        {/* Sticky filter bar: result count + removable chips (WEB-UX-003) */}
        <div className="sticky top-16 z-30 py-2 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
          <span className="text-sm font-medium" aria-live="polite">
            {filteredAttractions?.length || 0} result{(filteredAttractions?.length || 0) === 1 ? "" : "s"}
          </span>
          <ActiveFilterChips
            className="mt-2"
            onClearAll={handleClearFilters}
            chips={[
              ...(searchQuery
                ? [{ key: "q", label: `Search: "${searchQuery}"`, onRemove: () => { setSearchQuery(""); setParam("q", "", { resetsPage: true }); } }]
                : []),
              ...(selectedType !== "all"
                ? [{ key: "type", label: `Type: ${selectedType}`, onRemove: () => setSelectedType("all") }]
                : []),
              ...(minRating !== "any-rating"
                ? [{ key: "rating", label: `Rating: ${minRating}+`, onRemove: () => setMinRating("any-rating") }]
                : []),
              ...(featuredOnly !== "all"
                ? [{ key: "featured", label: "Featured only", onRemove: () => setFeaturedOnly("all") }]
                : []),
              ...(freeOnly ? [{ key: "free", label: "Free", onRemove: () => toggleFlag("free", false) }] : []),
              ...(kidsOnly ? [{ key: "kids", label: "Kid-friendly", onRemove: () => toggleFlag("kids", false) }] : []),
              ...(indoorOnly ? [{ key: "indoor", label: "Indoors", onRemove: () => toggleFlag("indoor", false) }] : []),
            ]}
          />
        </div>

        {/* The map goes through the same loading and error states as the
            list. Rendered first, a cold /attractions?view=map drew an empty
            map while loading and on a failed query, with no explanation. */}
        {isLoading ? (
          viewMode === 'map' ? (
            <AttractionsMapSkeleton />
          ) : (
          <CardsGridSkeleton count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" label={searchQuery ? `Searching for "${searchQuery}"...` : selectedType !== "all" ? `Loading ${selectedType} attractions...` : "Loading attractions..."} />
          )
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : viewMode === 'map' ? (
          // Local boundary: the lazy map chunk used to suspend up to the
          // route's fallback and blank the whole page on first toggle.
          <Suspense fallback={<AttractionsMapSkeleton />}>
            <AttractionsMap attractions={sortedAttractions} />
          </Suspense>
        ) : sortedAttractions.length === 0 ? (
          <EmptyState
            icon={hasActiveFilters ? SearchX : Landmark}
            title={searchQuery ? `No results for "${searchQuery}"` : "No attractions found"}
            description={
              hasActiveFilters
                ? "Try adjusting your search criteria or filters to find more attractions."
                : "No attractions available at the moment. Check back soon!"
            }
            actions={
              hasActiveFilters
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
              {paginatedAttractions.map((attraction, index) => (
                <Link
                  key={attraction.id}
                  to={`/attractions/${createSlug(attraction.name)}`}
                  className="block"
                  aria-label={`${isSponsoredActive(attraction) ? "Sponsored: " : ""}${attraction.name}`}
                  onMouseEnter={() => prefetchAttraction(createSlug(attraction.name))}
                  onClick={() => {
                    if (isSponsoredActive(attraction))
                      logSponsoredClick("attraction", attraction.id);
                  }}
                >
                  <Card
                    className={`h-full hover:shadow-lg transition-all duration-200 hover:-translate-y-1 rounded-2xl overflow-hidden ${
                      isSponsoredActive(attraction) ? "ring-2 ring-amber-400 shadow-lg" : ""
                    }`}
                  >
                    <div className="relative">
                      {attraction.image_url ? (
                        <OptimizedImage
                          src={attraction.image_url}
                          alt={`${attraction.name} - ${attraction.type} in Des Moines`}
                          // The first row of a three-column grid. Chrome does not start a lazy
                          // image's fetch until layout has run, so the LCP candidate on a listing
                          // page must not be lazy (WEB-SEO-032).
                          // It used to decide whether the card appeared in the
                          // prerendered HTML at all; WEB-PERF-041 removed that
                          // gate, so now it only decides the fetch.
                          priority={index < 3}
                          width={640}
                          height={360}
                          className="transition-transform duration-200 hover:scale-105 object-cover"
                          containerClassName="aspect-video overflow-hidden"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="aspect-video bg-muted flex items-center justify-center" role="img" aria-label={`No image available for ${attraction.name}`}>
                          <Landmark className="h-12 w-12 text-muted-foreground/60" />
                        </div>
                      )}
                      {/* Sponsored listing treatment (WEB-FEAT-005) */}
                      {isSponsoredActive(attraction) && (
                        <div className="absolute top-3 left-3 z-20">
                          <SponsoredBadge className="shadow-lg" />
                        </div>
                      )}
                      <SponsoredImpressionMarker
                        contentType="attraction"
                        contentId={attraction.id}
                        active={isSponsoredActive(attraction)}
                      />
                      {/* Save (favorite) overlay — stopPropagation handled inside */}
                      <div className="absolute top-3 right-3 z-20">
                        <FavoriteButton
                          contentType="attraction"
                          contentId={attraction.id}
                          itemName={attraction.name}
                          size="icon"
                          variant="ghost"
                          className="h-11 w-11 rounded-full bg-white/90 hover:bg-white shadow-md"
                        />
                      </div>
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
                        {attraction.is_featured && (
                          <Badge className="bg-[#DC143C] text-white text-xs">Featured</Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg line-clamp-2 mb-2">
                        {attraction.name}
                      </h3>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {attraction.rating != null && (
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-hidden="true" />
                            <span>{attraction.rating.toFixed(1)}/5</span>
                          </div>
                        )}
                        <AttractionFactLine attraction={attraction} />
                        {attraction.location && (
                          <div className="flex items-center gap-2">
                            <SpriteIcon name="map-pin" className="h-4 w-4" />
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
                            href={pageHref(page - 1)}
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((p) => Math.max(1, p - 1));
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
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
                              href={pageHref(pageNum)}
                              isActive={pageNum === page}
                              onClick={(e) => {
                                e.preventDefault();
                                setPage(pageNum);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
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
                            href={pageHref(page + 1)}
                            onClick={(e) => {
                              e.preventDefault();
                              setPage((p) => Math.min(totalPages, p + 1));
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
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
              Every type we list, with how many active attractions carry it
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {attractionTypes.map((type) => {
                const count = attractionTypeCounts[type] ?? 0;
                return (
                  <Link
                    key={type}
                    to={`/attractions?type=${encodeURIComponent(type)}`}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="flex items-center justify-between p-3 rounded-xl border hover:border-[#2D1B69] hover:bg-[#2D1B69]/5 transition-colors text-left group"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-[#2D1B69]">
                        {type}
                      </span>
                      <span className="block text-xs text-gray-500">{formatCount(count, 'attraction')}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-[#2D1B69]" aria-hidden="true" />
                  </Link>
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
              Des Moines has museums, parks, gardens, landmarks and family attractions across the
              metro, from downtown to Ankeny and West Des Moines.
              {catalogueTotal > 0 ? ` This guide lists ${catalogueTotal} of them, each with its own page.` : ""}
            </p>
            <p>
              Pappajohn Sculpture Park is a public park downtown, the Des Moines Art Center and the
              Iowa State Capitol are close by, and the Science Center of Iowa and Blank Park Zoo are the
              usual starts for families. The playgrounds guide covers play areas and splash pads.
            </p>
            <p>
              Use Free, Kid-friendly and Indoors above to narrow the list, or switch to the map. Each
              attraction page shows today's hours when we have them, admission, directions and what's on
              nearby.
            </p>
          </div>
        </div>
      </section>

      {/* SEO-011 / SEO-015: the attractions hub linked nowhere outside
          itself. These are the pages that answer the next question. */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <RelatedLinks
          title="Plan the rest of the day"
          variant="grid"
          links={[
            { title: "Events this weekend", href: "/events/this-weekend" },
            { title: "Kids and family events", href: "/events/kids" },
            { title: "Playgrounds", href: "/playgrounds" },
            { title: "Outdoors and trails", href: "/outdoors" },
            { title: "Restaurants", href: "/restaurants" },
            { title: "Things to do", href: "/things-to-do" },
          ]}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <HubArticles hub="attractions" />
      </div>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Attractions - Frequently Asked Questions"
            description="Common questions about attractions, museums, and things to see in Des Moines, Iowa."
            // SEO-011. The answers this replaces asserted admission
            // prices, accessibility, acreage, "over 100 species", "50+
            // attractions" (the sitemap carries 22) and an IMAX theater -
            // the fields the story names as the ones a visitor acts on, with
            // no source in this repo, published as FAQPage schema. There is
            // no price column (only is_free), so no answer promises prices
            // (Explore plan WP3 item 3).
            faqs={[
              {
                question: "What are the top attractions in Des Moines?",
                answer: "This guide lists the attractions we track across the Des Moines metro, including the Science Center of Iowa, Blank Park Zoo, the Iowa State Capitol, the Des Moines Art Center, the Greater Des Moines Botanical Garden and Pappajohn Sculpture Park. Each has its own page with its location, directions and, where we have them, its hours."
              },
              {
                question: "Are there free attractions in Des Moines?",
                answer: "Yes. Pappajohn Sculpture Park is a public park downtown, and several museums and landmarks are free to visit. Tap Free above the list to see the ones marked free admission; for prices at the others, check the attraction's official site."
              },
              {
                question: "What are the best family attractions in Des Moines?",
                answer: "The Science Center of Iowa and Blank Park Zoo are the obvious starts. For more, the Kids and Family events page lists upcoming family events and the playgrounds guide maps parks across the metro."
              },
              {
                question: "Do Des Moines attractions require advance tickets?",
                answer: "It depends on the attraction and the day. Each attraction page links to the official site, which is where ticketing and timed-entry rules are published."
              },
              {
                question: "What is there to do outdoors in Des Moines?",
                answer: "The outdoors guide covers trails and parks, the playgrounds guide covers play areas, and the attractions here include gardens and sculpture parks."
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
