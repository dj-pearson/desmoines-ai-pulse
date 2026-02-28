import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BreweryCheckin {
  id: string;
  user_id: string;
  restaurant_id: string;
  checked_in_at: string;
  photo_url: string | null;
  beer_name: string | null;
  rating: number | null;
}

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
        .select('*')
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
