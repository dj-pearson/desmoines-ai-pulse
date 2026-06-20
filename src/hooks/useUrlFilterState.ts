import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-synced filter state (WEB-UX-001).
 *
 * Makes the query string the single source of truth for list-page filters so a
 * filtered view survives back/forward navigation and is shareable. Values that
 * equal their default are omitted from the URL to keep links clean.
 *
 * - `get(key, fallback)` reads a single param.
 * - `getList(key)` reads a comma-separated multi-select param.
 * - `set(updates, opts)` writes several params at once. Pass `replace: true`
 *   for high-frequency updates (debounced search typing) so each keystroke
 *   replaces the history entry instead of stacking one; discrete control
 *   changes use the default push so back/forward steps through filter states.
 *   A value of `null`/`""`/equal-to-default removes the param.
 * - `clear(keys)` removes the given params (Clear-all).
 *
 * `setSearchParams` accepts a functional updater so concurrent setters in the
 * same tick compose instead of clobbering each other.
 */
export interface SetOptions {
  replace?: boolean;
  /** Per-key default; a value equal to its default is removed from the URL. */
  defaults?: Record<string, string>;
}

export function useUrlFilterState() {
  const [params, setParams] = useSearchParams();

  const get = useCallback(
    (key: string, fallback = "") => params.get(key) ?? fallback,
    [params],
  );

  const getList = useCallback(
    (key: string): string[] => {
      const raw = params.get(key);
      if (!raw) return [];
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    },
    [params],
  );

  const applyUpdates = useCallback(
    (
      prev: URLSearchParams,
      updates: Record<string, string | number | string[] | null | undefined>,
      defaults?: Record<string, string>,
    ): URLSearchParams => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        const serialized = Array.isArray(v)
          ? v.join(",")
          : v === null || v === undefined
            ? ""
            : String(v);
        if (serialized === "" || serialized === defaults?.[k]) next.delete(k);
        else next.set(k, serialized);
      }
      return next;
    },
    [],
  );

  const set = useCallback(
    (
      updates: Record<string, string | number | string[] | null | undefined>,
      opts: SetOptions = {},
    ) => {
      setParams((prev) => applyUpdates(prev, updates, opts.defaults), {
        replace: opts.replace,
      });
    },
    [setParams, applyUpdates],
  );

  const clear = useCallback(
    (keys: string[]) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
    },
    [setParams],
  );

  return { params, get, getList, set, clear };
}
