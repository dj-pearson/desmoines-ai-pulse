import { useId } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SearchResultCard } from "@/components/search/SearchResultCard";
import type { EventPairing } from "@/hooks/useSearchPairings";
import type { SearchRow } from "@/hooks/useSearchResults";
import type { SearchResultType } from "@/lib/searchResultHref";
import { SECTION_LABELS } from "@/lib/searchUrlState";

/** How many cards a section shows on the "All" view. */
const SECTION_PREVIEW = 6;

interface SearchResultSectionProps {
  type: SearchResultType;
  rows: readonly SearchRow[];
  /** The most rows the source returns for a type. A section at it reads "Top N". */
  cap: number;
  /** The term the hub link carries, so "See all" searches for what matched here. */
  hubTerm: string;
  /** Show every row (a type tab is selected) rather than the preview. */
  expanded: boolean;
  pairings?: ReadonlyMap<string, EventPairing>;
  onShowAll?: (type: SearchResultType) => void;
  onOpen?: (item: SearchRow, type: SearchResultType) => void;
}

/** "14", or "Top 20" when the source stopped at its limit and there may be more. */
function sectionCountLabel(count: number, cap: number): string {
  return count >= cap ? `Top ${cap}` : String(count);
}

/**
 * Where "See all" goes. Each hub reads `q` from its URL today; /stay has no
 * search in its URL yet (Plan & Stay WP2), so it links the plain hub.
 */
function hubHref(type: SearchResultType, term: string): string {
  const q = encodeURIComponent(term);
  switch (type) {
    case "events":
      return `/events?q=${q}`;
    case "restaurants":
      return `/restaurants?q=${q}`;
    case "attractions":
      return `/attractions?q=${q}`;
    case "hotels":
      return "/stay";
  }
}

function hubLinkText(type: SearchResultType, term: string): string {
  switch (type) {
    case "events":
      return `See all events for "${term}"`;
    case "restaurants":
      return `See all restaurants for "${term}"`;
    case "attractions":
      return `See all places for "${term}"`;
    case "hotels":
      return "Browse all places to stay";
  }
}

export function SearchResultSection({
  type,
  rows,
  cap,
  hubTerm,
  expanded,
  pairings,
  onShowAll,
  onOpen,
}: SearchResultSectionProps) {
  const headingId = useId();
  const label = SECTION_LABELS[type];
  const shown = expanded ? rows : rows.slice(0, SECTION_PREVIEW);
  const hidden = rows.length - shown.length;

  return (
    <section aria-labelledby={headingId} className="space-y-4" data-section={type}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-xl font-semibold">
          {label} <span className="font-normal text-muted-foreground">{sectionCountLabel(rows.length, cap)}</span>
        </h2>
        <Link
          to={hubHref(type, hubTerm)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {hubLinkText(type, hubTerm)}
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <li key={`${type}-${item.id}`}>
            <SearchResultCard item={item} type={type} pairing={pairings?.get(item.id)} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {hidden > 0 && onShowAll && (
        <Button variant="outline" className="min-h-11" onClick={() => onShowAll(type)}>
          Show all {rows.length} {label.toLowerCase()}
        </Button>
      )}
    </section>
  );
}
