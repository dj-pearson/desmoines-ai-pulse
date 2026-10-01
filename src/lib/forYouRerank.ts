/**
 * Guest-usable personalization for the home For You rail (Home plan WP2 item 7,
 * pass-2 WP3 item 8).
 *
 * Web never writes `swipe_interactions`, so almost every visitor gets the
 * anonymous rail. These chips give a guest or a member a way to steer it
 * without a new query: the picks are saved as `interests.tags` through
 * useUserPreferences, and the rows are re-ordered here, in the browser, with
 * the reason shown on each card that moved.
 *
 * WHAT THE MATCH CAN SEE. Both sources carry title, category, venue, price,
 * location and city (the events read selects EVENT_LIST_COLUMNS, and both
 * RPCs return price, location and city: migration 20260822000002). So:
 *   - "Free" is `isFreePrice(price) === true`, the same test as the Free badge
 *     and /events/free. A missing price is unknown, never free, and a title
 *     that says "free" does not override a price that says "$15".
 *   - The area chips match the venue, location and city. East Village uses the
 *     NEIGHBORHOODS matchTerms, the same strings /neighborhoods/east-village
 *     filters on. Downtown has no NEIGHBORHOODS entry yet (deferred), so it
 *     keeps its own landmark list.
 *   - The rest match the title, category and venue.
 * A row no chip matches keeps its position and gets no reason.
 */
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import { isFreePrice } from '@/lib/eventPrice';

export interface RerankableRow {
  title: string | null;
  category: string | null;
  venue: string | null;
  price?: string | null;
  location?: string | null;
  city?: string | null;
}

/** Which of a row's strings a chip reads. */
type ChipField = 'text' | 'place' | 'price';

export interface TasteChip {
  /** Stored in `preferences.interests.tags`. Treat as a schema: never rename. */
  id: string;
  label: string;
  /** Tested against the strings `field` names. The price chip has none. */
  pattern?: RegExp;
  field: ChipField;
  /** Where the rail sends a visitor when nothing on it matches this chip. */
  hub: string;
  /** Link text for `hub`. */
  hubLabel: string;
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
    field: 'text',
    hub: '/music',
    hubLabel: 'See live music',
  },
  {
    id: 'free',
    label: 'Free',
    field: 'price',
    hub: '/events/free',
    hubLabel: 'See free events',
  },
  {
    id: 'family',
    label: 'Family',
    pattern: /\b(family|families|kids?|children|all ages)\b/i,
    field: 'text',
    hub: '/events/kids',
    hubLabel: 'See kids and family events',
  },
  {
    id: 'patio',
    label: 'Patio',
    pattern: /\b(patio|rooftop|beer garden)\b/i,
    field: 'text',
    hub: '/events',
    hubLabel: 'See all events',
  },
  {
    id: 'east-village',
    label: 'East Village',
    pattern: new RegExp(`\\b(${EAST_VILLAGE_TERMS.map(escapeRegExp).join('|')})\\b`, 'i'),
    field: 'place',
    hub: '/neighborhoods/east-village',
    hubLabel: 'See the East Village',
  },
  {
    id: 'downtown',
    label: 'Downtown',
    pattern:
      /\b(downtown|court ave(nue)?|civic center|wells fargo arena|iowa events center|western gateway|hoyt sherman)\b/i,
    field: 'place',
    hub: '/events',
    hubLabel: 'See all events',
  },
];

const CHIP_BY_ID = new Map(TASTE_CHIPS.map((c) => [c.id, c]));

/** Only the ids this module knows, in chip order. Unknown stored tags are ignored. */
export function knownPicks(tags: readonly string[] | null | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const set = new Set(tags);
  return TASTE_CHIPS.filter((c) => set.has(c.id)).map((c) => c.id);
}

/** The chip definitions for `ids`, in the order given; unknown ids are skipped. */
export function chipsFor(ids: readonly string[]): TasteChip[] {
  const out: TasteChip[] = [];
  for (const id of ids) {
    const chip = CHIP_BY_ID.get(id);
    if (chip) out.push(chip);
  }
  return out;
}

const join = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' | ');

function chipMatches(chip: TasteChip, row: RerankableRow): boolean {
  switch (chip.field) {
    case 'price':
      return isFreePrice(row.price) === true;
    case 'place': {
      const place = join(row.venue, row.location, row.city);
      return place !== '' && Boolean(chip.pattern?.test(place));
    }
    case 'text': {
      const text = join(row.title, row.category, row.venue);
      return text !== '' && Boolean(chip.pattern?.test(text));
    }
  }
}

/** The chips of `picks` that this row's own fields support. */
export function matchingChips(row: RerankableRow, picks: readonly string[]): TasteChip[] {
  return chipsFor(picks).filter((chip) => chipMatches(chip, row));
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

/** Rows that must carry a positive trending_score before the rail says "Trending". */
export const TRENDING_MIN_SCORED = 3;

export type ForYouHeading = 'For you' | 'Trending' | 'Coming up';

export interface HeadingInput {
  /** "for-you" when the rows came from get_personalized_recommendations. */
  source: 'for-you' | 'trending';
  picks: readonly string[];
  rows: ReadonlyArray<{ pickReason: string | null; trending_score?: number | null }>;
}

export interface HeadingResult {
  title: ForYouHeading;
  /**
   * The picked chips when the visitor picked something and no row matched
   * them. The rail says so in one line instead of claiming "For you".
   */
  unmatched: TasteChip[];
}

/**
 * The rail's heading, from what the rows can support (pass-2 WP3 items 1, 8).
 *
 * "For you" only when the rows are personal: the signed-in RPC, or at least
 * one row a pick matched. "Trending" only when enough rows carry a measured
 * trending_score (written by calculate_trending_scores); otherwise the rows
 * are simply the next events by date, and the heading says that.
 */
export function forYouHeading({ source, picks, rows }: HeadingInput): HeadingResult {
  const known = knownPicks(picks);
  const anyMatched = rows.some((r) => r.pickReason);
  const unmatched = known.length > 0 && !anyMatched && rows.length > 0 ? chipsFor(known) : [];
  if (source === 'for-you' || anyMatched) return { title: 'For you', unmatched };
  const scored = rows.filter((r) => typeof r.trending_score === 'number' && r.trending_score > 0).length;
  return { title: scored >= TRENDING_MIN_SCORED ? 'Trending' : 'Coming up', unmatched };
}

/** "Nothing coming up matches Family or Free yet" */
export function unmatchedLine(chips: readonly TasteChip[]): string {
  return `Nothing coming up matches ${chips.map((c) => c.label).join(' or ')} yet`;
}

/**
 * Reasons that restate something the card already says, or that describe a
 * paid or editorial boost as if it were a taste signal. get_personalized_recommendations
 * returns "Featured this week" for is_featured rows, and a featured row is a
 * sponsored one or an admin pick (20260902000004); the Sponsored badge says
 * the first honestly, so the reason is dropped rather than repeated.
 */
const SUPPRESSED_REASONS = new Set(['trending now', 'featured this week']);

/** The reason line for a card, or null when it would only repeat the heading. */
export function displayReason(
  row: { pickReason: string | null; recommendation_reason?: string | null },
  heading: string,
): string | null {
  if (row.pickReason) return row.pickReason;
  const reason = row.recommendation_reason?.trim();
  if (!reason) return null;
  const lower = reason.toLowerCase();
  if (lower === heading.toLowerCase() || SUPPRESSED_REASONS.has(lower)) return null;
  return reason;
}

/** Drop rows whose id another Home section already shows, keeping order. */
export function withoutIds<T extends { id: string }>(rows: readonly T[], ids: ReadonlySet<string>): T[] {
  if (ids.size === 0) return [...rows];
  return rows.filter((r) => !ids.has(r.id));
}
