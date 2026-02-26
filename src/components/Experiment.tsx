import { ReactNode } from 'react';
import { useExperiment } from '@/hooks/useExperiment';

interface ExperimentProps {
  /** The feature flag key that defines this experiment */
  flag: string;
  /** Map of variant names to components to render */
  variants: Record<string, ReactNode>;
  /** Fallback content when user is not in the experiment or loading */
  fallback?: ReactNode;
}

/**
 * Wrapper component for A/B test experiments.
 *
 * Renders the component associated with the user's assigned variant.
 * Falls back to the fallback prop (or first variant) when the user
 * is not enrolled in the experiment.
 *
 * @example
 * <Experiment
 *   flag="homepage_hero_test"
 *   variants={{
 *     A: <HeroOriginal />,
 *     B: <HeroRedesigned />,
 *   }}
 *   fallback={<HeroOriginal />}
 * />
 */
export function Experiment({ flag, variants, fallback = null }: ExperimentProps) {
  const { variant, isLoading, isInExperiment } = useExperiment(flag);

  if (isLoading) return null;

  if (!isInExperiment || !variant) {
    return <>{fallback}</>;
  }

  const content = variants[variant];
  if (!content) {
    return <>{fallback}</>;
  }

  return <>{content}</>;
}
