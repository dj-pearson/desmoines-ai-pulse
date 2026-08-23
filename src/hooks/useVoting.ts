import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';

const log = createLogger('useVoting');

export interface VotingCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  is_active: boolean;
  voting_start: string;
  voting_end: string | null;
  created_at: string;
  vote_count?: number;
}

export interface Vote {
  id: string;
  category_id: string;
  entity_type: string;
  entity_id: string | null;
  custom_entry: string | null;
  user_id: string;
  created_at: string;
}

export interface VoteResult {
  entity_type: string;
  entity_id: string | null;
  custom_entry: string | null;
  vote_count: number;
  // Joined entity data
  name?: string;
  /** Nullable in the database (restaurants.image_url / attractions.image_url),
   *  so the optional marker alone was not enough — `string | undefined` cannot
   *  hold the `null` those columns actually return. */
  image_url?: string | null;
}

/**
 * Fetch all active voting categories with vote counts.
 */
export function useVotingCategories() {
  return useQuery({
    queryKey: ['voting-categories'],
    queryFn: async (): Promise<VotingCategory[]> => {
      const { data: categories, error } = await supabase
        .from('voting_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        log.warn('useVotingCategories', 'Failed to fetch categories', { error: error.message });
        return [];
      }

      // Vote counts per category, aggregated server-side (WEB-SEC-025 step 2).
      // This used to select every row of `votes` and count them in the browser,
      // which meant the client held one row per ballot -- and `votes` carries
      // `user_id`. The RPC returns counts and nothing else, so the leaderboard
      // stops depending on a read that has to be revoked in step 3.
      const { data: counts, error: countsError } = await supabase.rpc('voting_category_tallies');

      if (countsError) {
        // Counts absent, categories present: the page still renders, every
        // category reading 0. Deliberately not falling back to the raw table --
        // a fallback is a read path that survives the policy change and fails
        // then instead, when it is harder to notice.
        log.warn('useVotingCategories', 'Failed to fetch vote tallies', { error: countsError.message });
      }

      const countMap: Record<string, number> = {};
      for (const row of (counts ?? []) as Array<{ category_id: string; vote_count: number }>) {
        countMap[row.category_id] = Number(row.vote_count);
      }

      return ((categories || []) as unknown as VotingCategory[]).map((cat) => ({
        ...cat,
        vote_count: countMap[cat.id] || 0,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch results for a specific voting category.
 */
export function useCategoryResults(categorySlug: string) {
  return useQuery({
    queryKey: ['voting-results', categorySlug],
    queryFn: async (): Promise<{ category: VotingCategory | null; results: VoteResult[] }> => {
      // Fetch the category
      const { data: catData, error: catError } = await supabase
        .from('voting_categories')
        .select('*')
        .eq('slug', categorySlug)
        .single();

      if (catError || !catData) {
        return { category: null, results: [] };
      }

      const category = catData as unknown as VotingCategory;

      // Tallies for this category, aggregated server-side (WEB-SEC-025 step 2).
      // The RPC groups by entity_id, falling back to custom_entry, and returns
      // no user_id and no vote ids -- the same grouping this hook used to do in
      // the browser over the raw ballots.
      const { data: tallies, error: talliesError } = await supabase
        .rpc('voting_results', { p_category_id: category.id });

      if (talliesError || !tallies) {
        return { category, results: [] };
      }

      // Already ordered by count descending in SQL; kept explicit so a change to
      // the function's ORDER BY cannot silently reorder the leaderboard.
      const results: VoteResult[] = (tallies as Array<{
        entity_type: string;
        entity_id: string | null;
        custom_entry: string | null;
        vote_count: number;
      }>)
        .map((row) => ({
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          custom_entry: row.custom_entry,
          vote_count: Number(row.vote_count),
        }))
        .sort((a, b) => b.vote_count - a.vote_count);

      // Enrich with entity names for restaurants
      const restaurantIds = results.filter((r) => r.entity_type === 'restaurant' && r.entity_id).map((r) => r.entity_id!);
      if (restaurantIds.length > 0) {
        const { data: restaurants } = await supabase
          .from('restaurants')
          .select('id, name, image_url')
          .in('id', restaurantIds);

        if (restaurants) {
          const restMap = new Map(restaurants.map((r) => [r.id, r]));
          for (const result of results) {
            if (result.entity_type === 'restaurant' && result.entity_id) {
              const rest = restMap.get(result.entity_id);
              if (rest) {
                result.name = rest.name;
                result.image_url = rest.image_url;
              }
            }
          }
        }
      }

      // Enrich attractions
      const attractionIds = results.filter((r) => r.entity_type === 'attraction' && r.entity_id).map((r) => r.entity_id!);
      if (attractionIds.length > 0) {
        const { data: attractions } = await supabase
          .from('attractions')
          .select('id, name, image_url')
          .in('id', attractionIds);

        if (attractions) {
          const attrMap = new Map(attractions.map((a) => [a.id, a]));
          for (const result of results) {
            if (result.entity_type === 'attraction' && result.entity_id) {
              const attr = attrMap.get(result.entity_id);
              if (attr) {
                result.name = attr.name;
                result.image_url = attr.image_url;
              }
            }
          }
        }
      }

      // For custom entries, use the custom_entry as the name
      for (const result of results) {
        if (!result.name && result.custom_entry) {
          result.name = result.custom_entry;
        }
      }

      return { category, results };
    },
    staleTime: 60 * 1000,
    enabled: !!categorySlug,
  });
}

/**
 * Fetch the current user's vote for a category (if any).
 */
export function useUserVote(categoryId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-vote', categoryId, user?.id],
    queryFn: async (): Promise<Vote | null> => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('category_id', categoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return null;
      return data as unknown as Vote | null;
    },
    enabled: !!user && !!categoryId,
    staleTime: 60 * 1000,
  });
}

/**
 * Cast or change a vote.
 */
export function useCastVote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      categoryId,
      entityType,
      entityId,
      customEntry,
    }: {
      categoryId: string;
      entityType: string;
      entityId?: string;
      customEntry?: string;
    }) => {
      if (!user) throw new Error('Must be logged in to vote');

      // Upsert: delete existing vote then insert new one
      await supabase
        .from('votes')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', user.id);

      const { error } = await supabase
        .from('votes')
        .insert({
          category_id: categoryId,
          entity_type: entityType,
          entity_id: entityId || null,
          custom_entry: customEntry || null,
          user_id: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-categories'] });
      queryClient.invalidateQueries({ queryKey: ['voting-results'] });
      queryClient.invalidateQueries({ queryKey: ['user-vote'] });
    },
  });
}
