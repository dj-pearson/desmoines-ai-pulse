import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StickyFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onClearSearch?: () => void;
  searchPlaceholder?: string;
  searchAriaLabel: string;
  /** Number of active filters (drives the trigger badge). */
  activeFilterCount: number;
  /** Opens the page's filter UI (sheet on mobile / scrolls to inline filters). */
  onFilterClick: () => void;
  /** Result count shown at all viewports (WEB-UX-003 — was mobile-hidden). */
  resultCount: number;
  isLoading?: boolean;
  /** Singular noun, e.g. "restaurant" → "12 restaurants". */
  resultNoun: string;
  /** Optional trailing slot (e.g. a sort dropdown / view toggle). */
  children?: ReactNode;
  className?: string;
}

/**
 * Condensed search + filter trigger + result count that sticks just below the
 * site header on scroll (WEB-UX-003). Sticky positioning keeps the bar in flow,
 * so there is no layout shift when it becomes pinned. The top offset is measured
 * from the live <header> so it tucks exactly under it at any breakpoint.
 *
 * The forwarded ref points at the Filters trigger button so callers can restore
 * focus to it after closing a mobile filter sheet (a11y).
 */
export const StickyFilterBar = forwardRef<HTMLButtonElement, StickyFilterBarProps>(
  function StickyFilterBar(
    {
      searchValue,
      onSearchChange,
      onClearSearch,
      searchPlaceholder = "Search...",
      searchAriaLabel,
      activeFilterCount,
      onFilterClick,
      resultCount,
      isLoading,
      resultNoun,
      children,
      className,
    },
    ref,
  ) {
    // Measure the sticky header height so this bar pins flush beneath it
    // regardless of breakpoint (header is shorter on mobile).
    const [topOffset, setTopOffset] = useState(64);
    useEffect(() => {
      const measure = () => {
        const header = document.querySelector("header");
        const h = header?.getBoundingClientRect().height;
        if (h && h > 0) setTopOffset(Math.round(h));
      };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, []);

    return (
      <div
        data-testid="sticky-filter-bar"
        className={cn(
          "sticky z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
          className,
        )}
        style={{ top: topOffset }}
      >
        <div className="container mx-auto px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* Condensed search */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchAriaLabel}
                className="h-10 pl-9 pr-9 rounded-xl"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => (onClearSearch ? onClearSearch() : onSearchChange(""))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter trigger */}
            <Button
              ref={ref}
              type="button"
              variant="outline"
              onClick={onFilterClick}
              className="h-10 flex-shrink-0 rounded-xl gap-1.5"
              aria-label="Open filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <Badge className="ml-0.5 h-5 min-w-5 px-1 flex items-center justify-center text-[11px]">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            {children}
          </div>

          {/* Result count — visible at ALL viewports (WEB-UX-003) */}
          <p className="mt-1.5 text-xs text-muted-foreground" data-testid="sticky-result-count">
            {isLoading ? (
              "Searching…"
            ) : (
              <span>
                <strong className="text-foreground">{resultCount}</strong>{" "}
                {resultNoun}
                {resultCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  },
);
