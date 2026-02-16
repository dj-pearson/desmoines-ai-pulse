import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useHotels, useHotelFilterOptions } from "@/hooks/useHotels";
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
import {
  Search,
  SlidersHorizontal,
  X,
  Building2,
  MapPin,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const AREAS = [
  "Downtown",
  "West Des Moines",
  "Waukee",
  "Ankeny",
  "Urbandale",
  "Altoona",
  "Johnston",
  "Clive",
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
];

type SortOption = "featured" | "price_low" | "price_high" | "rating" | "alphabetical" | "newest";

export default function Hotels() {
  useDocumentTitle("Stay in Des Moines - Hotels & Accommodations");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounce search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as any).__hotelSearchTimeout);
    (window as any).__hotelSearchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const { hotels, isLoading, totalCount } = useHotels({
    search: debouncedSearch,
    area: selectedAreas.length > 0 ? selectedAreas : undefined,
    priceRange: selectedPriceRanges.length > 0 ? selectedPriceRanges : undefined,
    hotelType: selectedTypes.length > 0 ? selectedTypes : undefined,
    amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
    sortBy,
  });

  const featuredHotels = useMemo(
    () => hotels.filter((h) => h.is_featured),
    [hotels]
  );

  const activeFilterCount =
    selectedAreas.length +
    selectedPriceRanges.length +
    selectedTypes.length +
    selectedAmenities.length;

  const clearAllFilters = () => {
    setSelectedAreas([]);
    setSelectedPriceRanges([]);
    setSelectedTypes([]);
    setSelectedAmenities([]);
    setSearch("");
    setDebouncedSearch("");
    setSortBy("featured");
  };

  const toggleArrayFilter = (
    arr: string[],
    setter: (v: string[]) => void,
    value: string
  ) => {
    setter(
      arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
    );
  };

  const FilterPanel = () => (
    <div className="space-y-6">
      {/* Area */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Area</h4>
        <div className="space-y-2">
          {AREAS.map((area) => (
            <div key={area} className="flex items-center gap-2">
              <Checkbox
                id={`area-${area}`}
                checked={selectedAreas.includes(area)}
                onCheckedChange={() =>
                  toggleArrayFilter(selectedAreas, setSelectedAreas, area)
                }
              />
              <Label htmlFor={`area-${area}`} className="text-sm cursor-pointer">
                {area}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Price Range</h4>
        <div className="flex flex-wrap gap-2">
          {PRICE_RANGES.map((price) => (
            <Badge
              key={price}
              variant={selectedPriceRanges.includes(price) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() =>
                toggleArrayFilter(selectedPriceRanges, setSelectedPriceRanges, price)
              }
            >
              {price}
            </Badge>
          ))}
        </div>
      </div>

      {/* Hotel Type */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Hotel Type</h4>
        <div className="space-y-2">
          {HOTEL_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`type-${type}`}
                checked={selectedTypes.includes(type)}
                onCheckedChange={() =>
                  toggleArrayFilter(selectedTypes, setSelectedTypes, type)
                }
              />
              <Label htmlFor={`type-${type}`} className="text-sm cursor-pointer">
                {type}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Amenities */}
      <div>
        <h4 className="text-sm font-semibold mb-3">Amenities</h4>
        <div className="space-y-2">
          {AMENITY_OPTIONS.map((amenity) => (
            <div key={amenity} className="flex items-center gap-2">
              <Checkbox
                id={`amenity-${amenity}`}
                checked={selectedAmenities.includes(amenity)}
                onCheckedChange={() =>
                  toggleArrayFilter(selectedAmenities, setSelectedAmenities, amenity)
                }
              />
              <Label htmlFor={`amenity-${amenity}`} className="text-sm cursor-pointer">
                {amenity}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <Button variant="outline" onClick={clearAllFilters} className="w-full">
          Clear All Filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Stay in Des Moines - Hotels &amp; Accommodations | Des Moines Insider</title>
        <meta
          name="description"
          content="Find the best hotels in Des Moines, Iowa. Browse downtown hotels, West Des Moines accommodations, and hotels near popular event venues. Book your stay today."
        />
        <meta name="keywords" content="Des Moines hotels, where to stay Des Moines, hotels downtown Des Moines, West Des Moines hotels, Iowa hotels" />
        <link rel="canonical" href="/stay" />
      </Helmet>

      <div className="min-h-screen bg-background pb-24">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-[#1a0f3c] via-[#2D1B69] to-[#DC143C] text-white py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Building2 className="h-8 w-8" />
                <h1 className="text-3xl md:text-5xl font-bold">
                  Stay in Des Moines
                </h1>
              </div>
              <p className="text-lg md:text-xl text-white/80 mb-8">
                Hotels and accommodations near the best events and attractions in Des Moines
              </p>

              {/* Search bar */}
              <div className="max-w-xl mx-auto relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search hotels by name, area, or chain..."
                  className="pl-12 h-12 text-base bg-white text-foreground border-0 rounded-full shadow-lg"
                />
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSearch(""); setDebouncedSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-8">
          {/* Filter controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Mobile filter trigger */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
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
                  <SheetTitle>Filter Hotels</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <FilterPanel />
                </div>
              </SheetContent>
            </Sheet>

            {/* Area quick filters */}
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              {AREAS.slice(0, 5).map((area) => (
                <Badge
                  key={area}
                  variant={selectedAreas.includes(area) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleArrayFilter(selectedAreas, setSelectedAreas, area)}
                >
                  <MapPin className="h-3 w-3 mr-1" />
                  {area}
                </Badge>
              ))}
            </div>

            {/* Sort */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">Sort:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[180px]">
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
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {selectedAreas.map((area) => (
                <Badge key={area} variant="secondary" className="gap-1">
                  {area}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setSelectedAreas((a) => a.filter((v) => v !== area))}
                  />
                </Badge>
              ))}
              {selectedPriceRanges.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1">
                  {p}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setSelectedPriceRanges((a) => a.filter((v) => v !== p))}
                  />
                </Badge>
              ))}
              {selectedTypes.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setSelectedTypes((a) => a.filter((v) => v !== t))}
                  />
                </Badge>
              ))}
              {selectedAmenities.map((a) => (
                <Badge key={a} variant="secondary" className="gap-1">
                  {a}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setSelectedAmenities((arr) => arr.filter((v) => v !== a))}
                  />
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                Clear all
              </Button>
            </div>
          )}

          <div className="flex gap-8">
            {/* Desktop sidebar filters */}
            <aside className="hidden lg:block w-64 flex-shrink-0">
              <div className="sticky top-24">
                <h3 className="text-sm font-semibold mb-4">Filter Hotels</h3>
                <FilterPanel />
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Results count */}
              <p className="text-sm text-muted-foreground mb-4">
                {isLoading ? "Loading..." : `${totalCount} hotel${totalCount !== 1 ? "s" : ""} found`}
              </p>

              {/* Loading state */}
              {isLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="h-48 w-full rounded-lg" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              )}

              {/* Featured hotels section */}
              {!isLoading && featuredHotels.length > 0 && !debouncedSearch && activeFilterCount === 0 && (
                <section className="mb-8">
                  <h2 className="text-xl font-semibold mb-4">Featured Hotels</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {featuredHotels.slice(0, 3).map((hotel) => (
                      <HotelCard key={hotel.id} hotel={hotel} variant="featured" />
                    ))}
                  </div>
                </section>
              )}

              {/* All hotels grid */}
              {!isLoading && (
                <>
                  {hotels.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {hotels.map((hotel) => (
                        <HotelCard key={hotel.id} hotel={hotel} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-16">
                      <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No hotels found</h3>
                      <p className="text-muted-foreground mb-4">
                        Try adjusting your filters or search terms
                      </p>
                      <Button variant="outline" onClick={clearAllFilters}>
                        Clear All Filters
                      </Button>
                    </div>
                  )}
                </>
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
      </div>
    </>
  );
}
