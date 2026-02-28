import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ItineraryStop {
  order: number;
  entity_type: string;
  name: string;
  description: string;
  time_suggestion: string;
  tips: string;
  entity_id?: string;
}

export interface CuratedItinerary {
  id: string;
  title: string;
  slug: string;
  description: string;
  duration: string;
  theme: string;
  cover_image: string | null;
  stops: ItineraryStop[];
  seo_title: string | null;
  seo_description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export function useItineraries() {
  return useQuery({
    queryKey: ['curated-itineraries'],
    queryFn: async (): Promise<CuratedItinerary[]> => {
      const { data, error } = await supabase
        .from('curated_itineraries')
        .select('*')
        .eq('is_published', true)
        .order('theme');

      if (error) throw error;
      return (data ?? []) as unknown as CuratedItinerary[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useItinerary(slug: string) {
  return useQuery({
    queryKey: ['curated-itinerary', slug],
    queryFn: async (): Promise<CuratedItinerary | null> => {
      const { data, error } = await supabase
        .from('curated_itineraries')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as CuratedItinerary;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

const THEME_LABELS: Record<string, string> = {
  romance: 'Romance',
  family: 'Family',
  adventure: 'Adventure',
  'food-drink': 'Food & Drink',
  'arts-culture': 'Arts & Culture',
  sports: 'Sports',
  general: 'General',
};

const DURATION_LABELS: Record<string, string> = {
  'half-day': 'Half Day',
  'full-day': 'Full Day',
  weekend: 'Weekend',
  '3-day': '3-Day Trip',
};

export function getThemeLabel(theme: string): string {
  return THEME_LABELS[theme] || theme;
}

export function getDurationLabel(duration: string): string {
  return DURATION_LABELS[duration] || duration;
}
