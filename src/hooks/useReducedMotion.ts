import { useState, useEffect } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Hook that returns true when the user prefers reduced motion.
 *
 * Listens to the OS-level `prefers-reduced-motion` media query
 * and updates reactively when the setting changes.
 *
 * @example
 * const prefersReduced = useReducedMotion();
 * if (prefersReduced) return <StaticHero />;
 * return <AnimatedHero />;
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };

    mql.addEventListener('change', handler);
    // Sync in case SSR value was wrong
    setPrefersReduced(mql.matches);

    return () => mql.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}
