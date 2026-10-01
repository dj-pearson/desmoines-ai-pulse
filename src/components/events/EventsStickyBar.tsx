import { useEffect, useRef, type ReactNode } from "react";
import { List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveFilterChips, type FilterChip } from "@/components/filters/ActiveFilterChips";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SortDropdown, EVENT_SORT_OPTIONS, type SortOption } from "@/components/SortDropdown";
import { cn } from "@/lib/utils";

/** The CSS variable day headers read to sit just under this bar. */
export const EVENTS_BAR_HEIGHT_VAR = "--events-bar-h";

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

  useEffect(() => {
    const node = barRef.current;
    if (!node || typeof document === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(EVENTS_BAR_HEIGHT_VAR, `${node.offsetHeight}px`);
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
  }, []);

  return (
    <div
      ref={barRef}
      className={cn("sticky top-16 z-30 border-b bg-background py-2", className)}
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
  );
}
