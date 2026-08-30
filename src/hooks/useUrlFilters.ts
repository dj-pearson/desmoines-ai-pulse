import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-synced filter state (WEB-UX-001). The URL is the source of truth so
 * filtered views survive back/forward navigation and are shareable. These tiny
 * typed accessors read a single search param (with a default) and write it back,
 * deleting the param when it equals the default so URLs stay clean.
 *
 * Changing any filter resets the `page` param (callers pass resetsPage) so a
 * narrower result set doesn't strand the user on a now-empty page.
 */
const PAGE_KEY = "page";

export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const getStr = useCallback(
    (key: string, def: string): string => searchParams.get(key) ?? def,
    [searchParams]
  );

  const getNum = useCallback(
    (key: string, def: number): number => {
      const raw = searchParams.get(key);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : def;
    },
    [searchParams]
  );

  const getList = useCallback(
    (key: string): string[] => {
      const raw = searchParams.get(key);
      return raw ? raw.split(",").filter(Boolean) : [];
    },
    [searchParams]
  );

  /**
   * Write a param. Pass `def` so default values are removed from the URL.
   * `resetsPage` clears pagination. `replace` avoids spamming history (used for
   * debounced text input).
   */
  const setParam = useCallback(
    (
      key: string,
      value: string | string[] | number | null,
      opts?: { def?: string | number; resetsPage?: boolean; replace?: boolean }
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const serialized = Array.isArray(value)
            ? value.join(",")
            : value === null
            ? ""
            : String(value);
          const isDefault =
            opts?.def !== undefined && serialized === String(opts.def);
          if (!serialized || isDefault) next.delete(key);
          else next.set(key, serialized);
          if (opts?.resetsPage) next.delete(PAGE_KEY);
          return next;
        },
        { replace: opts?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  /**
   * Write several params at once (used by pages with one combined filter object).
   * Empty string / empty array values delete the param. Always resets page.
   */
  const setMany = useCallback(
    (entries: Record<string, string | string[] | number | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(entries)) {
          const serialized = Array.isArray(value)
            ? value.join(",")
            : value === null
            ? ""
            : String(value);
          if (!serialized) next.delete(key);
          else next.set(key, serialized);
        }
        next.delete(PAGE_KEY);
        return next;
      }, { replace: false });
    },
    [setSearchParams]
  );

  /** Clear every listed filter key (and page), preserving any other params. */
  const clearParams = useCallback(
    (keys: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          [...keys, PAGE_KEY].forEach((k) => next.delete(k));
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  return { getStr, getNum, getList, setParam, setMany, clearParams };
}
