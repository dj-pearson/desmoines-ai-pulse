
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin,
  Star,
  Phone,
  Globe,
  Search,
  Filter,
  Utensils,
  List, 
  Map
} from "lucide-react";
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
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { useToast } from "@/hooks/use-toast";
import RestaurantsMap from "@/components/RestaurantsMap";

export default function RestaurantsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("all");
  const [location, setLocation] = useState("any-location");
  const [priceRange, setPriceRange] = useState("any-price");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const { toast } = useToast();

  const { data: restaurants, isLoading } = useQuery({
    queryKey: [
      "restaurants",
      searchQuery,
      selectedCuisine,
      location,
      priceRange,
    ],
    queryFn: async () => {
      let query = supabase
        .from("restaurants")
        .select("*")
        .order("rating", { ascending: false });

      // Apply filters
      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,cuisine.ilike.%${searchQuery}%`
        );
      }

      if (selectedCuisine && selectedCuisine !== "all") {
        query = query.eq("cuisine", selectedCuisine);
      }

      if (location && location !== "any-location") {
        query = query.ilike("location", `%${location}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: cuisines } = useQuery({
    queryKey: ["restaurant-cuisines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("cuisine");

      if (error) throw error;
      const uniqueCuisines = [
        ...new Set(data.map((restaurant) => restaurant.cuisine)),
      ].filter(Boolean);
      return uniqueCuisines.sort();
    },
  });

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCuisine("all");
    setLocation("any-location");
    setPriceRange("any-price");
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  // SEO data
  const seoTitle = searchQuery
    ? `"${searchQuery}" Restaurants in Des Moines`
    : selectedCuisine && selectedCuisine !== "all"
    ? `${selectedCuisine} Restaurants in Des Moines`
    : "Restaurants in Des Moines - Best Dining & Cuisine";

  const seoDescription = `Discover ${searchQuery ? `"${searchQuery}" ` : ""}${
    selectedCuisine && selectedCuisine !== "all"
      ? selectedCuisine.toLowerCase() + " "
      : ""
  }restaurants in Des Moines, Iowa. Find the best dining experiences, local favorites, and new restaurant openings.`;

  const restaurantKeywords = [
    "Des Moines restaurants",
    "Iowa dining",
    "best restaurants",
    "Des Moines food",
    "restaurant reviews",
    "local dining",
    "new restaurants",
    ...(selectedCuisine && selectedCuisine !== "all"
      ? [selectedCuisine.toLowerCase()]
      : []),
    ...(searchQuery ? [searchQuery] : []),
  ];

  const restaurantsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Des Moines Restaurants",
    description: seoDescription,
    numberOfItems: restaurants?.length || 0,
    itemListElement:
      restaurants?.slice(0, 10).map((restaurant, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Restaurant",
          name: restaurant.name,
          description: restaurant.description,
          address: restaurant.location,
          telephone: restaurant.phone,
          servesCuisine: restaurant.cuisine,
          priceRange: restaurant.price_range,
        },
      })) || [],
  };

  if (isLoading) {
    return (
      <>
        <SEOHead
          title="Loading Restaurants..."
          description="Loading restaurants in Des Moines"
          type="website"
        />
        <div className="min-h-screen bg-background">
          <Header />
          <div className="container mx-auto px-4 py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-muted rounded w-1/3"></div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-48 bg-muted rounded"></div>
                ))}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        type="website"
        keywords={restaurantKeywords}
        structuredData={restaurantsSchema}
        url="/restaurants"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Restaurants", url: "/restaurants" },
        ]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section with DMI Brand Colors */}
        <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden">
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-base bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setShowFilters(!showFilters)}
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                  <div className="flex items-center rounded-md bg-white/20 p-0.5">
                    <Button
                      onClick={() => setViewMode('list')}
                      variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                      size="icon"
                      className={viewMode === 'list' ? 'bg-white/30 text-white' : 'text-white/70 hover:bg-white/30 hover:text-white'}
                    >
                      <List className="h-5 w-5" />
                    </Button>
                    <Button
                      onClick={() => setViewMode('map')}
                      variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                      size="icon"
                      className={viewMode === 'map' ? 'bg-white/30 text-white' : 'text-white/70 hover:bg-white/30 hover:text-white'}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Cuisine Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Cuisine Type
                  </label>
                  <Select
                    value={selectedCuisine}
                    onValueChange={setSelectedCuisine}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cuisines</SelectItem>
                      {cuisines?.map((cuisine) => (
                        <SelectItem key={cuisine} value={cuisine}>
                          {cuisine}
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
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Price Range
                  </label>
                  <Select value={priceRange} onValueChange={setPriceRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-price">Any price</SelectItem>
                      <SelectItem value="$">$ - Budget Friendly</SelectItem>
                      <SelectItem value="$">$ - Moderate</SelectItem>
                      <SelectItem value="$$">$$ - Upscale</SelectItem>
                      <SelectItem value="$$">$$ - Fine Dining</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
                <div className="text-sm text-gray-500">
                  {restaurants?.length || 0} restaurants found
                </div>
              </div>
            </div>
          )}

          {/* Results Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {searchQuery
                ? `Search results for "${searchQuery}"`
                : selectedCuisine && selectedCuisine !== "all"
                ? `${selectedCuisine} Restaurants`
                : "Top Restaurants"}
            </h2>
            <div className="text-sm text-gray-500">
              {restaurants?.length || 0} restaurants
            </div>
          </div>

          {/* Results Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {searchQuery
                ? `Search results for "${searchQuery}"`
                : selectedCuisine && selectedCuisine !== "all"
                ? `${selectedCuisine} Restaurants`
                : "Top Restaurants"}
            </h2>
            <div className="text-sm text-gray-500">
              {restaurants?.length || 0} restaurants
            </div>
          </div>

          {viewMode === 'map' ? (
            <RestaurantsMap restaurants={restaurants || []} />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {restaurants?.map((restaurant) => (
                <Link
                  key={restaurant.id}
                  to={`/restaurants/${restaurant.slug || restaurant.id}`}
                >
                  <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                    {restaurant.image_url && (
                      <div className="aspect-video overflow-hidden rounded-t-lg">
                        <img
                          src={restaurant.image_url}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="bg-[#2D1B69]/10 text-[#2D1B69]"
                          >
                            <Utensils className="h-3 w-3 mr-1" />
                            {restaurant.cuisine}
                          </Badge>
                          {restaurant.is_featured && (
                            <Badge className="bg-[#DC143C]">Featured</Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-lg line-clamp-2">
                          {restaurant.name}
                        </h3>

                        <div className="space-y-2 text-sm text-muted-foreground">
                          {restaurant.rating && (
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span>{restaurant.rating}/5</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span className="line-clamp-1">
                              {restaurant.location}
                            </span>
                          </div>

                          {restaurant.phone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              <span>{restaurant.phone}</span>
                            </div>
                          )}
                        </div>

                        {restaurant.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {restaurant.description}
                          </p>
                        )}

                        {restaurant.price_range && (
                          <div className="text-sm font-medium text-[#2D1B69]">
                            {restaurant.price_range}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* No Results State */}
          {(!restaurants || restaurants.length === 0) && (
            <div className="text-center py-16">
              <Utensils className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">No restaurants found</h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery || selectedCuisine !== "all"
                  ? "Try adjusting your search criteria or filters"
                  : "Check back soon for new restaurant listings!"}
              </p>
              {(searchQuery || selectedCuisine !== "all") && (
                <Button onClick={handleClearFilters} variant="outline">
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </main>

        <Footer />
      </div>
    </>
  );
}
