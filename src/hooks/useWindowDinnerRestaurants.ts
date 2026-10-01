/**
 * Restaurants for "Dinner before the show" on each day of the trip window
 * (plan-stay-pass2 WP1 item 7, bet 3).
 *
 * One request for the whole window, bounded by restaurantBoxes() around each
 * day's headline event, with the same serving-status and is_merged filters as
 * the Tonight rail (useTonightPairings). Skipped in the prerender, where an
 * "open until 10 PM" frozen into static HTML would be wrong by lunch, and
 * held until the events query has settled so it never races it. A failed
 * request is logged and pairs nothing; it never blocks the day list.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TONIGHT_RESTAURANT_COLUMNS } from "@/lib/listColumns";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";
import { isPrerender } from "@/lib/isPrerender";
import { centralDateOf, centralHour, type CentralDate } from "@/lib/timezone";
import {
  EVENING_START_HOUR,
  eventStartInstant,
  restaurantBoxes,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";
import type { EventDayGroup } from "@/hooks/useEventsInRange";

/** Enough rows for a handful of 1.5 mi boxes; the Tonight rail uses the same cap. */
export const WINDOW_DINNER_ROW_LIMIT = 250;

/** Statuses left out of the request; isOpenForDinner refuses them too. */
const NOT_SERVING_FILTER = "(closed,permanently_closed,temporarily_closed,opening_soon)";

export interface DayHeadliner {
  day: CentralDate;
  event: TonightEvent;
}

function located(event: TonightEvent): boolean {
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);
  return (
    event.latitude != null &&
    event.longitude != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  );
}

/**
 * Each day's headline event for a dinner pairing: the earliest event that
 * STARTS that day, in the evening (16:00 Central or later), with a published
 * time still ahead of `now` and a mapped venue, and that ends the same day
 * (a multi-day run's first hour isn't a show). A day with none gets no
 * pairing rather than a dinner slot built from a guessed hour.
 */
export function dayHeadliners(days: readonly EventDayGroup[], now: Date): DayHeadliner[] {
  const out: DayHeadliner[] = [];
  for (const group of days) {
    let best: { event: TonightEvent; at: number } | null = null;
    for (const row of group.events) {
      const event = row as unknown as TonightEvent;
      if (!event.date || centralDateOf(event.date) !== group.day || !located(event)) continue;
      // A festival's opening hour isn't a show to eat before.
      if (event.end_date && centralDateOf(event.end_date) > group.day) continue;
      const start = eventStartInstant(event);
      if (!start || start.getTime() <= now.getTime()) continue;
      if (centralHour(start) < EVENING_START_HOUR) continue;
      if (!best || start.getTime() < best.at) best = { event, at: start.getTime() };
    }
    if (best) out.push({ day: group.day, event: best.event });
  }
  return out;
}

export function useWindowDinnerRestaurants(
  days: readonly EventDayGroup[],
  opts: { eventsSettled: boolean; now: Date },
) {
  const headliners = useMemo(() => dayHeadliners(days, opts.now), [days, opts.now]);
  const boxes = useMemo(() => restaurantBoxes(headliners.map((h) => h.event)), [headliners]);
  const enabled = opts.eventsSettled && boxes.length > 0 && !isPrerender();

  const query = useQuery({
    queryKey: ["restaurants", "trip-window-dinners", boxes.join("|")],
    enabled,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<TonightRestaurant[]> => {
      // One `or` holding (any box) AND (no status, or a serving one). A plain
      // .not('status','in',...) would also drop rows whose status is NULL.
      const logic = `and(or(${boxes.join(",")}),or(status.is.null,status.not.in.${NOT_SERVING_FILTER}))`;
      const { data, error } = await supabase
        .from("restaurants")
        .select(TONIGHT_RESTAURANT_COLUMNS)
        .neq("is_merged", true)
        .not("opening", "is", null)
        .or(logic)
        .order("id", { ascending: true })
        .limit(WINDOW_DINNER_ROW_LIMIT);
      if (error) {
        handleError(
          error,
          { component: "useWindowDinnerRestaurants", action: "fetchRestaurants" },
          ErrorSeverity.WARNING,
        );
        return [];
      }
      return (data ?? []) as unknown as TonightRestaurant[];
    },
  });

  return { headliners, restaurants: enabled ? (query.data ?? []) : [] };
}
