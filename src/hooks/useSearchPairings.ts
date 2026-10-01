/**
 * Dinner and a bed near each event result (search plan WP2 item 9, bet 2).
 *
 * One restaurants request for the whole result list, however many events it
 * has: a small box around each venue, sent as ONE `or=(and(...),...)` filter,
 * the same shape useTonightPairings uses. Hotels come from useHotelPins, the
 * shared, long-lived list of every active hotel's coordinates.
 *
 * NOTHING HERE IS ESTIMATED. A dinner is picked by pickDinner: within
 * PAIR_MAX_MILES of the venue and open, by its stored hours, 90 minutes before
 * the start. An event with no announced time or no coordinates gets no dinner,
 * because a slot computed from a placeholder hour is not advice. The hotel
 * distance is a straight line between two stored coordinate pairs, and the card
 * says so.
 */
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHotelPins, type HotelPin } from "@/hooks/useHotels";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import { haversineDistance } from "@/lib/geo";
import { shouldRetry } from "@/lib/queryConfig";
import {
  eventStartInstant,
  pickDinner,
  restaurantBoxes,
  type TonightDinner,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

/** Only the events a visitor can see get a lookup. */
export const MAX_PAIRED_EVENTS = 12;

/** A hotel further than this from the venue is not "nearby". */
export const STAY_MAX_MILES = 3;

const RESTAURANT_ROW_LIMIT = 250;
const FIVE_MINUTES = 5 * 60_000;

/** Every column pickDinner reads, and nothing else. */
const PAIRING_COLUMNS =
  "id, name, slug, cuisine, price_range, latitude, longitude, opening, opening_date, status";

export interface NearbyStay {
  hotel: HotelPin;
  distanceMiles: number;
}

export interface EventPairing {
  dinner: TonightDinner | null;
  stay: NearbyStay | null;
}

function hasCoords(row: { latitude?: number | null; longitude?: number | null }): boolean {
  return (
    typeof row.latitude === "number" &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude) &&
    !(row.latitude === 0 && row.longitude === 0)
  );
}

/** The nearest active hotel within STAY_MAX_MILES of the venue, or null. */
export function nearestStay(event: TonightEvent, hotels: readonly HotelPin[]): NearbyStay | null {
  if (!hasCoords(event)) return null;
  const venue = { latitude: event.latitude as number, longitude: event.longitude as number };
  let best: NearbyStay | null = null;
  for (const hotel of hotels) {
    if (!hotel?.slug || !hasCoords(hotel)) continue;
    const distanceMiles = haversineDistance(venue, {
      latitude: hotel.latitude as number,
      longitude: hotel.longitude as number,
    });
    if (distanceMiles > STAY_MAX_MILES) continue;
    if (!best || distanceMiles < best.distanceMiles) best = { hotel, distanceMiles };
  }
  return best;
}

async function fetchRestaurantsNear(boxes: string[]): Promise<TonightRestaurant[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(PAIRING_COLUMNS)
    .neq("is_merged", true)
    .or(boxes.join(","))
    .limit(RESTAURANT_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as TonightRestaurant[];
}

const NO_RESTAURANTS: TonightRestaurant[] = [];
const NO_HOTELS: HotelPin[] = [];
const NO_PAIRINGS: ReadonlyMap<string, EventPairing> = new Map();

/**
 * Pairings keyed by event id. An event missing from the map, or with both
 * fields null, shows neither line.
 */
export function useSearchPairings(events: readonly TonightEvent[]): ReadonlyMap<string, EventPairing> {
  const candidates = useMemo(
    () => events.filter((e) => e?.id && hasCoords(e)).slice(0, MAX_PAIRED_EVENTS),
    [events],
  );
  // Only events with a real start can pair with dinner, so only they widen the box.
  const boxes = useMemo(
    () => restaurantBoxes(candidates.filter((e) => eventStartInstant(e) !== null)),
    [candidates],
  );

  const restaurantsQuery = useQuery({
    queryKey: ["search", "pairings", "restaurants", boxes],
    queryFn: () => fetchRestaurantsNear(boxes),
    enabled: boxes.length > 0,
    staleTime: FIVE_MINUTES,
    retry: shouldRetry,
  });
  const hotelsQuery = useHotelPins();

  const restaurantsError = restaurantsQuery.error;
  useEffect(() => {
    // A missing pairing is not a page failure: the event card still renders.
    if (restaurantsError) {
      handleError(
        restaurantsError,
        { component: "SearchResults", action: "fetchPairingRestaurants" },
        ErrorSeverity.WARNING,
      );
    }
  }, [restaurantsError]);

  const restaurants = restaurantsQuery.data ?? NO_RESTAURANTS;
  const hotels = hotelsQuery.data ?? NO_HOTELS;

  return useMemo(() => {
    if (candidates.length === 0) return NO_PAIRINGS;
    const now = new Date();
    const used = new Set<string>();
    const out = new Map<string, EventPairing>();
    for (const event of candidates) {
      const startsAt = eventStartInstant(event);
      // A show that has already started is past the point of planning dinner.
      const dinner =
        startsAt && startsAt.getTime() > now.getTime()
          ? pickDinner(event, startsAt, restaurants, now, used)
          : null;
      if (dinner) used.add(dinner.restaurant.id);
      const stay = nearestStay(event, hotels);
      if (dinner || stay) out.set(event.id, { dinner, stay });
    }
    return out;
  }, [candidates, restaurants, hotels]);
}
