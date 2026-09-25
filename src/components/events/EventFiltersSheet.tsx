import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventSmartPresets } from "@/components/EventSmartPresets";
import {
  EVENT_DATE_PRESET_OPTIONS,
  LOCATION_OPTIONS,
  PRICE_OPTIONS,
  type EventPresetFilters,
  type FilterOption,
} from "@/lib/eventPresets";
import { EVENT_SORT_OPTIONS, type SortOption } from "@/components/SortDropdown";
import { cn } from "@/lib/utils";

// react-day-picker is only needed once someone opens the date picker, so it
// stays out of the EventsPage chunk (docs/page-plans/events.md WP2 item 6).
const InteractiveDateSelector = lazy(() => import("@/components/InteractiveDateSelector"));

/** What the date picker reports; the page stores it as `?preset=` or `?from=`/`?to=`. */
export type EventDateChange = {
  start?: Date;
  end?: Date;
  mode: "single" | "range" | "preset";
  preset?: string;
} | null;

/**
 * Passed as the last argument of every write the sheet makes. The first write
 * after the sheet opens has `replace: false` and pushes one history entry;
 * every later write in the same session has `replace: true`, so Back after
 * five taps in the sheet leaves the page instead of stepping through each tap
 * (events-pass2 WP2 item 8). A handler that ignores it keeps pushing.
 */
export interface SheetWriteOptions {
  replace: boolean;
}

export interface EventFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string, options?: SheetWriteOptions) => void;

  location: string;
  onLocationChange: (location: string, options?: SheetWriteOptions) => void;

  priceRange: string;
  onPriceRangeChange: (priceRange: string, options?: SheetWriteOptions) => void;

  /** Active `?preset=` value, "" when none. */
  datePreset: string;
  /**
   * Set the preset ("" for any date). The page must clear `?from=`/`?to=` in
   * the same navigation (useUrlFilters.setMany): two setSearchParams calls in
   * one handler each start from the old URL and the second wins.
   */
  onDatePresetChange: (preset: string, options?: SheetWriteOptions) => void;
  /** A picked day or range (the page stores it as `?from=`/`?to=`). */
  onDateChange: (date: EventDateChange, options?: SheetWriteOptions) => void;
  /** Label of a picked custom date, shown when no preset is active. */
  customDateLabel?: string;

  sortBy: string;
  onSortChange: (sort: string, options?: SheetWriteOptions) => void;
  sortOptions?: readonly SortOption[];

  /**
   * Quick picks (events-pass2 WP2 item 7). A preset writes category, price and
   * date in one navigation, so the page passes its own setMany-backed handler;
   * the section is left out until it does.
   */
  onApplyPreset?: (filters: EventPresetFilters, options?: SheetWriteOptions) => void;
  onClearPreset?: (filters: EventPresetFilters, options?: SheetWriteOptions) => void;

  activeFiltersCount: number;
  onClearAll: (options?: SheetWriteOptions) => void;
  /** Footer button text, e.g. "Show 412 events". Defaults to "Show results". */
  resultLabel?: string;
  /**
   * The list behind the sheet is still showing the previous filters' rows.
   * The footer button is disabled until fresh data lands, so it never offers
   * a count that belongs to the old filters (events-pass2 WP1 item 13).
   */
  resultPending?: boolean;
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

function CategoryOptions({
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

function ListOptions({
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

/** The date picker, downloaded on first render of this component. */
function LazyDateSelector({
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Every hub filter in one bottom sheet: quick picks, date, category, area,
 * price and sort (docs/page-plans/events.md WP2 item 4). Each choice writes the
 * URL as it is made, so the list behind the sheet is already filtered; the
 * footer button only closes the sheet. The page owns the state and passes it in.
 */
export function EventFiltersSheet({
  open,
  onOpenChange,
  categories,
  selectedCategory,
  onCategoryChange,
  location,
  onLocationChange,
  priceRange,
  onPriceRangeChange,
  datePreset,
  onDatePresetChange,
  onDateChange,
  customDateLabel,
  sortBy,
  onSortChange,
  sortOptions = EVENT_SORT_OPTIONS,
  onApplyPreset,
  onClearPreset,
  activeFiltersCount,
  onClearAll,
  resultLabel,
  resultPending = false,
}: EventFiltersSheetProps) {
  // The calendar (react-day-picker) loads only when someone asks for it.
  const [showPicker, setShowPicker] = useState(false);

  // One history entry per sheet session (item 8): the first write pushes,
  // the rest replace it. Reset each time the sheet opens.
  const wroteThisSession = useRef(false);
  useEffect(() => {
    if (open) wroteThisSession.current = false;
  }, [open]);
  const writeOptions = (): SheetWriteOptions => {
    const replace = wroteThisSession.current;
    wroteThisSession.current = true;
    return { replace };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0"
        aria-describedby="event-filters-sheet-description"
      >
        <SheetHeader className="border-b px-4 py-4 text-left">
          <SheetTitle>Filter events</SheetTitle>
          <SheetDescription id="event-filters-sheet-description">
            Results update as you choose.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {onApplyPreset && onClearPreset && (
            <Section title="Quick picks">
              <EventSmartPresets
                current={{
                  category: selectedCategory !== "all" ? selectedCategory : undefined,
                  priceRange: priceRange !== "any-price" ? priceRange : undefined,
                  datePreset: datePreset || undefined,
                }}
                onApplyPreset={(filters) => onApplyPreset(filters, writeOptions())}
                onClearPreset={(filters) => onClearPreset(filters, writeOptions())}
              />
            </Section>
          )}

          <Section title="Date">
            <div className="flex flex-wrap gap-2">
              {EVENT_DATE_PRESET_OPTIONS.map((option) => {
                const selected =
                  option.value === "" ? !datePreset && !customDateLabel : datePreset === option.value;
                return (
                  <Button
                    key={option.value || "any"}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className="h-11 rounded-xl"
                    aria-pressed={selected}
                    onClick={() => onDatePresetChange(option.value, writeOptions())}
                  >
                    {option.label}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant={customDateLabel && !datePreset ? "default" : "outline"}
                className="h-11 rounded-xl"
                aria-pressed={Boolean(customDateLabel && !datePreset)}
                aria-expanded={showPicker}
                onClick={() => setShowPicker((v) => !v)}
              >
                {customDateLabel && !datePreset ? customDateLabel : "Pick a date"}
              </Button>
            </div>
            {showPicker && (
              <LazyDateSelector onDateChange={(d) => onDateChange(d, writeOptions())} className="w-full" />
            )}
          </Section>

          <Section title="Category">
            <CategoryOptions
              categories={categories}
              selected={selectedCategory}
              onChange={(v) => onCategoryChange(v, writeOptions())}
            />
          </Section>

          <Section title="Area">
            <ListOptions
              options={LOCATION_OPTIONS}
              selected={location}
              onChange={(v) => onLocationChange(v, writeOptions())}
            />
          </Section>

          <Section title="Price">
            <ListOptions
              options={PRICE_OPTIONS}
              selected={priceRange}
              onChange={(v) => onPriceRangeChange(v, writeOptions())}
            />
          </Section>

          <Section title="Sort by">
            <ListOptions options={sortOptions} selected={sortBy} onChange={(v) => onSortChange(v, writeOptions())} />
          </Section>
        </div>

        <SheetFooter className="flex-row gap-2 border-t px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => onClearAll(writeOptions())}
            disabled={activeFiltersCount === 0}
          >
            Clear all
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 sm:flex-none"
            onClick={() => onOpenChange(false)}
            disabled={resultPending}
            aria-busy={resultPending || undefined}
          >
            {resultLabel ?? "Show results"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
