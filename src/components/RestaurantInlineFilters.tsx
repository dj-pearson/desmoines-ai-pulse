import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ComponentType,
} from "react";
import { Badge } from "@/components/ui/badge";
import { ChefHat, DollarSign, Star, Leaf, ChevronDown } from "lucide-react";
import type { RestaurantFilterOptions } from "@/lib/restaurantFilterOptions";
import { useCuisineCounts } from "@/hooks/useRestaurants";
import { DIETARY_OPTIONS } from "@/lib/restaurantPresets";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import type {
  FilterPanelKind,
  FilterPanelProps,
  RestaurantFilterPopoverProps,
} from "@/components/RestaurantFilterPopover";

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

type LivePopover = ComponentType<RestaurantFilterPopoverProps>;

let loaded: LivePopover | null = null;
let pending: Promise<LivePopover> | null = null;

/** Fetch the Radix half once; a failed fetch can be retried on the next click. */
function loadPopover(): Promise<LivePopover> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("@/components/RestaurantFilterPopover").then(
    (m) => (loaded = m.RestaurantFilterPopover),
    (error: unknown) => {
      pending = null;
      throw error;
    }
  );
  return pending;
}

function prefetch() {
  loadPopover().catch(() => {
    // The click retries and reports; a failed hover prefetch is not an error.
  });
}

type PillIcon = ComponentType<{ className?: string }>;

interface PillButtonProps extends ComponentPropsWithoutRef<"button"> {
  label: string;
  icon: PillIcon;
  activeCount: number;
  open: boolean;
}

/** The pill itself, drawn the same before and after the popover loads. */
const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ label, icon: Icon, activeCount, open, className, ...props }, ref) => {
    const active = activeCount > 0;
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // Compact below sm, no icon and tighter padding, so all four pills
          // fit one row at 375px and up (WEB-UX-086). The count badge is also
          // dropped below sm: the filled pill says it is on and the chip row
          // under it says what, and the badge pushed Dietary off-screen.
          "flex shrink-0 items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-colors whitespace-nowrap",
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-foreground border-border hover:bg-muted",
          className
        )}
        aria-expanded={open}
        {...props}
      >
        <Icon className="hidden sm:block h-3.5 w-3.5" />
        {label}
        {active && (
          <Badge className="max-sm:hidden h-4 min-w-4 px-1 text-[10px] bg-primary-foreground/25 text-primary-foreground border-0">
            {activeCount}
          </Badge>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    );
  }
);
PillButton.displayName = "PillButton";

/**
 * A compact filter pill that opens a popover with options.
 *
 * WEB-PERF-078. Until the first click this is a plain button with the closed
 * ARIA state Radix's PopoverTrigger sets. The click (Enter and Space reach it
 * through the button's default action) fetches RestaurantFilterPopover, which
 * holds the Radix Popover, the panels and the rating Slider, and swaps it in
 * already open. It swaps on click, not pointerdown, so no stray pointerup
 * lands on the fresh popover. Hover, focus and pointerdown prefetch the chunk
 * so the swap rarely waits.
 */
function FilterPill({
  label,
  icon,
  activeCount,
  panel,
}: {
  label: string;
  icon: PillIcon;
  activeCount: number;
  panel: FilterPanelProps;
}) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<{ Component: LivePopover } | null>(null);

  const activate = useCallback(() => {
    loadPopover()
      .then((Component) => {
        setLive((current) => current ?? { Component });
        setOpen(true);
      })
      .catch((error: unknown) =>
        handleError(error, { component: "RestaurantInlineFilters", action: "load" })
      );
  }, []);

  const pill = { label, icon, activeCount, open };

  if (live) {
    return (
      <live.Component
        open={open}
        onOpenChange={setOpen}
        trigger={<PillButton {...pill} />}
        panel={panel}
      />
    );
  }

  return (
    <PillButton
      {...pill}
      aria-haspopup="dialog"
      data-state="closed"
      onPointerEnter={prefetch}
      onPointerDown={prefetch}
      onFocus={prefetch}
      onClick={activate}
    />
  );
}

export function RestaurantInlineFilters({
  filters,
  onFiltersChange,
  availableCuisines,
}: RestaurantInlineFiltersProps) {
  const { cuisineCounts } = useCuisineCounts();

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

  // WEB-UX-086: the row scrolled with no scrollbar and nothing at its edge,
  // so at 390px Rating and Dietary were off-screen with no hint they existed.
  // The pills now fit from 375px, and where they still do not (a 320px
  // screen, a large text setting) a fade marks the edge that has more.
  const rowRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => setMoreRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    update();
    row.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => row.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const panel = (kind: FilterPanelKind): FilterPanelProps => ({
    kind,
    filters,
    onFiltersChange,
    cuisineOptions,
  });

  // Bleeds to the screen edge on the left only. From lg the right side sits
  // 12px (gap-x-3) from the sort select on /restaurants (below lg the row has
  // the bar to itself), and a -mr-4 bleed ran the
  // scroll row 4px under the select and chips scrolled beneath it - measured
  // by layout-integrity.spec.ts at 375px (WEB-CI-028).
  return (
    <div className="relative">
      <div
        ref={rowRef}
        className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto -ml-4 pl-4 scrollbar-hide"
        data-filter-row=""
      >
        <FilterPill
          label="Cuisine"
          icon={ChefHat}
          activeCount={filters.cuisine.length}
          panel={panel("cuisine")}
        />
        <FilterPill
          label="Price"
          icon={DollarSign}
          activeCount={filters.priceRange.length}
          panel={panel("price")}
        />
        <FilterPill
          label="Rating"
          icon={Star}
          activeCount={ratingActive ? 1 : 0}
          panel={panel("rating")}
        />
        <FilterPill
          label="Dietary"
          icon={Leaf}
          activeCount={filters.tags.filter((t) => DIETARY_OPTIONS.some((d) => d.value === t)).length}
          panel={panel("dietary")}
        />

        {/* Open Now is not offered here: nothing server-side filters on it yet
            (plan D2), so the hub links to /restaurants/open-now instead.

            The "More" pill held one switch, "Featured only / Editor's picks",
            and nothing editorial sets is_featured on restaurants; only sponsored
            rows kept it (20260902000004). It is gone (pass 2 WP1 item 2). An old
            ?featured=1 link still filters and shows a "Sponsored only" chip. */}
      </div>
      {moreRight && (
        <div
          aria-hidden="true"
          data-filter-row-fade=""
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-50 dark:from-background"
        />
      )}
    </div>
  );
}
