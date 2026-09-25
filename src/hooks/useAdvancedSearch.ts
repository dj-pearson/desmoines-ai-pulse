import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, GC_TIME, shouldRetry } from '@/lib/queryConfig';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { handleError } from '@/lib/errorHandler';
import {
  EVENT_LIST_COLUMNS,
  RESTAURANT_LIST_COLUMNS,
  ATTRACTION_LIST_COLUMNS,
  PLAYGROUND_LIST_COLUMNS,
} from '@/lib/listColumns';
import { escapeLikePattern, sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { centralWindow, upcomingFloorUtc } from '@/lib/timezone';

/**
 * The filters /search/advanced can actually apply (search plan WP4 item 2).
 *
 * Radius, price range, time of day, features, deals, accessibility, open now
 * and "Near Me" were removed: no predicate ever read them, and the Insider gate
 * sold them anyway. What is left is exactly what reaches a query below.
 *
 * `dateRange` holds Central calendar dates (`yyyy-MM-dd`), not Date objects,
 * so a saved row round-trips through JSON unchanged. Rows saved before this
 * held ISO strings there; `toAdvancedFilters` takes the date part of those.
 */
export interface AdvancedSearchFilters {
  query: string;
  category: string;
  /** An area name matched against the row's `location`, or '' for any. */
  location: string;
  /** Minimum rating; 0 means any. Events carry no rating, so a rating hides them. */
  rating: number;
  dateRange: {
    start?: string;
    end?: string;
  };
  sortBy: AdvancedSearchSort;
  featuredOnly: boolean;
}

export type AdvancedSearchSort = 'relevance' | 'rating';

export interface SavedSearch {
  id: string;
  name: string;
  filters: AdvancedSearchFilters;
  createdAt: Date;
  lastUsed?: Date;
  useCount: number;
  /**
   * False for rows another surface wrote into the same table: the /events
   * `event_list` shape `{q, category, ...}` and the iOS shape `{query, tab}`
   * (which iOS stores as `advanced` for every tab but Events). Those can't be
   * loaded into these controls, so "Use" sends them to /search instead.
   */
  restorable: boolean;
  /** The row's own words (`query` or `q`), for the /search hand-off. */
  query: string;
}

export interface SearchResult {
  id: string;
  type: 'event' | 'restaurant' | 'attraction' | 'playground';
  title: string;
  description?: string;
  location: string;
  rating?: number;
  price?: string;
  imageUrl?: string;
  /** Restaurants only: the slug column their detail route prefers. */
  slug?: string | null;
  /** Events only: what createEventSlugWithCentralTime needs for the link. */
  date?: string | null;
  event_start_utc?: string | null;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedSearchFilters = {
  query: '',
  category: 'All',
  location: '',
  rating: 0,
  dateRange: {},
  sortBy: 'relevance',
  featuredOnly: false,
};

const CATEGORIES = ['All', 'Events', 'Restaurants', 'Attractions', 'Playgrounds'];
const RATINGS = [0, 3, 4, 4.5];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `yyyy-MM-dd` from a stored date string (plain date or ISO instant), else undefined. */
function dayOf(value: unknown): string | undefined {
  const s = str(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime())
    ? s
    : undefined;
}

/**
 * Any stored `filters` value, of any shape (or null, or a string), as filters
 * these controls can render. Unknown keys are dropped, missing ones take the
 * default, and nothing here throws. This is what stops one /events or iOS save
 * from crashing the page (WP4 item 1).
 */
export function toAdvancedFilters(raw: unknown): AdvancedSearchFilters {
  const f = isRecord(raw) ? raw : {};
  const range = isRecord(f.dateRange) ? f.dateRange : {};
  const category = str(f.category);
  const rating = typeof f.rating === 'number' ? f.rating : 0;
  return {
    query: str(f.query) || str(f.q),
    category: CATEGORIES.includes(category) ? category : 'All',
    location: str(f.location) === 'Near Me' ? '' : str(f.location),
    rating: RATINGS.includes(rating) ? rating : 0,
    dateRange: { start: dayOf(range.start), end: dayOf(range.end) },
    sortBy: f.sortBy === 'rating' ? 'rating' : 'relevance',
    featuredOnly: f.featuredOnly === true,
  };
}

/**
 * Whether a saved row was written by this page. The web advanced shape always
 * carries `sortBy` and `featuredOnly`; the iOS `{query, tab}` shape and the
 * /events `{q, ...}` shape never do.
 */
function isAdvancedRow(searchType: unknown, raw: unknown): boolean {
  if (searchType !== 'advanced' || !isRecord(raw)) return false;
  return 'sortBy' in raw && 'featuredOnly' in raw;
}

interface SavedSearchRow {
  id: string;
  name: string;
  filters: Json;
  search_type?: string | null;
  created_at: string;
  last_used?: string | null;
  use_count?: number | null;
}

function toSavedSearch(row: SavedSearchRow): SavedSearch {
  const raw = row.filters as unknown;
  const f = isRecord(raw) ? raw : {};
  return {
    id: row.id,
    name: row.name,
    filters: toAdvancedFilters(raw),
    createdAt: new Date(row.created_at),
    lastUsed: row.last_used ? new Date(row.last_used) : undefined,
    useCount: row.use_count || 0,
    restorable: isAdvancedRow(row.search_type, raw),
    query: str(f.query) || str(f.q),
  };
}

/** Filters as stored: plain JSON, dates as `yyyy-MM-dd`, empty dates omitted. */
function toStoredFilters(filters: AdvancedSearchFilters): Json {
  const dateRange: Record<string, string> = {};
  if (filters.dateRange.start) dateRange.start = filters.dateRange.start;
  if (filters.dateRange.end) dateRange.end = filters.dateRange.end;
  return {
    query: filters.query,
    category: filters.category,
    location: filters.location,
    rating: filters.rating,
    dateRange,
    sortBy: filters.sortBy,
    featuredOnly: filters.featuredOnly,
  };
}

/** Stable empty array - a fresh `[]` default would give `results` a new identity
 *  every render and re-fire consumer effects that depend on it. */
const EMPTY_RESULTS: SearchResult[] = [];

async function searchEvents(f: AdvancedSearchFilters): Promise<SearchResult[]> {
  // Central day boundaries: an event at 7pm Central on the 1st is 00:00 UTC
  // on the 2nd, and a UTC-date window drops it.
  const floor = upcomingFloorUtc();
  const start = f.dateRange.start
    ? centralWindow({ kind: 'single', date: f.dateRange.start }).start
    : floor;
  let query = supabase
    .from('events')
    .select(EVENT_LIST_COLUMNS)
    .gte('date', start > floor ? start : floor)
    .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
    // WEB-BE-034: archived_at is the other unpublish switch.
    .is('archived_at', null)
    .order('date', { ascending: true })
    .limit(50);

  if (f.dateRange.end) {
    query = query.lte('date', centralWindow({ kind: 'single', date: f.dateRange.end }).end);
  }
  if (f.query) {
    const q = sanitizePostgrestPattern(f.query);
    query = query.or(`title.ilike.%${q}%,venue.ilike.%${q}%,location.ilike.%${q}%`);
  }
  if (f.location) {
    query = query.ilike('location', `%${escapeLikePattern(f.location)}%`);
  }
  if (f.featuredOnly) {
    query = query.eq('is_featured', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((event) => ({
    id: event.id,
    type: 'event' as const,
    title: event.title,
    description: event.enhanced_description || event.original_description,
    location: event.location,
    price: event.price,
    imageUrl: event.image_url,
    date: event.date,
    event_start_utc: event.event_start_utc,
  }));
}

async function searchRestaurants(f: AdvancedSearchFilters): Promise<SearchResult[]> {
  let query = supabase.from('restaurants').select(RESTAURANT_LIST_COLUMNS).limit(50);

  if (f.query) {
    const q = sanitizePostgrestPattern(f.query);
    query = query.or(`name.ilike.%${q}%,cuisine.ilike.%${q}%,location.ilike.%${q}%`);
  }
  if (f.location) {
    query = query.ilike('location', `%${escapeLikePattern(f.location)}%`);
  }
  if (f.rating > 0) {
    query = query.gte('rating', f.rating);
  }
  if (f.featuredOnly) {
    query = query.eq('is_featured', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((restaurant) => ({
    id: restaurant.id,
    type: 'restaurant' as const,
    title: restaurant.name,
    description: restaurant.description,
    location: restaurant.location,
    rating: restaurant.rating,
    price: restaurant.price_range,
    imageUrl: restaurant.image_url,
    slug: restaurant.slug,
  }));
}

async function searchAttractions(f: AdvancedSearchFilters): Promise<SearchResult[]> {
  let query = supabase.from('attractions').select(ATTRACTION_LIST_COLUMNS).limit(50);

  if (f.query) {
    const q = sanitizePostgrestPattern(f.query);
    query = query.or(`name.ilike.%${q}%,type.ilike.%${q}%,location.ilike.%${q}%`);
  }
  if (f.location) {
    query = query.ilike('location', `%${escapeLikePattern(f.location)}%`);
  }
  if (f.rating > 0) {
    query = query.gte('rating', f.rating);
  }
  if (f.featuredOnly) {
    query = query.eq('is_featured', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((attraction) => ({
    id: attraction.id,
    type: 'attraction' as const,
    title: attraction.name,
    description: attraction.description,
    location: attraction.location,
    rating: attraction.rating,
    imageUrl: attraction.image_url,
  }));
}

async function searchPlaygrounds(f: AdvancedSearchFilters): Promise<SearchResult[]> {
  let query = supabase.from('playgrounds').select(PLAYGROUND_LIST_COLUMNS).limit(50);

  if (f.query) {
    const q = sanitizePostgrestPattern(f.query);
    query = query.or(`name.ilike.%${q}%,location.ilike.%${q}%`);
  }
  if (f.location) {
    query = query.ilike('location', `%${escapeLikePattern(f.location)}%`);
  }
  if (f.rating > 0) {
    query = query.gte('rating', f.rating);
  }
  if (f.featuredOnly) {
    query = query.eq('is_featured', true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((playground) => ({
    id: playground.id,
    type: 'playground' as const,
    title: playground.name,
    description: playground.description,
    location: playground.location,
    rating: playground.rating,
    imageUrl: playground.image_url,
  }));
}

async function executeSearch(f: AdvancedSearchFilters): Promise<SearchResult[]> {
  const categories = f.category === 'All'
    ? ['Events', 'Restaurants', 'Attractions', 'Playgrounds']
    : [f.category];

  const results: SearchResult[] = [];
  for (const category of categories) {
    switch (category) {
      case 'Events':
        // Events have no rating column, so a minimum rating can't include them.
        if (f.rating === 0) results.push(...(await searchEvents(f)));
        break;
      case 'Restaurants':
        results.push(...(await searchRestaurants(f)));
        break;
      case 'Attractions':
        results.push(...(await searchAttractions(f)));
        break;
      case 'Playgrounds':
        results.push(...(await searchPlaygrounds(f)));
        break;
    }
  }

  // 'relevance' keeps each query's own order (events soonest first). There is
  // no relevance score to sort by, so it does not pretend to have one.
  return f.sortBy === 'rating'
    ? [...results].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    : results;
}

/** Cache key for a submitted search. Identical searches reuse the cache and
 *  concurrent identical ones dedupe. */
const searchQueryKey = (f: AdvancedSearchFilters | null) => ['advanced-search', f] as const;

export interface UseAdvancedSearchOptions {
  /** Seeds `filters.query`, from `?q=` on the page. */
  initialQuery?: string;
}

export function useAdvancedSearch({ initialQuery = '' }: UseAdvancedSearchOptions = {}) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<AdvancedSearchFilters>(() => ({
    ...DEFAULT_ADVANCED_FILTERS,
    query: initialQuery.trim(),
  }));
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  /** The filters of the most recently submitted search. This hook is imperative
   *  by design - consumers call performSearch(...) - so the query is keyed on
   *  what was submitted rather than on the live `filters` state (WEB-PERF-013). */
  const [submittedFilters, setSubmittedFilters] = useState<AdvancedSearchFilters | null>(null);
  const queryClient = useQueryClient();

  const loadSavedSearches = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('id, name, filters, search_type, created_at, last_used, use_count')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedSearches((data ?? []).map((row) => toSavedSearch(row as SavedSearchRow)));
    } catch (error) {
      handleError(error, { component: 'useAdvancedSearch', action: 'loadSavedSearches' });
      setSavedSearches([]);
    }
  }, [user]);

  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  const { data: results = EMPTY_RESULTS, isFetching: loading } = useQuery({
    queryKey: searchQueryKey(submittedFilters),
    queryFn: () => executeSearch(submittedFilters as AdvancedSearchFilters),
    enabled: submittedFilters !== null,
    staleTime: STALE_TIME.SHORT,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  const performSearch = useCallback(async (searchFilters: AdvancedSearchFilters) => {
    setSubmittedFilters(searchFilters);
    try {
      // fetchQuery shares the key above, so this both awaits the result for
      // callers that need it and primes the cache the useQuery above reads.
      return await queryClient.fetchQuery({
        queryKey: searchQueryKey(searchFilters),
        queryFn: () => executeSearch(searchFilters),
        staleTime: STALE_TIME.SHORT,
        gcTime: GC_TIME,
      });
    } catch (error) {
      handleError(error, { component: 'useAdvancedSearch', action: 'performSearch' });
      toast.error('Search failed. Please try again.');
      return [];
    }
  }, [queryClient]);

  const saveSearch = async (name: string, searchFilters: AdvancedSearchFilters) => {
    if (!user) {
      toast.error('Please sign in to save searches');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name,
          filters: toStoredFilters(searchFilters),
          use_count: 1,
        })
        .select('id, name, filters, search_type, created_at, last_used, use_count')
        .single();

      if (error) throw error;

      setSavedSearches((prev) => [toSavedSearch(data as SavedSearchRow), ...prev]);
      toast.success('Search saved');
    } catch (error) {
      handleError(error, { component: 'useAdvancedSearch', action: 'saveSearch' });
      toast.error('Could not save this search');
    }
  };

  /** Loads a row this page wrote. The page sends other rows to /search instead. */
  const loadSearch = async (search: SavedSearch) => {
    setFilters(search.filters);
    void performSearch(search.filters);
    try {
      const { error } = await supabase
        .from('saved_searches')
        .update({
          use_count: search.useCount + 1,
          last_used: new Date().toISOString(),
        })
        .eq('id', search.id);
      if (error) throw error;

      setSavedSearches((prev) =>
        prev.map((s) =>
          s.id === search.id ? { ...s, useCount: s.useCount + 1, lastUsed: new Date() } : s,
        ),
      );
    } catch (error) {
      // The search already ran; only the usage counter missed.
      handleError(error, { component: 'useAdvancedSearch', action: 'loadSearch' });
    }
  };

  const deleteSearch = async (searchId: string) => {
    try {
      const { error } = await supabase.from('saved_searches').delete().eq('id', searchId);
      if (error) throw error;

      setSavedSearches((prev) => prev.filter((s) => s.id !== searchId));
      toast.success('Search deleted');
    } catch (error) {
      handleError(error, { component: 'useAdvancedSearch', action: 'deleteSearch' });
      toast.error('Could not delete this search');
    }
  };

  const resetFilters = () => {
    setFilters(DEFAULT_ADVANCED_FILTERS);
    setSubmittedFilters(null);
  };

  return {
    filters,
    setFilters,
    results,
    savedSearches,
    loading,
    /** True once any search has been submitted; the page shows a prompt before that. */
    hasSearched: submittedFilters !== null,
    performSearch,
    saveSearch,
    loadSearch,
    deleteSearch,
    resetFilters,
  };
}
