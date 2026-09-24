import { Suspense, lazy, useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { QuickActions } from "./QuickActions";
import { NLPSearchBar } from "./NLPSearchBar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { nowInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { isMobileApp } from "@/lib/capacitorUtils";

// Build-time constant: true in mobile builds, undefined in web builds.
// Rollup can inline and dead-code-eliminate based on this.
declare const __MOBILE_APP__: boolean | undefined;
const IS_NATIVE = typeof __MOBILE_APP__ !== 'undefined' && __MOBILE_APP__;

// Lazy load the 3D component - skip entirely in mobile app builds
// AND on mobile-width browsers (Three.js + WebGL is too heavy for mobile)
const HeroCityLite = IS_NATIVE
  ? null
  : lazy(() => import("./HeroCityLite"));

/**
 * The hero's one colour. A flat brand navy (the old mobile gradient's start
 * stop), in both themes: the hero art is intentionally dark whatever the
 * theme. Desktop uses the 3D scene's own near-black so the idle-time swap to
 * the canvas is not a colour jump. It replaced a navy-to-purple gradient plus a second purple-to-red
 * overlay (WP1 item 5, docs/page-plans/home.md).
 */
const HERO_BG = "bg-[#071e62] md:bg-[#0a0a1a]";

interface EnhancedHeroProps {
  // null = not known (still loading, or the count query failed). WEB-QA-024:
  // these must never fall back to 0 - a confident "0 Events Today" is how a
  // failed query reached visitors as a plausible number.
  eventsToday?: number | null;
  restaurantsCount?: number | null;
  newThisWeek?: number | null;
  isLoadingStats?: boolean;
  className?: string;
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning, Des Moines";
  if (hour >= 12 && hour < 17) return "Good afternoon, Des Moines";
  if (hour >= 17 && hour < 21) return "Good evening, Des Moines";
  return "Tonight in Des Moines";
}

function subheadingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Brunch spots, morning plans and what's on later today.";
  if (hour >= 12 && hour < 17) return "Afternoon events and where to eat across the metro.";
  if (hour >= 17 && hour < 21) return "Dinner and tonight's events, in one place.";
  return "Late-night food, live music and what's still going.";
}

export function EnhancedHero({
  eventsToday = null,
  restaurantsCount = null,
  newThisWeek = null,
  isLoadingStats = false,
  className,
}: EnhancedHeroProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isNativeApp = isMobileApp();

  // Defer the heavy 3D scene (three.js) off the critical path until the browser
  // is idle, so it never rides first paint of `/` (WEB-PERF-003). The flat
  // navy below fills the exact same space, so the upgrade causes no CLS.
  const [show3D, setShow3D] = useState(false);
  useEffect(() => {
    if (isMobile || IS_NATIVE) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(() => setShow3D(true), { timeout: 3000 });
      return () => w.cancelIdleCallback?.(handle);
    }
    const t = window.setTimeout(() => setShow3D(true), 1200);
    return () => clearTimeout(t);
  }, [isMobile]);

  // Central time, not the visitor's clock: the page is about Des Moines, and a
  // visitor planning from the coast at 7pm their time should not be told "Good
  // evening" when it is 9pm here. Computed synchronously so the text is final
  // on first paint (no CLS).
  const { hour, weekday } = useMemo(() => {
    const now = nowInCentralTime();
    return { hour: now.getHours(), weekday: format(now, "EEEE") };
  }, []);
  const greeting = greetingForHour(hour);
  const subheading = subheadingForHour(hour);

  // An em dash, not a zero. An unknown count reads as unknown instead of as
  // "none" (WEB-QA-024). Escaped so the source stays ASCII.
  const statPlaceholder = "\u2014";
  const formatStat = (value: number | null) =>
    isLoadingStats || value === null ? statPlaceholder : value.toLocaleString();

  const todayLabel =
    !isLoadingStats && eventsToday === 1 ? "event today" : "events today";

  return (
    <section
      className={cn(
        "relative",
        HERO_BG,
        // No min-height anywhere (WP1 item 5). It was min-h-[80vh] on phones
        // and min-h-screen on desktop, so the first screen was all brand and
        // the search input started below it. Native keeps its status-bar gap.
        isNativeApp ? "pb-8 pt-14" : "py-8 md:py-12",
        className
      )}
    >
      {/* Background layers sit in their own clipped box, so the section itself
          does not clip: the search panel has to be able to hang below the
          hero. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* 3D City Background - skip on mobile web (saves 800KB Three.js) and
            native apps, and defer to idle on desktop so it's off the critical
            path. */}
        {HeroCityLite && !isMobile && show3D ? (
          <Suspense fallback={null}>
            <HeroCityLite />
          </Suspense>
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        )}

        {/* Light-mode seam softener (WEB-QA-006). The hero is dark in both
            themes but the nav above it follows the theme; in light mode the
            near-white header met this navy in a hard line. This fades the top
            edge toward the page background. Dark mode is zeroed out. */}
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background/70 to-transparent dark:hidden" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* SEO-008: the greeting is NOT inside the <h1>. It is clock state, not
            content, and it was the first thing in the page's only H1, so the
            homepage's heading read "Good Afternoon!What's Happening..." to
            anything parsing the document - and with entity prerendering off
            that was the H1 of ~1,070 URLs (SEO-001).

            No entrance animation on this block. createRoot discards the
            prerendered DOM, so an animate-fade-in here started the LCP text
            from opacity 0 on every load. */}
        <div className="text-center">
          <p className="mb-1 text-base font-semibold text-[#FFD700] md:text-lg">{greeting}</p>
          {/* Deliberately NOT "Things to Do in Des Moines": that is
              /things-to-do's head term. The homepage takes the broad "what is
              on right now" intent; the hubs keep their own terms. */}
          <h1 className="mb-2 text-3xl font-bold text-white md:text-5xl">
            What's Happening in Des Moines
          </h1>
          <p className="mb-5 text-sm text-white/85 md:text-lg">
            <span className="font-medium text-white">{weekday}</span>
            {": "}
            <Link to="/events/today" className="underline-offset-4 hover:underline">
              <span className="tabular-nums">{formatStat(eventsToday)}</span> {todayLabel}
            </Link>
            <span className="hidden md:inline">. {subheading}</span>
          </p>
        </div>

        {/* The page's one free-text search (WP1 item 4). Enter goes to
            /search?q=. */}
        <NLPSearchBar
          className="mb-4"
          inputClassName="bg-background text-foreground"
          placeholder="Search events, restaurants, places..."
          showExamples
          showResults
        />

        <QuickActions />

        {/* Live stats, desktop only (WP1 item 5): on a phone they pushed the
            search and the first real card below the fold, and the context
            line above already carries today's count.
            CLS: min-h on each tile + tabular-nums keeps the loading and loaded
            states the same size. */}
        <div className="mx-auto mt-6 hidden max-w-2xl grid-cols-3 gap-3 md:grid">
          {([
            { to: "/events/today", value: formatStat(eventsToday), label: "Events today" },
            // The count is every restaurant, so the tile goes to the page that
            // lists every restaurant. It used to go to /restaurants/open-now,
            // a subset, so the number and the page never matched (WP1 item 11).
            { to: "/restaurants", value: formatStat(restaurantsCount), label: "Restaurants" },
            { to: "/events", value: formatStat(newThisWeek), label: "New this week" },
          ] as const).map((stat) => (
            <Link
              key={stat.to}
              to={stat.to}
              className="min-h-[76px] rounded-xl border border-white/20 bg-white/10 p-3 transition-colors duration-200 hover:bg-white/15"
            >
              <div className="mb-1 min-h-[32px] text-2xl font-bold tabular-nums text-[#FFD700]">
                {stat.value}
              </div>
              <p className="text-sm text-white/80">{stat.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
