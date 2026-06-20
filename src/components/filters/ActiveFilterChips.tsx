import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 */
export function ActiveFilterChips({
  chips,
  onClearAll,
  className,
}: {
  chips: FilterChip[];
  onClearAll: () => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground">Active filters:</span>
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-1 hover:bg-accent rounded-full p-0.5"
            aria-label={`Remove ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-7 text-xs text-muted-foreground"
      >
        Clear all
      </Button>
    </div>
  );
}
