import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import { storage } from '@/lib/safeStorage';

const log = createLogger('useExperiment');

interface ExperimentFlag {
  flag_key: string;
  enabled: boolean;
  variants: Record<string, number> | null; // { "A": 50, "B": 50 } — percentage split
  traffic_split: number | null; // percentage of users in the experiment (0-100)
}

/**
 * Deterministically assign a variant based on a hash of (flagKey + identifier).
 * Uses a simple string hash mapped to percentage buckets.
 */
function hashToVariant(
  flagKey: string,
  identifier: string,
  variants: Record<string, number>
): string {
  const input = `${flagKey}:${identifier}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32-bit integer
  }
  const bucket = Math.abs(hash) % 100;

  let cumulative = 0;
  for (const [variant, weight] of Object.entries(variants)) {
    cumulative += weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  // Fallback to first variant
  return Object.keys(variants)[0];
}

function getSessionId(): string {
  let sessionId = storage.get<string>('experiment_session_id', '');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set('experiment_session_id', sessionId);
  }
  return sessionId;
}

async function fetchExperimentFlag(flagKey: string): Promise<ExperimentFlag | null> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('flag_key, enabled, variants, traffic_split')
    .eq('flag_key', flagKey)
    .single();

  if (error || !data) {
    log.info('fetchExperimentFlag', 'Flag not found or error', { flagKey, error: error?.message });
    return null;
  }

  return data as unknown as ExperimentFlag;
}

/**
 * Hook for A/B testing experiments.
 *
 * Assigns users to experiment variants deterministically based on user_id (authenticated)
 * or session_id (anonymous). Assignment is consistent across page loads.
 *
 * @example
 * const { variant, isLoading } = useExperiment('homepage_hero_test');
 * if (variant === 'A') return <HeroV1 />;
 * if (variant === 'B') return <HeroV2 />;
 */
export function useExperiment(flagKey: string): {
  variant: string | null;
  isLoading: boolean;
  isInExperiment: boolean;
} {
  const { user } = useAuth();
  const identifier = user?.id || getSessionId();

  const { data: flag, isLoading } = useQuery({
    queryKey: ['experiment-flag', flagKey],
    queryFn: () => fetchExperimentFlag(flagKey),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const result = useMemo(() => {
    if (!flag || !flag.enabled || !flag.variants) {
      return { variant: null, isInExperiment: false };
    }

    // Check if user is in the traffic split
    if (flag.traffic_split != null && flag.traffic_split < 100) {
      const trafficHash = `traffic:${flagKey}:${identifier}`;
      let hash = 0;
      for (let i = 0; i < trafficHash.length; i++) {
        hash = ((hash << 5) - hash) + trafficHash.charCodeAt(i);
        hash |= 0;
      }
      const trafficBucket = Math.abs(hash) % 100;
      if (trafficBucket >= flag.traffic_split) {
        return { variant: null, isInExperiment: false };
      }
    }

    const variant = hashToVariant(flagKey, identifier, flag.variants);

    // Fire-and-forget: track assignment in user_analytics
    supabase
      .from('user_analytics')
      .insert({
        event_type: 'experiment_assigned',
        page_path: window.location.pathname,
        metadata: { flag_key: flagKey, variant, identifier_type: user?.id ? 'user' : 'session' },
        session_id: getSessionId(),
      })
      .then(() => {
        log.debug('useExperiment', 'Assignment tracked', { flagKey, variant });
      });

    return { variant, isInExperiment: true };
  }, [flag, flagKey, identifier, user?.id]);

  return {
    variant: result.variant,
    isLoading,
    isInExperiment: result.isInExperiment,
  };
}
