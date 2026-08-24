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
  Play,
  Hotel as HotelIcon
} from "lucide-react";
import { format } from "date-fns";
import { useFavorites } from "@/hooks/useFavorites";
import { Badge } from "@/components/ui/badge";
import { createSlug } from "@/lib/slug";
import { createLogger } from '@/lib/logger';

const log = createLogger('FavoritesView');

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

  // Fetch favorited restaurants.
  //
  // Reads `content_favorites`, which is where useContentFavorites (the hook
  // behind every non-event FavoriteButton) actually writes. This previously read
  // `user_restaurant_interactions`, which nothing writes to, so saved
  // restaurants never appeared here (WEB-QA-010).
  const { data: favoritedRestaurants = [], isLoading: restaurantsLoading } = useQuery({
    queryKey: ["favorited-restaurants", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Two steps, not an embedded join: content_favorites.content_id is
      // polymorphic (it points at whichever table content_type names), so there
      // is no foreign key for PostgREST to traverse and `restaurants:content_id(*)`
      // fails with PGRST200.
      const { data: rows, error } = await supabase
        .from("content_favorites")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_type", "restaurant");

      if (error) {
        log.error('fetchRestaurants', 'Failed to load favorited restaurants', {
          message: error.message, code: error.code, details: error.details, hint: error.hint,
        });
        return [];
      }

      const ids = (rows || []).map((r) => r.content_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data, error: contentError } = await supabase
        .from("restaurants")
        .select("*")
        .in("id", ids);

      if (contentError) {
        log.error('fetchRestaurants', 'Failed to load restaurants rows for favorites', {
          message: contentError.message, code: contentError.code,
        });
        return [];
      }

      return data || [];
    },
    enabled: !!user,
  });

  // Fetch favorited attractions. Same source as restaurants above — the write
  // path is useContentFavorites -> content_favorites (WEB-QA-010). This
  // previously read `user_attraction_interactions`, which does not exist in the
  // schema at all, so the query always errored and the block always returned [].
  const { data: favoritedAttractions = [], isLoading: attractionsLoading } = useQuery({
    queryKey: ["favorited-attractions", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Two steps, not an embedded join: content_favorites.content_id is
      // polymorphic (it points at whichever table content_type names), so there
      // is no foreign key for PostgREST to traverse and `attractions:content_id(*)`
      // fails with PGRST200.
      const { data: rows, error } = await supabase
        .from("content_favorites")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_type", "attraction");

      if (error) {
        log.error('fetchAttractions', 'Failed to load favorited attractions', {
          message: error.message, code: error.code, details: error.details, hint: error.hint,
        });
        return [];
      }

      const ids = (rows || []).map((r) => r.content_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data, error: contentError } = await supabase
        .from("attractions")
        .select("*")
        .in("id", ids);

      if (contentError) {
        log.error('fetchAttractions', 'Failed to load attractions rows for favorites', {
          message: contentError.message, code: contentError.code,
        });
        return [];
      }

      return data || [];
    },
    enabled: !!user,
  });

  // Fetch favorited playgrounds.
  //
  // PlaygroundDetails has shipped a working FavoriteButton (contentType
  // "playground") for as long as the restaurant and attraction ones, but this
  // view only ever queried "restaurant" and "attraction" - so a saved playground
  // was written to content_favorites, confirmed with a toast, and shown as a
  // filled heart on the playground page, while never appearing in Favorites at
  // all. If a playground was a user's ONLY favorite, totalFavorites summed to
  // zero and this view rendered "No Favorites Yet" over a row that existed.
  //
  // The five acceptance criteria on WEB-UX-010 all pass without this: they cover
  // the save control and the filled heart on return, and never say the item has
  // to appear in the favorites list. The unused `Play` icon imported at the top
  // of this file is what is left of the tab that was meant to go with it.
  const { data: favoritedPlaygrounds = [], isLoading: playgroundsLoading } = useQuery({
    queryKey: ["favorited-playgrounds", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Same two-step as restaurants and attractions above: content_id is
      // polymorphic, so there is no foreign key for PostgREST to embed across.
      const { data: rows, error } = await supabase
        .from("content_favorites")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_type", "playground");

      if (error) {
        log.error('fetchPlaygrounds', 'Failed to load favorited playgrounds', {
          message: error.message, code: error.code, details: error.details, hint: error.hint,
        });
        return [];
      }

      const ids = (rows || []).map((r) => r.content_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data, error: contentError } = await supabase
        .from("playgrounds")
        .select("*")
        .in("id", ids);

      if (contentError) {
        log.error('fetchPlaygrounds', 'Failed to load playgrounds rows for favorites', {
          message: contentError.message, code: contentError.code,
        });
        return [];
      }

      return data || [];
    },
    enabled: !!user,
  });

  // Fetch favorited hotels. Until WEB-UX-010's second pass there was no way to
  // create one of these rows: "hotel" was a declared content type in
  // useContentFavorites and lib/guestFavorites, but no page rendered a
  // FavoriteButton for it, so the type was unreachable from both ends. The save
  // control now lives on HotelDetails and this is the list half of it.
  //
  // `hotels` is the one content table here with a real `slug` column, so the
  // link below does not need lib/slug the way the playground one does.
  const { data: favoritedHotels = [], isLoading: hotelsLoading } = useQuery({
    queryKey: ["favorited-hotels", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data: rows, error } = await supabase
        .from("content_favorites")
        .select("content_id")
        .eq("user_id", user.id)
        .eq("content_type", "hotel");

      if (error) {
        log.error('fetchHotels', 'Failed to load favorited hotels', {
          message: error.message, code: error.code, details: error.details, hint: error.hint,
        });
        return [];
      }

      const ids = (rows || []).map((r) => r.content_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data, error: contentError } = await supabase
        .from("hotels")
        .select("*")
        .in("id", ids);

      if (contentError) {
        log.error('fetchHotels', 'Failed to load hotels rows for favorites', {
          message: contentError.message, code: contentError.code,
        });
        return [];
      }

      return data || [];
    },
    enabled: !!user,
  });

  const isLoading = eventsLoading || restaurantsLoading || attractionsLoading || playgroundsLoading || hotelsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading your favorites...</span>
      </div>
    );
  }

  const totalFavorites =
    (events?.length || 0) +
    (favoritedRestaurants?.length || 0) +
    (favoritedAttractions?.length || 0) +
    (favoritedPlaygrounds?.length || 0) +
    (favoritedHotels?.length || 0);

  if (totalFavorites === 0) {
    return (
      <div className="text-center py-12">
        <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Favorites Yet</h3>
        <p className="text-muted-foreground mb-6">
          Start exploring and save your favorite events, restaurants, attractions and playgrounds!
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
      <TabsList className="grid w-full grid-cols-5">
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
        <TabsTrigger value="playgrounds" className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          Playgrounds ({favoritedPlaygrounds?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="hotels" className="flex items-center gap-2">
          <HotelIcon className="h-4 w-4" />
          Hotels ({favoritedHotels?.length || 0})
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
                      aria-label="Remove from favorites"
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

      {/* Playgrounds Tab */}
      <TabsContent value="playgrounds" className="space-y-4 mt-6">
        {favoritedPlaygrounds && favoritedPlaygrounds.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {favoritedPlaygrounds.map((playground: any) => (
              <Card key={playground.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                        {playground.name}
                      </h3>
                      {playground.age_range && (
                        <Badge variant="secondary" className="mb-2">
                          Ages {playground.age_range}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {playground.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-4 w-4" />
                      <span className="line-clamp-1">{playground.location}</span>
                    </div>
                  )}

                  {playground.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {playground.description}
                    </p>
                  )}

                  <Button asChild size="sm" className="w-full">
                    <a href={`/playgrounds/${createSlug(playground.name)}`}>
                      View Details
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Play className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No favorite playgrounds yet</p>
          </div>
        )}
      </TabsContent>

      {/* Hotels Tab */}
      <TabsContent value="hotels" className="space-y-4 mt-6">
        {favoritedHotels && favoritedHotels.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {favoritedHotels.map((hotel: any) => (
              <Card key={hotel.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                        {hotel.name}
                      </h3>
                      {hotel.hotel_type && (
                        <Badge variant="secondary" className="mb-2">
                          {hotel.hotel_type}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {hotel.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-4 w-4" />
                      <span className="line-clamp-1">{hotel.address}</span>
                    </div>
                  )}

                  {hotel.short_description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {hotel.short_description}
                    </p>
                  )}

                  <Button asChild size="sm" className="w-full">
                    <a href={`/stay/${hotel.slug || hotel.id}`}>
                      View Details
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <HotelIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No favorite hotels yet</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
