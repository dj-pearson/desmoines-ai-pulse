/**
 * Single source of truth for category / cuisine / lodging color tokens
 * (WEB-UX-006). Replaces hardcoded gradient + color literals that were
 * duplicated across RestaurantCard, SocialEventCard, EventCard and HotelCard.
 *
 * Dark mode: text accents carry an explicit `dark:` variant tuned for
 * >= 4.5:1 contrast on the card surface. Measured 2026-08-11 against
 * hsl(225 50% 8%): violet-400 7.01, orange-400 8.43, emerald-400 9.92,
 * pink-400 7.20, sky-400 8.90, green-400 10.95, slate-300 12.85 — all pass, so
 * the dark values are unchanged. Image-fallback gradients are decorative (no
 * text on top) so they don't need a separate dark value.
 *
 * WHY -700 AND NOT -500 (WEB-UX-030). Every solid `bg` here used to be the
 * -500 shade with white text on top, and the docstring claimed that "reads
 * well in both themes". Measured, white on the -500 ramp: violet 4.23,
 * pink 3.53, orange 2.80, emerald 2.54, sky 2.77, green 2.28 — every one below
 * the 4.5:1 AA floor, and the same shades used as text accents on a white card
 * fail identically. That single map produced the largest block of the 126
 * color-contrast nodes an axe sweep found across / /events /restaurants
 * /pricing; the music badge alone accounted for 50.
 *
 * -700 is the first shade on each ramp where white clears 4.5:1 for ALL of
 * them (violet 7.10, orange 5.18, emerald 5.48, pink 6.04, sky 5.93,
 * green 5.02). -600 clears it for violet, pink and slate but not for orange,
 * emerald, sky or green, so a per-hue mix would have been a map nobody could
 * reason about. Same hue, two steps down the same ramp — the palette is
 * unchanged, only its lightness.
 *
 * If you add a category here, run the ratio before you pick the shade. Do not
 * assume -600 is enough; on four of these seven hues it is not.
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
  // WEB-UX-030: this was `bg-primary`, and every consumer pairs `bg` with
  // literal white text. That works in the light theme, where --primary is a
  // deep navy (15.23:1), and breaks in the dark theme, where --primary is
  // LIGHTENED for visibility on a dark surface — white on it measures 3.23:1.
  // A token whose lightness flips between themes cannot be paired with a fixed
  // text colour. Every other entry below is a fixed shade for exactly that
  // reason, so the default is one too: blue-900 is the nearest Tailwind step to
  // the brand navy and clears white at 10.36:1 in both themes.
  bg: "bg-blue-900",
  // Safe as a token: text-primary is 15.23:1 on the light card and 5.92:1 on
  // the dark one, because BOTH ends move together here.
  text: "text-primary",
  icon: "bg-primary/10",
};

/** Ordered keyword groups -> style. First substring match wins. */
const EVENT_CATEGORY_STYLES: ReadonlyArray<{ match: readonly string[]; style: CategoryStyle }> = [
  { match: ["music"], style: { bg: "bg-violet-700", text: "text-violet-700 dark:text-violet-400", icon: "bg-violet-500/10" } },
  { match: ["food", "drink"], style: { bg: "bg-orange-700", text: "text-orange-700 dark:text-orange-400", icon: "bg-orange-500/10" } },
  { match: ["sport"], style: { bg: "bg-emerald-700", text: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-500/10" } },
  { match: ["art", "culture"], style: { bg: "bg-pink-700", text: "text-pink-700 dark:text-pink-400", icon: "bg-pink-500/10" } },
  { match: ["family", "kid"], style: { bg: "bg-sky-700", text: "text-sky-700 dark:text-sky-400", icon: "bg-sky-500/10" } },
  { match: ["outdoor"], style: { bg: "bg-green-700", text: "text-green-700 dark:text-green-400", icon: "bg-green-500/10" } },
  { match: ["business", "network"], style: { bg: "bg-slate-700", text: "text-slate-700 dark:text-slate-300", icon: "bg-slate-600/10" } },
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

/**
 * Semantic status badges that sit on card artwork with white text on top.
 *
 * WEB-UX-030: these were pasted as literals into SocialEventCard,
 * RestaurantCard, HotelCard and AttractionDetails, so they drifted
 * independently and all four were wrong the same way. At -500 white reads
 * 2.15:1 on amber and 2.54:1 on emerald — the two worst ratios anywhere on the
 * site. Same -700 rule as the category ramp above.
 *
 * "featured" and "closingSoon" deliberately share a value; they already did,
 * and they are distinguished by their label and icon rather than by hue.
 */
export const STATUS_BADGE = {
  featured: "bg-amber-700 text-white",
  closingSoon: "bg-amber-700 text-white",
  open: "bg-emerald-700 text-white",
  free: "bg-emerald-700 text-white",
} as const;

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
