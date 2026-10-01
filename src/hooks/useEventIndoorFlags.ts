/**
 * Indoor/outdoor flags for a set of events, fetched SEPARATELY and optionally
 * (WEB-FEAT-022).
 *
 * WHY THIS IS NOT JUST A COLUMN IN THE PAGE'S OWN SELECT.
 *
 * PostgREST fails the WHOLE query with 42703 when any selected column does not
 * exist. `events.is_indoor` arrives in migration 20260908000001, and the
 * migration lands in production on a different schedule from a Cloudflare Pages
 * deploy. Putting the column in the events list query would mean that between
 * the frontend deploy and `supabase db push`, /events/today returns nothing at
 * all - a blank page, not a missing sort. That is the WEB-QA-017 failure mode
 * (a silently-dead query rendering as an empty state) with a much larger blast
 * radius, and it is entirely avoidable.
 *
 * So the flags come from their own request. If that request fails for any
 * reason - the column is not there yet, RLS hides the rows, the network drops -
 * the caller gets an empty map, `reorderForWeather` finds every classification
 * undefined, and the list renders in its normal order. The feature switches
 * itself on when the migration lands, with no second deploy.
 *
 * The cost is one extra small request (two columns, keyed by ids already on the
 * page), and only when there is a weather verdict worth reordering for.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type IndoorFlagMap = Readonly<Record<string, boolean | null>>;

const EMPTY: IndoorFlagMap = Object.freeze({});

/**
 * @param eventIds ids to look up. Pass the ids already rendered on the page.
 * @param enabled  gate the request; callers pass the weather verdict so no
 *                 request is made when the answer could not change the order.
 */
export function useEventIndoorFlags(eventIds: string[], enabled: boolean) {
  // Sorted and joined so that the same set of events in a different order is
  // one cache entry rather than two.
  const key = [...eventIds].sort().join(',');

  const query = useQuery<IndoorFlagMap>({
    queryKey: ['event-indoor-flags', key],
    enabled: enabled && eventIds.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // No retry. If the column is not deployed yet, every attempt fails the same
    // way, and the correct outcome (an unreordered list) is already in hand.
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<IndoorFlagMap> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, is_indoor')
        .in('id', eventIds);

      if (error) {
        // Expected until migration 20260908000001 is applied. Not routed to
        // handleError: this is a designed degradation, not an incident, and it
        // must not raise a toast on a public page.
        if (import.meta.env.DEV) {
          console.warn(
            'useEventIndoorFlags: is_indoor unavailable, skipping weather reorder',
            error.message,
          );
        }
        return EMPTY;
      }

      const map: Record<string, boolean | null> = {};
      for (const row of data ?? []) {
        // Through `unknown` deliberately. src/integrations/supabase/types.ts is
        // generated from the deployed schema, so until migration
        // 20260908000001 is applied and the types are regenerated, PostgREST's
        // typings resolve this select to SelectQueryError<"column 'is_indoor'
        // does not exist"> and a direct assertion is a TS2352. The runtime
        // contract is the one the header describes: the column is there or the
        // request failed above.
        const typed = row as unknown as { id: string; is_indoor: boolean | null };
        map[typed.id] = typed.is_indoor ?? null;
      }
      return map;
    },
  });

  return query.data ?? EMPTY;
}
