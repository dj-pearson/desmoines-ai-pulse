import { ReactNode } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

interface FeatureFlagProps {
  /** The flag key to check */
  flag: string;
  /** Content to render when the flag is enabled */
  children: ReactNode;
  /** Optional fallback content when the flag is disabled */
  fallback?: ReactNode;
}

/**
 * Wrapper component that conditionally renders children based on a feature flag.
 *
 * @example
 * <FeatureFlag flag="ai_trip_planner_v2">
 *   <NewTripPlanner />
 * </FeatureFlag>
 *
 * @example
 * <FeatureFlag flag="mobile_app_banner" fallback={<OldBanner />}>
 *   <NewBanner />
 * </FeatureFlag>
 */
export function FeatureFlag({ flag, children, fallback = null }: FeatureFlagProps) {
  const { enabled, isLoading } = useFeatureFlag(flag);

  if (isLoading) return null;
  if (!enabled) return <>{fallback}</>;

  return <>{children}</>;
}
