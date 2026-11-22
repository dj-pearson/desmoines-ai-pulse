import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Star, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RestaurantFilterOptions } from "@/lib/restaurantFilterOptions";
import { DIETARY_OPTIONS } from "@/lib/restaurantPresets";
import { cn } from "@/lib/utils";

export type FilterPanelKind = "cuisine" | "price" | "rating" | "dietary";

export interface CuisineOption {
  cuisine: string;
  count: number | null;
}

export interface FilterPanelProps {
  kind: FilterPanelKind;
  filters: RestaurantFilterOptions;
  onFiltersChange: (filters: RestaurantFilterOptions) => void;
  /** Every cuisine, with its count when the facet has one. */
  cuisineOptions: CuisineOption[];
}

export interface RestaurantFilterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pill, exactly as the static trigger drew it; it must forward its ref. */
  trigger: ReactElement;
  panel: FilterPanelProps;
}

/**
 * Price levels as the listing gives them (eat-drink pass 2 WP1 item 9). The
 * dollar bands that were here (a price per head for each level) were invented: price_range
 * is a level of one to four dollar signs with no amount behind it. The words
 * are the level names Google uses for the same scale.
 */
const PRICE_OPTIONS = [
  { value: "$", label: "$", description: "inexpensive" },
  { value: "$$", label: "$$", description: "moderate" },
  { value: "$$$", label: "$$$", description: "expensive" },
  { value: "$$$$", label: "$$$$", description: "very expensive" },
];

const RATING_STEPS = [0, 3, 3.5, 4, 4.5];

/** Above this many cuisines the popover gets a type-to-filter box. */
const CUISINE_FILTER_THRESHOLD = 15;

const OPTION_BASE =
  "min-h-[44px] rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const OPTION_ON = "bg-primary text-primary-foreground";
const OPTION_OFF = "bg-muted text-foreground hover:bg-muted/70";

/**
 * The Radix half of RestaurantInlineFilters' pills (WEB-PERF-078). Loaded on
 * the first click of any pill and mounted with the popover already open;
 * never import it statically (restaurantFilterPopoverLazy.test.ts). It was
 * the only Popover on /restaurants and, through RatingFilter, the only
 * Slider, so it carried react-popover, react-popper, floating-ui and
 * react-slider there. Radix focuses the content on mount and returns focus
 * to this trigger on close.
 */
export function RestaurantFilterPopover({
  open,
  onOpenChange,
  trigger,
  panel,
}: RestaurantFilterPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,90vw)] p-3" sideOffset={8}>
        <FilterPanel {...panel} />
      </PopoverContent>
    </Popover>
  );
}

function FilterPanel({ kind, filters, onFiltersChange, cuisineOptions }: FilterPanelProps) {
  const toggleArrayFilter = (key: "cuisine" | "priceRange" | "tags", value: string) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  switch (kind) {
    case "cuisine":
      return (
        <CuisineFilter
          selected={filters.cuisine}
          options={cuisineOptions}
          onToggle={(c) => toggleArrayFilter("cuisine", c)}
          onClear={() => onFiltersChange({ ...filters, cuisine: [] })}
        />
      );
    case "price":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Price range</span>
            {filters.priceRange.length > 0 && (
              <ClearButton
                onClick={() => onFiltersChange({ ...filters, priceRange: [] })}
                label="Clear price filter"
              />
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PRICE_OPTIONS.map((option) => {
              const isSelected = filters.priceRange.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleArrayFilter("priceRange", option.value)}
                  className={cn(OPTION_BASE, "flex flex-col items-center p-2 text-center", isSelected ? OPTION_ON : OPTION_OFF)}
                >
                  <span className="text-base font-bold">{option.label}</span>
                  <span className={cn("text-[11px] leading-tight", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    case "rating":
      return (
        <RatingFilter
          value={filters.rating[0]}
          onCommit={(min) => onFiltersChange({ ...filters, rating: [min, 5] })}
        />
      );
    case "dietary":
      // "Mentions in listing" (pass 2 WP1 item 9): this is a keyword match
      // on the name, cuisine and description, not a menu check.
      return (
        <div className="space-y-2">
          <span className="block text-sm font-semibold">Mentions in listing</span>
          <span className="block text-xs text-muted-foreground">
            Matches the words in a restaurant's name, cuisine or description. Call ahead to confirm.
          </span>
          <div className="space-y-1.5">
            {DIETARY_OPTIONS.map((option) => {
              const isSelected = filters.tags.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleArrayFilter("tags", option.value)}
                  className={cn(OPTION_BASE, "flex items-center gap-3 w-full px-3", isSelected ? OPTION_ON : OPTION_OFF)}
                >
                  <span>Mentions {option.label.toLowerCase()}</span>
                  {isSelected && <Check className="h-4 w-4 ml-auto" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <Link
            to="/restaurants/dietary"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            See the dietary guide
          </Link>
        </div>
      );
  }
}

function ClearButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      Clear
    </button>
  );
}

function RatingFilter({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (min: number) => void;
}) {
  // WEB-UX-090: one input. The chips and a slider set the same value, and the
  // header read "0+ stars" when nothing was set.
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" id="restaurant-min-rating-label">
          Minimum rating
        </span>
        <span className="text-sm font-bold text-primary">{value === 0 ? "Any" : `${value}+ stars`}</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="restaurant-min-rating-label">
        {RATING_STEPS.map((rating) => {
          const isSelected = value === rating;
          return (
            <button
              key={rating}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onCommit(rating)}
              className={cn(OPTION_BASE, "flex items-center gap-1 px-2.5", isSelected ? OPTION_ON : OPTION_OFF)}
            >
              <Star className="h-3 w-3 fill-current" aria-hidden="true" />
              {rating === 0 ? "Any" : `${rating}+`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CuisineFilter({
  selected,
  options,
  onToggle,
  onClear,
}: {
  selected: string[];
  options: CuisineOption[];
  onToggle: (cuisine: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const showFilter = options.length > CUISINE_FILTER_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((o) => o.cuisine.toLowerCase().includes(needle))
    : options;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Cuisine type</span>
        {selected.length > 0 && <ClearButton onClick={onClear} label="Clear cuisine filter" />}
      </div>
      {showFilter && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a cuisine"
          aria-label="Find a cuisine"
          className="h-11"
        />
      )}
      <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
        {visible.map(({ cuisine, count }) => {
          const isSelected = selected.includes(cuisine);
          return (
            <button
              key={cuisine}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(cuisine)}
              className={cn(OPTION_BASE, "flex items-center gap-1 px-2.5", isSelected ? OPTION_ON : OPTION_OFF)}
            >
              {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
              {cuisine}
              {count !== null && (
                <span className={isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground px-1 py-2">No cuisine matches "{query}".</p>
        )}
      </div>
    </div>
  );
}
