import { useState, useEffect } from 'react';

function getInitialMatch(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getInitialMatch(query));

  useEffect(() => {
    // Check if window is defined (SSR safety)
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia(query);

    // Sync in case query changed between renders
    setMatches(media.matches);

    // Create event listener
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    media.addEventListener('change', listener);

    // Cleanup
    return () => {
      media.removeEventListener('change', listener);
    };
  }, [query]);

  return matches;
}
