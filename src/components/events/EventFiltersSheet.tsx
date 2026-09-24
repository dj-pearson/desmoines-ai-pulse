import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CategoryOptions,
  LazyDateSelector,
  ListOptions,
  type EventDateChange,
} from "@/components/EventInlineFilters";
import {
  EVENT_DATE_PRESET_OPTIONS,
  LOCATION_OPTIONS,
  PRICE_OPTIONS,
} from "@/lib/eventPresets";
import { EVENT_SORT_OPTIONS, type SortOption } from "@/components/SortDropdown";

export interface EventFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;

  location: string;
  onLocationChange: (location: string) => void;

  priceRange: string;
  onPriceRangeChange: (priceRange: string) => void;

  /** Active `?preset=` value, "" when none. */
  datePreset: string;
  /**
   * Set the preset ("" for any date). The page must clear `?from=`/`?to=` in
   * the same navigation (useUrlFilters.setMany): two setSearchParams calls in
   * one handler each start from the old URL and the second wins.
   */
  onDatePresetChange: (preset: string) => void;
  /** A picked day or range (the page stores it as `?from=`/`?to=`). */
  onDateChange: (date: EventDateChange) => void;
  /** Label of a picked custom date, shown when no preset is active. */
  customDateLabel?: string;

  sortBy: string;
  onSortChange: (sort: string) => void;
  sortOptions?: readonly SortOption[];

  activeFiltersCount: number;
  onClearAll: () => void;
  /** Footer button text, e.g. "Show 412 events". Defaults to "Show results". */
  resultLabel?: string;
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
 * Every hub filter in one bottom sheet: category, area, price, date and sort
 * (docs/page-plans/events.md WP2 item 4). Each choice writes the URL as it is
 * made, so the list behind the sheet is already filtered; the footer button
 * only closes the sheet. The page owns the state and passes it in.
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
  activeFiltersCount,
  onClearAll,
  resultLabel,
}: EventFiltersSheetProps) {
  // The calendar (react-day-picker) loads only when someone asks for it.
  const [showPicker, setShowPicker] = useState(false);

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
                    onClick={() => onDatePresetChange(option.value)}
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
            {showPicker && <LazyDateSelector onDateChange={onDateChange} className="w-full" />}
          </Section>

          <Section title="Category">
            <CategoryOptions
              categories={categories}
              selected={selectedCategory}
              onChange={onCategoryChange}
            />
          </Section>

          <Section title="Area">
            <ListOptions options={LOCATION_OPTIONS} selected={location} onChange={onLocationChange} />
          </Section>

          <Section title="Price">
            <ListOptions options={PRICE_OPTIONS} selected={priceRange} onChange={onPriceRangeChange} />
          </Section>

          <Section title="Sort by">
            <ListOptions options={sortOptions} selected={sortBy} onChange={onSortChange} />
          </Section>
        </div>

        <SheetFooter className="flex-row gap-2 border-t px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={onClearAll}
            disabled={activeFiltersCount === 0}
          >
            Clear all
          </Button>
          <Button type="button" className="h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            {resultLabel ?? "Show results"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
