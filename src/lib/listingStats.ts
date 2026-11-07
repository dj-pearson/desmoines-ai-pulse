/**
 * Reading and wording the owner stats from get_listing_owner_stats()
 * (migration 20261102000004, growth roadmap #3).
 *
 * Pure: no Supabase, no React, so the wording is unit-tested. The function
 * returns jsonb, and jsonb from a database we do not control at test time is
 * `unknown` until proved otherwise, so parseListingStats checks every field
 * and turns anything malformed into null instead of rendering NaN.
 */

export interface StatTotals {
  views: number;
  shares: number;
  clicks: number;
}

export interface StatDay extends StatTotals {
  /** yyyy-MM-dd, Central. */
  date: string;
}

export interface PeerComparison {
  group: "cuisine" | "neighborhood" | "type" | "all";
  /** The cuisine, neighbourhood slug or attraction type. */
  label: string;
  /** Other listings in the group. */
  size: number;
  median_views: number;
  /** Share of peers with fewer views, 0-100. */
  percentile: number;
}

export type ListingStats =
  | { status: "no_data"; days: number }
  | {
      status: "ok";
      days: number;
      from: string;
      to: string;
      series: StatDay[];
      totals: StatTotals;
      previous: StatTotals;
      peers: PeerComparison | null;
    };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function totals(v: unknown): StatTotals | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const views = num(o.views);
  const shares = num(o.shares);
  const clicks = num(o.clicks);
  return views === null || shares === null || clicks === null ? null : { views, shares, clicks };
}

const GROUPS = new Set(["cuisine", "neighborhood", "type", "all"]);

function peers(v: unknown): PeerComparison | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const group = str(o.group);
  const label = str(o.label);
  const size = num(o.size);
  const median = num(o.median_views);
  const percentile = num(o.percentile);
  if (!group || !GROUPS.has(group) || label === null || size === null || median === null || percentile === null) {
    return null;
  }
  return { group: group as PeerComparison["group"], label, size, median_views: median, percentile };
}

export function parseListingStats(raw: unknown): ListingStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const days = num(o.days);
  if (days === null) return null;
  if (o.status === "no_data") return { status: "no_data", days };
  if (o.status !== "ok") return null;

  const from = str(o.from);
  const to = str(o.to);
  const t = totals(o.totals);
  const p = totals(o.previous);
  if (!from || !to || !t || !p || !Array.isArray(o.series)) return null;

  const series: StatDay[] = [];
  for (const d of o.series) {
    const day = totals(d);
    const date = d && typeof d === "object" ? str((d as Record<string, unknown>).date) : null;
    if (!day || !date) return null;
    series.push({ date, ...day });
  }
  return { status: "ok", days, from, to, series, totals: t, previous: p, peers: peers(o.peers) };
}

/**
 * "Up 150% on the previous 30 days", "Down 20%...", "Same as...", or a plain
 * "None in the previous 30 days" when there is nothing to divide by. A
 * percentage off a base of zero is infinite, and "up from 0" says it better.
 */
export function changeLabel(current: number, previous: number, days: number): string {
  const span = `the previous ${days} days`;
  if (previous === 0) return current === 0 ? `None in ${span} either` : `None in ${span}`;
  if (current === previous) return `Same as ${span}`;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct > 0 ? `Up ${pct}% on ${span}` : `Down ${Math.abs(pct)}% on ${span}`;
}

function humanize(slug: string): string {
  const s = slug.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What the peer group is, as a noun phrase: "Mexican restaurants". */
export function peerGroupPhrase(peers: PeerComparison, listingType: "restaurant" | "attraction"): string {
  const noun = listingType === "restaurant" ? "restaurants" : "attractions";
  if (peers.group === "cuisine") return `${humanize(peers.label)} ${noun}`;
  if (peers.group === "neighborhood") return `${noun} in ${humanize(peers.label)}`;
  if (peers.group === "type") return `${humanize(peers.label).toLowerCase()} listings`;
  return `${noun} on Des Moines Insider`;
}

/**
 * The comparison sentence. It never names another business and never shows
 * one's number: the median is the only figure about anyone else, and the
 * function only returns it for groups of five or more.
 */
export function peerSentence(peers: PeerComparison, listingType: "restaurant" | "attraction"): string {
  const group = peerGroupPhrase(peers, listingType);
  const count = `${peers.size} other ${group}`;
  if (peers.percentile >= 50) {
    return `More page views than ${peers.percentile}% of the ${count} we list. The typical one got ${peers.median_views.toLocaleString()}.`;
  }
  return `Fewer page views than ${100 - peers.percentile}% of the ${count} we list. The typical one got ${peers.median_views.toLocaleString()}.`;
}
