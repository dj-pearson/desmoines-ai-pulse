import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

/**
 * The hero's one-tap chips (WP1 item 5, docs/page-plans/home.md).
 *
 * Each goes to an SEO landing that already filters server-side, so a chip is a
 * link and never a client-side filter over a partial list. This replaces the
 * old 2x2 icon-tile grid and its mobile twin, which carried the same four
 * destinations at three times the height.
 */
const HERO_CHIPS = [
  { to: "/events/today", label: "Tonight" },
  { to: "/events/this-weekend", label: "This weekend" },
  { to: "/restaurants/open-now", label: "Open now" },
  { to: "/events/near-me", label: "Near me" },
  { to: "/events/free", label: "Free" },
] as const;

interface QuickActionsProps {
  className?: string;
}

export function QuickActions({ className }: QuickActionsProps) {
  return (
    <div className={cn("w-full", className)}>
      <nav aria-label="Quick picks">
        {/* A single scrolling row on phones keeps the search input and the
            first card inside the first screen; it wraps from md up. The
            negative margin lets the row run to the screen edge without adding
            page-level horizontal scroll, since the row itself clips. */}
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0">
          {HERO_CHIPS.map((chip) => (
            <li key={chip.to} className="shrink-0">
              <Link
                to={chip.to}
                className="inline-flex h-11 items-center rounded-full border border-white/25 bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071e62]"
              >
                {chip.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* "AI Plan My Night" used to be the biggest button on the page, on a
          gold gradient, and it ends on an Insider paywall (/trip-planner wraps
          the planner in <PremiumGate requiredTier="insider">). It is a
          secondary link now, and still says what it costs (WEB-QA-005 AC2). */}
      <p className="mt-3 text-center text-sm text-white/80">
        <Link
          to="/trip-planner"
          className="inline-flex min-h-11 items-center gap-2 font-medium text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700] rounded"
        >
          <SpriteIcon name="sparkles" className="h-4 w-4 text-[#FFD700]" aria-hidden="true" />
          AI Plan My Night
          <span className="rounded-full bg-[#FFC107] px-2 py-0.5 text-xs font-semibold text-[#2D1B69]">
            Insider
          </span>
        </Link>
      </p>
    </div>
  );
}
