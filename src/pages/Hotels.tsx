import { useState, useRef, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import HotelCard from "@/components/HotelCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, SlidersHorizontal, X, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import AffiliateDisclosureBanner from "@/components/AffiliateDisclosureBanner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useHotels } from "@/hooks/useHotels";
import { useVenues } from "@/hooks/useVenues";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { sanitizePostgrestPattern } from "@/lib/postgrestPattern";
import { formatMiles, nearby } from "@/lib/venuePages";
import type { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

const AREAS = [
  "Downtown",
  "Airport",
  "West Des Moines",
  "Clive",
  "Waukee",
  "Grimes",
  "Ankeny",
  "Urbandale",
  "Johnston",
  "Altoona",
  "Ames",
];

const PRICE_RANGES = ["$", "$$", "$$$", "$$$$"];

const HOTEL_TYPES = [
  "Hotel",
  "Boutique Hotel",
  "Motel",
  "Resort",
  "B&B",
  "Extended Stay",
];

const AMENITY_OPTIONS = [
  "Pool",
  "Fitness Center",
  "Free Breakfast",
  "Free Parking",
  "Pet Friendly",
  "Restaurant On-Site",
  "Bar/Lounge",
  "Business Center",
  "Spa",
  "Airport Shuttle",
  "EV Charging",
  "Suite Available",
];

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
  { value: "rating", label: "Highest Rated" },
  { value: "alphabetical", label: "A-Z" },
  { value: "newest", label: "Newest" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const DEFAULT_SORT: SortOption = "featured";
const NEAR_ANY = "any";

function isSortOption(value: string): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value);
}

/**
 * One grid page. Two full rows of the xl:grid-cols-3 grid: /stay prerendered
 * 3,773 elements inside #root against a median of 496 across all 35 routes,
 * and Lighthouse flags above ~1,500 (WEB-PERF-023). More rows arrive only
 * when someone asks for them with "Show more".
 */
const PAGE_SIZE = 24;

/**
 * With ?near= set, every matching row is fetched and sorted by distance here,
 * because PostgREST has no distance order to ask for. The table is about
 * seventy rows; this is a ceiling, not an expected size.
 */
const NEAR_FETCH_LIMIT = 500;

interface NearPlace {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Places people come for that are not all in `venues`. Wells Fargo Arena is
 * seeded there (20260228000002) and is repeated here so the option exists
 * even while the venues read is loading or has failed; a venues row with the
 * same slug replaces it. The Fairgrounds is not a music venue, so it has no
 * row. Coordinates are the published location of each site.
 */
const FIXED_NEAR_PLACES: NearPlace[] = [
  { slug: "wells-fargo-arena", name: "Wells Fargo Arena", latitude: 41.5908, longitude: -93.6208 },
  { slug: "iowa-state-fairgrounds", name: "Iowa State Fairgrounds", latitude: 41.5964, longitude: -93.5531 },
];

interface HotelFilterValues {
  search?: string;
  area?: string[];
  priceRange?: string[];
  hotelType?: string[];
  amenities?: string[];
  sortBy: SortOption;
}

interface FilterPanelProps {
  /** Keeps ids unique when the panel renders twice (sidebar and sheet). */
  idPrefix: string;
  selectedAreas: string[];
  selectedPriceRanges: string[];
  selectedTypes: string[];
  selectedAmenities: string[];
  onToggleArea: (value: string) => void;
  onTogglePrice: (value: string) => void;
  onToggleType: (value: string) => void;
  onToggleAmenity: (value: string) => void;
  activeFilterCount: number;
  onClearAll: () => void;
}

/**
 * Declared at module level on purpose (plan-stay WP2 item 8). It used to be a
 * component defined inside Hotels, so every toggle created a new component
 * type, React remounted the whole panel, and keyboard focus fell back to the
 * body after each checkbox.
 */
function FilterPanel({
  idPrefix,
  selectedAreas,
  selectedPriceRanges,
  selectedTypes,
  selectedAmenities,
  onToggleArea,
  onTogglePrice,
  onToggleType,
  onToggleAmenity,
  activeFilterCount,
  onClearAll,
}: FilterPanelProps) {
  const checkboxGroup = (
    legend: string,
    key: string,
    options: string[],
    selected: string[],
    onToggle: (value: string) => void,
  ) => (
    <fieldset>
      <legend className="text-sm font-semibold mb-3">{legend}</legend>
      <div className="space-y-1">
        {options.map((option) => {
          const id = `${idPrefix}-${key}-${option.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return (
            <div key={option} className="flex min-h-11 items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(option)}
                onCheckedChange={() => onToggle(option)}
              />
              <Label htmlFor={id} className="flex-1 py-3 text-sm cursor-pointer">
                {option}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-6">
      {checkboxGroup("Area", "area", AREAS, selectedAreas, onToggleArea)}

      <fieldset>
        <legend className="text-sm font-semibold mb-3">Price range</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_RANGES.map((price) => {
            const pressed = selectedPriceRanges.includes(price);
            return (
              <Button
                key={price}
                type="button"
                variant={pressed ? "default" : "outline"}
                aria-pressed={pressed}
                aria-label={`Price ${price}`}
                className="min-h-11 min-w-11 px-3"
                onClick={() => onTogglePrice(price)}
              >
                {price}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {checkboxGroup("Hotel type", "type", HOTEL_TYPES, selectedTypes, onToggleType)}
      {checkboxGroup("Amenities", "amenity", AMENITY_OPTIONS, selectedAmenities, onToggleAmenity)}

      {activeFilterCount > 0 && (
        <Button variant="outline" onClick={onClearAll} className="w-full min-h-11">
          Clear all filters
        </Button>
      )}
    </div>
  );
}

function HotelGridSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3" aria-hidden="true">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </>
  );
}

interface ExtraHotelPageProps {
  filters: HotelFilterValues;
  offset: number;
  excludeIds: Set<string>;
}

/**
 * A page after the first, fetched with the hook's own `offset` (WP2 item 6).
 * Each page is its own query, so asking for more never blanks the rows
 * already on screen.
 */
function ExtraHotelPage({ filters, offset, excludeIds }: ExtraHotelPageProps) {
  const { hotels, isLoading, error, refetch } = useHotels({
    ...filters,
    limit: PAGE_SIZE,
    offset,
  });

  if (isLoading) return <HotelGridSkeleton count={3} />;
  if (error) {
    return (
      <div className="col-span-full">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  return (
    <>
      {hotels
        .filter((h) => !excludeIds.has(h.id))
        .map((hotel) => (
          <HotelCard key={hotel.id} hotel={hotel} />
        ))}
    </>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function Hotels() {
  const { getStr, getList, setParam, clearParams } = useUrlFilters();

  // URL-held filters (WP2 item 7): a shared or reloaded /stay?near=... link
  // has to come back as the same list.
  const nearSlug = getStr("near", "");
  const selectedAreas = getList("area");
  const selectedPriceRanges = getList("price");
  const sortParam = getStr("sort", DEFAULT_SORT);
  const sortBy: SortOption = isSortOption(sortParam) ? sortParam : DEFAULT_SORT;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const clearSearch = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setSearch("");
    setDebouncedSearch("");
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // WP2 item 9. useHotels interpolates the term into .or(), where a comma ends
  // a clause: "Hilton, Downtown" was a 400 and an ErrorState. The hook belongs
  // to the Home plan, so the term is made safe here before it gets there.
  const searchTerm = sanitizePostgrestPattern(debouncedSearch);

  // ---- Near: which place, and its coordinates ------------------------------
  const { data: venues } = useVenues();
  const nearPlaces = useMemo<NearPlace[]>(() => {
    const bySlug = new Map<string, NearPlace>();
    for (const p of FIXED_NEAR_PLACES) bySlug.set(p.slug, p);
    for (const v of venues ?? []) {
      const lat = v.latitude == null ? NaN : Number(v.latitude);
      const lng = v.longitude == null ? NaN : Number(v.longitude);
      if (!v.slug || !v.name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      bySlug.set(v.slug, { slug: v.slug, name: v.name, latitude: lat, longitude: lng });
    }
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [venues]);
  const nearPlace = nearSlug ? nearPlaces.find((p) => p.slug === nearSlug) ?? null : null;

  const baseFilters: HotelFilterValues = {
    search: searchTerm || undefined,
    area: selectedAreas.length > 0 ? selectedAreas : undefined,
    priceRange: selectedPriceRanges.length > 0 ? selectedPriceRanges : undefined,
    hotelType: selectedTypes.length > 0 ? selectedTypes : undefined,
    amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
    sortBy,
  };

  const { hotels, isLoading, totalCount, error: hotelsError, refetch } = useHotels(
    nearPlace
      ? { ...baseFilters, sortBy: "alphabetical", limit: NEAR_FETCH_LIMIT }
      : { ...baseFilters, limit: PAGE_SIZE },
  );

  // WEB-PERF-028 AC3: the featured strip has its own three-row query.
  const { hotels: featuredHotels } = useHotels({
    featuredOnly: true,
    sortBy: "featured",
    limit: 3,
  });

  const activeFilterCount =
    selectedAreas.length +
    selectedPriceRanges.length +
    selectedTypes.length +
    selectedAmenities.length;
  const hasQuery = Boolean(searchTerm) || activeFilterCount > 0;

  // ---- Paging: reset to one page whenever the question changes -------------
  const filterKey = JSON.stringify([searchTerm, selectedAreas, selectedPriceRanges, selectedTypes, selectedAmenities, sortBy, nearPlace?.slug ?? ""]);
  const [paging, setPaging] = useState({ key: filterKey, extra: 0 });
  const extraPages = paging.key === filterKey ? paging.extra : 0;
  const showMore = () => setPaging({ key: filterKey, extra: extraPages + 1 });

  // ---- Near: order by straight-line distance -------------------------------
  const nearRows = useMemo<Array<{ hotel: Hotel; miles: number | null }> | null>(() => {
    if (!nearPlace) return null;
    const located = nearby(nearPlace, hotels, {
      maxMiles: Number.POSITIVE_INFINITY,
      limit: Number.POSITIVE_INFINITY,
    });
    const seen = new Set(located.map((r) => r.item.id));
    // A hotel with no stored coordinates has an unknown distance, not a large
    // one. It stays in the list, last, with no distance printed.
    const unlocated = hotels.filter((h) => !seen.has(h.id));
    return [
      ...located.map((r) => ({ hotel: r.item, miles: r.miles })),
      ...unlocated.map((hotel) => ({ hotel, miles: null })),
    ];
  }, [nearPlace, hotels]);

  // WP2 item 10: featured hotels rendered twice, once in the strip and again
  // at the top of the featured-first grid.
  const showFeaturedStrip =
    !nearPlace && !hasQuery && featuredHotels.length > 0;
  const featuredIds = useMemo(
    () => new Set(showFeaturedStrip ? featuredHotels.map((h) => h.id) : []),
    [showFeaturedStrip, featuredHotels],
  );

  const shownCount = Math.min(totalCount, PAGE_SIZE * (1 + extraPages));
  const hasMore = shownCount < totalCount;

  const clearAllFilters = () => {
    clearParams(["near", "area", "price", "sort"]);
    setSelectedTypes([]);
    setSelectedAmenities([]);
    clearSearch();
  };

  const onToggleArea = (v: string) => setParam("area", toggle(selectedAreas, v));
  const onTogglePrice = (v: string) => setParam("price", toggle(selectedPriceRanges, v));
  const onToggleType = (v: string) => setSelectedTypes((a) => toggle(a, v));
  const onToggleAmenity = (v: string) => setSelectedAmenities((a) => toggle(a, v));

  const panelProps = {
    selectedAreas,
    selectedPriceRanges,
    selectedTypes,
    selectedAmenities,
    onToggleArea,
    onTogglePrice,
    onToggleType,
    onToggleAmenity,
    activeFilterCount,
    onClearAll: clearAllFilters,
  };

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [
    ...selectedAreas.map((v) => ({ key: `area-${v}`, label: v, onRemove: () => onToggleArea(v) })),
    ...selectedPriceRanges.map((v) => ({ key: `price-${v}`, label: v, onRemove: () => onTogglePrice(v) })),
    ...selectedTypes.map((v) => ({ key: `type-${v}`, label: v, onRemove: () => onToggleType(v) })),
    ...selectedAmenities.map((v) => ({ key: `amenity-${v}`, label: v, onRemove: () => onToggleAmenity(v) })),
  ];

  const resultLine = isLoading
    ? "Loading..."
    : hasMore
      ? `Showing ${shownCount} of ${totalCount} hotels`
      : `${totalCount} hotel${totalCount !== 1 ? "s" : ""}`;

  return (
    <>
      <Helmet>
        <title>Hotels in Des Moines - Where to Stay | Des Moines Insider</title>
        <meta
          name="description"
          content="Find the best hotels in Des Moines, Iowa. Browse downtown hotels, West Des Moines accommodations, and hotels near popular event venues. Book your stay today."
        />
        <meta name="keywords" content="Des Moines hotels, where to stay Des Moines, hotels downtown Des Moines, West Des Moines hotels, Iowa hotels" />
        {/* WEB-SEO-002: was a RELATIVE canonical (href="/stay"). Valid, but an
            absolute URL is unambiguous for crawlers and matches every other page. */}
        <link rel="canonical" href={getCanonicalUrl('/stay')} />
        {/* WEB-SEO-002: these pages set only title/description, so index.html's
            static og: and twitter: tags were the only ones shipping. */}
        <meta property="og:title" content="Hotels in Des Moines - Where to Stay | Des Moines Insider" />
        <meta property="og:description" content="Find the best hotels in Des Moines, Iowa. Browse downtown hotels, West Des Moines accommodations, and hotels near popular event venues. Book your stay today." />
        <meta property="og:url" content={getCanonicalUrl('/stay')} />
        <meta name="twitter:title" content="Stay in Des Moines - Hotels & Accommodations | Des Moines Insider" />
        <meta name="twitter:description" content="Find the best hotels in Des Moines, Iowa. Browse downtown hotels, West Des Moines accommodations, and hotels near popular event venues. Book your stay today." />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        <Header />

        {/* Hero: a flat brand surface (WP2 item 10). */}
        <section className="bg-primary text-primary-foreground py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <SpriteIcon name="building-2" className="h-8 w-8" />
                <h1 className="text-3xl md:text-5xl font-bold">
                  Stay in Des Moines
                </h1>
              </div>
              <p className="text-lg md:text-xl text-primary-foreground/85 mb-8">
                Hotels and accommodations near the best events and attractions in Des Moines
              </p>

              <div className="max-w-xl mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search hotels by name, area, or chain..."
                  aria-label="Search hotels"
                  className="pl-12 pr-14 h-12 text-base bg-background text-foreground border-0 rounded-full shadow-lg"
                />
                {search && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearSearch}
                    aria-label="Clear search"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full p-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <AffiliateDisclosureBanner />
          </div>

          {/* Filter controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden min-h-11">
                  <SlidersHorizontal className="h-4 w-4 mr-2" aria-hidden="true" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filter hotels</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <FilterPanel idPrefix="sheet" {...panelProps} />
                </div>
              </SheetContent>
            </Sheet>

            {/* Area quick filters */}
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              {AREAS.slice(0, 5).map((area) => {
                const pressed = selectedAreas.includes(area);
                return (
                  <Button
                    key={area}
                    type="button"
                    size="sm"
                    variant={pressed ? "default" : "outline"}
                    aria-pressed={pressed}
                    className="min-h-11 rounded-full"
                    onClick={() => onToggleArea(area)}
                  >
                    <SpriteIcon name="map-pin" className="h-3 w-3 mr-1" />
                    {area}
                  </Button>
                );
              })}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {/* Near (WP2 item 7) */}
              <div className="flex items-center gap-2">
                <Label htmlFor="stay-near" className="text-sm text-muted-foreground">
                  Near
                </Label>
                <Select
                  value={nearPlace ? nearPlace.slug : NEAR_ANY}
                  onValueChange={(v) => setParam("near", v === NEAR_ANY ? null : v)}
                >
                  <SelectTrigger id="stay-near" className="w-[200px] min-h-11">
                    <SelectValue placeholder="Anywhere" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEAR_ANY}>Anywhere</SelectItem>
                    {nearPlaces.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort. Distance decides the order while Near is set. */}
              {!nearPlace && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="stay-sort" className="text-sm text-muted-foreground">
                    Sort
                  </Label>
                  <Select
                    value={sortBy}
                    onValueChange={(v) => setParam("sort", v, { def: DEFAULT_SORT })}
                  >
                    <SelectTrigger id="stay-sort" className="w-[180px] min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Active filter chips: each whole chip is the remove button. */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {chips.map((chip) => (
                <Button
                  key={chip.key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11 gap-1 rounded-full"
                  aria-label={`Remove ${chip.label} filter`}
                  onClick={chip.onRemove}
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </Button>
              ))}
              <Button variant="ghost" size="sm" className="min-h-11" onClick={clearAllFilters}>
                Clear all
              </Button>
            </div>
          )}

          <div className="flex gap-8">
            <aside className="hidden lg:block w-64 flex-shrink-0" aria-label="Hotel filters">
              <div className="sticky top-24">
                <h2 className="text-sm font-semibold mb-4">Filter hotels</h2>
                <FilterPanel idPrefix="desktop" {...panelProps} />
              </div>
            </aside>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground mb-4" aria-live="polite">
                {resultLine}
                {nearPlace && !isLoading && ` nearest ${nearPlace.name} first`}
              </p>

              {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <HotelGridSkeleton count={6} />
                </div>
              )}

              {!isLoading && hotelsError && (
                <ErrorState error={hotelsError} onRetry={() => void refetch()} />
              )}

              {!isLoading && !hotelsError && showFeaturedStrip && (
                <section className="mb-8" aria-labelledby="stay-featured">
                  <h2 id="stay-featured" className="text-xl font-semibold mb-4">Featured hotels</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {featuredHotels.slice(0, 3).map((hotel) => (
                      <HotelCard key={hotel.id} hotel={hotel} variant="featured" />
                    ))}
                  </div>
                </section>
              )}

              {/* Three answers, not two (WP2 item 1). The old else branch said
                  "No hotels available yet" under a full grid, and crawlers
                  indexed it. */}
              {!isLoading && !hotelsError && (
                hotels.length > 0 ? (
                  <section aria-labelledby={showFeaturedStrip ? "stay-all" : undefined}>
                    {showFeaturedStrip && (
                      <h2 id="stay-all" className="text-xl font-semibold mb-4">All hotels</h2>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {nearRows && nearPlace
                        ? nearRows.slice(0, shownCount).map(({ hotel, miles }) => (
                            <HotelCard
                              key={hotel.id}
                              hotel={hotel}
                              distanceLabel={
                                miles === null
                                  ? undefined
                                  : `${formatMiles(miles)} from ${nearPlace.name} (straight line)`
                              }
                            />
                          ))
                        : (
                          <>
                            {hotels
                              .filter((h) => !featuredIds.has(h.id))
                              .map((hotel) => (
                                <HotelCard key={hotel.id} hotel={hotel} />
                              ))}
                            {Array.from({ length: extraPages }).map((_, i) => (
                              <ExtraHotelPage
                                key={`page-${i + 1}`}
                                filters={baseFilters}
                                offset={PAGE_SIZE * (i + 1)}
                                excludeIds={featuredIds}
                              />
                            ))}
                          </>
                        )}
                    </div>
                    {nearPlace && nearRows?.some((r) => r.miles === null) && (
                      <p className="mt-4 text-xs text-muted-foreground">
                        Hotels without a stored location are listed last, with no distance.
                      </p>
                    )}
                    {hasMore && (
                      <div className="mt-8 flex justify-center">
                        <Button variant="outline" className="min-h-11" onClick={showMore}>
                          Show more hotels
                        </Button>
                      </div>
                    )}
                  </section>
                ) : hasQuery ? (
                  <EmptyState
                    icon={Building2}
                    title="No hotels match your filters"
                    description="Try a different search or fewer filters."
                    actions={[
                      { label: 'Clear all filters', variant: 'outline', onClick: clearAllFilters },
                    ]}
                  />
                ) : (
                  <EmptyState
                    icon={Building2}
                    title="No hotels available yet"
                    description="Check back soon. We're adding places to stay across Des Moines."
                  />
                )
              )}

              {/* SEO content section */}
              <section className="mt-16 prose prose-sm max-w-none">
                <h2 className="text-2xl font-bold mb-4">Hotels in Des Moines, Iowa</h2>
                <p className="text-muted-foreground">
                  Des Moines offers a range of accommodations from luxury downtown hotels to
                  comfortable suburban stays. Whether you're visiting for an event at Wells Fargo
                  Arena, attending the Iowa State Fair, or exploring the East Village, you'll find
                  the perfect place to stay. Many hotels are conveniently located near major venues
                  and attractions, with easy access to I-80 and I-35 corridors.
                </p>

                <h3 className="text-xl font-semibold mt-8 mb-3">Popular Hotel Areas</h3>
                <ul className="text-muted-foreground space-y-2">
                  <li><strong>Downtown Des Moines</strong> - Walking distance to events, restaurants, and the skywalk system</li>
                  <li><strong>West Des Moines</strong> - Near Jordan Creek Town Center and suburban dining</li>
                  <li><strong>Altoona</strong> - Close to Prairie Meadows and Adventureland</li>
                  <li><strong>Ankeny</strong> - Family-friendly with easy highway access</li>
                </ul>
              </section>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
