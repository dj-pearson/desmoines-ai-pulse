/**
 * Guest-usable personalization for the home For You rail (Home plan WP2 item 7).
 *
 * Web never writes `swipe_interactions`, so `useForYouRail` falls back to
 * `get_trending_events` for everyone and the rail said "Trending now" for good.
 * These chips give a guest or a member a way to steer it without a new query:
 * the picks are saved as `interests.tags` through useUserPreferences, and the
 * trending rows are re-ordered here, in the browser, with the reason shown on
 * each card that moved.
 *
 * WHAT THE MATCH CAN SEE. The RPC returns title, category and venue, and
 * nothing else a chip could key on: no price, no coordinates, no neighbourhood.
 * So a chip only claims a row when those strings say so. "Free" matches an
 * event that calls itself free; it does not guess from a missing price. A row
 * no chip matches keeps its trending position and gets no reason.
 */
import { NEIGHBORHOODS } from '@/lib/neighborhoods';

export interface RerankableRow {
  title: string | null;
  category: string | null;
  venue: string | null;
}

export interface TasteChip {
  /** Stored in `preferences.interests.tags`. Treat as a schema: never rename. */
  id: string;
  label: string;
  pattern: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EAST_VILLAGE_TERMS =
  NEIGHBORHOODS.find((n) => n.slug === 'east-village')?.matchTerms ?? ['East Village'];

export const TASTE_CHIPS: readonly TasteChip[] = [
  {
    id: 'live-music',
    label: 'Live music',
    pattern: /\b(live music|concerts?|music|band|jazz|bluegrass|symphony|open mic)\b/i,
  },
  { id: 'free', label: 'Free', pattern: /\b(free|no cover)\b/i },
  { id: 'family', label: 'Family', pattern: /\b(family|families|kids?|children|all ages)\b/i },
  { id: 'patio', label: 'Patio', pattern: /\b(patio|rooftop|beer garden)\b/i },
  {
    id: 'east-village',
    label: 'East Village',
    pattern: new RegExp(`\\b(${EAST_VILLAGE_TERMS.map(escapeRegExp).join('|')})\\b`, 'i'),
  },
  {
    id: 'downtown',
    label: 'Downtown',
    pattern:
      /\b(downtown|court ave(nue)?|civic center|wells fargo arena|iowa events center|western gateway|hoyt sherman)\b/i,
  },
];

const CHIP_BY_ID = new Map(TASTE_CHIPS.map((c) => [c.id, c]));

/** Only the ids this module knows, in chip order. Unknown stored tags are ignored. */
export function knownPicks(tags: readonly string[] | null | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const set = new Set(tags);
  return TASTE_CHIPS.filter((c) => set.has(c.id)).map((c) => c.id);
}

/** The chips of `picks` that this row's own strings support. */
export function matchingChips(row: RerankableRow, picks: readonly string[]): TasteChip[] {
  const haystack = [row.title, row.category, row.venue].filter(Boolean).join(' | ');
  if (!haystack) return [];
  const out: TasteChip[] = [];
  for (const id of picks) {
    const chip = CHIP_BY_ID.get(id);
    if (chip && chip.pattern.test(haystack)) out.push(chip);
  }
  return out;
}

export type Reranked<T> = T & { pickReason: string | null };

/**
 * Stable re-order: rows matching more picks first, ties keep the RPC's order.
 * With no picks the input order is returned unchanged and no reasons are set.
 */
export function rerankByPicks<T extends RerankableRow>(
  rows: readonly T[],
  picks: readonly string[],
): Reranked<T>[] {
  const known = knownPicks(picks);
  const scored = rows.map((row, index) => {
    const matched = known.length > 0 ? matchingChips(row, known) : [];
    return {
      row: { ...row, pickReason: matched.length > 0 ? `Because you picked ${matched[0].label}` : null },
      score: matched.length,
      index,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.row);
}

/** Toggle one chip in a tag list, preserving tags this module doesn't own. */
export function togglePick(tags: readonly string[] | null | undefined, id: string): string[] {
  const current = tags ? [...tags] : [];
  return current.includes(id) ? current.filter((t) => t !== id) : [...current, id];
}
