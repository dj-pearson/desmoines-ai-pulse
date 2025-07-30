import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  MapPin,
  ChefHat,
  Music,
  Theater,
  PartyPopper,
} from "lucide-react";

interface InternalLinkingProps {
  currentType?: "event" | "restaurant" | "attraction" | "playground";
  currentId?: string;
  category?: string;
  cuisine?: string;
}

export function InternalLinking({
  currentType,
  currentId,
  category,
  cuisine,
}: InternalLinkingProps) {
  const createEventSlug = (title: string, date?: string): string => {
    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    
    if (!date) {
      return titleSlug;
    }

    try {
      const eventDate = new Date(date);
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      
      return `${titleSlug}-${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error creating event slug:', error);
      return titleSlug;
    }
  };

  const { data: relatedEvents } = useQuery({
    queryKey: ["related-events", category, currentId],
    queryFn: async () => {
      if (!category || currentType !== "event") return [];
      const { data, error } = await supabase
        .from("events")
        .select("id, title, date, category")
        .eq("category", category)
        .neq("id", currentId || "")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!category && currentType === "event",
  });

  const { data: relatedRestaurants } = useQuery({
    queryKey: ["related-restaurants", cuisine, currentId],
    queryFn: async () => {
      if (!cuisine || currentType !== "restaurant") return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, cuisine, location")
        .eq("cuisine", cuisine)
        .neq("id", currentId || "")
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!cuisine && currentType === "restaurant",
  });

  const { data: featuredContent } = useQuery({
    queryKey: ["featured-content", new Date().toDateString()], // Force cache refresh daily
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      console.log('InternalLinking: Fetching featured content for date >=', today);
      
      const [eventsResult, restaurantsResult] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, date, category")
          .eq("is_featured", true)
          .gte("date", today)
          .order("date", { ascending: true })
          .limit(2),
        supabase
          .from("restaurants")
          .select("id, name, cuisine, location")
          .eq("is_featured", true)
          .limit(2),
      ]);

      console.log('InternalLinking: Featured events found:', eventsResult.data?.length);
      return {
        events: eventsResult.data || [],
        restaurants: restaurantsResult.data || [],
      };
    },
  });

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "music":
        return <Music className="h-4 w-4" />;
      case "theater":
      case "arts":
        return <Theater className="h-4 w-4" />;
      case "food":
        return <ChefHat className="h-4 w-4" />;
      case "nightlife":
      case "entertainment":
        return <PartyPopper className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  if (currentType === "event" && relatedEvents && relatedEvents.length > 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">More {category} Events</h3>
          <div className="space-y-3">
            {relatedEvents.map((event) => (
              <Link
                key={event.id}
                to={`/events/${createEventSlug(event.title, String(event.date))}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm line-clamp-2">
                      {event.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(event.date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getCategoryIcon(event.category)}
                    <span className="ml-1">{event.category}</span>
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to={`/events/category/${category?.toLowerCase()}`}
            className="inline-block mt-4 text-sm text-[#DC143C] hover:underline"
          >
            View all {category} events →
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (
    currentType === "restaurant" &&
    relatedRestaurants &&
    relatedRestaurants.length > 0
  ) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">
            More {cuisine} Restaurants
          </h3>
          <div className="space-y-3">
            {relatedRestaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                to={`/restaurants/${restaurant.id}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{restaurant.name}</h4>
                    {restaurant.location && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {restaurant.location}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <ChefHat className="h-3 w-3 mr-1" />
                    {restaurant.cuisine}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to={`/restaurants/cuisine/${cuisine?.toLowerCase()}`}
            className="inline-block mt-4 text-sm text-[#DC143C] hover:underline"
          >
            View all {cuisine} restaurants →
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Show featured content as fallback
  if (
    featuredContent &&
    (featuredContent.events.length > 0 ||
      featuredContent.restaurants.length > 0)
  ) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4">Featured in Des Moines</h3>
          <div className="space-y-3">
            {featuredContent.events.map((event) => (
              <Link
                key={event.id}
                to={`/events/${createEventSlug(event.title, String(event.date))}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm line-clamp-2">
                      {event.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(event.date).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getCategoryIcon(event.category)}
                    <span className="ml-1">{event.category}</span>
                  </Badge>
                </div>
              </Link>
            ))}
            {featuredContent.restaurants.map((restaurant) => (
              <Link
                key={restaurant.id}
                to={`/restaurants/${restaurant.id}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{restaurant.name}</h4>
                    {restaurant.location && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {restaurant.location}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <ChefHat className="h-3 w-3 mr-1" />
                    {restaurant.cuisine}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
