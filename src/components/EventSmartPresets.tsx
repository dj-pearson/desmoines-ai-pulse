import { Link } from "react-router-dom";
import { Check, Heart, Music, Ticket, TreePine, UtensilsCrossed, Users, Sparkles, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  QUICK_PICK_PRESETS,
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

interface EventSmartPresetsProps {
  /** The live filter values, read from the URL by the page. */
  current?: EventPresetFilters;
  /** Write every value in `filters` in one navigation (useUrlFilters.setMany). */
  onApplyPreset: (filters: EventPresetFilters) => void;
  /**
   * Turn an active preset off. Receives the preset's own filters so the page
   * can reset just those keys.
   */
  onClearPreset: (filters: EventPresetFilters) => void;
  /** "wrap" in the filters sheet and the empty state; "scroll" for one row. */
  layout?: "wrap" | "scroll";
  className?: string;
}

// Surface tokens only (events-pass2 WP2 item 7). The chips used to be white
// text on a gradient tile, styled for the old dark hero, which is why the page
// had to park them in a slate-900 tray. The same classes as the sheet's other
// option buttons, so the sheet reads as one control set.
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_IDLE = "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground";
const CHIP_ON = "bg-primary text-primary-foreground";

function PresetBody({ preset, isActive }: { preset: EventPreset; isActive: boolean }) {
  const Icon = isActive ? Check : PRESET_ICONS[preset.id];
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{preset.label}</span>
    </>
  );
}

/**
 * One-tap filter sets: category, price and date in one navigation. The hero
 * owns Today and This week, so they aren't repeated here (QUICK_PICK_PRESETS).
 */
export function EventSmartPresets({
  current = {},
  onApplyPreset,
  onClearPreset,
  layout = "wrap",
  className,
}: EventSmartPresetsProps) {
  return (
    <div
      className={cn(
        "flex gap-2",
        layout === "wrap" ? "flex-wrap" : "overflow-x-auto pb-1 scrollbar-hide",
        className
      )}
    >
      {QUICK_PICK_PRESETS.map((preset) => {
        if (preset.href) {
          return (
            <Link key={preset.id} to={preset.href} className={cn(CHIP_BASE, CHIP_IDLE, "shrink-0")}>
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
            className={cn(CHIP_BASE, isActive ? CHIP_ON : CHIP_IDLE, "shrink-0")}
            aria-pressed={isActive}
            title={preset.description}
          >
            <PresetBody preset={preset} isActive={isActive} />
          </button>
        );
      })}
    </div>
  );
}

interface QuickPicksProps extends EventSmartPresetsProps {
  /** Heading text; the empty state says what the picks are for. */
  title?: string;
  /** Heading level, so the page outline stays in order where it's mounted. */
  headingLevel?: 2 | 3;
}

/**
 * The quick picks with their own heading, for the hub's empty state (WP1
 * mounts it there) and anywhere else they stand alone.
 */
export function QuickPicks({ title = "Quick picks", headingLevel = 2, className, ...rest }: QuickPicksProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={cn("space-y-3", className)}>
      <Heading className="text-sm font-semibold text-foreground">{title}</Heading>
      <EventSmartPresets {...rest} />
    </section>
  );
}

export type { EventPresetFilters } from "@/lib/eventPresets";
