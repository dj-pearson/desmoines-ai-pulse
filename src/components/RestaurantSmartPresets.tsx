import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Moon,
  Users,
  Zap,
  Coffee,
  Wine,
  Baby,
  Leaf,
  Sparkles,
} from "lucide-react";
import type { RestaurantFilterOptions } from "@/components/RestaurantFilters";

interface SmartPreset {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  filters: Partial<RestaurantFilterOptions>;
  gradient: string;
}

const SMART_PRESETS: SmartPreset[] = [
  {
    id: "date-night",
    label: "Date Night",
    icon: Heart,
    description: "Upscale & romantic",
    filters: {
      priceRange: ["$$$", "$$$$"],
      rating: [4, 5],
      sortBy: "rating",
      tags: ["Date Night"],
    },
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "quick-lunch",
    label: "Quick Lunch",
    icon: Zap,
    description: "Fast & affordable",
    filters: {
      priceRange: ["$", "$$"],
      openNow: true,
      sortBy: "popularity",
    },
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "family-dinner",
    label: "Family Friendly",
    icon: Users,
    description: "Great for kids",
    filters: {
      priceRange: ["$", "$$", "$$$"],
      tags: ["Family Friendly"],
      sortBy: "popularity",
    },
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    id: "late-night",
    label: "Late Night",
    icon: Moon,
    description: "Open late",
    filters: {
      openNow: true,
      sortBy: "popularity",
    },
    gradient: "from-indigo-600 to-purple-600",
  },
  {
    id: "brunch",
    label: "Brunch",
    icon: Coffee,
    description: "Weekend vibes",
    filters: {
      cuisine: ["Cafe", "Brunch", "Breakfast", "American"],
      sortBy: "rating",
    },
    gradient: "from-yellow-500 to-amber-500",
  },
  {
    id: "happy-hour",
    label: "Happy Hour",
    icon: Wine,
    description: "Drinks & deals",
    filters: {
      tags: ["Happy Hour"],
      openNow: true,
      sortBy: "popularity",
    },
    gradient: "from-violet-500 to-purple-500",
  },
  {
    id: "healthy",
    label: "Healthy",
    icon: Leaf,
    description: "Vegan & fresh",
    filters: {
      cuisine: ["Vegetarian", "Vegan", "Health Food", "Salad"],
      sortBy: "rating",
    },
    gradient: "from-emerald-500 to-green-600",
  },
  {
    id: "kids",
    label: "With Kids",
    icon: Baby,
    description: "Kid-approved",
    filters: {
      priceRange: ["$", "$$"],
      tags: ["Family Friendly"],
      sortBy: "popularity",
    },
    gradient: "from-sky-500 to-blue-500",
  },
];

interface RestaurantSmartPresetsProps {
  onApplyPreset: (filters: RestaurantFilterOptions) => void;
  defaultFilters: RestaurantFilterOptions;
}

export function RestaurantSmartPresets({
  onApplyPreset,
  defaultFilters,
}: RestaurantSmartPresetsProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handlePresetClick = (preset: SmartPreset) => {
    if (activePreset === preset.id) {
      // Deactivate - reset to defaults
      setActivePreset(null);
      onApplyPreset(defaultFilters);
    } else {
      setActivePreset(preset.id);
      onApplyPreset({
        ...defaultFilters,
        ...preset.filters,
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Quick picks</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide snap-x snap-mandatory">
        {SMART_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset)}
              className={`flex-shrink-0 snap-start flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-200 border ${
                isActive
                  ? `bg-gradient-to-r ${preset.gradient} text-white border-transparent shadow-lg scale-[1.02]`
                  : "bg-white dark:bg-card text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm hover:shadow-md"
              }`}
              aria-pressed={isActive}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-xl ${
                  isActive
                    ? "bg-white/20"
                    : `bg-gradient-to-br ${preset.gradient} text-white`
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold whitespace-nowrap leading-tight">
                  {preset.label}
                </div>
                <div
                  className={`text-[11px] whitespace-nowrap leading-tight ${
                    isActive ? "text-white/80" : "text-muted-foreground"
                  }`}
                >
                  {preset.description}
                </div>
              </div>
              {isActive && (
                <Badge
                  variant="secondary"
                  className="ml-1 bg-white/20 text-white border-0 text-[10px] px-1.5 py-0"
                >
                  ON
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
