import { EVENT_AREAS } from "@/lib/eventAreas";

/**
 * Values the /events filter controls offer (docs/page-plans/events.md WP2).
 * Plain data, kept out of the component files so they stay component-only
 * (react-refresh) and so src/lib/__tests__/eventPresets.test.ts can pin them.
 */

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Any and Free only. The numeric ranges ("Under $25"...) were filtered on the
 * client after pagination, so they produced two-card pages with a Load More
 * button. They come back when events carry a numeric price (plan D2).
 */
export const PRICE_OPTIONS: readonly FilterOption[] = [
  { value: "any-price", label: "Any price" },
  { value: "free", label: "Free" },
];

/** Areas from the one table in eventAreas.ts; the value is the area slug. */
export const LOCATION_OPTIONS: readonly FilterOption[] = [
  { value: "any-location", label: "Any area" },
  ...EVENT_AREAS.map((area) => ({ value: area.slug, label: area.label })),
];

/**
 * Date presets. Keys are the hub's `?preset=` values, which centralWindow()
 * in timezone.ts turns into Central-time bounds. "" is any date.
 */
export const EVENT_DATE_PRESET_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-weekend", label: "This weekend" },
  { value: "this-week", label: "This week" },
];

export function locationLabel(value: string): string | undefined {
  return LOCATION_OPTIONS.find((o) => o.value === value)?.label;
}

export function priceLabel(value: string): string | undefined {
  return PRICE_OPTIONS.find((o) => o.value === value)?.label;
}

/**
 * The three filter values a preset can set. `category` must be one of
 * EVENT_CATEGORIES (src/lib/eventCategories.ts), spelled exactly: the hub
 * query is an `eq`, so "Food & Drink" and "Art & Culture" matched nothing.
 */
export interface EventPresetFilters {
  category?: string;
  priceRange?: string;
  datePreset?: string;
}

export type EventPresetId =
  | "free-weekend"
  | "live-music"
  | "food-drink"
  | "family-fun"
  | "date-night"
  | "outdoor"
  | "tonight"
  | "this-week";

export interface EventPreset {
  id: EventPresetId;
  label: string;
  description: string;
  /** Set on the hub's own filters. Absent when the preset is a link. */
  filters?: EventPresetFilters;
  /** A page of its own; the preset navigates rather than filtering. */
  href?: string;
}

export const EVENT_SMART_PRESETS: readonly EventPreset[] = [
  {
    id: "free-weekend",
    label: "Free This Weekend",
    description: "No cover charge",
    filters: { priceRange: "free", datePreset: "this-weekend" },
  },
  { id: "live-music", label: "Live Music", description: "Concerts & shows", filters: { category: "Music" } },
  { id: "food-drink", label: "Food & Drink", description: "Tastings & festivals", filters: { category: "Food" } },
  { id: "family-fun", label: "Family Fun", description: "All ages welcome", filters: { category: "Family" } },
  {
    // Date night is not a category. It was faked as "Art & Culture", which is
    // not one either, so it returned nothing. /events/date-night answers it.
    id: "date-night",
    label: "Date Night",
    description: "Romantic outings",
    href: "/events/date-night",
  },
  { id: "outdoor", label: "Outdoors", description: "Parks & nature", filters: { category: "Outdoor" } },
  { id: "tonight", label: "Tonight", description: "On tonight", filters: { datePreset: "today" } },
  { id: "this-week", label: "This Week", description: "Coming up soon", filters: { datePreset: "this-week" } },
];

/**
 * Presets the hero already offers as its own chips (Today and This week set
 * the same `?preset=` values), so the quick picks leave them out
 * (events-pass2 WP2 item 7). They stay in EVENT_SMART_PRESETS only because
 * src/lib/__tests__/eventPresets.test.ts still pins the Tonight entry; drop
 * both entries and that case together.
 */
const HERO_OWNED_PRESETS: ReadonlySet<EventPresetId> = new Set<EventPresetId>(["tonight", "this-week"]);

/** What the filters sheet and the empty state offer under "Quick picks". */
export const QUICK_PICK_PRESETS: readonly EventPreset[] = EVENT_SMART_PRESETS.filter(
  (preset) => !HERO_OWNED_PRESETS.has(preset.id)
);

/**
 * A preset is ON when every value it sets is the current value. Derived from
 * the URL rather than held in state, so Clear all, a chip's X and the Back
 * button all turn it off without telling the preset row.
 */
export function isPresetActive(preset: EventPreset, current: EventPresetFilters): boolean {
  if (!preset.filters) return false;
  const set = (Object.keys(preset.filters) as (keyof EventPresetFilters)[]).filter(
    (key) => preset.filters?.[key] !== undefined
  );
  if (set.length === 0) return false;
  return set.every((key) => current[key] === preset.filters?.[key]);
}
