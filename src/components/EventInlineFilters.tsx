import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MapPin,
  Tag,
  DollarSign,
  Calendar,
  ChevronDown,
  Check,
} from "lucide-react";
import InteractiveDateSelector from "@/components/InteractiveDateSelector";

interface EventInlineFiltersProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  location: string;
  onLocationChange: (location: string) => void;
  priceRange: string;
  onPriceRangeChange: (priceRange: string) => void;
  onDateChange: (date: { start?: Date; end?: Date; mode: string; preset?: string } | null) => void;
  categories: string[];
  totalResults: number;
  isLoading?: boolean;
  onClearAll: () => void;
  activeFiltersCount: number;
}

const PRICE_OPTIONS = [
  { value: "any-price", label: "Any Price" },
  { value: "free", label: "Free" },
  { value: "under-25", label: "Under $25" },
  { value: "25-50", label: "$25 - $50" },
  { value: "50-100", label: "$50 - $100" },
  { value: "over-100", label: "Over $100" },
];

const LOCATION_OPTIONS = [
  { value: "any-location", label: "Any location" },
  { value: "downtown", label: "Downtown Des Moines" },
  { value: "west-des-moines", label: "West Des Moines" },
  { value: "ankeny", label: "Ankeny" },
  { value: "urbandale", label: "Urbandale" },
  { value: "clive", label: "Clive" },
];

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
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
            isActive
              ? "bg-white text-slate-900 border-white shadow-md"
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
}: EventInlineFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Filter pills row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* Category */}
        <FilterPill
          label={selectedCategory !== "all" ? selectedCategory : "Category"}
          icon={Tag}
          isActive={selectedCategory !== "all"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Event Category</span>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              <button
                onClick={() => onCategoryChange("all")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === "all"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                }`}
              >
                {selectedCategory === "all" && <Check className="h-3 w-3" />}
                All Categories
              </button>
              {categories?.map((cat) => (
                <button
                  key={cat}
                  onClick={() => onCategoryChange(cat)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
                  }`}
                >
                  {selectedCategory === cat && <Check className="h-3 w-3" />}
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </FilterPill>

        {/* Location */}
        <FilterPill
          label={location !== "any-location" ? LOCATION_OPTIONS.find(l => l.value === location)?.label || "Location" : "Location"}
          icon={MapPin}
          isActive={location !== "any-location"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Area</span>
            <div className="space-y-1">
              {LOCATION_OPTIONS.map((loc) => (
                <button
                  key={loc.value}
                  onClick={() => onLocationChange(loc.value)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm transition-colors ${
                    location === loc.value
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {location === loc.value && <Check className="h-3.5 w-3.5" />}
                  {loc.label}
                </button>
              ))}
            </div>
          </div>
        </FilterPill>

        {/* Price */}
        <FilterPill
          label={priceRange !== "any-price" ? PRICE_OPTIONS.find(p => p.value === priceRange)?.label || "Price" : "Price"}
          icon={DollarSign}
          isActive={priceRange !== "any-price"}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Price Range</span>
            <div className="space-y-1">
              {PRICE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onPriceRangeChange(option.value)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm transition-colors ${
                    priceRange === option.value
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {priceRange === option.value && <Check className="h-3.5 w-3.5" />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </FilterPill>

        {/* Date Picker */}
        <FilterPill
          label="Date"
          icon={Calendar}
          isActive={false}
        >
          <div className="space-y-2">
            <span className="text-sm font-semibold">Pick a Date</span>
            <InteractiveDateSelector onDateChange={onDateChange} className="w-full" />
          </div>
        </FilterPill>
      </div>

      {/* Active filter summary */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/50">
            {isLoading ? "Searching..." : `${totalResults} results`}
          </span>
          <button
            onClick={onClearAll}
            className="text-xs text-indigo-300 hover:text-indigo-200 font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
