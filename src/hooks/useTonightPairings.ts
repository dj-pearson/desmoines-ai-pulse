/**
 * Data for the Tonight rail (home plan WP10, home pass-2 WP2).
 *
 * Two PostgREST requests at most, whatever the number of cards, plus one
 * small optional one:
 *   1. tonight's visible events (the useEvents visibility predicate), bounded
 *      to the evening window (tonightQueryBounds: from max(16:00 CT, now - 15
 *      min) to 04:00 CT) plus multi-day events still running, 40 rows. The
 *      ongoing clause is ongoingStartFilter, the one /events' TonightStrip and
 *      the landings use, so "tonight" means one thing across the site;
 *   2. restaurants inside a small box around each candidate venue, sent as ONE
 *      `or=(and(...),and(...))` filter rather than one request per event;
 *   3. is_indoor for the candidate ids (useEventIndoorFlags), only when the
 *      weather verdict could change the order. It fails open to the
 *      title/venue regex, so a missing column costs a sort, not the rail.
 * The weather verdict comes from useWeather, which the page already caches.
 *
 * THE CLOCK TICKS. useNow(60s) feeds the window, the query key and both memos,
 * so a show that has started drops off within a minute while the tab is open,
 * and the key rolls over to the next evening at 04:00 CT.
 *
 * THE ORDER FREEZES. Once cards have rendered for a given fetch, their order
 * holds until the next refetch: a weather verdict or restaurant rows that land
 * late fill in text but never move a card under a thumb.
 *
 * The pairing rules live in src/lib/tonightPairings.ts, where they are tested
 * with a fixed clock.
 */
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWeather } from "@/hooks/useWeather";
import { useEventIndoorFlags } from "@/hooks/useEventIndoorFlags";
import { ongoingStartFilter } from "@/hooks/useEventLanding";
import { useNow } from "@/hooks/useNow";
import { TONIGHT_EVENT_COLUMNS, TONIGHT_RESTAURANT_COLUMNS } from "@/lib/listColumns";
import { handleError } from "@/lib/errorHandler";
import { shouldRetry } from "@/lib/queryConfig";
import {
  MAX_PAIRING_CANDIDATES,
  applyFrozenOrder,
  buildTonightPairings,
  eventIsIndoor,
  restaurantBoxes,
  selectTonightEvents,
  tonightQueryBounds,
  tonightWindow,
  type TonightEvent,
  type TonightPairing,
  type TonightQueryBounds,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;
export const TONIGHT_EVENT_ROW_LIMIT = 40;
const RESTAURANT_ROW_LIMIT = 250;

/** Statuses the restaurants query leaves out; isOpenForDinner refuses them too. */
const NOT_SERVING_FILTER = "(closed,permanently_closed,temporarily_closed,opening_soon)";

/**
 * Every Tonight events cache entry starts with this. Other Home sections read
 * the rail's rows from the cache under it (queryClient.getQueriesData) instead
 * of making a request of their own.
 */
export const TONIGHT_EVENTS_KEY = ["tonight", "events"] as const;

/** The exact key for `now`: the evening's date and the query's lower bound. */
export function tonightEventsQueryKey(now: Date): readonly [string, string, string, string] {
  const bounds = tonightQueryBounds(now);
  return [TONIGHT_EVENTS_KEY[0], TONIGHT_EVENTS_KEY[1], bounds.dateKey, bounds.fromISO];
}

/** Stable empties, so consumers' effects do not re-fire on every render. */
const NO_EVENTS: TonightEvent[] = [];
const NO_RESTAURANTS: TonightRestaurant[] = [];

async function fetchTonightEvents(bounds: TonightQueryBounds): Promise<TonightEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select(TONIGHT_EVENT_COLUMNS)
    // Starts tonight, or started earlier and runs past the lower bound.
    .or(ongoingStartFilter(bounds.fromISO))
    .lt("date", bounds.toISO)
    // Same three unpublish switches as useEvents (WEB-AUTO-005/006, WEB-BE-034).
    .neq("is_merged", true)
    .neq("is_hidden", true)
    .is("archived_at", null)
    .order("date", { ascending: true })
    .limit(TONIGHT_EVENT_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as TonightEvent[];
}

async function fetchRestaurantsNear(boxes: string[]): Promise<TonightRestaurant[]> {
  // One `or` holding (any box) AND (no status, or a serving one). A plain
  // .not('status','in',...) would also drop rows whose status is NULL.
  const logic = `and(or(${boxes.join(",")}),or(status.is.null,status.not.in.${NOT_SERVING_FILTER}))`;
  const { data, error } = await supabase
    .from("restaurants")
    .select(TONIGHT_RESTAURANT_COLUMNS)
    .neq("is_merged", true)
    .not("opening", "is", null)
    .or(logic)
    // Deterministic when the row cap truncates the result.
    .order("id", { ascending: true })
    .limit(RESTAURANT_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as TonightRestaurant[];
}

/**
 * Hold the first rendered order for one fetch (identified by `stamp`, the
 * query's dataUpdatedAt). Returns the frozen id list, or null before the
 * first commit with content.
 */
function useFrozenIds(ids: readonly string[], stamp: number): readonly string[] | null {
  const [frozen, setFrozen] = useState<{ stamp: number; ids: readonly string[] } | null>(null);
  const joined = ids.join(",");
  useEffect(() => {
    if (ids.length === 0) return;
    if (frozen && frozen.stamp === stamp) return;
    setFrozen({ stamp, ids: [...ids] });
    // `joined` stands in for `ids`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, stamp, frozen]);
  return frozen && frozen.stamp === stamp ? frozen.ids : null;
}

export interface WeatherPicks {
  /** True when indoor events went first (a bad evening), false for outdoor. */
  indoor: boolean;
  count: number;
}

export interface TonightEventsResult {
  /** Tonight's events from now on, weather rank first, then start time. */
  events: TonightEvent[];
  /** True when the row cap was hit, so a count from `events` is a floor ("3+"). */
  rowCapHit: boolean;
  /** yyyy-MM-dd of tonight's evening in Central (the heading's date). */
  dateKey: string;
  /**
   * The weather's effect on tonight's order: which group went first and how
   * many of tonight's events are in it. Null when there is no verdict.
   */
  weatherPicks: WeatherPicks | null;
  /** The minute clock the rows were filtered against (epoch ms). */
  nowMs: number;
  /** Identifies the current fetch; the card order is frozen per value. */
  dataUpdatedAt: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Tonight's events from now on, ordered for the weather.
 *
 * Exported on its own so another home section (the neighbourhood strip) can
 * count tonight's events per area from the same cache entry instead of a
 * second request.
 */
export function useTonightEvents(): TonightEventsResult {
  const now = useNow(ONE_MINUTE);
  const nowMs = now.getTime();
  const bounds = tonightQueryBounds(now);
  const { weather, hasVerdict } = useWeather();

  const query = useQuery({
    queryKey: tonightEventsQueryKey(now),
    queryFn: () => fetchTonightEvents(bounds),
    // The key moves every half hour; keep the cards on screen while the next
    // window loads instead of flashing the skeleton.
    placeholderData: keepPreviousData,
    staleTime: FIVE_MINUTES,
    retry: shouldRetry,
  });

  const rows = query.data ?? NO_EVENTS;
  const ids = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows]);
  // Only asks when the verdict could change the order; empty map on any error.
  const indoorFlags = useEventIndoorFlags(ids, hasVerdict);

  const isIndoor = useMemo(
    () => (event: TonightEvent) => {
      const flag = indoorFlags[event.id];
      return typeof flag === "boolean" ? flag : eventIsIndoor(event);
    },
    [indoorFlags],
  );

  const ordered = useMemo(
    () => selectTonightEvents(rows, new Date(nowMs), weather, { mode: "evening", isIndoor }),
    [rows, weather, isIndoor, nowMs],
  );

  // How many of tonight's events the verdict moved up, for the rail's header
  // line. Null without a verdict, so the line never claims a reorder.
  const weatherPicks = useMemo(() => {
    if (!hasVerdict || weather.outdoorFriendly === null) return null;
    const preferIndoor = weather.outdoorFriendly === false;
    return {
      indoor: preferIndoor,
      count: ordered.filter((event) => isIndoor(event) === preferIndoor).length,
    };
  }, [hasVerdict, weather.outdoorFriendly, ordered, isIndoor]);

  const frozen = useFrozenIds(
    useMemo(() => ordered.map((event) => event.id), [ordered]),
    query.dataUpdatedAt,
  );
  const events = useMemo(
    () => applyFrozenOrder(ordered, (event) => event.id, frozen),
    [ordered, frozen],
  );

  const refetch = query.refetch;
  return {
    events,
    rowCapHit: rows.length >= TONIGHT_EVENT_ROW_LIMIT,
    dateKey: tonightWindow(now).dateKey,
    weatherPicks,
    nowMs,
    dataUpdatedAt: query.dataUpdatedAt,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void refetch();
    },
  };
}

export interface TonightPairingsOptions {
  /**
   * Home's rule: no dinner before 16:00 CT or in the past (pass-2 WP2 item 1).
   * Off by default so RestaurantsTonightStrip keeps its behaviour.
   */
  eveningOnly?: boolean;
}

export interface TonightPairingsResult {
  pairings: TonightPairing[];
  /** Tonight's events from now on, ordered for the weather (for per-area counts). */
  events: TonightEvent[];
  /** See TonightEventsResult.rowCapHit. */
  rowCapHit: boolean;
  /** yyyy-MM-dd of tonight's evening in Central. */
  dateKey: string;
  /** See TonightEventsResult.weatherPicks. */
  weatherPicks: WeatherPicks | null;
  /** The events request alone decides this; restaurants fill in afterwards. */
  isLoading: boolean;
  /** True while the restaurants for the current cards are still loading. */
  restaurantsLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useTonightPairings(options: TonightPairingsOptions = {}): TonightPairingsResult {
  const eveningOnly = options.eveningOnly === true;
  const tonight = useTonightEvents();
  const nowMs = tonight.nowMs;

  const candidates = useMemo(
    () => tonight.events.slice(0, MAX_PAIRING_CANDIDATES),
    [tonight.events],
  );
  const boxes = useMemo(() => restaurantBoxes(candidates), [candidates]);

  const restaurantsQuery = useQuery({
    queryKey: ["tonight", "restaurants", boxes],
    queryFn: () => fetchRestaurantsNear(boxes),
    enabled: boxes.length > 0,
    // A show dropping off changes the boxes; keep the dinners already shown
    // while the new set loads.
    placeholderData: keepPreviousData,
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
  const built = useMemo(
    () =>
      buildTonightPairings(candidates, restaurants, new Date(nowMs), undefined, {
        mode: "evening",
        eveningOnly,
      }),
    [candidates, restaurants, nowMs, eveningOnly],
  );

  // The dinner tie-break can swap two same-time cards when restaurants land;
  // hold the order the visitor first saw until the events refetch.
  const frozen = useFrozenIds(
    useMemo(() => built.map((p) => p.event.id), [built]),
    tonight.dataUpdatedAt,
  );
  const pairings = useMemo(
    () => applyFrozenOrder(built, (p) => p.event.id, frozen),
    [built, frozen],
  );

  const refetchTonight = tonight.refetch;
  const refetchRestaurants = restaurantsQuery.refetch;

  return {
    pairings,
    events: tonight.events,
    rowCapHit: tonight.rowCapHit,
    dateKey: tonight.dateKey,
    weatherPicks: tonight.weatherPicks,
    // A restaurant miss is not a rail failure: events render alone, and the
    // dinner line fills in when the restaurants arrive (item 11).
    isLoading: tonight.isLoading,
    restaurantsLoading: boxes.length > 0 && restaurantsQuery.isLoading,
    isError: tonight.isError,
    refetch: () => {
      refetchTonight();
      if (boxes.length > 0) void refetchRestaurants();
    },
  };
}
