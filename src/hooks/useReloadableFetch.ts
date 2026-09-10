import { useCallback, useState } from "react";

export interface ReloadableFetchState {
  /** The last failure, or null. Pass straight to <ErrorState error={...} />. */
  error: unknown;
  /** Record a failure. Call with null on success. */
  setError: (error: unknown) => void;
  /** Add to the fetching effect's dependency array so Retry re-runs it. */
  reloadKey: number;
  /** Wire to <ErrorState onRetry={...} />. */
  retry: () => void;
}

/**
 * Error and retry state for a page that fetches in a useEffect rather than
 * through TanStack Query.
 *
 * WEB-QA-030. Seven SEO landing pages - /events/today, /events/free,
 * /events/kids, /events/date-night, /events/in/:location,
 * /restaurants/open-now and /restaurants/dietary/:diet - all did the same
 * thing on a failed query: log it and `setEvents([])`. The visitor was then
 * shown "No Events Scheduled for Today", which is a confident answer to a
 * question the page could not answer. These pages fetch in a useEffect, so
 * unlike the TanStack hubs they get no retries either - the false empty state
 * stood until the visitor reloaded the page.
 *
 * The failure and the genuine empty result have to be different states, and
 * the failure needs a way out that is not a page reload.
 */
export function useReloadableFetch(): ReloadableFetchState {
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  return { error, setError, reloadKey, retry };
}
