import type { RecentlyViewedType } from "@/lib/recentlyViewed";

/**
 * Data-driven home section ordering (WEB-FEAT-007).
 *
 * Returns the order of the three content domains on the homepage based on a
 * user's engagement signal (recently-viewed counts per type). Users with a
 * clear dominant interest see that domain first ("dining-first" etc.); guests
 * and no-signal users keep the canonical order. Pure and deterministic so the
 * caller can compute the order synchronously before first paint (no CLS).
 */
export type HomeSectionKey = RecentlyViewedType; // "event" | "restaurant" | "attraction"

/** Canonical fallback order (events → restaurants → attractions). */
export const CANONICAL_SECTION_ORDER: HomeSectionKey[] = ["event", "restaurant", "attraction"];

/** Minimum views of the dominant type before we personalize (avoids noise/flicker). */
export const PERSONALIZATION_THRESHOLD = 3;

export interface HomeSectionOrdering {
  order: HomeSectionKey[];
  /** Analytics cohort: "control" (canonical) or "personalized:<type>". */
  cohort: string;
}

/**
 * Compute the section order + analytics cohort from per-type engagement counts.
 *
 * A type becomes dominant only if it has >= PERSONALIZATION_THRESHOLD views and
 * strictly more than every other type (ties → canonical, so ordering is stable
 * and never flickers between equally-engaged types). The dominant type is moved
 * to the front; the rest keep their canonical relative order.
 */
export function computeHomeSectionOrder(
  counts: Partial<Record<HomeSectionKey, number>>,
): HomeSectionOrdering {
  let dominant: HomeSectionKey | null = null;
  let dominantCount = 0;
  let tie = false;

  for (const key of CANONICAL_SECTION_ORDER) {
    const c = counts[key] ?? 0;
    if (c > dominantCount) {
      dominant = key;
      dominantCount = c;
      tie = false;
    } else if (c === dominantCount && c > 0) {
      tie = true;
    }
  }

  if (!dominant || dominantCount < PERSONALIZATION_THRESHOLD || tie) {
    return { order: CANONICAL_SECTION_ORDER, cohort: "control" };
  }

  const order = [dominant, ...CANONICAL_SECTION_ORDER.filter((k) => k !== dominant)];
  return { order, cohort: `personalized:${dominant}` };
}
