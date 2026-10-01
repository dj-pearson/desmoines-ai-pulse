import { useMemo } from "react";
import { Link } from "react-router-dom";
import { restaurantHref } from "@/lib/dashboardItems";
import {
  formatCentralTime,
  formatMiles,
  pickDinnerBeforeShow,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

interface DayDinnerPairingProps {
  /** The day's headline event (dayHeadliners in useWindowDinnerRestaurants). */
  event: TonightEvent;
  restaurants: readonly TonightRestaurant[];
  now: Date;
}

/**
 * "Dinner before {show}" under one day of the trip window (plan-stay-pass2
 * WP1 item 7). Up to three restaurants within 1.5 miles of the venue that are
 * open at dinner time (start minus 90 minutes), nearest first, through the
 * same pickDinnerBeforeShow rule event detail uses. Renders nothing when none
 * qualify: no pairing beats a guessed one.
 */
export function DayDinnerPairing({ event, restaurants, now }: DayDinnerPairingProps) {
  const picks = useMemo(() => pickDinnerBeforeShow(event, restaurants, now), [event, restaurants, now]);
  if (picks.length === 0) return null;
  const dinnerAt = formatCentralTime(picks[0]!.dinnerAt);

  return (
    <div className="mt-3 rounded-xl bg-muted/40 p-3" data-trip-window="dinner">
      <p className="text-sm font-medium">
        Dinner before {event.title ?? "the show"}, around {dinnerAt}
      </p>
      <ul className="mt-1 space-y-0.5">
        {picks.map((pick) => (
          <li key={pick.restaurant.id} className="text-sm text-muted-foreground">
            <Link
              to={restaurantHref({ id: pick.restaurant.id, slug: pick.restaurant.slug ?? null })}
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:no-underline sm:min-h-0"
            >
              {pick.restaurant.name}
            </Link>
            {", "}
            {formatMiles(pick.distanceMiles)}
            {pick.closesAt ? `, open until ${pick.closesAt}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
