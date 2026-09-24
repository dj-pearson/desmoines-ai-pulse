import { useMemo, useState } from "react";
import { Coffee, Heart, Leaf, Users } from "lucide-react";
import type { RestaurantFilterOptions } from "@/components/RestaurantFilters";
import { useCuisineCounts } from "@/hooks/useRestaurants";
import {
  DEFAULT_RESTAURANT_FILTERS,
  activeRestaurantPresetId,
  availableRestaurantPresets,
  presetFilters,
  type RestaurantPreset,
  type RestaurantPresetIcon,
} from "@/lib/restaurantPresets";
import { cn } from "@/lib/utils";

const PRESET_ICONS: Record<RestaurantPresetIcon, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  users: Users,
  coffee: Coffee,
  leaf: Leaf,
};

interface RestaurantSmartPresetsProps {
  onApplyPreset: (filters: RestaurantFilterOptions) => void;
  /**
   * The current filters (from the URL). The active preset is derived from
   * these, so a reloaded preset URL shows as active and any later edit clears
   * it. When omitted the chip row falls back to remembering the last preset it
   * applied, which cannot see edits made elsewhere.
   */
  filters?: RestaurantFilterOptions;
  defaultFilters?: RestaurantFilterOptions;
}

export function RestaurantSmartPresets({
  onApplyPreset,
  filters,
  defaultFilters = DEFAULT_RESTAURANT_FILTERS,
}: RestaurantSmartPresetsProps) {
  // Shares the cached facet query the hub already runs; no extra request.
  const { cuisineCounts, isLoading } = useCuisineCounts();
  const [lastApplied, setLastApplied] = useState<RestaurantFilterOptions | null>(null);

  const presets = useMemo(
    () => availableRestaurantPresets(isLoading ? undefined : cuisineCounts),
    [cuisineCounts, isLoading]
  );

  const current = filters ?? lastApplied;
  const activePreset = current ? activeRestaurantPresetId(current, presets) : null;

  const handlePresetClick = (preset: RestaurantPreset) => {
    const next = activePreset === preset.id ? defaultFilters : presetFilters(preset);
    setLastApplied(next);
    onApplyPreset(next);
  };

  if (presets.length === 0) return null;

  return (
    <div className="space-y-2">
      <p id="restaurant-presets-heading" className="text-sm font-medium text-muted-foreground px-1">
        Quick picks
      </p>
      <div
        role="group"
        aria-labelledby="restaurant-presets-heading"
        className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory"
      >
        {presets.map((preset) => {
          const Icon = PRESET_ICONS[preset.icon];
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset)}
              aria-pressed={isActive}
              className={cn(
                "flex-shrink-0 snap-start flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-xl border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-muted"
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")}
                aria-hidden="true"
              />
              <span className="text-left">
                <span className="block text-sm font-semibold whitespace-nowrap leading-tight">
                  {preset.label}
                </span>
                <span
                  className={cn(
                    "block text-xs whitespace-nowrap leading-tight",
                    isActive ? "text-primary-foreground/85" : "text-muted-foreground"
                  )}
                >
                  {preset.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
