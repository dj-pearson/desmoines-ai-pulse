/**
 * Shared category color map for consistent styling across all card components,
 * maps, badges, and filters.
 */

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  Music: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', hex: '#8b5cf6' },
  Food: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', hex: '#f59e0b' },
  'Food & Drink': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', hex: '#f59e0b' },
  'Arts & Culture': { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', hex: '#ec4899' },
  Sports: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hex: '#10b981' },
  Community: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', hex: '#3b82f6' },
  Entertainment: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', hex: '#f97316' },
  Family: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200', hex: '#14b8a6' },
  Education: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200', hex: '#6366f1' },
  Outdoors: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', hex: '#22c55e' },
  Nightlife: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200', hex: '#a855f7' },
  Holiday: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', hex: '#ef4444' },
  Market: { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-200', hex: '#84cc16' },
  Charity: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', hex: '#06b6d4' },
  General: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', hex: '#6b7280' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', hex: '#6b7280' };

/**
 * Get category color classes for a given category string.
 */
export function getCategoryColor(category?: string | null) {
  if (!category) return DEFAULT_COLOR;
  return CATEGORY_COLORS[category] || DEFAULT_COLOR;
}

/**
 * Get the hex color for a category (for maps, charts, etc.)
 */
export function getCategoryHex(category?: string | null): string {
  return getCategoryColor(category).hex;
}

/**
 * Card-surface category styling (badges, fallback headers, accent text).
 *
 * One source of truth for the colored chrome on EventCard / SocialEventCard so
 * the same category always renders identically. Every token carries explicit
 * light + dark values where the surface it sits on changes between modes:
 *
 * - `solid` / `onSolid`: a solid badge. The background is identical in both
 *   modes and is chosen so the paired `onSolid` text clears WCAG AA (>= 4.5:1).
 * - `text`: an accent text color rendered directly on the card surface, so it
 *   carries a `dark:` variant that clears AA on the dark card background too.
 * - `iconBg`: a translucent chip behind an icon (light + dark tint).
 * - `gradient`: a decorative image-fallback header (sits under a dark overlay,
 *   so it is intentionally mode-independent).
 *
 * Contrast is verified in src/lib/__tests__/categoryColors.test.ts.
 */
export interface CategoryStyle {
  solid: string;
  onSolid: string;
  text: string;
  iconBg: string;
  gradient: string;
}

/** Des Moines Insider brand gradient (deep purple → crimson). */
export const BRAND_GRADIENT = 'from-[#2D1B69] to-[#DC143C]';

/** Neutral fallback used when a category does not match any known bucket. */
export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  solid: 'bg-primary',
  onSolid: 'text-primary-foreground',
  text: 'text-primary',
  iconBg: 'bg-primary/10',
  gradient: BRAND_GRADIENT,
};

/**
 * Canonical event-category styles keyed by a normalized bucket. Solid/light
 * text shades are deliberately deep (600/700) so white-on-solid and
 * accent-text-on-white both clear 4.5:1; the dark accent uses the 400 shade.
 */
export const EVENT_CATEGORY_STYLES: Record<string, CategoryStyle> = {
  music: { solid: 'bg-violet-600', onSolid: 'text-white', text: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-500/10 dark:bg-violet-500/20', gradient: 'from-violet-600 to-purple-500' },
  food: { solid: 'bg-orange-700', onSolid: 'text-white', text: 'text-orange-700 dark:text-orange-400', iconBg: 'bg-orange-500/10 dark:bg-orange-500/20', gradient: 'from-orange-500 to-amber-500' },
  sports: { solid: 'bg-emerald-700', onSolid: 'text-white', text: 'text-emerald-700 dark:text-emerald-400', iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20', gradient: 'from-emerald-600 to-green-500' },
  arts: { solid: 'bg-pink-700', onSolid: 'text-white', text: 'text-pink-700 dark:text-pink-400', iconBg: 'bg-pink-500/10 dark:bg-pink-500/20', gradient: 'from-pink-600 to-rose-500' },
  family: { solid: 'bg-sky-700', onSolid: 'text-white', text: 'text-sky-700 dark:text-sky-400', iconBg: 'bg-sky-500/10 dark:bg-sky-500/20', gradient: 'from-sky-500 to-blue-500' },
  outdoors: { solid: 'bg-green-700', onSolid: 'text-white', text: 'text-green-700 dark:text-green-400', iconBg: 'bg-green-500/10 dark:bg-green-500/20', gradient: 'from-green-600 to-lime-500' },
  business: { solid: 'bg-slate-600', onSolid: 'text-white', text: 'text-slate-600 dark:text-slate-300', iconBg: 'bg-slate-500/10 dark:bg-slate-500/20', gradient: 'from-slate-700 to-slate-500' },
  nightlife: { solid: 'bg-purple-600', onSolid: 'text-white', text: 'text-purple-600 dark:text-purple-400', iconBg: 'bg-purple-500/10 dark:bg-purple-500/20', gradient: 'from-purple-600 to-fuchsia-500' },
  community: { solid: 'bg-blue-600', onSolid: 'text-white', text: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-500/10 dark:bg-blue-500/20', gradient: 'from-blue-600 to-sky-500' },
  education: { solid: 'bg-indigo-600', onSolid: 'text-white', text: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/20', gradient: 'from-indigo-600 to-blue-500' },
  holiday: { solid: 'bg-red-600', onSolid: 'text-white', text: 'text-red-600 dark:text-red-400', iconBg: 'bg-red-500/10 dark:bg-red-500/20', gradient: 'from-red-600 to-orange-500' },
  market: { solid: 'bg-lime-700', onSolid: 'text-white', text: 'text-lime-700 dark:text-lime-400', iconBg: 'bg-lime-500/10 dark:bg-lime-500/20', gradient: 'from-lime-600 to-green-500' },
  charity: { solid: 'bg-cyan-700', onSolid: 'text-white', text: 'text-cyan-700 dark:text-cyan-400', iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/20', gradient: 'from-cyan-600 to-teal-500' },
};

/** Ordered keyword → bucket matchers (first hit wins). */
const CATEGORY_MATCHERS: ReadonlyArray<readonly [readonly string[], keyof typeof EVENT_CATEGORY_STYLES]> = [
  [['music', 'concert'], 'music'],
  [['food', 'drink', 'dining', 'restaurant', 'culinary'], 'food'],
  [['sport', 'fitness', 'athletic'], 'sports'],
  [['art', 'culture', 'theat', 'museum'], 'arts'],
  [['family', 'kid', 'child'], 'family'],
  [['outdoor', 'nature', 'park', 'hik'], 'outdoors'],
  [['business', 'network', 'professional', 'career'], 'business'],
  [['nightlife', 'bar', 'club', 'party'], 'nightlife'],
  [['community', 'social', 'civic'], 'community'],
  [['education', 'learn', 'workshop', 'class', 'seminar'], 'education'],
  [['holiday', 'seasonal', 'festive'], 'holiday'],
  [['market', 'shopping', 'craft', 'vendor'], 'market'],
  [['charity', 'fundrais', 'benefit', 'volunteer', 'nonprofit'], 'charity'],
];

/**
 * Resolve the card styling for an event category via fuzzy keyword matching.
 * Falls back to the neutral brand style for unknown/empty categories.
 */
export function getEventCategoryStyle(category?: string | null): CategoryStyle {
  if (!category) return DEFAULT_CATEGORY_STYLE;
  const c = category.toLowerCase();
  for (const [keywords, bucket] of CATEGORY_MATCHERS) {
    if (keywords.some((k) => c.includes(k))) return EVENT_CATEGORY_STYLES[bucket];
  }
  return DEFAULT_CATEGORY_STYLE;
}

/**
 * Cuisine → decorative gradient used for the RestaurantCard image fallback.
 * Gradients sit under a dark readability overlay, so they are mode-independent.
 */
export const CUISINE_GRADIENTS: Record<string, string> = {
  Italian: 'from-red-600 to-orange-500',
  Mexican: 'from-green-600 to-yellow-500',
  Chinese: 'from-red-700 to-amber-500',
  Japanese: 'from-pink-600 to-red-400',
  Thai: 'from-orange-500 to-yellow-400',
  Indian: 'from-orange-600 to-red-500',
  American: 'from-blue-600 to-red-500',
  French: 'from-blue-500 to-indigo-600',
  Mediterranean: 'from-sky-500 to-emerald-400',
  Korean: 'from-rose-500 to-orange-400',
  Vietnamese: 'from-emerald-500 to-lime-400',
  BBQ: 'from-amber-700 to-red-600',
  Seafood: 'from-cyan-500 to-blue-600',
  Pizza: 'from-red-500 to-yellow-500',
  Steakhouse: 'from-stone-700 to-red-800',
  default: BRAND_GRADIENT,
};

/** Resolve a cuisine to its decorative gradient (substring match). */
export function getCuisineGradient(cuisine?: string | null): string {
  if (!cuisine) return CUISINE_GRADIENTS.default;
  const c = cuisine.toLowerCase();
  for (const [key, value] of Object.entries(CUISINE_GRADIENTS)) {
    if (key !== 'default' && c.includes(key.toLowerCase())) return value;
  }
  return CUISINE_GRADIENTS.default;
}
