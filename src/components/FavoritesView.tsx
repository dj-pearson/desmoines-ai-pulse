import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Heart,
  Calendar,
  MapPin,
  ExternalLink,
  Loader2,
  Trash2,
  UtensilsCrossed,
  Landmark,
  Play
} from "lucide-react";
import { format } from "date-fns";
import { useFavorites } from "@/hooks/useFavorites";
import { Badge } from "@/components/ui/badge";

export function FavoritesView() {
  const { user } = useAuth();
  const { favoritedEvents, toggleFavorite } = useFavorites();

  // Fetch full event details for favorited events
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["favorited-events-details", favoritedEvents],
    queryFn: async () => {
      if (!favoritedEvents || favoritedEvents.length === 0) return [];

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .in("id", favoritedEvents)
        .order("date", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: favoritedEvents.length > 0,
  });

  // Fetch favorited restaurants (from user interactions)
  const { data: favoritedRestaurants = [], isLoading: restaurantsLoading } = useQuery({
    queryKey: ["favorited-restaurants", user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
        const { data, error } = await supabase
          .from("user_restaurant_interactions" as any)
          .select("restaurant_id, restaurants(*)")
          .eq("user_id", user.id)
          .eq("interaction_type", "favorite");

        if (error) {
          console.log("Restaurant favorites not available yet");
          return [];
        }

        return (data || []).map((item: any) => item.restaurants).filter(Boolean);
      } catch (err) {
        console.log("Restaurant favorites table not available");
        return [];
      }
    },
    enabled: !!user,
  });

  // Fetch favorited attractions
  const { data: favoritedAttractions = [], isLoading: attractionsLoading } = useQuery({
    queryKey: ["favorited-attractions", user?.id],
    queryFn: async () => {
      if (!user) return [];

      try {
        const { data, error } = await supabase
          .from("user_attraction_interactions" as any)
          .select("attraction_id, attractions(*)")
          .eq("user_id", user.id)
          .eq("interaction_type", "favorite");

        if (error) {
          console.log("Attraction favorites not available yet");
          return [];
        }

        return (data || []).map((item: any) => item.attractions).filter(Boolean);
      } catch (err) {
        console.log("Attraction favorites table not available");
        return [];
      }
    },
    enabled: !!user,
  });

  const isLoading = eventsLoading || restaurantsLoading || attractionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading your favorites...</span>
      </div>
    );
  }

  const totalFavorites = (events?.length || 0) + (favoritedRestaurants?.length || 0) + (favoritedAttractions?.length || 0);

  if (totalFavorites === 0) {
    return (
      <div className="text-center py-12">
        <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Favorites Yet</h3>
        <p className="text-muted-foreground mb-6">
          Start exploring and save your favorite events, restaurants, and attractions!
        </p>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <a href="/events">
              <Calendar className="h-4 w-4 mr-2" />
              Browse Events
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/restaurants">
              <UtensilsCrossed className="h-4 w-4 mr-2" />
              Browse Restaurants
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="events" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="events" className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Events ({events?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="restaurants" className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4" />
          Restaurants ({favoritedRestaurants?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="attractions" className="flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          Attractions ({favoritedAttractions?.length || 0})
        </TabsTrigger>
      </TabsList>

      {/* Events Tab */}
      <TabsContent value="events" className="space-y-4 mt-6">
        {events && events.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {events.map((event: any) => (
              <Card key={event.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                        {event.title}
                      </h3>
                      {event.category && (
                        <Badge variant="secondary" className="mb-2">
                          {event.category}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleFavorite(event.id)}
                      className="flex-shrink-0"
                    >
                      <Heart className="h-5 w-5 fill-red-500 text-red-500" />
                    </Button>
                  </div>

                  {event.date && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Calendar className="h-4 w-4" />
                      <span>{format(new Date(event.date), "MMM d, yyyy")}</span>
                      {event.time && <span>at {event.time}</span>}
                    </div>
                  )}

                  {event.venue && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-4 w-4" />
                      <span className="line-clamp-1">{event.venue}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                      <a href={`/events/${event.slug || event.id}`}>
                        View Details
                      </a>
                    </Button>
                    {event.url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={event.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No favorite events yet</p>
          </div>
        )}
      </TabsContent>

      {/* Restaurants Tab */}
      <TabsContent value="restaurants" className="space-y-4 mt-6">
        {favoritedRestaurants && favoritedRestaurants.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {favoritedRestaurants.map((restaurant: any) => (
              <Card key={restaurant.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                        {restaurant.name}
                      </h3>
                      {restaurant.cuisine && (
                        <Badge variant="secondary" className="mb-2">
                          {restaurant.cuisine}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {restaurant.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-4 w-4" />
                      <span className="line-clamp-1">{restaurant.address}</span>
                    </div>
                  )}

                  {restaurant.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {restaurant.description}
                    </p>
                  )}

                  <Button asChild size="sm" className="w-full">
                    <a href={`/restaurants/${restaurant.slug || restaurant.id}`}>
                      View Details
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <UtensilsCrossed className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No favorite restaurants yet</p>
          </div>
        )}
      </TabsContent>

      {/* Attractions Tab */}
      <TabsContent value="attractions" className="space-y-4 mt-6">
        {favoritedAttractions && favoritedAttractions.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {favoritedAttractions.map((attraction: any) => (
              <Card key={attraction.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                        {attraction.name}
                      </h3>
                      {attraction.category && (
                        <Badge variant="secondary" className="mb-2">
                          {attraction.category}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {attraction.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-4 w-4" />
                      <span className="line-clamp-1">{attraction.address}</span>
                    </div>
                  )}

                  {attraction.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {attraction.description}
                    </p>
                  )}

                  <Button asChild size="sm" className="w-full">
                    <a href={`/attractions/${attraction.slug || attraction.id}`}>
                      View Details
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Landmark className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No favorite attractions yet</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
