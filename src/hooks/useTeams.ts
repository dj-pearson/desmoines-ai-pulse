import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Team {
  id: string;
  name: string;
  slug: string;
  sport: string;
  league: string;
  venue_name: string | null;
  venue_id: string | null;
  logo_url: string | null;
  website: string | null;
  schedule_url: string | null;
  description: string | null;
  created_at: string;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data ?? []) as unknown as Team[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useTeam(slug: string) {
  return useQuery({
    queryKey: ['team', slug],
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as unknown as Team;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTeamGames(teamName: string) {
  return useQuery({
    queryKey: ['team-games', teamName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .or(`title.ilike.%${teamName}%,venue.ilike.%${teamName}%`)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!teamName,
    staleTime: 5 * 60 * 1000,
  });
}
