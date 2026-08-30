import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useFeatureFlag');

interface FeatureFlagRow {
  flag_key: string;
  enabled: boolean;
  description: string | null;
  target_tiers: string[];
}

/**
 * Default flag values used when the feature_flags table query fails.
 * Ensures graceful degradation if the table hasn't been migrated yet.
 */
const DEFAULT_FLAGS: Record<string, boolean> = {
  search_traffic_dashboard: true,
  ai_trip_planner_v2: false,
  mobile_app_banner: false,
  media_library: true,
  conversion_funnel: true,
  audit_log: true,
};

async function fetchFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('flag_key, enabled, description, target_tiers');

  if (error) {
    // Table may not exist yet — log and return empty so defaults kick in
    log.info('fetchFlags', 'Using default flags', { error: error.message });
    return [];
  }
  return (data ?? []) as unknown as FeatureFlagRow[];
}

/**
 * Hook to check if a feature flag is enabled.
 *
 * Fetches all flags once and caches for 5 minutes.
 * Falls back to DEFAULT_FLAGS when the database table isn't available.
 *
 * @example
 * const { enabled } = useFeatureFlag('ai_trip_planner_v2');
 * if (!enabled) return null;
 * return <NewFeature />;
 */
export function useFeatureFlag(flagKey: string): { enabled: boolean; isLoading: boolean } {
  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const flag = flags?.find((f) => f.flag_key === flagKey);

  // Server flag takes precedence, then fall back to defaults
  const enabled = flag ? flag.enabled : (DEFAULT_FLAGS[flagKey] ?? false);

  return { enabled, isLoading };
}

/**
 * Hook to fetch all feature flags at once.
 *
 * Useful for admin dashboards that need to display/edit all flags.
 */
export function useFeatureFlags(): { flags: FeatureFlagRow[]; isLoading: boolean } {
  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFlags,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    flags: flags ?? [],
    isLoading,
  };
}
