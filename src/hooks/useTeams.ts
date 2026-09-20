import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';

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
    // WEB-PERF-032: same three faults as useVenueEvents - a key outside the
    // events prefix, select('*'), and a raw interpolation. A comma ENDS a
    // clause inside or(...), so a team name containing one produced
    // "failed to parse logic tree" rather than no results.
    queryKey: queryKeys.events.list({ team: teamName }),
    queryFn: async () => {
      const safeTeam = sanitizePostgrestPattern(teamName);
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .or(`title.ilike.%${safeTeam}%,venue.ilike.%${safeTeam}%`)
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
