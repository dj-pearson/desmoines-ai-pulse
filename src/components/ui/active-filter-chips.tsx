import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FilterChip {
  /** Stable key for React lists. */
  key: string;
  /** Human-readable chip label, e.g. `Cuisine: Italian`. */
  label: string;
  /** Remove just this filter. */
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: FilterChip[];
  onClearAll: () => void;
  /** Optional leading label (defaults to "Filters:"). */
  leadingLabel?: string;
  className?: string;
}

/**
 * Removable active-filter chips with a "Clear all" affordance, shown above the
 * results grid. Visible at ALL viewports (WEB-UX-003) — unlike the in-hero
 * filter pills it does not scroll away, so users always see what is applied.
 * Renders nothing when there are no active filters.
 */
export function ActiveFilterChips({
  chips,
  onClearAll,
  leadingLabel = "Filters:",
  className,
}: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-testid="active-filter-chips"
    >
      <span className="text-xs font-medium text-muted-foreground">{leadingLabel}</span>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 pl-2.5 pr-1 py-1 text-xs rounded-full bg-white dark:bg-card shadow-sm border"
        >
          <span className="max-w-[14rem] truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove filter ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-xs font-medium text-[#DC143C] hover:text-[#DC143C]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        Clear all
      </button>
    </div>
  );
}
