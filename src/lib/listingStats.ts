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
  /** Business Pro only (20261102000006); absent for a free owner. */
  pro?: PeerProDetail;
}

/** Where the listing sits in its group, and the spread around it. Pro only. */
export interface PeerProDetail {
  /** 1 = most viewed in the group, this listing included. */
  rank: number;
  /** Group size including this listing. */
  of: number;
  p25_views: number;
  p75_views: number;
}

export type ListingStats =
  | { status: "no_data"; days: number; pro: boolean }
  | {
      status: "ok";
      days: number;
      from: string;
      to: string;
      series: StatDay[];
      totals: StatTotals;
      previous: StatTotals;
      peers: PeerComparison | null;
      /** Business Pro is live on this listing (or the caller is an admin). */
      pro: boolean;
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
  const base: PeerComparison = { group: group as PeerComparison["group"], label, size, median_views: median, percentile };
  const rank = num(o.rank);
  const of = num(o.of);
  const p25 = num(o.p25_views);
  const p75 = num(o.p75_views);
  // All four or none: a half-present Pro block is treated as absent, never shown partly.
  if (rank !== null && of !== null && p25 !== null && p75 !== null) {
    base.pro = { rank, of, p25_views: p25, p75_views: p75 };
  }
  return base;
}

export function parseListingStats(raw: unknown): ListingStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const days = num(o.days);
  if (days === null) return null;
  // `pro` arrived with 20261102000006; before it the key is absent, which is free.
  const pro = o.pro === true;
  if (o.status === "no_data") return { status: "no_data", days, pro };
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
  return { status: "ok", days, from, to, series, totals: t, previous: p, peers: peers(o.peers), pro };
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

/**
 * The Pro rank line: "#3 of 24 Mexican restaurants by page views. The middle
 * half of the group got 20 to 70." Group words come from peerGroupPhrase, so
 * the free sentence and this one name the group the same way.
 */
export function rankSentence(peers: PeerComparison, listingType: "restaurant" | "attraction"): string | null {
  if (!peers.pro) return null;
  const { rank, of, p25_views, p75_views } = peers.pro;
  return `#${rank} of ${of} ${peerGroupPhrase(peers, listingType)} by page views. The middle half of the group got ${p25_views.toLocaleString()} to ${p75_views.toLocaleString()}.`;
}

/** The daily series as CSV, for the Pro download. Plain ASCII, one row per day. */
export function statsCsv(series: readonly StatDay[]): string {
  const rows = series.map((d) => `${d.date},${d.views},${d.shares},${d.clicks}`);
  return ["date,views,shares,clicks", ...rows].join("\n") + "\n";
}

/** "$49/month" from integer cents, as business_plans stores the price. */
export function monthlyPriceLabel(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}/month`;
}
