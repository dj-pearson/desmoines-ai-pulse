/**
 * Change detection for scraped pages: skip the model when the page has not
 * changed since the last run that wrote cleanly.
 *
 * The hash is of the EXTRACTION WINDOW (what the prompt would carry), not the
 * raw page. The raw page carries nonces, cache-busters and rotating ad markup
 * that change on every fetch; the window has already had head, nav, footer,
 * forms and scripts stripped, so what is left is close to the listing itself.
 * Whitespace is collapsed before hashing for the same reason.
 *
 * The table is scrape_page_fingerprints (migration 20260922000001).
 */

/** Re-run the model at least this often even on an unchanged page, so a heal
 *  (image, source_url) or a prompt improvement reaches every source daily. */
export const REEXTRACT_AFTER_HOURS = 24;

/**
 * A page whose schema.org/Event JSON-LD yields at least this many events is
 * taken at its word and not sent to the model. Below it, the JSON-LD may be a
 * single featured event on a listing of twenty, so the model still reads the
 * page and both result sets go through dedup as before.
 */
export const JSONLD_SUFFICIENT = 3;

export interface PageFingerprint {
  url: string;
  content_hash: string;
  items_found: number;
  content_changed_at: string;
  last_extracted_at: string;
  consecutive_skips: number;
}

export async function hashExtractionWindow(content: string): Promise<string> {
  const normalized = content.replace(/\s+/g, " ").trim();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ExtractionDecision =
  | { extract: true; reason: "force" | "first_seen" | "changed" | "stale" | "previous_run_found_nothing" }
  | { extract: false; reason: "unchanged" };

/**
 * PURE. Whether this page needs the model this run.
 *
 * A previous clean run that found NOTHING never earns a skip: "the page is
 * unchanged and has no events" and "the extraction is broken on this page"
 * hash identically, and only the second one is worth paying to find out.
 */
export function decideExtraction(
  previous: PageFingerprint | null,
  hash: string,
  now: Date,
  opts: { force?: boolean; reextractAfterHours?: number } = {},
): ExtractionDecision {
  if (opts.force) return { extract: true, reason: "force" };
  if (!previous) return { extract: true, reason: "first_seen" };
  if (previous.content_hash !== hash) return { extract: true, reason: "changed" };
  if (previous.items_found <= 0) return { extract: true, reason: "previous_run_found_nothing" };
  const hours = (now.getTime() - new Date(previous.last_extracted_at).getTime()) / 3_600_000;
  if (!(hours < (opts.reextractAfterHours ?? REEXTRACT_AFTER_HOURS))) {
    return { extract: true, reason: "stale" };
  }
  return { extract: false, reason: "unchanged" };
}

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any };

/** Best-effort: a failed read means "extract", never "skip". */
export async function readPageFingerprint(supabase: Client, url: string): Promise<PageFingerprint | null> {
  try {
    const { data, error } = await supabase
      .from("scrape_page_fingerprints")
      .select("url, content_hash, items_found, content_changed_at, last_extracted_at, consecutive_skips")
      .eq("url", url)
      .maybeSingle();
    if (error) {
      console.warn(`[pageFingerprint] read failed for ${url}; extracting: ${error.message}`);
      return null;
    }
    return (data as PageFingerprint) ?? null;
  } catch (err) {
    console.warn(`[pageFingerprint] read threw for ${url}; extracting:`, err);
    return null;
  }
}

/** Record a run that EXTRACTED and wrote cleanly. Best-effort. */
export async function recordExtraction(
  supabase: Client,
  previous: PageFingerprint | null,
  url: string,
  hash: string,
  itemsFound: number,
  now: Date,
): Promise<void> {
  const nowIso = now.toISOString();
  const { error } = await supabase.from("scrape_page_fingerprints").upsert({
    url,
    content_hash: hash,
    items_found: itemsFound,
    content_changed_at: previous && previous.content_hash === hash ? previous.content_changed_at : nowIso,
    last_extracted_at: nowIso,
    consecutive_skips: 0,
    updated_at: nowIso,
  }, { onConflict: "url" });
  if (error) console.warn(`[pageFingerprint] could not record ${url}: ${error.message}`);
}

/** Record a run answered from the fingerprint. Best-effort. */
export async function recordSkip(supabase: Client, previous: PageFingerprint, now: Date): Promise<void> {
  const { error } = await supabase
    .from("scrape_page_fingerprints")
    .update({ consecutive_skips: previous.consecutive_skips + 1, updated_at: now.toISOString() })
    .eq("url", previous.url);
  if (error) console.warn(`[pageFingerprint] could not record skip for ${previous.url}: ${error.message}`);
}
