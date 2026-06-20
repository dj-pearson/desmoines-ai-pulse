/**
 * Single source of truth for category / cuisine / lodging color tokens
 * (WEB-UX-006). Replaces hardcoded gradient + color literals that were
 * duplicated across RestaurantCard, SocialEventCard, EventCard and HotelCard.
 *
 * Dark mode: text accents carry an explicit `dark:` variant tuned for
 * >= 4.5:1 contrast on the card surface; solid badge backgrounds pair with
 * white text and read well in both themes. Image-fallback gradients are
 * decorative (no text on top) so they don't need a separate dark value.
 *
 * NOTE: exports both the `getEventCategoryStyle`/`getEventCategoryBadgeClass`
 * names and the legacy `getCategoryStyle`/`CUISINE_GRADIENTS`/
 * `DEFAULT_CATEGORY_STYLE` names so all call sites resolve.
 */

export interface CategoryStyle {
  /** Solid badge background; pair with white text. */
  bg: string;
  /** Text accent color, contrast-safe in light + dark. */
  text: string;
  /** Tinted icon-chip background. */
  icon: string;
}

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  bg: "bg-primary",
  text: "text-primary",
  icon: "bg-primary/10",
};

/** Ordered keyword groups -> style. First substring match wins. */
const EVENT_CATEGORY_STYLES: ReadonlyArray<{ match: readonly string[]; style: CategoryStyle }> = [
  { match: ["music"], style: { bg: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", icon: "bg-violet-500/10" } },
  { match: ["food", "drink"], style: { bg: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", icon: "bg-orange-500/10" } },
  { match: ["sport"], style: { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", icon: "bg-emerald-500/10" } },
  { match: ["art", "culture"], style: { bg: "bg-pink-500", text: "text-pink-600 dark:text-pink-400", icon: "bg-pink-500/10" } },
  { match: ["family", "kid"], style: { bg: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", icon: "bg-sky-500/10" } },
  { match: ["outdoor"], style: { bg: "bg-green-500", text: "text-green-600 dark:text-green-400", icon: "bg-green-500/10" } },
  { match: ["business", "network"], style: { bg: "bg-slate-600", text: "text-slate-600 dark:text-slate-300", icon: "bg-slate-600/10" } },
];

/** Full {bg,text,icon} token for an event category. */
export function getEventCategoryStyle(category?: string | null): CategoryStyle {
  if (!category) return DEFAULT_CATEGORY_STYLE;
  const c = category.toLowerCase();
  for (const { match, style } of EVENT_CATEGORY_STYLES) {
    if (match.some((kw) => c.includes(kw))) return style;
  }
  return DEFAULT_CATEGORY_STYLE;
}

/** Legacy alias (pre-merge name). */
export const getCategoryStyle = getEventCategoryStyle;

/** Convenience badge class ("bg-... text-white") for an event category. */
export function getEventCategoryBadgeClass(category?: string | null): string {
  return `${getEventCategoryStyle(category).bg} text-white`;
}

/** Cuisine -> decorative image-fallback gradient (used by RestaurantCard). */
export const CUISINE_GRADIENTS: Record<string, string> = {
  Italian: "from-red-600 to-orange-500",
  Mexican: "from-green-600 to-yellow-500",
  Chinese: "from-red-700 to-amber-500",
  Japanese: "from-pink-600 to-red-400",
  Thai: "from-orange-500 to-yellow-400",
  Indian: "from-orange-600 to-red-500",
  American: "from-blue-600 to-red-500",
  French: "from-blue-500 to-indigo-600",
  Mediterranean: "from-sky-500 to-emerald-400",
  Korean: "from-rose-500 to-orange-400",
  Vietnamese: "from-emerald-500 to-lime-400",
  BBQ: "from-amber-700 to-red-600",
  Seafood: "from-cyan-500 to-blue-600",
  Pizza: "from-red-500 to-yellow-500",
  Steakhouse: "from-stone-700 to-red-800",
  default: "from-[#2D1B69] to-[#DC143C]",
};

export function getCuisineGradient(cuisine?: string | null): string {
  if (!cuisine) return CUISINE_GRADIENTS.default;
  const c = cuisine.toLowerCase();
  for (const [key, value] of Object.entries(CUISINE_GRADIENTS)) {
    if (key === "default") continue;
    if (c.includes(key.toLowerCase())) return value;
  }
  return CUISINE_GRADIENTS.default;
}

/** Lodging type -> decorative image-fallback gradient (used by HotelCard). */
const HOTEL_TYPE_GRADIENTS: Record<string, string> = {
  "Hotel": "from-blue-600 to-indigo-500",
  "Boutique Hotel": "from-purple-600 to-pink-500",
  "Motel": "from-teal-600 to-cyan-500",
  "Resort": "from-emerald-600 to-teal-500",
  "B&B": "from-orange-600 to-amber-500",
  "Extended Stay": "from-slate-600 to-gray-500",
};

export function getHotelTypeGradient(type?: string | null): string {
  if (type && HOTEL_TYPE_GRADIENTS[type]) return HOTEL_TYPE_GRADIENTS[type];
  return CUISINE_GRADIENTS.default;
}
