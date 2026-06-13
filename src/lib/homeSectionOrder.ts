/**
 * Data-driven home section ordering — WEB-FEAT-007.
 *
 * Web twin of the iOS HomeRailOrdering (IOS-IA-006): leads the homepage with
 * the content a returning user actually engages with, WITHOUT touching layout.
 * The strategy is:
 *   • Deterministic — the same signals always yield the same order (testable,
 *     no flicker). Computed synchronously before first paint → no CLS.
 *   • Default-safe — guests / no-signal users get the canonical order, so
 *     nothing regresses for new visitors.
 *   • First-party — only on-device signals (recently-viewed + saved counts).
 *   • A/B-friendly — one `Strategy` switch so an experiment can swap the policy
 *     in a single place, and a `cohort` label so conversion vs control is
 *     measurable.
 */

export type HomeSectionType = "event" | "restaurant" | "attraction" | "neutral";

/** A reorderable home section, tagged with the content type it surfaces. */
export interface HomeSection<K extends string = string> {
  key: K;
  /** Content affinity this section serves (neutral = never reordered by type). */
  contentType: HomeSectionType;
}

export interface HomeOrderingSignals {
  /** ForYou personalization active (enough engagement to lead with it). */
  engaged: boolean;
  favorites: { event: number; restaurant: number; attraction: number };
  recent: { event: number; restaurant: number; attraction: number };
}

export type HomeOrderingStrategy = "canonical" | "affinityWeighted";

/** The live strategy. Flip (or remote-config) this for an experiment. */
export const ACTIVE_HOME_STRATEGY: HomeOrderingStrategy = "affinityWeighted";

/** Cohort label for analytics: are we showing a personalized order or not? */
export type HomeOrderingCohort = "control" | "personalized";

function totalSignal(s: HomeOrderingSignals): number {
  const { favorites: f, recent: r } = s;
  return (
    f.event + f.restaurant + f.attraction + r.event + r.restaurant + r.attraction
  );
}

export function hasAffinity(s: HomeOrderingSignals): boolean {
  return totalSignal(s) > 0;
}

/**
 * Whether the affinity strategy will actually personalize for these signals.
 * Drives both the rendered order and the logged cohort so they never disagree.
 */
export function isPersonalizedOrder(
  signals: HomeOrderingSignals,
  strategy: HomeOrderingStrategy = ACTIVE_HOME_STRATEGY,
): boolean {
  return strategy === "affinityWeighted" && (signals.engaged || hasAffinity(signals));
}

export function cohortFor(
  signals: HomeOrderingSignals,
  strategy: HomeOrderingStrategy = ACTIVE_HOME_STRATEGY,
): HomeOrderingCohort {
  return isPersonalizedOrder(signals, strategy) ? "personalized" : "control";
}

/**
 * Compute the personalized section order. Returns the input order unchanged
 * (canonical) for guests / no-signal users, so there is never any layout flick.
 *
 * Only the typed content sections are permuted — by content-type affinity —
 * while `neutral` sections stay pinned at their canonical index. This keeps the
 * reorder well-defined and deterministic: the typed sections are re-sequenced
 * among themselves and slotted back into the positions typed sections occupied.
 * A save is a stronger signal than a view (weight 2x).
 */
export function orderHomeSections<K extends string>(
  sections: ReadonlyArray<HomeSection<K>>,
  signals: HomeOrderingSignals,
  strategy: HomeOrderingStrategy = ACTIVE_HOME_STRATEGY,
): HomeSection<K>[] {
  const canonical = sections.slice();
  if (!isPersonalizedOrder(signals, strategy)) {
    return canonical;
  }

  const score: Record<"event" | "restaurant" | "attraction", number> = {
    event: signals.favorites.event * 2 + signals.recent.event,
    restaurant: signals.favorites.restaurant * 2 + signals.recent.restaurant,
    attraction: signals.favorites.attraction * 2 + signals.recent.attraction,
  };

  // Rank the typed content buckets by score desc, stable tie-break by the
  // canonical type order (event, restaurant, attraction).
  const typeRank: Record<string, number> = {};
  (["event", "restaurant", "attraction"] as const)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => score[b.t] - score[a.t] || a.i - b.i)
    .forEach((x, i) => {
      typeRank[x.t] = i;
    });

  // The original positions occupied by typed sections (these are the only
  // slots that get re-filled); their canonical indices are preserved otherwise.
  const typedSlots: number[] = [];
  canonical.forEach((s, i) => {
    if (s.contentType !== "neutral") typedSlots.push(i);
  });

  // Re-sequence the typed sections by their type rank (stable within a rank).
  const resequenced = canonical
    .map((section, idx) => ({ section, idx }))
    .filter((x) => x.section.contentType !== "neutral")
    .sort((a, b) => {
      const ra = typeRank[a.section.contentType] ?? 0;
      const rb = typeRank[b.section.contentType] ?? 0;
      if (ra !== rb) return ra - rb;
      return a.idx - b.idx;
    })
    .map((x) => x.section);

  const result = canonical.slice();
  typedSlots.forEach((slot, i) => {
    result[slot] = resequenced[i];
  });
  return result;
}
