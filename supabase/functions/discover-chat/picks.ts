/**
 * What discover-chat lets through from the model (IOS-DD-DISCOVER-15).
 * No imports, so picks.test.ts runs offline.
 *
 * The model's return_picks input went to the client verbatim: an id it
 * invented, or one a prompt injection planted, reached the UI as a card, and
 * the reason and follow-up text could carry a phone number or a link. The
 * rows the tools had just fetched (title, image, date) were thrown away, so a
 * card could show only its type.
 *
 * Now a pick survives only if a tool returned that row in this request, and it
 * is enriched from that row. Every new field is optional on the wire, which
 * shipped iOS and Android decoders ignore.
 */

export type ItemType = 'event' | 'restaurant' | 'attraction';

export interface EnrichedPick {
  itemType: ItemType;
  itemId: string;
  reason: string;
  title?: string;
  imageUrl?: string;
  startsAt?: string;
  endDate?: string;
  venue?: string;
  cuisine?: string;
  priceRange?: string;
}

export const MAX_PICKS = 5;
export const MAX_REASON_CHARS = 160;
export const MAX_FOLLOW_UPS = 3;
export const MAX_FOLLOW_UP_CHARS = 80;

/** How long after a timed start an event with no end still counts as on. */
const STARTED_GRACE_MS = 3 * 60 * 60 * 1000;

/**
 * PostgREST or-filter for "still on": started no more than three hours ago,
 * or has an end_date still ahead. `date >= now` alone dropped a festival on
 * its second day and a show that started ten minutes ago.
 */
export function eventStillOnOrFilter(now: Date): string {
  const since = new Date(now.getTime() - STARTED_GRACE_MS).toISOString();
  return `date.gte.${since},end_date.gte.${now.toISOString()}`;
}

// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const URLS = /https?:\/\/\S+|www\.\S+/gi;
// A bare domain on a common TLD ("evil.example", "deals.com/x"). Reason text
// names places, not websites, so this costs nothing legitimate.
const BARE_DOMAINS = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|us|biz|info|app|dev|xyz|example)\b\S*/gi;
const PHONE_RUNS = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * Model text made safe to show: control and invisible characters, links and
 * phone-number runs removed, whitespace collapsed, cut to `max` characters.
 * Null when nothing is left.
 */
export function sanitizeText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const cleaned = s
    .replace(CONTROL_CHARS, ' ')
    .replace(URLS, ' ')
    .replace(BARE_DOMAINS, ' ')
    .replace(PHONE_RUNS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > max ? cleaned.slice(0, max).trimEnd() : cleaned;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function isItemType(v: unknown): v is ItemType {
  return v === 'event' || v === 'restaurant' || v === 'attraction';
}

/** The key a tool result is recorded under in `seen`. */
export function seenKey(itemType: string, itemId: string): string {
  return `${itemType}:${itemId}`;
}

/**
 * Keeps picks whose row a tool returned in this request, at most MAX_PICKS,
 * without duplicates, each with a non-empty sanitized reason, and fills
 * title, image, dates, venue, cuisine and price from that row.
 */
export function validatePicks(
  raw: unknown,
  seen: Map<string, Record<string, unknown>>,
): EnrichedPick[] {
  if (!Array.isArray(raw)) return [];
  const out: EnrichedPick[] = [];
  const used = new Set<string>();
  for (const candidate of raw) {
    if (out.length >= MAX_PICKS) break;
    if (!candidate || typeof candidate !== 'object') continue;
    const p = candidate as Record<string, unknown>;
    if (!isItemType(p.itemType) || typeof p.itemId !== 'string') continue;
    const key = seenKey(p.itemType, p.itemId);
    if (used.has(key)) continue;
    const row = seen.get(key);
    if (!row) continue;
    const reason = sanitizeText(p.reason, MAX_REASON_CHARS);
    if (!reason) continue;
    used.add(key);

    const pick: EnrichedPick = { itemType: p.itemType, itemId: p.itemId, reason };
    const title = str(row.title) ?? str(row.name);
    if (title) pick.title = title;
    const imageUrl = str(row.image_url);
    if (imageUrl) pick.imageUrl = imageUrl;
    if (p.itemType === 'event') {
      const startsAt = str(row.date);
      if (startsAt) pick.startsAt = startsAt;
      const endDate = str(row.end_date);
      if (endDate) pick.endDate = endDate;
      const venue = str(row.venue);
      if (venue) pick.venue = venue;
    } else if (p.itemType === 'restaurant') {
      const cuisine = str(row.cuisine);
      if (cuisine) pick.cuisine = cuisine;
      const priceRange = str(row.price_range);
      if (priceRange) pick.priceRange = priceRange;
    }
    out.push(pick);
  }
  return out;
}

/** At most MAX_FOLLOW_UPS suggestions, each sanitized to MAX_FOLLOW_UP_CHARS. */
export function sanitizeFollowUps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= MAX_FOLLOW_UPS) break;
    const text = sanitizeText(item, MAX_FOLLOW_UP_CHARS);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/** Records every row a tool returned, keyed by type and id. */
export function recordSeen(
  seen: Map<string, Record<string, unknown>>,
  itemType: ItemType,
  result: unknown,
): void {
  const rows = (result as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
      const r = row as Record<string, unknown>;
      seen.set(seenKey(itemType, r.id as string), r);
    }
  }
}
