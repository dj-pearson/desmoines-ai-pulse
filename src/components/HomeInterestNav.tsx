import { useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Calendar, UtensilsCrossed, Landmark, ArrowRight } from "lucide-react";
import { readRecentlyViewed, engagementByType, type RecentlyViewedType } from "@/lib/recentlyViewed";
import { computeHomeSectionOrder, type HomeSectionKey } from "@/lib/homeSectionOrder";
import { storage } from "@/lib/safeStorage";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/adAnalytics";
import { createLogger } from "@/lib/logger";

const log = createLogger("HomeInterestNav");

const DOMAINS: Record<HomeSectionKey, { label: string; blurb: string; href: string; icon: typeof Calendar }> = {
  event: { label: "Events", blurb: "Concerts, festivals & things to do", href: "/events", icon: Calendar },
  restaurant: { label: "Restaurants", blurb: "Where to eat across the metro", href: "/restaurants", icon: UtensilsCrossed },
  attraction: { label: "Attractions", blurb: "Museums, parks & landmarks", href: "/attractions", icon: Landmark },
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

  return (
    <section className="py-6 bg-background" aria-label="Browse by interest">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {order.map((key) => {
            const d = DOMAINS[key];
            const Icon = d.icon;
            return (
              <Link
                key={key}
                to={d.href}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{d.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{d.blurb}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
