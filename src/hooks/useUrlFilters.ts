import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { buildSearchParams, type ParamValue } from "@/lib/urlParams";

interface UseUrlFiltersOptions {
  /**
   * Current managed filter values keyed by URL param name. Default/empty
   * values should be passed as undefined/""/[] so they're omitted from the URL.
   */
  managed: Record<string, ParamValue>;
  /**
   * Apply URL params back into component state. Called when the URL changes
   * from outside this component (browser back/forward, an in-page link that
   * sets params). NOT called on initial mount — the page is expected to
   * initialize its state from the URL via lazy `useState` initializers.
   */
  apply: (params: URLSearchParams) => void;
  /**
   * Debounce window (ms) for writing state → URL so rapid changes (typing)
   * don't spam browser history. Defaults to 300ms.
   */
  debounceMs?: number;
}

/**
 * Two-way sync between list-page filter state and the URL search params
 * (WEB-UX-001).
 *
 * - state → URL: debounced, written with `replace` so a single visit to the
 *   list page stays one history entry (typing/filtering doesn't bury the back
 *   button). The write preserves unrelated params and is idempotent, so it
 *   never loops.
 * - URL → state: when the URL changes externally (back/forward), `apply` is
 *   invoked to rehydrate state. Self-induced writes are ignored via a guard.
 *
 * The page initializes its own state from the URL on mount, so a shared link
 * lands with all filters applied; navigating to a detail page and back restores
 * the filtered list because the list URL carries the full filter set.
 */
export function useUrlFilters({ managed, apply, debounceMs = 300 }: UseUrlFiltersOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Tracks the param string this hook last wrote, so the URL→state effect can
  // ignore changes it caused itself.
  const lastWrittenRef = useRef<string | null>(null);
  const isFirstRef = useRef(true);

  // The URL string we *intend* given the current state. Stable across renders
  // unless a managed value actually changes.
  const intended = buildSearchParams(searchParams, managed).toString();
  const current = searchParams.toString();

  // state → URL (debounced, replace).
  useEffect(() => {
    if (intended === current) return;
    const handle = setTimeout(() => {
      lastWrittenRef.current = intended;
      setSearchParams((prev) => buildSearchParams(prev, managed), { replace: true });
    }, debounceMs);
    return () => clearTimeout(handle);
    // `intended` already encodes the relevant managed/searchParams state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intended]);

  // URL → state (browser back/forward, external param changes).
  useEffect(() => {
    if (isFirstRef.current) {
      // State was initialized from the URL on mount; nothing to re-apply.
      isFirstRef.current = false;
      return;
    }
    if (current === lastWrittenRef.current) return; // our own write
    apply(searchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
}
