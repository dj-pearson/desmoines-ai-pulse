import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/ui/error-state";
import { useRestaurantOpenings, type RestaurantWithSlug } from "@/hooks/useSupabase";
import { openingLabel } from "@/lib/restaurantOpenings";

/** How many places the hub's openings watch lists. The request carries it as limit=8. */
export const OPENINGS_WATCH_LIMIT = 8;

/**
 * The line a row prints. openingLabel works on the snake_case row; the hook's
 * transform renamed those fields, so they are mapped back here.
 */
function labelFor(row: RestaurantWithSlug, now: Date): string {
  return (
    openingLabel(
      {
        id: row.id,
        name: row.name,
        status: row.status ?? null,
        opening_date: row.openingDate ?? null,
        opening_timeframe: row.openingTimeframe ?? null,
      },
      now,
    ) ?? "Announced"
  );
}

function Heading() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="openings-watch-heading" className="text-mobile-title md:text-2xl font-bold">
        Openings watch
      </h2>
      <Link
        to="/restaurants/new"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        Every new and upcoming restaurant
      </Link>
    </div>
  );
}

/**
 * The hub's openings watch: one dated line per place that just opened or is
 * about to. "Opened Sep 12", "Opening Oct 2026", "Announced", plus cuisine and
 * city, linking to the restaurant's own page by its stored slug.
 *
 * Links used to be rebuilt from the name (`createSlug`). Stored slugs are
 * unaccented and city-suffixed ("foo-altoona"), so a name-derived link 404ed or
 * opened a different location of the same chain.
 */
export function RestaurantOpenings() {
  const {
    data: restaurants = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRestaurantOpenings({ limit: OPENINGS_WATCH_LIMIT, includeRecentlyOpened: true });
  const now = new Date();

  let body: ReactNode;
  if (isLoading) {
    body = (
      <ul className="divide-y rounded-xl border" aria-busy="true" aria-label="Loading openings">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 px-4 py-3">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
          </li>
        ))}
      </ul>
    );
  } else if (isError) {
    body = (
      <ErrorState
        compact
        error={error}
        title="Openings didn't load"
        description="We couldn't reach the openings list just now."
        onRetry={() => void refetch()}
      />
    );
  } else if (restaurants.length === 0) {
    body = (
      <p className="text-muted-foreground">
        Nothing opened in the last two months and nothing is announced right now.
      </p>
    );
  } else {
    body = (
      <ol className="divide-y rounded-xl border">
        {restaurants.slice(0, OPENINGS_WATCH_LIMIT).map((restaurant) => {
          const meta = [restaurant.cuisine, restaurant.city].filter(Boolean).join(", ");
          return (
            <li
              key={restaurant.id}
              className="relative flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4 hover:bg-muted/50 focus-within:bg-muted/50"
            >
              <span className="text-sm font-medium tabular-nums text-muted-foreground sm:w-40 sm:flex-shrink-0">
                {labelFor(restaurant, now)}
              </span>
              <span className="min-w-0 flex-1">
                {/* Stretched link: the row is clickable and the name is the one anchor. */}
                <Link
                  to={`/restaurants/${restaurant.slug || restaurant.id}`}
                  className="font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {restaurant.name}
                </Link>
                {meta && <span className="block text-sm text-muted-foreground sm:inline sm:ml-2">{meta}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section aria-labelledby="openings-watch-heading" className="space-y-4">
      <Heading />
      {body}
    </section>
  );
}
