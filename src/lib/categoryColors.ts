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
