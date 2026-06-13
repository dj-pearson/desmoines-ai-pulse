/**
 * URL search-param helpers for list-page filter state (WEB-UX-001).
 *
 * The URL is the source of truth for filters on Events / Restaurants /
 * Attractions so that views are shareable and survive back-navigation.
 * These pure helpers serialize component state into search params (omitting
 * default/empty values to keep URLs clean) and parse params back into state.
 */

export type ParamValue = string | number | boolean | string[] | undefined | null;

/**
 * Serialize a single managed value to its URL string, or `undefined` when it
 * should be omitted from the URL (empty string, empty array, false, nullish).
 */
function serializeParam(value: ParamValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? "true" : undefined;
  if (Array.isArray(value)) return value.length ? value.join(",") : undefined;
  const str = String(value).trim();
  return str.length ? str : undefined;
}

/**
 * Return a new URLSearchParams derived from `current`, with the `managed` keys
 * set (or deleted when their value serializes to undefined). Keys not present
 * in `managed` are preserved untouched so unrelated params (e.g. campaign tags
 * or SEO-landing flags) compose cleanly. The operation is idempotent.
 */
export function buildSearchParams(
  current: URLSearchParams,
  managed: Record<string, ParamValue>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(managed)) {
    const serialized = serializeParam(value);
    if (serialized === undefined) {
      next.delete(key);
    } else {
      next.set(key, serialized);
    }
  }
  return next;
}

/** Read a string param with a fallback. */
export function getStringParam(
  params: URLSearchParams,
  key: string,
  fallback = "",
): string {
  const value = params.get(key);
  return value !== null ? value : fallback;
}

/** Read a comma-separated param as a trimmed, non-empty string array. */
export function getArrayParam(params: URLSearchParams, key: string): string[] {
  const value = params.get(key);
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Read a boolean param (true only when the value is exactly "true"). */
export function getBoolParam(params: URLSearchParams, key: string): boolean {
  return params.get(key) === "true";
}

/** Read a positive-integer param with a fallback (used for pagination). */
export function getNumberParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const value = params.get(key);
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
