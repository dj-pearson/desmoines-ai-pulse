import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import { createSlug } from '@/lib/slug';
import { formatInTimeZone } from 'date-fns-tz';
import { voteWriteError } from '@/lib/votingStatus';

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
  /**
   * The winner's own detail page, when one can be addressed (WEB-SEO-035).
   *
   * A leaderboard whose entries are not clickable is a dead end, and it is also
   * why /best-of/:category carried no ItemList - the schema needs a url per
   * item and the page had none. Restaurants use the `slug` COLUMN with the id
   * as the fallback, exactly as RestaurantCard does; attractions use
   * createSlug(name), exactly as the attractions grid does, and deliberately
   * NOT attractions.slug - that column arrives with migration 20260919000008
   * and naming it in this SELECT before it is applied would 42703 the whole
   * query and empty the leaderboard. Custom write-ins have no page, so they
   * get no link and no ItemList entry.
   */
  url?: string;
}

/** The columns every reader of voting_categories needs, named rather than `*`. */
const CATEGORY_COLUMNS =
  'id, name, slug, description, icon, is_active, voting_start, voting_end, created_at';

/**
 * Below this many votes in a category the leaderboard shows counts only: no
 * percentages, no medals. Three votes is not a result, and "67%" of three
 * reads like one.
 */
export const MIN_VOTES_FOR_RANKING = 25;

const VOTING_TZ = 'America/Chicago';

export type VotingPhase = 'upcoming' | 'open' | 'closed';

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Where `now` sits against the category's [voting_start, voting_end) window.
 * A missing start means "open since creation", a missing end means "no
 * closing date". UI only: the server does not enforce the window yet (D5).
 */
export function votingPhase(
  category: Pick<VotingCategory, 'voting_start' | 'voting_end'>,
  now: Date = new Date(),
): VotingPhase {
  const t = now.getTime();
  const start = parseTime(category.voting_start);
  const end = parseTime(category.voting_end);
  if (start !== null && t < start) return 'upcoming';
  if (end !== null && t >= end) return 'closed';
  return 'open';
}

/** "Oct 9, 2026" in Central time, or null for a missing/unparseable date. */
export function formatVotingDate(iso: string | null | undefined): string | null {
  const t = parseTime(iso);
  if (t === null) return null;
  return formatInTimeZone(new Date(t), VOTING_TZ, 'MMM d, yyyy');
}

/** The Central-time year a voting round started in, or null. */
export function votingYear(iso: string | null | undefined): string | null {
  const t = parseTime(iso);
  if (t === null) return null;
  return formatInTimeZone(new Date(t), VOTING_TZ, 'yyyy');
}

/** The stored pick of a signed-out voter, replayed for confirmation after sign-in. */
export interface PendingVote {
  categoryId: string;
  categorySlug: string;
  entityType: string;
  entityId?: string;
  customEntry?: string;
  name: string;
  savedAt: number;
}

export const PENDING_VOTE_KEY = 'pendingVote';

/** A stashed pick older than this is dropped rather than offered. */
export const PENDING_VOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface VotingCategoriesData {
  categories: VotingCategory[];
  /**
   * True when voting_category_tallies failed. Every vote_count is then 0 by
   * default, which is not the same as "no votes": the index says the counts
   * are unavailable instead of printing "No votes yet".
   */
  countsFailed: boolean;
}

/**
 * Fetch all active voting categories with vote counts.
 *
 * Throws when the categories read fails, so the page can tell "the backend is
 * down" from "no categories yet". It used to return [] for both.
 */
export function useVotingCategories() {
  return useQuery({
    queryKey: ['voting-categories'],
    queryFn: async (): Promise<VotingCategoriesData> => {
      // Categories and tallies don't depend on each other, so one round trip.
      // Tallies are aggregated server-side (WEB-SEC-025 step 2): the RPC
      // returns counts and nothing else, never a ballot or a user_id.
      const [categoriesRes, countsRes] = await Promise.all([
        supabase
          .from('voting_categories')
          .select(CATEGORY_COLUMNS)
          .eq('is_active', true)
          .order('name'),
        supabase.rpc('voting_category_tallies'),
      ]);

      if (categoriesRes.error) {
        log.warn('useVotingCategories', 'Failed to fetch categories', { error: categoriesRes.error.message });
        // Thrown as-is: its `code` is what shouldRetry reads to skip retrying
        // a permanent error.
        throw categoriesRes.error;
      }

      // Counts absent, categories present: the page still renders and says the
      // counts are unavailable. Deliberately not falling back to the raw table:
      // a fallback is a read path that survives the policy change and fails
      // then instead, when it is harder to notice.
      const countsFailed = !!countsRes.error;
      if (countsRes.error) {
        log.warn('useVotingCategories', 'Failed to fetch vote tallies', { error: countsRes.error.message });
      }

      const countMap: Record<string, number> = {};
      for (const row of (countsRes.data ?? []) as Array<{ category_id: string; vote_count: number }>) {
        countMap[row.category_id] = Number(row.vote_count);
      }

      const categories = ((categoriesRes.data || []) as unknown as VotingCategory[]).map((cat) => ({
        ...cat,
        vote_count: countMap[cat.id] || 0,
      }));
      return { categories, countsFailed };
    },
    staleTime: 2 * 60 * 1000,
  });
}

export interface CategoryLeader {
  category_id: string;
  entity_id: string;
  vote_count: number;
  name: string | null;
  url: string | null;
}

/**
 * The top-voted place per active category, keyed by category id.
 *
 * voting_winners() is the aggregate iOS and Android already call
 * (VotingService.swift, BestOfRemoteDataSource.kt); it returns no user_id and
 * no vote ids. It EXCLUDES write-ins, because a write-in has no row to link
 * to, so the index labels this "top place" rather than "winner". Names come
 * from the same restaurants/attractions reads useCategoryResults makes.
 */
export function useVotingLeaders() {
  return useQuery({
    queryKey: ['voting-leaders'],
    queryFn: async (): Promise<Record<string, CategoryLeader>> => {
      const { data, error } = await supabase.rpc('voting_winners');
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        category_id: string;
        entity_id: string | null;
        vote_count: number;
      }>;
      const leaders: Record<string, CategoryLeader> = {};
      for (const row of rows) {
        if (!row.entity_id) continue;
        leaders[row.category_id] = {
          category_id: row.category_id,
          entity_id: row.entity_id,
          vote_count: Number(row.vote_count),
          name: null,
          url: null,
        };
      }

      const ids = Array.from(new Set(Object.values(leaders).map((l) => l.entity_id)));
      if (ids.length === 0) return leaders;

      const [restaurantsRes, attractionsRes] = await Promise.all([
        supabase.from('restaurants').select('id, name, slug').in('id', ids),
        supabase.from('attractions').select('id, name').in('id', ids),
      ]);
      // A name lookup that fails leaves the leader unnamed; the page shows the
      // count without a name rather than dropping the category.
      if (restaurantsRes.error) {
        log.warn('useVotingLeaders', 'Failed to name restaurant leaders', { error: restaurantsRes.error.message });
      }
      if (attractionsRes.error) {
        log.warn('useVotingLeaders', 'Failed to name attraction leaders', { error: attractionsRes.error.message });
      }

      const named = new Map<string, { name: string; url: string }>();
      for (const r of restaurantsRes.data ?? []) {
        named.set(r.id, { name: r.name, url: `/restaurants/${r.slug || r.id}` });
      }
      for (const a of attractionsRes.data ?? []) {
        named.set(a.id, { name: a.name, url: `/attractions/${createSlug(a.name)}` });
      }
      for (const leader of Object.values(leaders)) {
        const hit = named.get(leader.entity_id);
        if (hit) {
          leader.name = hit.name;
          leader.url = hit.url;
        }
      }
      return leaders;
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
      // Only active categories are public. A failed read throws rather than
      // returning "not found": that branch is noindexed, and a backend outage
      // must not tell a crawler the page does not exist.
      const { data: catData, error: catError } = await supabase
        .from('voting_categories')
        .select(CATEGORY_COLUMNS)
        .eq('slug', categorySlug)
        .eq('is_active', true)
        .maybeSingle();

      if (catError) throw catError;
      if (!catData) return { category: null, results: [] };

      const category = catData as unknown as VotingCategory;

      // Tallies for this category, aggregated server-side (WEB-SEC-025 step 2).
      // The RPC groups by entity_id, falling back to custom_entry, and returns
      // no user_id and no vote ids -- the same grouping this hook used to do in
      // the browser over the raw ballots. A failure throws: an empty
      // leaderboard would say "no votes yet", which is a claim, not a fallback.
      const { data: tallies, error: talliesError } = await supabase
        .rpc('voting_results', { p_category_id: category.id });

      if (talliesError) throw talliesError;
      if (!tallies) return { category, results: [] };

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

      // Names, images and links for listed places. Restaurants and attractions
      // are read in parallel. A failed lookup is logged and leaves the entry
      // unnamed; the page says "Name unavailable" rather than guessing.
      const restaurantIds = results
        .filter((r) => r.entity_type === 'restaurant' && r.entity_id)
        .map((r) => r.entity_id as string);
      const attractionIds = results
        .filter((r) => r.entity_type === 'attraction' && r.entity_id)
        .map((r) => r.entity_id as string);

      const [restaurantsRes, attractionsRes] = await Promise.all([
        restaurantIds.length > 0
          ? supabase.from('restaurants').select('id, name, image_url, slug').in('id', restaurantIds)
          : Promise.resolve(null),
        attractionIds.length > 0
          ? supabase.from('attractions').select('id, name, image_url').in('id', attractionIds)
          : Promise.resolve(null),
      ]);

      if (restaurantsRes?.error) {
        log.warn('useCategoryResults', 'Failed to name restaurants', { error: restaurantsRes.error.message });
      }
      if (attractionsRes?.error) {
        log.warn('useCategoryResults', 'Failed to name attractions', { error: attractionsRes.error.message });
      }

      type NamedRow = { id: string; name: string; image_url: string | null; slug?: string | null };
      const restMap = new Map<string, NamedRow>(
        ((restaurantsRes?.data ?? []) as NamedRow[]).map((r) => [r.id, r]),
      );
      const attrMap = new Map<string, NamedRow>(
        ((attractionsRes?.data ?? []) as NamedRow[]).map((a) => [a.id, a]),
      );
      for (const result of results) {
        if (!result.entity_id) continue;
        if (result.entity_type === 'restaurant') {
          const rest = restMap.get(result.entity_id);
          if (rest) {
            result.name = rest.name;
            result.image_url = rest.image_url;
            result.url = `/restaurants/${rest.slug || rest.id}`;
          }
        } else if (result.entity_type === 'attraction') {
          const attr = attrMap.get(result.entity_id);
          if (attr) {
            result.name = attr.name;
            result.image_url = attr.image_url;
            result.url = `/attractions/${createSlug(attr.name)}`;
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

      // Throw rather than report "no vote": the booth would otherwise offer a
      // fresh ballot to someone who already has one.
      if (error) throw error;
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

      // One statement. The old delete-then-insert ignored the delete's error
      // and lost the ballot whenever the insert failed; an upsert on the
      // (category_id, user_id) unique key either replaces the vote or leaves
      // the previous one intact. A change needs the UPDATE policy in
      // 20260925000001; until it is applied the booth doesn't offer one
      // (VOTE_CHANGE_AVAILABLE in src/lib/votingStatus.ts).
      const ballot = {
        category_id: categoryId,
        entity_type: entityType,
        entity_id: entityId || null,
        custom_entry: customEntry || null,
        user_id: user.id,
      };
      // If that policy is not live, RLS rejects the change with 42501 and the
      // old vote stays; there is deliberately no delete-then-insert fallback,
      // since a failed insert after the delete loses the ballot.
      const { error } = await supabase
        .from('votes')
        .upsert(ballot, { onConflict: 'category_id,user_id' });

      // PostgrestError is a plain object, not an Error; wrap it so the
      // server's message survives to handleError, and keep its code: the
      // booth tells a 42501 (RLS refused the change) from a network failure.
      if (error) throw voteWriteError(error.message, error.code);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voting-categories'] });
      queryClient.invalidateQueries({ queryKey: ['voting-results'] });
      queryClient.invalidateQueries({ queryKey: ['user-vote'] });
      queryClient.invalidateQueries({ queryKey: ['voting-leaders'] });
    },
  });
}
