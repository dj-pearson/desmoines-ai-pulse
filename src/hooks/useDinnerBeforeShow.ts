/**
 * "Before the show" restaurants for event detail (events plan WP8 item 6).
 *
 * No request of its own. It reads the same useNearbyListings query that
 * NearbyContent's "Grab a Bite Nearby" already makes for this venue (the
 * query key has no limit in it, so both observers share one fetch) and keeps
 * the rows pickDinnerBeforeShow accepts: within PAIR_MAX_MILES and open at
 * start minus DINNER_LEAD_MINUTES.
 */
import { useMemo } from "react";
import { useNearbyListings } from "@/hooks/useNearbyListings";
import {
  pickDinnerBeforeShow,
  type TonightDinner,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

/** Enough rows that the 1.5 mi, open-at-dinner cut still has a choice. */
const SCAN_LIMIT = 60;

export function useDinnerBeforeShow(event: TonightEvent | null | undefined): {
  picks: TonightDinner[];
  isLoading: boolean;
} {
  const { data, isLoading, fetchStatus } = useNearbyListings(
    "restaurants",
    event?.latitude,
    event?.longitude,
    { limit: SCAN_LIMIT },
  );

  const picks = useMemo(
    () =>
      event && data
        ? pickDinnerBeforeShow(event, data as unknown as TonightRestaurant[], new Date())
        : [],
    [event, data],
  );

  return { picks, isLoading: isLoading && fetchStatus !== "idle" };
}
