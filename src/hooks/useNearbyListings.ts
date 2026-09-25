import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS, RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME } from "@/lib/queryConfig";
import { nearby, NEARBY_MILES } from "@/lib/venuePages";
import { isVisitableStatus } from "@/lib/restaurantHours";

/**
 * Restaurants or upcoming events within NEARBY_MILES of a point (SEO-015).
 *
 * WHY THIS EXISTS. NearbyContent's "Grab a Bite Nearby" took the three most
 * popular restaurants on the whole site. Its city filter ended in `|| true`,
 * so it filtered nothing, and a trivia night in Waukee recommended downtown
 * restaurants under the word "nearby". There is no proximity RPC for
 * restaurants, so this asks PostgREST for a bounding box around the point -
 * 0.03 degrees of latitude and 0.04 of longitude is a little over two miles
 * each way at Des Moines' latitude - and lets `nearby` keep the ones inside
 * the radius, nearest first.
 *
 * No coordinates, no query and no list. An unlocated page gets nothing rather
 * than an arbitrary list labelled "nearby".
 *
 * Restaurants that are closed, not open yet or merged are left out: every
 * caller labels this list as places to go (eat-drink pass 2, WP3.8).
 * `preferCuisine` moves same-cuisine rows ahead of the rest, each group
 * still nearest first, for the "Also within 2 miles" rail on a restaurant page.
 */
const LAT_PAD = 0.03;
const LNG_PAD = 0.04;

type Kind = "restaurants" | "events";

export function useNearbyListings(
  kind: Kind,
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
  opts: { excludeId?: string; limit?: number; preferCuisine?: string | null } = {},
) {
  const lat = latitude == null ? NaN : Number(latitude);
  const lng = longitude == null ? NaN : Number(longitude);
  const located = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  return useQuery({
    queryKey: ["nearby", kind, located ? lat.toFixed(3) : null, located ? lng.toFixed(3) : null],
    enabled: located,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      const { data, error } =
        kind === "restaurants"
          ? await supabase
              .from("restaurants")
              .select(RESTAURANT_LIST_COLUMNS)
              .neq("is_merged", true)
              .gte("latitude", lat - LAT_PAD)
              .lte("latitude", lat + LAT_PAD)
              .gte("longitude", lng - LNG_PAD)
              .lte("longitude", lng + LNG_PAD)
              .limit(60)
          : await supabase
              .from("events")
              .select(EVENT_LIST_COLUMNS)
              .gte("date", new Date().toISOString())
              // The same three unpublish switches as useEvents. Without them a
              // merged duplicate, a hidden row or an archived event rendered
              // as "happening nearby" on every restaurant and attraction page.
              .neq("is_merged", true)
              .neq("is_hidden", true)
              .is("archived_at", null)
              .gte("latitude", lat - LAT_PAD)
              .lte("latitude", lat + LAT_PAD)
              .gte("longitude", lng - LNG_PAD)
              .lte("longitude", lng + LNG_PAD)
              // Soonest first, so the 60-row cap drops next year, not next week.
              .order("date", { ascending: true })
              .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; latitude: number | null; longitude: number | null }>;
    },
    select: (rows) => {
      const candidates = rows.filter(
        (r) =>
          r.id !== opts.excludeId &&
          (kind !== "restaurants" || isVisitableStatus((r as { status?: string | null }).status)),
      );
      const limit = opts.limit ?? 3;
      const cuisine = opts.preferCuisine?.trim().toLowerCase();
      if (!cuisine) {
        return nearby({ latitude: lat, longitude: lng }, candidates, { maxMiles: NEARBY_MILES, limit }).map(
          (x) => x.item,
        );
      }
      const all = nearby({ latitude: lat, longitude: lng }, candidates, {
        maxMiles: NEARBY_MILES,
        limit: candidates.length,
      }).map((x) => x.item);
      const same = (r: (typeof all)[number]) =>
        ((r as { cuisine?: string | null }).cuisine ?? "").trim().toLowerCase() === cuisine;
      return [...all.filter(same), ...all.filter((r) => !same(r))].slice(0, limit);
    },
  });
}
