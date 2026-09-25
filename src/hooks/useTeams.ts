import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { applyEventVisibility } from '@/lib/eventQuery';

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

/**
 * Other names a team's games are listed under, keyed by team slug (explore
 * pass 2 WP5 item 14). Kept beside the teams data until events carry a
 * team_id (D14). Short on purpose: each alias is matched against event titles,
 * so only names that mean the team and nothing else belong here.
 */
export const TEAM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'iowa-cubs': ['I-Cubs'],
  'iowa-barnstormers': ['Barnstormers'],
};

/**
 * The category guard for a team's games: the canonical "Sports" plus the
 * per-sport spellings rows written before the vocabulary still carry. Without
 * it, "Iowa Wild" matched a wildlife talk and "Iowa Cubs" a Cub Scout night.
 */
export const TEAM_GAME_CATEGORY_OR =
  'category.eq.Sports,category.ilike.%Sport%,category.ilike.%Baseball%,category.ilike.%Hockey%,category.ilike.%Basketball%,category.ilike.%Football%,category.ilike.%Soccer%';

/** The or() body matching a team's name or an alias in a title or venue. */
export function teamNameOrFilter(team: { name: string; slug?: string | null }): string {
  const names = [team.name, ...(team.slug ? TEAM_ALIASES[team.slug] ?? [] : [])];
  const clauses = new Set<string>();
  for (const name of names) {
    const safe = sanitizePostgrestPattern(name);
    if (!safe) continue;
    clauses.add(`title.ilike.%${safe}%`);
    clauses.add(`venue.ilike.%${safe}%`);
  }
  return [...clauses].join(',');
}

export function useTeamGames(team: string | { name: string; slug?: string | null }) {
  const target = typeof team === 'string' ? { name: team, slug: null } : team;
  return useQuery({
    // WEB-PERF-032: same three faults as useVenueEvents - a key outside the
    // events prefix, select('*'), and a raw interpolation. A comma ENDS a
    // clause inside or(...), so a team name containing one produced
    // "failed to parse logic tree" rather than no results.
    queryKey: queryKeys.events.list({ team: target.name, teamSlug: target.slug ?? null }),
    queryFn: async () => {
      const names = teamNameOrFilter(target);
      // Explore plan WP5 item 1: same visibility rule as every other reader.
      // Pass 2 item 14: name AND a sports category, in one or= param.
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select(EVENT_LIST_COLUMNS)
      )
        .or(`and(or(${names}),or(${TEAM_GAME_CATEGORY_OR}))`)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!target.name,
    staleTime: 5 * 60 * 1000,
  });
}
