import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { ChevronRight, Utensils, Calendar, Landmark } from "lucide-react";

const RestaurantCard = lazy(() => import("@/components/RestaurantCard"));
const EventCard = lazy(() => import("@/components/EventCard"));

interface NearbyContentProps {
  variant: "restaurants-near-event" | "events-near-restaurant" | "restaurants-near-attraction";
  locationName?: string;
  city?: string;
  excludeId?: string;
}

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card">
      <div className="h-40 bg-muted rounded-t-xl" />
      <div className="p-4 space-y-2">
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

export function NearbyContent({ variant, city, excludeId }: NearbyContentProps) {
  const showRestaurants = variant === "restaurants-near-event" || variant === "restaurants-near-attraction";
  const showEvents = variant === "events-near-restaurant";

  const { restaurants, isLoading: restaurantsLoading } = useRestaurants(
    showRestaurants
      ? { limit: 3, sortBy: "popularity" }
      : {}
  );

  const { events, isLoading: eventsLoading } = useEvents(
    showEvents
      ? { limit: 3 }
      : {}
  );

  const filteredRestaurants = showRestaurants
    ? restaurants
        .filter((r) => r.id !== excludeId)
        .filter((r) => !city || !r.city || r.city.toLowerCase().includes(city.toLowerCase()) || true)
        .slice(0, 3)
    : [];

  const filteredEvents = showEvents
    ? events
        .filter((e) => e.id !== excludeId)
        .filter((e) => new Date(e.date) >= new Date())
        .slice(0, 3)
    : [];

  const isLoading = showRestaurants ? restaurantsLoading : eventsLoading;
  const hasContent = showRestaurants ? filteredRestaurants.length > 0 : filteredEvents.length > 0;

  if (!isLoading && !hasContent) return null;

  const config = {
    "restaurants-near-event": {
      title: "Grab a Bite Nearby",
      subtitle: "Restaurants to check out before or after the event",
      icon: Utensils,
      linkText: "Browse All Restaurants",
      linkHref: "/restaurants",
    },
    "events-near-restaurant": {
      title: "Events Happening Nearby",
      subtitle: "Upcoming events to pair with your meal",
      icon: Calendar,
      linkText: "Browse All Events",
      linkHref: "/events",
    },
    "restaurants-near-attraction": {
      title: "Dining Nearby",
      subtitle: "Great restaurants to visit while you're in the area",
      icon: Utensils,
      linkText: "Browse All Restaurants",
      linkHref: "/restaurants",
    },
  }[variant];

  const Icon = config.icon;

  return (
    <section className="mt-12 pt-8 border-t pb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{config.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{config.subtitle}</p>
          </div>
        </div>
        <Link to={config.linkHref}>
          <Button variant="outline" size="sm">
            {config.linkText}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {showRestaurants &&
              filteredRestaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  variant="compact"
                />
              ))}
            {showEvents &&
              filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onViewDetails={() => {}}
                />
              ))}
          </div>
        </Suspense>
      )}
    </section>
  );
}
