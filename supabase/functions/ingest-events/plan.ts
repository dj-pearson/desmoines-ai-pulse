/**
 * DMI-011 — what the ingest endpoint DECIDES, with no transport attached.
 *
 * Split out of index.ts because that file calls Deno.serve() at module scope:
 * importing it to test the decision would bind a port, which is why the first
 * version of the test suite failed with "Requires net access to 0.0.0.0:8000".
 * The endpoint is then a thin shell over this — auth, parse, read the existing
 * rows, call planIngest, write, report.
 */
import {
  generateEventFingerprint,
  isDuplicateEvent,
  type ExistingEvent,
} from '../_shared/eventDedup.ts';
import { parseEventDateTime } from '../_shared/eventDateTime.ts';
export interface IncomingItem {
  title?: string;
  date?: string;
  venue?: string;
  location?: string;
  description?: string;
  category?: string;
  price?: string;
  source_url?: string;
}

export interface Provenance {
  producedBy?: string;
  renderProvider?: string;
  renderMode?: string;
}

interface Rejection {
  item: unknown;
  reason: string;
}

/**
 * Validate one incoming item into a row, or say why not.
 *
 * A MALFORMED ITEM IS REJECTED, NOT REPAIRED. The cloud path defaults a missing
 * title to "Untitled Event" and a missing price to "See website", which is
 * reasonable for fields nobody searches on. It is NOT reasonable for the three
 * that decide whether a row is a real event: a title, a date that parses, and a
 * source url. Coercing those produces a row that looks fine on a public
 * calendar and is fiction.
 */
export function validateItem(item: IncomingItem, fallbackUrl: string): { ok: true; row: Record<string, unknown> } | { ok: false; reason: string } {
  if (!item || typeof item !== "object") {
    return { ok: false, reason: "item is not an object" };
  }
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!title) {
    return { ok: false, reason: "missing title — not defaulted, because an untitled row on a public calendar is not an event" };
  }
  if (typeof item.date !== "string" || !item.date.trim()) {
    return { ok: false, reason: "missing date" };
  }
  const parsed = parseEventDateTime(item.date);
  if (!parsed) {
    return { ok: false, reason: `unparseable date "${String(item.date).slice(0, 40)}" — refused rather than coerced, because an invented date is a wrong row nobody can spot` };
  }

  const sourceUrl = (typeof item.source_url === "string" && item.source_url.trim())
    ? item.source_url.trim()
    : fallbackUrl;
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { ok: false, reason: "no usable source_url on the item and no valid listing url to fall back to" };
  }

  return {
    ok: true,
    row: {
      title: title.substring(0, 200),
      original_description: (item.description || "").substring(0, 500),
      enhanced_description: (item.description || "").substring(0, 500),
      date: parsed.event_start_utc.toISOString(),
      event_start_local: parsed.event_start_local,
      event_timezone: parsed.event_timezone,
      event_start_utc: parsed.event_start_utc,
      location: (item.location || "Des Moines, IA").substring(0, 200),
      venue: (item.venue || "").substring(0, 200),
      category: (item.category || "General").substring(0, 50),
      price: (item.price || "See website").substring(0, 50),
      source_url: sourceUrl.substring(0, 500),
      is_enhanced: false,
    },
  };
}

/** PURE: split a payload into rows to write and rejections to report. Exported
 *  so the decision can be tested without a database. */
export function planIngest(
  items: IncomingItem[],
  existing: ExistingEvent[],
  fallbackUrl: string,
): { rows: Record<string, unknown>[]; duplicates: number; rejected: Rejection[] } {
  const rows: Record<string, unknown>[] = [];
  const rejected: Rejection[] = [];
  let duplicates = 0;

  // Rows accepted DURING this request count as existing for the rest of it, or
  // a payload containing the same event twice writes it twice — the dedup would
  // be checking against the database and not against its own batch.
  const seen: ExistingEvent[] = [...existing];

  for (const item of items) {
    const v = validateItem(item, fallbackUrl);
    if (!v.ok) { rejected.push({ item, reason: v.reason }); continue; }

    const candidate = {
      title: String(v.row.title),
      date: v.row.event_start_utc as Date,
      venue: String(v.row.venue ?? ""),
      source_url: String(v.row.source_url),
    };
    const fingerprint = generateEventFingerprint(candidate);
    const verdict = isDuplicateEvent({ ...candidate, fingerprint }, seen);
    if (verdict.isDuplicate) { duplicates++; continue; }

    rows.push(v.row);
    seen.push({
      id: `pending-${rows.length}`,
      title: candidate.title,
      date: candidate.date.toISOString(),
      venue: candidate.venue,
      source_url: candidate.source_url,
      fingerprint,
    });
  }

  return { rows, duplicates, rejected };
}
