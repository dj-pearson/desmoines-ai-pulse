import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuideSection {
  title: string;
  items: string[];
}

export interface SeasonalGuide {
  id: string;
  title: string;
  slug: string;
  season: string;
  description: string | null;
  cover_image: string | null;
  content: { sections: GuideSection[] };
  is_published: boolean;
  publish_date: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
}

export function useSeasonalGuides() {
  return useQuery({
    queryKey: ['seasonal-guides'],
    queryFn: async (): Promise<SeasonalGuide[]> => {
      const { data, error } = await supabase
        .from('seasonal_guides')
        .select('*')
        .eq('is_published', true)
        .order('publish_date', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as SeasonalGuide[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useSeasonalGuide(slug: string) {
  return useQuery({
    queryKey: ['seasonal-guide', slug],
    queryFn: async (): Promise<SeasonalGuide | null> => {
      const { data, error } = await supabase
        .from('seasonal_guides')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as SeasonalGuide;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

const SEASON_LABELS: Record<string, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
  holiday: 'Holiday',
};

const SEASON_COLORS: Record<string, string> = {
  spring: 'bg-green-500/10 text-green-700 dark:text-green-400',
  summer: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  fall: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  winter: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  holiday: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

export function getSeasonLabel(season: string): string {
  return SEASON_LABELS[season] || season;
}

export function getSeasonColor(season: string): string {
  return SEASON_COLORS[season] || '';
}
