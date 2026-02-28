import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Trail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  length_miles: number | null;
  difficulty: string | null;
  surface_type: string | null;
  activities: string[];
  highlights: string | null;
  trailhead_address: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  website: string | null;
  is_featured: boolean;
  created_at: string;
}

export function useTrails() {
  return useQuery({
    queryKey: ['trails'],
    queryFn: async (): Promise<Trail[]> => {
      const { data, error } = await supabase
        .from('trails')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as unknown as Trail[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useTrail(slug: string) {
  return useQuery({
    queryKey: ['trail', slug],
    queryFn: async (): Promise<Trail | null> => {
      const { data, error } = await supabase
        .from('trails')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as Trail;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useFeaturedTrails() {
  return useQuery({
    queryKey: ['trails', 'featured'],
    queryFn: async (): Promise<Trail[]> => {
      const { data, error } = await supabase
        .from('trails')
        .select('*')
        .eq('is_featured', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as unknown as Trail[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  difficult: 'Difficult',
};

const SURFACE_LABELS: Record<string, string> = {
  paved: 'Paved',
  gravel: 'Gravel',
  dirt: 'Dirt',
  mixed: 'Mixed Surface',
};

export function getDifficultyLabel(difficulty: string): string {
  return DIFFICULTY_LABELS[difficulty] || difficulty;
}

export function getSurfaceLabel(surface: string): string {
  return SURFACE_LABELS[surface] || surface;
}
