import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { ErrorSeverity, handleError } from '@/lib/errorHandler';
import { applyEventVisibility } from '@/lib/eventQuery';
import { escapeLikePattern } from '@/lib/postgrestPattern';
import { searchResultHref } from '@/lib/searchResultHref';
import { upcomingFloorUtc } from '@/lib/timezone';

/**
 * Named-place typeahead for the hero search box (home-pass2 WP1 item 8).
 *
 * Type "Hoyt" and the box offers the Hoyt Sherman Place page itself, with no
 * model call and no trip through /search. The rules are SearchAutocomplete's
 * (src/components/SearchAutocomplete.tsx), copied rather than shared because
 * that file belongs to the Search plan; the hand-off is for it to switch to
 * this hook:
 *
 * - events: the visibility predicate (applyEventVisibility) and the upcoming
 *   floor (start of today, Central), soonest first;
 * - restaurants: rows merged into a duplicate are left out (WEB-AUTO-005);
 * - attractions: only `is_active` rows, as /attractions lists;
 * - `%` and `_` typed by the visitor are literal (escapeLikePattern);
 * - 5 rows per type, three requests in parallel.
 *
 * Nothing fires below MIN_CHARS or before the 300ms debounce settles, so the
 * first view of `/` makes no request here.
 */

export const MIN_CHARS = 3;
export const DEBOUNCE_MS = 300;
const ROWS_PER_TYPE = 5;

export type EntityType = 'events' | 'restaurants' | 'attractions';

export interface EntitySuggestion {
  id: string;
  type: EntityType;
  title: string;
  /** Venue, cuisine or attraction type. */
  subtitle: string | null;
  href: string;
}

export interface EntitySuggestions {
  events: EntitySuggestion[];
  restaurants: EntitySuggestion[];
  attractions: EntitySuggestion[];
}

const EMPTY: EntitySuggestions = { events: [], restaurants: [], attractions: [] };

/** Exported for tests. Throws the first PostgREST error rather than hiding it as "no matches". */
export async function fetchEntitySuggestions(term: string): Promise<EntitySuggestions> {
  const escaped = escapeLikePattern(term.trim());
  if (escaped.length < MIN_CHARS) return EMPTY;
  const pattern = `%${escaped}%`;

  const [events, restaurants, attractions] = await Promise.all([
    applyEventVisibility(
      supabase.from('events').select('id, title, venue, date, event_start_utc, event_start_local'),
    )
      .ilike('title', pattern)
      .gte('date', upcomingFloorUtc())
      .order('date', { ascending: true })
      .limit(ROWS_PER_TYPE),
    supabase
      .from('restaurants')
      .select('id, name, cuisine, slug')
      .ilike('name', pattern)
      .neq('is_merged', true)
      .limit(ROWS_PER_TYPE),
    supabase
      .from('attractions')
      .select('id, name, type')
      .ilike('name', pattern)
      .eq('is_active', true)
      .limit(ROWS_PER_TYPE),
  ]);

  const failure = events.error ?? restaurants.error ?? attractions.error;
  if (failure) throw failure;

  return {
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      type: 'events',
      title: e.title,
      subtitle: e.venue ?? null,
      href: searchResultHref(e, 'events'),
    })),
    restaurants: (restaurants.data ?? []).map((r) => ({
      id: r.id,
      type: 'restaurants',
      title: r.name,
      subtitle: r.cuisine ?? null,
      href: searchResultHref(r, 'restaurants'),
    })),
    attractions: (attractions.data ?? []).map((a) => ({
      id: a.id,
      type: 'attractions',
      title: a.name,
      subtitle: a.type ?? null,
      href: searchResultHref(a, 'attractions'),
    })),
  };
}

export interface UseEntitySuggestionsResult {
  suggestions: EntitySuggestions;
  /** The debounced term the suggestions belong to. */
  term: string;
  isFetching: boolean;
  isError: boolean;
}

export function useEntitySuggestions(rawTerm: string): UseEntitySuggestionsResult {
  const term = useDebounce(rawTerm.trim(), DEBOUNCE_MS);
  const enabled = term.length >= MIN_CHARS;

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['entity-suggestions', term.toLowerCase()],
    queryFn: () => fetchEntitySuggestions(term),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });

  // A warning, not a toast: the panel still offers "Search everything", which
  // is the same answer a visitor gets when nothing matches.
  useEffect(() => {
    if (error) handleError(error, { component: 'useEntitySuggestions', action: 'fetch' }, ErrorSeverity.WARNING);
  }, [error]);

  return {
    suggestions: enabled && data ? data : EMPTY,
    term,
    isFetching: enabled && isFetching,
    isError: enabled && isError,
  };
}
