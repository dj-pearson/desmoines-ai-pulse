import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface FeatureFlagRow {
  flag_key: string;
  enabled: boolean;
  description: string | null;
  target_tiers: string[];
}

/**
 * Hook to check if a feature flag is enabled.
 *
 * Fetches all flags once and caches for 5 minutes.
 * Returns `{ enabled: false, isLoading: true }` while loading.
 *
 * @example
 * const { enabled } = useFeatureFlag('ai_trip_planner_v2');
 * if (!enabled) return null;
 * return <NewFeature />;
 */
export function useFeatureFlag(flagKey: string): { enabled: boolean; isLoading: boolean } {
  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: async (): Promise<FeatureFlagRow[]> => {
      const { data, error } = await supabase
        .from('feature_flags' as string)
        .select('flag_key, enabled, description, target_tiers');

      if (error) throw error;
      return (data ?? []) as unknown as FeatureFlagRow[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const flag = flags?.find((f) => f.flag_key === flagKey);

  return {
    enabled: flag?.enabled ?? false,
    isLoading,
  };
}

/**
 * Hook to fetch all feature flags at once.
 *
 * Useful for admin dashboards that need to display/edit all flags.
 */
export function useFeatureFlags(): { flags: FeatureFlagRow[]; isLoading: boolean } {
  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: async (): Promise<FeatureFlagRow[]> => {
      const { data, error } = await supabase
        .from('feature_flags' as string)
        .select('flag_key, enabled, description, target_tiers');

      if (error) throw error;
      return (data ?? []) as unknown as FeatureFlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    flags: flags ?? [],
    isLoading,
  };
}
