import React, { useState, useMemo, lazy } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { FAQSection } from "@/components/FAQSection";
import { useAttractions } from "@/hooks/useAttractions";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { useToast } from "@/hooks/use-toast";
import { BackToTop } from "@/components/BackToTop";
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
import { MapPin, Star, Filter, List, Map, SlidersHorizontal, Landmark, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Lazy load map to prevent react-leaflet bundling issues
const AttractionsMap = lazy(() => import("@/components/AttractionsMap"));

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function Attractions() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [minRating, setMinRating] = useState("any-rating");
  const [showFilters, setShowFilters] = useState(true); // Show filters by default
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState("all");
  const [viewMode, setViewMode] = useState('list');

  // Get all attractions first
  const { attractions: allAttractions, isLoading, error } = useAttractions({});

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
        faqData={faqData}
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
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search attractions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  aria-label="Search attractions"
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

      <main className="container mx-auto px-4 py-8">
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

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {searchQuery
              ? `Search results for "${searchQuery}"`
              : selectedType && selectedType !== "all"
              ? `${selectedType} Attractions`
              : "Des Moines Attractions"}
          </h2>
        </div>

        {viewMode === 'map' ? (
          <AttractionsMap attractions={filteredAttractions} />
        ) : isLoading ? (
          <CardsGridSkeleton count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" />
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Error loading attractions. Please try again later.
            </p>
          </div>
        ) : filteredAttractions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {searchQuery ||
              selectedType !== "all" ||
              minRating !== "any-rating" ||
              featuredOnly !== "all"
                ? "No attractions match your current filters."
                : "No attractions found."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAttractions.map((attraction) => (
              <Link
                key={attraction.id}
                to={`/attractions/${createSlug(attraction.name)}`}
                className="block"
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                  {attraction.image_url ? (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={attraction.image_url}
                        alt={`${attraction.name} - ${attraction.type} in Des Moines`}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-[#DC143C] flex items-center justify-center">
                      <Landmark className="h-12 w-12 text-white/40" />
                    </div>
                  )}
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
            ))}
          </div>
        )}
      </main>

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
