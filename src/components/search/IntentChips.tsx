import { X } from "lucide-react";
import type { AppliedFilter } from "@/hooks/useSearchResults";
import type { FilterKey } from "@/lib/searchUrlState";

interface IntentChipsProps {
  /** Constraints nlp-search turned into SQL. Absent on a deployment that predates WP1. */
  applied?: readonly AppliedFilter[];
  /** Things the search read but did not filter on, as labels. */
  unapplied?: readonly string[];
  onRemove: (key: FilterKey) => void;
  /** True while a removal is being re-queried. */
  busy?: boolean;
}

/**
 * What the search filtered on, each removable, and what it read but did not
 * filter on (search plan WP2 item 5, bet 1).
 *
 * Built only from the function's own report. When the deployed function sends
 * no appliedFilters there is nothing honest to show, so this renders nothing:
 * the old "Understood:" line read back the parse, which listed pet-friendly and
 * near-downtown although no query applied them.
 */
export function IntentChips({ applied, unapplied, onRemove, busy = false }: IntentChipsProps) {
  const chips = applied ?? [];
  const notFiltered = unapplied ?? [];
  if (chips.length === 0 && notFiltered.length === 0) return null;

  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onRemove(chip.key)}
              disabled={busy}
              aria-label={`Remove ${chip.label}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {chip.label}
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {notFiltered.length > 0 && (
        <p className="text-sm text-muted-foreground">Not filtered: {notFiltered.join(", ")}</p>
      )}
    </div>
  );
}
