import { Link } from "react-router-dom";
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
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import {
  EVENT_SMART_PRESETS,
  isPresetActive,
  type EventPreset,
  type EventPresetFilters,
  type EventPresetId,
} from "@/lib/eventPresets";

const PRESET_ICONS: Record<EventPresetId, React.ComponentType<{ className?: string }>> = {
  "free-weekend": Ticket,
  "live-music": Music,
  "food-drink": UtensilsCrossed,
  "family-fun": Users,
  "date-night": Heart,
  outdoor: TreePine,
  tonight: Sparkles,
  "this-week": PartyPopper,
};

// One hue pair per preset, chosen so eight chips are told apart at a glance.
// `impeccable detect` counts the violet and indigo members as ai-color-palette
// findings; they stay. The hue is doing identifying work, and swapping one
// member of a distinguishing set to dodge a rule makes the set arbitrary
// without making it less gradient. Decided as a set (WEB-UX-034 AC2).
const PRESET_GRADIENTS: Record<EventPresetId, string> = {
  "free-weekend": "from-emerald-500 to-teal-600",
  "live-music": "from-violet-500 to-purple-600",
  "food-drink": "from-orange-500 to-red-500",
  "family-fun": "from-blue-500 to-cyan-500",
  "date-night": "from-rose-500 to-pink-600",
  outdoor: "from-green-500 to-emerald-600",
  tonight: "from-amber-500 to-orange-500",
  "this-week": "from-indigo-500 to-blue-600",
};

interface EventSmartPresetsProps {
  /** The live filter values, read from the URL by the page. */
  current?: EventPresetFilters;
  /** Write every value in `filters` in one navigation (useUrlFilters.setMany). */
  onApplyPreset: (filters: EventPresetFilters) => void;
  /**
   * Turn an active preset off. Receives the preset's own filters so the page
   * can reset just those keys; a caller that ignores the argument keeps the
   * old clear-everything behaviour.
   */
  onClearPreset: (filters: EventPresetFilters) => void;
}

const CHIP_CLASS =
  "flex-shrink-0 snap-start flex items-center gap-2.5 px-4 py-2.5 min-h-[44px] rounded-2xl transition-colors duration-200 border";
const CHIP_IDLE = "bg-white/10 text-white/80 border-white/10 hover:bg-white/20 hover:text-white";
const CHIP_ON = "bg-white text-slate-900 border-white";

function PresetBody({ preset, isActive }: { preset: EventPreset; isActive: boolean }) {
  const Icon = PRESET_ICONS[preset.id];
  return (
    <>
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-xl ${
          isActive ? `bg-gradient-to-br ${PRESET_GRADIENTS[preset.id]} text-white` : "bg-white/15"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-left">
        <div className="text-sm font-semibold whitespace-nowrap leading-tight">{preset.label}</div>
        <div
          className={`text-[11px] whitespace-nowrap leading-tight ${
            isActive ? "text-slate-600" : "text-white/70"
          }`}
        >
          {preset.description}
        </div>
      </div>
      {isActive && (
        <Badge
          variant="secondary"
          className="ml-1 bg-slate-100 text-slate-700 border-0 text-[10px] px-1.5 py-0"
        >
          ON
        </Badge>
      )}
    </>
  );
}

export function EventSmartPresets({ current = {}, onApplyPreset, onClearPreset }: EventSmartPresetsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-white/70 px-1">
        <SpriteIcon name="sparkles" className="h-3.5 w-3.5" />
        <span>Quick picks</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {EVENT_SMART_PRESETS.map((preset) => {
          if (preset.href) {
            return (
              <Link key={preset.id} to={preset.href} className={`${CHIP_CLASS} ${CHIP_IDLE}`}>
                <PresetBody preset={preset} isActive={false} />
              </Link>
            );
          }
          const isActive = isPresetActive(preset, current);
          const filters = preset.filters ?? {};
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => (isActive ? onClearPreset(filters) : onApplyPreset(filters))}
              className={`${CHIP_CLASS} ${isActive ? CHIP_ON : CHIP_IDLE}`}
              aria-pressed={isActive}
            >
              <PresetBody preset={preset} isActive={isActive} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
export type { EventPresetFilters } from "@/lib/eventPresets";
