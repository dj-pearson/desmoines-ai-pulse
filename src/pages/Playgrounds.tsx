import React, { useState, useMemo, lazy } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection } from "@/components/FAQSection";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useToast } from "@/hooks/use-toast";
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
import { MapPin, Star, Users, Filter, List, Map } from "lucide-react";
import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brandConfig";

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

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgeRange, setSelectedAgeRange] = useState("all");
  const [location, setLocation] = useState("any-location");
  const [showFilters, setShowFilters] = useState(true); // Show filters by default
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
          // Extract city/area from full address
          const parts = loc.split(",");
          return parts[parts.length - 2]?.trim() || parts[0]?.trim() || loc;
        })
    );
    return Array.from(uniqueLocations).sort();
  }, [allPlaygrounds]);

  // Apply filters
  const filteredPlaygrounds = useMemo(() => {
    return allPlaygrounds.filter((playground) => {
      // Search filter
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

      // Age range filter
      if (
        selectedAgeRange !== "all" &&
        playground.age_range !== selectedAgeRange
      ) {
        return false;
      }

      // Location filter
      if (location !== "any-location") {
        const playgroundLocation = playground.location || "";
        if (
          !playgroundLocation.toLowerCase().includes(location.toLowerCase())
        ) {
          return false;
        }
      }

      // Featured filter
      if (featuredOnly === "featured" && !playground.is_featured) {
        return false;
      }

      return true;
    });
  }, [allPlaygrounds, searchQuery, selectedAgeRange, location, featuredOnly]);

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

  // SEO data
  const seoTitle = searchQuery
    ? `"${searchQuery}" Playgrounds in Des Moines`
    : selectedAgeRange && selectedAgeRange !== "all"
    ? `Playgrounds for Ages ${selectedAgeRange} in Des Moines`
    : "Playgrounds in Des Moines - Family Fun & Children's Recreation";

  const seoDescription = `Discover ${searchQuery ? `"${searchQuery}" ` : ""}${
    selectedAgeRange && selectedAgeRange !== "all"
      ? `playgrounds for ages ${selectedAgeRange} `
      : ""
  }in Des Moines, Iowa. Find the perfect playground for your family with accessible equipment, fun activities, and safe play areas.`;

  const playgroundKeywords = [
    "Des Moines playgrounds",
    "Iowa playgrounds",
    "children recreation",
    "family activities Des Moines",
    "parks",
    "playground equipment",
    "kids activities",
    "family fun",
    ...(selectedAgeRange && selectedAgeRange !== "all"
      ? [`ages ${selectedAgeRange}`]
      : []),
    ...(searchQuery ? [searchQuery] : []),
  ];

  const playgroundsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Des Moines Playgrounds",
    description: seoDescription,
    numberOfItems: filteredPlaygrounds?.length || 0,
    itemListElement:
      filteredPlaygrounds?.slice(0, 10).map((playground, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Park",
          name: playground.name,
          description: playground.description,
          image: playground.image_url,
          address: {
            "@type": "PostalAddress",
            addressLocality: "Des Moines",
            addressRegion: "Iowa",
            addressCountry: "US",
          },
        },
      })) || [],
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        <meta name="keywords" content={playgroundKeywords.join(", ")} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content={`${BRAND.baseUrl}/og-image.jpg`}
        />

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(playgroundsSchema)}
        </script>
      </Helmet>
      <Header />

      {/* Hero Section with DMI Brand Colors */}
      <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Discover Des Moines Playgrounds
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Find the perfect playground for your family with accessible
            equipment and fun activities
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search playgrounds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  aria-label="Search playgrounds"
                  role="searchbox"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
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
        {/* Filters Section */}
        {showFilters && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Age Range Filter */}
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

              {/* Location Filter */}
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
        </div>

        {viewMode === 'map' ? (
          <PlaygroundsMap playgrounds={filteredPlaygrounds} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Error loading playgrounds. Please try again later.
            </p>
          </div>
        ) : filteredPlaygrounds.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {searchQuery ||
              selectedAgeRange !== "all" ||
              location !== "any-location"
                ? "No playgrounds match your current filters."
                : "No playgrounds found."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlaygrounds.map((playground) => (
              <Link
                key={playground.id}
                to={`/playgrounds/${createSlug(playground.name)}`}
                className="block hover:scale-105 transition-transform duration-200"
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight line-clamp-2">
                        {playground.name}
                      </CardTitle>
                      {playground.is_featured && (
                        <Badge className="shrink-0 bg-[#DC143C] text-white hover:bg-[#DC143C]/90">
                          Featured
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {playground.age_range && (
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span className="line-clamp-1">
                            {playground.age_range}
                          </span>
                        </div>
                      )}
                      {playground.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{playground.rating}</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="line-clamp-3 mb-3">
                      {playground.description}
                    </CardDescription>
                    {playground.location && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                        📍 {playground.location}
                      </p>
                    )}
                    {playground.amenities &&
                      playground.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {playground.amenities
                            .slice(0, 3)
                            .map((amenity, index) => (
                              <Badge
                                key={index}
                                variant="outline"
                                className="text-xs"
                              >
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
    </div>
  );
}
