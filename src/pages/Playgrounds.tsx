import React, { useState, useMemo, lazy } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { FAQSection } from "@/components/FAQSection";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
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
import { MapPin, Star, Users, Filter, List, Map, TreePine, SlidersHorizontal, ChevronRight, Check } from "lucide-react";
import { Link } from "react-router-dom";

// Lazy load map to prevent react-leaflet bundling issues
const PlaygroundsMap = lazy(() => import("@/components/PlaygroundsMap"));

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function Playgrounds() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgeRange, setSelectedAgeRange] = useState("all");
  const [location, setLocation] = useState("any-location");
  const [showFilters, setShowFilters] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState("all");
  const [viewMode, setViewMode] = useState('list');

  // Get all playgrounds first
  const { playgrounds: allPlaygrounds, isLoading, error } = usePlaygrounds();

  // Get unique age ranges and locations for filter options
  const ageRanges = useMemo(() => {
    const uniqueRanges = new Set(
      allPlaygrounds.map((playground) => playground.age_range).filter(Boolean)
    );
    return Array.from(uniqueRanges).sort();
  }, [allPlaygrounds]);

  const locations = useMemo(() => {
    const uniqueLocations = new Set(
      allPlaygrounds
        .map((playground) => playground.location)
        .filter(Boolean)
        .map((loc) => {
          const parts = loc.split(",");
          return parts[parts.length - 2]?.trim() || parts[0]?.trim() || loc;
        })
    );
    return Array.from(uniqueLocations).sort();
  }, [allPlaygrounds]);

  // Apply filters
  const filteredPlaygrounds = useMemo(() => {
    return allPlaygrounds.filter((playground) => {
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          playground.name.toLowerCase().includes(searchLower) ||
          playground.description?.toLowerCase().includes(searchLower) ||
          playground.location?.toLowerCase().includes(searchLower) ||
          playground.amenities?.some((amenity) =>
            amenity.toLowerCase().includes(searchLower)
          );
        if (!matchesSearch) return false;
      }

      if (
        selectedAgeRange !== "all" &&
        playground.age_range !== selectedAgeRange
      ) {
        return false;
      }

      if (location !== "any-location") {
        const playgroundLocation = playground.location || "";
        if (
          !playgroundLocation.toLowerCase().includes(location.toLowerCase())
        ) {
          return false;
        }
      }

      if (featuredOnly === "featured" && !playground.is_featured) {
        return false;
      }

      return true;
    });
  }, [allPlaygrounds, searchQuery, selectedAgeRange, location, featuredOnly]);

  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedAgeRange !== "all") count++;
    if (location !== "any-location") count++;
    if (featuredOnly !== "all") count++;
    return count;
  };

  const hasActiveFilters = getActiveFiltersCount() > 0;

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedAgeRange("all");
    setLocation("any-location");
    setFeaturedOnly("all");
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

  const pageDescription = `Discover ${filteredPlaygrounds.length}+ playgrounds in Des Moines, Iowa. Find the best parks with splash pads, accessible equipment, climbing structures, and family-friendly amenities. Free public playgrounds for all ages across the Greater Des Moines Area.`;

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Playgrounds", url: "/playgrounds" },
  ];

  const faqData = [
    {
      question: "What are the best playgrounds in Des Moines?",
      answer: `Des Moines features ${allPlaygrounds.length}+ mapped playgrounds with varying amenities including climbing structures, splash pads, and accessible equipment.`,
    },
    {
      question: "Are Des Moines playgrounds free?",
      answer: "Yes! All Des Moines public playgrounds are free and open to all visitors, typically dawn to dusk.",
    },
    {
      question: "Which playgrounds have splash pads?",
      answer: "Several Des Moines playgrounds feature splash pads and water play areas. Use the amenities filter above to find splash pad locations.",
    },
  ];

  // Collect unique amenities across all playgrounds for "Browse by Amenity"
  const uniqueAmenities = useMemo(() => {
    const amenitySet = new Set<string>();
    allPlaygrounds.forEach((p) => {
      p.amenities?.forEach((a) => amenitySet.add(a));
    });
    return Array.from(amenitySet).sort();
  }, [allPlaygrounds]);

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/playgrounds")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
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

      {/* Hero Section with DMI Brand Colors */}
      <section className="relative bg-gradient-to-br from-[#2D1B69] via-emerald-800 to-[#DC143C] overflow-hidden min-h-[400px]">
        <div className="absolute inset-0 bg-black/20"></div>
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
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-base font-medium">Age Range</label>
                            <Select value={selectedAgeRange} onValueChange={setSelectedAgeRange}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Ages</SelectItem>
                                {ageRanges?.map((range) => (
                                  <SelectItem key={range} value={range}>
                                    {range}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-base font-medium">Location</label>
                            <Select value={location} onValueChange={setLocation}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any-location">Any location</SelectItem>
                                <SelectItem value="downtown">Downtown</SelectItem>
                                <SelectItem value="west-des-moines">West Des Moines</SelectItem>
                                <SelectItem value="ankeny">Ankeny</SelectItem>
                                <SelectItem value="urbandale">Urbandale</SelectItem>
                                <SelectItem value="clive">Clive</SelectItem>
                                {locations?.map((loc) => (
                                  <SelectItem key={loc} value={loc.toLowerCase()}>
                                    {loc}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-base font-medium">Featured</label>
                            <Select value={featuredOnly} onValueChange={setFeaturedOnly}>
                              <SelectTrigger className="input-mobile">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Playgrounds</SelectItem>
                                <SelectItem value="featured">Featured Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
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

      <main className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Playgrounds" },
          ]}
        />

        {/* Filters Section - Desktop */}
        {!isMobile && showFilters && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Age Range
                </label>
                <Select
                  value={selectedAgeRange}
                  onValueChange={setSelectedAgeRange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    {ageRanges?.map((range) => (
                      <SelectItem key={range} value={range}>
                        {range}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Location
                </label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any-location">Any location</SelectItem>
                    <SelectItem value="downtown">Downtown</SelectItem>
                    <SelectItem value="west-des-moines">
                      West Des Moines
                    </SelectItem>
                    <SelectItem value="ankeny">Ankeny</SelectItem>
                    <SelectItem value="urbandale">Urbandale</SelectItem>
                    <SelectItem value="clive">Clive</SelectItem>
                    {locations?.map((loc) => (
                      <SelectItem key={loc} value={loc.toLowerCase()}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Featured
                </label>
                <Select value={featuredOnly} onValueChange={setFeaturedOnly}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Playgrounds</SelectItem>
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
                {filteredPlaygrounds?.length || 0} playgrounds found
              </div>
            </div>
          </div>
        )}

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {searchQuery
              ? `Search results for "${searchQuery}"`
              : selectedAgeRange && selectedAgeRange !== "all"
              ? `Playgrounds for Ages ${selectedAgeRange}`
              : "Des Moines Playgrounds"}
          </h2>
          <div className="text-sm text-gray-500">
            {filteredPlaygrounds?.length || 0} playgrounds
          </div>
        </div>

        {viewMode === 'map' ? (
          <PlaygroundsMap playgrounds={filteredPlaygrounds} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl overflow-hidden border">
                <div className="aspect-video bg-gray-200" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <TreePine className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">Error Loading Playgrounds</h3>
            <p className="text-muted-foreground">
              Please try again later.
            </p>
          </div>
        ) : filteredPlaygrounds.length === 0 ? (
          <div className="text-center py-16">
            <TreePine className="h-16 w-16 text-gray-400 mx-auto mb-4" />
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlaygrounds.map((playground) => (
              <Link
                key={playground.id}
                to={`/playgrounds/${createSlug(playground.name)}`}
                className="block"
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                  {playground.image_url ? (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={playground.image_url}
                        alt={`${playground.name} - Playground in Des Moines`}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-emerald-600 flex items-center justify-center">
                      <TreePine className="h-12 w-12 text-white/40" />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      {playground.age_range && (
                        <Badge
                          variant="outline"
                          className="bg-[#2D1B69]/10 text-[#2D1B69] text-xs"
                        >
                          <Users className="h-3 w-3 mr-1" />
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
                      {playground.rating && (
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{playground.rating}/5</span>
                        </div>
                      )}
                      {playground.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span className="line-clamp-1">{playground.location}</span>
                        </div>
                      )}
                    </div>
                    {playground.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                        {playground.description}
                      </p>
                    )}
                    {playground.amenities && playground.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {playground.amenities.slice(0, 3).map((amenity, index) => (
                          <Badge key={index} variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Check className="h-2.5 w-2.5 mr-0.5" />
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
      </main>

      {/* Browse by Age Range - Internal Linking for SEO */}
      {ageRanges.length > 0 && (
        <section className="py-12 bg-white border-t">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Browse Playgrounds By Age Group
            </h2>
            <p className="text-gray-600 mb-6">
              Find the right playground for your child's age in the Des Moines area
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {ageRanges.map((range) => {
                const count = allPlaygrounds.filter((p) => p.age_range === range).length;
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
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#2D1B69]" />
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
            <div className="flex flex-wrap gap-2">
              {uniqueAmenities.map((amenity) => {
                const count = allPlaygrounds.filter(
                  (p) => p.amenities?.includes(amenity)
                ).length;
                return (
                  <button
                    key={amenity}
                    onClick={() => {
                      setSearchQuery(amenity);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-sm group"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-gray-700 group-hover:text-emerald-700">{amenity}</span>
                    <span className="text-xs text-gray-400">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* SEO Content Section */}
      <section className="py-12 bg-white border-t">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Playgrounds & Parks in Des Moines, Iowa
          </h2>
          <div className="prose prose-gray max-w-none text-gray-700 leading-relaxed space-y-4">
            <p>
              Des Moines and the surrounding metro area offer an extensive network of public
              playgrounds and parks designed for children of all ages. From splash pads and climbing
              structures to accessible equipment and nature play areas, there's something for every
              family in the Greater Des Moines Area. Our comprehensive guide covers {allPlaygrounds.length}+
              playgrounds to help you find the perfect outdoor play spot.
            </p>
            <p>
              The Des Moines Parks & Recreation Department maintains playgrounds across the city,
              ensuring safe, well-maintained play spaces in every neighborhood. Many parks feature
              separate areas for toddlers and older children, rubberized safety surfaces, shade
              structures, and nearby amenities like restrooms, picnic areas, and walking trails. All
              public playgrounds are free to visit and open from dawn to dusk year-round.
            </p>
            <p>
              Use the search and filters above to find playgrounds by age range, location, or specific
              amenities like splash pads, swings, or climbing walls. Switch to map view to discover
              playgrounds nearest to you. Each playground page includes detailed amenity lists,
              directions, age recommendations, and family tips.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Des Moines Playgrounds - Frequently Asked Questions"
            description="Common questions about playgrounds, parks, and family outdoor activities in Des Moines, Iowa."
            faqs={[
              {
                question: "What are the best playgrounds in Des Moines?",
                answer: "Des Moines features 100+ mapped playgrounds with varying amenities. Top-rated playgrounds include Ashworth Park (large climbing structures and splash pad), Union Park (inclusive playground with accessible equipment), Greenwood Park (nature-themed play areas), Gray's Lake Park (lakeside playground with beach access), Raccoon River Park (extensive play areas near trails), and neighborhood parks throughout the metro. Our platform provides safety information, age appropriateness, amenities, and accessibility details for each playground including swings, slides, climbing structures, splash pads, and shade coverage."
              },
              {
                question: "Are Des Moines playgrounds accessible for children with disabilities?",
                answer: "Yes! Des Moines prioritizes accessible playgrounds. Many parks feature inclusive playground equipment designed for children of all abilities including wheelchair-accessible ramps and platforms, sensory play elements, adaptive swings, ground-level play components, and rubberized surfaces. Notable inclusive playgrounds include Union Park (fully accessible), Ashworth Park (partial accessibility), and various neighborhood parks with accessible features. Our playground listings indicate specific accessibility features, surface types, and inclusive equipment available at each location."
              },
              {
                question: "Which playgrounds have splash pads in Des Moines?",
                answer: "Several Des Moines playgrounds feature splash pads and water play areas. Popular splash pad locations include Ashworth Park (large interactive splash pad), Greenwood Park (neighborhood splash pad), Union Park (accessible water features), and various community parks throughout the metro. Splash pads typically operate May through September, weather permitting. Check our Playgrounds page filtered by 'Splash Pad' amenity for locations, operating hours, and seasonal availability. Most splash pads are free and operate during daylight hours."
              },
              {
                question: "What age groups are Des Moines playgrounds designed for?",
                answer: "Des Moines playgrounds serve all age groups with designated areas and equipment: Toddlers (18 months-3 years) - low slides, small swings, sensory elements; Preschool (3-5 years) - age-appropriate climbing structures, swings, interactive play; Elementary (5-12 years) - climbing walls, monkey bars, larger slides, sports courts; Teens - fitness equipment, sports courts, skateparks. Many parks feature separated play areas for different age groups. Our platform indicates age recommendations and equipment types for each playground to help families choose appropriate locations."
              },
              {
                question: "Are there covered or shaded playgrounds in Des Moines?",
                answer: "Many Des Moines playgrounds offer shade coverage through natural tree canopy, shade structures, or covered pavilions. Parks with significant shade include Greenwood Park (mature trees), Water Works Park (wooded areas), and various neighborhood parks with pavilions and shelters. Some newer playgrounds feature modern shade sails and covered play structures. Check our playground listings for shade information, covered areas, and nearby pavilions available for family gatherings and protection from sun during summer months."
              },
              {
                question: "What safety features do Des Moines playgrounds have?",
                answer: "Des Moines playgrounds meet safety standards with features including: impact-absorbing surfaces (rubber mulch, engineered wood fiber, poured rubber), age-appropriate equipment separation, proper spacing between structures, regular maintenance and inspections, fencing around play areas (varies by park), and clearly marked age recommendations. The Parks Department conducts routine safety inspections and maintenance. Our platform notes safety features, surface types, fencing, and recent inspection dates. Always supervise children and report damaged equipment to Des Moines Parks & Recreation."
              },
              {
                question: "Do Des Moines playgrounds have restrooms and amenities?",
                answer: "Many Des Moines playgrounds offer additional amenities: restrooms (seasonal availability varies), drinking fountains (typically May-October), picnic tables and grills, pavilions for gatherings (some require reservations), parking lots, walking trails, sports fields and courts, and pet-friendly areas (check specific park rules). Larger parks like Gray's Lake and Raccoon River Park offer year-round facilities. Neighborhood parks may have seasonal restrooms or portable facilities. Our playground listings detail available amenities, parking, and facility information for each location."
              },
              {
                question: "Can I reserve playground areas or pavilions in Des Moines parks?",
                answer: "Yes! Many Des Moines parks allow pavilion and shelter reservations for birthday parties, family gatherings, and events. Reservations can be made through the Des Moines Parks & Recreation Department for parks with reservable facilities. Popular reservation locations include Gray's Lake Park, Raccoon River Park, Ashworth Park, and community parks with pavilions. Playground equipment itself is first-come, first-served and cannot be reserved. Reservation fees, available dates, and online booking information can be found through the city's parks department website."
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
