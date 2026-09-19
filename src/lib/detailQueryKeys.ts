import { STALE_TIME } from "@/lib/queryConfig";

/**
 * The query keys a detail page and its hover prefetcher share (WEB-PERF-036).
 *
 * These were two string literals in two files. `['attraction', slug]` in
 * usePrefetchDetail and `["attraction", slug]` in AttractionDetails are the
 * same key today and stay the same key only for as long as nobody edits one of
 * them - and a prefetch under a key the page does not read is invisible: the
 * hover still costs a request, the page still fetches, and nothing anywhere
 * reports a miss. One builder makes them the same key by construction.
 *
 * The staleTime belongs here for the same reason. A prefetch is discarded the
 * instant the page mounts if the page considers it stale, so the two values
 * have to agree; keeping them apart is how one of them ends up at the global
 * 60-second default while the other is minutes.
 */
export type DetailKind = "attraction" | "playground" | "restaurant";

export function detailQueryKey(kind: DetailKind, slug: string): readonly [DetailKind, string] {
  return [kind, slug] as const;
}

/**
 * 15 minutes, from STALE_TIME.CONTENT_DETAIL. A single content row changes far
 * less often than the list it came from, and back-navigation to a detail page
 * is common enough that refetching the whole row on every return is the
 * expensive default.
 */
export const DETAIL_STALE_TIME = STALE_TIME.CONTENT_DETAIL;
