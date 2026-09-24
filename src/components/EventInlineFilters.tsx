import { lazy, Suspense, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Tag, DollarSign, Calendar, ChevronDown, Check } from "lucide-react";
import {
  LOCATION_OPTIONS,
  PRICE_OPTIONS,
  locationLabel,
  priceLabel,
  type FilterOption,
} from "@/lib/eventPresets";
import { cn } from "@/lib/utils";

// react-day-picker is only needed once someone opens the Date control, so it
// stays out of the EventsPage chunk (docs/page-plans/events.md WP2 item 6).
const InteractiveDateSelector = lazy(() => import("@/components/InteractiveDateSelector"));

export type EventDateChange = {
  start?: Date;
  end?: Date;
  mode: "single" | "range" | "preset";
  preset?: string;
} | null;

interface EventInlineFiltersProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  location: string;
  onLocationChange: (location: string) => void;
  priceRange: string;
  onPriceRangeChange: (priceRange: string) => void;
  onDateChange: (date: EventDateChange) => void;
  categories: string[];
  totalResults: number;
  isLoading?: boolean;
  onClearAll: () => void;
  activeFiltersCount: number;
  /** Label for the Date pill when a date is set, e.g. "Sat, Sep 27". */
  dateLabel?: string;
  /** Whether a date filter (preset or picked) is active. */
  isDateActive?: boolean;
}

const OPTION_BASE =
  "flex items-center gap-2 min-h-[44px] px-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const OPTION_ON = "bg-primary text-primary-foreground";
const OPTION_IDLE = "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground";

function OptionButton({
  selected,
  onClick,
  children,
  fullWidth,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(OPTION_BASE, fullWidth && "w-full", selected ? OPTION_ON : OPTION_IDLE)}
    >
      {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function CategoryOptions({
  categories,
  selected,
  onChange,
}: {
  categories: string[];
  selected: string;
  onChange: (category: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <OptionButton selected={selected === "all"} onClick={() => onChange("all")}>
        All categories
      </OptionButton>
      {categories.map((cat) => (
        <OptionButton key={cat} selected={selected === cat} onClick={() => onChange(cat)}>
          {cat}
        </OptionButton>
      ))}
    </div>
  );
}

export function ListOptions({
  options,
  selected,
  onChange,
}: {
  options: readonly FilterOption[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((option) => (
        <OptionButton
          key={option.value}
          fullWidth
          selected={selected === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </OptionButton>
      ))}
    </div>
  );
}

/** The date picker, loaded on first render of this component. */
export function LazyDateSelector({
  onDateChange,
  className,
}: {
  onDateChange: (date: EventDateChange) => void;
  className?: string;
}) {
  return (
    <Suspense
      fallback={<div className="h-11 rounded-xl bg-muted animate-pulse" aria-label="Loading date picker" />}
    >
      <InteractiveDateSelector onDateChange={onDateChange} className={className} />
    </Suspense>
  );
}

// Compact filter pill with popover
function FilterPill({
  label,
  icon: Icon,
  isActive,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${
            isActive
              ? "bg-white text-slate-900 border-white"
              : "bg-white/10 text-white/80 border-white/10 hover:bg-white/20 hover:text-white"
          }`}
          aria-expanded={open}
          aria-label={`Filter by ${label}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,90vw)] p-3" sideOffset={8}>
        {/* The Date picker only mounts (and only downloads) while open. */}
        {open ? children : null}
      </PopoverContent>
    </Popover>
  );
}

export function EventInlineFilters({
  selectedCategory,
  onCategoryChange,
  location,
  onLocationChange,
  priceRange,
  onPriceRangeChange,
  onDateChange,
  categories,
  totalResults,
  isLoading,
  onClearAll,
  activeFiltersCount,
  dateLabel,
  isDateActive = false,
}: EventInlineFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Filter pills row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <FilterPill
          label={selectedCategory !== "all" ? selectedCategory : "Category"}
          icon={Tag}
          isActive={selectedCategory !== "all"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Event category</span>
            <div className="max-h-64 overflow-y-auto">
              <CategoryOptions
                categories={categories ?? []}
                selected={selectedCategory}
                onChange={onCategoryChange}
              />
            </div>
          </div>
        </FilterPill>

        <FilterPill
          label={location !== "any-location" ? locationLabel(location) || "Area" : "Area"}
          icon={MapPin}
          isActive={location !== "any-location"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Area</span>
            <div className="max-h-72 overflow-y-auto">
              <ListOptions options={LOCATION_OPTIONS} selected={location} onChange={onLocationChange} />
            </div>
          </div>
        </FilterPill>

        <FilterPill
          label={priceRange !== "any-price" ? priceLabel(priceRange) || "Price" : "Price"}
          icon={DollarSign}
          isActive={priceRange !== "any-price"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Price</span>
            <ListOptions options={PRICE_OPTIONS} selected={priceRange} onChange={onPriceRangeChange} />
          </div>
        </FilterPill>

        <FilterPill label={isDateActive && dateLabel ? dateLabel : "Date"} icon={Calendar} isActive={isDateActive}>
          <div className="space-y-2">
            <span className="text-sm font-semibold">Pick a date</span>
            <LazyDateSelector onDateChange={onDateChange} className="w-full" />
          </div>
        </FilterPill>
      </div>

      {/* Active filter summary */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/70">
            {isLoading ? "Searching..." : `${totalResults} results`}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-[44px] px-2 text-xs text-white underline underline-offset-2 hover:text-white/80 font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
