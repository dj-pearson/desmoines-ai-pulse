import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Restaurant, Attraction, Playground } from "@shared/schema";
import { Utensils, MapPin, Baby, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function MostSearched() {
  const queryClient = useQueryClient();

  const { data: restaurants, isLoading: restaurantsLoading } = useQuery<Restaurant[]>({
    queryKey: ['/api/restaurants/top'],
  });

  const { data: attractions, isLoading: attractionsLoading } = useQuery<Attraction[]>({
    queryKey: ['/api/attractions/top'],
  });

  const { data: playgrounds, isLoading: playgroundsLoading } = useQuery<Playground[]>({
    queryKey: ['/api/playgrounds/top'],
  });

  const incrementSearchMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      return apiRequest('POST', `/api/${type}/${id}/search`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/restaurants/top'] });
      queryClient.invalidateQueries({ queryKey: ['/api/attractions/top'] });
      queryClient.invalidateQueries({ queryKey: ['/api/playgrounds/top'] });
    },
  });

  const handleItemClick = (type: string, id: string) => {
    incrementSearchMutation.mutate({ type, id });
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center p-3">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div className="ml-3 flex-1">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section className="py-16 bg-neutral-50" id="restaurants">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-neutral-900 mb-4">Most Searched in Des Moines</h3>
          <p className="text-lg text-neutral-500">Discover what locals are looking for</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Best Restaurants */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-6">
              <Utensils className="text-2xl text-secondary mr-3" />
              <h4 className="text-xl font-bold">Best Restaurants</h4>
            </div>
            
            {restaurantsLoading ? (
              <LoadingSkeleton />
            ) : restaurants && restaurants.length > 0 ? (
              <div className="space-y-4">
                {restaurants.map((restaurant) => (
                  <div 
                    key={restaurant.id}
                    className="flex items-center p-3 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer" 
                    onClick={() => handleItemClick('restaurants', restaurant.id)}
                  >
                    {restaurant.imageUrl && (
                      <img 
                        src={restaurant.imageUrl} 
                        alt={restaurant.name}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="ml-3 flex-1">
                      <h5 className="font-semibold">{restaurant.name}</h5>
                      <p className="text-sm text-neutral-500">{restaurant.cuisine}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center text-yellow-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="ml-1 text-sm font-semibold">{restaurant.rating}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-center">No restaurants available</p>
            )}

            <Button 
              variant="link" 
              className="w-full mt-6 text-primary hover:text-blue-700 font-semibold"
            >
              View All Restaurants →
            </Button>
          </div>

          {/* Best Attractions */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-6">
              <MapPin className="text-2xl text-accent mr-3" />
              <h4 className="text-xl font-bold">Best Attractions</h4>
            </div>
            
            {attractionsLoading ? (
              <LoadingSkeleton />
            ) : attractions && attractions.length > 0 ? (
              <div className="space-y-4">
                {attractions.map((attraction) => (
                  <div 
                    key={attraction.id}
                    className="flex items-center p-3 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer"
                    onClick={() => handleItemClick('attractions', attraction.id)}
                  >
                    {attraction.imageUrl && (
                      <img 
                        src={attraction.imageUrl} 
                        alt={attraction.name}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="ml-3 flex-1">
                      <h5 className="font-semibold">{attraction.name}</h5>
                      <p className="text-sm text-neutral-500">{attraction.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-center">No attractions available</p>
            )}

            <Button 
              variant="link" 
              className="w-full mt-6 text-primary hover:text-blue-700 font-semibold"
            >
              View All Attractions →
            </Button>
          </div>

          {/* Best Playgrounds */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-6">
              <Baby className="text-2xl text-yellow-500 mr-3" />
              <h4 className="text-xl font-bold">Best Playgrounds</h4>
            </div>
            
            {playgroundsLoading ? (
              <LoadingSkeleton />
            ) : playgrounds && playgrounds.length > 0 ? (
              <div className="space-y-4">
                {playgrounds.map((playground) => (
                  <div 
                    key={playground.id}
                    className="flex items-center p-3 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer"
                    onClick={() => handleItemClick('playgrounds', playground.id)}
                  >
                    {playground.imageUrl && (
                      <img 
                        src={playground.imageUrl} 
                        alt={playground.name}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="ml-3 flex-1">
                      <h5 className="font-semibold">{playground.name}</h5>
                      <p className="text-sm text-neutral-500">{playground.features}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-center">No playgrounds available</p>
            )}

            <Button 
              variant="link" 
              className="w-full mt-6 text-primary hover:text-blue-700 font-semibold"
            >
              View All Playgrounds →
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
