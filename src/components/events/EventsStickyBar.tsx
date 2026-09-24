import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveFilterChips, type FilterChip } from "@/components/filters/ActiveFilterChips";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SortDropdown, EVENT_SORT_OPTIONS, type SortOption } from "@/components/SortDropdown";
import { cn } from "@/lib/utils";

export interface EventsStickyBarProps {
  /**
   * The honest count, formatted by the page, e.g. "30 of 412 events". Not a
   * live region: the page announces the count once, elsewhere.
   */
  countLabel: React.ReactNode;
  chips: FilterChip[];
  onClearAll: () => void;
  onOpenFilters: () => void;
  activeFiltersCount: number;
  sortBy: string;
  onSortChange: (sort: string) => void;
  sortOptions?: SortOption[];
  className?: string;
}

/**
 * The results bar that stays on screen while the list scrolls
 * (docs/page-plans/events.md WP2 item 4): count, Filters (opens
 * EventFiltersSheet), sort and Save search, with the active filters as
 * removable chips. Sort and Save go icon-only on a phone so the controls fit
 * one row at 360px; the chips take a second, sideways-scrolling line there
 * and share the row from `sm` up. Save search shows at every width.
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
  className,
}: EventsStickyBarProps) {
  return (
    <div
      className={cn(
        "sticky top-16 z-30 border-b bg-background py-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:flex-none">
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

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
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
        </div>
      </div>
    </div>
  );
}
