import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { applyEventVisibility } from '@/lib/eventQuery';
import { eventTiming, type EventTimingInput } from '@/lib/eventTiming';
import { hubDateOrFilter } from '@/lib/hubEventPartition';
import { centralDateOf, centralWindow } from '@/lib/timezone';
import { matchVenue, venueIlikeOrFilter } from '@/lib/venuePages';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  venue_type: string | null;
  image_url: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as unknown as Venue[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useVenue(slug: string) {
  return useQuery({
    queryKey: ['venue', slug],
    queryFn: async (): Promise<Venue | null> => {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as Venue;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

/** Rows the venue page lists. The fetch over-reads; matchVenue trims it. */
const VENUE_EVENT_LIMIT = 20;
const VENUE_EVENT_FETCH = 60;

/**
 * A venue's upcoming events, by the same rule the /music card and event
 * detail use (explore pass 2 WP5 item 2).
 *
 * The fetch is loose on purpose: `venue.ilike` over the venue's name and each
 * alias in VENUE_ALIASES (so "Casey's Center" rows reach the arena's page),
 * then matchVenue decides row by row. `ilike %name%` alone was both too tight
 * (it never found "Wooly's" for Woolys) and too loose (any string containing
 * the name matched, one-word names included).
 *
 * Pass a venue row to get its aliases. A bare name still works, for callers
 * such as AttractionEventsRail that only know a place's name.
 */
export function useVenueEvents(venue: string | { name: string; slug?: string | null }) {
  const target = typeof venue === 'string' ? { name: venue, slug: null } : venue;
  const today = centralDateOf();
  return useQuery({
    // WEB-PERF-032: under the events prefix, so an admin edit reaches it; the
    // day is in the key so crossing midnight refetches.
    queryKey: queryKeys.events.list({ venue: target.name, venueSlug: target.slug ?? null, from: today }),
    queryFn: async () => {
      const now = new Date();
      const dayStart = centralWindow('today', now).start;
      // Explore plan WP5 item 1: merged, hidden and archived rows stay off
      // the venue page, the same rule every other reader applies. Running
      // rows (started before today, end_date still ahead) are admitted like
      // on the hubs; ended ones are dropped below.
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select(EVENT_LIST_COLUMNS)
      )
        .or(`and(or(${venueIlikeOrFilter(target)}),or(${hubDateOrFilter(dayStart, now)}))`)
        .order('date', { ascending: true })
        .limit(VENUE_EVENT_FETCH);

      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<EventTimingInput & { venue?: string | null }>;
      return rows
        .filter((row) => matchVenue(row.venue, [target]) !== null && !eventTiming(row, now).isOver)
        .slice(0, VENUE_EVENT_LIMIT) as unknown as typeof data;
    },
    enabled: !!target.name,
    staleTime: 5 * 60 * 1000,
  });
}

export interface VenueLink {
  slug: string;
  name: string;
}

/**
 * Just the two columns a link needs, for below-the-fold directories such as the
 * /events hub (events plan WP7). useVenues() pulls every column for pages that
 * render venue details; a list of links has no use for descriptions, images or
 * coordinates. Appended after the other hooks so the select-star baseline's
 * line numbers above stay put.
 */
export function useVenueLinks() {
  return useQuery({
    queryKey: ['venues', 'links'],
    queryFn: async (): Promise<VenueLink[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('slug, name')
        .order('name');

      if (error) throw error;
      return ((data ?? []) as VenueLink[]).filter((v) => Boolean(v.slug && v.name));
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** What event detail matches an event's venue against (events-pass2 WP4 item 16). */
export interface VenueMatchRow {
  slug: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Read by EventHotelCallout: a venue with a recorded capacity draws visitors who stay over. */
  capacity: number | null;
}

/**
 * The columns matchVenue, the map fallback and the hotel callout read, instead
 * of useVenues()'s select('*') with descriptions and images the detail page
 * never shows. Appended at the end so the select-star baseline's line numbers
 * above stay put.
 */
export function useVenueMatchRows() {
  return useQuery({
    queryKey: ['venues', 'match-rows'],
    queryFn: async (): Promise<VenueMatchRow[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select('slug, name, address, latitude, longitude, capacity')
        .order('name');

      if (error) throw error;
      return ((data ?? []) as VenueMatchRow[]).filter((v) => Boolean(v.slug && v.name));
    },
    staleTime: 10 * 60 * 1000,
  });
}
