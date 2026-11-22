/**
 * WEB-UX-090: which single active filter the empty state offers to remove.
 *
 * The hub has no per-filter counts, so this is an ordered guess, stated as one:
 * a diet keyword match (tag-*) and a minimum rating cut the list hardest,
 * then sponsored-only, price, cuisine, an old-link area, and the search text
 * last (removing the search usually means starting over). Ties go to the
 * filter added last.
 */
export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const ORDER: Array<(key: string) => boolean> = [
  (k) => k.startsWith("tag-"),
  (k) => k === "rating",
  (k) => k === "featured",
  (k) => k.startsWith("price-"),
  (k) => k.startsWith("cuisine-"),
  (k) => k === "location",
  (k) => k === "q",
];

export function narrowestFilterChip<T extends FilterChip>(chips: T[]): T | null {
  for (const matches of ORDER) {
    const hits = chips.filter((c) => matches(c.key));
    if (hits.length > 0) return hits[hits.length - 1];
  }
  return chips.length > 0 ? chips[chips.length - 1] : null;
}
