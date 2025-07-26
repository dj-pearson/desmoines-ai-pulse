import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Utensils, MapPin, Baby, Star } from "lucide-react";
import { useFeaturedRestaurants, useFeaturedAttractions, useFeaturedPlaygrounds } from "@/hooks/useSupabase";

export default function MostSearched() {
  const { data: restaurants = [] } = useFeaturedRestaurants();
  const { data: attractions = [] } = useFeaturedAttractions();
  const { data: playgrounds = [] } = useFeaturedPlaygrounds();

  return (
    <section className="py-16 bg-muted/50" id="most-searched">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-neutral-900 mb-4">Most Searched</h3>
          <p className="text-lg text-neutral-500">Popular restaurants, attractions, and playgrounds</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Restaurants Section */}
          <div>
            <div className="flex items-center mb-6">
              <Utensils className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">Top Restaurants</h4>
            </div>
            <div className="space-y-4">
              {restaurants.slice(0, 3).map((restaurant) => (
                <Card key={restaurant.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                      {restaurant.rating && (
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-500 mr-1" />
                          <span className="text-sm font-medium">{restaurant.rating}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      {restaurant.cuisine && (
                        <Badge variant="secondary" className="mr-2">
                          {restaurant.cuisine}
                        </Badge>
                      )}
                      {restaurant.priceRange && (
                        <span className="text-green-600 font-medium">
                          {restaurant.priceRange}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  {restaurant.location && (
                    <CardContent className="pt-0">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{restaurant.location}</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* Attractions Section */}
          <div>
            <div className="flex items-center mb-6">
              <MapPin className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">Top Attractions</h4>
            </div>
            <div className="space-y-4">
              {attractions.slice(0, 3).map((attraction) => (
                <Card key={attraction.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{attraction.name}</CardTitle>
                      {attraction.rating && (
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-500 mr-1" />
                          <span className="text-sm font-medium">{attraction.rating}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {attraction.type}
                    </Badge>
                  </CardHeader>
                  {attraction.location && (
                    <CardContent className="pt-0">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{attraction.location}</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* Playgrounds Section */}
          <div>
            <div className="flex items-center mb-6">
              <Baby className="h-6 w-6 text-primary mr-2" />
              <h4 className="text-xl font-semibold">Top Playgrounds</h4>
            </div>
            <div className="space-y-4">
              {playgrounds.slice(0, 3).map((playground) => (
                <Card key={playground.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{playground.name}</CardTitle>
                      {playground.rating && (
                        <div className="flex items-center">
                          <Star className="h-4 w-4 text-yellow-500 mr-1" />
                          <span className="text-sm font-medium">{playground.rating}</span>
                        </div>
                      )}
                    </div>
                    {playground.ageRange && (
                      <Badge variant="secondary">
                        Ages: {playground.ageRange}
                      </Badge>
                    )}
                  </CardHeader>
                  {playground.location && (
                    <CardContent className="pt-0">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 mr-1" />
                        <span>{playground.location}</span>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}