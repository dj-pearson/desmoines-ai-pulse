import { useEffect, useRef, type ReactNode } from "react";
import { List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveFilterChips, type FilterChip } from "@/components/filters/ActiveFilterChips";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SortDropdown, EVENT_SORT_OPTIONS, type SortOption } from "@/components/SortDropdown";
import { useHideOnScrollDown } from "@/hooks/useHideOnScrollDown";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** The CSS variable day headers read to sit just under this bar. */
export const EVENTS_BAR_HEIGHT_VAR = "--events-bar-h";

/** Where the bar pins: `top-16`, under the site header. */
const BAR_STUCK_AT_PX = 64;

/** Below Tailwind's `md`, where the bottom nav also takes a band of the screen. */
const TUCK_AWAY_QUERY = "(max-width: 767px)";

export type EventsViewMode = "list" | "map";

export interface EventsStickyBarProps {
  /**
   * The honest count, formatted by the page, e.g. "30 of 412 events". Not a
   * live region: the page announces the count once, elsewhere.
   */
  countLabel: ReactNode;
  chips: FilterChip[];
  onClearAll: () => void;
  onOpenFilters: () => void;
  activeFiltersCount: number;
  sortBy: string;
  onSortChange: (sort: string) => void;
  sortOptions?: SortOption[];
  viewMode: EventsViewMode;
  onViewChange: (mode: EventsViewMode) => void;
  className?: string;
}

/**
 * The results bar that stays on screen while the list scrolls
 * (docs/page-plans/events.md WP2 item 4; events-pass2 WP1 items 14 and 17):
 * count, Filters (opens EventFiltersSheet), sort, Save search and the
 * List/Map toggle, with the active filters as removable chips. It is the one
 * place each of those controls exists. On a phone the count takes the first
 * line, the controls the second (icon-only where they can be) and the chips a
 * third, sideways-scrolling one.
 *
 * Its height is published on :root as --events-bar-h from a ResizeObserver,
 * so the day headers below stick right under it however many lines it wraps
 * to. They used to guess with top-44 / top-32.
 *
 * On a phone it slides away while the reader scrolls down and comes back on
 * any scroll up (WEB-UX-061). Pinned, it was 87px of a 667px screen on top of
 * the header, the day header and the bottom nav: 41% of the viewport held
 * still and about 395px left for listings. While it is away it publishes 0 so
 * the day header moves up under the site header and the day stays on screen.
 * Keyboard focus entering it brings it back, so it is never focused unseen.
 */
export function EventsStickyBar({
  countLabel,
  chips,
  onClearAll,
  onOpenFilters,
  activeFiltersCount,
  sortBy,
  onSortChange,
  sortOptions = EVENT_SORT_OPTIONS,
  viewMode,
  onViewChange,
  className,
}: EventsStickyBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isPhone = useMediaQuery(TUCK_AWAY_QUERY);
  const { hidden, reveal } = useHideOnScrollDown({
    enabled: isPhone,
    sentinelRef,
    stuckAt: BAR_STUCK_AT_PX,
  });
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    const node = barRef.current;
    if (!node || typeof document === "undefined") return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(EVENTS_BAR_HEIGHT_VAR, `${hiddenRef.current ? 0 : node.offsetHeight}px`);
    publish();
    if (typeof window.ResizeObserver === "undefined") {
      return () => root.style.removeProperty(EVENTS_BAR_HEIGHT_VAR);
    }
    const observer = new window.ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(EVENTS_BAR_HEIGHT_VAR);
    };
  }, [hidden]);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />
      <div
        ref={barRef}
        onFocus={reveal}
        data-tucked={hidden ? "true" : undefined}
        className={cn(
          "sticky top-16 z-30 border-b bg-background py-2 transition-transform duration-200 ease-out motion-reduce:transition-none",
          // Past the top edge, not just behind the header: the header is
          // translucent, and a bar parked under it would show through.
          hidden && "-translate-y-[calc(100%_+_4rem)]",
          className
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="w-full min-w-0 truncate text-sm font-medium text-foreground sm:w-auto sm:flex-none">
            {countLabel}
          </p>

          {chips.length > 0 && (
            <ActiveFilterChips
              chips={chips}
              onClearAll={onClearAll}
              layout="scroll"
              className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
            />
          )}

          <div className="flex w-full shrink-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1.5 px-3"
              onClick={onOpenFilters}
              aria-haspopup="dialog"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {activeFiltersCount}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </Button>
            <SortDropdown options={sortOptions} value={sortBy} onChange={onSortChange} compact />
            <SaveSearchButton compact />
            <div
              role="group"
              aria-label="View"
              className="ml-auto inline-flex rounded-md border bg-background sm:ml-0"
            >
              {(["list", "map"] as const).map((mode) => {
                const Icon = mode === "list" ? List : MapIcon;
                const pressed = viewMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={pressed}
                    aria-label={mode === "list" ? "List" : "Map"}
                    title={mode === "list" ? "List" : "Map"}
                    onClick={() => onViewChange(mode)}
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pressed ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
