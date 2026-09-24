import { useState, useCallback, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChefHat, DollarSign, Star, Leaf, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import type { RestaurantFilterOptions } from "@/components/RestaurantFilters";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useCuisineCounts } from "@/hooks/useRestaurants";
import { DIETARY_OPTIONS } from "@/lib/restaurantPresets";
import { cn } from "@/lib/utils";

interface RestaurantInlineFiltersProps {
  filters: RestaurantFilterOptions;
  onFiltersChange: (filters: RestaurantFilterOptions) => void;
  /** Fallback cuisine list, used only while the counted facet has not loaded. */
  availableCuisines: string[];
  /**
   * @deprecated Unused. The Area pill listed one street address per restaurant
   * and useUrlFilters splits list params on commas, so picking one returned
   * nothing. Named areas come back with plan D3. Kept optional so callers
   * compile until they stop passing it.
   */
  availableLocations?: string[];
  /** @deprecated Unused since the duplicate chip row went; ActiveFilterChips shows the count. */
  totalResults?: number;
  /** @deprecated Unused, see totalResults. */
  isLoading?: boolean;
}

const PRICE_OPTIONS = [
  { value: "$", label: "$", description: "Under $15" },
  { value: "$$", label: "$$", description: "$15-30" },
  { value: "$$$", label: "$$$", description: "$30-50" },
  { value: "$$$$", label: "$$$$", description: "$50+" },
];

const RATING_STEPS = [0, 3, 3.5, 4, 4.5];

/** Above this many cuisines the popover gets a type-to-filter box. */
const CUISINE_FILTER_THRESHOLD = 15;

const OPTION_BASE =
  "min-h-[44px] rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const OPTION_ON = "bg-primary text-primary-foreground";
const OPTION_OFF = "bg-muted text-foreground hover:bg-muted/70";

// A compact filter pill that opens a popover with options
function FilterPill({
  label,
  icon: Icon,
  activeCount,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = activeCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors whitespace-nowrap",
            active
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-muted"
          )}
          aria-expanded={open}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          {active && (
            <Badge className="h-4 min-w-4 px-1 text-[10px] bg-primary-foreground/25 text-primary-foreground border-0">
              {activeCount}
            </Badge>
          )}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(20rem,90vw)] p-3"
        sideOffset={8}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
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

/**
 * Radix puts role="slider" on the thumb and names it only from the thumb's
 * own aria-label, which the shared ui/slider primitive does not forward. Label
 * the thumb directly so axe does not report an unnamed slider.
 */
function labelSliderThumb(label: string) {
  return (root: HTMLElement | null) => {
    root?.querySelector('[role="slider"]')?.setAttribute("aria-label", label);
  };
}

function RatingFilter({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (min: number) => void;
}) {
  // Local while dragging; the URL (and so the query and history) changes once,
  // on commit. Writing on every onValueChange made a 0 -> 4.5 drag nine
  // history entries and nine requests.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Minimum rating</span>
        <span className="text-sm font-bold text-primary">{draft}+ stars</span>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
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
        <Slider
          ref={labelSliderThumb("Minimum rating")}
          aria-label="Minimum rating"
          value={[draft]}
          onValueChange={([val]) => setDraft(val)}
          onValueCommit={([val]) => onCommit(val)}
          max={5}
          min={0}
          step={0.5}
          className="w-full py-3"
        />
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
  options: { cuisine: string; count: number | null }[];
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

export function RestaurantInlineFilters({
  filters,
  onFiltersChange,
  availableCuisines,
}: RestaurantInlineFiltersProps) {
  const { cuisineCounts } = useCuisineCounts();

  const toggleArrayFilter = useCallback(
    (key: "cuisine" | "priceRange" | "tags", value: string) => {
      const current = filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      onFiltersChange({ ...filters, [key]: next });
    },
    [filters, onFiltersChange]
  );

  // Every cuisine, with its count when the facet has one. A cuisine already in
  // the URL but absent from the facet stays listed so it can be turned off.
  const cuisineOptions = useMemo(() => {
    const base: { cuisine: string; count: number | null }[] =
      cuisineCounts.length > 0
        ? cuisineCounts.map((c) => ({ cuisine: c.cuisine, count: c.count }))
        : availableCuisines.map((cuisine) => ({ cuisine, count: null }));
    const listed = new Set(base.map((o) => o.cuisine));
    const extra = filters.cuisine
      .filter((c) => !listed.has(c))
      .map((cuisine) => ({ cuisine, count: null }));
    return [...extra, ...base];
  }, [cuisineCounts, availableCuisines, filters.cuisine]);

  const ratingActive = filters.rating[0] > 0 || filters.rating[1] < 5;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
      <FilterPill label="Cuisine" icon={ChefHat} activeCount={filters.cuisine.length}>
        <CuisineFilter
          selected={filters.cuisine}
          options={cuisineOptions}
          onToggle={(c) => toggleArrayFilter("cuisine", c)}
          onClear={() => onFiltersChange({ ...filters, cuisine: [] })}
        />
      </FilterPill>

      <FilterPill label="Price" icon={DollarSign} activeCount={filters.priceRange.length}>
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
                  className={cn(OPTION_BASE, "flex flex-col items-center p-2", isSelected ? OPTION_ON : OPTION_OFF)}
                >
                  <span className="text-base font-bold">{option.label}</span>
                  <span className={cn("text-[11px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </FilterPill>

      <FilterPill label="Rating" icon={Star} activeCount={ratingActive ? 1 : 0}>
        <RatingFilter
          value={filters.rating[0]}
          onCommit={(min) => onFiltersChange({ ...filters, rating: [min, 5] })}
        />
      </FilterPill>

      <FilterPill
        label="Dietary"
        icon={Leaf}
        activeCount={filters.tags.filter((t) => DIETARY_OPTIONS.some((d) => d.value === t)).length}
      >
        <div className="space-y-2">
          <span className="text-sm font-semibold">Dietary preferences</span>
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
                  <span>{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 ml-auto" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </FilterPill>

      {/* Open Now is not offered here: nothing server-side filters on it yet
          (plan D2), so the hub links to /restaurants/open-now instead. */}
      <FilterPill label="More" icon={SlidersHorizontal} activeCount={filters.featuredOnly ? 1 : 0}>
        <div className="space-y-3">
          <span className="text-sm font-semibold">More options</span>
          <label className="flex items-center justify-between min-h-[44px] p-2.5 rounded-xl bg-muted cursor-pointer">
            <span className="flex items-center gap-2">
              <SpriteIcon name="sparkles" className="h-4 w-4 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium">Featured only</span>
                <span className="block text-xs text-muted-foreground">Editor's picks</span>
              </span>
            </span>
            <Switch
              checked={filters.featuredOnly}
              onCheckedChange={(checked) => onFiltersChange({ ...filters, featuredOnly: checked })}
            />
          </label>
        </div>
      </FilterPill>
    </div>
  );
}
