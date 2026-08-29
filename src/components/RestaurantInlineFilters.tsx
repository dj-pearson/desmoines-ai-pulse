import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChefHat, DollarSign, MapPin, Star, Leaf, X, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import type { RestaurantFilterOptions } from "@/components/RestaurantFilters";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface RestaurantInlineFiltersProps {
  filters: RestaurantFilterOptions;
  onFiltersChange: (filters: RestaurantFilterOptions) => void;
  availableCuisines: string[];
  availableLocations: string[];
  totalResults: number;
  isLoading?: boolean;
}

const PRICE_OPTIONS = [
  { value: "$", label: "$", description: "Under $15" },
  { value: "$$", label: "$$", description: "$15-30" },
  { value: "$$$", label: "$$$", description: "$30-50" },
  { value: "$$$$", label: "$$$$", description: "$50+" },
];

const DIETARY_OPTIONS = [
  { value: "vegan", label: "Vegan", icon: "🌱" },
  { value: "vegetarian", label: "Vegetarian", icon: "🥬" },
  { value: "gluten-free", label: "Gluten-Free", icon: "🌾" },
  { value: "keto", label: "Keto", icon: "🥑" },
  { value: "halal", label: "Halal", icon: "🍖" },
];

// A compact filter pill that opens a popover with options
function FilterPill({
  label,
  icon: Icon,
  activeCount,
  children,
  isActive,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeCount: number;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
            isActive || activeCount > 0
              ? "bg-[#2D1B69] text-white border-[#2D1B69] shadow-md"
              : "bg-white dark:bg-card text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 shadow-sm"
          }`}
          aria-expanded={open}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          {activeCount > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[10px] bg-white/25 text-white border-0">
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

export function RestaurantInlineFilters({
  filters,
  onFiltersChange,
  availableCuisines,
  availableLocations,
  totalResults,
  isLoading,
}: RestaurantInlineFiltersProps) {
  const toggleArrayFilter = useCallback(
    (key: "cuisine" | "priceRange" | "location" | "tags", value: string) => {
      const current = filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      onFiltersChange({ ...filters, [key]: next });
    },
    [filters, onFiltersChange]
  );

  const activeFilterCount =
    filters.cuisine.length +
    filters.priceRange.length +
    filters.location.length +
    filters.tags.length +
    (filters.featuredOnly ? 1 : 0) +
    (filters.openNow ? 1 : 0) +
    (filters.rating[0] > 0 || filters.rating[1] < 5 ? 1 : 0);

  const clearAll = () => {
    onFiltersChange({
      search: filters.search, // preserve search text
      cuisine: [],
      priceRange: [],
      rating: [0, 5],
      location: [],
      sortBy: "popularity",
      featuredOnly: false,
      openNow: false,
      tags: [],
    });
  };

  // Group top cuisines (show max 12 most common, rest under "More")
  const topCuisines = availableCuisines.slice(0, 15);

  return (
    <div className="space-y-3">
      {/* Filter pills row - always visible, scrollable on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {/* Cuisine */}
        <FilterPill
          label="Cuisine"
          icon={ChefHat}
          activeCount={filters.cuisine.length}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Cuisine Type</span>
              {filters.cuisine.length > 0 && (
                <button
                  onClick={() => onFiltersChange({ ...filters, cuisine: [] })}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {topCuisines.map((cuisine) => {
                const isSelected = filters.cuisine.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    onClick={() => toggleArrayFilter("cuisine", cuisine)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[#2D1B69] text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {cuisine}
                  </button>
                );
              })}
            </div>
          </div>
        </FilterPill>

        {/* Price */}
        <FilterPill
          label="Price"
          icon={DollarSign}
          activeCount={filters.priceRange.length}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Price Range</span>
              {filters.priceRange.length > 0 && (
                <button
                  onClick={() => onFiltersChange({ ...filters, priceRange: [] })}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRICE_OPTIONS.map((option) => {
                const isSelected = filters.priceRange.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => toggleArrayFilter("priceRange", option.value)}
                    className={`flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-[#2D1B69] text-white border-[#2D1B69]"
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-base font-bold">{option.label}</span>
                    <span className={`text-[10px] ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </FilterPill>

        {/* Area */}
        <FilterPill
          label="Area"
          icon={MapPin}
          activeCount={filters.location.length}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Neighborhood</span>
              {filters.location.length > 0 && (
                <button
                  onClick={() => onFiltersChange({ ...filters, location: [] })}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {availableLocations.map((loc) => {
                const isSelected = filters.location.includes(loc);
                return (
                  <button
                    key={loc}
                    onClick={() => toggleArrayFilter("location", loc)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-[#2D1B69] text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {loc}
                  </button>
                );
              })}
            </div>
          </div>
        </FilterPill>

        {/* Rating */}
        <FilterPill
          label="Rating"
          icon={Star}
          activeCount={filters.rating[0] > 0 || filters.rating[1] < 5 ? 1 : 0}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Minimum Rating</span>
              <span className="text-sm font-bold text-[#2D1B69]">
                {filters.rating[0]}+ stars
              </span>
            </div>
            <div className="space-y-4">
              {/* Quick rating buttons */}
              <div className="flex gap-2">
                {[0, 3, 3.5, 4, 4.5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() =>
                      onFiltersChange({ ...filters, rating: [rating, 5] })
                    }
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filters.rating[0] === rating
                        ? "bg-[#2D1B69] text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    <Star className="h-3 w-3 fill-current" />
                    {rating === 0 ? "Any" : `${rating}+`}
                  </button>
                ))}
              </div>
              <Slider
                value={[filters.rating[0]]}
                onValueChange={([val]) =>
                  onFiltersChange({ ...filters, rating: [val, 5] })
                }
                max={5}
                min={0}
                step={0.5}
                className="w-full"
              />
            </div>
          </div>
        </FilterPill>

        {/* Dietary */}
        <FilterPill
          label="Dietary"
          icon={Leaf}
          activeCount={filters.tags.filter((t) =>
            DIETARY_OPTIONS.some((d) => d.value === t)
          ).length}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Dietary Preferences</span>
            <div className="space-y-1.5">
              {DIETARY_OPTIONS.map((option) => {
                const isSelected = filters.tags.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => toggleArrayFilter("tags", option.value)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                      isSelected
                        ? "bg-[#2D1B69] text-white"
                        : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <span className="text-base">{option.icon}</span>
                    <span className="text-sm font-medium">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        </FilterPill>

        {/* More (toggles) */}
        <FilterPill
          label="More"
          icon={SlidersHorizontal}
          activeCount={(filters.featuredOnly ? 1 : 0) + (filters.openNow ? 1 : 0)}
        >
          <div className="space-y-3">
            <span className="text-sm font-semibold">More Options</span>
            <div className="space-y-2">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <SpriteIcon name="clock" className="h-4 w-4 text-emerald-500" />
                  <div>
                    <span className="text-sm font-medium">Open Now</span>
                    <p className="text-[11px] text-muted-foreground">Currently serving</p>
                  </div>
                </div>
                <Switch
                  checked={filters.openNow}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, openNow: checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer">
                <div className="flex items-center gap-2">
                  <SpriteIcon name="sparkles" className="h-4 w-4 text-amber-500" />
                  <div>
                    <span className="text-sm font-medium">Featured Only</span>
                    <p className="text-[11px] text-muted-foreground">Editor's picks</p>
                  </div>
                </div>
                <Switch
                  checked={filters.featuredOnly}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, featuredOnly: checked })
                  }
                />
              </label>
            </div>
          </div>
        </FilterPill>
      </div>

      {/* Active filter summary + clear */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Searching..." : `${totalResults} results`}
          </span>
          <span className="text-xs text-muted-foreground">|</span>
          {filters.cuisine.map((c) => (
            <Badge
              key={`c-${c}`}
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-white dark:bg-card shadow-sm border cursor-pointer"
              onClick={() => toggleArrayFilter("cuisine", c)}
            >
              {c} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          {filters.priceRange.map((p) => (
            <Badge
              key={`p-${p}`}
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-white dark:bg-card shadow-sm border cursor-pointer"
              onClick={() => toggleArrayFilter("priceRange", p)}
            >
              {p} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          {filters.location.map((l) => (
            <Badge
              key={`l-${l}`}
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-white dark:bg-card shadow-sm border cursor-pointer"
              onClick={() => toggleArrayFilter("location", l)}
            >
              {l} <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          {(filters.rating[0] > 0 || filters.rating[1] < 5) && (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-white dark:bg-card shadow-sm border cursor-pointer"
              onClick={() => onFiltersChange({ ...filters, rating: [0, 5] })}
            >
              {filters.rating[0]}+ stars <X className="h-2.5 w-2.5" />
            </Badge>
          )}
          {filters.openNow && (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 border-emerald-200 text-emerald-700 cursor-pointer"
              onClick={() => onFiltersChange({ ...filters, openNow: false })}
            >
              Open Now <X className="h-2.5 w-2.5" />
            </Badge>
          )}
          {filters.featuredOnly && (
            <Badge
              variant="secondary"
              className="gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-50 border-amber-200 text-amber-700 cursor-pointer"
              onClick={() => onFiltersChange({ ...filters, featuredOnly: false })}
            >
              Featured <X className="h-2.5 w-2.5" />
            </Badge>
          )}
          <button
            onClick={clearAll}
            className="text-xs text-[#DC143C] hover:text-[#DC143C]/80 font-medium ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
