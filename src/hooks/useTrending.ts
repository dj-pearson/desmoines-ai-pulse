import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, GC_TIME, shouldRetry } from '@/lib/queryConfig';
import { supabase } from '@/integrations/supabase/client';
import {
  EVENT_LIST_COLUMNS,
  RESTAURANT_LIST_COLUMNS,
  ATTRACTION_LIST_COLUMNS,
  PLAYGROUND_LIST_COLUMNS,
} from '@/lib/listColumns';
import { createLogger } from '@/lib/logger';
import { applyEventVisibility } from '@/lib/eventQuery';
import { CENTRAL_TIMEZONE } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';

const logger = createLogger('useTrending');

export type TrendingContentType = 'event' | 'restaurant' | 'attraction' | 'playground';

const ALL_TYPES: TrendingContentType[] = ['event', 'restaurant', 'attraction', 'playground'];

interface TrendingItem {
  id: string;
  contentType: TrendingContentType;
  contentId: string;
  score: number;
  rank: number;
  // OPTIONAL BECAUSE THEY ARE NOT ALWAYS KNOWN. The fallback path below has
  // no view data of any kind, and these used to be filled with numbers derived
  // from the item's position in a featured list - 50, 42, 34 "views today" for
  // items nobody had measured. The only thing keeping them off the screen was
  // one `hasRealData &&` in MostSearched.tsx, which is a convention, not a
  // guarantee: any future consumer that forgot it would ship invented social
  // proof. Undefined renders as nothing; a plausible number renders as a fact.
  views24h?: number;
  views7d?: number;
  velocityScore?: number;
  content?: Record<string, unknown>; // The actual content data
}

interface TrendingData {
  events: TrendingItem[];
  restaurants: TrendingItem[];
  attractions: TrendingItem[];
  playgrounds: TrendingItem[];
}

interface FallbackConfig {
  useRealData?: boolean;
  minItemsRequired?: number;
  fallbackSeed?: number; // For consistent "fake" trending
  /**
   * Which content types to read. MostSearched renders no events, and the two
   * events reads were the largest responses in the fallback (WP9 of
   * docs/page-plans/home.md). Defaults to all four.
   */
  types?: TrendingContentType[];
  /**
   * Read trending_scores. Its only SELECT policy is "Admins can view trending
   * scores" (docs/RLS_AUDIT.md:607), so for everyone else the read is a wasted
   * request that always comes back empty. Callers pass useAuth().isAdmin.
   * Defaults to false (home pass-2 WP3 item 4).
   */
  readScores?: boolean;
}

const DEFAULT_CONFIG = { useRealData: true, minItemsRequired: 3, fallbackSeed: 42, readScores: false };

/** Only the trending_scores columns this hook reads. */
const TRENDING_SCORE_COLUMNS =
  'id, content_type, content_id, score, rank, views_24h, views_7d, velocity_score';

/** Restaurant statuses that mean "you cannot eat here now". */
const NOT_SERVING = '(closed,permanently_closed,temporarily_closed)';

/**
 * The organic floor for the fallback columns. Not a claim that these are the
 * best places in town: the column is titled "Highly rated" and shows the
 * rating it was chosen by.
 */
export const HIGHLY_RATED_MIN = 4.0;

const EMPTY_TRENDING: TrendingData = {
  events: [],
  restaurants: [],
  attractions: [],
  playgrounds: []
};

/** What the trending query resolves to. */
interface TrendingQueryResult {
  trending: TrendingData;
  hasRealData: boolean;
}

export function useTrending(options: FallbackConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const types = [...(options.types ?? ALL_TYPES)].sort();
  const wants = (type: TrendingContentType) => types.includes(type);

  // queryFn stays an inline closure because the helpers below (enrich/fallback/
  // group) are defined in hook scope; hoisting them out would be a much larger
  // change for no behavioural gain (WEB-PERF-013).
  const fetchTrendingData = async (): Promise<TrendingQueryResult> => {
    try {
      if (config.useRealData && config.readScores) {
        // The scores are written per Central day; a UTC date read the next
        // day's (empty) rows every evening after 7pm Central.
        const { data: trendingScores, error: scoresError } = await supabase
          .from('trending_scores')
          .select(TRENDING_SCORE_COLUMNS)
          .eq('date', formatInTimeZone(new Date(), CENTRAL_TIMEZONE, 'yyyy-MM-dd'))
          .in('content_type', types)
          .order('rank')
          .limit(10);

        if (scoresError) {
          // Falling back is right; doing it silently is not. An unreadable
          // trending_scores and an empty one both land here, and only one of
          // them is a problem somebody should know about.
          logger.error('fetchTrendingData', 'Could not read trending scores', { error: scoresError });
        }

        if (trendingScores && trendingScores.length > 0) {
          // We have real data! Fetch the actual content
          const enrichedTrending = await enrichTrendingWithContent(trendingScores);
          
          const groupedTrending = groupTrendingByType(enrichedTrending);
          
          // Check if we have enough data
          const totalItems = Object.values(groupedTrending).reduce((sum, items) => sum + items.length, 0);
          
          if (totalItems >= config.minItemsRequired) {
            return { trending: groupedTrending, hasRealData: true };
          }
        }
      }

      // Fallback: organic reads (upcoming events, highly rated places)
      return { trending: await generateFallbackTrending(), hasRealData: false };
    } catch (error) {
      // Trending is a nice-to-have surface: fall back rather than surfacing an
      // error state, but keep the reason visible in dev.
      logger.error('fetchTrendingData', 'Error fetching trending data', { error: String(error) });
      return { trending: await generateFallbackTrending(), hasRealData: false };
    }
  };

  const enrichTrendingWithContent = async (trendingScores: Array<Record<string, unknown>>) => {
    // Batch content lookups: one query per content type via .in('id', ids)
    // instead of a per-item awaited query (WEB-PERF-012).
    const idsByType: Record<string, string[]> = {
      event: [],
      restaurant: [],
      attraction: [],
      playground: [],
    };

    for (const score of trendingScores) {
      const type = score.content_type as string;
      const id = score.content_id as string;
      if (idsByType[type] && id) {
        idsByType[type].push(id);
      }
    }

    // A map keyed by `${type}:${id}` so results can be re-associated in order.
    const contentByKey = new Map<string, Record<string, unknown>>();

    try {
      const [eventsRes, restaurantsRes, attractionsRes, playgroundsRes] = await Promise.all([
        idsByType.event.length
          ? applyEventVisibility(
              supabase.from('events').select(EVENT_LIST_COLUMNS).in('id', idsByType.event),
            )
          : null,
        idsByType.restaurant.length
          ? supabase
              .from('restaurants')
              .select(RESTAURANT_LIST_COLUMNS)
              .in('id', idsByType.restaurant)
              .neq('is_merged', true)
          : null,
        idsByType.attraction.length
          ? supabase
              .from('attractions')
              .select(ATTRACTION_LIST_COLUMNS)
              .in('id', idsByType.attraction)
              .eq('is_active', true)
          : null,
        idsByType.playground.length
          ? supabase.from('playgrounds').select(PLAYGROUND_LIST_COLUMNS).in('id', idsByType.playground)
          : null,
      ]);

      const collect = (type: string, rows: unknown) => {
        for (const row of (rows as Array<Record<string, unknown>>) || []) {
          contentByKey.set(`${type}:${row.id}`, row);
        }
      };

      collect('event', eventsRes?.data);
      collect('restaurant', restaurantsRes?.data);
      collect('attraction', attractionsRes?.data);
      collect('playground', playgroundsRes?.data);
    } catch (error) {
      logger.error('enrichTrendingWithContent', 'Error batch-fetching trending content', { error: String(error) });
    }

    // Re-associate content in the original trending order.
    const enriched = [];
    for (const score of trendingScores) {
      const content = contentByKey.get(`${score.content_type}:${score.content_id}`);
      if (content) {
        enriched.push({
          id: score.id,
          contentType: score.content_type,
          contentId: score.content_id,
          score: score.score,
          rank: score.rank,
          views24h: score.views_24h,
          views7d: score.views_7d,
          velocityScore: score.velocity_score,
          content
        });
      }
    }

    return enriched;
  };

  const generateFallbackTrending = async (): Promise<TrendingData> => {
    // No view data on this path; see the TrendingItem comment.
    const fallback: TrendingData = {
      events: [],
      restaurants: [],
      attractions: [],
      playgrounds: []
    };

    try {
      // ORGANIC READS ONLY (home pass-2 WP3 item 2). This used to read
      // is_featured rows for every type and title them "Featured". Since
      // 20260902000004 a featured restaurant or event is a sponsored one or an
      // admin pick, so the column was paid placement under an editorial label.
      // Now: upcoming visible events by date, and places rated
      // HIGHLY_RATED_MIN or better (restaurants not merged and not closed,
      // attractions active). A sponsored row can still qualify on its rating;
      // the caller labels it and caps it at one per column.
      //
      // All reads use the list projections (WEB-PERF-025/035), run in
      // parallel, and a type the caller did not ask for is not read at all.
      const skip = Promise.resolve({ data: null, error: null });
      const [
        { data: recentEvents, error: recentEventsError },
        { data: restaurants, error: restaurantsError },
        { data: attractions, error: attractionsError },
        { data: playgrounds, error: playgroundsError },
      ] = await Promise.all([
        wants('event')
          ? applyEventVisibility(
              supabase.from('events').select(EVENT_LIST_COLUMNS).gte('date', new Date().toISOString()),
            )
              .order('date')
              .limit(6)
          : skip,
        wants('restaurant')
          ? supabase
              .from('restaurants')
              .select(RESTAURANT_LIST_COLUMNS)
              .gte('rating', HIGHLY_RATED_MIN)
              .neq('is_merged', true)
              // Keeps rows with no status; a bare .not('status','in',...)
              // would drop them.
              .or(`status.is.null,status.not.in.${NOT_SERVING}`)
              .order('rating', { ascending: false })
              .order('name')
              .limit(4)
          : skip,
        wants('attraction')
          ? supabase
              .from('attractions')
              .select(ATTRACTION_LIST_COLUMNS)
              .gte('rating', HIGHLY_RATED_MIN)
              .eq('is_active', true)
              .order('rating', { ascending: false })
              .order('name')
              .limit(4)
          : skip,
        wants('playground')
          ? supabase
              .from('playgrounds')
              .select(PLAYGROUND_LIST_COLUMNS)
              .gte('rating', HIGHLY_RATED_MIN)
              .order('rating', { ascending: false })
              .order('name')
              .limit(4)
          : skip,
      ]);

      // Position-based scores: an ordering key for this list, not a measurement.
      fallback.events = (recentEvents || []).slice(0, 6).map((event, index) => ({
        id: `fallback-event-${event.id}`,
        contentType: 'event' as const,
        contentId: event.id,
        score: 100 - (index * 15), // Decreasing scores
        rank: index + 1,
        // No view data exists on this path - see the TrendingItem comment.
        views24h: undefined,
        views7d: undefined,
        velocityScore: undefined,
        content: event
      }));

      // Restaurants, attractions and playgrounds: highly rated rows.
      fallback.restaurants = (restaurants || []).map((restaurant, index) => ({
        id: `fallback-restaurant-${restaurant.id}`,
        contentType: 'restaurant' as const,
        contentId: restaurant.id,
        score: 80 - (index * 12),
        rank: index + 1,
        // No view data exists on this path - see the TrendingItem comment.
        views24h: undefined,
        views7d: undefined,
        velocityScore: undefined,
        content: restaurant
      }));

      fallback.attractions = (attractions || []).map((attraction, index) => ({
        id: `fallback-attraction-${attraction.id}`,
        contentType: 'attraction' as const,
        contentId: attraction.id,
        score: 70 - (index * 10),
        rank: index + 1,
        // No view data exists on this path - see the TrendingItem comment.
        views24h: undefined,
        views7d: undefined,
        velocityScore: undefined,
        content: attraction
      }));

      fallback.playgrounds = (playgrounds || []).map((playground, index) => ({
        id: `fallback-playground-${playground.id}`,
        contentType: 'playground' as const,
        contentId: playground.id,
        score: 60 - (index * 8),
        rank: index + 1,
        // No view data exists on this path - see the TrendingItem comment.
        views24h: undefined,
        views7d: undefined,
        velocityScore: undefined,
        content: playground
      }));

      // The fallback is itself a set of reads, and each one silently discarded
      // its error. A trending section that is empty because five queries failed
      // and one that is empty because nothing qualifies render identically.
      const fallbackErrors = [
        recentEventsError && `recent events: ${recentEventsError.message}`,
        restaurantsError && `restaurants: ${restaurantsError.message}`,
        attractionsError && `attractions: ${attractionsError.message}`,
        playgroundsError && `playgrounds: ${playgroundsError.message}`,
      ].filter(Boolean);
      if (fallbackErrors.length > 0) {
        logger.error('generateFallbackTrending', 'Some fallback reads failed', { fallbackErrors });
      }
    } catch (error) {
      logger.error('generateFallbackTrending', 'Error generating fallback trending', { error });
    }

    return fallback;
  };

  const groupTrendingByType = (trendingItems: TrendingItem[]): TrendingData => {
    return trendingItems.reduce((acc, item) => {
      acc[`${item.contentType}s` as keyof TrendingData].push(item);
      return acc;
    }, {
      events: [],
      restaurants: [],
      attractions: [],
      playgrounds: []
    } as TrendingData);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      'trending',
      config.useRealData,
      config.readScores,
      config.minItemsRequired,
      config.fallbackSeed,
      types.join(','),
    ],
    queryFn: fetchTrendingData,
    // Trending is a fast-moving signal, but not per-request fresh.
    staleTime: STALE_TIME.SHORT,
    gcTime: GC_TIME,
    retry: shouldRetry,
  });

  // Public shape preserved exactly for existing consumers.
  return {
    trending: data?.trending ?? EMPTY_TRENDING,
    isLoading,
    hasRealData: data?.hasRealData ?? false,
    refetch
  };
}