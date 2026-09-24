import { useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { readRecentlyViewed, engagementByType, type RecentlyViewedType } from "@/lib/recentlyViewed";
import { computeHomeSectionOrder, type HomeSectionKey } from "@/lib/homeSectionOrder";
import { storage } from "@/lib/safeStorage";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/adAnalytics";
import { createLogger } from "@/lib/logger";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger("HomeInterestNav");

const DOMAINS: Record<HomeSectionKey, { label: string; blurb: string; href: string }> = {
  event: { label: "Events", blurb: "Concerts, festivals & things to do", href: "/events" },
  restaurant: { label: "Restaurants", blurb: "Where to eat across the metro", href: "/restaurants" },
  attraction: { label: "Attractions", blurb: "Museums, parks & landmarks", href: "/attractions" },
};

const COHORT_KEY = "dmi_home_cohort_logged_v1";

/**
 * Data-driven home section ordering (WEB-FEAT-007, AC3).
 *
 * Renders the three content domains in an order derived from the user's
 * engagement signal — a returning user with dominant restaurant engagement
 * sees dining first; guests/no-signal users keep the canonical order. The
 * order is computed synchronously from the local store (useMemo with no async),
 * so the row paints in its final order — no layout shift. The personalization
 * cohort is logged once per session so conversion vs. control is measurable.
 */
export function HomeInterestNav() {
  const { order, cohort } = useMemo(() => {
    const counts = engagementByType(readRecentlyViewed());
    return computeHomeSectionOrder(counts as Partial<Record<RecentlyViewedType, number>>);
  }, []);

  useEffect(() => {
    // Log the cohort once per session (best-effort, never blocks/throws).
    if (storage.get<string>(COHORT_KEY) === cohort) return;
    storage.set(COHORT_KEY, cohort);
    // WEB-QA-026: this used to put `cohort` ("control" / "personalized:<type>")
    // into content_id, which is uuid NOT NULL — so every insert was rejected
    // with 22P02 and this experiment has never recorded a row. The `as never`
    // cast is what let it compile: it silenced the missing required session_id
    // at the same time. The cohort belongs in filters_used, which is jsonb.
    //
    // The rejection is logged now rather than discarded. A measurement that
    // fails silently is indistinguishable from one nobody is looking at.
    void supabase
      .from("user_analytics")
      .insert({
        event_type: "home_cohort",
        content_type: "home",
        content_id: crypto.randomUUID(),
        session_id: getSessionId(),
        page_url: typeof window !== "undefined" ? window.location.href : null,
        filters_used: { cohort },
      })
      .then(({ error }) => {
        if (error) log.warn("cohort", "insert rejected", { code: error.code, message: error.message });
      }, () => undefined);
  }, [cohort]);

  // A one-line text row (WP1 item 8). It was three icon-tile cards, which the
  // UI craft floor refuses as page structure and which repeated the hero's
  // chips at three times the height. The engagement-driven order is kept.
  return (
    <nav aria-label="Browse by interest" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ul className="flex flex-wrap items-center gap-x-5 text-sm">
        <li className="text-muted-foreground">Browse</li>
        {order.map((key) => {
          const d = DOMAINS[key];
          return (
            <li key={key}>
              <Link
                to={d.href}
                title={d.blurb}
                className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                {d.label}
                <SpriteIcon name="arrow-right" className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
