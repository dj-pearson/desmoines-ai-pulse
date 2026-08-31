import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { haversineDistance } from '@/lib/geo';
import { createSlug } from '@/lib/slug';
import { OUTDOORS_DESTINATIONS } from '@/data/outdoorsGuide';

/**
 * The internal links the /outdoors guide earns rather than asserts (SEO-024).
 *
 * SEO-024 asks for an internal link count in the competition's range. The lazy
 * way to hit a number is to paste every page on the site into a footer block.
 * This instead asks a question a reader would ask - what else is at this park,
 * and what is near it - and links the answer, so every link has a reason a
 * human would recognize.
 *
 * MATCHED BY DISTANCE, NOT BY NAME. `playgrounds` holds 69 rows and 21 of them
 * are in Oregon, Washington, Colorado and Missouri (a Google Places import that
 * went wide; see the /playgrounds hub, which has the same rows). Proximity
 * filtering drops them for free: nothing 1,000 miles away lands inside a 6-mile
 * radius. A name match would not have.
 *
 * TWO QUERIES, BOTH TINY, BOTH TanStack. Prerender waits on
 * `data-queries-settled`, which is published from TanStack Query's cache and
 * sees nothing else (src/App.tsx). A useState/useEffect fetch - which is what
 * useAttractions and usePlaygrounds are - would not be waited for, so the
 * capture could land before the rows arrive. That is why this file does not
 * reuse them.
 */

/** How far from a destination a playground still counts as "at" it. */
const PLAYGROUND_RADIUS_MILES = 6;
/** Playgrounds linked per destination. Enough to be useful, short of a dump. */
const PLAYGROUNDS_PER_DESTINATION = 6;

// A restaurants-near-trailhead section was scaffolded here and is not built.
// Nothing consumes it and SEO-024 does not ask for it, so the constants are
// gone rather than left as dead code. The measurement they encoded is worth
// keeping if anyone picks it up: at a 6-mile radius, six of the eight guide
// destinations have honest options and the two rural trailheads (Woodward,
// Martensdale) have none, which is the true answer for both. Four miles empties
// Ledges; eight reaches into different towns.

/** Attraction `type` values that belong on an outdoors page. */
const OUTDOOR_ATTRACTION_TYPES = new Set([
  'Park',
  'Park/Art',
  'Trail',
  'Garden',
  'Golf Course',
  'Zoo',
  'Water Park',
  'Amusement Park',
]);

export interface NearbyPlace {
  name: string;
  path: string;
  /** Miles from the destination, rounded to one decimal. */
  distanceMiles: number;
  /** Cuisine, for restaurants. Absent for playgrounds. */
  note?: string | null;
}

export interface OutdoorAttractionLink {
  name: string;
  path: string;
  type: string;
  location: string | null;
}

interface PlaygroundRow {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface AttractionRow {
  name: string;
  type: string | null;
  location: string | null;
}

/**
 * Playgrounds within {@link PLAYGROUND_RADIUS_MILES} of each guide destination,
 * keyed by destination id. This is the /outdoors -> /playgrounds half of the
 * cross-link SEO-024 asks for; the other half is a link block on /playgrounds.
 */
export function usePlaygroundsNearDestinations() {
  return useQuery({
    queryKey: ['outdoors', 'playgrounds-nearby'],
    queryFn: async (): Promise<Record<string, NearbyPlace[]>> => {
      const { data, error } = await supabase
        .from('playgrounds')
        .select('name, latitude, longitude')
        .order('name');

      if (error) throw error;

      const rows = (data ?? []) as unknown as PlaygroundRow[];
      const byDestination: Record<string, NearbyPlace[]> = {};

      for (const destination of OUTDOORS_DESTINATIONS) {
        byDestination[destination.id] = rows
          .filter((row) => row.latitude != null && row.longitude != null)
          .map((row) => ({
            name: row.name,
            path: `/playgrounds/${createSlug(row.name)}`,
            distanceMiles:
              Math.round(
                haversineDistance(destination.geo, {
                  latitude: row.latitude as number,
                  longitude: row.longitude as number,
                }) * 10,
              ) / 10,
          }))
          .filter((place) => place.distanceMiles <= PLAYGROUND_RADIUS_MILES)
          .sort((a, b) => a.distanceMiles - b.distanceMiles)
          .slice(0, PLAYGROUNDS_PER_DESTINATION);
      }

      return byDestination;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Attractions that are themselves outdoors, for the "more outdoors in the
 * metro" block. Filtered on `type` rather than on a hand-written slug list so
 * a new park added to the table appears here without a second edit.
 */
export function useOutdoorAttractions() {
  return useQuery({
    queryKey: ['outdoors', 'attractions'],
    queryFn: async (): Promise<OutdoorAttractionLink[]> => {
      const { data, error } = await supabase
        .from('attractions')
        .select('name, type, location')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const seen = new Set<string>();
      return ((data ?? []) as unknown as AttractionRow[])
        .filter((row) => row.type != null && OUTDOOR_ATTRACTION_TYPES.has(row.type))
        .map((row) => ({
          name: row.name,
          path: `/attractions/${createSlug(row.name)}`,
          type: row.type as string,
          location: row.location,
        }))
        // Two rows describe the Pappajohn sculpture park and two describe the
        // capitol. Slugs are derived from the name, so the duplicates resolve
        // to different URLs and both are real pages, but listing near-identical
        // names side by side reads as a bug. Keep the first of each path.
        .filter((link) => {
          if (seen.has(link.path)) return false;
          seen.add(link.path);
          return true;
        });
    },
    staleTime: 10 * 60 * 1000,
  });
}
