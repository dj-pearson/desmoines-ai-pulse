import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterChip {
  /** Stable key. */
  key: string;
  /** Human-readable label, e.g. `Cuisine: Italian`. */
  label: string;
  /** Remove just this filter. */
  onRemove: () => void;
}

/**
 * Removable active-filter chips with a "Clear all" (WEB-UX-003). Visible at all
 * viewports; each chip removes one filter, paired with URL-synced filter state
 * (WEB-UX-001) so removal updates the shareable URL. Renders nothing when there
 * are no active filters.
 *
 * The whole chip is the remove button. The old X inside a Badge was a 16px
 * target (docs/page-plans/events.md WP2 item 5); the chip now meets 44px.
 *
 * `layout="scroll"` keeps the chips on one line that scrolls sideways, for
 * the events sticky bar where a wrapped second row would push results down.
 */
export function ActiveFilterChips({
  chips,
  onClearAll,
  className,
  layout = "wrap",
  showLabel = true,
}: {
  chips: FilterChip[];
  onClearAll: () => void;
  className?: string;
  layout?: "wrap" | "scroll";
  showLabel?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        layout === "wrap" ? "flex-wrap" : "flex-nowrap overflow-x-auto scrollbar-hide",
        className
      )}
    >
      {showLabel && <span className="shrink-0 text-sm text-muted-foreground">Active filters:</span>}
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label}`}
          className="inline-flex shrink-0 items-center gap-1.5 min-h-[44px] rounded-full bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
        >
          {chip.label}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex shrink-0 items-center min-h-[44px] rounded-full px-3 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
      >
        Clear all
      </button>
    </div>
  );
}
