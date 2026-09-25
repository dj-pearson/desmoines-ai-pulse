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

/** Minutes of the Central day for an instant, 0-1439. */
function centralMinuteOfDay(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

/** "10 PM", "10:30 PM", "midnight", "noon" (formatClockLabel's output) to minutes, or null. */
export function clockLabelMinutes(label: string | null | undefined): number | null {
  if (!label) return null;
  const t = label.trim().toLowerCase();
  if (t === "midnight") return 24 * 60;
  if (t === "noon") return 12 * 60;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]) % 12;
  return (m[3] === "pm" ? h + 12 : h) * 60 + Number(m[2] ?? 0);
}

/** Dinner takes about this long; an event starting later than close minus this is "after dinner". */
export const AFTER_DINNER_MINUTES = 90;

/**
 * The rail's heading (eat-drink pass 2, WP3.7). "After dinner, nearby
 * tonight" only when the restaurant is open with a known closing time and
 * every timed event starts at or after that time minus AFTER_DINNER_MINUTES,
 * in Central time. Otherwise the plain "Tonight nearby": a 6 PM show near a
 * place that closes at 10 isn't "after dinner". A close past midnight
 * ("2 AM") counts as the next morning.
 */
export function tonightHeading(
  events: readonly Pick<TonightNearbyEvent, "startsAt">[],
  restaurantClosesAt: string | null | undefined,
  now: Date,
): string {
  const close = clockLabelMinutes(restaurantClosesAt);
  const timed = events.filter((e): e is { startsAt: Date } => e.startsAt instanceof Date);
  if (close === null || timed.length === 0) return "Tonight nearby";
  const nowMin = centralMinuteOfDay(now);
  const closeMin = close <= nowMin ? close + 24 * 60 : close;
  const afterDinner = timed.every((e) => {
    let start = centralMinuteOfDay(e.startsAt);
    if (start < nowMin) start += 24 * 60;
    return start >= closeMin - AFTER_DINNER_MINUTES;
  });
  return afterDinner ? "After dinner, nearby tonight" : "Tonight nearby";
}

/**
 * `now` is the page's minute clock (useMinuteClock), so an event that has
 * started drops off the list while the page is open instead of staying until
 * a reload (WP3.7). Omitted, it reads the time once per render.
 */
export function useTonightNearRestaurant(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
  now?: Date,
): TonightNearRestaurantResult {
  const lat = toCoord(latitude);
  const lng = toCoord(longitude);
  const located = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const clockMs = (now ?? new Date()).getTime();
  const day = centralDayWindow(new Date(clockMs));

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
  // Keyed on the clock only when the caller passes one; without it the list is
  // computed per data change, as before.
  const pickAt = now ? clockMs : null;
  const events = useMemo(
    () =>
      located
        ? pickTonightNear(rows, { latitude: lat, longitude: lng }, pickAt === null ? new Date() : new Date(pickAt))
        : [],
    [rows, located, lat, lng, pickAt],
  );

  return {
    events,
    isLoading: located && query.isLoading,
    isSettled: !located || query.isSuccess || query.isError,
    isError: query.isError,
  };
}
