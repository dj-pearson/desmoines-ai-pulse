import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNearbyListings } from "@/hooks/useNearbyListings";
import type { Database } from "@/integrations/supabase/types";
import type { Event } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, Utensils, Calendar } from "lucide-react";
import {
  DINNER_LEAD_MINUTES,
  PAIR_MAX_MILES,
  formatCentralTime,
  formatMiles,
  type TonightDinner,
} from "@/lib/tonightPairings";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import type { TonightNearbyEvent } from "@/hooks/useTonightNearRestaurant";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

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

/** The event detail path, built the same way as every other event link. */
function eventHref(event: { title?: string | null }): string {
  return `/events/${createEventSlugWithCentralTime(event.title, event)}`;
}

export function NearbyContent({ variant, excludeId, latitude, longitude }: NearbyContentProps) {
  const navigate = useNavigate();
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
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to={config.linkHref}>
            {config.linkText}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
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
                  // Was a no-op, so "View details" on a nearby event did nothing.
                  onViewDetails={(e) => navigate(eventHref(e))}
                />
              ))}
          </div>
        </Suspense>
      )}
    </section>
  );
}

interface DinnerBeforeShowProps {
  /** From useDinnerBeforeShow. Nothing renders when empty. */
  picks: TonightDinner[];
  /** The event's start, for the heading ("before the 7:30 PM show"). */
  startsAt: Date | null;
}

/**
 * "Before the show" (events plan WP8 item 6, bet 4): up to three restaurants
 * near the venue that are open when dinner would start. The distance-only
 * NearbyContent rail is the fallback when this has nothing to say.
 */
export function DinnerBeforeShow({ picks, startsAt }: DinnerBeforeShowProps) {
  if (picks.length === 0) return null;
  const dinnerAt = picks[0].dinnerAt;

  return (
    <section aria-labelledby="dinner-before-show" className="mt-6 border-t pt-5">
      <h2 id="dinner-before-show" className="text-base font-semibold text-foreground">
        Dinner before the show
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Open at {formatCentralTime(dinnerAt)} CT, {DINNER_LEAD_MINUTES} minutes before the
        {startsAt ? ` ${formatCentralTime(startsAt)}` : ""} start. Straight-line distance from the venue.
      </p>
      <ul className="mt-3 divide-y rounded-xl border">
        {picks.map(({ restaurant, distanceMiles }) => (
          <li key={restaurant.id}>
            <Link
              to={`/restaurants/${restaurant.slug || restaurant.id}`}
              className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{restaurant.name}</span>
                {(restaurant.cuisine || restaurant.price_range) && (
                  <span className="block truncate text-muted-foreground">
                    {[restaurant.cuisine, restaurant.price_range].filter(Boolean).join(" - ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatMiles(distanceMiles)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TonightNearRestaurantProps {
  /** From useTonightNearRestaurant. Nothing renders when empty. */
  events: TonightNearbyEvent[];
}

/**
 * "After dinner, nearby tonight" (restaurants plan WP8 item 6): tonight's
 * events within PAIR_MAX_MILES of the restaurant, in start order. The mirror
 * of DinnerBeforeShow on the event page. The distance-only NearbyContent rail
 * is the fallback when nothing is on tonight.
 */
export function TonightNearRestaurant({ events }: TonightNearRestaurantProps) {
  if (events.length === 0) return null;

  return (
    <section aria-labelledby="tonight-nearby" className="mt-12 border-t pt-8 pb-8">
      <h2 id="tonight-nearby" className="text-2xl font-bold text-foreground">
        After dinner, nearby tonight
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Events starting later today within {PAIR_MAX_MILES} miles. Straight-line distance from the
        restaurant.
      </p>
      <ul className="mt-4 divide-y rounded-xl border bg-card">
        {events.map(({ event, startsAt, distanceMiles, walkable }) => (
          <li key={event.id}>
            <Link
              to={eventHref(event)}
              className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {event.title || "Untitled event"}
                </span>
                <span className="block truncate text-muted-foreground">
                  {[startsAt ? `${formatCentralTime(startsAt)} CT` : "Time not listed", event.venue]
                    .filter(Boolean)
                    .join(" - ")}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums text-muted-foreground">
                <span className="block">{formatMiles(distanceMiles)}</span>
                {walkable && <span className="block text-xs">walkable</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <Link to="/events/today" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
          Everything on today
        </Link>
      </p>
    </section>
  );
}
