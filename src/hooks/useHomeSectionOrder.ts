import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  ACTIVE_HOME_STRATEGY,
  cohortFor,
  HomeOrderingSignals,
  HomeSection,
  orderHomeSections,
} from "@/lib/homeSectionOrder";
import {
  getRecentlyViewedSnapshot,
  subscribeRecentlyViewed,
} from "@/lib/recentlyViewed";
import {
  getGuestFavoritesSnapshot,
  subscribeGuestFavorites,
} from "@/lib/guestFavorites";
import { trackHomeOrderCohort } from "@/lib/personalizationAnalytics";

/**
 * Data-driven home section ordering (WEB-FEAT-007).
 *
 * Reads first-party engagement signals SYNCHRONOUSLY from the on-device stores
 * (recently-viewed counts + guest event saves) so the order is known before the
 * first paint of the section list — no CLS, no flicker. Guests / no-signal
 * users get the canonical order unchanged. Logs the served cohort once per
 * mount so personalized-vs-control conversion is measurable.
 *
 * Pass a STABLE `sections` array (module constant) to avoid needless recompute.
 */
export function useHomeSectionOrder<K extends string>(
  sections: ReadonlyArray<HomeSection<K>>,
) {
  const recentItems = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedSnapshot,
  );
  const guestFavorites = useSyncExternalStore(
    subscribeGuestFavorites,
    getGuestFavoritesSnapshot,
    getGuestFavoritesSnapshot,
  );

  const signals: HomeOrderingSignals = useMemo(() => {
    const recent = { event: 0, restaurant: 0, attraction: 0 };
    for (const item of recentItems) recent[item.type] += 1;
    return {
      engaged: false,
      // Guest saves are event-only; signed-in saves are reflected via the
      // recently-viewed signal (kept synchronous to avoid CLS).
      favorites: { event: guestFavorites.length, restaurant: 0, attraction: 0 },
      recent,
    };
  }, [recentItems, guestFavorites]);

  const order = useMemo(
    () => orderHomeSections(sections, signals),
    [sections, signals],
  );
  const cohort = useMemo(() => cohortFor(signals), [signals]);

  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    trackHomeOrderCohort(cohort, { strategy: ACTIVE_HOME_STRATEGY });
  }, [cohort]);

  return {
    order,
    cohort,
    signals,
    isPersonalized: cohort === "personalized",
  };
}
