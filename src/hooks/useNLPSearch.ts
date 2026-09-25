import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Event, Restaurant, Attraction } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('useNLPSearch');

/**
 * Parsed search intent from NLP processing
 */
export interface ParsedSearchIntent {
  contentTypes: ('events' | 'restaurants' | 'attractions')[];
  keywords: string[];
  category?: string;
  cuisine?: string;
  location?: string;
  neighborhood?: string;
  nearDowntown?: boolean;
  dateFilter?: 'today' | 'tomorrow' | 'this_weekend' | 'this_week' | 'next_week' | 'specific';
  specificDate?: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  priceRange?: 'free' | 'cheap' | 'moderate' | 'expensive' | 'any';
  maxBudget?: number;
  familyFriendly?: boolean;
  kidFriendly?: boolean;
  dateFriendly?: boolean;
  groupFriendly?: boolean;
  petFriendly?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  parking?: boolean;
  dietary?: string[];
  sortBy?: 'relevance' | 'date' | 'rating' | 'price' | 'distance';
  confidence: number;
  originalQuery: string;
}

/**
 * NLP Search results
 */
export interface NLPSearchResults {
  events: Event[];
  restaurants: Restaurant[];
  attractions: Attraction[];
}

/**
 * NLP Search response
 */
export interface NLPSearchResponse {
  success: boolean;
  query: string;
  parsedIntent: ParsedSearchIntent;
  results: NLPSearchResults;
  metadata: {
    totalResults: number;
    responseTimeMs: number;
    modelUsed: string;
  };
  error?: string;
}

/**
 * Example queries for the hero box and the bare /search page (home-pass2 WP1
 * item 6).
 *
 * Each one uses only facets nlp-search turns into SQL (when, free, area,
 * cuisine, category, kid-friendly, content type; supabase/functions/nlp-search/
 * search.ts). The old list offered "under $50", "near me", "dog-friendly",
 * "outdoor seating", "romantic" and "tomorrow afternoon", none of which the
 * planner applies, so an example promised a filter and returned the unfiltered
 * list. src/hooks/__tests__/nlpSearchExamples.test.ts fails on those phrases.
 */
export const NLP_SEARCH_EXAMPLES = [
  "Free things to do this weekend with kids",
  "Tacos in East Village",
  "Kid-friendly attractions",
  "Comedy this weekend",
  "Concerts tonight",
  "Italian restaurants in West Des Moines",
  "Art events this week",
  "Free attractions",
  "Things to do tomorrow",
  "Sports events this weekend",
];

type Daypart = 'morning' | 'afternoon' | 'evening' | 'late';

/** When each example is worth offering first. Untagged examples keep their place after the tagged ones. */
const EXAMPLE_DAYPARTS: Record<string, Daypart[]> = {
  "Free things to do this weekend with kids": ['morning', 'afternoon'],
  "Kid-friendly attractions": ['morning', 'afternoon'],
  "Free attractions": ['morning'],
  "Tacos in East Village": ['afternoon', 'evening'],
  "Italian restaurants in West Des Moines": ['afternoon', 'evening'],
  "Concerts tonight": ['evening'],
  "Comedy this weekend": ['evening', 'late'],
  "Things to do tomorrow": ['late'],
};

/** Exported for the examples test: every tagged example must be in the list. */
export const NLP_EXAMPLE_DAYPARTS: Readonly<Record<string, readonly Daypart[]>> = EXAMPLE_DAYPARTS;

export function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 21) return 'evening';
  return 'late';
}

/**
 * Example chips ordered for the hour (WP1 item 7). A kids' outing at 10pm and
 * "Concerts tonight" at 8am both read as a page that is not paying
 * attention. Pass the CENTRAL hour: the examples describe Des Moines time, not
 * the visitor's clock. Stable: ties keep the list's own order.
 */
export function orderExamplesForHour(
  hour: number,
  examples: readonly string[] = NLP_SEARCH_EXAMPLES,
): string[] {
  const part = daypartForHour(hour);
  const rank = (example: string) => (EXAMPLE_DAYPARTS[example]?.includes(part) ? 0 : 1);
  return examples
    .map((example, index) => ({ example, index }))
    .sort((a, b) => rank(a.example) - rank(b.example) || a.index - b.index)
    .map(({ example }) => example);
}

/** Phrases that narrow a query without changing what it is about. */
const NARROWING = [
  /\bunder\s+\$?\d+\b/gi,
  /\$\d+/g,
  /\b(this|next)\s+(weekend|week)\b/gi,
  /\b(tonight|today|tomorrow|weekend)\b/gi,
  /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/gi,
  /\b(morning|afternoon|evening)\b/gi,
  /\bnear\s+(me|downtown)\b/gi,
  /\bwith\s+(kids|outdoor\s+seating)\b/gi,
  // "in East Village", "near Valley Junction": a capitalised place name.
  /\b(in|near|around)\s+[A-Z][\w'-]*(\s+[A-Z][\w'-]*)*/g,
];

const TRAILING_FILLER = /\s+(in|at|near|for|with|the|a|an|and|on|around)$/i;

/**
 * One broader query to offer when a search comes back empty (WP1 item 7), or
 * null when there is nothing sensible to loosen. Strips dates, budgets and
 * place qualifiers first; failing that, drops the last word.
 */
export function loosenQuery(query: string): string | null {
  const original = query.trim().replace(/\s+/g, ' ');
  if (!original) return null;

  const tidy = (s: string) => {
    let out = s.replace(/\s+/g, ' ').trim();
    while (TRAILING_FILLER.test(out)) out = out.replace(TRAILING_FILLER, '');
    return out;
  };

  let loosened = tidy(NARROWING.reduce((s, re) => s.replace(re, ' '), original));
  if (loosened.toLowerCase() === original.toLowerCase() || loosened.length < 3) {
    const words = original.split(' ');
    if (words.length < 2) return null;
    loosened = tidy(words.slice(0, -1).join(' '));
  }

  if (loosened.length < 3 || loosened.toLowerCase() === original.toLowerCase()) return null;
  return loosened;
}

/**
 * Hook for natural language search powered by Claude Haiku
 *
 * @example
 * const { search, results, parsedIntent, isSearching, error } = useNLPSearch();
 *
 * // Perform a search
 * await search("Free things to do this weekend with kids");
 *
 * // Access results
 * console.log(results.events, results.restaurants, results.attractions);
 * console.log(parsedIntent.dateFilter); // "this_weekend"
 */
export function useNLPSearch() {
  const [parsedIntent, setParsedIntent] = useState<ParsedSearchIntent | null>(null);
  const [results, setResults] = useState<NLPSearchResults>({
    events: [],
    restaurants: [],
    attractions: [],
  });
  const [lastQuery, setLastQuery] = useState<string>('');
  const [responseTime, setResponseTime] = useState<number>(0);

  const searchMutation = useMutation({
    mutationFn: async ({
      query,
      contentTypes,
    }: {
      query: string;
      contentTypes?: ('events' | 'restaurants' | 'attractions')[];
    }): Promise<NLPSearchResponse> => {
      const { data, error } = await supabase.functions.invoke('nlp-search', {
        body: { query, contentTypes },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data as NLPSearchResponse;
    },
    onSuccess: (data) => {
      setParsedIntent(data.parsedIntent);
      setResults(data.results);
      setLastQuery(data.query);
      setResponseTime(data.metadata.responseTimeMs);
    },
    onError: (error) => {
      log.warn('search', 'nlp-search failed', { error: String(error) });
      setParsedIntent(null);
      setResults({ events: [], restaurants: [], attractions: [] });
    },
  });

  /**
   * Perform an NLP-powered search.
   *
   * Resolves with the response, or with null when the search failed. It does
   * NOT reject, and that is the point (WEB-QA-027).
   *
   * mutateAsync rejects on failure, and all three callers - SearchResults'
   * effect on the URL query, and both entry points in NLPSearchBar - call this
   * without awaiting or catching. So an unreachable nlp-search function
   * produced an UNHANDLED PROMISE REJECTION on every attempt, while the page
   * itself handled the failure correctly and rendered its keyword fallback.
   *
   * That is not cosmetic on mobile. main.tsx installs an unhandledrejection
   * handler that calls showErrorOverlay, and showErrorOverlay returns early
   * only when `!isCapacitor && import.meta.env.PROD` - so inside the shipped
   * iOS and Android apps a failed search covers the screen with a full-page
   * black "Runtime Error" overlay, on top of a page that was coping fine.
   * Reproduced 2026-09-09 against a dev server with an unreachable Supabase:
   * five stacked overlays for one search.
   *
   * onError below already clears state, so there is nothing left for a caller
   * to do with the rejection; `isError` and `error` remain on the returned
   * object for the ones that want to render it.
   *
   * WEB-QA-033: the dependency is `mutateAsync`, NOT `searchMutation`.
   * useMutation returns a NEW object on every render, so depending on the
   * whole thing gave `search` a new identity every render - and SearchResults
   * runs `search(query)` from an effect keyed on it. That is a loop: search ->
   * state change -> re-render -> new identity -> effect re-runs -> search.
   * MEASURED on /search?q=pizza: 82 calls to the nlp-search edge function in
   * 16 seconds, each one an AI request, against a function that allows 30 per
   * minute (nlp-search/index.ts). mutateAsync is referentially stable, which
   * breaks it.
   */
  // Referentially stable across renders, unlike `searchMutation` itself.
  const { mutateAsync } = searchMutation;

  const search = useCallback(
    async (
      query: string,
      contentTypes?: ('events' | 'restaurants' | 'attractions')[]
    ): Promise<NLPSearchResponse | null> => {
      if (!query || query.trim().length < 3) {
        return null;
      }
      return mutateAsync({ query: query.trim(), contentTypes }).catch(() => null);
    },
    [mutateAsync]
  );

  /**
   * Clear search results
   */
  const clearResults = useCallback(() => {
    setParsedIntent(null);
    setResults({ events: [], restaurants: [], attractions: [] });
    setLastQuery('');
    setResponseTime(0);
  }, []);

  /**
   * Get a human-readable summary of the parsed intent
   */
  const getIntentSummary = useCallback((): string => {
    if (!parsedIntent) return '';

    const parts: string[] = [];

    // Content types
    if (parsedIntent.contentTypes.length < 3) {
      parts.push(`Looking for ${parsedIntent.contentTypes.join(' and ')}`);
    }

    // Date filter
    if (parsedIntent.dateFilter) {
      const dateLabels: Record<string, string> = {
        today: 'today',
        tomorrow: 'tomorrow',
        this_weekend: 'this weekend',
        this_week: 'this week',
        next_week: 'next week',
      };
      if (dateLabels[parsedIntent.dateFilter]) {
        parts.push(dateLabels[parsedIntent.dateFilter]);
      }
    }

    // Price
    if (parsedIntent.priceRange && parsedIntent.priceRange !== 'any') {
      parts.push(parsedIntent.priceRange === 'free' ? 'free' : `${parsedIntent.priceRange} budget`);
    }

    // Location
    if (parsedIntent.neighborhood) {
      parts.push(`in ${parsedIntent.neighborhood}`);
    } else if (parsedIntent.location) {
      parts.push(`near ${parsedIntent.location}`);
    } else if (parsedIntent.nearDowntown) {
      parts.push('near downtown');
    }

    // Audience
    if (parsedIntent.kidFriendly) parts.push('kid-friendly');
    if (parsedIntent.familyFriendly) parts.push('family-friendly');
    if (parsedIntent.dateFriendly) parts.push('date-worthy');
    if (parsedIntent.petFriendly) parts.push('pet-friendly');

    // Category/Cuisine
    if (parsedIntent.category) parts.push(parsedIntent.category);
    if (parsedIntent.cuisine) parts.push(`${parsedIntent.cuisine} cuisine`);

    return parts.join(', ');
  }, [parsedIntent]);

  /**
   * Check if results are available
   */
  const hasResults = results.events.length > 0 ||
                     results.restaurants.length > 0 ||
                     results.attractions.length > 0;

  /**
   * Get total result count
   */
  const totalResults = results.events.length +
                       results.restaurants.length +
                       results.attractions.length;

  return {
    // Actions
    search,
    clearResults,

    // State
    results,
    parsedIntent,
    lastQuery,
    responseTime,
    hasResults,
    totalResults,

    // Loading/Error states
    isSearching: searchMutation.isPending,
    error: searchMutation.error,
    isError: searchMutation.isError,

    // Helpers
    getIntentSummary,

    // Example queries for UI
    examples: NLP_SEARCH_EXAMPLES,
  };
}

