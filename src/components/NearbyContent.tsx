import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useNearbyListings } from "@/hooks/useNearbyListings";
import type { Database } from "@/integrations/supabase/types";
import type { Event } from "@/lib/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
import { Button } from "@/components/ui/button";
import { ChevronRight, Utensils, Calendar, Landmark } from "lucide-react";

const RestaurantCard = lazy(() => import("@/components/RestaurantCard"));
const EventCard = lazy(() => import("@/components/EventCard"));

interface NearbyContentProps {
  variant: "restaurants-near-event" | "events-near-restaurant" | "restaurants-near-attraction";
  locationName?: string;
  /** Kept for call-site compatibility; distance, not city, decides now. */
  city?: string;
  excludeId?: string;
  /** Where "nearby" is measured from. Without both, nothing renders. */
  latitude?: number | string | null;
  longitude?: number | string | null;
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

export function NearbyContent({ variant, excludeId, latitude, longitude }: NearbyContentProps) {
  const showRestaurants = variant === "restaurants-near-event" || variant === "restaurants-near-attraction";
  const showEvents = variant === "events-near-restaurant";

  // SEO-015: by distance from this page's own coordinates. See useNearbyListings.
  const { data: rows, isLoading: queryLoading, fetchStatus } = useNearbyListings(
    showRestaurants ? "restaurants" : "events",
    latitude,
    longitude,
    { excludeId },
  );
  // A disabled query (no coordinates) reports isLoading forever; it is idle.
  const isLoading = queryLoading && fetchStatus !== "idle";
  const filteredRestaurants = showRestaurants ? ((rows ?? []) as unknown as Restaurant[]) : [];
  const filteredEvents = showEvents ? ((rows ?? []) as unknown as Event[]) : [];
  const hasContent = (rows ?? []).length > 0;

  if (!isLoading && !hasContent) return null;

  const config = {
    "restaurants-near-event": {
      title: "Grab a Bite Nearby",
      subtitle: "Restaurants within two miles, closest first",
      icon: Utensils,
      linkText: "Browse All Restaurants",
      linkHref: "/restaurants",
    },
    "events-near-restaurant": {
      title: "Events Happening Nearby",
      subtitle: "Upcoming events within two miles, closest first",
      icon: Calendar,
      linkText: "Browse All Events",
      linkHref: "/events",
    },
    "restaurants-near-attraction": {
      title: "Dining Nearby",
      subtitle: "Restaurants within two miles, closest first",
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
