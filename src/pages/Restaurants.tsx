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
import { CardsGridSkeleton, StatsGridSkeleton } from "@/components/ui/loading-skeleton";
import {
  MapPin,
  Star,
  DollarSign,
  ChefHat,
  Search,
  Filter,
  SearchX,
  Utensils,
  X,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { FAQSection } from "@/components/FAQSection";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function Restaurants() {
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
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  const { restaurants, isLoading, error, totalCount } = useRestaurants(filters);
  const filterOptions = useRestaurantFilterOptions();

  const handleSearchChange = (value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  };

  const handleClearFilters = () => {
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
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  // Enhanced SEO data for restaurants page
  const restaurantsKeywords = [
    "Des Moines restaurants",
    "Iowa dining",
    "restaurant reviews",
    "local restaurants",
    "Des Moines food",
    "restaurant guide",
    "dining guide",
    "new restaurants",
    "restaurant openings",
    "best restaurants Des Moines",
  ];

  const restaurantsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Des Moines Restaurants",
    description: "Comprehensive guide to restaurants in Des Moines, Iowa",
    numberOfItems: totalCount || restaurants.length,
    itemListElement: restaurants.slice(0, 10).map((restaurant, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Restaurant",
        name: restaurant.name,
        description: restaurant.description,
        servesCuisine: restaurant.cuisine,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Des Moines",
          addressRegion: "Iowa",
          addressCountry: "US",
        },
        aggregateRating: restaurant.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: restaurant.rating,
              ratingCount: "100",
            }
          : undefined,
      },
    })),
  };

  return (
    <>
      <SEOHead
        title="Des Moines Restaurants - Complete Dining Guide & New Openings"
        description="Discover the best restaurants in Des Moines, Iowa. Find new openings, read reviews, and explore diverse cuisines with our comprehensive dining guide featuring 200+ local restaurants."
        type="website"
        keywords={restaurantsKeywords}
        structuredData={restaurantsSchema}
        url="/restaurants"
      />
      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section with DMI Brand Colors */}
        <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
              Discover Des Moines Dining
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
              Find the best restaurants, local favorites, and new dining
              experiences in the capital city
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Search restaurants..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12"
                  />
                </div>
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="secondary"
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </div>
            </div>
          </div>
        </section>

        <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
          {/* Mobile-Optimized Content */}
          <div className="space-y-8">
            {/* Restaurant Openings Section */}
            <RestaurantOpenings />

            {/* Advanced Filters */}
            {showFilters && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border">
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
                  <Button variant="outline" onClick={handleClearFilters}>
                    Clear Filters
                  </Button>
                  <div className="text-sm text-gray-500">
                    {totalCount || 0} restaurants found
                  </div>
                </div>
              </div>
            )}

            {/* All Restaurants Section */}
            <div className="space-y-4 md:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
                <h2 className="text-mobile-title md:text-2xl font-bold">
                  All Restaurants
                </h2>
                <p className="text-mobile-caption md:text-sm text-muted-foreground">
                  {filters.sortBy === "popularity"
                    ? "Sorted by AI popularity ranking"
                    : filters.sortBy === "rating"
                    ? "Sorted by highest ratings"
                    : filters.sortBy === "newest"
                    ? "Newest restaurants first"
                    : filters.sortBy === "alphabetical"
                    ? "Listed alphabetically"
                    : filters.sortBy === "price_low"
                    ? "Most affordable first"
                    : "Premium options first"}
                </p>
              </div>

              {isLoading ? (
                <CardsGridSkeleton count={9} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" />
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
                  icon={
                    filters.search ||
                    filters.cuisine.length > 0 ||
                    filters.priceRange.length > 0 ||
                    filters.location.length > 0
                      ? SearchX
                      : Utensils
                  }
                  title={
                    filters.search
                      ? `No results for "${filters.search}"`
                      : "No restaurants found"
                  }
                  description={
                    filters.search ||
                    filters.cuisine.length > 0 ||
                    filters.priceRange.length > 0 ||
                    filters.location.length > 0
                      ? "Try adjusting your search criteria or filters to find more restaurants"
                      : "No restaurants available at the moment. Check back soon for updates!"
                  }
                  actions={
                    filters.search ||
                    filters.cuisine.length > 0 ||
                    filters.priceRange.length > 0 ||
                    filters.location.length > 0
                      ? [
                          {
                            label: "Clear All Filters",
                            onClick: handleClearFilters,
                            variant: "outline",
                            icon: X,
                          },
                          {
                            label: "Browse All Restaurants",
                            onClick: () => {
                              handleClearFilters();
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            },
                            icon: Sparkles,
                          },
                        ]
                      : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {restaurants.map((restaurant) => (
                    <Link
                      key={restaurant.id}
                      to={`/restaurants/${restaurant.slug || restaurant.id}`}
                      className="block hover:scale-105 transition-transform duration-200"
                    >
                      <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg leading-tight line-clamp-2">
                              {restaurant.name}
                            </CardTitle>
                            {restaurant.is_featured && (
                              <Badge className="shrink-0 bg-[#DC143C] text-white hover:bg-[#DC143C]/90">
                                Featured
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {restaurant.cuisine && (
                              <div className="flex items-center gap-1">
                                <ChefHat className="h-4 w-4" />
                                <span className="line-clamp-1">
                                  {restaurant.cuisine}
                                </span>
                              </div>
                            )}
                            {restaurant.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span>{restaurant.rating}</span>
                              </div>
                            )}
                            {restaurant.price_range && (
                               <div className="flex items-center gap-1">
                                 <DollarSign className="h-4 w-4" />
                                 <span className="font-medium text-green-600">
                                   {restaurant.price_range}
                                 </span>
                               </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <CardDescription className="line-clamp-3 mb-3">
                            {restaurant.description}
                          </CardDescription>
                          {restaurant.location && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              📍 {restaurant.location}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            
            {/* Enhanced Content Section for SEO Authority */}
            <div className="max-w-4xl mx-auto space-y-12 mt-16">
              {/* Main Authority Content */}
              <div className="prose prose-lg max-w-none">
                <h2 className="text-3xl font-bold mb-6 text-center">Des Moines Restaurant Guide: Your Complete Local Dining Directory</h2>
                
                <div className="bg-blue-50 p-6 rounded-lg mb-8">
                  <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-blue-600" />
                    TL;DR: Des Moines Dining Scene
                  </h3>
                  <p className="text-lg leading-relaxed">
                    Des Moines offers 200+ diverse restaurants spanning 30+ cuisines across downtown, East Village, West Des Moines, and Ankeny. 
                    From farm-to-table establishments to ethnic food gems, the capital city's dining scene features both acclaimed fine dining 
                    and beloved local favorites. New restaurant openings occur monthly, with West Des Moines leading growth in family dining options.
                  </p>
                </div>

                <h3 className="text-2xl font-semibold mb-4">Best Restaurants in Des Moines by Category</h3>
                
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold mb-3">Downtown Des Moines Dining</h4>
                    <p className="mb-3">
                      Downtown Des Moines features upscale dining in the East Village and Court Avenue districts. 
                      Notable restaurants include farm-to-table establishments, craft breweries, and ethnic cuisine 
                      options within walking distance of major hotels and entertainment venues.
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Best for:</strong> Date nights, business dinners, pre-event dining
                    </p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold mb-3">West Des Moines Restaurants</h4>
                    <p className="mb-3">
                      West Des Moines offers family-friendly chain restaurants and local favorites near Jordan Creek Town Center. 
                      The area leads in new restaurant openings with diverse options from casual dining to specialty cuisines, 
                      particularly strong in Asian and Mexican restaurants.
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Best for:</strong> Family dining, shopping center meals, suburban favorites
                    </p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold mb-3">Ankeny Dining Scene</h4>
                    <p className="mb-3">
                      Ankeny's rapidly growing restaurant scene features new establishments opening regularly to serve 
                      the expanding suburban population. Known for family-friendly atmospheres, competitive pricing, 
                      and convenient parking options.
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Best for:</strong> Family meals, casual dining, value-conscious dining
                    </p>
                  </div>
                  
                  <div className="bg-white p-6 rounded-lg shadow-md">
                    <h4 className="text-xl font-semibold mb-3">Late-Night Des Moines Dining</h4>
                    <p className="mb-3">
                      Limited but growing late-night dining options include 24-hour diners, food trucks, and select 
                      restaurants open past 10pm. East Village and downtown areas offer the most after-hours dining choices 
                      for night shift workers and entertainment district visitors.
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Best for:</strong> Night shift workers, post-event dining, late-night cravings
                    </p>
                  </div>
                </div>

                <h3 className="text-2xl font-semibold mb-4">Des Moines Restaurant FAQs</h3>
                
                <div className="space-y-6">
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h4 className="text-lg font-semibold mb-2">What time do most Des Moines restaurants close on Sunday?</h4>
                    <p>Most Des Moines restaurants close between 8-9 PM on Sundays, with casual dining and family restaurants 
                    typically closing earlier than downtown establishments. Some ethnic restaurants may have different Sunday hours.</p>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h4 className="text-lg font-semibold mb-2">Where can I find the best happy hour deals in Des Moines?</h4>
                    <p>Downtown Des Moines and East Village offer the most comprehensive happy hour options, typically 3-6 PM weekdays. 
                    Many establishments feature half-price appetizers and discounted drinks. West Des Moines chains also offer 
                    competitive happy hour pricing.</p>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h4 className="text-lg font-semibold mb-2">What Des Moines neighborhoods are best for food trucks?</h4>
                    <p>Food trucks concentrate in downtown Des Moines during lunch hours, particularly around the Capitol building 
                    and business district. Weekend events like farmers markets in multiple neighborhoods feature rotating food truck vendors. 
                    Special events and festivals bring food trucks to suburban areas.</p>
                  </div>
                  
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <h4 className="text-lg font-semibold mb-2">Pet-friendly restaurants in Des Moines?</h4>
                    <p>Many Des Moines restaurants offer pet-friendly patios, particularly in the East Village and downtown areas. 
                    Several establishments provide water bowls and welcome well-behaved leashed pets on outdoor seating areas. 
                    Call ahead to confirm pet policies, especially during busy weekend hours.</p>
                  </div>
                </div>

                <h3 className="text-2xl font-semibold mb-4 mt-8">New Restaurant Openings in Des Moines</h3>
                <p className="text-lg mb-4">
                  Des Moines welcomes new restaurants monthly, with West Des Moines and Ankeny leading growth in suburban dining options. 
                  The restaurant scene continues expanding with diverse cuisines including Vietnamese, Indian, Korean, and authentic Mexican options. 
                  Downtown development brings upscale dining while suburbs focus on family-friendly chains and local concepts.
                </p>
                
                <p className="text-lg mb-6">
                  <strong>Local expertise you can trust:</strong> Our dining guide covers 200+ restaurants across the Des Moines metro area, 
                  with weekly updates on new openings, seasonal menus, and special events. We track restaurant hours, pricing, and availability 
                  to help you discover your next favorite Des Moines dining experience.
                </p>

                <div className="bg-green-50 p-6 rounded-lg">
                  <h4 className="text-lg font-semibold mb-3">Des Moines Food Scene Highlights:</h4>
                  <ul className="list-disc list-inside space-y-2">
                    <li><strong>200+ restaurants</strong> across Des Moines metro area with weekly updates</li>
                    <li><strong>30+ cuisine types</strong> from farm-to-table to authentic ethnic options</li>
                    <li><strong>Weekly new openings</strong> tracked and verified by local food experts</li>
                    <li><strong>Family-friendly focus</strong> with detailed kids menu and accessibility information</li>
                    <li><strong>Real-time updates</strong> on hours, pricing, and seasonal menu changes</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* FAQ Section for SEO and Featured Snippets */}
        <section className="py-16 bg-muted/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="Des Moines Restaurants - Frequently Asked Questions"
              description="Common questions about dining, restaurants, and the food scene in Des Moines, Iowa."
              faqs={[
                {
                  question: "What are the best restaurants in Des Moines?",
                  answer: "Des Moines features over 300 diverse restaurants. Top-rated establishments include Malo for upscale Mexican, Django for French-inspired fine dining, Bubba for Southern fusion, Alba for innovative American cuisine, and Centro for authentic Italian. The East Village offers trendy farm-to-table options, while Ingersoll Avenue features local favorites. Valley Junction in West Des Moines is known for unique dining experiences. Our restaurant directory includes real-time ratings, reviews, and current menus with weekly updates."
                },
                {
                  question: "What cuisines are available in Des Moines?",
                  answer: "Des Moines offers 30+ cuisine types including American (farm-to-table and classic), Italian, Mexican and Latin American, Asian (Chinese, Japanese, Thai, Vietnamese, Korean), Indian, Mediterranean and Middle Eastern, French, steakhouses, seafood, BBQ and Southern, vegetarian and vegan options, and authentic ethnic restaurants. Use our cuisine filter to discover restaurants by type. The East Village and Downtown areas have the highest concentration of diverse dining options."
                },
                {
                  question: "Where can I find new restaurant openings in Des Moines?",
                  answer: "Des Moines Insider tracks new restaurant openings within 48 hours of announcement. Check our 'New Openings' section on the Restaurants page for the latest additions. Recent trends include farm-to-table concepts in East Village, ethnic restaurants expanding in suburban areas, food halls downtown, and craft breweries with full kitchens. We monitor building permits, social media announcements, and industry sources to provide the most current information on upcoming restaurants."
                },
                {
                  question: "What are the price ranges for restaurants in Des Moines?",
                  answer: "Des Moines restaurants range from budget-friendly to upscale: $ (Under $15 per person) - casual dining, fast-casual, food trucks; $$ ($15-30 per person) - mid-range restaurants, most local favorites; $$$ ($30-60 per person) - upscale casual, steakhouses, specialty cuisine; $$$$ (Over $60 per person) - fine dining, tasting menus, special occasions. Use our price filter to find restaurants matching your budget. Des Moines offers exceptional value with many highly-rated restaurants in the $$ range."
                },
                {
                  question: "Are there family-friendly restaurants in Des Moines?",
                  answer: "Yes! Des Moines has numerous family-friendly restaurants with kids menus, high chairs, and welcoming atmospheres. Popular choices include Machine Shed (country cooking with generous portions), Fong's Pizza (unique pizza combinations in a fun setting), Zombie Burger (creative burgers that kids love), Jethro's BBQ (casual BBQ with large portions), Perkins (classic family restaurant), and many ethnic restaurants with family-style dining. Our platform indicates family-friendly features and kids menu availability for each restaurant."
                },
                {
                  question: "What neighborhoods have the best restaurant scenes in Des Moines?",
                  answer: "Des Moines has several distinct dining districts: East Village (trendy, farm-to-table, craft cocktails), Downtown (business lunch, upscale dining, hotels), Ingersoll Avenue (local institutions, neighborhood favorites), Court Avenue (bars, nightlife, casual dining), Valley Junction in West Des Moines (unique concepts, antique district charm), Drake neighborhood (student-friendly, diverse options), and Beaverdale (family-friendly local spots). Each neighborhood offers unique dining experiences reflecting its character."
                },
                {
                  question: "How do I find restaurants with specific dietary options in Des Moines?",
                  answer: "Des Moines offers extensive options for dietary restrictions. Search our restaurant directory using tags for vegetarian, vegan, gluten-free, dairy-free, and allergen-friendly options. Notable restaurants include Ritual Cafe (vegan and vegetarian), Proof (extensive gluten-free menu), Fresh (healthy bowls and smoothies), and many Asian and Mediterranean restaurants with naturally vegetarian options. Most upscale restaurants accommodate dietary restrictions with advance notice. Contact restaurants directly for specific allergen information."
                },
                {
                  question: "Do Des Moines restaurants require reservations?",
                  answer: "Reservation policies vary by restaurant type and popularity. Fine dining and upscale restaurants (Django, Alba, Centro) typically require reservations, especially weekends. Mid-range restaurants may accept reservations but often accommodate walk-ins during off-peak hours. Casual dining and fast-casual restaurants generally operate on a first-come, first-served basis. We recommend calling ahead for parties of 6+ or dining during peak hours (Friday-Saturday evenings). Our restaurant pages include contact information and reservation recommendations."
                }
              ]}
              showSchema={true}
              className="border-0 shadow-lg"
            />
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
