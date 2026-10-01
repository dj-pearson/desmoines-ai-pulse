import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import { applyHubFilters, type HubFilters } from '@/components/events/eventsHubQuery';

/**
 * Every matching event with coordinates, for the /events map view
 * (docs/page-plans/events.md WP4 item 1).
 *
 * The map used to plot whatever page of 30 the list had loaded, so it showed
 * a slice and called it the city. This runs its own query with the list's own
 * predicates (applyHubFilters: visibility, Central-time window or upcoming
 * floor, area, category, search, free) so the pins and the list describe the
 * same set. No pagination; a hard cap keeps a filterless query bounded.
 *
 * A second, count-only HEAD request with the same predicates and no coordinate
 * filter gives the total, so the view can say how many matches have no mapped
 * location instead of quietly dropping them.
 */

/** Pins per query. The hub has a few hundred upcoming rows on a busy week. */
export const MAP_EVENT_CAP = 500;

/** The columns a pin and its popup read, and nothing else. */
const MAP_COLUMNS =
  'id,title,date,event_start_utc,event_start_local,end_date,venue,location,city,price,category,latitude,longitude';

export interface MapEvent {
  id: string;
  title: string;
  date: string;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  end_date?: string | null;
  venue?: string | null;
  location?: string | null;
  city?: string | null;
  price?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface EventsMapData {
  /** Rows with coordinates, earliest first, at most MAP_EVENT_CAP. */
  events: MapEvent[];
  /** Matching rows that have coordinates (may exceed events.length). */
  mappedCount: number;
  /** All matching rows, with or without coordinates. */
  totalCount: number;
}

export async function fetchEventsMapData(filters: HubFilters, now: Date): Promise<EventsMapData> {
  const pinsQuery = applyHubFilters(
    supabase.from('events').select(MAP_COLUMNS, { count: 'exact' }),
    filters,
    now,
  )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('date', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAP_EVENT_CAP);

  const totalQuery = applyHubFilters(
    supabase.from('events').select('id', { count: 'exact', head: true }),
    filters,
    now,
  );

  const [pins, total] = await Promise.all([pinsQuery, totalQuery]);
  if (pins.error) throw pins.error;

  const events = (pins.data ?? []) as unknown as MapEvent[];
  const mappedCount = pins.count ?? events.length;
  // The total is a label, not the pins: if only it fails, fall back to what
  // the pins know rather than failing the whole map.
  const totalCount = total.error ? mappedCount : Math.max(total.count ?? mappedCount, mappedCount);
  return { events, mappedCount, totalCount };
}

export interface UseEventsMapDataOptions {
  /** Only true in map mode; list mode never pays for this query. */
  enabled: boolean;
  /** The clock the list uses, so "upcoming" means the same instant in both. */
  now?: Date;
}

export function useEventsMapData(filters: HubFilters, { enabled, now }: UseEventsMapDataOptions) {
  return useQuery({
    queryKey: queryKeys.events.list({
      view: 'map',
      search: filters.search,
      category: filters.category,
      windowStart: filters.window?.start ?? null,
      windowEnd: filters.window?.end ?? null,
      area: filters.area?.slug ?? null,
      freeOnly: filters.freeOnly,
    }),
    queryFn: () => fetchEventsMapData(filters, now ?? new Date()),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
