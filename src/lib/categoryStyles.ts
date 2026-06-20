/**
 * Single source of truth for cuisine gradients and event-category colors
 * (WEB-UX-006). Previously these literals were duplicated inside RestaurantCard
 * and SocialEventCard; centralizing keeps the palette consistent and lets future
 * tweaks happen in one place. Tailwind color utilities render correctly in both
 * light and dark mode, and the brand-hex default gradient is mode-agnostic.
 */

// ── Cuisine gradients (restaurant cards) ────────────────────────────────────

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
  for (const [key, value] of Object.entries(CUISINE_GRADIENTS)) {
    if (key === "default") continue;
    if (cuisine.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return CUISINE_GRADIENTS.default;
}

// ── Event-category colors (event cards) ─────────────────────────────────────

export interface CategoryStyle {
  /** Solid fill (badges, dots). */
  bg: string;
  /** Foreground text/icon color. */
  text: string;
  /** Tinted icon backplate. */
  icon: string;
}

/** Ordered rules — first substring match wins, mirroring the prior if-chain. */
const CATEGORY_RULES: Array<{ match: string[]; style: CategoryStyle }> = [
  { match: ["music"], style: { bg: "bg-violet-500", text: "text-violet-500", icon: "bg-violet-500/10" } },
  { match: ["food", "drink"], style: { bg: "bg-orange-500", text: "text-orange-500", icon: "bg-orange-500/10" } },
  { match: ["sport"], style: { bg: "bg-emerald-500", text: "text-emerald-500", icon: "bg-emerald-500/10" } },
  { match: ["art", "culture"], style: { bg: "bg-pink-500", text: "text-pink-500", icon: "bg-pink-500/10" } },
  { match: ["family", "kid"], style: { bg: "bg-sky-500", text: "text-sky-500", icon: "bg-sky-500/10" } },
  { match: ["outdoor"], style: { bg: "bg-green-500", text: "text-green-500", icon: "bg-green-500/10" } },
  { match: ["business", "network"], style: { bg: "bg-slate-600", text: "text-slate-600", icon: "bg-slate-600/10" } },
];

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  bg: "bg-primary",
  text: "text-primary",
  icon: "bg-primary/10",
};

export function getCategoryStyle(category?: string | null): CategoryStyle {
  if (!category) return DEFAULT_CATEGORY_STYLE;
  const c = category.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.match.some((m) => c.includes(m))) return rule.style;
  }
  return DEFAULT_CATEGORY_STYLE;
}
