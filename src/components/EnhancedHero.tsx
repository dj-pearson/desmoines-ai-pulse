import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { QuickActions } from "./QuickActions";
import { NLPSearchBar } from "./NLPSearchBar";
import type { TodayCountMode } from "@/hooks/useHomepageStats";
import { isPrerender } from "@/lib/isPrerender";
import { nowInCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { isMobileApp } from "@/lib/capacitorUtils";

/**
 * The hero's one colour, a flat brand navy in both themes and at every width.
 * Desktop used a near-black to match the three.js city scene it swapped in at
 * idle; the scene is gone (home-pass2 WP1 item 9), so the hero is one colour
 * again.
 */
const HERO_BG = "bg-[#071e62]";

interface EnhancedHeroProps {
  // null = not known (still loading, or the count query failed). WEB-QA-024:
  // this must never fall back to 0 - a confident "0 events today" is how a
  // failed query reached visitors as a plausible number.
  eventsToday?: number | null;
  /** Whether the count is the whole day or what is still to start tonight. */
  countMode?: TodayCountMode;
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
  countMode = "today",
  isLoadingStats = false,
  className,
}: EnhancedHeroProps) {
  const isNativeApp = isMobileApp();
  // The build-time prerender freezes this HTML for a day or more. The greeting
  // and "N events today" are clock state, so the static copy carries neither;
  // the dated sentence crawlers read is the snapshot's (home-pass2 WP1 item 3).
  const frozen = isPrerender();

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
  const count = isLoadingStats || eventsToday === null ? "\u2014" : eventsToday.toLocaleString();
  const one = !isLoadingStats && eventsToday === 1;
  // After 15:00 Central the line answers "is anything still on?" (item 13).
  const countLabel =
    countMode === "still-to-start"
      ? one
        ? "event still to start tonight"
        : "events still to start tonight"
      : one
        ? "event today"
        : "events today";

  return (
    <section
      className={cn(
        "relative",
        HERO_BG,
        // No min-height anywhere (WP1 item 5). It was min-h-[80vh] on phones
        // and min-h-screen on desktop, so the first screen was all brand and
        // the search input started below it. Native keeps its status-bar gap.
        isNativeApp ? "pb-8 pt-14" : "py-8 md:py-10",
        className
      )}
    >
      {/* The static grid, in its own clipped box so the section itself does
          not clip: the search panel has to be able to hang below the hero. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* max-w-4xl so the H1 fits on one line at md:text-5xl; at max-w-3xl it
          took two lines and pushed the Tonight cards out of a 1366x768 first
          screen. The search box keeps the narrower measure. */}
      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* SEO-008: the greeting is NOT inside the <h1>. It is clock state, not
            content, and it was the first thing in the page's only H1, so the
            homepage's heading read "Good Afternoon!What's Happening..." to
            anything parsing the document.

            No entrance animation on this block. createRoot discards the
            prerendered DOM, so an animate-fade-in here started the LCP text
            from opacity 0 on every load. */}
        <div className="text-center">
          {/* Fixed line heights, so the prerendered empty boxes and the live
              text are the same size (no shift when the app takes over). */}
          <p className="mb-1 min-h-6 text-base font-semibold text-[#FFD700] md:min-h-7 md:text-lg">
            {frozen ? null : greeting}
          </p>
          {/* Deliberately NOT "Things to Do in Des Moines": that is
              /things-to-do's head term. text-balance keeps "Moines" from
              wrapping alone. */}
          <h1 className="mb-2 text-balance text-3xl font-bold text-white md:text-5xl">
            What's Happening in Des Moines
          </h1>
          <p className="mb-4 min-h-5 text-sm text-white/85 md:min-h-7 md:text-lg" data-nosnippet="">
            {frozen ? null : (
              <>
                <span className="font-medium text-white">{weekday}</span>
                {": "}
                <Link to="/events/today" className="underline-offset-4 hover:underline">
                  <span className="tabular-nums">{count}</span> {countLabel}
                </Link>
                <span className="hidden md:inline">. {subheading}</span>
              </>
            )}
          </p>
        </div>

        {/* The page's one free-text search. Enter goes to /search?q=; a
            suggestion goes straight to the place. */}
        <NLPSearchBar
          className="mx-auto mb-4 max-w-3xl"
          inputClassName="bg-background text-foreground"
          placeholder="Search events, restaurants, places..."
          mobilePlaceholder="Search Des Moines"
          showExamples
        />

        {/* No desktop stat tiles (home-pass2 WP1 item 4). At 1366x768 they
            pushed every Tonight card below the fold, and the context line
            above already carries today's count and links /events/today. */}
        <QuickActions />
      </div>
    </section>
  );
}
