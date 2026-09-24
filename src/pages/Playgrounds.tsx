import { HubArticles } from "@/components/seo/HubArticles";
import { RelatedLinks } from "@/components/seo/InternalLinks";
import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import ItemListSchema from "@/components/schema/ItemListSchema";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { FAQSection } from "@/components/FAQSection";
import {
  formatMilesAway,
  sortByDistanceFrom,
  usePlaygroundFacets,
  usePlaygrounds,
} from "@/hooks/usePlaygrounds";
import { useGeolocation } from "@/hooks/useProximitySearch";
import { useToast } from "@/hooks/use-toast";
import { BackToTop } from "@/components/BackToTop";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardContent,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Star, Filter, List, Map, TreePine, SlidersHorizontal, ChevronRight, LocateFixed } from "lucide-react";
// map-pin and users render once per card. Both are multi-shape lucide icons, so
// the sprite costs 2 nodes where inline costs 3 and 5 - see the membership rules
// in scripts/generate-icon-sprite.mjs. Measured saving on this route: 154 of
// 2,388 elements (WEB-PERF-023).
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { Link } from "react-router-dom";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { OptimizedImage } from "@/components/OptimizedImage";
import { createSlug } from "@/lib/slug";

// Lazy load map to prevent react-leaflet bundling issues
const PlaygroundsMap = lazy(() => import("@/components/PlaygroundsMap"));


/** One boolean URL filter, rendered as a pressed/unpressed toggle. */
interface FacilityToggle {
  key: string;
  label: string;
  on: boolean;
  onToggle: () => void;
}

interface PlaygroundFilterFieldsProps {
  /** Distinct per render site so the label/trigger ids never collide. */
  idPrefix: string;
  layout: "stack" | "grid";
  ageRanges: string[];
  ageValue: string;
  onAgeChange: (v: string) => void;
  locations: string[];
  locationCounts: Record<string, number>;
  locationValue: string;
  onLocationChange: (v: string) => void;
  featuredValue: string;
  onFeaturedChange: (v: string) => void;
  toggles: FacilityToggle[];
  selectedAmenities: string[];
  onClearAmenities: () => void;
}

/**
 * The filter controls, once. The mobile sheet and the desktop panel rendered
 * two hand-kept copies, which is how the mobile triggers ended up with no
 * accessible name and both ended up with the same five dead Location options
 * (explore plan WP4 items 1 and 8).
 */
function PlaygroundFilterFields({
  idPrefix,
  layout,
  ageRanges,
  ageValue,
  onAgeChange,
  locations,
  locationCounts,
  locationValue,
  onLocationChange,
  featuredValue,
  onFeaturedChange,
  toggles,
  selectedAmenities,
  onClearAmenities,
}: PlaygroundFilterFieldsProps) {
  const labelClass = layout === "stack" ? "text-base font-medium" : "text-sm font-medium text-foreground";
  const triggerClass = layout === "stack" ? "input-mobile" : undefined;
  return (
    <div
      className={
        layout === "stack"
          ? "space-y-6"
          : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      }
    >
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-age`} className={labelClass}>
          Age Range
        </label>
        <Select value={ageValue} onValueChange={onAgeChange}>
          <SelectTrigger id={`${idPrefix}-age`} className={triggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ages</SelectItem>
            {ageRanges.map((range) => (
              <SelectItem key={range} value={range}>
                {range}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-location`} className={labelClass}>
          Location
        </label>
        <Select value={locationValue} onValueChange={onLocationChange}>
          <SelectTrigger id={`${idPrefix}-location`} className={triggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any-location">Any location</SelectItem>
            {/* Only suburbs read from metro rows, each with the number of
                playgrounds the filter will return for it. */}
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc} ({locationCounts[loc] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-featured`} className={labelClass}>
          Featured
        </label>
        <Select value={featuredValue} onValueChange={onFeaturedChange}>
          <SelectTrigger id={`${idPrefix}-featured`} className={triggerClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Playgrounds</SelectItem>
            <SelectItem value="featured">Featured Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className={labelClass}>Must have</legend>
        <div className="flex flex-wrap gap-2 pt-2">
          {toggles.map((t) => (
            <Button
              key={t.key}
              type="button"
              variant={t.on ? "default" : "outline"}
              size="sm"
              className="h-11"
              aria-pressed={t.on}
              onClick={t.onToggle}
              data-filter-toggle={t.key}
            >
              {t.label}
            </Button>
          ))}
        </div>
        {selectedAmenities.length > 0 && (
          <p className="text-sm text-muted-foreground pt-1">
            Amenities: {selectedAmenities.join(", ")}{" "}
            <button
              type="button"
              onClick={onClearAmenities}
              className="underline underline-offset-4 text-foreground min-h-11 px-1"
            >
              clear
            </button>
          </p>
        )}
      </fieldset>
    </div>
  );
}

/** A 600px block the map chunk swaps into, so pressing Map shifts nothing. */
function MapSkeleton() {
  return (
    <div
      className="h-[600px] w-full rounded-xl bg-muted animate-pulse"
      role="status"
      aria-label="Loading map"
      data-testid="playgrounds-map-skeleton"
    />
  );
}

/**
 * Pre-plan links carried `location=west-des-moines`, a value the ilike could
 * never match against "West Des Moines". A hyphenated value with no spaces is
 * read as that old slug form.
 */
function normalizeLocationParam(value: string): string {
  return !value.includes(" ") && value.includes("-") ? value.replace(/-/g, " ") : value;
}

export default function Playgrounds() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // URL-synced filters (WEB-UX-035). These lived in local React state, so a
  // filtered view could not be shared or bookmarked and - the everyday cost -
  // tapping into a playground and pressing Back came back to an unfiltered
  // list. useUrlFilters is the same hook /events and /attractions already use.
  //
  // showFilters and showMobileFilters stay local on purpose: they are chrome,
  // not a description of what is being shown.
  const { getStr, getList, setParam, clearParams } = useUrlFilters();

  const urlSearch = getStr("q", "");
  const selectedAgeRange = getStr("age", "all");
  const location = getStr("location", "any-location");
  const featuredOnly = getStr("featured", "all");
  const shadeOnly = getStr("shade", "") === "1";
  const restroomsOnly = getStr("restrooms", "") === "1";
  const accessibleOnly = getStr("accessible", "") === "1";
  const selectedAmenities = getList("amenity");
  // Map vs list is in the URL (explore plan WP4 item 7) so "show me the map of
  // playgrounds with shade" is a link someone can send.
  const viewMode = getStr("view", "list") === "map" ? "map" : "list";

  const setSelectedAgeRange = (v: string) => setParam("age", v, { def: "all" });
  const setLocation = (v: string) => setParam("location", v, { def: "any-location" });
  const setFeaturedOnly = (v: string) => setParam("featured", v, { def: "all" });
  const setViewMode = (v: "list" | "map") => setParam("view", v, { def: "list" });
  const toggleFlag = (key: string, on: boolean) => setParam(key, on ? null : "1");
  const toggleAmenity = (amenity: string) =>
    setParam(
      "amenity",
      selectedAmenities.includes(amenity)
        ? selectedAmenities.filter((a) => a !== amenity)
        : [...selectedAmenities, amenity],
    );

  const locationFilter =
    location !== "any-location" ? normalizeLocationParam(location) : undefined;

  // Local immediate search input; mirrored to the URL debounced with replace,
  // so typing does not stack a history entry per keystroke.
  const [searchQuery, setSearchQuery] = useState(() => urlSearch);
  const [showFilters, setShowFilters] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  // "Near me" is per-visit: the position never goes in the URL.
  const [nearMe, setNearMe] = useState(false);
  const {
    location: userLocation,
    error: locationError,
    isLoading: locating,
    requestLocation,
  } = useGeolocation();

  useEffect(() => {
    if (searchQuery === urlSearch) return;
    const timer = setTimeout(
      () => setParam("q", searchQuery, { def: "", replace: true }),
      300,
    );
    return () => clearTimeout(timer);
  }, [searchQuery, urlSearch, setParam]);

  // Back/forward and shared links: pull the URL value back into the input.
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);

  // WEB-PERF-028 AC4. The hook used to be called with no arguments at all --
  // every playground, every column -- and four filters applied client-side.
  // Age range, suburb and featured now go to Postgres.
  //
  // SEARCH DELIBERATELY STAYS CLIENT-SIDE, and the reason is the amenities
  // column. The box matches a substring inside any element of that text[], and
  // PostgREST cannot express that: `cs` wants a whole element and `ilike` does
  // not apply to arrays. Pushing search to the server would quietly drop every
  // amenity hit. It is also the only control here with no debounce, so a
  // request per keystroke would be the wrong trade even if it were expressible.
  //
  // Shade, restrooms, accessibility and amenities are server-side too (WP4
  // items 4 and 6): each is a whole-value match PostgREST can express.
  const { playgrounds: allPlaygrounds, isLoading, error } = usePlaygrounds({
    // This page renders no total, so it does not pay for one (WEB-PERF-033).
    countMode: "none",
    // No select=* from a public page (WP4 item 5).
    projection: "list",
    age_range: selectedAgeRange !== "all" ? selectedAgeRange : undefined,
    location: locationFilter,
    featuredOnly: featuredOnly === "featured" || undefined,
    shade: shadeOnly || undefined,
    restrooms: restroomsOnly || undefined,
    accessible: accessibleOnly || undefined,
    amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
  });

  // The filter controls and the two "Browse By" grids describe the whole
  // catalogue, so they cannot come from a list that is now filtered. One
  // three-column query covers age ranges, suburbs, amenities and both counts.
  const {
    ageRanges,
    locations,
    amenities: uniqueAmenities,
    ageRangeCounts,
    amenityCounts,
    locationCounts,
  } = usePlaygroundFacets();

  // The Select needs the facet's own spelling to show the current value; an
  // old lowercase or slug-form link is matched to it case-insensitively.
  const locationSelectValue =
    locationFilter === undefined
      ? "any-location"
      : locations.find((l) => l.toLowerCase() === locationFilter.toLowerCase()) ?? location;

  // Age range, suburb and featured are gone from here -- Postgres applied them.
  // What is left is the amenity-aware search described above.
  const filteredPlaygrounds = useMemo(() => {
    if (!searchQuery) return allPlaygrounds;
    const searchLower = searchQuery.toLowerCase();
    return allPlaygrounds.filter(
      (playground) =>
        playground.name.toLowerCase().includes(searchLower) ||
        playground.description?.toLowerCase().includes(searchLower) ||
        playground.location?.toLowerCase().includes(searchLower) ||
        playground.amenities?.some((amenity) =>
          amenity.toLowerCase().includes(searchLower)
        )
    );
  }, [allPlaygrounds, searchQuery]);

  // Near me (WP4 item 7): once a position arrives, sort by distance and show
  // it on each card. Rows without coordinates go last.
  const displayedPlaygrounds = useMemo(() => {
    if (!nearMe || !userLocation) {
      return filteredPlaygrounds.map((p) => ({ ...p, distanceMiles: null as number | null }));
    }
    return sortByDistanceFrom(filteredPlaygrounds, userLocation);
  }, [filteredPlaygrounds, nearMe, userLocation]);

  const handleNearMe = () => {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    setNearMe(true);
    if (!userLocation) requestLocation();
  };

  const facilityToggles: FacilityToggle[] = [
    { key: "shade", label: "Shade", on: shadeOnly, onToggle: () => toggleFlag("shade", shadeOnly) },
    { key: "restrooms", label: "Restrooms", on: restroomsOnly, onToggle: () => toggleFlag("restrooms", restroomsOnly) },
    {
      key: "accessible",
      label: "Accessibility info",
      on: accessibleOnly,
      onToggle: () => toggleFlag("accessible", accessibleOnly),
    },
  ];

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedAgeRange !== "all") count++;
    if (location !== "any-location") count++;
    if (featuredOnly !== "all") count++;
    if (shadeOnly) count++;
    if (restroomsOnly) count++;
    if (accessibleOnly) count++;
    count += selectedAmenities.length;
    return count;
  };

  const hasActiveFilters = getActiveFiltersCount() > 0;

  const handleClearFilters = () => {
    setSearchQuery("");
    clearParams(["q", "age", "location", "featured", "shade", "restrooms", "accessible", "amenity"]);
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  const pageTitle = searchQuery
    ? `"${searchQuery}" Playgrounds in Des Moines`
    : selectedAgeRange && selectedAgeRange !== "all"
    ? `Playgrounds for Ages ${selectedAgeRange} in Des Moines`
    : "Des Moines Playgrounds - Parks, Splash Pads & Family Fun";

  const pageDescription = `Discover ${filteredPlaygrounds.length}+ playgrounds in Des Moines, Iowa: splash pads, accessible equipment and climbing structures, free and open to all ages across the metro.`;

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Playgrounds", url: "/playgrounds" },
  ];

  // No faqData here on purpose. The FAQSection below is passed a fuller set of
  // questions inline; a second array in this file fed nothing, and wiring it in
  // would both replace better answers with worse and risk a second FAQPage on
  // the page, which is the defect SEO-003 removed.

  // The rendered set, capped, so every URL here is a link the crawler can
  // also see on the page. createSlug above is the same function the cards
  // use, so the schema URL and the href cannot drift apart.
  const SCHEMA_LIMIT = 20;
  const schemaItems = filteredPlaygrounds
    .slice(0, SCHEMA_LIMIT)
    .map((item) => ({
      name: item.name,
      url: getCanonicalUrl(`/playgrounds/${createSlug(item.name)}`),
      ...(item.image_url && { image: item.image_url }),
      ...(item.description && { description: item.description }),
    }));

  return (
    <div className="min-h-screen bg-background">
      <ItemListSchema
        name="Playgrounds in Des Moines, Iowa"
        description="Public playgrounds, splash pads and accessible play equipment across the Greater Des Moines area."
        items={schemaItems}
      />
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/playgrounds")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        keywords={[
          "Des Moines playgrounds",
          "Iowa playgrounds",
          "children recreation Des Moines",
          "family activities Des Moines",
          "Des Moines parks",
          "splash pads Des Moines",
          "playground equipment",
          "kids activities Des Moines",
          "family fun Des Moines",
          "accessible playgrounds Des Moines",
          "best playgrounds Iowa",
          "outdoor activities kids Des Moines",
        ]}
      />

      <Header />

      {/* Flat brand hero (WP4 item 9): the purple/emerald/crimson gradient
          was decoration carrying nothing. */}
      <section className="relative bg-[#2D1B69] overflow-hidden min-h-[400px]">
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Discover Des Moines Playgrounds
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Find the perfect playground for your family with splash pads,
            climbing structures, and accessible equipment
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search playgrounds, amenities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  aria-label="Search playgrounds"
                  role="searchbox"
                />
              </div>
              <div className="flex items-center gap-3">
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
                        <SheetTitle className="text-xl">Filter Playgrounds</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)]">
                        <PlaygroundFilterFields
                          idPrefix="pg-mobile"
                          layout="stack"
                          ageRanges={ageRanges}
                          ageValue={selectedAgeRange}
                          onAgeChange={setSelectedAgeRange}
                          locations={locations}
                          locationCounts={locationCounts}
                          locationValue={locationSelectValue}
                          onLocationChange={setLocation}
                          featuredValue={featuredOnly}
                          onFeaturedChange={setFeaturedOnly}
                          toggles={facilityToggles}
                          selectedAmenities={selectedAmenities}
                          onClearAmenities={() => clearParams(["amenity"])}
                        />
                        <div className="flex gap-3 pt-4">
                          <Button variant="outline" onClick={handleClearFilters} className="flex-1">
                            Clear All
                          </Button>
                          <Button onClick={() => setShowMobileFilters(false)} className="flex-1">
                            Show {filteredPlaygrounds?.length || 0} Results
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

      <div id="playground-results" className="container mx-auto px-4 py-8 scroll-mt-20">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Playgrounds" },
          ]}
        />

        {/* Filters Section - Desktop */}
        {!isMobile && showFilters && (
          <div className="bg-card rounded-2xl p-6 mb-8 border" data-testid="playground-filters">
            <PlaygroundFilterFields
              idPrefix="pg-desktop"
              layout="grid"
              ageRanges={ageRanges}
              ageValue={selectedAgeRange}
              onAgeChange={setSelectedAgeRange}
              locations={locations}
              locationCounts={locationCounts}
              locationValue={locationSelectValue}
              onLocationChange={setLocation}
              featuredValue={featuredOnly}
              onFeaturedChange={setFeaturedOnly}
              toggles={facilityToggles}
              selectedAmenities={selectedAmenities}
              onClearAmenities={() => clearParams(["amenity"])}
            />

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
              <div className="text-sm text-muted-foreground">
                {filteredPlaygrounds.length} playgrounds found
              </div>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-2xl font-bold">
            {searchQuery
              ? `Search results for "${searchQuery}"`
              : selectedAgeRange && selectedAgeRange !== "all"
              ? `Playgrounds for Ages ${selectedAgeRange}`
              : "Des Moines Playgrounds"}
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground" aria-live="polite" data-testid="playground-count">
              {isLoading ? "Loading..." : `${filteredPlaygrounds.length} playgrounds`}
            </div>
            <Button
              type="button"
              variant={nearMe && userLocation ? "default" : "outline"}
              className="h-11"
              aria-pressed={nearMe}
              onClick={handleNearMe}
              disabled={locating}
            >
              <LocateFixed className="h-4 w-4 mr-2" aria-hidden="true" />
              {locating ? "Locating..." : "Near me"}
            </Button>
          </div>
        </div>
        {nearMe && locationError && (
          <p className="text-sm text-destructive mb-4" role="alert" data-testid="near-me-error">
            {locationError} The list is in its usual order.
          </p>
        )}

        {/* Map and list share the loading, error and empty states (WP4 item
            7). The map used to render first, so a failed query drew an empty
            map with no explanation. */}
        {isLoading ? (
          viewMode === 'map' ? (
            <MapSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl overflow-hidden border">
                  <div className="aspect-video bg-muted" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : error ? (
          <div className="text-center py-16">
            <TreePine className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">Error Loading Playgrounds</h3>
            <p className="text-muted-foreground">
              Please try again later.
            </p>
          </div>
        ) : filteredPlaygrounds.length === 0 ? (
          <div className="text-center py-16">
            <TreePine className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">No playgrounds found</h3>
            <p className="text-muted-foreground mb-6">
              {hasActiveFilters
                ? "Try adjusting your search criteria or filters"
                : "Check back soon for new playground listings!"}
            </p>
            {hasActiveFilters && (
              <Button onClick={handleClearFilters} variant="outline">
                Clear Filters
              </Button>
            )}
          </div>
        ) : viewMode === 'map' ? (
          // Local boundary: without it the lazy chunk suspended to the route
          // fallback and took the hero and filters off screen.
          <Suspense fallback={<MapSkeleton />}>
            <PlaygroundsMap
              playgrounds={displayedPlaygrounds}
              userLocation={nearMe && userLocation ? userLocation : null}
            />
          </Suspense>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="playground-grid">
            {displayedPlaygrounds.map((playground, index) => (
              <Link
                key={playground.id}
                to={`/playgrounds/${createSlug(playground.name)}`}
                className="block"
              >
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 rounded-2xl overflow-hidden">
                  {playground.image_url ? (
                    <div className="aspect-video overflow-hidden">
                      <OptimizedImage
                        src={playground.image_url}
                        alt={`${playground.name} - Playground in Des Moines`}
                        className="object-cover transition-transform duration-300 hover:scale-105"
                        containerClassName="w-full h-full"
                        // The first row of a three-column grid. Chrome does not start a lazy
                        // image's fetch until layout has run, so the LCP candidate on a listing
                        // page must not be lazy (WEB-SEO-032).
                        priority={index < 3}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <TreePine className="h-12 w-12 text-muted-foreground/50" />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      {playground.age_range && (
                        <Badge
                          variant="outline"
                          className="bg-[#2D1B69]/10 text-[#2D1B69] text-xs"
                        >
                          <SpriteIcon name="users" className="h-3 w-3 mr-1" />
                          Ages {playground.age_range}
                        </Badge>
                      )}
                      {playground.is_featured && (
                        <Badge className="bg-[#DC143C] text-white text-xs">Featured</Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-lg line-clamp-2 mb-2">
                      {playground.name}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {playground.distanceMiles != null && (
                        <div className="font-medium text-foreground" data-testid="playground-distance">
                          {formatMilesAway(playground.distanceMiles)}
                        </div>
                      )}
                      {playground.rating && (
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{playground.rating}/5</span>
                        </div>
                      )}
                      {playground.location && (
                        <div className="flex items-center gap-2">
                          <SpriteIcon name="map-pin" className="h-4 w-4" />
                          <span className="line-clamp-1">{playground.location}</span>
                        </div>
                      )}
                    </div>
                    {playground.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {playground.description}
                      </p>
                    )}
                    {/* Shade and restrooms only when the row says true: a
                        null is unknown, not "no" (WP4 item 4). */}
                    {(playground.has_shade || playground.has_restrooms) && (
                      <div className="flex flex-wrap gap-1 mt-3" data-testid="playground-essentials">
                        {playground.has_shade && (
                          <Badge variant="secondary" className="text-xs">Shade</Badge>
                        )}
                        {playground.has_restrooms && (
                          <Badge variant="secondary" className="text-xs">Restrooms</Badge>
                        )}
                      </div>
                    )}
                    {playground.amenities && playground.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {playground.amenities.slice(0, 3).map((amenity, index) => (
                          <Badge key={index} variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            {/* No check icon. It cost 2 nodes x 75 badges and
                                said nothing the amenity name does not: a badge
                                in this list means the playground HAS that
                                amenity. WEB-PERF-023. */}
                            {amenity}
                          </Badge>
                        ))}
                        {playground.amenities.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{playground.amenities.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Browse by Age Range - Internal Linking for SEO */}
      {ageRanges.length > 0 && (
        <section className="py-12 bg-card border-t">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Browse Playgrounds By Age Group
            </h2>
            <p className="text-gray-600 mb-6">
              Find the right playground for your child's age in the Des Moines area
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {ageRanges.map((range) => {
                const count = ageRangeCounts[range] ?? 0;
                return (
                  <button
                    key={range}
                    onClick={() => {
                      setSelectedAgeRange(range);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex items-center justify-between p-3 rounded-xl border hover:border-[#2D1B69] hover:bg-[#2D1B69]/5 transition-colors text-left group"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-[#2D1B69]">
                        Ages {range}
                      </span>
                      <span className="block text-xs text-gray-500">{count} playgrounds</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-[#2D1B69]" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Browse by Amenity - SEO Internal Linking */}
      {uniqueAmenities.length > 0 && (
        <section className="py-12 bg-gray-50 border-t">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Browse Playgrounds By Amenity
            </h2>
            <p className="text-gray-600 mb-6">
              Find playgrounds with specific features and amenities in Des Moines
            </p>
            {/* A real multi-select now (WP4 item 6): each chip toggles
                ?amenity=a,b, applied server-side with contains(). They used to
                type the amenity into the search box, so two could never be
                combined and none showed as selected. */}
            <div className="flex flex-wrap gap-2" data-testid="amenity-chips">
              {uniqueAmenities.map((amenity) => {
                const count = amenityCounts[amenity] ?? 0;
                const on = selectedAmenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAmenity(amenity)}
                    className={
                      on
                        ? "inline-flex items-center gap-1.5 px-3 min-h-11 rounded-full border border-emerald-600 bg-emerald-600 text-white transition-colors text-sm"
                        : "inline-flex items-center gap-1.5 px-3 min-h-11 rounded-full border hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-sm group"
                    }
                  >
                    <span className={on ? "" : "text-foreground group-hover:text-emerald-700"}>{amenity}</span>
                    <span className={on ? "text-xs text-white/90" : "text-xs text-muted-foreground"}>({count})</span>
                  </button>
                );
              })}
            </div>
            {selectedAmenities.length > 0 && (
              <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
                {isLoading
                  ? "Updating..."
                  : `${filteredPlaygrounds.length} playgrounds have ${selectedAmenities.join(" + ")}.`}{" "}
                <a href="#playground-results" className="underline underline-offset-4 text-foreground">
                  See the list
                </a>
              </p>
            )}
          </div>
        </section>
      )}

      {/* SEO Content Section */}
      <section className="py-12 bg-card border-t">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Playgrounds & Parks in Des Moines, Iowa
          </h2>
          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-4">
            <p>
              Des Moines and the surrounding metro area offer an extensive network of public
              playgrounds and parks designed for children of all ages. From splash pads and climbing
              structures to accessible equipment and nature play areas, there's something for every
              family in the Greater Des Moines Area.
            </p>
            {/* WP4 item 3. This paragraph asserted hours and amenities for
                every park; neither is a column for most rows. */}
            <p>
              Each park is run by the city it sits in, so hours, seasonal closures and shelter
              bookings come from that city's parks department. Where we have them, listings say
              whether a playground has shade, restrooms, what the surface is and any accessibility
              notes, and they say &quot;not yet confirmed&quot; where we don't.
            </p>
            <p>
              Use the search and filters above to find playgrounds by age range, location, shade,
              restrooms or amenities like splash pads and swings. Press Near me to sort the list by
              distance from where you are, or switch to the map. Each playground page has its
              amenity list, directions and the playgrounds closest to it.
            </p>
            {/* SEO-024. The other half of the /outdoors cross-link. The two
                modules share an audience - a family looking for a playground is
                the same family looking for a flat trail and a park with
                restrooms - and until now the link ran one way only. */}
            <p>
              Several of these playgrounds sit inside the metro's larger parks and along its
              trail network, including the natural playscape at Jester Park and the playground
              at Big Creek State Park.{' '}
              <Link to="/outdoors" className="text-[#2D1B69] underline underline-offset-4">
                Our Des Moines outdoors guide
              </Link>{' '}
              covers those parks in full, with parking, trailheads, dog rules and what stays
              open through winter.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* SEO-014 / SEO-015: the family cluster, linked in both directions.
            /events/kids links back here. */}
        <RelatedLinks
          title="More for families"
          variant="inline"
          className=""
          links={[
            { title: "Kids and family events", href: "/events/kids" },
            { title: "Free events", href: "/events/free" },
            { title: "This weekend", href: "/events/this-weekend" },
            { title: "Attractions", href: "/attractions" },
          ]}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <HubArticles hub="family" />
      </div>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Playgrounds - Frequently Asked Questions"
            description="Common questions about playgrounds, parks, and family outdoor activities in Des Moines, Iowa."
            // SEO-014. The answers this replaces named splash pads,
            // accessibility and shade at specific parks, claimed "100+ mapped
            // playgrounds" (the sitemap carries about seventy) and "recent
            // inspection dates" the listings do not have. They now describe
            // what each listing carries, and the listing carries the facts.
            faqs={[
              {
                question: "What are the best playgrounds in Des Moines?",
                answer: "This guide maps playgrounds across the Des Moines metro. Each one has its own page with its location, the amenities it lists, its age range and its rating where one is recorded, so you can compare them on what matters to your family."
              },
              {
                question: "Are there splash pads or accessible playgrounds in Des Moines?",
                answer: "Yes. Use the amenity filters on this page to show playgrounds that list a splash pad, accessible equipment or other features. Splash pads are seasonal, so check the park operator's schedule before you go."
              },
              {
                question: "What ages are Des Moines playgrounds for?",
                answer: "Each playground page shows the age range recorded for it. Many parks have separate areas for toddlers and older children."
              },
              {
                question: "Can I reserve a park shelter for a party?",
                answer: "Shelters and pavilions are reserved through the city that runs the park, which differs between Des Moines and each suburb. Playground equipment itself is first-come, first-served."
              },
              {
                question: "What else is there for kids in Des Moines?",
                answer: "The Kids and Family events page lists upcoming family events across the metro, and the Free Events page lists everything on the calendar with free admission."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />
      <BackToTop />
    </div>
  );
}
