/**
 * "After dinner, nearby tonight" for a restaurant page (restaurants plan WP8
 * item 6, bet 3).
 *
 * The detail page used to show "events within two miles", any date, which is
 * a list a diner can't act on tonight. This asks for today's Central-day
 * events inside a PAIR_MAX_MILES box around the restaurant, with the same
 * unpublish filters useTonightPairings uses, and keeps the ones that haven't
 * started yet via selectTonightEvents.
 *
 * One request. The weather reorder is skipped on purpose (WEATHER_UNAVAILABLE
 * keeps start order), so the page does not take on a weather call for a
 * three-row list.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WEATHER_UNAVAILABLE } from "@/hooks/useWeather";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { handleError } from "@/lib/errorHandler";
import { shouldRetry } from "@/lib/queryConfig";
import { haversineDistance } from "@/lib/geo";
import {
  LAT_PAD_DEG,
  LNG_PAD_DEG,
  PAIR_MAX_MILES,
  centralDayWindow,
  eventStartInstant,
  selectTonightEvents,
  type TonightEvent,
} from "@/lib/tonightPairings";

/** Under this, the row says "walkable". About a 15-minute walk. */
export const WALKABLE_MILES = 0.75;

/** Rows shown. */
export const MAX_TONIGHT_NEAR_RESTAURANT = 4;

const FIVE_MINUTES = 5 * 60 * 1000;
const EVENT_ROW_LIMIT = 40;

export interface TonightNearbyEvent {
  event: TonightEvent;
  /** Null for an event with no specific start time. */
  startsAt: Date | null;
  distanceMiles: number;
  walkable: boolean;
}

interface Origin {
  latitude: number;
  longitude: number;
}

/**
 * Tonight's events within PAIR_MAX_MILES of `origin`, not yet started,
 * in start order (no-time events last). Pure, for a fixed-clock test.
 */
export function pickTonightNear(
  rows: readonly TonightEvent[],
  origin: Origin,
  now: Date,
  limit: number = MAX_TONIGHT_NEAR_RESTAURANT,
): TonightNearbyEvent[] {
  const out: TonightNearbyEvent[] = [];
  for (const event of selectTonightEvents(rows, now, WEATHER_UNAVAILABLE)) {
    if (typeof event.latitude !== "number" || typeof event.longitude !== "number") continue;
    if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) continue;
    if (event.latitude === 0 && event.longitude === 0) continue;
    const distanceMiles = haversineDistance(origin, {
      latitude: event.latitude,
      longitude: event.longitude,
    });
    if (distanceMiles > PAIR_MAX_MILES) continue;
    out.push({
      event,
      startsAt: eventStartInstant(event),
      distanceMiles,
      walkable: distanceMiles < WALKABLE_MILES,
    });
    if (out.length >= limit) break;
  }
  return out;
}

function toCoord(value: number | string | null | undefined): number {
  if (value == null || value === "") return NaN;
  return Number(value);
}

export interface TonightNearRestaurantResult {
  events: TonightNearbyEvent[];
  isLoading: boolean;
  /** True once the query has an answer (data or error), or when it can't run. */
  isSettled: boolean;
  isError: boolean;
}

const NO_ROWS: TonightEvent[] = [];

export function useTonightNearRestaurant(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
): TonightNearRestaurantResult {
  const lat = toCoord(latitude);
  const lng = toCoord(longitude);
  const located = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const day = centralDayWindow(new Date());

  const query = useQuery({
    queryKey: [
      "tonight",
      "near-restaurant",
      located ? lat.toFixed(3) : null,
      located ? lng.toFixed(3) : null,
      day.dateKey,
    ],
    enabled: located,
    staleTime: FIVE_MINUTES,
    retry: shouldRetry,
    queryFn: async (): Promise<TonightEvent[]> => {
      const { data, error } = await supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", day.startISO)
        .lt("date", day.endISO)
        // Same three unpublish switches as useEvents and useTonightPairings.
        .neq("is_merged", true)
        .neq("is_hidden", true)
        .is("archived_at", null)
        .gte("latitude", lat - LAT_PAD_DEG)
        .lte("latitude", lat + LAT_PAD_DEG)
        .gte("longitude", lng - LNG_PAD_DEG)
        .lte("longitude", lng + LNG_PAD_DEG)
        .order("date", { ascending: true })
        .limit(EVENT_ROW_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as TonightEvent[];
    },
  });

  const error = query.error;
  useEffect(() => {
    if (error) {
      handleError(error, { component: "RestaurantDetails", action: "fetchTonightNearRestaurant" });
    }
  }, [error]);

  const rows = query.data ?? NO_ROWS;
  const events = useMemo(
    () => (located ? pickTonightNear(rows, { latitude: lat, longitude: lng }, new Date()) : []),
    [rows, located, lat, lng],
  );

  return {
    events,
    isLoading: located && query.isLoading,
    isSettled: !located || query.isSuccess || query.isError,
    isError: query.isError,
  };
}
