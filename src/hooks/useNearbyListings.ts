import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applyEventVisibility } from "@/lib/eventQuery";
import { upcomingOrRunningFilter } from "@/hooks/useEvents";
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import {
  isLocated,
  NEARBY_EVENT_SCAN_COLUMNS,
  NEARBY_RESTAURANT_SCAN_COLUMNS,
  selectNearbyEvents,
  selectNearbyRestaurants,
  type NearbyEventRow,
  type NearbyRestaurantRow,
} from "@/lib/nearbyLinks";
import { STALE_TIME } from "@/lib/queryConfig";
import { NOT_CLOSED_RESTAURANT_FILTER } from "@/lib/restaurantHours";

/**
 * Restaurants or upcoming events within NEARBY_MILES of a point (SEO-015,
 * SEO-044).
 *
 * WHY THIS EXISTS. NearbyContent's "Grab a Bite Nearby" took the three most
 * popular restaurants on the whole site. Its city filter ended in `|| true`,
 * so it filtered nothing, and a trivia night in Waukee recommended downtown
 * restaurants under the word "nearby". There is no proximity RPC for
 * restaurants, so this asks PostgREST for a bounding box around the point -
 * 0.03 degrees of latitude and 0.04 of longitude is a little over two miles
 * each way at Des Moines' latitude - and lets the selectors in
 * src/lib/nearbyLinks.ts keep the ones inside the radius, nearest first.
 *
 * No coordinates, no query and no list. An unlocated page gets nothing rather
 * than an arbitrary list labelled "nearby".
 *
 * The query drops merged and permanently closed restaurants (SEO-059's
 * NOT_CLOSED_RESTAURANT_FILTER) and invisible events (applyEventVisibility),
 * so the 60-row cap is spent on rows that can be shown. The selectors then
 * re-check those and add the rest of the rule: open today by lifecycle,
 * Google not reporting it closed, inside the metro, not yet started.
 * `preferCuisine` moves same-cuisine rows ahead of the rest, each group
 * still nearest first, for the "Also within 2 miles" rail on a restaurant page.
 *
 * ONE REQUEST, NO DESCRIPTIONS. The scan reads up to 60 rows to keep 3 or 4.
 * It selects the list card columns minus the description fields, which are
 * most of each row's weight and which no nearby card renders. An earlier
 * version scanned ids only and fetched the survivors' cards by id, which cut
 * the bytes the same way but added a request per rail: two rails on an event
 * page took its first view from 7 requests to 9 (events-request-budget).
 * Cached by kind and rounded point (no limit in the key, so NearbyContent and
 * useDinnerBeforeShow share one scan).
 */
const LAT_PAD = 0.03;
const LNG_PAD = 0.04;

type Kind = "restaurants" | "events";
type NearbyRow = NearbyRestaurantRow & NearbyEventRow;


const DESCRIPTION_COLUMNS = new Set(["description", "enhanced_description", "original_description"]);

/** Card columns without descriptions, plus whatever the selectors read. */
function nearbyColumns(listColumns: string, scanColumns: string): string {
  const cols = new Set<string>();
  for (const c of `${listColumns}, ${scanColumns}`.split(",")) {
    const name = c.trim();
    if (name && !DESCRIPTION_COLUMNS.has(name)) cols.add(name);
  }
  return [...cols].join(", ");
}

export const NEARBY_RESTAURANT_COLUMNS = nearbyColumns(RESTAURANT_LIST_COLUMNS, NEARBY_RESTAURANT_SCAN_COLUMNS);
export const NEARBY_EVENT_COLUMNS = nearbyColumns(EVENT_LIST_COLUMNS, NEARBY_EVENT_SCAN_COLUMNS);

async function scanNearby(kind: Kind, lat: number, lng: number): Promise<NearbyRow[]> {
  const { data, error } =
    kind === "restaurants"
      ? await supabase
          .from("restaurants")
          .select(NEARBY_RESTAURANT_COLUMNS)
          .neq("is_merged", true)
          .or(NOT_CLOSED_RESTAURANT_FILTER)
          .gte("latitude", lat - LAT_PAD)
          .lte("latitude", lat + LAT_PAD)
          .gte("longitude", lng - LNG_PAD)
          .lte("longitude", lng + LNG_PAD)
          .limit(60)
      : await applyEventVisibility(
          supabase
            .from("events")
            .select(NEARBY_EVENT_COLUMNS),
        )
          // Not started yet, or a run still going (WEB-FEAT-062). The floor is
          // now, not the start of the Central day, because the selector keeps
          // the same rule (isLinkableUpcomingEvent) and a row it would drop
          // should not spend the 60-row cap.
          .or(upcomingOrRunningFilter(new Date().toISOString()))
          .gte("latitude", lat - LAT_PAD)
          .lte("latitude", lat + LAT_PAD)
          .gte("longitude", lng - LNG_PAD)
          .lte("longitude", lng + LNG_PAD)
          // Soonest first, so the 60-row cap drops next year, not next week.
          .order("date", { ascending: true })
          .limit(60);
  if (error) throw error;
  return (data ?? []) as unknown as NearbyRow[];
}

export function useNearbyListings(
  kind: Kind,
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
  opts: { excludeId?: string; excludeIds?: readonly string[]; limit?: number; preferCuisine?: string | null } = {},
) {
  const origin = { latitude, longitude };
  const located = isLocated(origin);
  const lat = Number(latitude);
  const lng = Number(longitude);

  const scan = useQuery({
    queryKey: ["nearby", kind, located ? lat.toFixed(3) : null, located ? lng.toFixed(3) : null],
    enabled: located,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: () => scanNearby(kind, lat, lng),
    select: (rows): NearbyRow[] => {
      const limit = opts.limit ?? 3;
      if (kind === "restaurants") {
        return selectNearbyRestaurants(origin, rows, {
          excludeId: opts.excludeId,
          limit,
          preferCuisine: opts.preferCuisine,
        }) as NearbyRow[];
      }
      const excludeIds = [...(opts.excludeIds ?? []), ...(opts.excludeId ? [opts.excludeId] : [])];
      return selectNearbyEvents(origin, rows, { excludeIds, limit }) as NearbyRow[];
    },
  });

  return {
    data: located ? scan.data : undefined,
    isLoading: scan.isLoading,
    fetchStatus: scan.fetchStatus,
    error: scan.error,
    isError: scan.isError,
  };
}
