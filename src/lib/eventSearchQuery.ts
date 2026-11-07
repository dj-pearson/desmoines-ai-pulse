/**
 * The /events search box as a Postgres tsquery (events.md WP1 item 12).
 *
 * Moved out of src/components/events/eventsHubQuery.ts, which re-exports it,
 * so the personal calendar feed (functions/calendar/[[path]].ts) searches
 * exactly the way the hub does. No imports: the Pages Functions bundle cannot
 * resolve the app's "@/" alias or carry the Supabase client.
 */

/** tsquery operators and quoting; stripped from typed input before it is sent. */
const TSQUERY_META = /[&|!():*<>'"\\]/g;

export interface HubSearchQuery {
  query: string;
  /** undefined means to_tsquery (PostgREST `fts`). */
  type?: "websearch";
}

/**
 * The search box as a tsquery that matches while you type (item 12): every
 * word must match, and the last one is a prefix, so "jaz" finds jazz. Input
 * with quotes or an OR goes to websearch_to_tsquery, which understands them.
 */
export function hubSearchQuery(input: string): HubSearchQuery | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.includes('"') || /(^|\s)OR(\s|$)/.test(raw)) return { query: raw, type: "websearch" };
  const tokens = raw.replace(TSQUERY_META, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { query: raw, type: "websearch" };
  const last = tokens.length - 1;
  return { query: tokens.map((t, i) => (i === last ? `${t}:*` : t)).join(" & ") };
}
