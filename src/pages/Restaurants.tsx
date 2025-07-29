import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";
import { useRestaurants } from "@/hooks/useRestaurants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, DollarSign, ChefHat } from "lucide-react";
import { Link } from "react-router-dom";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function Restaurants() {
  const { restaurants, isLoading, error } = useRestaurants();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
        {/* Mobile-First Header Section */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-mobile-hero md:text-4xl font-bold text-foreground mb-3 md:mb-4">
            Des Moines Restaurants
          </h1>
          <p className="text-mobile-body md:text-xl text-muted-foreground max-w-3xl mx-auto px-2">
            Discover the latest restaurant openings, established favorites, and hidden gems 
            throughout the Des Moines metro area.
          </p>
        </div>

        {/* Mobile-Optimized Content */}
        <div className="space-y-12">
          {/* Restaurant Openings Section */}
          <RestaurantOpenings />

          {/* All Restaurants Section */}
          <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
              <h2 className="text-mobile-title md:text-2xl font-bold">All Restaurants</h2>
              <p className="text-mobile-caption md:text-sm text-muted-foreground">
                Established restaurants and dining destinations
              </p>
            </div>

            {isLoading ? (
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
                <p className="text-muted-foreground">Error loading restaurants. Please try again later.</p>
              </div>
            ) : restaurants.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No restaurants found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {restaurants.map((restaurant) => (
                  <Link 
                    key={restaurant.id} 
                    to={`/restaurants/${restaurant.id}`}
                    className="block hover:scale-105 transition-transform duration-200"
                  >
                    <Card className="h-full hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg leading-tight line-clamp-2">
                            {restaurant.name}
                          </CardTitle>
                          {restaurant.is_featured && (
                            <Badge variant="secondary" className="shrink-0">Featured</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {restaurant.cuisine && (
                            <div className="flex items-center gap-1">
                              <ChefHat className="h-4 w-4" />
                              <span className="line-clamp-1">{restaurant.cuisine}</span>
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
                              <span className="text-green-600 font-medium">{restaurant.price_range}</span>
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
        </div>
      </main>

      <Footer />
    </div>
  );
}