/**
 * Data for the "Tonight in Des Moines" rail (home plan WP10).
 *
 * Two PostgREST requests at most, whatever the number of cards:
 *   1. tonight's visible events (the useEvents visibility predicate, bounded
 *      to today's Central day, 40 rows);
 *   2. restaurants inside a small box around each candidate venue, sent as ONE
 *      `or=(and(...),and(...))` filter rather than one request per event, so
 *      the rail stays well inside the request budget.
 * The weather verdict comes from useWeather, which the page already caches.
 *
 * The pairing rules live in src/lib/tonightPairings.ts, where they are tested
 * with a fixed clock.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWeather } from "@/hooks/useWeather";
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { handleError } from "@/lib/errorHandler";
import { shouldRetry } from "@/lib/queryConfig";
import {
  MAX_PAIRING_CANDIDATES,
  buildTonightPairings,
  centralDayWindow,
  restaurantBoxes,
  selectTonightEvents,
  type TonightEvent,
  type TonightPairing,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

const FIVE_MINUTES = 5 * 60 * 1000;
const EVENT_ROW_LIMIT = 40;
const RESTAURANT_ROW_LIMIT = 250;

/** Stable empties, so consumers' effects do not re-fire on every render. */
const NO_EVENTS: TonightEvent[] = [];
const NO_RESTAURANTS: TonightRestaurant[] = [];

async function fetchTonightEvents(startISO: string, endISO: string): Promise<TonightEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_LIST_COLUMNS)
    .gte("date", startISO)
    .lt("date", endISO)
    // Same three unpublish switches as useEvents (WEB-AUTO-005/006, WEB-BE-034).
    .neq("is_merged", true)
    .neq("is_hidden", true)
    .is("archived_at", null)
    .order("date", { ascending: true })
    .limit(EVENT_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as TonightEvent[];
}

async function fetchRestaurantsNear(boxes: string[]): Promise<TonightRestaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_LIST_COLUMNS)
    .neq("is_merged", true)
    .or(boxes.join(","))
    .limit(RESTAURANT_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as TonightRestaurant[];
}

/**
 * Tonight's events from now on, ordered for the weather.
 *
 * Exported on its own so another home section (the neighbourhood strip, WP5)
 * can count tonight's events per area from the same cache entry instead of a
 * second request.
 */
export function useTonightEvents() {
  const now = new Date();
  const day = centralDayWindow(now);
  const { weather } = useWeather();

  const query = useQuery({
    queryKey: ["tonight", "events", day.dateKey],
    queryFn: () => fetchTonightEvents(day.startISO, day.endISO),
    staleTime: FIVE_MINUTES,
    retry: shouldRetry,
  });

  const rows = query.data ?? NO_EVENTS;
  // Re-derived when the rows or the verdict change. `now` is read fresh then,
  // so a started show drops off at the next refetch rather than on a timer.
  const events = useMemo(
    () => selectTonightEvents(rows, new Date(), weather),
    [rows, weather],
  );

  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface TonightPairingsResult {
  pairings: TonightPairing[];
  /** Tonight's events from now on, ordered for the weather (for per-area counts). */
  events: TonightEvent[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTonightPairings(): TonightPairingsResult {
  const tonight = useTonightEvents();

  const candidates = useMemo(
    () => tonight.events.slice(0, MAX_PAIRING_CANDIDATES),
    [tonight.events],
  );
  const boxes = useMemo(() => restaurantBoxes(candidates), [candidates]);

  const restaurantsQuery = useQuery({
    queryKey: ["tonight", "restaurants", boxes],
    queryFn: () => fetchRestaurantsNear(boxes),
    enabled: boxes.length > 0,
    staleTime: FIVE_MINUTES,
    retry: shouldRetry,
  });

  const eventsError = tonight.error;
  const restaurantsError = restaurantsQuery.error;
  useEffect(() => {
    if (eventsError) {
      handleError(eventsError, { component: "TonightRail", action: "fetchTonightEvents" });
    }
  }, [eventsError]);
  useEffect(() => {
    if (restaurantsError) {
      handleError(restaurantsError, { component: "TonightRail", action: "fetchRestaurantsNear" });
    }
  }, [restaurantsError]);

  const restaurants = restaurantsQuery.data ?? NO_RESTAURANTS;
  const pairings = useMemo(
    () => buildTonightPairings(candidates, restaurants, new Date()),
    [candidates, restaurants],
  );

  const refetchTonight = tonight.refetch;
  const refetchRestaurants = restaurantsQuery.refetch;

  return {
    pairings,
    events: tonight.events,
    // A restaurant miss is not a rail failure: events still render alone.
    // Only the events request decides between loading, error and content.
    isLoading: tonight.isLoading || (boxes.length > 0 && restaurantsQuery.isLoading),
    isError: tonight.isError,
    refetch: () => {
      void refetchTonight();
      if (boxes.length > 0) void refetchRestaurants();
    },
  };
}
