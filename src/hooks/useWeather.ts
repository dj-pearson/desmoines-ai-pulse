/**
 * Current Des Moines weather, for weather-aware recommendations (WEB-FEAT-022).
 *
 * The indoor/outdoor verdict is NOT computed here. The `weather` edge function
 * owns it (supabase/functions/_shared/weatherPolicy.ts) so that web, iOS and
 * Android cannot drift into disagreeing about whether it is a nice day. This
 * hook fetches and caches; it does not decide.
 *
 * FAILING OPEN IS THE CONTRACT. The edge function answers 200 with
 * `available: false` rather than an error status, and every failure here
 * resolves to UNAVAILABLE instead of throwing. A caller must be able to render
 * its normal, unweighted list when the weather is unknown - never an error
 * state, never an empty one.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WeatherSnapshot {
  available: boolean;
  observedAt: string | null;
  temperatureF: number | null;
  feelsLikeF: number | null;
  precipitationProbabilityPct: number | null;
  shortForecast: string | null;
  isDaytime: boolean | null;
  /**
   * Three states, and the third one matters: `null` means unknown, which is
   * NOT the same as "not outdoor friendly". Callers must treat null as "do not
   * reorder" rather than as false.
   */
  outdoorFriendly: boolean | null;
  /** One sentence, written for the user. Safe to render directly. */
  reason: string;
  effectiveTemperatureF: number | null;
}

export const WEATHER_UNAVAILABLE: WeatherSnapshot = {
  available: false,
  observedAt: null,
  temperatureF: null,
  feelsLikeF: null,
  precipitationProbabilityPct: null,
  shortForecast: null,
  isDaytime: null,
  outdoorFriendly: null,
  reason: 'Weather is unavailable right now.',
  effectiveTemperatureF: null,
};

/**
 * Matches the edge function's own 30-minute cache. Refetching more often than
 * the upstream changes would just spend requests to get the same answer.
 */
const STALE_TIME_MS = 15 * 60 * 1000;

async function fetchWeather(): Promise<WeatherSnapshot> {
  const { data, error } = await supabase.functions.invoke('weather');

  // Deliberately not routed through handleError: a weather miss is an expected
  // degradation, not an incident, and it must not surface a toast on the
  // homepage. The DEV log is enough to notice it while working.
  if (error) {
    if (import.meta.env.DEV) {
      console.warn('useWeather: edge function unreachable', error);
    }
    return WEATHER_UNAVAILABLE;
  }
  if (!data || typeof data !== 'object') return WEATHER_UNAVAILABLE;

  const snapshot = data as Partial<WeatherSnapshot>;
  if (!snapshot.available) return WEATHER_UNAVAILABLE;

  return {
    ...WEATHER_UNAVAILABLE,
    ...snapshot,
    available: true,
    reason: snapshot.reason ?? WEATHER_UNAVAILABLE.reason,
  };
}

export function useWeather() {
  const query = useQuery({
    queryKey: ['weather', 'des-moines'],
    queryFn: fetchWeather,
    staleTime: STALE_TIME_MS,
    gcTime: 60 * 60 * 1000,
    // One retry only. If weather is down, the page should settle into its
    // normal ordering quickly rather than hold a spinner.
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const weather = query.data ?? WEATHER_UNAVAILABLE;

  return {
    weather,
    isLoading: query.isLoading,
    /**
     * True only when we have a usable verdict. Callers gate the reorder AND the
     * explanation line on this, so an unknown never produces a reason banner
     * with nothing behind it.
     */
    hasVerdict: weather.available && weather.outdoorFriendly !== null,
  };
}

/**
 * Stable reorder that moves the weather-appropriate items first.
 *
 * Mirrors `reorderByOutdoorPreference` in the edge function's shared policy.
 * It is duplicated rather than imported because the two live in different
 * module systems (Deno URL imports vs Vite), which is the existing convention
 * in this repo; the Deno copy carries the tests.
 *
 * Two invariants: nothing is filtered out, so a reorder can never empty a
 * list, and an item with an unknown classification keeps its place ahead of a
 * known mismatch rather than being buried.
 */
export function reorderForWeather<T>(
  items: readonly T[],
  isIndoor: (item: T) => boolean | null | undefined,
  weather: WeatherSnapshot,
): T[] {
  if (!weather.available || weather.outdoorFriendly === null) return [...items];
  const preferIndoor = weather.outdoorFriendly === false;

  const rank = (item: T): number => {
    const value = isIndoor(item);
    if (value === null || value === undefined) return 1;
    return value === preferIndoor ? 0 : 2;
  };

  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
