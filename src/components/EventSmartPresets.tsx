import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  UtensilsCrossed,
  Users,
  Sparkles,
  Heart,
  TreePine,
  Ticket,
  PartyPopper,
} from "lucide-react";

interface EventPreset {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  filters: {
    category?: string;
    priceRange?: string;
    datePreset?: string;
  };
  gradient: string;
}

const EVENT_SMART_PRESETS: EventPreset[] = [
  {
    id: "free-weekend",
    label: "Free This Weekend",
    icon: Ticket,
    description: "No cover charge",
    filters: { priceRange: "free", datePreset: "this-weekend" },
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    id: "live-music",
    label: "Live Music",
    icon: Music,
    description: "Concerts & shows",
    filters: { category: "Music" },
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "food-drink",
    label: "Food & Drink",
    icon: UtensilsCrossed,
    description: "Tastings & festivals",
    filters: { category: "Food & Drink" },
    gradient: "from-orange-500 to-red-500",
  },
  {
    id: "family-fun",
    label: "Family Fun",
    icon: Users,
    description: "All ages welcome",
    filters: { category: "Family" },
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    id: "date-night",
    label: "Date Night",
    icon: Heart,
    description: "Romantic outings",
    filters: { category: "Art & Culture" },
    gradient: "from-rose-500 to-pink-600",
  },
  {
    id: "outdoor",
    label: "Outdoors",
    icon: TreePine,
    description: "Parks & nature",
    filters: { category: "Outdoor" },
    gradient: "from-green-500 to-emerald-600",
  },
  {
    id: "tonight",
    label: "Tonight",
    icon: Sparkles,
    description: "Happening now",
    filters: { datePreset: "today" },
    gradient: "from-amber-500 to-orange-500",
  },
  {
    id: "this-week",
    label: "This Week",
    icon: PartyPopper,
    description: "Coming up soon",
    filters: { datePreset: "this-week" },
    gradient: "from-indigo-500 to-blue-600",
  },
];

interface EventSmartPresetsProps {
  onApplyPreset: (filters: {
    category?: string;
    priceRange?: string;
    datePreset?: string;
  }) => void;
  onClearPreset: () => void;
}

export function EventSmartPresets({
  onApplyPreset,
  onClearPreset,
}: EventSmartPresetsProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const handlePresetClick = (preset: EventPreset) => {
    if (activePreset === preset.id) {
      setActivePreset(null);
      onClearPreset();
    } else {
      setActivePreset(preset.id);
      onApplyPreset(preset.filters);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-white/60 px-1">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Quick picks</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {EVENT_SMART_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset)}
              className={`flex-shrink-0 snap-start flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-200 border ${
                isActive
                  ? "bg-white text-slate-900 border-white shadow-lg shadow-white/20 scale-[1.02]"
                  : "bg-white/10 text-white/80 border-white/10 hover:bg-white/20 hover:text-white"
              }`}
              aria-pressed={isActive}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-xl ${
                  isActive
                    ? `bg-gradient-to-br ${preset.gradient} text-white`
                    : "bg-white/15"
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
                    isActive ? "text-slate-500" : "text-white/50"
                  }`}
                >
                  {preset.description}
                </div>
              </div>
              {isActive && (
                <Badge
                  variant="secondary"
                  className="ml-1 bg-slate-100 text-slate-600 border-0 text-[10px] px-1.5 py-0"
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
