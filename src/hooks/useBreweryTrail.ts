import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RESTAURANT_LIST_COLUMNS } from '@/lib/listColumns';

export interface BreweryCheckin {
  id: string;
  user_id: string;
  restaurant_id: string;
  checked_in_at: string;
  photo_url: string | null;
  beer_name: string | null;
  rating: number | null;
}

/**
 * WHY THIS LIST STILL EXISTS (WEB-PERF-035 AC3).
 *
 * A trail built from nine hardcoded names is wrong in both directions: a new
 * brewery is invisible until someone edits this file, and a restaurant that
 * happens to contain one of these strings joins the trail. The fix is a column,
 * and supabase/migrations/20260919000007_restaurants_is_brewery.sql adds
 * `restaurants.is_brewery` and backfills it from exactly these two signals.
 *
 * The READER cannot switch in the same release. Cloudflare Pages deploys on
 * push to main while migrations are applied by hand, so a hook filtering on
 * `is_brewery` before that migration lands gets 42703 from PostgREST - which
 * rejects the WHOLE select, blanking the trail rather than degrading it
 * (CLAUDE.md, Backward Compatibility). Switch this to
 * `.eq('is_brewery', true)` in the release AFTER the migration is live, and
 * delete the list then.
 */
const BREWERY_NAMES = [
  'Confluence Brewing',
  'Exile Brewing',
  'Peace Tree Brewing',
  'Firetrucker Brewery',
  'Brightside Aleworks',
  '515 Brewing',
  'Mistress Brewing',
  'Fox Brewing',
  'Kinship Brewing',
];

export function useBreweries() {
  return useQuery({
    queryKey: ['breweries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('restaurants')
        .select(RESTAURANT_LIST_COLUMNS)
        .or(BREWERY_NAMES.map(n => `name.ilike.%${n}%`).join(',') + ',cuisine.ilike.%Brewery%,cuisine.ilike.%Craft Beer%')
        .order('name');

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useBreweryCheckins() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['brewery-checkins', user?.id],
    queryFn: async (): Promise<BreweryCheckin[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('brewery_trail_checkins')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data ?? []) as unknown as BreweryCheckin[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckinMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ restaurantId, beerName, rating }: { restaurantId: string; beerName?: string; rating?: number }) => {
      if (!user) throw new Error('Must be logged in');
      const { data, error } = await supabase
        .from('brewery_trail_checkins')
        .upsert({
          user_id: user.id,
          restaurant_id: restaurantId,
          beer_name: beerName || null,
          rating: rating || null,
          checked_in_at: new Date().toISOString(),
        }, { onConflict: 'user_id,restaurant_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brewery-checkins'] });
    },
  });
}
