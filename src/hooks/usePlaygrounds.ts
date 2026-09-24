import { useCallback } from "react";
import { DES_MOINES_METRO_BOUNDS, haversineDistance } from "@/lib/geo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { countOption, type CountMode } from '@/lib/listCount';
import { Database } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIME, GC_TIME } from "@/lib/queryConfig";
import { PLAYGROUND_LIST_COLUMNS } from "@/lib/listColumns";
import { handleError } from "@/lib/errorHandler";

type Playground = Database["public"]["Tables"]["playgrounds"]["Row"];

/**
 * The PostgREST or() that keeps a playground query inside the Des Moines metro
 * (WEB-SEO-037 AC3). Shared by the list, the facets and the detail page's side
 * queries so the Location dropdown can never offer a suburb the list refuses:
 * that mismatch is how "Portland" and friends reached the filter.
 *
 * Expressed as "in the box OR has no coordinates" because a row we cannot
 * place should not be dropped for missing data (see isInMetro). PostgREST has
 * no "coalesce to true" and a .gte on a null column excludes the row silently.
 */
export const PLAYGROUND_METRO_FILTER =
  `and(latitude.gte.${DES_MOINES_METRO_BOUNDS.minLatitude},latitude.lte.${DES_MOINES_METRO_BOUNDS.maxLatitude},` +
  `longitude.gte.${DES_MOINES_METRO_BOUNDS.minLongitude},longitude.lte.${DES_MOINES_METRO_BOUNDS.maxLongitude}),` +
  `latitude.is.null,longitude.is.null`;

/**
 * What a related/nearby card on the detail page renders, and nothing else
 * (explore plan WP4 item 2). No `slug`: the column is not live yet (plan D2)
 * and naming a missing column fails the whole query with 42703.
 */
export const PLAYGROUND_CARD_COLUMNS =
  "id, name, image_url, age_range, rating, location, latitude, longitude, has_shade, has_restrooms";

export type PlaygroundCard = Pick<
  Playground,
  | "id"
  | "name"
  | "image_url"
  | "age_range"
  | "rating"
  | "location"
  | "latitude"
  | "longitude"
  | "has_shade"
  | "has_restrooms"
> & { distanceMiles: number | null };

/**
 * The suburb a `location` string names, or null when it names none we can
 * read.
 *
 * The old rule took the second-to-last comma segment, which is right for
 * "123 Main St, Ankeny" and wrong for the Places shape
 * "123 Main St, Ankeny, IA 50023, USA", where it yields "IA 50023". This walks
 * back from the end past country, state and ZIP segments and takes the first
 * segment that looks like a place name. A segment that starts with a digit is
 * a street address, never a suburb.
 *
 * Whatever it returns is a substring of `location`, so the ilike filter the
 * dropdown drives always matches at least the row it came from.
 */
export function suburbFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const isTail = (seg: string) =>
    /^(usa|us|united states)$/i.test(seg) ||
    /^(ia|iowa)(\s+\d{5}(-\d{4})?)?$/i.test(seg) ||
    /^\d{5}(-\d{4})?$/.test(seg);
  let end = parts.length - 1;
  while (end >= 0 && isTail(parts[end])) end--;
  if (end < 0) return null;
  // A lone segment with no state after it ("Gray's Lake Park") could be a
  // place or a suburb and nothing in the string says which. "Ankeny, IA" is
  // fine: the state segment says what precedes it is a city.
  if (end === 0 && parts.length === 1) return null;
  const candidate = parts[end]
    .replace(/\s+(ia|iowa)(\s+\d{5}(-\d{4})?)?$/i, "")
    .replace(/\s+\d{5}(-\d{4})?$/, "")
    .trim();
  if (!candidate || /^\d/.test(candidate)) return null;
  return candidate;
}

/**
 * Escape a value for a PostgREST array literal: `{"Splash Pad","Swings"}`.
 * supabase-js's `.contains(col, string[])` joins with commas and quotes
 * nothing, so an amenity with a comma or quote would split or break the
 * filter. Passing the literal as a string skips that.
 */
export function pgArrayLiteral(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

/** Escape `%`, `_` and `\` so a URL value is matched literally by ilike. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Distance-sorted nearby list, computed client-side from the bounding-box
 * query below. Rows without coordinates go last with a null distance.
 */
export function sortByDistanceFrom<T extends { latitude: number | null; longitude: number | null }>(
  rows: T[],
  from: { latitude: number; longitude: number },
): (T & { distanceMiles: number | null })[] {
  return rows
    .map((r) => ({
      ...r,
      distanceMiles:
        r.latitude != null && r.longitude != null
          ? haversineDistance(from, { latitude: r.latitude, longitude: r.longitude })
          : null,
    }))
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}

/** "0.4 mi away", "12 mi away". */
export function formatMilesAway(miles: number): string {
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}
type PlaygroundInsert = Database["public"]["Tables"]["playgrounds"]["Insert"];
type PlaygroundUpdate = Database["public"]["Tables"]["playgrounds"]["Update"];

interface PlaygroundFilters {
  search?: string;
  age_range?: string;
  /** Admin-only: filter by source label */
  source?: "google_places" | "manual";
  /** Admin-only: only manually-curated rows */
  manuallyCuratedOnly?: boolean;
  /** Substring match on `location`, matching how the suburb chips are derived. */
  location?: string;
  /** Only rows with has_shade = true. */
  shade?: boolean;
  /** Only rows with has_restrooms = true. */
  restrooms?: boolean;
  /** Only rows that carry accessibility notes. */
  accessible?: boolean;
  /** Rows whose amenities array contains every one of these. */
  amenities?: string[];
  featuredOnly?: boolean;
  sortBy?: "newest" | "updated" | "alphabetical" | "name";
  limit?: number;
  offset?: number;
  /** How hard to work for `totalCount`; see src/lib/listCount.ts (WEB-PERF-033). */
  countMode?: CountMode;
  /**
   * "list" selects PLAYGROUND_LIST_COLUMNS instead of `*` (home plan WP3 item
   * 5). Opt-in rather than the default because PlaygroundManager reads
   * manually_curated, which the list projection leaves out on purpose.
   * Part of the query key via `filters`, so the two shapes never share a
   * cache entry.
   */
  projection?: "all" | "list";
}


export function usePlaygrounds(filters: PlaygroundFilters = {}) {
  const queryClient = useQueryClient();

  // WEB-PERF-028. See useAttractions for the full note. The explicit generic is
  // required: the old PlaygroundsState declared Playground[], and letting the
  // queryFn's return type be inferred narrows it for every caller.
  const { data, isLoading, error } = useQuery<{
    playgrounds: Playground[];
    totalCount: number;
  }>({
    queryKey: queryKeys.playgrounds.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const columns = filters.projection === "list" ? PLAYGROUND_LIST_COLUMNS : "*";
      let query = supabase.from("playgrounds").select(columns, countOption(filters.countMode));

      switch (filters.sortBy ?? "newest") {
        case "updated":
          query = query.order("updated_at", { ascending: false });
          break;
        case "alphabetical":
        case "name":
          query = query.order("name", { ascending: true });
          break;
        case "newest":
        default:
          query = query.order("created_at", { ascending: false });
          break;
      }

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,location.ilike.%${filters.search}%,age_range.ilike.%${filters.search}%`
        );
      }

      if (filters.age_range) {
        query = query.eq("age_range", filters.age_range);
      }

      // WEB-PERF-028 AC4. Substring, not equality: the suburb chips on
      // /playgrounds are derived by splitting the `location` string, so "Ankeny"
      // has to match "1234 Main St, Ankeny, IA".
      if (filters.location) {
        query = query.ilike("location", `%${escapeLike(filters.location)}%`);
      }

      if (filters.shade) {
        query = query.eq("has_shade", true);
      }

      if (filters.restrooms) {
        query = query.eq("has_restrooms", true);
      }

      // accessibility_notes is free text, so "accessible" can only mean "we
      // have something to tell you about access" - the page labels it that way.
      if (filters.accessible) {
        query = query.not("accessibility_notes", "is", null).neq("accessibility_notes", "");
      }

      if (filters.amenities && filters.amenities.length > 0) {
        query = query.contains("amenities", pgArrayLiteral(filters.amenities));
      }

      // WEB-SEO-037 AC3. 21 of the 69 rows are in Oregon, Washington, Colorado
      // and Missouri - a Google Places import that went wide. Server-side, and
      // shared with the facets query so the filters describe the same set.
      query = query.or(PLAYGROUND_METRO_FILTER);

      if (filters.featuredOnly) {
        query = query.eq("is_featured", true);
      }

      if (filters.source) {
        query = query.eq("source", filters.source);
      }

      if (filters.manuallyCuratedOnly) {
        query = query.eq("manually_curated", true);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 10) - 1
        );
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        playgrounds: (data || []) as unknown as Playground[],
        totalCount: count || 0,
      };
    },
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  // Mutations below called fetchPlaygrounds() to refresh. Invalidating the list
  // key does that and refreshes any other mounted view of it too.
  const fetchPlaygrounds = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.playgrounds.lists() });
  }, [queryClient]);

  const createPlayground = async (playground: PlaygroundInsert) => {
    try {
      const { data, error } = await supabase
        .from("playgrounds")
        .insert(playground)
        .select()
        .single();

      if (error) throw error;

      fetchPlaygrounds();
      return data;
    } catch (error) {
      handleError(error, { component: "usePlaygrounds", action: "create" });
      throw error;
    }
  };

  const updatePlayground = async (id: string, updates: PlaygroundUpdate) => {
    try {
      const { data, error } = await supabase
        .from("playgrounds")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      fetchPlaygrounds();
      return data;
    } catch (error) {
      handleError(error, { component: "usePlaygrounds", action: "update" });
      throw error;
    }
  };

  const deletePlayground = async (id: string) => {
    try {
      const { error } = await supabase.from("playgrounds").delete().eq("id", id);

      if (error) throw error;

      fetchPlaygrounds();
    } catch (error) {
      handleError(error, { component: "usePlaygrounds", action: "delete" });
      throw error;
    }
  };


  // The exact surface callers already read, rebuilt from the query.
  return {
    playgrounds: data?.playgrounds ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch playgrounds") : null,
    refetch: fetchPlaygrounds,
    createPlayground,
    updatePlayground,
    deletePlayground,
  };
}

/**
 * The facet values the /playgrounds filter controls offer, over the WHOLE
 * catalogue (WEB-PERF-028 AC4).
 *
 * The page derived age ranges, suburbs and amenities from the full unfiltered
 * list it happened to be holding. That is what kept its filters client-side:
 * filter the list and the dropdowns lose their other options. Three columns
 * answer all of it, against 40-odd on the rows themselves.
 *
 * Metro-bounded with the same or() as the list (explore plan WP4 item 1), so
 * no out-of-state city is offered and every suburb offered matches at least
 * one row the list will return. Suburbs come from suburbFromLocation, whose
 * output is a substring of the location it came from.
 */
export function usePlaygroundFacets() {
  const { data, isLoading } = useQuery<{
    ageRanges: string[];
    locations: string[];
    amenities: string[];
    ageRangeCounts: Record<string, number>;
    amenityCounts: Record<string, number>;
    locationCounts: Record<string, number>;
  }>({
    queryKey: [...queryKeys.playgrounds.all, "facets", "metro"] as const,
    staleTime: STALE_TIME.REFERENCE,
    gcTime: GC_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playgrounds")
        .select("age_range,location,amenities")
        .or(PLAYGROUND_METRO_FILTER);

      if (error) {
        handleError(error, { component: "usePlaygroundFacets", action: "fetch" });
        throw error;
      }

      const rows = (data || []) as {
        age_range: string | null;
        location: string | null;
        amenities: string[] | null;
      }[];

      const ageRangeCounts: Record<string, number> = {};
      const amenityCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};

      for (const row of rows) {
        if (row.age_range) {
          ageRangeCounts[row.age_range] = (ageRangeCounts[row.age_range] || 0) + 1;
        }
        const suburb = suburbFromLocation(row.location);
        if (suburb) {
          locationCounts[suburb] = (locationCounts[suburb] || 0) + 1;
        }
        for (const a of row.amenities || []) {
          amenityCounts[a] = (amenityCounts[a] || 0) + 1;
        }
      }

      // A suburb's count is rows whose location CONTAINS it, since that is
      // what the filter will return: "Des Moines" also matches every
      // "West Des Moines" row, and the number beside it should say so.
      const suburbs = Object.keys(locationCounts);
      for (const suburb of suburbs) {
        const needle = suburb.toLowerCase();
        locationCounts[suburb] = rows.filter((r) =>
          (r.location || "").toLowerCase().includes(needle),
        ).length;
      }

      return {
        ageRanges: Object.keys(ageRangeCounts).sort(),
        locations: suburbs.sort(),
        amenities: Object.keys(amenityCounts).sort(),
        ageRangeCounts,
        amenityCounts,
        locationCounts,
      };
    },
  });

  return {
    ageRanges: data?.ageRanges ?? [],
    locations: data?.locations ?? [],
    amenities: data?.amenities ?? [],
    ageRangeCounts: data?.ageRangeCounts ?? {},
    amenityCounts: data?.amenityCounts ?? {},
    locationCounts: data?.locationCounts ?? {},
    isLoading,
  };
}

/** Roughly 12 miles each way at Des Moines' latitude. */
const NEARBY_BOX_DEGREES = { lat: 0.18, lng: 0.24 } as const;
const NEARBY_CANDIDATES = 40;
const SIDE_LIST_SIZE = 4;

interface SideQueryTarget {
  id: string;
  age_range: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Playgrounds near this one (explore plan WP4 item 2).
 *
 * The old query was "any playground with a different age range, best rated
 * first": `rating.desc` sorts NULLs first in Postgres, so unrated rows led,
 * and with no bounds the out-of-state rows it returned linked to Not Found.
 * Now: a box around this playground, clipped to the metro, distance-sorted
 * here. With no coordinates there is nothing to be near, so it returns [].
 */
export function useNearbyPlaygrounds(target: SideQueryTarget | null | undefined) {
  const hasCoords = target?.latitude != null && target?.longitude != null;
  return useQuery<PlaygroundCard[]>({
    queryKey: [...queryKeys.playgrounds.all, "nearby", target?.id] as const,
    enabled: Boolean(target) && hasCoords,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      if (!target || target.latitude == null || target.longitude == null) return [];
      const b = DES_MOINES_METRO_BOUNDS;
      const { data, error } = await supabase
        .from("playgrounds")
        .select(PLAYGROUND_CARD_COLUMNS)
        .neq("id", target.id)
        .gte("latitude", Math.max(b.minLatitude, target.latitude - NEARBY_BOX_DEGREES.lat))
        .lte("latitude", Math.min(b.maxLatitude, target.latitude + NEARBY_BOX_DEGREES.lat))
        .gte("longitude", Math.max(b.minLongitude, target.longitude - NEARBY_BOX_DEGREES.lng))
        .lte("longitude", Math.min(b.maxLongitude, target.longitude + NEARBY_BOX_DEGREES.lng))
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(NEARBY_CANDIDATES);

      if (error) {
        handleError(error, { component: "useNearbyPlaygrounds", action: "fetch" });
        throw error;
      }
      const rows = (data || []) as unknown as Omit<PlaygroundCard, "distanceMiles">[];
      return sortByDistanceFrom(rows, {
        latitude: target.latitude,
        longitude: target.longitude,
      }).slice(0, SIDE_LIST_SIZE + SIDE_LIST_SIZE);
    },
  });
}

/**
 * Other metro playgrounds for the same age range, best rated first with
 * unrated rows last. Distance is attached when both ends have coordinates.
 */
export function useSameAgePlaygrounds(target: SideQueryTarget | null | undefined) {
  return useQuery<PlaygroundCard[]>({
    queryKey: [...queryKeys.playgrounds.all, "same-age", target?.id, target?.age_range] as const,
    enabled: Boolean(target?.age_range),
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
    queryFn: async () => {
      if (!target?.age_range) return [];
      const { data, error } = await supabase
        .from("playgrounds")
        .select(PLAYGROUND_CARD_COLUMNS)
        .eq("age_range", target.age_range)
        .neq("id", target.id)
        .or(PLAYGROUND_METRO_FILTER)
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(SIDE_LIST_SIZE);

      if (error) {
        handleError(error, { component: "useSameAgePlaygrounds", action: "fetch" });
        throw error;
      }
      const rows = (data || []) as unknown as Omit<PlaygroundCard, "distanceMiles">[];
      if (target.latitude == null || target.longitude == null) {
        return rows.map((r) => ({ ...r, distanceMiles: null }));
      }
      const from = { latitude: target.latitude, longitude: target.longitude };
      return rows.map((r) => ({
        ...r,
        distanceMiles:
          r.latitude != null && r.longitude != null
            ? haversineDistance(from, { latitude: r.latitude, longitude: r.longitude })
            : null,
      }));
    },
  });
}
