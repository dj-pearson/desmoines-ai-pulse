import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ActiveFilterChips, type FilterChip } from "@/components/filters/ActiveFilterChips";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DIETS } from "@/hooks/useDietaryRestaurants";
import type { Coordinates } from "@/hooks/useOpenNowRestaurants";
import { EVENT_AREAS } from "@/lib/eventAreas";
import { cn } from "@/lib/utils";

/**
 * The /restaurants/open-now filter form (WEB-UX-084).
 *
 * From md up it is the expanded form it always was. On a phone it is one row,
 * Open at, Near me and a Filters button carrying the active count, and the
 * rest (area, diet, one more hour, cuisine, city, dish) sits in a bottom
 * sheet. The filters that are on show as removable chips under the row, so
 * nobody has to open the sheet to see or drop one. The secondary fields are
 * mounted in exactly one place per viewport, so their labels stay unique.
 */

/** URL keys the Filters sheet owns; "at" stays in the row. */
const OPEN_NOW_PANEL_KEYS = ["cuisine", "city", "hour", "area", "diet", "dish"];

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type NearMeState =
  | { kind: "off" }
  | { kind: "locating" }
  | { kind: "on"; origin: Coordinates }
  | { kind: "failed"; message: string };

type SetParam = (key: string, value: string, opts?: { replace?: boolean }) => void;

interface FacetOption {
  value: string;
  count: number;
}

export interface OpenNowFiltersProps {
  /** Current "Open at" select value, "" for now. */
  atValue: string;
  atOptions: ReadonlyArray<{ value: string; label: string }>;
  areaSlug: string;
  areaLabel: string | null;
  dietId: string;
  dietLabel: string | null;
  oneMoreHour: boolean;
  cuisine: string;
  city: string;
  dish: string;
  cuisineOptions: readonly FacetOption[];
  cityOptions: readonly FacetOption[];
  nearMe: NearMeState;
  onNearMeToggle: () => void;
  setParam: SetParam;
  clearParams: (keys: string[]) => void;
  /** Keys "Clear filters" removes on the desktop form. */
  clearKeys: string[];
  showClear: boolean;
  /** Places the list shows now, for the sheet's close button. Null while loading. */
  resultCount: number | null;
}

/** A single-select row of chips. Pressing the pressed chip clears it. */
function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly FacetOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-muted-foreground">{label}</span>
      {options.map((option) => {
        const pressed = option.value.toLowerCase() === value.toLowerCase();
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            className="min-h-11"
            onClick={() => onChange(pressed ? "" : option.value)}
          >
            {option.value}
          </Button>
        );
      })}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

export function OpenNowFilters(props: OpenNowFiltersProps) {
  const {
    atValue,
    atOptions,
    areaSlug,
    areaLabel,
    dietId,
    dietLabel,
    oneMoreHour,
    cuisine,
    city,
    dish,
    cuisineOptions,
    cityOptions,
    nearMe,
    onNearMeToggle,
    setParam,
    clearParams,
    clearKeys,
    showClear,
    resultCount,
  } = props;
  const formId = useId();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [sheetOpen, setSheetOpen] = useState(false);

  const chips: FilterChip[] = [];
  if (cuisine) chips.push({ key: "cuisine", label: `Cuisine: ${cuisine}`, onRemove: () => setParam("cuisine", "") });
  if (city) chips.push({ key: "city", label: `City: ${city}`, onRemove: () => setParam("city", "") });
  if (areaLabel) chips.push({ key: "area", label: `Area: ${areaLabel}`, onRemove: () => setParam("area", "") });
  if (dietLabel) chips.push({ key: "diet", label: `Diet: ${dietLabel}`, onRemove: () => setParam("diet", "") });
  if (oneMoreHour) chips.push({ key: "hour", label: "Open 1+ more hour", onRemove: () => setParam("hour", "") });
  if (dish) chips.push({ key: "dish", label: `Dish: ${dish}`, onRemove: () => setParam("dish", "") });

  const secondarySelects = (
    <>
      <SelectField
        id={`${formId}-area`}
        label="Area"
        value={areaSlug}
        onChange={(v) => setParam("area", v)}
      >
        <option value="">Anywhere in the metro</option>
        {EVENT_AREAS.map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        id={`${formId}-diet`}
        label="Diet mentioned"
        value={dietId}
        onChange={(v) => setParam("diet", v)}
      >
        <option value="">Any</option>
        {DIETS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </SelectField>
      <Button
        type="button"
        variant={oneMoreHour ? "default" : "outline"}
        aria-pressed={oneMoreHour}
        className="min-h-11"
        onClick={() => setParam("hour", oneMoreHour ? "" : "1")}
      >
        Open 1+ more hour
      </Button>
    </>
  );

  const facets = (
    <>
      <ChipGroup label="Cuisine" options={cuisineOptions} value={cuisine} onChange={(v) => setParam("cuisine", v)} />
      <ChipGroup label="City" options={cityOptions} value={city} onChange={(v) => setParam("city", v)} />
      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor={`${formId}-dish`} className="text-sm font-medium">
          Find a dish
        </label>
        <Input
          id={`${formId}-dish`}
          type="search"
          placeholder="e.g. pho, tacos, cheese curds"
          value={dish}
          className="h-11"
          onChange={(e) => setParam("dish", e.target.value, { replace: true })}
        />
      </div>
    </>
  );

  return (
    <>
      <form
        className="mb-6 space-y-3 md:mb-8 md:space-y-4 md:rounded-xl md:bg-muted/50 md:p-4"
        aria-label="Filter restaurants"
        onSubmit={(e) => e.preventDefault()}
        data-open-now-filters
      >
        <div className="flex items-end gap-2 md:flex-wrap md:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-none">
            <label htmlFor={`${formId}-at`} className="sr-only md:not-sr-only md:text-sm md:font-medium">
              Open at
            </label>
            <select
              id={`${formId}-at`}
              className={cn(SELECT_CLASS, "w-full md:w-auto")}
              value={atValue}
              onChange={(e) => setParam("at", e.target.value)}
            >
              <option value="">{isDesktop ? "Now" : "Open now"}</option>
              {atOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {isDesktop && secondarySelects}
          <Button
            type="button"
            variant={nearMe.kind === "on" ? "default" : "outline"}
            aria-pressed={nearMe.kind === "on"}
            className="min-h-11 shrink-0 px-3 md:px-4"
            disabled={nearMe.kind === "locating"}
            onClick={onNearMeToggle}
          >
            <SpriteIcon name="map-pin" className="mr-1 h-4 w-4" aria-hidden="true" />
            {nearMe.kind === "locating" ? "Finding you..." : "Near me"}
          </Button>
          {!isDesktop && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0 gap-1.5 px-3"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
              data-open-now-filters-button
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filters
              {chips.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {chips.length}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </Button>
          )}
          {isDesktop && showClear && (
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => clearParams(clearKeys)}>
              Clear filters
            </Button>
          )}
        </div>
        {nearMe.kind === "failed" && (
          <p className="text-sm text-muted-foreground" role="status">
            {nearMe.message}
          </p>
        )}
        {nearMe.kind === "on" && (
          <p className="text-sm text-muted-foreground" role="status">
            Nearest first. Your location stays in this browser tab.
          </p>
        )}
        {isDesktop ? (
          facets
        ) : (
          <ActiveFilterChips
            chips={chips}
            onClearAll={() => clearParams(OPEN_NOW_PANEL_KEYS)}
            layout="scroll"
            showLabel={false}
          />
        )}
      </form>

      {!isDesktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="border-b px-4 py-4 text-left">
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>The list updates as you pick.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
              <div className="grid gap-4 [&>button]:w-full">{secondarySelects}</div>
              {facets}
            </div>
            <SheetFooter className="flex-row gap-2 border-t px-4 py-3">
              {chips.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => clearParams(OPEN_NOW_PANEL_KEYS)}
                >
                  Clear
                </Button>
              )}
              <Button type="button" className="min-h-11 flex-1" onClick={() => setSheetOpen(false)}>
                {resultCount === null ? "Done" : `Show ${resultCount} ${resultCount === 1 ? "place" : "places"}`}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
