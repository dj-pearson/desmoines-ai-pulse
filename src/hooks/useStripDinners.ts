import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TONIGHT_RESTAURANT_COLUMNS } from "@/lib/listColumns";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";
import { isPrerender } from "@/lib/isPrerender";
import { centralHour } from "@/lib/timezone";
import {
  DINNER_LEAD_MINUTES,
  EVENING_START_HOUR,
  pickDinner,
  restaurantBoxes,
  type TonightDinner,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";
import type { TonightItem } from "@/components/events/eventsHubQuery";

/** One request for the whole strip; the boxes are small, so this is plenty. */
export const STRIP_DINNER_ROW_LIMIT = 60;

/** Event id -> the dinner to print under its strip card. */
export type StripDinnerMap = Record<string, TonightDinner>;

/**
 * The strip rows that can get a dinner line: a published start, in the
 * evening (16:00 Central or later), with dinner time still ahead.
 */
export function dinnerCandidates(items: readonly TonightItem[], now: Date): TonightItem[] {
  const nowMs = now.getTime();
  return items.filter((item) => {
    if (item.status !== "soon" || item.startMs === null) return false;
    if (centralHour(new Date(item.startMs)) < EVENING_START_HOUR) return false;
    return item.startMs - DINNER_LEAD_MINUTES * 60_000 > nowMs;
  });
}

/**
 * For each candidate, the nearest restaurant within PAIR_MAX_MILES that is open
 * at start minus DINNER_LEAD_MINUTES (pickDinner, the rule Home's rail and
 * event detail use). Nothing pairs, nothing is printed.
 */
export function pairStripDinners(
  items: readonly TonightItem[],
  restaurants: readonly TonightRestaurant[],
  now: Date
): StripDinnerMap {
  const out: StripDinnerMap = {};
  const used = new Set<string>();
  for (const item of dinnerCandidates(items, now)) {
    if (item.startMs === null) continue;
    const dinner = pickDinner(
      item.event as unknown as TonightEvent,
      new Date(item.startMs),
      restaurants,
      now,
      used
    );
    if (!dinner || dinner.dinnerAt.getTime() <= now.getTime()) continue;
    used.add(dinner.restaurant.id);
    out[item.event.id] = dinner;
  }
  return out;
}

/**
 * "Dinner nearby" for the hub's Tonight strip (events-pass2 WP1 item 18, bet
 * 2). One restaurants request for every evening card, shaped by
 * restaurantBoxes() so it only reads rows near those venues. Skipped in the
 * prerender: an "open until 10 PM" frozen into static HTML is wrong by lunch.
 * A failed request is logged and prints no line; it never blocks the strip.
 */
export function useStripDinners(items: readonly TonightItem[], now: Date): StripDinnerMap {
  const candidates = useMemo(() => dinnerCandidates(items, now), [items, now]);
  const boxes = useMemo(
    () => restaurantBoxes(candidates.map((i) => i.event as unknown as TonightEvent)),
    [candidates]
  );
  const enabled = boxes.length > 0 && !isPrerender();

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants", "strip-dinners", boxes.join("|")],
    enabled,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<TonightRestaurant[]> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(TONIGHT_RESTAURANT_COLUMNS)
        .neq("is_merged", true)
        .not("opening", "is", null)
        .or(boxes.join(","))
        .order("id", { ascending: true })
        .limit(STRIP_DINNER_ROW_LIMIT);
      if (error) {
        handleError(
          error,
          { component: "useStripDinners", action: "fetchRestaurants" },
          ErrorSeverity.WARNING
        );
        return [];
      }
      return (data ?? []) as unknown as TonightRestaurant[];
    },
  });

  return useMemo(
    () => (enabled && restaurants ? pairStripDinners(items, restaurants, now) : {}),
    [enabled, restaurants, items, now]
  );
}
